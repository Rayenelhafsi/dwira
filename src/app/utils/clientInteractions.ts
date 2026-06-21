import { fetchJsonWithApiFallback } from './api';
import { trackGaEvent } from './analytics';

export type PublicClientInteractionType = 'visite' | 'like' | 'partage';
export type ExtendedClientInteractionType =
  | PublicClientInteractionType
  | 'site_open'
  | 'session_start'
  | 'reservation_attempt'
  | 'reservation_submitted'
  | 'property_view_heartbeat'
  | 'property_view_end'
  | 'search_filters_applied'
  | 'search_results_viewed'
  | 'property_cta_clicked'
  | 'contract_generated'
  | 'payment_confirmed'
  | 'payment_receipt_uploaded'
  | 'voucher_generated'
  | 'booking_cancelled'
  | 'hotel_reservation_submitted'
  | 'hotel_payment_confirmed'
  | 'hotel_payment_receipt_uploaded'
  | 'hotel_booking_cancelled';

export type PublicClientInteraction = {
  id: string;
  type: ExtendedClientInteractionType;
  bienId?: string;
  propertyTitle: string;
  clientUserId?: string;
  clientEmail: string;
  clientName?: string;
  source?: 'site_public' | 'admin';
  deviceId?: string;
  sessionId?: string;
  path?: string;
  channel?: 'direct' | 'amicale' | 'partner' | 'autre';
  referrerSource?: string;
  viewDurationSeconds?: number;
  scrollDepthPercent?: number;
  isBounce?: boolean;
  metadata?: Record<string, unknown> | null;
  dateTime: string;
};

export type TrackableClientInteractionInput = {
  type: ExtendedClientInteractionType;
  bienId?: string;
  propertyTitle: string;
  clientUserId?: string;
  clientEmail?: string;
  clientName?: string;
  sessionId?: string;
  path?: string;
  channel?: 'direct' | 'amicale' | 'partner' | 'autre';
  referrerSource?: string;
  viewDurationSeconds?: number;
  scrollDepthPercent?: number;
  isBounce?: boolean;
  metadata?: Record<string, unknown> | null;
};

function normalizeGaEventName(interaction: TrackableClientInteractionInput) {
  switch (interaction.type) {
    case 'site_open':
      return 'page_view';
    case 'visite':
      return 'view_item';
    case 'reservation_attempt':
      return 'begin_checkout';
    case 'reservation_submitted':
      return 'generate_lead';
    case 'hotel_reservation_submitted':
      return 'generate_lead';
    case 'payment_confirmed':
    case 'hotel_payment_confirmed':
      return 'purchase';
    case 'payment_receipt_uploaded':
    case 'hotel_payment_receipt_uploaded':
      return 'add_payment_info';
    case 'voucher_generated':
      return 'purchase';
    case 'search_filters_applied':
      return 'search';
    case 'search_results_viewed':
      return 'view_search_results';
    case 'property_cta_clicked':
      return 'select_item';
    case 'property_view_end':
      return 'view_item';
    default:
      return '';
  }
}

async function trackAnalyticsMirror(interaction: TrackableClientInteractionInput) {
  const eventName = normalizeGaEventName(interaction);
  if (!eventName) return;
  const metadata = interaction.metadata && typeof interaction.metadata === 'object' ? interaction.metadata : {};
  const params: Record<string, unknown> = {
    page_path: interaction.path || undefined,
    session_id: interaction.sessionId || undefined,
    channel: interaction.channel || metadata.channel || undefined,
    property_id: interaction.bienId || metadata.propertyId || undefined,
    property_title: interaction.propertyTitle || undefined,
    property_category: metadata.propertyCategory || undefined,
    request_type: metadata.requestType || undefined,
    stay_start: metadata.startDate || metadata.start_date || undefined,
    stay_end: metadata.endDate || metadata.end_date || undefined,
    view_duration_seconds: interaction.viewDurationSeconds ?? metadata.viewDurationSeconds ?? metadata.view_duration_seconds ?? undefined,
    scroll_depth_percent: interaction.scrollDepthPercent ?? metadata.scrollDepthPercent ?? metadata.scroll_depth_percent ?? undefined,
  };
  await trackGaEvent(eventName, params).catch(() => {});
}

export const trackPublicClientInteraction = async (
  interaction: TrackableClientInteractionInput
) => {
  void trackAnalyticsMirror(interaction);
  return fetchJsonWithApiFallback<PublicClientInteraction>('/client-interactions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(interaction),
  });
};

export const fetchClientInteractions = async (): Promise<PublicClientInteraction[]> => {
  const rows = await fetchJsonWithApiFallback<PublicClientInteraction[]>('/client-interactions');
  return Array.isArray(rows) ? rows : [];
};
