import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Bell, BellRing, CalendarDays, CheckCircle2, ChevronDown, ChevronLeft, ChevronUp, CircleDot, ExternalLink, Filter, History, MessageSquareShare, RefreshCw, Search, SendHorizontal, UserCircle2, X } from 'lucide-react';
import { useLocation } from 'react-router';
import { useRef } from 'react';
import { toast } from 'sonner';
import AvailabilityCalendar from '../../components/AvailabilityCalendar';
import { useProperties } from '../../context/PropertiesContext';
import type { Bien, DateStatus, Notification, Proprietaire, ReservationDemand, ReservationDemandHistory, ReservationDemandStatus } from '../types';
import { getServiceDisplayPrice } from '../../utils/servicePayants';
import { resolveMediaUrl } from '../../utils/media';

const API_URL = import.meta.env.VITE_API_URL || '/api';
const NOTIFICATIONS_CACHE_KEY = 'dwira_admin_notifications_cache_v1';
const AGENCY_TIME_ZONE = 'Africa/Tunis';
const AGENCY_UTC_OFFSET = '+01:00';

type NotificationsCachePayload = {
  notifications: Notification[];
  demands: ReservationDemand[];
  owners: Proprietaire[];
  calendarPromptSchedule: CalendarPromptSchedule | null;
  ownerCalendarStatuses: Record<string, OwnerCalendarPromptStatus>;
  pendingCalendarRequests: AdminCalendarRequest[];
  calendarRequestHistory: AdminCalendarRequest[];
};

function readNotificationsCache(): NotificationsCachePayload | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(NOTIFICATIONS_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed as NotificationsCachePayload : null;
  } catch {
    return null;
  }
}

function writeNotificationsCache(payload: NotificationsCachePayload) {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(NOTIFICATIONS_CACHE_KEY, JSON.stringify(payload));
  } catch {
    // ignore cache errors
  }
}

type CalendarPromptSchedule = {
  enabled: boolean;
  startDate: string | null;
  dailyTime: string;
  dispatchHour: number;
  dispatchMinute: number;
  timezoneOffsetLabel: string;
  lastDispatchedLocalDate?: string | null;
  lastDispatchedAt?: string | null;
};

type OwnerCalendarPromptStatus = {
  promptId: string;
  ownerId: string;
  ownerName: string;
  promptDate?: string | null;
  status: string;
  notificationId?: string | null;
  overdueNotificationId?: string | null;
  overdueNotifiedAt?: string | null;
  respondedAt?: string | null;
  responseMetadata?: {
    response?: string | null;
    bienId?: string | null;
    propertyTitle?: string | null;
    respondedAt?: string | null;
  } | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

type AdminCalendarRequest = {
  id: string;
  ownerId: string;
  ownerName: string;
  bienId: string;
  propertyTitle: string;
  startDate: string;
  endDate: string;
  note?: string | null;
  status: string;
  requestType: 'open' | 'close';
  submittedAt?: string | null;
  reviewedAt?: string | null;
  reviewedBy?: string | null;
  decision?: string | null;
  reason?: string | null;
};

type CalendarDiffPayload = {
  interactionId: string;
  ownerId: string;
  ownerName: string;
  bienId: string;
  propertyTitle: string;
  startDate: string;
  endDate: string;
  requestType: 'open' | 'close';
  status: string;
  note?: string | null;
  submittedAt?: string | null;
  reviewedAt?: string | null;
  currentCalendar: DateStatus[];
  projectedCalendar: DateStatus[];
};

const openStatuses = new Set<ReservationDemandStatus>([
  'en_attente_reponse_proprietaire',
  'pas_de_reponse_proprietaire',
  'reponse_positive_attente_confirmation_client',
  'client_procede_vers_paiement_en_cours',
  'contrat_realise',
  'reponse_negative_autre_proposition_meme_bien',
  'reponse_negative_autre_proposition_bien_similaire',
  'attente_validation_amicale',
  'attente_validation_par_agence',
  'voucher_en_cours',
  'rejete_par_amicale',
  'rejete_par_agence',
  'demande_recu_paiement',
  'recu_paiement_envoye',
]);

const demandPriority: Record<ReservationDemandStatus, number> = {
  demande_annulee_client: 0,
  demande_annulee_echeance_contrat: 0,
  reponse_positive_attente_confirmation_client: 1,
  client_procede_vers_paiement_en_cours: 2,
  en_attente_reponse_proprietaire: 3,
  pas_de_reponse_proprietaire: 4,
  reponse_negative_autre_proposition_meme_bien: 5,
  reponse_negative_autre_proposition_bien_similaire: 6,
  attente_validation_amicale: 7,
  attente_validation_par_agence: 8,
  voucher_en_cours: 9,
  rejete_par_amicale: 10,
  rejete_par_agence: 11,
  demande_recu_paiement: 12,
  recu_paiement_envoye: 13,
  demande_rejetee_admin: 14,
  attente_envoi_coordonnees_contrat: 15,
  contrat_realise: 16,
  succes_paiement: 17,
};

function resolveDisplayStatus(demand: ReservationDemand): ReservationDemandStatus {
  const adminNote = String(demand.admin_note || '').toLowerCase();
  const clientNote = String(demand.client_note || '').toLowerCase();
  const mergedNote = `${adminNote} ${clientNote}`;
  if (
    mergedNote.includes('echeance') ||
    mergedNote.includes('échéance') ||
    mergedNote.includes('deadline') ||
    mergedNote.includes('expire') ||
    mergedNote.includes('expir')
  ) {
    return 'demande_annulee_echeance_contrat';
  }
  const note = String(demand.client_note || '').toLowerCase();
  if (note.includes('annulee par le client') || note.includes('annulée par le client')) {
    return 'demande_annulee_client';
  }
  return demand.status;
}

function isAmicaleDemand(demand: ReservationDemand) {
  return String(demand.payment_mode || '').trim() === 'amicale' || Boolean(String(demand.pricing_amicale_id || '').trim());
}

const statusLabels: Record<ReservationDemandStatus, string> = {
  en_attente_reponse_proprietaire: 'En attente de reponse proprietaire',
  pas_de_reponse_proprietaire: 'Pas de reponse proprietaire',
  reponse_positive_attente_confirmation_client: 'Reponse positive, attente confirmation client',
  client_procede_vers_paiement_en_cours: 'Confirme, attente de paiement',
  reponse_negative_autre_proposition_meme_bien: 'Reponse negative, autre proposition pour ce bien',
  reponse_negative_autre_proposition_bien_similaire: 'Reponse negative, autre proposition pour un bien similaire',
  attente_validation_amicale: 'Attente validation amicale',
  attente_validation_par_agence: 'Attente validation par l agence',
  voucher_en_cours: 'Voucher en cours',
  rejete_par_amicale: 'Rejete par l amicale',
  rejete_par_agence: 'Rejete par l agence',
  demande_rejetee_admin: 'Demande rejetee par admin',
  demande_annulee_client: 'Demande annulee par client',
  demande_annulee_echeance_contrat: 'Demande annulee par echeance contrat',
  attente_envoi_coordonnees_contrat: 'Attente d envoi de coordonnees pour contrat',
  demande_recu_paiement: 'Demande de recu de paiement',
  recu_paiement_envoye: 'Recu de paiement envoye',
  contrat_realise: 'Contrat realise',
  succes_paiement: 'Succes paiement',
};
const statusToneClasses: Record<ReservationDemandStatus, string> = {
  en_attente_reponse_proprietaire: 'bg-sky-100 text-sky-800 border-sky-200',
  pas_de_reponse_proprietaire: 'bg-orange-100 text-orange-800 border-orange-200',
  reponse_positive_attente_confirmation_client: 'bg-amber-100 text-amber-800 border-amber-200',
  client_procede_vers_paiement_en_cours: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  reponse_negative_autre_proposition_meme_bien: 'bg-violet-100 text-violet-800 border-violet-200',
  reponse_negative_autre_proposition_bien_similaire: 'bg-violet-100 text-violet-800 border-violet-200',
  attente_validation_amicale: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  attente_validation_par_agence: 'bg-cyan-100 text-cyan-800 border-cyan-200',
  voucher_en_cours: 'bg-indigo-100 text-indigo-800 border-indigo-200',
  rejete_par_amicale: 'bg-slate-100 text-slate-700 border-slate-200',
  rejete_par_agence: 'bg-rose-100 text-rose-800 border-rose-200',
  demande_rejetee_admin: 'bg-rose-100 text-rose-800 border-rose-200',
  demande_annulee_client: 'bg-slate-100 text-slate-800 border-slate-200',
  demande_annulee_echeance_contrat: 'bg-slate-100 text-slate-800 border-slate-200',
  attente_envoi_coordonnees_contrat: 'bg-cyan-100 text-cyan-800 border-cyan-200',
  demande_recu_paiement: 'bg-indigo-100 text-indigo-800 border-indigo-200',
  recu_paiement_envoye: 'bg-indigo-100 text-indigo-800 border-indigo-200',
  contrat_realise: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  succes_paiement: 'bg-emerald-100 text-emerald-800 border-emerald-200',
};
const editableStatusOptions: ReservationDemandStatus[] = [
  'en_attente_reponse_proprietaire',
  'pas_de_reponse_proprietaire',
  'reponse_positive_attente_confirmation_client',
  'reponse_negative_autre_proposition_meme_bien',
  'reponse_negative_autre_proposition_bien_similaire',
  'recu_paiement_envoye',
  'succes_paiement',
];

async function getApiErrorMessage(response: Response, fallback: string) {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const data = await response.json().catch(() => null);
    const message = String(data?.error || data?.message || '').trim();
    if (message) return message;
  } else {
    const text = await response.text().catch(() => '');
    if (text && !text.startsWith('<!DOCTYPE')) return text;
  }
  return fallback;
}

function parseAgencyDateString(value: string) {
  const regexMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (!regexMatch) return null;
  const [, year, month, day, hour = '00', minute = '00', second = '00'] = regexMatch;
  const isoValue = `${year}-${month}-${day}T${hour}:${minute}:${second}${AGENCY_UTC_OFFSET}`;
  const parsed = new Date(isoValue);
  if (Number.isNaN(parsed.getTime())) return null;
  return {
    parsed,
    year: Number(year),
    month: Number(month),
    day: Number(day),
    hour: Number(hour),
    minute: Number(minute),
    second: Number(second),
  };
}

function parseDisplayDate(value?: unknown) {
  if (value == null) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  const raw = String(value).trim();
  if (!raw) return null;
  const agencyParsed = parseAgencyDateString(raw);
  if (agencyParsed) return agencyParsed.parsed;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function padDateUnit(value: number) {
  return String(value).padStart(2, '0');
}

function formatDateTime(value?: unknown) {
  const raw = value == null ? '' : String(value).trim();
  const agencyParsed = raw ? parseAgencyDateString(raw) : null;
  if (agencyParsed) {
    return `${padDateUnit(agencyParsed.day)}/${padDateUnit(agencyParsed.month)}/${agencyParsed.year} ${padDateUnit(agencyParsed.hour)}:${padDateUnit(agencyParsed.minute)}:${padDateUnit(agencyParsed.second)}`;
  }
  const parsed = parseDisplayDate(value);
  if (!parsed) return '-';
  return new Intl.DateTimeFormat('fr-FR', {
    timeZone: AGENCY_TIME_ZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(parsed).replace(',', '');
}

function formatStayDate(value?: unknown) {
  const raw = value == null ? '' : String(value).trim();
  const agencyParsed = raw ? parseAgencyDateString(raw) : null;
  if (agencyParsed) {
    return `${padDateUnit(agencyParsed.day)}/${padDateUnit(agencyParsed.month)}/${agencyParsed.year}`;
  }
  const parsed = parseDisplayDate(value);
  if (!parsed) return '-';
  return new Intl.DateTimeFormat('fr-FR', {
    timeZone: AGENCY_TIME_ZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(parsed);
}

function formatTimeOnly(value?: unknown) {
  const raw = value == null ? '' : String(value).trim();
  const agencyParsed = raw ? parseAgencyDateString(raw) : null;
  if (agencyParsed) {
    return `${padDateUnit(agencyParsed.hour)}:${padDateUnit(agencyParsed.minute)}:${padDateUnit(agencyParsed.second)}`;
  }
  const parsed = parseDisplayDate(value);
  if (!parsed) return '--:--';
  return new Intl.DateTimeFormat('fr-FR', {
    timeZone: AGENCY_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(parsed);
}

function parseDateForRelative(value?: string | null) {
  if (!value) return null;
  const raw = String(value).trim();
  const agencyParsed = parseAgencyDateString(raw);
  if (agencyParsed) return agencyParsed.parsed;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatRelativeDelay(value?: string | null, suffix = '') {
  const parsed = parseDateForRelative(value);
  if (!parsed) return '';
  const diffMs = Date.now() - parsed.getTime();
  if (diffMs < 0) return '';
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return `il y a quelques secondes${suffix}`;
  if (minutes < 60) return `il y a ${minutes} minute${minutes > 1 ? 's' : ''}${suffix}`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `il y a ${hours} heure${hours > 1 ? 's' : ''}${suffix}`;
  const days = Math.floor(hours / 24);
  return `il y a ${days} jour${days > 1 ? 's' : ''}${suffix}`;
}

function resolveAssetUrl(url?: string | null) {
  const value = String(url || '').trim();
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value;
  return `${window.location.origin}${value.startsWith('/') ? value : `/${value}`}`;
}

function appendCacheBuster(url: string, version?: string | null) {
  const value = String(url || '').trim();
  if (!value) return '';
  const token = String(version || '').trim();
  if (!token) return value;
  try {
    const parsed = new URL(value, window.location.origin);
    parsed.searchParams.set('v', token);
    return parsed.toString();
  } catch {
    const separator = value.includes('?') ? '&' : '?';
    return `${value}${separator}v=${encodeURIComponent(token)}`;
  }
}

type NotificationCategory =
  | 'dossier'
  | 'proprietaire'
  | 'calendrier'
  | 'systeme';

type NotificationImportance = 'urgent' | 'modere' | 'normal';

type NotificationInsight = {
  notification: Notification;
  category: NotificationCategory;
  importance: NotificationImportance;
  title: string;
};

type EnrichedNotificationInsight = NotificationInsight & {
  demand: ReservationDemand | null;
  bien: Bien | null;
  clientName: string;
  sourceLabel: string;
  paymentMethodLabel: string;
  modeLabel: string;
  primaryLabel: string;
  secondaryLabel: string;
  detailLabel: string;
};

function isOwnerConversationNotification(message?: string | null) {
  const normalized = String(message || '').trim().toLowerCase();
  if (!normalized) return false;
  return (
    normalized.includes('nouveau message recu du proprietaire')
    || normalized.includes('nouveau message proprietaire')
    || normalized.includes('[owner:')
    || normalized.includes('reponse proprietaire')
  );
}

function classifyNotification(notification: Notification): {
  category: NotificationCategory;
  importance: NotificationImportance;
  title: string;
} {
  const message = String(notification.message || '').trim();
  const normalized = message.toLowerCase();

  let category: NotificationCategory = 'systeme';
  if (isOwnerConversationNotification(message) || normalized.includes('proprietaire')) category = 'proprietaire';
  else if (
    normalized.includes('contrat')
    || normalized.includes('paiement')
    || normalized.includes('clicktopay')
    || normalized.includes('flouci')
    || normalized.includes('recu')
    || normalized.includes('demande')
    || normalized.includes('reservation')
    || normalized.includes('rd_chatbot')
  ) category = 'dossier';
  else if (normalized.includes('calendrier') || normalized.includes('mise a jour calendrier') || normalized.includes('relance calendrier')) category = 'calendrier';

  let importance: NotificationImportance = 'normal';
  if (
    notification.type === 'error'
    || normalized.includes('urgent')
    || normalized.includes('echec')
    || normalized.includes('échec')
    || normalized.includes('expire')
    || normalized.includes('expir')
    || normalized.includes('annule')
    || normalized.includes('annulé')
    || normalized.includes('rejet')
    || normalized.includes('impossible')
  ) {
    importance = 'urgent';
  } else if (
    notification.type === 'warning'
    || normalized.includes('attente')
    || normalized.includes('en attente')
    || normalized.includes('a traiter')
    || normalized.includes('à traiter')
    || normalized.includes('confirmation')
    || normalized.includes('validation')
  ) {
    importance = 'modere';
  }

  const titleByCategory: Record<NotificationCategory, string> = {
    dossier: 'Dossier client',
    proprietaire: 'Proprietaire',
    calendrier: 'Calendrier',
    systeme: 'Systeme',
  };

  return {
    category,
    importance,
    title: titleByCategory[category],
  };
}

function extractOwnerIdFromNotificationMessage(message: string): string {
  const normalized = String(message || '').trim();
  if (!normalized) return '';
  const taggedMatch = normalized.match(/\[owner:([^\]]+)\]/i);
  if (taggedMatch?.[1]) return String(taggedMatch[1]).trim();
  const legacyMatch = normalized.match(/nouveau message proprietaire\s*\(([^)]+)\)/i);
  if (legacyMatch?.[1]) return String(legacyMatch[1]).trim();
  return '';
}

function formatMoney(value?: number | null) {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount) || amount <= 0) return '-';
  return `${amount.toLocaleString('fr-FR')} DT`;
}

function formatModeLabel(mode?: string | null) {
  const normalized = String(mode || '').trim().toLowerCase();
  if (normalized === 'hotellerie' || normalized.includes('hotel')) return 'Hotellerie';
  if (normalized === 'location_saisonniere') return 'Location saisonniere';
  if (normalized === 'location_annuelle') return 'Location annuelle';
  if (normalized === 'vente') return 'Vente';
  return 'Demande client';
}

function formatPaymentMethodLabel(demand?: ReservationDemand | null, message?: string | null) {
  const normalizedMessage = String(message || '').toLowerCase();
  if (String(demand?.clicktopay_payment_id || '').trim() || normalizedMessage.includes('clicktopay')) return 'ClicToPay';
  if (String(demand?.flouci_checkout_id || '').trim() || normalizedMessage.includes('flouci')) return 'Flouci';
  if (String(demand?.payment_receipt_image_url || '').trim() || normalizedMessage.includes('recu')) return 'Recu manuel';
  const paymentMode = String(demand?.payment_mode || '').trim();
  if (paymentMode === 'avance') return 'Acompte';
  if (paymentMode === 'totalite') return 'Paiement total';
  if (paymentMode === 'amicale') return 'Amicale';
  return 'Paiement a verifier';
}

function getDemandClientName(demand?: ReservationDemand | null) {
  const identityName = [demand?.identity_first_name, demand?.identity_last_name]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .join(' ');
  if (identityName) return identityName;
  const clientName = String(demand?.client_name || '').trim();
  if (clientName) return clientName;
  const email = String(demand?.client_email || '').trim();
  if (email) return email;
  return 'Client web non identifie';
}

function getDemandSourceLabel(demand?: ReservationDemand | null, message?: string | null) {
  const demandId = String(demand?.id || '').toLowerCase();
  const normalizedMessage = String(message || '').toLowerCase();
  if (demandId.includes('chatbot') || normalizedMessage.includes('chatbot')) return 'Chatbot';
  if (normalizedMessage.includes('facebook')) return 'Facebook';
  if (normalizedMessage.includes('whatsapp')) return 'WhatsApp';
  return 'Site web';
}

function getDemandActionTitle(category: NotificationCategory, message?: string | null) {
  const normalizedMessage = String(message || '').toLowerCase();
  if (category === 'dossier') {
    if (normalizedMessage.includes('contrat')) return 'Contrat genere';
    if (normalizedMessage.includes('recu')) return 'Paiement recu';
    if (normalizedMessage.includes('clicktopay')) return 'Paiement ClicToPay';
    if (normalizedMessage.includes('paiement') || normalizedMessage.includes('flouci')) return 'Paiement client';
    return 'Suivi dossier client';
  }
  if (category === 'proprietaire') return normalizedMessage.includes('reponse') ? 'Reponse proprietaire' : 'Message proprietaire';
  if (category === 'calendrier') {
    if (normalizedMessage.includes('est a jour')) return 'Calendrier confirme';
    if (normalizedMessage.includes('ne sont pas a jour')) return 'Mise a jour demandee';
    if (normalizedMessage.includes('quotidienne envoyee')) return 'Relance quotidienne';
    if (normalizedMessage.includes('individuellement')) return 'Relance individuelle';
    return 'Alerte calendrier';
  }
  return 'Demande de reservation';
}

function summarizeNotificationDetail(message?: string | null) {
  const normalized = String(message || '')
    .replace(/rd_chatbot_[^ )]+/gi, '')
    .replace(/c\d+/gi, '')
    .replace(/p\d+/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return normalized || 'Action en attente de verification.';
}

function extractOwnerNameFromNotificationMessage(message?: string | null) {
  const value = String(message || '').trim();
  if (!value) return '';
  const patterns = [
    /Calendrier du proprietaire\s+(.+?)\s+est a jour/i,
    /Le proprietaire\s+(.+?)\s+a indique/i,
    /Relance calendrier envoyee individuellement a\s+(.+?)\s+pour/i,
    /nouveau message proprietaire\s*\(([^)]+)\)/i,
  ];
  for (const pattern of patterns) {
    const match = value.match(pattern);
    if (match?.[1]) return String(match[1]).trim();
  }
  return '';
}

function extractPropertyTitleFromNotificationMessage(message?: string | null) {
  const value = String(message || '').trim();
  if (!value) return '';
  const patterns = [
    /Mise a jour envoyee le .*?\(([^)]+)\)/i,
    /pour\s+([^.,]+?)\.\s*Date de reponse/i,
    /pour\s+([^.,]+?)\s*$/i,
  ];
  for (const pattern of patterns) {
    const match = value.match(pattern);
    if (match?.[1]) return String(match[1]).trim();
  }
  return '';
}

function getNotificationDisplayTitle(args: {
  category: NotificationCategory;
  message: string;
  demand: ReservationDemand | null;
  bien: Bien | null;
  ownerName: string;
}) {
  const { category, message, demand, bien, ownerName } = args;
  const normalized = String(message || '').toLowerCase();
  if (demand) return getDemandClientName(demand);
  if (category === 'calendrier') {
    if (normalized.includes('quotidienne envoyee')) return 'Relance calendrier quotidienne';
    if (normalized.includes('individuellement')) return ownerName ? `Relance a ${ownerName}` : 'Relance calendrier individuelle';
    if (ownerName) return ownerName;
    return 'Suivi calendrier proprietaire';
  }
  if (category === 'proprietaire') {
    if (ownerName) return ownerName;
    return 'Message proprietaire';
  }
  if (category === 'dossier') return bien?.titre || bien?.reference || 'Dossier client';
  return bien?.titre || bien?.reference || 'Notification systeme';
}

function getNotificationSecondaryLabel(args: {
  category: NotificationCategory;
  demand: ReservationDemand | null;
  ownerName: string;
  modeLabel: string;
  propertyTitle: string;
}) {
  const { category, demand, ownerName, modeLabel, propertyTitle } = args;
  if (demand) return `${getDemandClientName(demand)} • ${modeLabel}`;
  if (category === 'calendrier') {
    if (propertyTitle) return `${modeLabel} • Calendrier • ${propertyTitle}`;
    if (ownerName) return `${modeLabel} • Calendrier • ${ownerName}`;
    return `${modeLabel} • Calendrier`;
  }
  if (category === 'proprietaire') {
    if (propertyTitle) return `${modeLabel} • Proprietaire • ${propertyTitle}`;
    if (ownerName) return `${modeLabel} • Proprietaire`;
  }
  if (category === 'dossier') return `${modeLabel} • Dossier client`;
  return `${modeLabel} • ${category === 'systeme' ? 'Systeme' : 'Notification'}`;
}

function getNotificationDetailLabel(args: {
  category: NotificationCategory;
  message: string;
  ownerName: string;
  propertyTitle: string;
}) {
  const { category, message, ownerName, propertyTitle } = args;
  const normalized = String(message || '').toLowerCase();
  if (category === 'calendrier') {
    if (normalized.includes('est a jour')) {
      return ownerName
        ? `${ownerName} a confirme que ses calendriers sont a jour.`
        : 'Le proprietaire a confirme que ses calendriers sont a jour.';
    }
    if (normalized.includes('ne sont pas a jour')) {
      return propertyTitle
        ? `Le proprietaire demande une mise a jour du calendrier pour ${propertyTitle}.`
        : 'Le proprietaire a signale que ses calendriers doivent etre mis a jour.';
    }
    if (normalized.includes('quotidienne envoyee')) {
      const match = message.match(/\((\d+)\/(\d+)\)\s+pour\s+(\d{4}-\d{2}-\d{2})/i);
      if (match) return `Relance quotidienne envoyee a ${match[1]} proprietaires sur ${match[2]} pour le ${match[3]}.`;
      return 'Relance quotidienne envoyee aux proprietaires concernes.';
    }
    if (normalized.includes('individuellement')) {
      return ownerName
        ? `Relance individuelle envoyee a ${ownerName} pour verification de son calendrier.`
        : 'Relance individuelle envoyee au proprietaire.';
    }
  }
  if (category === 'proprietaire' && ownerName) {
    return `Nouvelle information recue de ${ownerName}.`;
  }
  return summarizeNotificationDetail(message);
}

function shouldHideSystemNotification(item: EnrichedNotificationInsight) {
  const title = String(item.clientName || '').trim().toLowerCase();
  const detail = String(item.detailLabel || '').trim().toLowerCase();
  const message = String(item.notification.message || '').trim().toLowerCase();
  if (title === 'suivi calendrier proprietaire') return true;
  if (detail.includes('fermeture calendrier approuvee pour proprietaire')) return true;
  if (message.includes('fermeture calendrier approuvee pour proprietaire')) return true;
  if (message.includes('reouverture calendrier approuvee pour proprietaire')) return true;
  if (message.includes('calendrier rejete pour proprietaire')) return true;
  if (message.includes('programmation relance calendrier mise a jour')) return true;
  if (message.includes('test relance calendrier envoye')) return true;
  if (message.includes('relance calendrier envoyee individuellement a')) return true;
  if (message.includes('notification disponibilite envoyee au proprietaire')) return true;
  if (message.includes('message admin envoy')) return true;
  if (message.includes('notification mise a jour application envoyee')) return true;
  return false;
}

function formatElapsedDuration(from?: string | null, nowMs = Date.now()) {
  const parsed = parseDateForRelative(from);
  if (!parsed) return '';
  const diffMs = Math.max(0, nowMs - parsed.getTime());
  const totalMinutes = Math.floor(diffMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) return `${minutes} min`;
  return `${hours} h ${String(minutes).padStart(2, '0')} min`;
}

function getOwnerCalendarStatusMeta(status?: OwnerCalendarPromptStatus | null, nowMs = Date.now()) {
  const value = String(status?.status || '').trim();
  const sentAt = value === 'pending'
    ? status?.updatedAt || status?.createdAt || null
    : status?.createdAt || status?.updatedAt || null;
  if (value === 'pending') {
    const sentAtDate = parseDateForRelative(sentAt);
    const overdueMs = sentAtDate ? nowMs - sentAtDate.getTime() : 0;
    const isOverdue = overdueMs >= 3 * 60 * 60 * 1000;
    const waitingDurationLabel = sentAt ? formatElapsedDuration(sentAt, nowMs) : '';
    return {
      label: isOverdue ? 'Proprietaire en retard' : 'Proprietaire en attente',
      tone: isOverdue ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-amber-200 bg-amber-50 text-amber-800',
      detail: sentAt ? `Envoyee le ${formatDateTime(sentAt)}` : (status?.promptDate ? `Relance du ${formatStayDate(status.promptDate)}` : 'Relance envoyee'),
      helper: sentAt ? `Sans reponse depuis ${waitingDurationLabel}` : 'Sans reponse',
      sentAt,
      respondedAt: null,
      waitingDurationLabel,
      isOverdue,
    };
  }
  if (value === 'confirmed_up_to_date') {
    const answeredAt = status?.respondedAt || status?.responseMetadata?.respondedAt || null;
    return {
      label: 'Proprietaire a jour',
      tone: 'border-emerald-200 bg-emerald-50 text-emerald-800',
      detail: sentAt ? `Envoyee le ${formatDateTime(sentAt)}` : 'Calendrier confirme a jour',
      helper: answeredAt ? `Repondu ${formatRelativeDelay(answeredAt).replace(/^il y a /, 'il y a ')}` : 'Calendrier confirme a jour',
      sentAt,
      respondedAt: answeredAt,
      waitingDurationLabel: '',
      isOverdue: false,
    };
  }
  if (value === 'update_requested') {
    const answeredAt = status?.respondedAt || status?.responseMetadata?.respondedAt || null;
    const propertyTitle = String(status?.responseMetadata?.propertyTitle || '').trim();
    return {
      label: 'MAJ calendrier en attente',
      tone: 'border-sky-200 bg-sky-50 text-sky-800',
      detail: sentAt ? `Envoyee le ${formatDateTime(sentAt)}` : 'Ouverture calendrier demandee',
      helper: propertyTitle ? `Bien: ${propertyTitle}` : 'Ouverture calendrier demandee',
      sentAt,
      respondedAt: answeredAt,
      waitingDurationLabel: '',
      isOverdue: false,
    };
  }
  return {
    label: 'Aucune relance',
    tone: 'border-gray-200 bg-gray-50 text-gray-600',
    detail: 'Aucune relance recente',
    helper: '',
    sentAt: null,
    respondedAt: null,
    waitingDurationLabel: '',
    isOverdue: false,
  };
}

export default function NotificationsPage() {
  const initialCache = readNotificationsCache();
  const location = useLocation();
  const { biens } = useProperties();
  const [notifications, setNotifications] = useState<Notification[]>(initialCache?.notifications || []);
  const [demands, setDemands] = useState<ReservationDemand[]>(initialCache?.demands || []);
  const [historyRows, setHistoryRows] = useState<ReservationDemandHistory[]>([]);
  const [historyDemandId, setHistoryDemandId] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<'demands' | 'chat' | 'calendars' | 'system'>('demands');
  const [systemNotificationTab, setSystemNotificationTab] = useState<'active' | 'archive'>('active');
  const [notificationCategoryFilter, setNotificationCategoryFilter] = useState<'all' | NotificationCategory>('all');
  const [notificationImportanceFilter, setNotificationImportanceFilter] = useState<'all' | NotificationImportance>('all');
  const [showUrgentNotificationsOnly, setShowUrgentNotificationsOnly] = useState(false);
  const [isAdminAlertsOpen, setIsAdminAlertsOpen] = useState(false);
  const [adminAlertsUrgentOnly, setAdminAlertsUrgentOnly] = useState(false);
  const [demandTab, setDemandTab] = useState<'pending' | 'finished_success' | 'finished_cancelled'>('pending');
  const [cancelledSubTab, setCancelledSubTab] = useState<'client' | 'echeance'>('client');
  const [selectedChatOwner, setSelectedChatOwner] = useState<{ id: string; name: string; demandId?: string } | null>(null);
  const [selectedCalendarOwner, setSelectedCalendarOwner] = useState<{ id: string; name: string } | null>(null);
  const [chatMessages, setChatMessages] = useState<Array<{ id: string; text: string; kind?: string; createdAt?: string }>>([]);
  const [chatDraft, setChatDraft] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatSending, setChatSending] = useState(false);
  const [quickChatOpen, setQuickChatOpen] = useState(false);
  const [chatOwnerSearch, setChatOwnerSearch] = useState('');
  const [calendarOwnerSearch, setCalendarOwnerSearch] = useState('');
  const [calendarNowMs, setCalendarNowMs] = useState(() => Date.now());
  const [showOwnerProfilePanel, setShowOwnerProfilePanel] = useState(false);
  const [selectedOwnerBienCalendarId, setSelectedOwnerBienCalendarId] = useState<string | null>(null);
  const [selectedCalendarBienCalendarId, setSelectedCalendarBienCalendarId] = useState<string | null>(null);
  const [isDesktopChatLayout, setIsDesktopChatLayout] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 1024 : true
  );
  const [owners, setOwners] = useState<Proprietaire[]>(initialCache?.owners || []);
  const [calendarPromptSchedule, setCalendarPromptSchedule] = useState<CalendarPromptSchedule | null>(initialCache?.calendarPromptSchedule || null);
  const [ownerCalendarStatuses, setOwnerCalendarStatuses] = useState<Record<string, OwnerCalendarPromptStatus>>(initialCache?.ownerCalendarStatuses || {});
  const [pendingCalendarRequests, setPendingCalendarRequests] = useState<AdminCalendarRequest[]>(initialCache?.pendingCalendarRequests || []);
  const [calendarRequestHistory, setCalendarRequestHistory] = useState<AdminCalendarRequest[]>(initialCache?.calendarRequestHistory || []);
  const [calendarReviewRequest, setCalendarReviewRequest] = useState<AdminCalendarRequest | null>(null);
  const [calendarReviewDiff, setCalendarReviewDiff] = useState<CalendarDiffPayload | null>(null);
  const [selectedClientDemand, setSelectedClientDemand] = useState<ReservationDemand | null>(null);
  const [calendarReviewLoading, setCalendarReviewLoading] = useState(false);
  const [calendarActionLoadingId, setCalendarActionLoadingId] = useState<string | null>(null);
  const [scheduleSaving, setScheduleSaving] = useState(false);
  const [dispatchingCalendarPrompt, setDispatchingCalendarPrompt] = useState(false);
  const [dispatchingCalendarPromptOwnerId, setDispatchingCalendarPromptOwnerId] = useState<string | null>(null);
  const [loading, setLoading] = useState(!initialCache);
  const [refreshing, setRefreshing] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [generatingContractDemandId, setGeneratingContractDemandId] = useState<string | null>(null);
  const [sendingContractDemandId, setSendingContractDemandId] = useState<string | null>(null);
  const [serviceQuoteDrafts, setServiceQuoteDrafts] = useState<Record<string, Record<string, number>>>({});
  const [expandedDemandIds, setExpandedDemandIds] = useState<Record<string, boolean>>({});
  const hasLoadedOnceRef = useRef(Boolean(initialCache));
  const isFetchingRef = useRef(false);
  const isChatFetchingRef = useRef<string | null>(null);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  const adminAlertsPanelRef = useRef<HTMLDivElement | null>(null);
  const ownerBienCalendarRef = useRef<HTMLDivElement | null>(null);
  const calendarBienCalendarRef = useRef<HTMLDivElement | null>(null);

  const fetchData = useCallback(async (options?: { background?: boolean }) => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    const shouldShowBlockingLoader = !hasLoadedOnceRef.current && !options?.background;
    if (shouldShowBlockingLoader) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }
    try {
      const [
        notificationsResponse,
        demandsResponse,
        ownersResponse,
        calendarPromptScheduleResponse,
        ownerCalendarStatusesResponse,
        pendingCalendarRequestsResponse,
        calendarRequestHistoryResponse,
      ] = await Promise.all([
        fetch(`${API_URL}/notifications`, { credentials: 'include' }),
        fetch(`${API_URL}/reservation-demands`, { credentials: 'include' }),
        fetch(`${API_URL}/proprietaires`, { credentials: 'include' }),
        fetch(`${API_URL}/mobile/admin/calendar-prompt-schedule`, { credentials: 'include' }),
        fetch(`${API_URL}/mobile/admin/owner-calendar-prompt-statuses`, { credentials: 'include' }),
        fetch(`${API_URL}/mobile/admin/calendar-requests?statuses=pending`, { credentials: 'include' }),
        fetch(`${API_URL}/mobile/admin/calendar-requests?statuses=approved,rejected`, { credentials: 'include' }),
      ]);
      if (!notificationsResponse.ok) throw new Error(await getApiErrorMessage(notificationsResponse, 'Impossible de charger les notifications'));
      if (!demandsResponse.ok) throw new Error(await getApiErrorMessage(demandsResponse, 'Impossible de charger les demandes'));
      if (!ownersResponse.ok) throw new Error(await getApiErrorMessage(ownersResponse, 'Impossible de charger les proprietaires'));
      if (!calendarPromptScheduleResponse.ok) throw new Error(await getApiErrorMessage(calendarPromptScheduleResponse, 'Impossible de charger la programmation calendrier'));
      if (!ownerCalendarStatusesResponse.ok) throw new Error(await getApiErrorMessage(ownerCalendarStatusesResponse, 'Impossible de charger les etats calendrier proprietaires'));
      if (!pendingCalendarRequestsResponse.ok) throw new Error(await getApiErrorMessage(pendingCalendarRequestsResponse, 'Impossible de charger les demandes calendrier en attente'));
      if (!calendarRequestHistoryResponse.ok) throw new Error(await getApiErrorMessage(calendarRequestHistoryResponse, 'Impossible de charger l historique calendrier'));
      const notificationRows = await notificationsResponse.json();
      const demandRows = await demandsResponse.json();
      const ownerRows = await ownersResponse.json();
      const scheduleRow = await calendarPromptScheduleResponse.json();
      const ownerCalendarStatusRows = await ownerCalendarStatusesResponse.json();
      const pendingCalendarRows = await pendingCalendarRequestsResponse.json();
      const historyCalendarRows = await calendarRequestHistoryResponse.json();
      const mappedOwnerStatuses = Array.isArray(ownerCalendarStatusRows)
        ? ownerCalendarStatusRows.reduce<Record<string, OwnerCalendarPromptStatus>>((acc, row) => {
            const ownerId = String(row?.ownerId || '').trim();
            if (ownerId) acc[ownerId] = row as OwnerCalendarPromptStatus;
            return acc;
          }, {})
        : {};
      setNotifications(Array.isArray(notificationRows) ? notificationRows : []);
      setDemands(Array.isArray(demandRows) ? demandRows : []);
      setOwners(Array.isArray(ownerRows) ? ownerRows : []);
      setCalendarPromptSchedule(scheduleRow || null);
      setOwnerCalendarStatuses(mappedOwnerStatuses);
      setPendingCalendarRequests(Array.isArray(pendingCalendarRows) ? pendingCalendarRows : []);
      setCalendarRequestHistory(Array.isArray(historyCalendarRows) ? historyCalendarRows : []);
      writeNotificationsCache({
        notifications: Array.isArray(notificationRows) ? notificationRows : [],
        demands: Array.isArray(demandRows) ? demandRows : [],
        owners: Array.isArray(ownerRows) ? ownerRows : [],
        calendarPromptSchedule: scheduleRow || null,
        ownerCalendarStatuses: mappedOwnerStatuses,
        pendingCalendarRequests: Array.isArray(pendingCalendarRows) ? pendingCalendarRows : [],
        calendarRequestHistory: Array.isArray(historyCalendarRows) ? historyCalendarRows : [],
      });
      hasLoadedOnceRef.current = true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Impossible de charger les notifications');
    } finally {
      setLoading(false);
      setRefreshing(false);
      isFetchingRef.current = false;
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      if (activeView === 'chat' && selectedChatOwner?.id) return;
      void fetchData({ background: true });
    }, 10000);
    return () => window.clearInterval(intervalId);
  }, [fetchData, activeView, selectedChatOwner?.id]);

  const pendingDemands = useMemo(() => {
    return demands
      .filter((demand) => openStatuses.has(demand.status))
      .filter((demand) => !isAmicaleDemand(demand))
      .sort((a, b) => {
        const updatedA = new Date(String(a.updated_at || a.created_at || '')).getTime();
        const updatedB = new Date(String(b.updated_at || b.created_at || '')).getTime();
        if (updatedA !== updatedB) return updatedB - updatedA;
        const createdA = new Date(String(a.created_at || '')).getTime();
        const createdB = new Date(String(b.created_at || '')).getTime();
        if (createdA !== createdB) return createdB - createdA;
        const sa = resolveDisplayStatus(a);
        const sb = resolveDisplayStatus(b);
        const pa = demandPriority[sa] ?? 99;
        const pb = demandPriority[sb] ?? 99;
        return pa - pb;
      });
  }, [demands]);
  const finishedSuccessDemands = useMemo(
    () =>
      demands
        .filter((demand) => !isAmicaleDemand(demand))
        .filter((demand) => resolveDisplayStatus(demand) === 'succes_paiement')
        .sort((a, b) => new Date(String(b.updated_at || b.created_at || '')).getTime() - new Date(String(a.updated_at || a.created_at || '')).getTime()),
    [demands]
  );
  const cancelledByClientDemands = useMemo(
    () =>
      demands
        .filter((demand) => !isAmicaleDemand(demand))
        .filter((demand) => resolveDisplayStatus(demand) === 'demande_annulee_client')
        .sort((a, b) => new Date(String(b.updated_at || b.created_at || '')).getTime() - new Date(String(a.updated_at || a.created_at || '')).getTime()),
    [demands]
  );
  const cancelledByDeadlineDemands = useMemo(
    () =>
      demands
        .filter((demand) => !isAmicaleDemand(demand))
        .filter((demand) => resolveDisplayStatus(demand) === 'demande_annulee_echeance_contrat')
        .sort((a, b) => new Date(String(b.updated_at || b.created_at || '')).getTime() - new Date(String(a.updated_at || a.created_at || '')).getTime()),
    [demands]
  );
  const visibleDemands = useMemo(() => {
    if (demandTab === 'finished_success') return finishedSuccessDemands;
    if (demandTab === 'finished_cancelled') {
      return cancelledSubTab === 'client' ? cancelledByClientDemands : cancelledByDeadlineDemands;
    }
    return pendingDemands;
  }, [demandTab, cancelledSubTab, pendingDemands, finishedSuccessDemands, cancelledByClientDemands, cancelledByDeadlineDemands]);
  const demandCounters = useMemo(() => {
    const awaitingOwner = pendingDemands.filter((d) => resolveDisplayStatus(d) === 'en_attente_reponse_proprietaire').length;
    const awaitingClient = pendingDemands.filter((d) => resolveDisplayStatus(d) === 'reponse_positive_attente_confirmation_client').length;
    const paymentFlow = pendingDemands.filter((d) => {
      const s = resolveDisplayStatus(d);
      return s === 'demande_recu_paiement' || s === 'recu_paiement_envoye';
    }).length;
    return { awaitingOwner, awaitingClient, paymentFlow };
  }, [pendingDemands]);

  const biensById = useMemo(() => {
    const byId = new Map<string, Bien>();
    biens.forEach((bien) => {
      const bienId = String(bien.id || '').trim();
      if (bienId) byId.set(bienId, bien);
    });
    return byId;
  }, [biens]);

  const biensByReference = useMemo(() => {
    const byReference = new Map<string, Bien>();
    biens.forEach((bien) => {
      const reference = String(bien.reference || '').trim().toLowerCase();
      if (reference) byReference.set(reference, bien);
    });
    return byReference;
  }, [biens]);

  const ownerLookup = useMemo(() => {
    const byId = new Map<string, Proprietaire>();
    owners.forEach((owner) => {
      const ownerId = String(owner.id || '').trim();
      if (!ownerId) return;
      byId.set(ownerId, owner);
    });
    return byId;
  }, [owners]);

  const notificationInsights = useMemo<NotificationInsight[]>(
    () =>
      notifications.map((notification) => ({
        notification,
        ...classifyNotification(notification),
      })),
    [notifications]
  );

  const enrichedNotificationInsights = useMemo<EnrichedNotificationInsight[]>(() => {
    const demandCandidates = demands.filter((demand) => !isAmicaleDemand(demand));
    return notificationInsights.map((item) => {
      const message = String(item.notification.message || '');
      const normalizedMessage = message.toLowerCase();
      const linkedDemand = demandCandidates.find((demand) => {
        const demandId = String(demand.id || '').trim();
        const contractId = String(demand.contract_id || '').trim();
        const paymentIds = [
          demand.reservation_payment_id,
          demand.services_payment_id,
          demand.payment_id,
          demand.clicktopay_payment_id,
          demand.clicktopay_order_number,
          demand.flouci_checkout_id,
        ]
          .map((value) => String(value || '').trim())
          .filter(Boolean);
        const signatures = [
          demandId,
          contractId,
          ...paymentIds,
          String(demand.client_email || '').trim(),
          String(demand.client_name || '').trim(),
          String(demand.identity_first_name || '').trim(),
          String(demand.identity_last_name || '').trim(),
          String(demand.bien_reference || '').trim(),
        ].filter(Boolean);
        return signatures.some((signature) => normalizedMessage.includes(String(signature).toLowerCase()));
      }) || null;
      const linkedBien = linkedDemand
        ? (biensById.get(String(linkedDemand.bien_id || '').trim()) || biensByReference.get(String(linkedDemand.bien_reference || '').trim().toLowerCase()) || null)
        : null;
      const ownerId = String(
        linkedDemand?.proprietaire_id || extractOwnerIdFromNotificationMessage(message)
      ).trim();
      const ownerName = String(
        linkedDemand?.proprietaire_nom
        || ownerLookup.get(ownerId)?.nom
        || extractOwnerNameFromNotificationMessage(message)
      ).trim();
      const propertyTitle = String(
        linkedBien?.titre
        || linkedBien?.nom_bien_mobile
        || linkedBien?.reference
        || extractPropertyTitleFromNotificationMessage(message)
      ).trim();
      const modeLabel = formatModeLabel(linkedBien?.mode || (normalizedMessage.includes('hotel') ? 'hotellerie' : 'location_saisonniere'));
      const displayTitle = getNotificationDisplayTitle({
        category: item.category,
        message,
        demand: linkedDemand,
        bien: linkedBien,
        ownerName,
      });
      return {
        ...item,
        demand: linkedDemand,
        bien: linkedBien,
        clientName: displayTitle,
        sourceLabel: getDemandSourceLabel(linkedDemand, message),
        paymentMethodLabel: formatPaymentMethodLabel(linkedDemand, message),
        modeLabel,
        primaryLabel: getDemandActionTitle(item.category, message),
        secondaryLabel: getNotificationSecondaryLabel({
          category: item.category,
          demand: linkedDemand,
          ownerName,
          modeLabel,
          propertyTitle,
        }),
        detailLabel: getNotificationDetailLabel({
          category: item.category,
          message,
          ownerName,
          propertyTitle,
        }),
      };
    });
  }, [notificationInsights, demands, biensById, biensByReference, ownerLookup]);

  const visibleNotificationInsights = useMemo(
    () => enrichedNotificationInsights.filter((item) => !shouldHideSystemNotification(item)),
    [enrichedNotificationInsights]
  );

  const unreadNotificationsCount = useMemo(
    () => visibleNotificationInsights.filter((item) => !item.notification.lu).length,
    [visibleNotificationInsights]
  );

  const systemShelfNotificationInsights = useMemo(
    () =>
      visibleNotificationInsights.filter((item) =>
        systemNotificationTab === 'archive' ? item.notification.lu : !item.notification.lu
      ),
    [visibleNotificationInsights, systemNotificationTab]
  );

  const notificationCategoryCounters = useMemo(() => {
    const counters: Record<NotificationCategory, number> = {
      dossier: 0,
      proprietaire: 0,
      calendrier: 0,
      systeme: 0,
    };
    systemShelfNotificationInsights
      .filter((item) => {
        if (showUrgentNotificationsOnly && item.importance !== 'urgent') return false;
        if (notificationImportanceFilter !== 'all' && item.importance !== notificationImportanceFilter) return false;
        return true;
      })
      .forEach((item) => {
      counters[item.category] += 1;
      });
    return counters;
  }, [systemShelfNotificationInsights, notificationImportanceFilter, showUrgentNotificationsOnly]);

  const notificationImportanceCounters = useMemo(() => {
    const counters: Record<NotificationImportance, number> = {
      urgent: 0,
      modere: 0,
      normal: 0,
    };
    systemShelfNotificationInsights
      .filter((item) => {
        if (showUrgentNotificationsOnly && item.importance !== 'urgent') return false;
        if (notificationCategoryFilter !== 'all' && item.category !== notificationCategoryFilter) return false;
        return true;
      })
      .forEach((item) => {
        counters[item.importance] += 1;
      });
    return counters;
  }, [systemShelfNotificationInsights, notificationCategoryFilter, showUrgentNotificationsOnly]);

  const urgentNotificationCount = useMemo(
    () => notificationImportanceCounters.urgent,
    [notificationImportanceCounters]
  );

  const filteredNotificationInsights = useMemo(() => {
    return systemShelfNotificationInsights.filter((item) => {
      if (showUrgentNotificationsOnly && item.importance !== 'urgent') return false;
      if (notificationCategoryFilter !== 'all' && item.category !== notificationCategoryFilter) return false;
      if (notificationImportanceFilter !== 'all' && item.importance !== notificationImportanceFilter) return false;
      return true;
    });
  }, [systemShelfNotificationInsights, showUrgentNotificationsOnly, notificationCategoryFilter, notificationImportanceFilter]);

  const sortedNotificationInsights = useMemo(() => {
    const importanceScore: Record<NotificationImportance, number> = {
      urgent: 0,
      modere: 1,
      normal: 2,
    };
    return filteredNotificationInsights
      .slice()
      .sort((left, right) => {
        const scoreGap = importanceScore[left.importance] - importanceScore[right.importance];
        if (scoreGap !== 0) return scoreGap;
        return String(right.notification.created_at || '').localeCompare(String(left.notification.created_at || ''));
      });
  }, [filteredNotificationInsights]);

  const adminAlertPreviewItems = useMemo(() => {
    const importanceScore: Record<NotificationImportance, number> = {
      urgent: 0,
      modere: 1,
      normal: 2,
    };
    return visibleNotificationInsights
      .filter((item) => !item.notification.lu)
      .slice()
      .sort((left, right) => {
        const scoreGap = importanceScore[left.importance] - importanceScore[right.importance];
        if (scoreGap !== 0) return scoreGap;
        return String(right.notification.created_at || '').localeCompare(String(left.notification.created_at || ''));
      })
      .slice(0, 6);
  }, [visibleNotificationInsights]);

  const visibleAdminAlertPreviewItems = useMemo(
    () => (adminAlertsUrgentOnly ? adminAlertPreviewItems.filter((item) => item.importance === 'urgent') : adminAlertPreviewItems),
    [adminAlertPreviewItems, adminAlertsUrgentOnly]
  );

  const archivedNotificationsCount = useMemo(
    () => visibleNotificationInsights.filter((item) => item.notification.lu).length,
    [visibleNotificationInsights]
  );

  const unreadOwnerNotificationByOwnerId = useMemo(() => {
    const byOwnerId = new Map<string, EnrichedNotificationInsight>();
    visibleNotificationInsights
      .filter((item) => !item.notification.lu && item.category === 'proprietaire')
      .forEach((item) => {
        const ownerId = String(
          item.demand?.proprietaire_id || extractOwnerIdFromNotificationMessage(item.notification.message)
        ).trim();
        if (!ownerId) return;
        const current = byOwnerId.get(ownerId);
        if (!current || String(item.notification.created_at || '') > String(current.notification.created_at || '')) {
          byOwnerId.set(ownerId, item);
        }
      });
    return byOwnerId;
  }, [visibleNotificationInsights]);

  const unreadOwnerNotificationCountByOwnerId = useMemo(() => {
    const counts = new Map<string, number>();
    visibleNotificationInsights
      .filter((item) => !item.notification.lu && item.category === 'proprietaire')
      .forEach((item) => {
        const ownerId = String(
          item.demand?.proprietaire_id || extractOwnerIdFromNotificationMessage(item.notification.message)
        ).trim();
        if (!ownerId) return;
        counts.set(ownerId, (counts.get(ownerId) || 0) + 1);
      });
    return counts;
  }, [visibleNotificationInsights]);

  const unreadOwnerMessagesCount = useMemo(
    () => Array.from(unreadOwnerNotificationCountByOwnerId.values()).reduce((sum, count) => sum + count, 0),
    [unreadOwnerNotificationCountByOwnerId]
  );

  const chatOwners = useMemo(() => {
    const byId = new Map<string, { id: string; name: string; demandId?: string }>();
    owners.forEach((owner) => {
      const ownerId = String(owner.id || '').trim();
      if (!ownerId) return;
      byId.set(ownerId, {
        id: ownerId,
        name: String(owner.nom || ownerId),
      });
    });
    demands.forEach((demand) => {
      if (isAmicaleDemand(demand)) return;
      const ownerId = String(demand.proprietaire_id || '').trim();
      if (!ownerId) return;
      if (!byId.has(ownerId)) {
        byId.set(ownerId, {
          id: ownerId,
          name: String(demand.proprietaire_nom || ownerId),
          demandId: demand.id,
        });
      }
    });
    return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  }, [demands, owners]);

  const ownerDemandsByOwnerId = useMemo(() => {
    const byOwner = new Map<string, ReservationDemand[]>();
    demands.forEach((demand) => {
      if (isAmicaleDemand(demand)) return;
      const ownerId = String(demand.proprietaire_id || '').trim();
      if (!ownerId) return;
      const current = byOwner.get(ownerId) || [];
      current.push(demand);
      byOwner.set(ownerId, current);
    });
    byOwner.forEach((rows, ownerId) => {
      byOwner.set(
        ownerId,
        [...rows].sort(
          (a, b) =>
            new Date(String(b.updated_at || b.created_at || '')).getTime()
            - new Date(String(a.updated_at || a.created_at || '')).getTime()
        )
      );
    });
    return byOwner;
  }, [demands]);

  const biensByOwnerId = useMemo(() => {
    const byOwner = new Map<string, typeof biens>();
    biens.forEach((bien) => {
      const ownerId = String(bien.proprietaire_id || '').trim();
      if (!ownerId) return;
      const current = byOwner.get(ownerId) || [];
      current.push(bien);
      byOwner.set(ownerId, current);
    });
    return byOwner;
  }, [biens]);

  const filteredChatOwners = useMemo(() => {
    const needle = String(chatOwnerSearch || '').trim().toLowerCase();
    const baseRows = !needle ? chatOwners : chatOwners.filter((owner) => {
      const profile = ownerLookup.get(owner.id);
      const demandReferences = (ownerDemandsByOwnerId.get(owner.id) || []).map((demand) => String(demand.bien_reference || demand.bien_id || ''));
      const ownedBiens = (biensByOwnerId.get(owner.id) || []).flatMap((bien) => [bien.reference, bien.titre, bien.nom_bien_mobile]);
      return [owner.name, owner.id, profile?.telephone, profile?.email, ...demandReferences, ...ownedBiens]
        .map((value) => String(value || '').toLowerCase())
        .some((value) => value.includes(needle));
    });
    return [...baseRows].sort((a, b) => {
      const aUnread = unreadOwnerNotificationByOwnerId.has(a.id) ? 1 : 0;
      const bUnread = unreadOwnerNotificationByOwnerId.has(b.id) ? 1 : 0;
      if (aUnread !== bUnread) return bUnread - aUnread;
      const aDemand = (ownerDemandsByOwnerId.get(a.id) || [])[0];
      const bDemand = (ownerDemandsByOwnerId.get(b.id) || [])[0];
      const aUpdatedAt = String(aDemand?.updated_at || aDemand?.created_at || '');
      const bUpdatedAt = String(bDemand?.updated_at || bDemand?.created_at || '');
      if (aUpdatedAt !== bUpdatedAt) return bUpdatedAt.localeCompare(aUpdatedAt);
      return a.name.localeCompare(b.name, 'fr');
    });
  }, [chatOwnerSearch, chatOwners, ownerLookup, ownerDemandsByOwnerId, biensByOwnerId, unreadOwnerNotificationByOwnerId]);

  const quickChatOwners = useMemo(() => {
    const ownersWithUnread = filteredChatOwners.filter((owner) => unreadOwnerNotificationCountByOwnerId.has(owner.id));
    return (ownersWithUnread.length > 0 ? ownersWithUnread : filteredChatOwners).slice(0, 6);
  }, [filteredChatOwners, unreadOwnerNotificationCountByOwnerId]);

  const selectedOwnerProfile = selectedChatOwner ? ownerLookup.get(selectedChatOwner.id) || null : null;
  const selectedOwnerDemands = useMemo(
    () => (selectedChatOwner ? ownerDemandsByOwnerId.get(selectedChatOwner.id) || [] : []),
    [selectedChatOwner, ownerDemandsByOwnerId]
  );
  const selectedOwnerReferences = useMemo(
    () =>
      Array.from(
        new Set(
          selectedOwnerDemands
            .map((demand) => String(demand.bien_reference || '').trim())
            .filter(Boolean)
        )
      ),
    [selectedOwnerDemands]
  );
  const selectedOwnerLatestDemand = selectedOwnerDemands[0] || null;
  const selectedOwnerBiens = useMemo(() => {
    if (!selectedChatOwner) return [];
    const linkedBiens = biensByOwnerId.get(selectedChatOwner.id) || [];
    if (linkedBiens.length > 0) return linkedBiens;
    const references = new Set(
      selectedOwnerDemands
        .map((demand) => String(demand.bien_reference || '').trim().toLowerCase())
        .filter(Boolean)
    );
    return biens.filter((bien) => references.has(String(bien.reference || '').trim().toLowerCase()));
  }, [selectedChatOwner, biensByOwnerId, selectedOwnerDemands, biens]);
  const selectedOwnerBienForCalendar = useMemo(
    () => selectedOwnerBiens.find((bien) => String(bien.id) === String(selectedOwnerBienCalendarId || '')) || null,
    [selectedOwnerBiens, selectedOwnerBienCalendarId]
  );
  const isChatMobileConversationOpen = Boolean(selectedChatOwner);

  const formatChatPreview = (ownerId: string) => {
    const latestDemand = (ownerDemandsByOwnerId.get(ownerId) || [])[0];
    if (!latestDemand) return 'Aucune demande recente';
    const reference = String(latestDemand.bien_reference || '').trim();
    const title = String(latestDemand.bien_titre || '').trim();
    if (reference && title) return `${reference} - ${title}`;
    if (title) return title;
    return statusLabels[resolveDisplayStatus(latestDemand)] || 'Conversation proprietaire';
  };

  const getOwnerInitials = (name: string) =>
    String(name || '')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join('') || 'PR';

  const formatAttentionCount = (value: number) => {
    if (!Number.isFinite(value) || value <= 0) return '';
    return value > 99 ? '99+' : String(value);
  };

  const isLikelyNoiseOwnerId = (value?: string | null) => {
    const normalized = String(value || '').trim();
    if (!normalized) return false;
    return /^p\d{8,}$/i.test(normalized);
  };

  const getBienCoverImage = (bien: typeof biens[number]) => {
    const firstImage = (bien.media || []).find((media) => media.type === 'image' && String(media.url || '').trim());
    return firstImage ? resolveMediaUrl(firstImage.url) : 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 520"%3E%3Crect width="800" height="520" fill="%23ecfdf5"/%3E%3Cpath d="M0 360L180 230l110 84 120-96 180 142H0z" fill="%23a7f3d0"/%3E%3Ccircle cx="620" cy="140" r="44" fill="%236ee7b7"/%3E%3C/svg%3E';
  };

  const getOwnerQrCodeUrl = (ownerId?: string | null, size = 160) =>
    `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(String(ownerId || '').trim())}`;

  const getPropertyPreviewText = (bien?: Bien | null) => {
    if (!bien) return '';
    const comfort = Array.isArray(bien.caracteristiques) ? bien.caracteristiques.slice(0, 4).join(', ') : '';
    return [
      `Emplacement: ${bien.distance_plage_m ? `A ${bien.distance_plage_m} m de la plage` : 'Emplacement a confirmer'}`,
      `Prix nuit: ${formatMoney(bien.prix_nuitee)}`,
      `Prix semaine: ${formatMoney(bien.prix_semaine)}`,
      `Prix proprietaire: ${formatMoney(bien.prix_proprietaire || bien.prix_fixe_proprietaire)}`,
      `Type: ${String(bien.type || 'Bien').replace(/_/g, ' ')}`,
      `Sous-type: ${String(bien.residence_unit_sub_type || bien.configuration || '-').replace(/_/g, ' ')}`,
      `Confort: ${comfort || 'A preciser'}`,
    ].join('\n');
  };

  const getBienCalendarDates = (bien?: Bien | null) => {
    const rawDates = (bien as (Bien & { unavailable_dates?: DateStatus[] }) | null)?.unavailableDates
      || (bien as (Bien & { unavailable_dates?: DateStatus[] }) | null)?.unavailable_dates
      || [];
    return Array.isArray(rawDates) ? rawDates : [];
  };

  const calendarOwners = useMemo(() => {
    const byId = new Map<string, { id: string; name: string }>();
    owners.forEach((owner) => {
      const ownerId = String(owner.id || '').trim();
      if (!ownerId) return;
      byId.set(ownerId, {
        id: ownerId,
        name: String(owner.nom || ownerId).trim() || ownerId,
      });
    });
    Object.values(ownerCalendarStatuses).forEach((status) => {
      const ownerId = String(status.ownerId || '').trim();
      if (!ownerId || byId.has(ownerId)) return;
      byId.set(ownerId, {
        id: ownerId,
        name: String(status.ownerName || ownerId).trim() || ownerId,
      });
    });
    return Array.from(byId.values())
      .filter((owner) => {
        const hasProfile = ownerLookup.has(owner.id);
        const hasDemand = (ownerDemandsByOwnerId.get(owner.id) || []).length > 0;
        const hasBien = (biensByOwnerId.get(owner.id) || []).length > 0;
        if (hasProfile || hasDemand || hasBien) return true;
        return !isLikelyNoiseOwnerId(owner.id);
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  }, [owners, ownerCalendarStatuses, ownerLookup, ownerDemandsByOwnerId, biensByOwnerId]);

  const pendingCalendarRequestByOwner = useMemo(() => {
    const byOwner = new Map<string, AdminCalendarRequest>();
    for (const request of pendingCalendarRequests) {
      const ownerId = String(request.ownerId || '').trim();
      if (!ownerId || byOwner.has(ownerId)) continue;
      byOwner.set(ownerId, request);
    }
    return byOwner;
  }, [pendingCalendarRequests]);

  const calendarRequestHistoryByOwner = useMemo(() => {
    const byOwner = new Map<string, AdminCalendarRequest[]>();
    calendarRequestHistory.forEach((request) => {
      const ownerId = String(request.ownerId || '').trim();
      if (!ownerId) return;
      const current = byOwner.get(ownerId) || [];
      current.push(request);
      byOwner.set(ownerId, current);
    });
    byOwner.forEach((rows, ownerId) => {
      byOwner.set(
        ownerId,
        [...rows].sort(
          (a, b) =>
            new Date(String(b.reviewedAt || b.submittedAt || '')).getTime()
            - new Date(String(a.reviewedAt || a.submittedAt || '')).getTime()
        )
      );
    });
    return byOwner;
  }, [calendarRequestHistory]);

  const filteredCalendarOwners = useMemo(() => {
    const needle = String(calendarOwnerSearch || '').trim().toLowerCase();
    const baseRows = !needle ? calendarOwners : calendarOwners.filter((owner) => {
      const profile = ownerLookup.get(owner.id);
      const status = ownerCalendarStatuses[owner.id];
      const pendingRequest = pendingCalendarRequestByOwner.get(owner.id);
      const historyRows = calendarRequestHistoryByOwner.get(owner.id) || [];
      const ownedBiens = biensByOwnerId.get(owner.id) || [];
      return [
        owner.name,
        profile?.telephone,
        profile?.email,
        status?.responseMetadata?.propertyTitle,
        pendingRequest?.propertyTitle,
        pendingRequest?.note,
        ...historyRows.flatMap((request) => [request.propertyTitle, request.note, request.reason]),
        ...ownedBiens.flatMap((bien) => [bien.reference, bien.titre, bien.nom_bien_mobile]),
      ]
        .map((value) => String(value || '').toLowerCase())
        .some((value) => value.includes(needle));
    });
    return [...baseRows].sort((a, b) => {
      const aPending = pendingCalendarRequestByOwner.has(a.id) ? 1 : 0;
      const bPending = pendingCalendarRequestByOwner.has(b.id) ? 1 : 0;
      if (aPending !== bPending) return bPending - aPending;
      const aStatus = ownerCalendarStatuses[a.id];
      const bStatus = ownerCalendarStatuses[b.id];
      const aUpdatedAt = String(aStatus?.updatedAt || aStatus?.createdAt || '');
      const bUpdatedAt = String(bStatus?.updatedAt || bStatus?.createdAt || '');
      if (aUpdatedAt !== bUpdatedAt) return bUpdatedAt.localeCompare(aUpdatedAt);
      return a.name.localeCompare(b.name, 'fr');
    });
  }, [calendarOwnerSearch, calendarOwners, ownerLookup, ownerCalendarStatuses, pendingCalendarRequestByOwner, calendarRequestHistoryByOwner, biensByOwnerId]);

  const selectedCalendarOwnerProfile = selectedCalendarOwner ? ownerLookup.get(selectedCalendarOwner.id) || null : null;
  const selectedCalendarStatus = selectedCalendarOwner ? ownerCalendarStatuses[selectedCalendarOwner.id] || null : null;
  const selectedCalendarStatusMeta = getOwnerCalendarStatusMeta(selectedCalendarStatus, calendarNowMs);
  const selectedCalendarPendingRequest = selectedCalendarOwner ? pendingCalendarRequestByOwner.get(selectedCalendarOwner.id) || null : null;
  const selectedCalendarHistory = useMemo(
    () => (selectedCalendarOwner ? calendarRequestHistoryByOwner.get(selectedCalendarOwner.id) || [] : []),
    [selectedCalendarOwner, calendarRequestHistoryByOwner]
  );
  const selectedCalendarBiens = useMemo(() => {
    if (!selectedCalendarOwner) return [];
    const linkedBiens = biensByOwnerId.get(selectedCalendarOwner.id) || [];
    if (linkedBiens.length > 0) return linkedBiens;
    const titles = new Set(
      [selectedCalendarPendingRequest, ...selectedCalendarHistory]
        .map((request) => String(request?.propertyTitle || '').trim().toLowerCase())
        .filter(Boolean)
    );
    return biens.filter((bien) => titles.has(String(bien.titre || '').trim().toLowerCase()));
  }, [selectedCalendarOwner, biensByOwnerId, selectedCalendarPendingRequest, selectedCalendarHistory, biens]);
  const selectedCalendarBienForCalendar = useMemo(
    () => selectedCalendarBiens.find((bien) => String(bien.id) === String(selectedCalendarBienCalendarId || '')) || null,
    [selectedCalendarBiens, selectedCalendarBienCalendarId]
  );
  const isCalendarMobileConversationOpen = Boolean(selectedCalendarOwner);
  const overdueCalendarOwners = useMemo(
    () =>
      filteredCalendarOwners.filter((owner) => getOwnerCalendarStatusMeta(ownerCalendarStatuses[owner.id] || null, calendarNowMs).isOverdue),
    [filteredCalendarOwners, ownerCalendarStatuses, calendarNowMs]
  );
  const pendingCalendarOwnersCount = useMemo(
    () =>
      filteredCalendarOwners.filter((owner) => {
        const statusMeta = getOwnerCalendarStatusMeta(ownerCalendarStatuses[owner.id] || null, calendarNowMs);
        return !statusMeta.isOverdue && String(ownerCalendarStatuses[owner.id]?.status || '').trim() === 'pending';
      }).length,
    [filteredCalendarOwners, ownerCalendarStatuses, calendarNowMs]
  );
  const pendingCalendarUpdateOwnersCount = useMemo(
    () => filteredCalendarOwners.filter((owner) => pendingCalendarRequestByOwner.has(owner.id)).length,
    [filteredCalendarOwners, pendingCalendarRequestByOwner]
  );
  const nonOverdueCalendarOwners = useMemo(
    () =>
      filteredCalendarOwners.filter((owner) => !getOwnerCalendarStatusMeta(ownerCalendarStatuses[owner.id] || null, calendarNowMs).isOverdue),
    [filteredCalendarOwners, ownerCalendarStatuses, calendarNowMs]
  );
  const upToDateCalendarOwnersCount = useMemo(
    () =>
      filteredCalendarOwners.filter((owner) => {
        const status = ownerCalendarStatuses[owner.id] || null;
        return String(status?.status || '').trim() === 'confirmed_up_to_date';
      }).length,
    [filteredCalendarOwners, ownerCalendarStatuses]
  );

  const demandAttentionCount = pendingDemands.length;
  const chatAttentionCount = unreadOwnerMessagesCount;
  const calendarAttentionCount = overdueCalendarOwners.length + pendingCalendarOwnersCount + pendingCalendarUpdateOwnersCount;
  const systemAttentionCount = visibleNotificationInsights.filter(
    (item) => !item.notification.lu && item.category !== 'proprietaire'
  ).length;

  const loadOwnerChat = useCallback(async (ownerId: string, options?: { background?: boolean }) => {
    const normalizedOwnerId = String(ownerId || '').trim();
    if (!normalizedOwnerId) return;
    if (isChatFetchingRef.current === normalizedOwnerId) return;
    isChatFetchingRef.current = normalizedOwnerId;
    if (!options?.background) {
      setChatLoading(true);
    }
    try {
      const response = await fetch(`${API_URL}/mobile/owners/${encodeURIComponent(normalizedOwnerId)}/chat`, {
        credentials: 'include',
      });
      if (!response.ok) throw new Error(await getApiErrorMessage(response, 'Impossible de charger le chat proprietaire'));
      const rows = await response.json();
      const mapped = (Array.isArray(rows) ? rows : []).map((row: any) => ({
        id: String(row.id || ''),
        text: String(row.text || ''),
        kind: String(row.kind || ''),
        createdAt: String(row.createdAt || ''),
      })).sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
      setChatMessages(mapped);
    } catch (error) {
      if (!options?.background) {
        toast.error(error instanceof Error ? error.message : 'Impossible de charger le chat proprietaire');
        setChatMessages([]);
      }
    } finally {
      if (!options?.background) {
        setChatLoading(false);
      }
      if (isChatFetchingRef.current === normalizedOwnerId) {
        isChatFetchingRef.current = null;
      }
    }
  }, []);

  const focusOwnerChatThread = useCallback((owner: { id: string; name: string; demandId?: string }, options?: { openQuickChat?: boolean }) => {
    setShowOwnerProfilePanel(false);
    setChatDraft('');
    setSelectedChatOwner(owner);
    if (options?.openQuickChat) {
      setQuickChatOpen(true);
    }
    void loadOwnerChat(owner.id);
  }, [loadOwnerChat]);

  const openOwnerChat = useCallback((demand: ReservationDemand) => {
    const ownerId = String(demand.proprietaire_id || '').trim();
    if (!ownerId) {
      toast.error('Cette demande ne contient pas d identifiant proprietaire');
      return;
    }
    const owner = {
      id: ownerId,
      name: String(demand.proprietaire_nom || ownerId),
      demandId: demand.id,
    };
    if (selectedChatOwner?.id === owner.id && activeView === 'chat') {
      return;
    }
    setActiveView('chat');
    setQuickChatOpen(false);
    focusOwnerChatThread(owner);
  }, [focusOwnerChatThread, activeView, selectedChatOwner?.id]);

  const openOwnerChatByOwnerId = useCallback((ownerId: string) => {
    const normalizedOwnerId = String(ownerId || '').trim();
    if (!normalizedOwnerId) return;
    const latestDemand = (ownerDemandsByOwnerId.get(normalizedOwnerId) || [])[0];
    const ownerName =
      chatOwners.find((item) => item.id === normalizedOwnerId)?.name
      || String(ownerLookup.get(normalizedOwnerId)?.nom || '').trim()
      || String(latestDemand?.proprietaire_nom || '').trim()
      || normalizedOwnerId;
    const nextOwner = {
      id: normalizedOwnerId,
      name: ownerName,
      demandId: latestDemand?.id,
    };
    setIsAdminAlertsOpen(false);
    setActiveView('chat');
    setQuickChatOpen(false);
    if (selectedChatOwner?.id === normalizedOwnerId && activeView === 'chat') {
      return;
    }
    focusOwnerChatThread(nextOwner);
  }, [activeView, chatOwners, focusOwnerChatThread, ownerDemandsByOwnerId, ownerLookup, selectedChatOwner?.id]);

  const openQuickChatForOwner = useCallback((ownerId: string) => {
    const normalizedOwnerId = String(ownerId || '').trim();
    if (!normalizedOwnerId) return;
    const latestDemand = (ownerDemandsByOwnerId.get(normalizedOwnerId) || [])[0];
    const ownerName =
      chatOwners.find((item) => item.id === normalizedOwnerId)?.name
      || String(ownerLookup.get(normalizedOwnerId)?.nom || '').trim()
      || String(latestDemand?.proprietaire_nom || '').trim()
      || normalizedOwnerId;
    focusOwnerChatThread(
      {
        id: normalizedOwnerId,
        name: ownerName,
        demandId: latestDemand?.id,
      },
      { openQuickChat: true }
    );
  }, [chatOwners, focusOwnerChatThread, ownerDemandsByOwnerId, ownerLookup]);

  useEffect(() => {
    if (activeView !== 'chat' || !selectedChatOwner?.id) return;
    const intervalId = window.setInterval(() => {
      void loadOwnerChat(selectedChatOwner.id, { background: true });
    }, 10000);
    return () => window.clearInterval(intervalId);
  }, [activeView, selectedChatOwner?.id, loadOwnerChat]);

  useEffect(() => {
    if (!quickChatOpen || activeView === 'chat' || !selectedChatOwner?.id) return;
    const intervalId = window.setInterval(() => {
      void loadOwnerChat(selectedChatOwner.id, { background: true });
    }, 10000);
    return () => window.clearInterval(intervalId);
  }, [quickChatOpen, activeView, selectedChatOwner?.id, loadOwnerChat]);

  useEffect(() => {
    if (!quickChatOpen || activeView === 'chat' || selectedChatOwner?.id) return;
    const fallbackOwner =
      filteredChatOwners.find((owner) => unreadOwnerNotificationCountByOwnerId.has(owner.id))
      || filteredChatOwners[0];
    if (!fallbackOwner) return;
    focusOwnerChatThread(fallbackOwner, { openQuickChat: true });
  }, [quickChatOpen, activeView, selectedChatOwner?.id, filteredChatOwners, unreadOwnerNotificationCountByOwnerId, focusOwnerChatThread]);

  useEffect(() => {
    if (activeView !== 'chat') return;
    setQuickChatOpen(false);
  }, [activeView]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const syncLayout = () => setIsDesktopChatLayout(window.innerWidth >= 1024);
    syncLayout();
    window.addEventListener('resize', syncLayout);
    return () => window.removeEventListener('resize', syncLayout);
  }, []);

  useEffect(() => {
    const intervalId = window.setInterval(() => setCalendarNowMs(Date.now()), 60000);
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    if (activeView !== 'chat') return;
    if (!isDesktopChatLayout) return;
    if (selectedChatOwner && chatOwners.some((owner) => owner.id === selectedChatOwner.id)) return;
    if (chatOwners.length === 0) {
      if (selectedChatOwner) setSelectedChatOwner(null);
      return;
    }
    const fallbackOwner = chatOwners[0];
    setSelectedChatOwner(fallbackOwner);
    setShowOwnerProfilePanel(false);
    void loadOwnerChat(fallbackOwner.id);
  }, [activeView, chatOwners, selectedChatOwner, loadOwnerChat, isDesktopChatLayout]);

  useEffect(() => {
    setSelectedOwnerBienCalendarId(null);
  }, [selectedChatOwner?.id, showOwnerProfilePanel]);

  useEffect(() => {
    if (activeView !== 'calendars') return;
    if (!isDesktopChatLayout) return;
    if (selectedCalendarOwner && calendarOwners.some((owner) => owner.id === selectedCalendarOwner.id)) return;
    if (calendarOwners.length === 0) {
      if (selectedCalendarOwner) setSelectedCalendarOwner(null);
      return;
    }
    setSelectedCalendarOwner(calendarOwners[0]);
  }, [activeView, calendarOwners, selectedCalendarOwner, isDesktopChatLayout]);

  useEffect(() => {
    setSelectedCalendarBienCalendarId(null);
  }, [selectedCalendarOwner?.id]);

  useEffect(() => {
    if (!selectedOwnerBienForCalendar || !ownerBienCalendarRef.current) return;
    ownerBienCalendarRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [selectedOwnerBienForCalendar]);

  useEffect(() => {
    if (!selectedCalendarBienForCalendar || !calendarBienCalendarRef.current) return;
    calendarBienCalendarRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [selectedCalendarBienForCalendar]);

  useEffect(() => {
    if (!chatScrollRef.current) return;
    chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
  }, [chatMessages, chatLoading, selectedChatOwner?.id]);

  useEffect(() => {
    if (!isAdminAlertsOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (!adminAlertsPanelRef.current) return;
      if (adminAlertsPanelRef.current.contains(event.target as Node)) return;
      setIsAdminAlertsOpen(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [isAdminAlertsOpen]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('focus') !== 'urgent') return;
    setActiveView('system');
    setShowUrgentNotificationsOnly(true);
    setNotificationImportanceFilter('urgent');
    setAdminAlertsUrgentOnly(true);
    setIsAdminAlertsOpen(true);
  }, [location.search]);

  const sendChatMessage = async () => {
    if (!selectedChatOwner) return;
    const text = chatDraft.trim();
    if (!text) return;
    setChatSending(true);
    try {
      const response = await fetch(`${API_URL}/mobile/admin/owners/${encodeURIComponent(selectedChatOwner.id)}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ text }),
      });
      if (!response.ok) throw new Error(await getApiErrorMessage(response, 'Envoi message proprietaire impossible'));
      setChatDraft('');
      await loadOwnerChat(selectedChatOwner.id);
      if (selectedChatOwner.demandId) {
        const demand = demands.find((item) => item.id === selectedChatOwner.demandId);
        if (demand) {
          await handleDemandUpdate(demand, {
            communicateToOwner: true,
            history_note: 'Communication envoyee au proprietaire via chat',
          });
        }
      }
      toast.success('Message envoye au proprietaire');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Envoi message proprietaire impossible');
    } finally {
      setChatSending(false);
    }
  };

  const requestOwnerAvailability = async (demand: ReservationDemand) => {
    setSavingId(demand.id);
    try {
      const response = await fetch(
        `${API_URL}/reservation-demands/${encodeURIComponent(demand.id)}/request-owner-availability`,
        {
          method: 'POST',
          credentials: 'include',
        }
      );
      if (!response.ok) {
        throw new Error(await getApiErrorMessage(response, 'Envoi demande disponibilite impossible'));
      }
      const updated = await response.json();
      if (updated?.id) {
        setDemands((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
      }
      toast.success(updated?.pushSkipped ? 'Demande deja envoyee. Reponse proprietaire en attente.' : 'Demande de disponibilite envoyee au proprietaire');
      await fetchData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Envoi demande disponibilite impossible');
    } finally {
      setSavingId(null);
    }
  };

  const saveCalendarPromptSchedule = async () => {
    if (!calendarPromptSchedule) return;
    setScheduleSaving(true);
    try {
      const response = await fetch(`${API_URL}/mobile/admin/calendar-prompt-schedule`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          enabled: calendarPromptSchedule.enabled,
          startDate: calendarPromptSchedule.startDate,
          dispatchHour: calendarPromptSchedule.dispatchHour,
          dispatchMinute: calendarPromptSchedule.dispatchMinute,
        }),
      });
      if (!response.ok) {
        throw new Error(await getApiErrorMessage(response, 'Impossible de sauvegarder la programmation calendrier'));
      }
      const next = await response.json();
      setCalendarPromptSchedule(next);
      toast.success('Programmation calendrier enregistree');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Impossible de sauvegarder la programmation calendrier');
    } finally {
      setScheduleSaving(false);
    }
  };

  const dispatchCalendarPromptNow = async () => {
    setDispatchingCalendarPrompt(true);
    try {
      const response = await fetch(`${API_URL}/mobile/admin/calendar-prompt-schedule/dispatch-now`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({}),
      });
      if (!response.ok) {
        throw new Error(await getApiErrorMessage(response, 'Impossible d envoyer la relance calendrier'));
      }
      const result = await response.json();
      toast.success(`Relance calendrier envoyee (${result.sentOwners ?? 0}/${result.totalOwners ?? 0})`);
      await fetchData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Impossible d envoyer la relance calendrier');
    } finally {
      setDispatchingCalendarPrompt(false);
    }
  };

  const dispatchCalendarPromptToOwner = async (owner: { id: string; name: string }) => {
    const ownerId = String(owner.id || '').trim();
    if (!ownerId) return;
    setDispatchingCalendarPromptOwnerId(ownerId);
    try {
      const response = await fetch(`${API_URL}/mobile/admin/calendar-prompt-schedule/dispatch-owner/${encodeURIComponent(ownerId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({}),
      });
      if (!response.ok) {
        throw new Error(await getApiErrorMessage(response, 'Impossible d envoyer la relance calendrier a ce proprietaire'));
      }
      const result = await response.json();
      toast.success(`Relance calendrier envoyee a ${result.ownerName || owner.name}`);
      await fetchData({ background: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Impossible d envoyer la relance calendrier a ce proprietaire');
    } finally {
      setDispatchingCalendarPromptOwnerId(null);
    }
  };

  const openCalendarDiff = async (request: AdminCalendarRequest) => {
    setCalendarReviewRequest(request);
    setCalendarReviewDiff(null);
    setCalendarReviewLoading(true);
    try {
      const response = await fetch(`${API_URL}/mobile/admin/calendar-requests/${encodeURIComponent(request.id)}/diff`, {
        credentials: 'include',
      });
      if (!response.ok) {
        throw new Error(await getApiErrorMessage(response, 'Impossible de charger la difference calendrier'));
      }
      const payload = await response.json();
      setCalendarReviewDiff(payload || null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Impossible de charger la difference calendrier');
      setCalendarReviewRequest(null);
    } finally {
      setCalendarReviewLoading(false);
    }
  };

  const approveCalendarRequest = async (request: AdminCalendarRequest) => {
    setCalendarActionLoadingId(request.id);
    try {
      const response = await fetch(`${API_URL}/mobile/admin/calendar-requests/${encodeURIComponent(request.id)}/approve`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!response.ok) {
        throw new Error(await getApiErrorMessage(response, 'Approbation calendrier impossible'));
      }
      toast.success('Mise a jour calendrier approuvee');
      setCalendarReviewRequest(null);
      setCalendarReviewDiff(null);
      await fetchData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Approbation calendrier impossible');
    } finally {
      setCalendarActionLoadingId(null);
    }
  };

  const rejectCalendarRequest = async (request: AdminCalendarRequest) => {
    const reason = window.prompt('Raison du rejet (optionnel) :', '') ?? '';
    setCalendarActionLoadingId(request.id);
    try {
      const response = await fetch(`${API_URL}/mobile/admin/calendar-requests/${encodeURIComponent(request.id)}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ reason }),
      });
      if (!response.ok) {
        throw new Error(await getApiErrorMessage(response, 'Rejet calendrier impossible'));
      }
      toast.success('Mise a jour calendrier rejetee');
      setCalendarReviewRequest(null);
      setCalendarReviewDiff(null);
      await fetchData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Rejet calendrier impossible');
    } finally {
      setCalendarActionLoadingId(null);
    }
  };

  const handleDemandUpdate = async (
    demand: ReservationDemand,
    patch: Partial<ReservationDemand> & {
      communicateToOwner?: boolean;
      history_note?: string;
      notifyClientOnRejection?: boolean;
    }
  ) => {
    setSavingId(demand.id);
    try {
      const response = await fetch(`${API_URL}/reservation-demands/${encodeURIComponent(demand.id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          ...patch,
          actor_type: 'admin',
          actor_id: 'admin',
        }),
      });
      if (!response.ok) throw new Error(await getApiErrorMessage(response, 'Mise a jour demande impossible'));
      const updated = await response.json();
      setDemands((prev) => prev.map((item) => item.id === updated.id ? updated : item));
      toast.success('Demande mise a jour');
      if (historyDemandId === demand.id) {
        void openHistory(demand.id);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Mise a jour demande impossible');
    } finally {
      setSavingId(null);
    }
  };

  const rejectDemand = async (demand: ReservationDemand, notifyClient: boolean) => {
    const defaultNote = "Votre demande a ete rejetee par l'administration.";
    await handleDemandUpdate(demand, {
      status: 'demande_rejetee_admin',
      notifyClientOnRejection: notifyClient,
      client_note: notifyClient ? defaultNote : null,
      history_note: notifyClient
        ? 'Demande rejetee par admin et popup client demandee'
        : 'Demande rejetee par admin',
    });
  };

  const openHistory = async (demandId: string) => {
    try {
      const response = await fetch(`${API_URL}/reservation-demands/${encodeURIComponent(demandId)}/history`, { credentials: 'include' });
      if (!response.ok) throw new Error(await getApiErrorMessage(response, 'Impossible de charger l historique'));
      
      const rows = await response.json();
      setHistoryRows(Array.isArray(rows) ? rows : []);
      setHistoryDemandId(demandId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Impossible de charger l historique');
    }
  };

  const markNotificationAsRead = async (notificationId: string) => {
    try {
      const response = await fetch(`${API_URL}/notifications/${encodeURIComponent(notificationId)}/lu`, { method: 'PUT', credentials: 'include' });
      if (!response.ok) throw new Error(await getApiErrorMessage(response, 'Impossible de marquer la notification comme lue'));
      setNotifications((prev) => prev.map((item) => item.id === notificationId ? { ...item, lu: true } : item));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Impossible de marquer la notification comme lue');
    }
  };

  const getVariableServiceDrafts = (demand: ReservationDemand) => {
    const existing = serviceQuoteDrafts[demand.id];
    if (existing) return existing;
    const base: Record<string, number> = {};
    (demand.variable_services_quote || demand.selected_variable_services || []).forEach((service) => {
      base[String(service.id)] = Number((service as any).prix_saisi ?? service.prix ?? 0);
    });
    return base;
  };

  const saveVariableServicesQuote = async (demand: ReservationDemand) => {
    const sourceServices = demand.selected_variable_services || [];
    const drafts = getVariableServiceDrafts(demand);
    const quoteRows = sourceServices.map((service) => ({
      ...service,
      prix_saisi: Math.max(0, Number(drafts[String(service.id)] || 0)),
    }));
    const quoteTotal = quoteRows.reduce((sum, service) => sum + Number(service.prix_saisi || 0), 0);
    await handleDemandUpdate(demand, {
      variable_services_quote: quoteRows,
      variable_services_quote_total: quoteTotal,
      variable_services_quote_status: quoteRows.length > 0 ? 'devis_envoye' : 'aucun',
      history_note: quoteRows.length > 0 ? `Devis services envoye (${quoteTotal} TND)` : 'Aucun devis services a envoyer',
    });
  };

  const generateContractForDemand = async (demand: ReservationDemand) => {
    const contractId = String(demand.contract_id || '').trim();
    if (!contractId) {
      toast.error('Aucun contrat associe a cette demande');
      return;
    }
    setGeneratingContractDemandId(demand.id);
    try {
      const response = await fetch(`${API_URL}/contrats/${encodeURIComponent(contractId)}/regenerate-template-pdf`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!response.ok) throw new Error(await getApiErrorMessage(response, 'Generation contrat impossible'));
      toast.success('Contrat regenere');
      await fetchData({ background: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Generation contrat impossible');
    } finally {
      setGeneratingContractDemandId(null);
    }
  };

  const viewContractForDemand = async (demand: ReservationDemand) => {
    const contractId = String(demand.contract_id || '').trim();
    if (!contractId) {
      toast.error('Aucun contrat associe a cette demande');
      return;
    }
    try {
      const response = await fetch(`${API_URL}/contrats/${encodeURIComponent(contractId)}`, { credentials: 'include' });
      if (!response.ok) throw new Error(await getApiErrorMessage(response, 'Ouverture contrat impossible'));
      const contract = await response.json();
      const url = resolveAssetUrl(String(contract?.url_pdf || '').trim());
      if (!url) throw new Error('PDF contrat indisponible');
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Ouverture contrat impossible');
    }
  };

  const sendContractToClient = async (demand: ReservationDemand) => {
    const contractId = String(demand.contract_id || '').trim();
    if (!contractId) {
      toast.error('Aucun contrat associe a cette demande');
      return;
    }
    setSendingContractDemandId(demand.id);
    try {
      const response = await fetch(`${API_URL}/contrats/${encodeURIComponent(contractId)}/send-to-client`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!response.ok) throw new Error(await getApiErrorMessage(response, 'Envoi contrat impossible'));
      toast.success('Version admin envoyee au client');
      await fetchData({ background: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Envoi contrat impossible');
    } finally {
      setSendingContractDemandId(null);
    }
  };
  const toggleDemandExpanded = (demandId: string) => {
    setExpandedDemandIds((prev) => ({ ...prev, [demandId]: !prev[demandId] }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-emerald-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Notifications</h1>
          <p className="mt-1 text-sm text-gray-500">Demandes de reservation, alertes admin et suivi de progression.</p>
        </div>
        <div className="relative flex flex-wrap items-center gap-2" ref={adminAlertsPanelRef}>
          <button
            type="button"
            onClick={() => {
              setAdminAlertsUrgentOnly(false);
              setIsAdminAlertsOpen((prev) => !prev);
            }}
            className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition-colors ${
              isAdminAlertsOpen
                ? 'border-rose-300 bg-rose-50 text-rose-700 shadow-sm'
                : 'border-rose-200 bg-white text-rose-700 hover:bg-rose-50'
            }`}
            aria-expanded={isAdminAlertsOpen}
            aria-haspopup="dialog"
          >
            <BellRing className="h-4 w-4" />
            Alertes admin
            {urgentNotificationCount > 0 && (
              <span className="rounded-full bg-rose-600 px-2 py-0.5 text-[11px] font-semibold text-white">
                {urgentNotificationCount}
              </span>
            )}
            {isAdminAlertsOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
          {isAdminAlertsOpen && (
            <div className="fixed left-3 right-3 top-28 z-40 overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.16)] md:absolute md:left-auto md:right-0 md:top-[calc(100%+0.75rem)] md:z-30 md:w-[26rem]">
              <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Alertes admin</h2>
                  <p className="text-sm text-gray-500">Priorite urgente, moderee et suivi immediat.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsAdminAlertsOpen(false)}
                  className="rounded-full border border-gray-200 p-2 text-gray-500 hover:bg-gray-50"
                  aria-label="Fermer les alertes admin"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="max-h-[calc(100vh-13rem)] overflow-y-auto px-3 py-3 md:max-h-[28rem]">
                {visibleAdminAlertPreviewItems.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-4 py-8 text-center text-sm text-gray-500">
                    Aucune alerte non lue pour le moment.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {visibleAdminAlertPreviewItems.map(({ notification, importance, title, category }) => (
                      <button
                        key={`admin-alert-preview-${notification.id}`}
                        type="button"
                        onClick={() => {
                          const ownerId = extractOwnerIdFromNotificationMessage(notification.message);
                          if (category === 'proprietaire' && ownerId) {
                            openOwnerChatByOwnerId(ownerId);
                            return;
                          }
                          setActiveView('system');
                          setShowUrgentNotificationsOnly(importance === 'urgent');
                          setNotificationImportanceFilter(importance === 'urgent' ? 'all' : importance);
                          setNotificationCategoryFilter('all');
                          setIsAdminAlertsOpen(false);
                        }}
                        className="block w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-left transition-colors hover:border-emerald-200 hover:bg-emerald-50/40"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                                importance === 'urgent'
                                  ? 'bg-rose-100 text-rose-700'
                                  : importance === 'modere'
                                    ? 'bg-amber-100 text-amber-700'
                                    : 'bg-slate-100 text-slate-600'
                              }`}>
                                {importance === 'urgent' ? 'Urgent' : importance === 'modere' ? 'Modere' : 'Normal'}
                              </span>
                              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-700">{title}</span>
                            </div>
                            <p className="mt-2 line-clamp-2 text-sm leading-5 text-gray-800">{notification.message}</p>
                            <p className="mt-2 text-xs text-gray-500">{formatDateTime(notification.created_at)}</p>
                          </div>
                          <span className="mt-1 h-2.5 w-2.5 rounded-full bg-emerald-500" />
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="border-t border-gray-100 bg-gray-50 px-4 py-3">
                <button
                  type="button"
                  onClick={() => {
                    setActiveView('system');
                    setShowUrgentNotificationsOnly(false);
                    setNotificationImportanceFilter('all');
                    setNotificationCategoryFilter('all');
                    setIsAdminAlertsOpen(false);
                  }}
                  className="w-full rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-slate-800"
                >
                  Voir toutes les notifications
                </button>
              </div>
            </div>
          )}
          <button
            type="button"
            onClick={() => void fetchData({ background: true })}
            disabled={refreshing}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? 'Rechargement...' : 'Recharger'}
          </button>
        </div>
      </div>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Demandes en attente</p>
          <p className="mt-1 text-2xl font-bold text-emerald-900">{pendingDemands.length}</p>
        </div>
        <div className="rounded-xl border border-sky-200 bg-sky-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">Attente proprietaire</p>
          <p className="mt-1 text-2xl font-bold text-sky-900">{demandCounters.awaitingOwner}</p>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Attente client</p>
          <p className="mt-1 text-2xl font-bold text-amber-900">{demandCounters.awaitingClient}</p>
        </div>
        <div className="rounded-xl border border-violet-200 bg-violet-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-violet-700">Notifications non lues</p>
          <p className="mt-1 text-2xl font-bold text-violet-900">{unreadNotificationsCount}</p>
        </div>
      </section>

      <div className="flex flex-wrap gap-2 rounded-lg border border-gray-200 bg-white p-1">
        <button
          type="button"
          onClick={() => setActiveView('demands')}
          className={`relative inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium ${activeView === 'demands' ? 'bg-emerald-600 text-white' : 'text-gray-700 hover:bg-gray-100'} ${demandAttentionCount > 0 ? 'dwira-attention-tab' : ''}`}
        >
          Demandes
          {demandAttentionCount > 0 && (
            <span className="dwira-attention-badge inline-flex min-w-[1.7rem] items-center justify-center rounded-full bg-rose-500 px-2 py-0.5 text-[11px] font-bold text-white">
              +{formatAttentionCount(demandAttentionCount)}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setActiveView('chat')}
          className={`relative inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium ${activeView === 'chat' ? 'bg-emerald-600 text-white' : 'text-gray-700 hover:bg-gray-100'} ${chatAttentionCount > 0 ? 'dwira-attention-tab' : ''}`}
        >
          Chat proprietaires
          {chatAttentionCount > 0 && (
            <span className="dwira-attention-badge inline-flex min-w-[1.7rem] items-center justify-center rounded-full bg-emerald-500 px-2 py-0.5 text-[11px] font-bold text-white">
              +{formatAttentionCount(chatAttentionCount)}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setActiveView('calendars')}
          className={`relative inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium ${activeView === 'calendars' ? 'bg-emerald-600 text-white' : 'text-gray-700 hover:bg-gray-100'} ${calendarAttentionCount > 0 ? 'dwira-attention-tab' : ''}`}
        >
          Calendriers
          {calendarAttentionCount > 0 && (
            <span className="dwira-attention-badge inline-flex min-w-[1.7rem] items-center justify-center rounded-full bg-amber-500 px-2 py-0.5 text-[11px] font-bold text-white">
              +{formatAttentionCount(calendarAttentionCount)}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setActiveView('system')}
          className={`relative inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium ${activeView === 'system' ? 'bg-emerald-600 text-white' : 'text-gray-700 hover:bg-gray-100'} ${systemAttentionCount > 0 ? 'dwira-attention-tab' : ''}`}
        >
          Notifications systeme
          {systemAttentionCount > 0 && (
            <span className="dwira-attention-badge inline-flex min-w-[1.7rem] items-center justify-center rounded-full bg-sky-500 px-2 py-0.5 text-[11px] font-bold text-white">
              +{formatAttentionCount(systemAttentionCount)}
            </span>
          )}
        </button>
      </div>

      {activeView === 'calendars' && calendarPromptSchedule && (
        <section className="mt-4 rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700">Pilotage relance</p>
              <h3 className="mt-1 text-xl font-semibold text-slate-900">Programmation quotidienne</h3>
              <p className="mt-1 text-sm text-slate-500">Horaires globaux d envoi et relance immediate depuis ce panneau.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void dispatchCalendarPromptNow()}
                disabled={dispatchingCalendarPrompt}
                className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-60"
              >
                {dispatchingCalendarPrompt ? 'Envoi...' : 'Envoyer maintenant'}
              </button>
              <button
                type="button"
                onClick={() => void saveCalendarPromptSchedule()}
                disabled={scheduleSaving || !calendarPromptSchedule}
                className="rounded-xl bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                {scheduleSaving ? 'Enregistrement...' : 'Enregistrer horaire'}
              </button>
            </div>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <label className="space-y-1 text-sm">
              <span className="font-medium text-slate-700">Date de debut</span>
              <input
                type="date"
                value={calendarPromptSchedule.startDate || ''}
                onChange={(event) => setCalendarPromptSchedule((prev) => prev ? { ...prev, startDate: event.target.value || null } : prev)}
                className="w-full rounded-2xl border border-slate-300 bg-slate-50 px-3 py-3"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium text-slate-700">Heure quotidienne</span>
              <input
                type="time"
                value={calendarPromptSchedule.dailyTime}
                onChange={(event) => {
                  const [hourRaw, minuteRaw] = String(event.target.value || '').split(':');
                  const hour = Number(hourRaw || 0);
                  const minute = Number(minuteRaw || 0);
                  setCalendarPromptSchedule((prev) => prev ? {
                    ...prev,
                    dispatchHour: hour,
                    dispatchMinute: minute,
                    dailyTime: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
                  } : prev);
                }}
                className="w-full rounded-2xl border border-slate-300 bg-slate-50 px-3 py-3"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium text-slate-700">Etat</span>
              <select
                value={calendarPromptSchedule.enabled ? 'enabled' : 'disabled'}
                onChange={(event) => setCalendarPromptSchedule((prev) => prev ? {
                  ...prev,
                  enabled: event.target.value === 'enabled',
                } : prev)}
                className="w-full rounded-2xl border border-slate-300 bg-slate-50 px-3 py-3"
              >
                <option value="enabled">Active</option>
                <option value="disabled">Inactive</option>
              </select>
            </label>
            <div className="space-y-1 text-sm">
              <span className="font-medium text-slate-700">Dernier envoi</span>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-slate-700">
                {calendarPromptSchedule.lastDispatchedAt
                  ? formatDateTime(calendarPromptSchedule.lastDispatchedAt)
                  : (calendarPromptSchedule.lastDispatchedLocalDate
                      ? formatStayDate(calendarPromptSchedule.lastDispatchedLocalDate)
                      : 'Aucun')}
              </div>
            </div>
          </div>
        </section>
      )}

      {activeView === 'demands' && (
      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="mb-4 flex items-center gap-2">
          <Bell className="h-5 w-5 text-amber-600" />
          <h2 className="text-lg font-semibold text-gray-900">Demandes</h2>
        </div>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setDemandTab('pending')}
            className={`rounded-lg px-3 py-2 text-sm font-medium ${demandTab === 'pending' ? 'bg-emerald-600 text-white' : 'border border-gray-200 text-gray-700 hover:bg-gray-50'}`}
          >
            En attente ({pendingDemands.length})
          </button>
          <button
            type="button"
            onClick={() => setDemandTab('finished_success')}
            className={`rounded-lg px-3 py-2 text-sm font-medium ${demandTab === 'finished_success' ? 'bg-emerald-600 text-white' : 'border border-gray-200 text-gray-700 hover:bg-gray-50'}`}
          >
            Demandes finies succes ({finishedSuccessDemands.length})
          </button>
          <button
            type="button"
            onClick={() => setDemandTab('finished_cancelled')}
            className={`rounded-lg px-3 py-2 text-sm font-medium ${demandTab === 'finished_cancelled' ? 'bg-emerald-600 text-white' : 'border border-gray-200 text-gray-700 hover:bg-gray-50'}`}
          >
            Demandes finies annulees ({cancelledByClientDemands.length + cancelledByDeadlineDemands.length})
          </button>
        </div>
        {demandTab === 'finished_cancelled' && (
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setCancelledSubTab('client')}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium ${cancelledSubTab === 'client' ? 'bg-slate-700 text-white' : 'border border-gray-200 text-gray-700 hover:bg-gray-50'}`}
            >
              Annulees par client ({cancelledByClientDemands.length})
            </button>
            <button
              type="button"
              onClick={() => setCancelledSubTab('echeance')}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium ${cancelledSubTab === 'echeance' ? 'bg-slate-700 text-white' : 'border border-gray-200 text-gray-700 hover:bg-gray-50'}`}
            >
              Annulees par echeance ({cancelledByDeadlineDemands.length})
            </button>
          </div>
        )}
        <div className="space-y-3">
          {visibleDemands.length === 0 && <p className="text-sm text-gray-500">Aucune demande dans cet onglet.</p>}
          {visibleDemands.map((demand) => {
            const displayStatus = resolveDisplayStatus(demand);
            const statusSelectOptions = editableStatusOptions.includes(displayStatus)
              ? editableStatusOptions
              : [displayStatus, ...editableStatusOptions];
            const isExpanded = Boolean(expandedDemandIds[demand.id]);
            const receiptUrl = demand.payment_receipt_image_url ? resolveAssetUrl(demand.payment_receipt_image_url) : '';
            const hasReceipt = Boolean(receiptUrl);
            const cinPhotoUrlBase = demand.identity_document_image_url ? resolveAssetUrl(demand.identity_document_image_url) : '';
            const cinPhotoUrl = cinPhotoUrlBase && /\/chatbot-media\//i.test(cinPhotoUrlBase)
              ? appendCacheBuster(cinPhotoUrlBase, demand.updated_at || demand.identity_submitted_at || demand.id)
              : cinPhotoUrlBase;
            const hasCinPhoto = Boolean(cinPhotoUrl);
            const isAmicaleDemand = String(demand.payment_mode || '').trim() === 'amicale' || Boolean(String(demand.pricing_amicale_id || '').trim());
            const voucherUrl = demand.voucher_url ? resolveAssetUrl(demand.voucher_url) : '';
            return (
            <div key={demand.id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${statusToneClasses[displayStatus]}`}>
                      {statusLabels[displayStatus]}
                    </span>
                    <span className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs font-medium text-gray-600">
                      Cree le {formatDateTime(demand.created_at)}
                    </span>
                  </div>
                  <p className="text-base font-semibold text-gray-900">
                    {(String(demand.bien_titre || '').trim() || 'Bien demande')}
                    {String(demand.bien_reference || '').trim() ? ` • ${String(demand.bien_reference).trim()}` : ''}
                  </p>
                  <p className="text-sm text-gray-700">
                    {demand.client_name || demand.client_email || 'Client non identifie'} - Arrivee {formatStayDate(demand.start_date)} - Depart {formatStayDate(demand.end_date)} - {demand.guests} voyageurs
                  </p>
                  <p className="text-xs text-gray-500">
                    Proprietaire: <span className="font-medium text-gray-700">{demand.proprietaire_nom || '-'}</span>
                  </p>
                  {isAmicaleDemand && (
                    <div className="space-y-1 rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
                      <p className="font-semibold uppercase tracking-wide text-emerald-700">Amicale</p>
                      <p>
                        Matricule: <span className="font-medium text-emerald-900">{demand.amicale_matricule || '-'}</span>
                      </p>
                      <p>
                        Telephone: <span className="font-medium text-emerald-900">{demand.amicale_phone || '-'}</span>
                      </p>
                      <p>
                        Code: <span className="font-medium text-emerald-900">{demand.amicale_code || '-'}</span>
                      </p>
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap gap-2 xl:justify-end">
                  <button
                    type="button"
                    onClick={() => toggleDemandExpanded(demand.id)}
                    className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    {isExpanded ? 'Masquer details' : 'Voir details'}
                  </button>
                  <label className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-2 py-1.5 text-xs font-medium text-gray-600">
                    Etat
                    <select
                      value={displayStatus}
                      onChange={(event) => void handleDemandUpdate(demand, { status: event.target.value as ReservationDemandStatus, history_note: `Etat change par admin: ${statusLabels[event.target.value as ReservationDemandStatus]}` })}
                      disabled={savingId === demand.id}
                      className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-gray-700"
                    >
                      {statusSelectOptions.map((value) => (
                        <option key={value} value={value}>{statusLabels[value]}</option>
                      ))}
                    </select>
                  </label>
                  {isAmicaleDemand ? (
                    <>
                      {displayStatus === 'attente_validation_par_agence' && (
                        <>
                          <button
                            type="button"
                            onClick={() => void handleDemandUpdate(demand, { status: 'voucher_en_cours', history_note: 'Agence valide la demande amicale et genere le voucher' })}
                            disabled={savingId === demand.id}
                            className="inline-flex items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-100 disabled:opacity-60"
                          >
                            <CheckCircle2 className="h-4 w-4" />
                            Valider voucher
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDemandUpdate(demand, { status: 'rejete_par_agence', history_note: "Agence rejette la demande amicale" })}
                            disabled={savingId === demand.id}
                            className="inline-flex items-center gap-2 rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-800 hover:bg-rose-100 disabled:opacity-60"
                          >
                            Rejeter agence
                          </button>
                        </>
                      )}
                      {voucherUrl && (
                        <a
                          href={voucherUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-2 rounded-lg border border-indigo-300 bg-indigo-50 px-3 py-2 text-sm font-semibold text-indigo-800 hover:bg-indigo-100"
                        >
                          Ouvrir voucher
                        </a>
                      )}
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          void handleDemandUpdate(demand, { communicateToOwner: true, history_note: 'Demande communiquee au proprietaire' });
                          openOwnerChat(demand);
                        }}
                        disabled={savingId === demand.id}
                        className="inline-flex items-center gap-2 rounded-lg border border-sky-300 bg-sky-50 px-3 py-2 text-sm font-semibold text-sky-800 hover:bg-sky-100"
                      >
                        <MessageSquareShare className="h-4 w-4" />
                        Contacter proprietaire
                      </button>
                      <a
                        href={hasReceipt ? receiptUrl : undefined}
                        target="_blank"
                        rel="noreferrer"
                        aria-disabled={!hasReceipt}
                        className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold ${
                          hasReceipt
                            ? 'border-sky-300 bg-sky-50 text-sky-800 hover:bg-sky-100'
                            : 'cursor-not-allowed border-gray-200 bg-gray-100 text-gray-400'
                        }`}
                        onClick={(event) => {
                          if (hasReceipt) return;
                          event.preventDefault();
                        }}
                      >
                        Voir recu
                      </a>
                      <a
                        href={hasCinPhoto ? cinPhotoUrl : undefined}
                        target="_blank"
                        rel="noreferrer"
                        aria-disabled={!hasCinPhoto}
                        className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold ${
                          hasCinPhoto
                            ? 'border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                            : 'cursor-not-allowed border-gray-200 bg-gray-100 text-gray-400'
                        }`}
                        onClick={(event) => {
                          if (hasCinPhoto) return;
                          event.preventDefault();
                        }}
                      >
                        Voir photo CIN
                      </a>
                      <button
                        type="button"
                        onClick={() => void requestOwnerAvailability(demand)}
                        disabled={savingId === demand.id}
                        className="inline-flex items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-100 disabled:opacity-60"
                      >
                        <Bell className="h-4 w-4" />
                        Demander disponibilite
                      </button>
                      <button
                        type="button"
                        onClick={() => void generateContractForDemand(demand)}
                        disabled={generatingContractDemandId === demand.id || !String(demand.contract_id || '').trim()}
                        className="inline-flex items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-100 disabled:opacity-60"
                      >
                        {generatingContractDemandId === demand.id ? 'Generation...' : 'Generer contrat'}
                      </button>
                      <button
                        type="button"
                        onClick={() => void viewContractForDemand(demand)}
                        disabled={!String(demand.contract_id || '').trim()}
                        className="inline-flex items-center gap-2 rounded-lg border border-sky-300 bg-sky-50 px-3 py-2 text-sm font-semibold text-sky-800 hover:bg-sky-100 disabled:opacity-60"
                      >
                        Voir contrat
                      </button>
                      <button
                        type="button"
                        onClick={() => void sendContractToClient(demand)}
                        disabled={sendingContractDemandId === demand.id || !String(demand.contract_id || '').trim()}
                        className="inline-flex items-center gap-2 rounded-lg border border-indigo-300 bg-indigo-50 px-3 py-2 text-sm font-semibold text-indigo-800 hover:bg-indigo-100 disabled:opacity-60"
                      >
                        {sendingContractDemandId === demand.id ? 'Envoi...' : 'Envoyer contrat client'}
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => void openHistory(demand.id)}
                    className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    <History className="h-4 w-4" />
                    Trace
                  </button>
                  {!isAmicaleDemand && (
                    <>
                      <button
                        type="button"
                        onClick={() => void rejectDemand(demand, false)}
                        disabled={savingId === demand.id || demand.status === 'demande_rejetee_admin'}
                        className="inline-flex items-center gap-2 rounded-lg border border-rose-200 px-3 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-60"
                      >
                        Rejeter
                      </button>
                      <button
                        type="button"
                        onClick={() => void rejectDemand(demand, true)}
                        disabled={savingId === demand.id || demand.status === 'demande_rejetee_admin'}
                        className="inline-flex items-center gap-2 rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-800 hover:bg-rose-100 disabled:opacity-60"
                      >
                        Rejeter + popup client
                      </button>
                    </>
                  )}
                </div>
              </div>
              <div className="mt-3 grid grid-cols-1 gap-2 rounded-lg border border-gray-100 bg-gray-50 p-3 text-xs text-gray-600 md:grid-cols-2 xl:grid-cols-4">
                <div>Notif proprietaire: <span className="font-semibold text-gray-800">{demand.owner_notified_at ? formatDateTime(demand.owner_notified_at) : 'Non envoyee'}</span></div>
                <div>Reponse proprietaire: <span className="font-semibold text-gray-800">{demand.owner_response_at ? formatDateTime(demand.owner_response_at) : 'Pas encore'}</span></div>
                <div>Consultation client: <span className="font-semibold text-gray-800">{demand.client_confirmation_clicked_at ? formatDateTime(demand.client_confirmation_clicked_at) : 'Pas encore'}</span></div>
                <div>Derniere MAJ: <span className="font-semibold text-gray-800">{demand.updated_at ? formatDateTime(demand.updated_at) : formatDateTime(demand.created_at)}</span></div>
                <div>Contrat realise: <span className="font-semibold text-gray-800">{demand.contract_generated_at ? formatDateTime(demand.contract_generated_at) : 'Pas encore'}</span></div>
              </div>
              {isExpanded && (
                <>
              <div className="mt-2 text-xs text-gray-500">
                Repartition voyageurs: <span className="font-medium text-gray-700">Adultes {Number(demand.adult_guests || demand.guests || 1)} / Enfants {Number(demand.child_guests || 0)}</span>
              </div>
              {(demand.selected_fixed_services?.length || demand.selected_variable_services?.length) ? (
                <div className="mt-3 grid gap-3 lg:grid-cols-2">
                  {(demand.selected_fixed_services || []).length > 0 && (
                    <div className="rounded-lg border border-emerald-100 bg-emerald-50/50 p-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Services fixes inclus</p>
                      <div className="mt-2 space-y-2 text-sm text-gray-700">
                        {(demand.selected_fixed_services || []).map((service) => (
                          <div key={`fixed-${service.id}`} className="flex items-center justify-between gap-3">
                            <span>{service.label}</span>
                            <span className="font-semibold text-gray-900">{getServiceDisplayPrice(service)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {(demand.selected_variable_services || []).length > 0 && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">Services a deviser</p>
                      <div className="mt-2 space-y-2">
                        {(demand.selected_variable_services || []).map((service) => (
                          <div key={`variable-${service.id}`} className="grid gap-2 sm:grid-cols-[1fr_120px]">
                            <div className="text-sm text-gray-700">
                              <div className="font-medium text-gray-900">{service.label}</div>
                              <div className="text-xs text-gray-500">{service.categorie || 'Services client'} - {getServiceDisplayPrice(service)}</div>
                            </div>
                            <input
                              type="number"
                              min={0}
                              value={getVariableServiceDrafts(demand)[String(service.id)] ?? 0}
                              onChange={(event) => setServiceQuoteDrafts((prev) => ({
                                ...prev,
                                [demand.id]: {
                                  ...getVariableServiceDrafts(demand),
                                  [String(service.id)]: Number(event.target.value || 0),
                                },
                              }))}
                              className="rounded-lg border border-amber-200 px-3 py-2 text-sm"
                            />
                          </div>
                        ))}
                      </div>
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                        <p className="text-xs text-amber-800">
                          Statut devis: <span className="font-semibold">{demand.variable_services_quote_status || 'a_traiter'}</span>
                          {demand.variable_services_quote_total ? ` - ${demand.variable_services_quote_total} TND` : ''}
                        </p>
                        <button
                          type="button"
                          onClick={() => void saveVariableServicesQuote(demand)}
                          disabled={savingId === demand.id}
                          className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm font-medium text-amber-800 hover:bg-amber-50"
                        >
                          Enregistrer devis services
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : null}
              {(demand.identity_submitted_at || demand.identity_document_number) && (
                <div className="mt-2 text-xs text-gray-500">
                  Coordonnees client: <span className="font-medium text-gray-700">{demand.identity_document_type || '-'}</span> - numero <span className="font-medium text-gray-700">{demand.identity_document_number || '-'}</span> - soumis le <span className="font-medium text-gray-700">{demand.identity_submitted_at ? formatDateTime(demand.identity_submitted_at) : '-'}</span>
                </div>
              )}
              {(demand.payment_receipt_image_url || demand.payment_receipt_uploaded_at || demand.payment_receipt_note) && (
                <div className="mt-3 rounded-lg border border-sky-200 bg-sky-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">Recu de paiement client</p>
                  <p className="mt-1 text-xs text-gray-600">
                    Envoye le <span className="font-medium text-gray-800">{demand.payment_receipt_uploaded_at ? formatDateTime(demand.payment_receipt_uploaded_at) : '-'}</span>
                  </p>
                  {demand.payment_receipt_note ? (
                    <p className="mt-1 text-xs text-gray-700">Note client: <span className="font-medium">{demand.payment_receipt_note}</span></p>
                  ) : null}
                  {demand.payment_receipt_image_url ? (
                    <a
                      href={resolveAssetUrl(demand.payment_receipt_image_url)}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-flex items-center gap-2 rounded-lg border border-sky-300 bg-white px-3 py-2 text-xs font-medium text-sky-700 hover:bg-sky-100"
                    >
                      Ouvrir le recu
                    </a>
                  ) : null}
                </div>
              )}
                </>
              )}
            </div>
          )})}
        </div>
      </section>
      )}

      {activeView === 'chat' && (
        <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.08),_transparent_38%),linear-gradient(180deg,#f8fafc_0%,#ffffff_18%,#f8fafc_100%)] shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
          <div className="border-b border-slate-200 px-4 py-4 md:px-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-700">Messagerie proprietaires</p>
                <h2 className="mt-1 text-xl font-semibold text-slate-900">Espace de discussion admin</h2>
                <p className="mt-1 text-sm text-slate-500">Liste a gauche, conversation a droite, dossier proprietaire accessible a tout moment.</p>
              </div>
              <button
                type="button"
                onClick={() => selectedChatOwner ? void loadOwnerChat(selectedChatOwner.id) : undefined}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
              >
                <RefreshCw className="h-4 w-4" />
                Recharger
              </button>
            </div>
          </div>
          <div className="grid min-h-[720px] bg-white lg:h-[78vh] lg:grid-cols-[380px_minmax(0,1fr)]">
            <aside className={`${isChatMobileConversationOpen ? 'hidden' : 'flex'} min-h-0 border-r border-slate-200 bg-[linear-gradient(180deg,#fbfdff_0%,#f4f9f6_100%)] text-slate-900 lg:flex`}>
              <div className="flex w-full flex-col">
                <div className="border-b border-slate-200 px-4 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="text-2xl font-semibold text-slate-900">Chats</h3>
                      <p className="mt-1 text-sm text-slate-500">{filteredChatOwners.length} proprietaire{filteredChatOwners.length > 1 ? 's' : ''}</p>
                    </div>
                    <div className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">Admin</div>
                  </div>
                  <label className="mt-4 flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-500 shadow-sm">
                    <Search className="h-4 w-4 text-slate-400" />
                    <input
                      type="text"
                      value={chatOwnerSearch}
                      onChange={(event) => setChatOwnerSearch(event.target.value)}
                      placeholder="Rechercher un proprietaire ou une reference"
                      className="w-full bg-transparent text-slate-900 outline-none placeholder:text-slate-400"
                    />
                  </label>
                </div>
                <div className="flex-1 overflow-y-auto px-3 py-3">
                  {filteredChatOwners.length === 0 && (
                    <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-6 text-sm text-slate-500">
                      Aucun proprietaire ne correspond a la recherche.
                    </div>
                  )}
                  <div className="space-y-2">
                    {filteredChatOwners.map((owner) => {
                      const isActive = selectedChatOwner?.id === owner.id;
                      const ownerDemandCount = (ownerDemandsByOwnerId.get(owner.id) || []).length;
                      const latestDemand = (ownerDemandsByOwnerId.get(owner.id) || [])[0];
                      const unreadOwnerNotification = unreadOwnerNotificationByOwnerId.get(owner.id) || null;
                      const unreadOwnerNotificationCount = unreadOwnerNotificationCountByOwnerId.get(owner.id) || 0;
                      return (
                        <button
                          key={owner.id}
                          type="button"
                          onClick={() => {
                            if (selectedChatOwner?.id !== owner.id) {
                              setSelectedChatOwner(owner);
                              setChatDraft('');
                              setShowOwnerProfilePanel(false);
                              void loadOwnerChat(owner.id);
                            }
                          }}
                          className={`flex w-full items-start gap-3 rounded-2xl border px-3 py-3 text-left transition-all ${
                            isActive
                              ? 'border-emerald-400 bg-emerald-50 shadow-[0_0_0_1px_rgba(52,211,153,0.28),0_14px_30px_rgba(16,185,129,0.08)]'
                              : 'border-transparent bg-white hover:border-slate-200 hover:bg-slate-50 shadow-sm'
                          }`}
                        >
                          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-emerald-700 text-sm font-bold text-white shadow-lg">
                            {getOwnerInitials(owner.name)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-semibold text-slate-900">{owner.name}</p>
                                {unreadOwnerNotification ? (
                                  <span className="mt-1 inline-flex rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
                                    {unreadOwnerNotificationCount > 1 ? `${unreadOwnerNotificationCount} messages non lus` : 'Message non lu'}
                                  </span>
                                ) : null}
                              </div>
                              {latestDemand?.updated_at ? (
                                <span className="shrink-0 text-[11px] text-slate-400">{formatRelativeDelay(latestDemand.updated_at).replace(/^il y a /, '')}</span>
                              ) : null}
                            </div>
                            <p className={`mt-1 line-clamp-2 text-sm ${unreadOwnerNotification ? 'font-semibold text-slate-900' : 'text-slate-600'}`}>
                              {unreadOwnerNotification?.detailLabel || formatChatPreview(owner.id)}
                            </p>
                            <div className="mt-2 flex items-center gap-2 text-[11px] text-slate-400">
                              <span>{ownerDemandCount} reference{ownerDemandCount > 1 ? 's' : ''}</span>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </aside>
            <div className={`${isChatMobileConversationOpen ? 'flex' : 'hidden'} min-h-0 min-w-0 flex-col bg-white lg:flex`}>
              {!selectedChatOwner ? (
                <div className="flex flex-1 items-center justify-center px-6 py-16 text-center">
                  <div className="max-w-md">
                    <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                      <MessageSquareShare className="h-8 w-8" />
                    </div>
                    <h3 className="mt-5 text-xl font-semibold text-slate-900">Selectionnez un proprietaire</h3>
                    <p className="mt-2 text-sm text-slate-500">Ouvrez une conversation depuis la colonne de gauche pour commencer a discuter.</p>
                  </div>
                </div>
              ) : (
                <>
                  <div className="border-b border-slate-200 bg-white px-4 py-4 md:px-6">
                    <div className="flex flex-wrap items-center gap-3 sm:flex-nowrap">
                      <button
                        type="button"
                        onClick={() => setSelectedChatOwner(null)}
                        className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50 lg:hidden"
                      >
                        <ChevronLeft className="h-5 w-5" />
                      </button>
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-emerald-700 text-sm font-bold text-white shadow-md">
                        {getOwnerInitials(selectedChatOwner.name)}
                      </div>
                      <div className="min-w-0 flex-1 basis-[calc(100%-7rem)] sm:basis-auto">
                        <div className="flex min-w-0 items-center gap-2">
                          <h3 className="truncate text-base font-semibold text-slate-900 sm:text-lg">{selectedChatOwner.name}</h3>
                          <span className="hidden rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 md:inline-flex">Proprietaire</span>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-500 sm:gap-x-3 sm:text-xs">
                          {selectedOwnerProfile?.telephone ? <span>{selectedOwnerProfile.telephone}</span> : null}
                          {selectedOwnerLatestDemand?.updated_at ? <span>Derniere activite {formatRelativeDelay(selectedOwnerLatestDemand.updated_at)}</span> : null}
                          {unreadOwnerNotificationByOwnerId.has(selectedChatOwner.id) ? <span className="font-semibold text-emerald-700">Message non lu a traiter</span> : null}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowOwnerProfilePanel(true)}
                        className="ml-auto inline-flex shrink-0 items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 sm:ml-0"
                      >
                        <ExternalLink className="h-4 w-4" />
                        Ouvrir dossier
                      </button>
                    </div>
                  </div>
                   <div className="flex min-h-0 flex-1 flex-col bg-[linear-gradient(180deg,#f8fafc_0%,#eef2f7_100%)]">
                     <div ref={chatScrollRef} className="flex-1 overflow-y-auto px-4 py-5 md:px-6">
                       {selectedChatOwner && unreadOwnerNotificationByOwnerId.get(selectedChatOwner.id) && (
                         <div className="mx-auto mb-4 max-w-4xl rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 shadow-sm">
                           <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Message non lu</p>
                           <p className="mt-2 text-sm font-medium text-slate-900">
                             {unreadOwnerNotificationByOwnerId.get(selectedChatOwner.id)?.detailLabel}
                           </p>
                         </div>
                       )}
                       {chatLoading && (
                        <div className="rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 text-sm text-slate-500 shadow-sm">
                          Chargement de la conversation...
                        </div>
                      )}
                      {!chatLoading && chatMessages.length === 0 && (
                        <div className="mx-auto max-w-xl rounded-3xl border border-dashed border-slate-300 bg-white/80 px-6 py-10 text-center shadow-sm">
                          <UserCircle2 className="mx-auto h-10 w-10 text-slate-300" />
                          <p className="mt-4 text-base font-medium text-slate-800">Aucun message pour ce proprietaire.</p>
                          <p className="mt-2 text-sm text-slate-500">Envoyez un premier message pour demarrer la discussion.</p>
                        </div>
                      )}
                      {!chatLoading && chatMessages.length > 0 && (
                        <div className="mx-auto flex max-w-4xl flex-col gap-4">
                          {chatMessages.map((message) => {
                            const fromAdmin = message.kind === 'admin_owner_chat';
                            return (
                              <div key={message.id} className={`flex ${fromAdmin ? 'justify-end' : 'justify-start'}`}>
                                <div className={`flex max-w-[86%] flex-col ${fromAdmin ? 'items-end' : 'items-start'} sm:max-w-[72%]`}>
                                  {!fromAdmin && (
                                    <div className="mb-1 flex items-center gap-2 pl-1 text-xs font-medium text-slate-500">
                                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-200 text-[10px] font-bold text-slate-700">
                                        {getOwnerInitials(selectedChatOwner.name)}
                                      </span>
                                      {selectedChatOwner.name}
                                    </div>
                                  )}
                                  <div className={`rounded-[22px] px-4 py-3 text-sm shadow-sm ${fromAdmin ? 'bg-gradient-to-br from-emerald-600 to-emerald-700 text-white' : 'border border-slate-200 bg-white text-slate-800'}`}>
                                    <p className="whitespace-pre-wrap break-words">{message.text || '(message vide)'}</p>
                                  </div>
                                  <p className={`mt-1 px-1 text-[11px] ${fromAdmin ? 'text-slate-400' : 'text-slate-500'}`}>{formatDateTime(message.createdAt)}</p>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                    <div className="sticky bottom-0 border-t border-slate-200 bg-white/95 px-4 py-4 backdrop-blur md:px-6">
                      <div className="mx-auto flex max-w-4xl flex-col gap-3 sm:flex-row sm:items-end">
                        <div className="min-w-0 flex-1 rounded-[24px] border border-slate-300 bg-white shadow-[0_8px_25px_rgba(15,23,42,0.06)]">
                          <textarea
                            value={chatDraft}
                            onChange={(event) => setChatDraft(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter' && !event.shiftKey) {
                                event.preventDefault();
                                if (!chatSending && chatDraft.trim()) {
                                  void sendChatMessage();
                                }
                              }
                            }}
                            placeholder="Ecrire un message au proprietaire..."
                            rows={1}
                            className="max-h-36 min-h-[54px] w-full resize-y rounded-[24px] border-0 bg-transparent px-4 py-4 text-sm text-slate-900 outline-none placeholder:text-slate-400"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => void sendChatMessage()}
                          disabled={chatSending || !chatDraft.trim()}
                          className="inline-flex h-14 w-full items-center justify-center gap-2 rounded-full bg-emerald-600 px-5 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(5,150,105,0.25)] transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                        >
                          <SendHorizontal className="h-4 w-4" />
                          {chatSending ? 'Envoi...' : 'Envoyer'}
                        </button>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
          {showOwnerProfilePanel && selectedChatOwner && (
            <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/40 backdrop-blur-[2px]">
              <button
                type="button"
                aria-label="Fermer dossier proprietaire"
                className="absolute inset-0 cursor-default"
                onClick={() => setShowOwnerProfilePanel(false)}
              />
              <div className="relative h-full w-full max-w-xl overflow-y-auto border-l border-slate-200 bg-white shadow-[0_20px_60px_rgba(15,23,42,0.28)]">
                <div className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-5 py-4 backdrop-blur">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700">Dossier proprietaire</p>
                      <h3 className="mt-1 text-xl font-semibold text-slate-900">{selectedChatOwner.name}</h3>
                      <p className="mt-1 text-sm text-slate-500">Identite, contact, demandes et references rattachees.</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowOwnerProfilePanel(false)}
                      className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50"
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                </div>
                <div className="space-y-5 px-5 py-5">
                  <div className="rounded-3xl border border-emerald-100 bg-[linear-gradient(135deg,#ecfdf5_0%,#ffffff_62%)] p-5">
                    <div className="flex items-center gap-4">
                      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-emerald-700 text-lg font-bold text-white shadow-lg">
                        {getOwnerInitials(selectedChatOwner.name)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-lg font-semibold text-slate-900">{selectedChatOwner.name}</p>
                        {selectedOwnerLatestDemand?.updated_at ? <p className="mt-1 text-xs font-medium text-emerald-700">Derniere activite {formatRelativeDelay(selectedOwnerLatestDemand.updated_at)}</p> : null}
                      </div>
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Telephone</p>
                      <p className="mt-2 text-sm font-medium text-slate-900">{selectedOwnerProfile?.telephone || '-'}</p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Email</p>
                      <p className="mt-2 break-all text-sm font-medium text-slate-900">{selectedOwnerProfile?.email || '-'}</p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">CIN</p>
                      <p className="mt-2 text-sm font-medium text-slate-900">{selectedOwnerProfile?.cin || '-'}</p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Demandes</p>
                      <p className="mt-2 text-sm font-medium text-slate-900">{selectedOwnerDemands.length}</p>
                    </div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div>
                        <h4 className="text-base font-semibold text-slate-900">QR proprietaire</h4>
                        <p className="mt-1 text-sm text-slate-500">Code rapide lie au dossier de ce proprietaire.</p>
                      </div>
                      <div className="rounded-2xl border border-emerald-100 bg-[linear-gradient(135deg,#ecfdf5_0%,#ffffff_72%)] p-3">
                        <img
                          src={getOwnerQrCodeUrl(selectedChatOwner.id, 160)}
                          alt={`QR ${selectedChatOwner.name}`}
                          className="h-32 w-32 rounded-xl border border-emerald-200 bg-white object-contain p-2"
                        />
                      </div>
                    </div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <h4 className="text-base font-semibold text-slate-900">References rattachees</h4>
                        <p className="mt-1 text-sm text-slate-500">Toutes les references vues dans les demandes de ce proprietaire.</p>
                      </div>
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">{selectedOwnerReferences.length}</span>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {selectedOwnerReferences.length === 0 && <p className="text-sm text-slate-500">Aucune reference disponible.</p>}
                      {selectedOwnerReferences.map((reference) => (
                        <span key={`owner-reference-${selectedChatOwner.id}-${reference}`} className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800">
                          {reference}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <h4 className="text-base font-semibold text-slate-900">Biens du proprietaire</h4>
                        <p className="mt-1 text-sm text-slate-500">Cartes visuelles avec defilement horizontal si plusieurs biens sont rattaches.</p>
                      </div>
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">{selectedOwnerBiens.length}</span>
                    </div>
                    {selectedOwnerBiens.length === 0 ? (
                      <p className="mt-4 text-sm text-slate-500">Aucun bien lie a ce proprietaire.</p>
                    ) : (
                      <div className="mt-4 flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2">
                        {selectedOwnerBiens.map((bien) => (
                          <button
                            key={`owner-bien-card-${bien.id}`}
                            type="button"
                            onClick={() => setSelectedOwnerBienCalendarId((current) => current === String(bien.id) ? null : String(bien.id))}
                            className={`w-[280px] shrink-0 snap-start overflow-hidden rounded-[24px] border bg-white text-left shadow-[0_16px_34px_rgba(15,23,42,0.08)] transition-all ${
                              selectedOwnerBienCalendarId === String(bien.id)
                                ? 'border-emerald-300 ring-2 ring-emerald-200'
                                : 'border-slate-200 hover:border-emerald-200'
                            }`}
                          >
                            <div className="relative h-40 overflow-hidden">
                              <img src={getBienCoverImage(bien)} alt={bien.titre} className="h-full w-full object-cover" />
                              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950/60 via-slate-950/20 to-transparent p-4">
                                <span className="inline-flex rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-semibold text-slate-800">
                                  {bien.reference || 'Reference disponible'}
                                </span>
                              </div>
                            </div>
                            <div className="space-y-3 p-4">
                              <div>
                                <h5 className="line-clamp-2 text-sm font-semibold text-slate-900">{bien.titre || 'Bien'}</h5>
                                {String(bien.nom_bien_mobile || '').trim() ? (
                                  <p className="mt-1 text-xs font-medium text-emerald-700">Nom dans l'application: {String(bien.nom_bien_mobile).trim()}</p>
                                ) : null}
                                <p className="mt-1 text-xs text-slate-500">{bien.type || 'Bien immobilier'}</p>
                              </div>
                              <div className="flex flex-wrap gap-2 text-[11px] text-slate-600">
                                {bien.nb_chambres > 0 ? <span className="rounded-full bg-slate-100 px-2.5 py-1">{bien.nb_chambres} ch</span> : null}
                                {bien.nb_salle_bain > 0 ? <span className="rounded-full bg-slate-100 px-2.5 py-1">{bien.nb_salle_bain} sdb</span> : null}
                                {bien.prix_nuitee > 0 ? <span className="rounded-full bg-emerald-50 px-2.5 py-1 font-semibold text-emerald-700">{bien.prix_nuitee} DT / nuit</span> : null}
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                    {selectedOwnerBienForCalendar ? (
                      <div ref={ownerBienCalendarRef} className="mt-4 rounded-3xl border border-emerald-200 bg-emerald-50/30 p-4">
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <div>
                            <h5 className="text-base font-semibold text-slate-900">Calendrier du bien</h5>
                            <p className="mt-1 text-sm text-slate-500">
                              {selectedOwnerBienForCalendar.titre || 'Bien'}
                              {String(selectedOwnerBienForCalendar.reference || '').trim() ? ` • ${String(selectedOwnerBienForCalendar.reference).trim()}` : ''}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setSelectedOwnerBienCalendarId(null)}
                            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
                          >
                            Fermer calendrier
                          </button>
                        </div>
                        <AvailabilityCalendar
                          unavailableDates={getBienCalendarDates(selectedOwnerBienForCalendar)}
                          onDateRangeSelect={() => {}}
                          selectedStart={null}
                          selectedEnd={null}
                        />
                      </div>
                    ) : null}
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <h4 className="text-base font-semibold text-slate-900">Demandes associees</h4>
                    <p className="mt-1 text-sm text-slate-500">Resume des dossiers relies a cette conversation.</p>
                    <div className="mt-4 space-y-3">
                      {selectedOwnerDemands.length === 0 && <p className="text-sm text-slate-500">Aucune demande associee.</p>}
                      {selectedOwnerDemands.map((demand) => {
                        const displayStatus = resolveDisplayStatus(demand);
                        return (
                          <div key={`owner-demand-summary-${demand.id}`} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div>
                                <p className="text-sm font-semibold text-slate-900">
                                  {demand.bien_titre || 'Bien'}
                                  {String(demand.bien_reference || '').trim() ? ` • ${String(demand.bien_reference).trim()}` : ''}
                                </p>
                                <p className="mt-1 text-xs text-slate-500">Sejour: Arrivee {formatStayDate(demand.start_date)} - Depart {formatStayDate(demand.end_date)}</p>
                              </div>
                              <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${statusToneClasses[displayStatus] || 'border-slate-200 bg-slate-100 text-slate-700'}`}>
                                {statusLabels[displayStatus] || displayStatus}
                              </span>
                            </div>
                            <div className="mt-3 grid gap-2 text-xs text-slate-600 sm:grid-cols-2">
                              <div>Notif proprietaire: <span className="font-semibold text-slate-800">{demand.owner_notified_at ? formatDateTime(demand.owner_notified_at) : 'Non envoyee'}</span></div>
                              <div>Reponse proprietaire: <span className="font-semibold text-slate-800">{demand.owner_response_at ? formatDateTime(demand.owner_response_at) : 'Pas encore'}</span></div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      {activeView === 'calendars' && (
        <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.08),_transparent_38%),linear-gradient(180deg,#f8fafc_0%,#ffffff_18%,#f8fafc_100%)] shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
          <div className="border-b border-slate-200 px-4 py-4 md:px-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-700">Calendriers proprietaires</p>
                <h2 className="mt-1 text-xl font-semibold text-slate-900">Centre de suivi calendrier</h2>
                <p className="mt-1 text-sm text-slate-500">Liste a gauche, suivi de relance et demandes de mise a jour a droite.</p>
              </div>
              <button
                type="button"
                onClick={() => void fetchData({ background: true })}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
              >
                <RefreshCw className="h-4 w-4" />
                Recharger
              </button>
            </div>
          </div>
          <div className="grid min-h-[720px] bg-white lg:h-[78vh] lg:grid-cols-[460px_minmax(0,1fr)] xl:grid-cols-[500px_minmax(0,1fr)]">
            <aside className={`${isCalendarMobileConversationOpen ? 'hidden' : 'flex'} min-h-0 border-r border-slate-200 bg-[linear-gradient(180deg,#fbfdff_0%,#f4f9f6_100%)] text-slate-900 lg:flex`}>
              <div className="flex w-full flex-col">
                <div className="border-b border-slate-200 px-5 py-5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="text-2xl font-semibold text-slate-900">Calendriers</h3>
                      <p className="mt-1 text-sm text-slate-500">{filteredCalendarOwners.length} proprietaire{filteredCalendarOwners.length > 1 ? 's' : ''}</p>
                    </div>
                    <div className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">Suivi</div>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-2 xl:grid-cols-4">
                    <div className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-3">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-rose-700">En retard</p>
                      <p className="mt-1 text-lg font-bold text-rose-900">{overdueCalendarOwners.length}</p>
                    </div>
                    <div className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-3">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">En attente</p>
                      <p className="mt-1 text-lg font-bold text-amber-900">{pendingCalendarOwnersCount}</p>
                    </div>
                    <div className="rounded-2xl border border-sky-200 bg-sky-50 px-3 py-3">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-sky-700">MAJ calendrier en attente</p>
                      <p className="mt-1 text-lg font-bold text-sky-900">{pendingCalendarUpdateOwnersCount}</p>
                    </div>
                    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-3">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">A jour</p>
                      <p className="mt-1 text-lg font-bold text-emerald-900">{upToDateCalendarOwnersCount}</p>
                    </div>
                  </div>
                  <label className="mt-4 flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-500 shadow-sm">
                    <Search className="h-4 w-4 text-slate-400" />
                    <input
                      type="text"
                      value={calendarOwnerSearch}
                      onChange={(event) => setCalendarOwnerSearch(event.target.value)}
                      placeholder="Rechercher un proprietaire ou un bien"
                      className="w-full bg-transparent text-slate-900 outline-none placeholder:text-slate-400"
                    />
                  </label>
                </div>
                <div className="flex-1 overflow-y-auto px-4 py-4">
                  {filteredCalendarOwners.length === 0 && (
                    <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-6 text-sm text-slate-500">
                      Aucun proprietaire ne correspond a la recherche.
                    </div>
                  )}
                  <div className="space-y-4">
                    {overdueCalendarOwners.length > 0 && (
                      <div>
                        <div className="mb-2 flex items-center justify-between gap-3 px-1">
                          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-rose-700">Proprietaires en retard</p>
                          <span className="rounded-full bg-rose-100 px-2.5 py-1 text-[11px] font-semibold text-rose-700">{overdueCalendarOwners.length}</span>
                        </div>
                        <div className="space-y-2">
                          {overdueCalendarOwners.map((owner) => {
                            const isActive = selectedCalendarOwner?.id === owner.id;
                            const status = ownerCalendarStatuses[owner.id] || null;
                            const statusMeta = getOwnerCalendarStatusMeta(status, calendarNowMs);
                            const pendingRequest = pendingCalendarRequestByOwner.get(owner.id) || null;
                            const historyCount = (calendarRequestHistoryByOwner.get(owner.id) || []).length;
                            return (
                              <button
                                key={`calendar-owner-overdue-${owner.id}`}
                                type="button"
                                onClick={() => setSelectedCalendarOwner(owner)}
                              className={`flex w-full items-start gap-4 rounded-[26px] border px-4 py-4 text-left transition-all ${
                                  isActive
                                    ? 'border-rose-400 bg-rose-50 shadow-[0_0_0_1px_rgba(251,113,133,0.28),0_14px_30px_rgba(244,63,94,0.08)]'
                                    : 'border-rose-200 bg-white hover:bg-rose-50 shadow-sm'
                                }`}
                              >
                                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-rose-400 to-rose-700 text-sm font-bold text-white shadow-lg">
                                  {getOwnerInitials(owner.name)}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                      <p className="truncate text-sm font-semibold text-slate-900">{owner.name}</p>
                                      <span className="mt-1 inline-flex rounded-full bg-rose-100 px-2.5 py-1 text-[11px] font-semibold text-rose-700">
                                        {statusMeta.label}
                                      </span>
                                    </div>
                                    <span className="shrink-0 text-[11px] font-semibold text-rose-600">
                                      {statusMeta.waitingDurationLabel}
                                    </span>
                                  </div>
                                  <p className="mt-2 line-clamp-2 text-sm font-semibold text-slate-900">
                                    {pendingRequest
                                      ? `${pendingRequest.propertyTitle || 'Bien'} - ${pendingRequest.requestType === 'open' ? 'Reouverture demandee' : 'Fermeture demandee'}`
                                      : statusMeta.detail}
                                  </p>
                                  <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-rose-600">
                                    <span>Sans reponse depuis {statusMeta.waitingDurationLabel}</span>
                                    <span>{historyCount} historique</span>
                                  </div>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    <div>
                      <div className="mb-2 flex items-center justify-between gap-3 px-1">
                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Autres proprietaires</p>
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">{nonOverdueCalendarOwners.length}</span>
                      </div>
                      <div className="space-y-2">
                    {nonOverdueCalendarOwners.map((owner) => {
                      const isActive = selectedCalendarOwner?.id === owner.id;
                      const status = ownerCalendarStatuses[owner.id] || null;
                      const statusMeta = getOwnerCalendarStatusMeta(status, calendarNowMs);
                      const pendingRequest = pendingCalendarRequestByOwner.get(owner.id) || null;
                      const historyCount = (calendarRequestHistoryByOwner.get(owner.id) || []).length;
                      return (
                        <button
                          key={`calendar-owner-${owner.id}`}
                          type="button"
                          onClick={() => setSelectedCalendarOwner(owner)}
                          className={`flex w-full items-start gap-4 rounded-[26px] border px-4 py-4 text-left transition-all ${
                            isActive
                              ? 'border-emerald-400 bg-emerald-50 shadow-[0_0_0_1px_rgba(52,211,153,0.28),0_14px_30px_rgba(16,185,129,0.08)]'
                              : 'border-transparent bg-white hover:border-slate-200 hover:bg-slate-50 shadow-sm'
                          }`}
                        >
                          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-emerald-700 text-sm font-bold text-white shadow-lg">
                            {getOwnerInitials(owner.name)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-semibold text-slate-900">{owner.name}</p>
                                {pendingRequest ? (
                                  <span className="mt-1 inline-flex rounded-full bg-sky-100 px-2.5 py-1 text-[11px] font-semibold text-sky-800">
                                    MAJ calendrier en attente
                                  </span>
                                ) : (
                                  <span className={`mt-1 inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${statusMeta.tone}`}>
                                    {statusMeta.label}
                                  </span>
                                )}
                              </div>
                              {(status?.updatedAt || status?.createdAt) ? (
                                <span className="shrink-0 text-[11px] text-slate-400">
                                  {formatRelativeDelay(status?.updatedAt || status?.createdAt).replace(/^il y a /, '')}
                                </span>
                              ) : null}
                            </div>
                            <p className={`mt-2 line-clamp-2 text-sm ${pendingRequest ? 'font-semibold text-slate-900' : 'text-slate-600'}`}>
                              {pendingRequest
                                ? `${pendingRequest.propertyTitle || 'Bien'} - ${pendingRequest.requestType === 'open' ? 'Reouverture demandee' : 'Fermeture demandee'}`
                                : statusMeta.detail}
                            </p>
                            <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                              {statusMeta.waitingDurationLabel ? <span>Sans reponse {statusMeta.waitingDurationLabel}</span> : null}
                              <span>{historyCount} historique</span>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </aside>
            <div className={`${isCalendarMobileConversationOpen ? 'flex' : 'hidden'} min-h-0 min-w-0 flex-col bg-white lg:flex`}>
              {!selectedCalendarOwner ? (
                <div className="flex flex-1 items-center justify-center px-6 py-16 text-center">
                  <div className="max-w-md">
                    <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                      <CalendarDays className="h-8 w-8" />
                    </div>
                    <h3 className="mt-5 text-xl font-semibold text-slate-900">Selectionnez un proprietaire</h3>
                    <p className="mt-2 text-sm text-slate-500">Ouvrez un dossier calendrier depuis la colonne de gauche pour suivre ses relances et demandes.</p>
                  </div>
                </div>
              ) : (
                <>
                  <div className="border-b border-slate-200 bg-white px-4 py-4 md:px-6">
                      <div className="flex flex-wrap items-center gap-3 sm:flex-nowrap">
                      <button
                        type="button"
                        onClick={() => setSelectedCalendarOwner(null)}
                        className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50 lg:hidden"
                      >
                        <ChevronLeft className="h-5 w-5" />
                      </button>
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-emerald-700 text-sm font-bold text-white shadow-md">
                        {getOwnerInitials(selectedCalendarOwner.name)}
                      </div>
                      <div className="min-w-0 flex-1 basis-[calc(100%-7rem)] sm:basis-auto">
                        <div className="flex min-w-0 items-center gap-2">
                          <h3 className="truncate text-base font-semibold text-slate-900 sm:text-lg">{selectedCalendarOwner.name}</h3>
                          <span className="hidden rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 md:inline-flex">Calendrier</span>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-500 sm:gap-x-3 sm:text-xs">
                          {selectedCalendarOwnerProfile?.telephone ? <span>{selectedCalendarOwnerProfile.telephone}</span> : null}
                          <span className={`inline-flex rounded-full border px-2 py-0.5 font-semibold ${selectedCalendarStatusMeta.tone}`}>
                            {selectedCalendarStatusMeta.label}
                          </span>
                          {selectedCalendarStatusMeta.respondedAt ? <span>Reponse {formatRelativeDelay(selectedCalendarStatusMeta.respondedAt)}</span> : null}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => void dispatchCalendarPromptToOwner(selectedCalendarOwner)}
                        disabled={dispatchingCalendarPromptOwnerId === selectedCalendarOwner.id}
                        className="ml-auto inline-flex shrink-0 items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800 transition-colors hover:bg-amber-100 disabled:opacity-60 sm:ml-0"
                      >
                        <SendHorizontal className="h-4 w-4" />
                        {dispatchingCalendarPromptOwnerId === selectedCalendarOwner.id ? 'Envoi...' : 'Relancer'}
                      </button>
                    </div>
                  </div>
                  <div className="flex min-h-0 flex-1 flex-col bg-[linear-gradient(180deg,#f8fafc_0%,#eef8f3_100%)]">
                    <div className="flex-1 overflow-y-auto px-4 py-5 md:px-6">
                      <div className="mx-auto flex max-w-6xl flex-col gap-4">
                        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(340px,0.85fr)]">
                          <div className="space-y-4">
                            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                              <div className="flex flex-wrap items-start justify-between gap-3">
                                <div>
                                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700">Etat proprietaire</p>
                                  <h4 className="mt-1 text-lg font-semibold text-slate-900">{selectedCalendarStatusMeta.label}</h4>
                                  <p className="mt-1 text-sm text-slate-500">{selectedCalendarStatusMeta.detail}</p>
                                </div>
                                <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${selectedCalendarStatusMeta.tone}`}>
                                  {selectedCalendarStatusMeta.label}
                                </span>
                              </div>
                              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Derniere relance</p>
                                  <p className="mt-2 text-sm font-semibold text-slate-900">{selectedCalendarStatusMeta.sentAt ? formatDateTime(selectedCalendarStatusMeta.sentAt) : 'Aucune'}</p>
                                </div>
                                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Reponse proprietaire</p>
                                  <p className="mt-2 text-sm font-semibold text-slate-900">{selectedCalendarStatusMeta.respondedAt ? formatDateTime(selectedCalendarStatusMeta.respondedAt) : 'Pas encore'}</p>
                                </div>
                                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Synthese</p>
                                  <p className="mt-2 text-sm font-semibold text-slate-900">{selectedCalendarStatusMeta.helper || 'Aucune action detaillee'}</p>
                                </div>
                                <div className={`rounded-2xl border p-4 ${selectedCalendarStatusMeta.isOverdue ? 'border-rose-200 bg-rose-50' : 'border-slate-200 bg-slate-50'}`}>
                                  <p className={`text-xs font-semibold uppercase tracking-wide ${selectedCalendarStatusMeta.isOverdue ? 'text-rose-600' : 'text-slate-500'}`}>Temps sans reponse</p>
                                  <p className={`mt-2 text-sm font-semibold ${selectedCalendarStatusMeta.isOverdue ? 'text-rose-700' : 'text-slate-900'}`}>
                                    {selectedCalendarStatusMeta.waitingDurationLabel || 'Aucun retard en cours'}
                                  </p>
                                </div>
                              </div>
                              {selectedCalendarPendingRequest ? (
                                <div className="mt-4 rounded-2xl border border-sky-200 bg-sky-50 p-4">
                                  <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div>
                                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">Demande en attente</p>
                                      <h5 className="mt-1 text-base font-semibold text-slate-900">{selectedCalendarPendingRequest.propertyTitle || 'Bien sans titre'}</h5>
                                      <p className="mt-2 text-sm text-slate-600">
                                        {selectedCalendarPendingRequest.requestType === 'open' ? 'Reouverture demandee' : 'Fermeture demandee'} pour la periode du {formatStayDate(selectedCalendarPendingRequest.startDate)} au {formatStayDate(selectedCalendarPendingRequest.endDate)}.
                                      </p>
                                      <p className="mt-1 text-xs text-slate-500">Envoyee le {formatDateTime(selectedCalendarPendingRequest.submittedAt || selectedCalendarPendingRequest.startDate)}</p>
                                      {selectedCalendarPendingRequest.note ? <p className="mt-2 text-sm text-slate-700">Note: {selectedCalendarPendingRequest.note}</p> : null}
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => void openCalendarDiff(selectedCalendarPendingRequest)}
                                      disabled={calendarActionLoadingId === selectedCalendarPendingRequest.id}
                                      className="rounded-xl border border-sky-300 bg-white px-3 py-2 text-sm font-medium text-sky-800 hover:bg-sky-50"
                                    >
                                      Consulter la difference
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm text-slate-500">
                                  Aucune demande de mise a jour calendrier en attente pour ce proprietaire.
                                </div>
                              )}
                            </div>

                            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                              <div className="flex items-center justify-between gap-3">
                                <div>
                                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Historique</p>
                                  <h4 className="mt-1 text-lg font-semibold text-slate-900">Demandes de mise a jour traitees</h4>
                                </div>
                                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                                  {selectedCalendarHistory.length} element{selectedCalendarHistory.length > 1 ? 's' : ''}
                                </span>
                              </div>
                              <div className="mt-4 space-y-3">
                                {selectedCalendarHistory.length === 0 && (
                                  <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm text-slate-500">
                                    Aucune demande calendrier traitee pour ce proprietaire.
                                  </div>
                                )}
                                {selectedCalendarHistory.map((request) => (
                                  <div key={`calendar-history-${request.id}`} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                    <div className="flex flex-wrap items-start justify-between gap-3">
                                      <div>
                                        <h5 className="text-sm font-semibold text-slate-900">{request.propertyTitle || 'Bien sans titre'}</h5>
                                        <p className="mt-1 text-xs text-slate-500">
                                          {request.requestType === 'open' ? 'Reouverture' : 'Fermeture'} du {formatStayDate(request.startDate)} au {formatStayDate(request.endDate)}
                                        </p>
                                        <p className="mt-2 text-xs text-slate-500">Soumise le {formatDateTime(request.submittedAt || request.startDate)}</p>
                                        <p className="mt-1 text-xs text-slate-500">Traitee le {request.reviewedAt ? formatDateTime(request.reviewedAt) : '-'}</p>
                                        {request.reason ? <p className="mt-2 text-xs font-medium text-rose-600">Motif: {request.reason}</p> : null}
                                      </div>
                                      <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${request.status === 'approved' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-rose-200 bg-rose-50 text-rose-700'}`}>
                                        {request.status === 'approved' ? 'Approuvee' : 'Rejetee'}
                                      </span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>

                          <div className="space-y-4">
                            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                              <div className="flex items-center justify-between gap-3">
                                <div>
                                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Portefeuille biens</p>
                                  <h4 className="mt-1 text-lg font-semibold text-slate-900">Biens rattaches au calendrier</h4>
                                </div>
                                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">{selectedCalendarBiens.length}</span>
                              </div>
                              {selectedCalendarBiens.length === 0 ? (
                                <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm text-slate-500">
                                  Aucun bien relie a ce proprietaire.
                                </div>
                              ) : (
                                <div className="mt-4 flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2">
                                  {selectedCalendarBiens.map((bien) => (
                                    <button
                                      key={`calendar-owner-bien-${bien.id}`}
                                      type="button"
                                      onClick={() => setSelectedCalendarBienCalendarId((current) => current === String(bien.id) ? null : String(bien.id))}
                                      className={`w-[280px] shrink-0 snap-start overflow-hidden rounded-[24px] border bg-white text-left shadow-[0_16px_34px_rgba(15,23,42,0.08)] transition-all ${
                                        selectedCalendarBienCalendarId === String(bien.id)
                                          ? 'border-emerald-300 ring-2 ring-emerald-200'
                                          : 'border-slate-200 hover:border-emerald-200'
                                      }`}
                                    >
                                      <div className="relative h-40 overflow-hidden">
                                        <img src={getBienCoverImage(bien)} alt={bien.titre} className="h-full w-full object-cover" />
                                        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950/60 via-slate-950/20 to-transparent p-4">
                                          <span className="inline-flex rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-semibold text-slate-800">
                                            {bien.reference || 'Bien'}
                                          </span>
                                        </div>
                                      </div>
                                      <div className="space-y-3 p-4">
                                        <div>
                                          <h5 className="line-clamp-2 text-sm font-semibold text-slate-900">
                                            {[String(bien.reference || '').trim(), String(bien.nom_bien_mobile || bien.titre || '').trim()]
                                              .filter(Boolean)
                                              .join(' - ') || 'Bien'}
                                          </h5>
                                          <p className="mt-1 text-xs text-slate-500">{bien.type || 'Bien immobilier'}</p>
                                        </div>
                                        <div className="flex flex-wrap gap-2 text-[11px] text-slate-600">
                                          {bien.prix_nuitee > 0 ? <span className="rounded-full bg-emerald-50 px-2.5 py-1 font-semibold text-emerald-700">{bien.prix_nuitee} DT / nuit</span> : null}
                                          {bien.prix_semaine > 0 ? <span className="rounded-full bg-slate-100 px-2.5 py-1">{bien.prix_semaine} DT / semaine</span> : null}
                                        </div>
                                      </div>
                                    </button>
                                  ))}
                                </div>
                              )}
                              {selectedCalendarBienForCalendar ? (
                                <div ref={calendarBienCalendarRef} className="mt-4 rounded-3xl border border-emerald-200 bg-emerald-50/30 p-4">
                                  <div className="mb-3 flex items-center justify-between gap-3">
                                    <div>
                                      <h5 className="text-base font-semibold text-slate-900">Calendrier du bien</h5>
                                      <p className="mt-1 text-sm text-slate-500">
                                        {selectedCalendarBienForCalendar.titre || 'Bien'}
                                        {String(selectedCalendarBienForCalendar.reference || '').trim() ? ` • ${String(selectedCalendarBienForCalendar.reference).trim()}` : ''}
                                      </p>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => setSelectedCalendarBienCalendarId(null)}
                                      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
                                    >
                                      Fermer calendrier
                                    </button>
                                  </div>
                                  <AvailabilityCalendar
                                    unavailableDates={getBienCalendarDates(selectedCalendarBienForCalendar)}
                                    onDateRangeSelect={() => {}}
                                    selectedStart={null}
                                    selectedEnd={null}
                                  />
                                </div>
                              ) : null}
                            </div>

                            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                              <div className="flex items-center justify-between gap-3">
                                <div>
                                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Vue globale</p>
                                  <h4 className="mt-1 text-lg font-semibold text-slate-900">Toutes les demandes calendrier</h4>
                                </div>
                                <div className="flex gap-2 text-sm">
                                  <span className="rounded-full bg-amber-100 px-3 py-1 font-semibold text-amber-800">En attente {pendingCalendarRequests.length}</span>
                                  <span className="rounded-full bg-slate-100 px-3 py-1 font-semibold text-slate-700">Historique {calendarRequestHistory.length}</span>
                                </div>
                              </div>
                              <div className="mt-4 space-y-3">
                                {pendingCalendarRequests.slice(0, 4).map((request) => (
                                  <div key={`calendar-global-pending-${request.id}`} className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
                                    <div className="flex flex-wrap items-start justify-between gap-3">
                                      <div>
                                        <p className="text-sm font-semibold text-slate-900">{request.ownerName}</p>
                                        <p className="mt-1 text-xs text-slate-500">{request.propertyTitle || 'Bien sans titre'}</p>
                                        <p className="mt-2 text-xs text-slate-600">
                                          {request.requestType === 'open' ? 'Reouverture demandee' : 'Fermeture demandee'} du {formatStayDate(request.startDate)} au {formatStayDate(request.endDate)}
                                        </p>
                                      </div>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setSelectedCalendarOwner({ id: request.ownerId, name: request.ownerName });
                                        }}
                                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                                      >
                                        Voir dossier
                                      </button>
                                    </div>
                                  </div>
                                ))}
                                {pendingCalendarRequests.length === 0 && (
                                  <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm text-slate-500">
                                    Aucune demande calendrier en attente pour le moment.
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </section>
      )}

      {activeView === 'system' && (
      <section className="rounded-2xl border border-gray-200 bg-white p-4 md:p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              <h2 className="text-lg font-semibold text-gray-900">Notifications systeme</h2>
              {unreadNotificationsCount > 0 && (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                  {unreadNotificationsCount} non lue(s)
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-gray-500">Tri par categorie et par degre d importance pour rendre la lecture immediate.</p>
          </div>
          <button
            type="button"
            onClick={() => {
              setNotificationCategoryFilter('all');
              setNotificationImportanceFilter('all');
              setShowUrgentNotificationsOnly(false);
            }}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
          >
            <Filter className="h-4 w-4" />
            Reinitialiser les filtres
          </button>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <button
            type="button"
            onClick={() => {
              setShowUrgentNotificationsOnly(true);
              setNotificationImportanceFilter('all');
            }}
            className={`rounded-2xl border p-4 text-left transition-colors ${showUrgentNotificationsOnly ? 'border-rose-300 bg-rose-50' : 'border-rose-200 bg-white hover:bg-rose-50'}`}
          >
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-rose-700">Urgent admin</p>
              <AlertTriangle className="h-4 w-4 text-rose-600" />
            </div>
            <p className="mt-2 text-2xl font-bold text-rose-900">{urgentNotificationCount}</p>
            <p className="mt-1 text-sm text-rose-700">Cas critiques a traiter rapidement.</p>
          </button>
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Modere</p>
            <p className="mt-2 text-2xl font-bold text-amber-900">{notificationImportanceCounters.modere}</p>
            <p className="mt-1 text-sm text-amber-700">Suivis et validations a surveiller.</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Normal</p>
            <p className="mt-2 text-2xl font-bold text-slate-900">{notificationImportanceCounters.normal}</p>
            <p className="mt-1 text-sm text-slate-600">Informations et traces de traitement.</p>
          </div>
        </div>

        <div className="mt-4 grid gap-3 xl:grid-cols-[1.4fr,1fr]">
          <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setSystemNotificationTab('active')}
                className={`rounded-full px-3 py-2 text-sm font-medium transition-colors ${
                  systemNotificationTab === 'active'
                    ? 'bg-emerald-600 text-white'
                    : 'border border-gray-200 bg-white text-gray-700 hover:bg-gray-100'
                }`}
              >
                Notifications actives ({unreadNotificationsCount})
              </button>
              <button
                type="button"
                onClick={() => setSystemNotificationTab('archive')}
                className={`rounded-full px-3 py-2 text-sm font-medium transition-colors ${
                  systemNotificationTab === 'archive'
                    ? 'bg-slate-900 text-white'
                    : 'border border-gray-200 bg-white text-gray-700 hover:bg-gray-100'
                }`}
              >
                Archive notifications ({archivedNotificationsCount})
              </button>
            </div>
            <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-gray-600">Categories</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {([
                ['all', 'Toutes'],
                ['dossier', `Dossier client (${notificationCategoryCounters.dossier})`],
                ['proprietaire', `Proprietaire (${notificationCategoryCounters.proprietaire})`],
                ['calendrier', `Calendrier (${notificationCategoryCounters.calendrier})`],
                ['systeme', `Systeme (${notificationCategoryCounters.systeme})`],
              ] as const).map(([value, label]) => (
                <button
                  key={`notif-category-filter-${value}`}
                  type="button"
                  onClick={() => setNotificationCategoryFilter(value)}
                  className={`rounded-full px-3 py-2 text-sm font-medium transition-colors ${
                    notificationCategoryFilter === value
                      ? 'bg-emerald-600 text-white'
                      : 'border border-gray-200 bg-white text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-600">Importance</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {([
                ['all', 'Toutes'],
                ['urgent', `Urgent (${notificationImportanceCounters.urgent})`],
                ['modere', `Modere (${notificationImportanceCounters.modere})`],
                ['normal', `Normal (${notificationImportanceCounters.normal})`],
              ] as const).map(([value, label]) => (
                <button
                  key={`notif-importance-filter-${value}`}
                  type="button"
                  onClick={() => {
                    setNotificationImportanceFilter(value);
                    if (value !== 'all') setShowUrgentNotificationsOnly(false);
                  }}
                  className={`rounded-full px-3 py-2 text-sm font-medium transition-colors ${
                    notificationImportanceFilter === value
                      ? 'bg-slate-900 text-white'
                      : 'border border-gray-200 bg-white text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-5 space-y-4">
          {filteredNotificationInsights.length === 0 && (
            <p className="text-sm text-gray-500">
              {systemNotificationTab === 'archive'
                ? 'Aucune notification archivee pour ces filtres.'
                : 'Aucune notification active pour ces filtres.'}
            </p>
          )}
          <div className="space-y-3">
            {sortedNotificationInsights.map(({ notification, category, title: categoryTitle, demand, bien, clientName, sourceLabel, paymentMethodLabel, modeLabel, primaryLabel, secondaryLabel, detailLabel, importance }) => {
              const hasReceipt = Boolean(String(demand?.payment_receipt_image_url || '').trim());
              const receiptUrl = hasReceipt ? resolveAssetUrl(demand?.payment_receipt_image_url) : '';
              const propertyTooltip = getPropertyPreviewText(bien);
              const propertyName = String(bien?.nom_bien_mobile || bien?.titre || demand?.bien_titre || '').trim();
              const ownerId = String(demand?.proprietaire_id || extractOwnerIdFromNotificationMessage(notification.message)).trim();
              const isOwnerMessageNotification = category === 'proprietaire' && Boolean(ownerId);
              const actionTone =
                importance === 'urgent'
                  ? 'bg-rose-100 text-rose-800'
                  : importance === 'modere'
                    ? 'bg-amber-100 text-amber-800'
                    : 'bg-slate-900 text-white';
              const importanceTone =
                importance === 'urgent'
                  ? 'border-l-rose-500 bg-rose-50/40'
                  : importance === 'modere'
                    ? 'border-l-amber-500 bg-amber-50/40'
                    : 'border-l-slate-300 bg-white';
              return (
                <div
                  key={notification.id}
                  title={propertyTooltip || undefined}
                  onClick={() => {
                    if (!isOwnerMessageNotification) return;
                    openOwnerChatByOwnerId(ownerId);
                  }}
                  className={`rounded-2xl border border-slate-200 border-l-4 p-4 shadow-sm ${importanceTone} ${notification.lu ? '' : 'shadow-[0_0_0_1px_rgba(16,185,129,0.08)]'} ${isOwnerMessageNotification ? 'cursor-pointer transition-colors hover:border-emerald-300 hover:bg-emerald-50/40' : ''}`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-700">{categoryTitle}</span>
                        <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${actionTone}`}>
                          {primaryLabel}
                        </span>
                        <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${modeLabel === 'Hotellerie' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>
                          {modeLabel}
                        </span>
                        {categoryTitle === 'Dossier client' ? (
                          <span className="rounded-full bg-violet-50 px-2.5 py-1 text-[11px] font-semibold text-violet-700">
                            {paymentMethodLabel}
                          </span>
                        ) : null}
                        {!notification.lu && <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">Non lue</span>}
                      </div>

                      <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-bold text-slate-900">{primaryLabel}</p>
                          <h4 className="mt-1 text-lg font-semibold leading-tight text-slate-900">{clientName}</h4>
                          <p className="mt-1 text-sm text-slate-600">{secondaryLabel}</p>
                          <p className="mt-2 text-sm leading-6 text-slate-700">{detailLabel}</p>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-right">
                          <p className="text-sm font-semibold text-slate-900">{formatStayDate(notification.created_at)}</p>
                          <p className="text-xs font-medium text-slate-500">{formatDateTime(notification.created_at).split(' ').slice(1).join(' ')}</p>
                        </div>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-600">
                        {propertyName ? <span className="rounded-full bg-slate-100 px-2.5 py-1">{propertyName}</span> : null}
                        <span className="rounded-full bg-cyan-50 px-2.5 py-1 text-cyan-700">Source: {sourceLabel}</span>
                        {demand?.start_date ? <span className="rounded-full bg-slate-100 px-2.5 py-1">Arrivee {formatStayDate(demand.start_date)}</span> : null}
                        {demand?.end_date ? <span className="rounded-full bg-slate-100 px-2.5 py-1">Depart {formatStayDate(demand.end_date)}</span> : null}
                        {demand?.guests ? <span className="rounded-full bg-slate-100 px-2.5 py-1">{Number(demand.guests)} voyageur{Number(demand.guests) > 1 ? 's' : ''}</span> : null}
                        {demand?.total_amount ? <span className="rounded-full bg-slate-100 px-2.5 py-1">Montant {formatMoney(demand.total_amount)}</span> : null}
                      </div>
                    </div>

                    <div className="flex w-full flex-wrap gap-2 lg:w-auto">
                      {isOwnerMessageNotification ? (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            openOwnerChatByOwnerId(ownerId);
                          }}
                          className="inline-flex items-center justify-center rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-100"
                        >
                          Ouvrir discussion
                        </button>
                      ) : null}
                      {demand?.contract_id ? (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            void viewContractForDemand(demand);
                          }}
                          className="inline-flex items-center justify-center rounded-xl border border-sky-300 bg-sky-50 px-3 py-2 text-sm font-semibold text-sky-800 hover:bg-sky-100"
                        >
                          Voir contrat
                        </button>
                      ) : null}
                      {hasReceipt ? (
                        <a
                          href={receiptUrl}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(event) => event.stopPropagation()}
                          className="inline-flex items-center justify-center rounded-xl border border-cyan-300 bg-cyan-50 px-3 py-2 text-sm font-semibold text-cyan-800 hover:bg-cyan-100"
                        >
                          Voir recu
                        </a>
                      ) : null}
                      {demand ? (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            setSelectedClientDemand(demand);
                          }}
                          className="inline-flex items-center justify-center rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-100"
                        >
                          Ouvrir dossier
                        </button>
                      ) : null}
                      {!notification.lu && (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            void markNotificationAsRead(notification.id);
                          }}
                          className="inline-flex items-center justify-center rounded-xl border border-emerald-200 px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-50"
                        >
                          Marquer lu
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>
      )}

      {activeView !== 'chat' && (chatAttentionCount > 0 || quickChatOpen) && (
        <div className="pointer-events-none fixed bottom-5 right-5 z-40 flex max-w-[calc(100vw-2rem)] flex-col items-end gap-3">
          {quickChatOpen && (
            <div className="pointer-events-auto w-[min(380px,calc(100vw-2rem))] overflow-hidden rounded-[26px] border border-emerald-200 bg-white shadow-[0_24px_60px_rgba(15,23,42,0.22)]">
              <div className="flex items-center justify-between gap-3 border-b border-emerald-100 bg-[linear-gradient(135deg,#ecfdf5_0%,#ffffff_100%)] px-4 py-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700">Reponse rapide</p>
                  <p className="truncate text-sm font-semibold text-slate-900">
                    {selectedChatOwner ? selectedChatOwner.name : `${chatAttentionCount} message(s) recent(s)`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {chatAttentionCount > 0 ? (
                    <span className="dwira-attention-badge inline-flex min-w-[1.8rem] items-center justify-center rounded-full bg-emerald-500 px-2 py-0.5 text-[11px] font-bold text-white">
                      +{formatAttentionCount(chatAttentionCount)}
                    </span>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setQuickChatOpen(false)}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-slate-500 hover:bg-slate-50"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {quickChatOwners.length > 0 && (
                <div className="flex gap-2 overflow-x-auto border-b border-slate-100 px-3 py-3">
                  {quickChatOwners.map((owner) => {
                    const unreadCount = unreadOwnerNotificationCountByOwnerId.get(owner.id) || 0;
                    const isActive = selectedChatOwner?.id === owner.id;
                    return (
                      <button
                        key={`quick-chat-owner-${owner.id}`}
                        type="button"
                        onClick={() => openQuickChatForOwner(owner.id)}
                        className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-3 py-2 text-left text-xs font-semibold ${isActive ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}
                      >
                        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-emerald-700 text-[10px] font-bold text-white">
                          {getOwnerInitials(owner.name)}
                        </span>
                        <span className="max-w-[120px] truncate">{owner.name}</span>
                        {unreadCount > 0 ? (
                          <span className="rounded-full bg-emerald-500 px-2 py-0.5 text-[10px] text-white">+{formatAttentionCount(unreadCount)}</span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="max-h-[360px] min-h-[220px] overflow-y-auto bg-[linear-gradient(180deg,#f8fafc_0%,#eef2f7_100%)] px-4 py-4">
                {!selectedChatOwner ? (
                  <div className="flex h-full items-center justify-center text-center text-sm text-slate-500">
                    Selectionnez un proprietaire pour repondre rapidement.
                  </div>
                ) : chatLoading ? (
                  <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500">
                    Chargement de la conversation...
                  </div>
                ) : chatMessages.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-sm text-slate-500">
                    Aucun message pour ce proprietaire.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {chatMessages.slice(-12).map((message) => {
                      const fromAdmin = message.kind === 'admin_owner_chat';
                      return (
                        <div key={`quick-chat-message-${message.id}`} className={`flex ${fromAdmin ? 'justify-end' : 'justify-start'}`}>
                          <div className={`max-w-[85%] rounded-[18px] px-3 py-2 text-sm shadow-sm ${fromAdmin ? 'bg-emerald-600 text-white' : 'border border-slate-200 bg-white text-slate-800'}`}>
                            <p className="whitespace-pre-wrap break-words">{message.text || '(message vide)'}</p>
                            <p className={`mt-1 text-[10px] ${fromAdmin ? 'text-emerald-50/80' : 'text-slate-400'}`}>{formatDateTime(message.createdAt)}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="border-t border-slate-200 bg-white px-3 py-3">
                <div className="flex items-end gap-2">
                  <textarea
                    value={chatDraft}
                    onChange={(event) => setChatDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && !event.shiftKey) {
                        event.preventDefault();
                        if (!chatSending && chatDraft.trim()) {
                          void sendChatMessage();
                        }
                      }
                    }}
                    placeholder="Repondre rapidement..."
                    rows={1}
                    className="min-h-[52px] flex-1 resize-y rounded-[20px] border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none placeholder:text-slate-400"
                  />
                  <button
                    type="button"
                    onClick={() => void sendChatMessage()}
                    disabled={chatSending || !chatDraft.trim() || !selectedChatOwner}
                    className="inline-flex h-[52px] items-center justify-center gap-2 rounded-full bg-emerald-600 px-4 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(5,150,105,0.22)] hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <SendHorizontal className="h-4 w-4" />
                    {chatSending ? 'Envoi...' : 'Envoyer'}
                  </button>
                </div>
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={() => {
              if (quickChatOpen) {
                setQuickChatOpen(false);
                return;
              }
              setQuickChatOpen(true);
            }}
            className="dwira-fab-bubble pointer-events-auto inline-flex items-center gap-3 rounded-full bg-emerald-600 px-4 py-3 text-sm font-semibold text-white shadow-[0_16px_32px_rgba(5,150,105,0.3)]"
          >
            <MessageSquareShare className="h-5 w-5" />
            <span>Messages proprietaires</span>
            {chatAttentionCount > 0 ? (
              <span className="dwira-attention-badge inline-flex min-w-[1.8rem] items-center justify-center rounded-full bg-white px-2 py-0.5 text-[11px] font-bold text-emerald-700">
                +{formatAttentionCount(chatAttentionCount)}
              </span>
            ) : null}
          </button>
        </div>
      )}

      {calendarReviewRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[92vh] w-full max-w-7xl overflow-y-auto rounded-2xl bg-white shadow-xl">
            <div className="flex items-start justify-between gap-4 border-b border-gray-200 px-5 py-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Difference calendrier</h3>
                <p className="text-sm text-gray-500">
                  {calendarReviewRequest.ownerName} - {calendarReviewRequest.propertyTitle || 'Bien sans titre'}
                </p>
                <p className="mt-1 text-xs text-gray-500">
                  {calendarReviewRequest.requestType === 'open' ? 'Reouverture demandee' : 'Fermeture demandee'} du {formatStayDate(calendarReviewRequest.startDate)} au {formatStayDate(calendarReviewRequest.endDate)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setCalendarReviewRequest(null);
                  setCalendarReviewDiff(null);
                }}
                className="rounded-lg px-3 py-2 text-sm text-gray-600 hover:bg-gray-100"
              >
                Fermer
              </button>
            </div>

            <div className="space-y-4 px-5 py-4">
              {calendarReviewLoading && (
                <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-8 text-center text-sm text-gray-500">
                  Chargement de la difference calendrier...
                </div>
              )}

              {!calendarReviewLoading && calendarReviewDiff && (
                <>
                  {calendarReviewDiff.note ? (
                    <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700">
                      Note proprietaire: {calendarReviewDiff.note}
                    </div>
                  ) : null}

                  <div className="grid gap-4 xl:grid-cols-2">
                    <div className="rounded-xl border border-gray-200 bg-white p-3">
                      <div className="mb-3">
                        <div className="text-sm font-semibold text-gray-900">Calendrier avant</div>
                        <div className="text-xs text-gray-500">Etat actuel du bien avant approbation.</div>
                      </div>
                      <AvailabilityCalendar
                        unavailableDates={calendarReviewDiff.currentCalendar}
                        onDateRangeSelect={() => {}}
                        selectedStart={null}
                        selectedEnd={null}
                      />
                    </div>
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50/30 p-3">
                      <div className="mb-3">
                        <div className="text-sm font-semibold text-gray-900">Calendrier apres</div>
                        <div className="text-xs text-gray-500">Projection si l admin confirme cette demande.</div>
                      </div>
                      <AvailabilityCalendar
                        unavailableDates={calendarReviewDiff.projectedCalendar}
                        onDateRangeSelect={() => {}}
                        selectedStart={null}
                        selectedEnd={null}
                      />
                    </div>
                  </div>

                  {calendarReviewRequest.status === 'pending' && (
                    <div className="flex flex-wrap justify-end gap-2 border-t border-gray-200 pt-4">
                      <button
                        type="button"
                        onClick={() => void rejectCalendarRequest(calendarReviewRequest)}
                        disabled={calendarActionLoadingId === calendarReviewRequest.id}
                        className="rounded-lg border border-rose-300 bg-white px-4 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-60"
                      >
                        {calendarActionLoadingId === calendarReviewRequest.id ? 'Traitement...' : 'Rejeter'}
                      </button>
                      <button
                        type="button"
                        onClick={() => void approveCalendarRequest(calendarReviewRequest)}
                        disabled={calendarActionLoadingId === calendarReviewRequest.id}
                        className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
                      >
                        {calendarActionLoadingId === calendarReviewRequest.id ? 'Traitement...' : 'Confirmer'}
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {selectedClientDemand && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/45 backdrop-blur-[2px]">
          <button
            type="button"
            aria-label="Fermer dossier client"
            className="absolute inset-0 cursor-default"
            onClick={() => setSelectedClientDemand(null)}
          />
          <div className="relative h-full w-full max-w-2xl overflow-y-auto border-l border-slate-200 bg-white shadow-[0_20px_60px_rgba(15,23,42,0.28)]">
            <div className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-5 py-4 backdrop-blur">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700">Dossier client</p>
                  <h3 className="mt-1 text-xl font-semibold text-slate-900">{getDemandClientName(selectedClientDemand)}</h3>
                  <p className="mt-1 text-sm text-slate-500">{formatModeLabel(biensById.get(String(selectedClientDemand.bien_id || '').trim())?.mode || 'location_saisonniere')} • {getDemandSourceLabel(selectedClientDemand, selectedClientDemand.client_note || selectedClientDemand.admin_note || '')}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedClientDemand(null)}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="space-y-5 px-5 py-5">
              <div className="rounded-3xl border border-emerald-100 bg-[linear-gradient(135deg,#ecfdf5_0%,#ffffff_62%)] p-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Client</p>
                    <p className="mt-2 text-2xl font-semibold text-slate-900">{getDemandClientName(selectedClientDemand)}</p>
                    <p className="mt-2 text-sm text-slate-600">{selectedClientDemand.client_email || 'Email non renseigne'}</p>
                  </div>
                  <div className="rounded-2xl bg-white/80 p-4 shadow-sm">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Notification</p>
                    <p className="mt-1 text-lg font-bold text-slate-900">{formatStayDate(selectedClientDemand.created_at)}</p>
                    <p className="text-sm font-medium text-slate-600">{formatTimeOnly(selectedClientDemand.created_at)}</p>
                  </div>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Arrivee</p>
                  <p className="mt-2 text-xl font-bold text-slate-900">{formatStayDate(selectedClientDemand.start_date)}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Depart</p>
                  <p className="mt-2 text-xl font-bold text-slate-900">{formatStayDate(selectedClientDemand.end_date)}</p>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Paiement</p>
                  <div className="mt-3 space-y-2 text-sm text-slate-700">
                    <p>Methode: <span className="font-semibold text-slate-900">{formatPaymentMethodLabel(selectedClientDemand)}</span></p>
                    <p>Montant client: <span className="font-semibold text-slate-900">{formatMoney(selectedClientDemand.total_amount)}</span></p>
                    <p>A regler maintenant: <span className="font-semibold text-slate-900">{formatMoney(selectedClientDemand.amount_due_now)}</span></p>
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Identite</p>
                  <div className="mt-3 space-y-2 text-sm text-slate-700">
                    <p>Nom complet: <span className="font-semibold text-slate-900">{getDemandClientName(selectedClientDemand)}</span></p>
                    <p>CIN / document: <span className="font-semibold text-slate-900">{selectedClientDemand.identity_document_number || 'Non renseigne'}</span></p>
                    <p>Soumis le: <span className="font-semibold text-slate-900">{formatDateTime(selectedClientDemand.identity_submitted_at)}</span></p>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {selectedClientDemand.contract_id ? (
                  <button
                    type="button"
                    onClick={() => void viewContractForDemand(selectedClientDemand)}
                    className="inline-flex items-center gap-2 rounded-xl border border-sky-300 bg-sky-50 px-4 py-2.5 text-sm font-semibold text-sky-800 hover:bg-sky-100"
                  >
                    Voir contrat
                  </button>
                ) : null}
                {selectedClientDemand.payment_receipt_image_url ? (
                  <a
                    href={resolveAssetUrl(selectedClientDemand.payment_receipt_image_url)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 rounded-xl border border-cyan-300 bg-cyan-50 px-4 py-2.5 text-sm font-semibold text-cyan-800 hover:bg-cyan-100"
                  >
                    Voir recu
                  </a>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      )}

      {historyDemandId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Trace de progression</h3>
                <p className="text-sm text-gray-500">Demande {historyDemandId}</p>
              </div>
              <button type="button" onClick={() => setHistoryDemandId(null)} className="rounded-lg px-3 py-2 text-sm text-gray-600 hover:bg-gray-100">
                Fermer
              </button>
            </div>
            <div className="max-h-[70vh] overflow-y-auto px-5 py-4">
              {historyRows.length === 0 && <p className="text-sm text-gray-500">Aucun historique sauvegarde.</p>}
              <div className="space-y-3">
                {historyRows.map((row) => (
                  <div key={row.id} className="rounded-lg border border-gray-200 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium text-gray-900">{statusLabels[row.status]}</p>
                      <p className="text-xs text-gray-500">{formatDateTime(row.created_at)}</p>
                    </div>
                    <p className="mt-1 text-xs text-gray-500">Acteur: {row.actor_type} {row.actor_id ? `(${row.actor_id})` : ''}</p>
                    {row.note ? <p className="mt-2 text-sm text-gray-700">{row.note}</p> : null}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
