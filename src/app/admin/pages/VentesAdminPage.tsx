import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { BadgeDollarSign, Building2, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, ClipboardList, Clock3, ExternalLink, Eye, Filter, FolderOpen, Hash, Home, ImageIcon, LandPlot, Layers3, Mail, MapPin, MessageCircle, Paperclip, PencilLine, Phone, Plus, RefreshCw, Ruler, Save, Send, Target, Trash2, UploadCloud, UserCheck, Users, XCircle } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { useAuth } from "../../context/AuthContext";
import { useProperties } from "../../context/PropertiesContext";
import { resolveMediaUrl } from "../../utils/media";
import { buildPropertyDetailsPath } from "../../utils/propertyRouting";

const API_URL = import.meta.env.VITE_API_URL || "/api";

const normalizeOwnerRequestTypeRue = (value: unknown) => {
  const normalized = String(value || "").trim();
  if (!normalized) return null;
  if (normalized === "goudronnee") return "route_goudronnee";
  if (normalized === "double_voie" || normalized === "facade") return "rue_residentielle";
  if (normalized === "piste" || normalized === "route_goudronnee" || normalized === "rue_residentielle") return normalized;
  return null;
};

const normalizeOwnerRequestTypePapier = (value: unknown) => {
  const normalized = String(value || "").trim();
  if (!normalized) return null;
  if (normalized === "titre_bleu") return "titre_foncier_individuel";
  if (normalized === "contrat") return "contrat_seulement";
  if (normalized === "certificat_possession" || normalized === "papier_indivision") return "titre_foncier_collectif";
  if (normalized === "autre") return "sans_papier";
  if (
    normalized === "titre_foncier_individuel"
    || normalized === "titre_foncier_collectif"
    || normalized === "contrat_seulement"
    || normalized === "sans_papier"
  ) return normalized;
  return null;
};

type SalesStage =
  | "nouvelle_demande"
  | "a_rappeler"
  | "visite_planifiee"
  | "visite_effectuee"
  | "offre_en_cours"
  | "compromis_signe"
  | "vendu"
  | "perdu";

type SalesDemand = {
  id: string;
  bien_id: string;
  bien_titre?: string | null;
  bien_reference?: string | null;
  bien_type?: string | null;
  client_name?: string | null;
  client_email?: string | null;
  client_phone?: string | null;
  status?: string | null;
  sales_stage?: SalesStage | null;
  sales_last_note?: string | null;
  visit_preferred_date?: string | null;
  visit_time_slot?: string | null;
  visit_confirmed_at?: string | null;
  visit_assigned_admin_id?: string | null;
  visit_assigned_admin_name?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type OwnerSaleListingRequest = {
  id: string;
  owner_user_id?: string | null;
  owner_name: string;
  owner_email: string;
  owner_phone: string;
  property_type: string;
  title: string;
  region: string;
  zone: string;
  address: string;
  surface_m2: number;
  price_tnd: number;
  payment_mode: string;
  status: string;
  admin_note?: string | null;
  created_at?: string | null;
  payload?: Record<string, any>;
  photos?: string[];
};

type OwnerRequestMessage = {
  id: string;
  request_id: string;
  sender_role: "owner" | "admin";
  message_text?: string | null;
  attachment_url?: string | null;
  attachment_name?: string | null;
  created_at?: string | null;
};

type DemandDraft = {
  sales_stage: SalesStage;
  visit_preferred_date: string;
  visit_time_slot: string;
  visit_assigned_admin_id: string;
  sales_last_note: string;
};

type MatchImportance = "obligatoire" | "important" | "souhaite" | "ignore";
type NumericRule = "exact" | "min" | "max" | "between" | "tolerance";

type MatchCriterion = {
  importance: MatchImportance;
  value: string;
  rule?: NumericRule;
  tolerance?: string;
};

type BuyerMatchRequest = {
  id: string;
  clientName: string;
  phone: string;
  email: string;
  status: string;
  criteria: Record<string, MatchCriterion>;
};

type SalesClientCriterion = {
  key: string;
  label: string;
  importance: MatchImportance;
  rule?: NumericRule;
  condition?: NumericRule | "contient" | "oui_non" | "indifferent";
  value: string;
  tolerance?: string;
};

type SalesClientFile = {
  id: string;
  client_name: string;
  client_phone: string;
  client_email?: string | null;
  status: string;
  progress_stage: string;
  last_contact_at?: string | null;
  interested_bien_ids: string[];
  criteria: SalesClientCriterion[];
  notes?: string | null;
  outcome?: string | null;
  reminder_task?: string | null;
  reminder_at?: string | null;
  reminder_emails?: string[];
};

type MatchResult = {
  bien: any;
  score: number;
  label: string;
  passedRequired: boolean;
  matched: string[];
  missed: string[];
  blockedBy: string[];
};

const MATCH_IMPORTANCE_LABELS: Record<MatchImportance, string> = {
  obligatoire: "Obligatoire",
  important: "Important",
  souhaite: "Souhaite",
  ignore: "Sans importance",
};

const MATCH_IMPORTANCE_STYLES: Record<MatchImportance, string> = {
  obligatoire: "bg-rose-50 text-rose-700 border-rose-200",
  important: "bg-amber-50 text-amber-800 border-amber-200",
  souhaite: "bg-emerald-50 text-emerald-700 border-emerald-200",
  ignore: "bg-slate-50 text-slate-500 border-slate-200",
};

const MATCH_NUMERIC_RULE_LABELS: Record<NumericRule, string> = {
  exact: "Exact",
  min: "Minimum",
  max: "Maximum",
  between: "Entre",
  tolerance: "+/- Tolerance",
};

const YES_NO_OPTIONS = [
  { value: "oui", label: "Oui" },
  { value: "non", label: "Non" },
];

const BEDROOM_OPTIONS = ["0", "1", "2", "3", "4", "5", "6"];
const FLOOR_OPTIONS = ["RDC", "1", "2", "3", "4", "5+"];

type SaleCharacteristicKind = "text" | "number" | "boolean" | "choice";
type SaleCharacteristicDefinition = {
  key: string;
  label: string;
  kind: SaleCharacteristicKind;
  appliesTo: string[];
  defaultImportance: MatchImportance;
  defaultRule?: NumericRule;
};

const ALL_SALE_TYPES = ["appartement", "villa_maison", "terrain", "lotissement", "immeuble", "local_commercial", "bureau"];
const SALE_CHARACTERISTIC_DEFINITIONS: SaleCharacteristicDefinition[] = [
  { key: "operation", label: "Type d'operation", kind: "choice", appliesTo: ALL_SALE_TYPES, defaultImportance: "obligatoire" },
  { key: "propertyType", label: "Type de bien", kind: "choice", appliesTo: ALL_SALE_TYPES, defaultImportance: "obligatoire" },
  { key: "location", label: "Localisation", kind: "text", appliesTo: ALL_SALE_TYPES, defaultImportance: "important" },
  { key: "budget", label: "Budget", kind: "number", appliesTo: ALL_SALE_TYPES, defaultImportance: "obligatoire", defaultRule: "max" },
  { key: "surface", label: "Surface", kind: "number", appliesTo: ALL_SALE_TYPES, defaultImportance: "obligatoire", defaultRule: "min" },
  { key: "facade", label: "Facade", kind: "number", appliesTo: ["villa_maison", "terrain", "lotissement", "immeuble", "local_commercial", "bureau"], defaultImportance: "important", defaultRule: "min" },
  { key: "distanceBeach", label: "Distance plage (m)", kind: "number", appliesTo: ALL_SALE_TYPES, defaultImportance: "ignore", defaultRule: "max" },
  { key: "bedrooms", label: "Nombre de chambres", kind: "number", appliesTo: ["appartement", "villa_maison", "immeuble"], defaultImportance: "souhaite", defaultRule: "min" },
  { key: "bathrooms", label: "Salles de bain", kind: "number", appliesTo: ["appartement", "villa_maison", "immeuble"], defaultImportance: "ignore", defaultRule: "min" },
  { key: "floor", label: "Etage", kind: "choice", appliesTo: ["appartement", "immeuble", "local_commercial"], defaultImportance: "ignore" },
  { key: "independent", label: "Maison independante", kind: "boolean", appliesTo: ["villa_maison"], defaultImportance: "important" },
  { key: "garage", label: "Garage / Parking", kind: "boolean", appliesTo: ["appartement", "villa_maison", "immeuble", "local_commercial", "bureau"], defaultImportance: "souhaite" },
  { key: "pool", label: "Piscine", kind: "boolean", appliesTo: ["appartement", "villa_maison"], defaultImportance: "souhaite" },
  { key: "beach", label: "Proche plage", kind: "boolean", appliesTo: ALL_SALE_TYPES, defaultImportance: "important" },
  { key: "balcony", label: "Balcon", kind: "boolean", appliesTo: ["appartement", "immeuble"], defaultImportance: "ignore" },
  { key: "terrace", label: "Terrasse", kind: "boolean", appliesTo: ["appartement", "villa_maison", "immeuble", "local_commercial", "bureau"], defaultImportance: "ignore" },
  { key: "airConditioning", label: "Climatisation", kind: "boolean", appliesTo: ["appartement", "villa_maison", "immeuble", "local_commercial", "bureau"], defaultImportance: "ignore" },
  { key: "centralHeating", label: "Chauffage central", kind: "boolean", appliesTo: ["appartement", "villa_maison", "immeuble", "local_commercial", "bureau"], defaultImportance: "ignore" },
  { key: "equippedKitchen", label: "Cuisine equipee", kind: "boolean", appliesTo: ["appartement", "villa_maison"], defaultImportance: "ignore" },
  { key: "furnished", label: "Meuble", kind: "boolean", appliesTo: ["appartement", "villa_maison", "local_commercial", "bureau"], defaultImportance: "ignore" },
  { key: "residence", label: "Residence", kind: "boolean", appliesTo: ["appartement"], defaultImportance: "ignore" },
  { key: "securedResidence", label: "Residence gardee", kind: "boolean", appliesTo: ["appartement"], defaultImportance: "ignore" },
  { key: "landUse", label: "Vocation", kind: "choice", appliesTo: ["terrain", "lotissement", "immeuble", "local_commercial", "bureau"], defaultImportance: "important" },
  { key: "constructible", label: "Constructible", kind: "boolean", appliesTo: ["terrain", "lotissement"], defaultImportance: "important" },
  { key: "title", label: "Titre foncier", kind: "boolean", appliesTo: ALL_SALE_TYPES, defaultImportance: "important" },
  { key: "blueTitle", label: "Titre bleu", kind: "boolean", appliesTo: ["terrain", "lotissement", "immeuble", "local_commercial", "bureau"], defaultImportance: "ignore" },
  { key: "access", label: "Acces", kind: "text", appliesTo: ["terrain", "lotissement", "local_commercial", "bureau"], defaultImportance: "souhaite" },
  { key: "corner", label: "Coin de rue", kind: "boolean", appliesTo: ["terrain", "lotissement", "local_commercial", "bureau"], defaultImportance: "souhaite" },
  { key: "roadWidth", label: "Largeur route/voies", kind: "number", appliesTo: ["terrain", "lotissement"], defaultImportance: "ignore", defaultRule: "min" },
  { key: "apartments", label: "Nombre appartements", kind: "number", appliesTo: ["immeuble"], defaultImportance: "ignore", defaultRule: "min" },
  { key: "commercialUnits", label: "Locaux commerciaux", kind: "number", appliesTo: ["immeuble"], defaultImportance: "ignore", defaultRule: "min" },
  { key: "rentalYield", label: "Rendement brut (%)", kind: "number", appliesTo: ["immeuble", "local_commercial", "bureau"], defaultImportance: "ignore", defaultRule: "min" },
  { key: "elevator", label: "Ascenseur", kind: "boolean", appliesTo: ["appartement", "immeuble", "local_commercial", "bureau"], defaultImportance: "ignore" },
  { key: "storefrontWidth", label: "Largeur vitrine", kind: "number", appliesTo: ["local_commercial"], defaultImportance: "ignore", defaultRule: "min" },
  { key: "mainFacadeWidth", label: "Largeur facade principale", kind: "number", appliesTo: ["local_commercial", "bureau", "immeuble"], defaultImportance: "ignore", defaultRule: "min" },
  { key: "roomsOffices", label: "Pieces / bureaux", kind: "number", appliesTo: ["local_commercial", "bureau"], defaultImportance: "ignore", defaultRule: "min" },
  { key: "sanitaryCount", label: "Sanitaires", kind: "number", appliesTo: ["local_commercial", "bureau"], defaultImportance: "ignore", defaultRule: "min" },
  { key: "directAccess", label: "Acces direct rue", kind: "boolean", appliesTo: ["local_commercial", "bureau"], defaultImportance: "ignore" },
  { key: "mainStreet", label: "Rue principale", kind: "boolean", appliesTo: ["local_commercial", "bureau"], defaultImportance: "ignore" },
  { key: "activityAllowed", label: "Activite autorisee", kind: "boolean", appliesTo: ["local_commercial"], defaultImportance: "ignore" },
  { key: "openSpace", label: "Open space", kind: "boolean", appliesTo: ["local_commercial", "bureau"], defaultImportance: "ignore" },
  { key: "reception", label: "Reception", kind: "boolean", appliesTo: ["local_commercial", "bureau"], defaultImportance: "ignore" },
  { key: "kitchenette", label: "Kitchenette", kind: "boolean", appliesTo: ["local_commercial", "bureau"], defaultImportance: "ignore" },
  { key: "extraction", label: "Extraction possible", kind: "boolean", appliesTo: ["local_commercial"], defaultImportance: "ignore" },
  { key: "fiberInternet", label: "Fibre / Internet", kind: "boolean", appliesTo: ["terrain", "lotissement", "immeuble", "local_commercial", "bureau"], defaultImportance: "ignore" },
  { key: "other", label: "Autres criteres", kind: "text", appliesTo: ALL_SALE_TYPES, defaultImportance: "souhaite" },
];

const saleCharacteristicByKey = new Map(SALE_CHARACTERISTIC_DEFINITIONS.map((item) => [item.key, item]));

function getSaleCharacteristicDefinition(key: string) {
  return saleCharacteristicByKey.get(key);
}

function buildCriteriaFromSaleCharacteristics(propertyType = ""): SalesClientCriterion[] {
  const normalizedType = String(propertyType || "").trim();
  return SALE_CHARACTERISTIC_DEFINITIONS
    .filter((definition) => !normalizedType || definition.appliesTo.includes(normalizedType) || ["operation", "propertyType"].includes(definition.key))
    .map((definition) => ({
      key: definition.key,
      label: definition.label,
      importance: definition.defaultImportance,
      value: definition.key === "operation" ? "Achat" : definition.key === "propertyType" ? normalizedType : "",
      rule: definition.kind === "number" ? definition.defaultRule || "exact" : undefined,
      condition: definition.kind === "boolean" ? "oui_non" : definition.kind === "number" ? definition.defaultRule || "exact" : "contient",
      tolerance: "",
    }));
}

function mergeCriteriaWithSaleCharacteristics(criteria: SalesClientCriterion[] | undefined, propertyType = "") {
  const existing = new Map((criteria || []).map((criterion) => [criterion.key, criterion]));
  return buildCriteriaFromSaleCharacteristics(propertyType).map((criterion) => ({
    ...criterion,
    ...(existing.get(criterion.key) || {}),
    label: criterion.label,
    rule: existing.get(criterion.key)?.rule || criterion.rule,
    condition: existing.get(criterion.key)?.condition || criterion.condition,
  }));
}

function recordCriteriaFromClientCriteria(criteria: SalesClientCriterion[]) {
  return Object.fromEntries(criteria.map((criterion) => [
    criterion.key,
    {
      importance: criterion.importance,
      value: criterion.value,
      rule: criterion.rule || (["exact", "min", "max", "between", "tolerance"].includes(String(criterion.condition || "")) ? criterion.condition as NumericRule : undefined),
      tolerance: criterion.tolerance,
    },
  ]));
}

const DEFAULT_MATCH_REQUESTS: BuyerMatchRequest[] = [
  {
    id: "REQ-001",
    clientName: "Ahmed Ben Ali",
    phone: "29 123 456",
    email: "ahmed@example.com",
    status: "A contacter",
    criteria: {
      operation: { importance: "obligatoire", value: "Achat" },
      propertyType: { importance: "obligatoire", value: "villa_maison" },
      location: { importance: "important", value: "Kelibia" },
      surface: { importance: "obligatoire", value: "200", rule: "min", tolerance: "10" },
      facade: { importance: "obligatoire", value: "20", rule: "min", tolerance: "2" },
      budget: { importance: "obligatoire", value: "400000", rule: "tolerance", tolerance: "20000" },
      bedrooms: { importance: "important", value: "3", rule: "min" },
      floor: { importance: "obligatoire", value: "RDC" },
      independent: { importance: "obligatoire", value: "oui" },
      garage: { importance: "souhaite", value: "oui" },
      pool: { importance: "souhaite", value: "oui" },
      beach: { importance: "important", value: "oui" },
      other: { importance: "souhaite", value: "Quartier calme, titre foncier, bon standing" },
    },
  },
  {
    id: "REQ-002",
    clientName: "Sabrine Mekki",
    phone: "52 488 921",
    email: "sabrine@example.com",
    status: "Contacte",
    criteria: {
      operation: { importance: "obligatoire", value: "Achat" },
      propertyType: { importance: "important", value: "appartement" },
      location: { importance: "souhaite", value: "Kelibia" },
      surface: { importance: "important", value: "90", rule: "min", tolerance: "10" },
      budget: { importance: "obligatoire", value: "250000", rule: "max" },
      bedrooms: { importance: "important", value: "2", rule: "min" },
      floor: { importance: "ignore", value: "" },
        garage: { importance: "souhaite", value: "oui" },
        beach: { importance: "important", value: "oui" },
        facade: { importance: "important", value: "", rule: "min" },
        landUse: { importance: "ignore", value: "" },
        constructible: { importance: "ignore", value: "" },
        title: { importance: "important", value: "oui" },
        access: { importance: "ignore", value: "" },
        corner: { importance: "ignore", value: "" },
      },
    },
  ];

const DEFAULT_CLIENT_CRITERIA: SalesClientCriterion[] = buildCriteriaFromSaleCharacteristics();

const SALES_STAGE_OPTIONS: Array<{ value: SalesStage; label: string }> = [
  { value: "nouvelle_demande", label: "Nouvelle demande" },
  { value: "a_rappeler", label: "A rappeler" },
  { value: "visite_planifiee", label: "Visite planifiee" },
  { value: "visite_effectuee", label: "Visite effectuee" },
  { value: "offre_en_cours", label: "Offre en cours" },
  { value: "compromis_signe", label: "Compromis signe" },
  { value: "vendu", label: "Vendu" },
  { value: "perdu", label: "Perdu" },
];

const TIME_SLOT_OPTIONS = ["09:00-11:00", "11:00-13:00", "14:00-16:00", "16:00-18:00", "18:00-20:00"];

function stageLabel(stage?: string | null) {
  return SALES_STAGE_OPTIONS.find((item) => item.value === stage)?.label || "Nouvelle demande";
}

function statusLabel(value?: string | null) {
  return String(value || "").trim().replaceAll("_", " ") || "Sans statut";
}

function dateLabel(value?: string | null) {
  const raw = String(value || "").trim();
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return raw || "-";
  return `${match[3]}/${match[2]}/${match[1]}`;
}

function isoDate(value?: string | null) {
  return String(value || "").trim().slice(0, 10);
}

function monthKeyFromDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function parseMonthKey(monthKey: string) {
  const match = monthKey.match(/^(\d{4})-(\d{2})$/);
  if (!match) {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), 1);
  }
  return new Date(Number(match[1]), Number(match[2]) - 1, 1);
}

function shiftMonthKey(monthKey: string, delta: number) {
  const monthDate = parseMonthKey(monthKey);
  monthDate.setMonth(monthDate.getMonth() + delta);
  return monthKeyFromDate(monthDate);
}

function monthLabel(monthKey: string) {
  return parseMonthKey(monthKey).toLocaleDateString("fr-FR", {
    month: "long",
    year: "numeric",
  });
}

function buildMonthCalendar(monthKey: string) {
  const monthDate = parseMonthKey(monthKey);
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const leadingEmpty = (firstDay.getDay() + 6) % 7;
  const daysInMonth = lastDay.getDate();
  const cells: Array<{ date: string | null; day: number | null }> = [];
  for (let i = 0; i < leadingEmpty; i += 1) cells.push({ date: null, day: null });
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push({
      date: `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
      day,
    });
  }
  while (cells.length % 7 !== 0) cells.push({ date: null, day: null });
  return cells;
}

function getInitialDraft(row: SalesDemand): DemandDraft {
  return {
    sales_stage: (row.sales_stage || "nouvelle_demande") as SalesStage,
    visit_preferred_date: String(row.visit_preferred_date || "").slice(0, 10),
    visit_time_slot: String(row.visit_time_slot || ""),
    visit_assigned_admin_id: String(row.visit_assigned_admin_id || ""),
    sales_last_note: String(row.sales_last_note || ""),
  };
}

function buildSalesCreateHref(type: string) {
  return `/admin/biens?createBien=1&mode=vente&type=${encodeURIComponent(type)}&returnTo=${encodeURIComponent("/admin/ventes")}`;
}

function buildOwnerRequestCreateHref(request: OwnerSaleListingRequest) {
  return `/admin/biens?createBien=1&mode=vente&type=${encodeURIComponent(String(request.property_type || "appartement"))}&ownerRequest=${encodeURIComponent(request.id)}&returnTo=${encodeURIComponent("/admin/ventes")}`;
}

function buildSalesEditHref(id: string) {
  return `/admin/biens?editBien=${encodeURIComponent(id)}&returnTo=${encodeURIComponent("/admin/ventes")}`;
}

const CARD_FALLBACK =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1200 800'%3E%3Crect width='1200' height='800' fill='%23e2e8f0'/%3E%3Cpath d='M180 560l210-180 120 108 120-120 210 192H180z' fill='%23cbd5e1'/%3E%3Ccircle cx='360' cy='230' r='48' fill='%23cbd5e1'/%3E%3C/svg%3E";

const DEMO_SALE_BIENS: any[] = [
  {
    id: "demo-v425",
    reference: "DEMO-425",
    titre: "Villa S+3 - Kelibia La Blanche",
    mode: "vente",
    type: "villa_maison",
    zone: "Kelibia - La Blanche",
    statut: "disponible",
    visible_sur_site: true,
    prix_affiche_client: 380000,
    superficie_m2: 240,
    facade_m: 22,
    nb_chambres: 3,
    etage: 0,
    independant: true,
    place_parking: true,
    proche_plage: true,
    type_papier: "titre_foncier_individuel",
    description: "Maison independante avec piscine, garage, quartier calme, proche plage et bon standing.",
    media: [{ url: "https://images.unsplash.com/photo-1613977257363-707ba9348227?auto=format&fit=crop&w=900&q=80" }],
  },
  {
    id: "demo-v381",
    reference: "DEMO-381",
    titre: "Maison S+2 - Mansoura",
    mode: "vente",
    type: "villa_maison",
    zone: "Kelibia - Mansoura",
    statut: "disponible",
    visible_sur_site: true,
    prix_affiche_client: 365000,
    superficie_m2: 210,
    facade_m: 20,
    nb_chambres: 2,
    etage: 0,
    independant: true,
    place_parking: true,
    proche_plage: false,
    type_papier: "titre_foncier_individuel",
    description: "Maison independante avec garage, titre foncier, quartier calme.",
    media: [{ url: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=900&q=80" }],
  },
  {
    id: "demo-a401",
    reference: "DEMO-401",
    titre: "Appartement Azure front mer",
    mode: "vente",
    type: "appartement",
    zone: "Kelibia - Centre",
    statut: "disponible",
    visible_sur_site: true,
    prix_affiche_client: 235000,
    superficie_m2: 118,
    nb_chambres: 2,
    etage: 2,
    place_parking: true,
    proche_plage: true,
    ascenseur: true,
    description: "Appartement front mer, ascenseur, parking et cuisine equipee.",
    media: [{ url: "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=900&q=80" }],
  },
  {
    id: "demo-t201",
    reference: "DEMO-201",
    titre: "Terrain d'angle vue degagee",
    mode: "vente",
    type: "terrain",
    zone: "Kelibia - Dar Allouche",
    statut: "disponible",
    visible_sur_site: true,
    terrain_prix_affiche_total: 190000,
    terrain_surface_m2: 320,
    terrain_facade_m: 18,
    terrain_angle: true,
    terrain_constructible: true,
    proche_plage: true,
    description: "Terrain constructible, angle, proche plage, titre foncier.",
    media: [{ url: "https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=900&q=80" }],
  },
  {
    id: "demo-c701",
    reference: "DEMO-701",
    titre: "Local Commercial Signature",
    mode: "vente",
    type: "local_commercial",
    zone: "Kelibia - Avenue principale",
    statut: "disponible",
    visible_sur_site: true,
    prix_affiche_client: 420000,
    surface_local_m2: 118,
    facade_m: 14,
    local_largeur_vitrine_m: 9,
    local_acces_direct_rue: true,
    local_sur_rue_principale: true,
    local_parking: true,
    local_activite_commerciale_autorisee: true,
    local_visibilite_commerciale: "excellente",
    nb_chambres: 0,
    etage: 0,
    vitrine: true,
    toilette: true,
    description: "Local commercial avec vitrine, grande facade, usage commercial.",
    media: [{ url: "https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=900&q=80" }],
  },
  {
    id: "demo-i042",
    reference: "REF-I042",
    titre: "Immeuble mixte R+3 centre-ville",
    mode: "vente",
    type: "immeuble",
    zone: "Kelibia - Centre-ville",
    statut: "disponible",
    visible_sur_site: true,
    prix_affiche_client: 1200000,
    immeuble_surface_terrain_m2: 350,
    immeuble_surface_batie_m2: 800,
    immeuble_largeur_facade_m: 16,
    immeuble_nb_niveaux: 4,
    immeuble_nb_etages: 3,
    immeuble_nb_appartements: 8,
    immeuble_nb_locaux_commerciaux: 2,
    immeuble_nb_places_parking: 6,
    immeuble_nb_unites_louees: 6,
    immeuble_revenu_locatif_mensuel: 7500,
    immeuble_revenu_locatif_annuel: 90000,
    immeuble_rendement_brut_pct: 7.5,
    immeuble_ascenseur: true,
    immeuble_parking_exterieur: true,
    immeuble_route_principale: true,
    immeuble_proche_commerces: true,
    description: "Immeuble mixte loue partiellement avec locaux commerciaux, ascenseur, parking et rendement brut 7.5%.",
    media: [{ url: "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=900&q=80" }],
  },
  {
    id: "REQ-003",
    clientName: "Client terrain Kelibia",
    phone: "20 400 400",
    email: "terrain@example.com",
    status: "Nouveau",
    criteria: {
      operation: { importance: "obligatoire", value: "Achat" },
      propertyType: { importance: "obligatoire", value: "terrain" },
      location: { importance: "obligatoire", value: "Kelibia" },
      surface: { importance: "obligatoire", value: "400", rule: "min" },
      facade: { importance: "obligatoire", value: "18", rule: "min" },
      budget: { importance: "obligatoire", value: "400000", rule: "max" },
      landUse: { importance: "obligatoire", value: "habitation" },
      constructible: { importance: "obligatoire", value: "oui" },
      title: { importance: "obligatoire", value: "oui" },
      beach: { importance: "important", value: "oui" },
      corner: { importance: "souhaite", value: "oui" },
      access: { importance: "important", value: "" },
    },
  },
];

function formatCurrency(value?: number | null) {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount) || amount <= 0) return "Prix sur demande";
  return `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(amount)} DT`;
}

function getSaleAdminImage(bien: any) {
  const gallery = Array.isArray(bien?.media)
    ? bien.media.filter((item: any) => !String(item?.motif_upload || "").startsWith("preuve_type_"))
    : [];
  return resolveMediaUrl(gallery[0]?.url) || CARD_FALLBACK;
}

function getSaleAdminPrice(bien: any) {
  if (bien?.type === "terrain") {
    if (bien?.terrain_mode_affichage_prix === "m2_uniquement" && Number(bien?.terrain_prix_affiche_par_m2 || 0) > 0) {
      return `${formatCurrency(Number(bien.terrain_prix_affiche_par_m2 || 0))}/m2`;
    }
    return formatCurrency(Number(bien?.terrain_prix_affiche_total || bien?.prix_affiche_client || bien?.prix_final || 0));
  }
  if (bien?.type === "lotissement") {
    return formatCurrency(Number(bien?.lotissement_prix_total || bien?.prix_affiche_client || bien?.prix_final || 0));
  }
  return formatCurrency(Number(bien?.prix_affiche_client || bien?.prix_final || 0));
}

function getSaleAdminSurface(bien: any) {
  if (bien?.type === "terrain") return bien?.terrain_surface_m2 ? `${bien.terrain_surface_m2} m2` : "Surface a definir";
  if (bien?.type === "lotissement") return bien?.lotissement_nb_terrains ? `${bien.lotissement_nb_terrains} lots` : "Lotissement";
  if (bien?.type === "immeuble") return bien?.immeuble_surface_batie_m2 ? `${bien.immeuble_surface_batie_m2} m2` : "Immeuble";
  if (bien?.superficie_m2) return `${bien.superficie_m2} m2`;
  return "Surface a definir";
}

function getSaleAdminMeta(bien: any) {
  if (bien?.type === "terrain") return bien?.terrain_facade_m ? `${bien.terrain_facade_m} m facade` : "Facade a definir";
  if (bien?.type === "lotissement") return bien?.lotissement_nb_terrains ? `${bien.lotissement_nb_terrains} terrains` : "Programme terrain";
  if (bien?.type === "immeuble") return bien?.immeuble_nb_appartements ? `${bien.immeuble_nb_appartements} appartements` : "Immeuble";
  if (Number(bien?.nb_chambres || 0) > 0) return `${bien.nb_chambres} chambres`;
  return bien?.type === "local_commercial" ? "Usage commercial" : "Visite conseillee";
}

function getSaleTypeLabel(type?: string | null) {
  const labels: Record<string, string> = {
    appartement: "Appartement",
    villa_maison: "Villa / Maison",
    studio: "Studio",
    immeuble: "Immeuble",
    terrain: "Terrain",
    lotissement: "Lotissement",
    local_commercial: "Local commercial",
    bureau: "Bureau",
  };
  return labels[String(type || "").trim()] || "Bien vente";
}

function getSaleTypeIcon(type?: string | null) {
  if (type === "terrain" || type === "lotissement") return LandPlot;
  if (type === "immeuble" || type === "local_commercial") return Building2;
  return Home;
}

function normalizeText(value?: unknown) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function toMatchNumber(value?: unknown) {
  const number = Number(String(value ?? "").replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(number) ? number : null;
}

function getSaleNumericValue(bien: any, key: string) {
  if (key === "budget") {
    return Number(bien?.prix_affiche_client || bien?.prix_final || bien?.terrain_prix_affiche_total || bien?.lotissement_prix_total || bien?.prix_nuitee || 0);
  }
  if (key === "surface") {
    return Number(bien?.superficie_m2 || bien?.terrain_surface_m2 || bien?.immeuble_surface_batie_m2 || bien?.surface_local_m2 || 0);
  }
  if (key === "facade") return Number(bien?.facade_m || bien?.terrain_facade_m || bien?.immeuble_largeur_facade_m || 0);
  if (key === "distanceBeach") return Number(bien?.distance_plage_m || bien?.terrain_distance_plage_m || bien?.immeuble_distance_plage_m || bien?.lotissement_distance_plage_m || 0);
  if (key === "bedrooms") return Number(bien?.nb_chambres || 0);
  if (key === "bathrooms") return Number(bien?.nb_salle_bain || 0);
  if (key === "roadWidth") return Number(bien?.terrain_route_acces_largeur_m || bien?.lotissement_largeur_voies_m || 0);
  if (key === "apartments") return Number(bien?.immeuble_nb_appartements || 0);
  if (key === "commercialUnits") return Number(bien?.immeuble_nb_locaux_commerciaux || 0);
  if (key === "rentalYield") return Number(bien?.immeuble_rendement_brut_pct || 0);
  if (key === "storefrontWidth") return Number(bien?.local_largeur_vitrine_m || 0);
  if (key === "mainFacadeWidth") return Number(bien?.facade_m || bien?.terrain_facade_m || bien?.immeuble_largeur_facade_m || 0);
  if (key === "roomsOffices") return Number(bien?.local_nb_pieces_bureaux || 0);
  if (key === "sanitaryCount") return Number(bien?.local_nb_sanitaires || 0);
  return 0;
}

function getSaleBooleanValue(bien: any, key: string) {
  if (key === "garage") return Boolean(bien?.place_parking || bien?.immeuble_garage || bien?.immeuble_parking_exterieur || bien?.immeuble_parking_sous_sol || Number(bien?.immeuble_nb_garages || 0) > 0 || Number(bien?.immeuble_nb_places_parking || 0) > 0);
  if (key === "pool") return Boolean(bien?.piscine_individuelle || bien?.piscine_commune || bien?.vente_appartement_details?.piscine_individuelle || bien?.vente_appartement_details?.piscine_commune || bien?.vente_maison_details?.piscine_individuelle || bien?.vente_maison_details?.piscine_commune || normalizeText([bien?.description, bien?.caracteristiques?.join?.(" ")].join(" ")).includes("piscine"));
  if (key === "beach") return Boolean(bien?.proche_plage || bien?.immeuble_proche_plage || Number(bien?.distance_plage_m || bien?.terrain_distance_plage_m || bien?.immeuble_distance_plage_m || 999999) <= 800);
  if (key === "independent") return Boolean(bien?.independant || bien?.type === "villa_maison" || bien?.type === "terrain");
  if (key === "constructible") return Boolean(bien?.terrain_constructible || bien?.lotissement_constructible);
  if (key === "title") return Boolean(String(bien?.type_papier || "").includes("titre_foncier_individuel") || String(bien?.immeuble_titre_foncier || "").includes("individuel") || bien?.vente_appartement_details?.titre_foncier_individuel || bien?.vente_maison_details?.titre_foncier_individuel || bien?.lotissement_titre_foncier_global || normalizeText([bien?.description, bien?.terrain_documents_disponibles?.join?.(" ")].join(" ")).includes("titre"));
  if (key === "blueTitle") return Boolean(bien?.immeuble_titre_bleu || bien?.local_titre_bleu || bien?.lotissement_titre_bleu || normalizeText([bien?.terrain_documents_disponibles?.join?.(" "), bien?.description].join(" ")).includes("titre bleu"));
  if (key === "corner") return Boolean(bien?.terrain_angle || bien?.coin_angle);
  if (key === "elevator") return Boolean(bien?.ascenseur || bien?.immeuble_ascenseur || bien?.local_ascenseur);
  if (key === "balcony") return Boolean(bien?.balcon || bien?.vente_appartement_details?.balcon);
  if (key === "terrace") return Boolean(bien?.terrasse || bien?.vente_maison_details?.terrasse);
  if (key === "airConditioning") return Boolean(bien?.climatisation || bien?.immeuble_climatisation);
  if (key === "centralHeating") return Boolean(bien?.chauffage_central || bien?.immeuble_chauffage_central || bien?.local_chauffage);
  if (key === "equippedKitchen") return Boolean(bien?.cuisine_equipee);
  if (key === "furnished") return Boolean(bien?.meuble);
  if (key === "residence") return Boolean(bien?.vente_appartement_details?.residence || bien?.copropriete);
  if (key === "securedResidence") return Boolean(bien?.vente_appartement_details?.residence_gardee);
  if (key === "directAccess") return Boolean(bien?.local_acces_direct_rue || bien?.local_entree_independante);
  if (key === "mainStreet") return Boolean(bien?.local_sur_rue_principale);
  if (key === "activityAllowed") return Boolean(bien?.local_activite_commerciale_autorisee);
  if (key === "openSpace") return Boolean(bien?.local_open_space);
  if (key === "reception") return Boolean(bien?.local_reception);
  if (key === "kitchenette") return Boolean(bien?.local_kitchenette);
  if (key === "extraction") return Boolean(bien?.local_extraction_possible);
  if (key === "fiberInternet") return Boolean(bien?.local_fibre_internet || bien?.terrain_viabilisation_fibre_optique);
  return false;
}

function getSaleTextValue(bien: any, key: string) {
  if (key === "operation") return "Achat";
  if (key === "propertyType") return String(bien?.type || "");
  if (key === "location") return [bien?.zone, bien?.titre, bien?.description, bien?.terrain_zone].filter(Boolean).join(" ");
  if (key === "floor") return String(bien?.etage === 0 ? "RDC" : bien?.etage || "");
  if (key === "landUse") return [bien?.type_terrain, bien?.lotissement_vocation, bien?.terrain_zone, bien?.description].filter(Boolean).join(" ");
  if (key === "access") return [bien?.type_rue, bien?.description].filter(Boolean).join(" ");
  if (key === "commercialUnits") return String(bien?.immeuble_nb_locaux_commerciaux || "");
  if (key === "other") return [bien?.description, bien?.type_papier, bien?.terrain_documents_disponibles?.join?.(" "), bien?.caracteristiques?.join?.(" ")].filter(Boolean).join(" ");
  return "";
}

function expandLotissementLotsForMatching(biens: any[]) {
  return biens.flatMap((bien) => {
    if (bien?.type !== "lotissement" || !Array.isArray(bien?.lotissement_terrains)) return [bien];
    const parentReference = bien.reference || bien.id || "LOT";
    const lots = bien.lotissement_terrains
      .filter((lot: any) => !["reserve", "reservee", "vendu"].includes(normalizeText(lot?.statut || "disponible")))
      .map((lot: any, index: number) => {
        const surface = Number(lot?.surface_m2 || 0);
        const prixM2 = Number(lot?.prix_m2 || bien.lotissement_prix_m2_unique || bien.lotissement_prix_m2_moyen || 0);
        const prixTotal = Number(lot?.prix_total || (surface > 0 && prixM2 > 0 ? surface * prixM2 : 0));
        const lotReference = lot?.reference || `${parentReference}-LOT${String(lot?.index || index + 1).padStart(2, "0")}`;
        return {
          ...bien,
          id: `${bien.id || parentReference}::${lotReference}`,
          reference: lotReference,
          titre: `${bien.titre || "Lotissement"} - ${lotReference}`,
          type: "terrain",
          is_lotissement_lot: true,
          parent_lotissement_id: bien.id,
          parent_lotissement_reference: parentReference,
          terrain_surface_m2: surface || null,
          terrain_facade_m: lot?.facade_m ?? null,
          terrain_distance_plage_m: lot?.terrain_distance_plage_m ?? bien.lotissement_distance_plage_m ?? null,
          terrain_zone: lot?.terrain_zone || bien.zone || bien.terrain_zone || null,
          terrain_constructible: Boolean(lot?.terrain_constructible || bien.lotissement_constructible),
          terrain_angle: Boolean(lot?.terrain_angle || normalizeText(lot?.position).includes("angle")),
          terrain_prix_affiche_total: prixTotal || null,
          terrain_prix_affiche_par_m2: prixM2 || null,
          prix_affiche_client: prixTotal || bien.prix_affiche_client || bien.prix_final || bien.prix_nuitee || null,
          prix_final: prixTotal || bien.prix_final || null,
          type_terrain: lot?.type_terrain || bien.lotissement_vocation || bien.type_terrain || "terrain",
          type_rue: lot?.type_rue || bien.type_rue || null,
          type_papier: lot?.type_papier || bien.type_papier || null,
          description: [bien.description, lot?.position, lot?.orientation, `Lot issu du lotissement ${parentReference}`].filter(Boolean).join(" "),
        };
      });
    return [bien, ...lots];
  });
}

function expandImmeubleUnitsForMatching(biens: any[]) {
  return biens.flatMap((bien) => {
    if (bien?.type !== "immeuble" || !Array.isArray(bien?.immeuble_appartements)) return [bien];
    const parentReference = bien.reference || bien.id || "IM";
    const units = bien.immeuble_appartements
      .filter((unit: any) => !["reserve", "reservee", "vendu"].includes(normalizeText(unit?.statut || "disponible")))
      .map((unit: any, index: number) => {
        const unitType = unit?.type_unite === "local_commercial" || unit?.type_unite === "bureau" ? "local_commercial" : "appartement";
        const unitReference = unit?.reference || `${parentReference}-${unitType === "appartement" ? "A" : "LC"}${String(unit?.index || index + 1).padStart(2, "0")}`;
        const price = Number(unit?.prix || 0);
        const floorValue = normalizeText(unit?.etage).includes("rdc") ? 0 : Number(String(unit?.etage ?? "").replace(/\D/g, ""));
        return {
          ...bien,
          id: `${bien.id || parentReference}::${unitReference}`,
          reference: unitReference,
          titre: `${bien.titre || "Immeuble"} - ${unitReference}`,
          type: unitType,
          is_immeuble_unit: true,
          parent_immeuble_id: bien.id,
          parent_immeuble_reference: parentReference,
          configuration: unit?.configuration || null,
          nb_chambres: Number(unit?.chambres || 0),
          nb_salle_bain: Number(unit?.salle_bain || 0),
          superficie_m2: Number(unit?.superficie_m2 || 0) || null,
          etage: Number.isFinite(floorValue) ? floorValue : unit?.etage,
          prix_affiche_client: price || bien.prix_affiche_client || bien.prix_final || null,
          prix_final: price || bien.prix_final || null,
          balcon: Boolean(unit?.balcon),
          terrasse: Boolean(unit?.terrasse),
          climatisation: Boolean(unit?.climatisation),
          chauffage_central: Boolean(unit?.chauffage_central),
          cuisine_equipee: Boolean(unit?.cuisine_equipee),
          place_parking: Boolean(unit?.parking || unit?.garage),
          type_papier: unit?.titre_foncier_individuel ? "titre_foncier_individuel" : bien.type_papier,
          description: [bien.description, unit?.configuration, unit?.orientation, unit?.vue, `Unite de l'immeuble ${parentReference}`].filter(Boolean).join(" "),
        };
      });
    return [bien, ...units];
  });
}

function numericCriterionMatches(actual: number, criterion: MatchCriterion) {
  const expected = toMatchNumber(criterion.value);
  if (expected === null || actual <= 0) return false;
  const tolerance = Math.max(0, toMatchNumber(criterion.tolerance) || 0);
  if (criterion.rule === "min") return actual + tolerance >= expected;
  if (criterion.rule === "max") return actual - tolerance <= expected;
  if (criterion.rule === "between") {
    const max = toMatchNumber(criterion.tolerance);
    if (max === null) return actual >= expected;
    return actual >= Math.min(expected, max) && actual <= Math.max(expected, max);
  }
  if (criterion.rule === "tolerance") return Math.abs(actual - expected) <= tolerance;
  return Math.abs(actual - expected) <= tolerance;
}

function criterionMatches(bien: any, key: string, criterion: MatchCriterion) {
  if (criterion.importance === "ignore") return true;
  const definition = getSaleCharacteristicDefinition(key);
  if (definition?.kind === "number" || ["budget", "surface", "facade", "distanceBeach", "bedrooms", "bathrooms", "roadWidth", "apartments", "commercialUnits", "rentalYield", "storefrontWidth", "mainFacadeWidth", "roomsOffices", "sanitaryCount"].includes(key)) {
    return numericCriterionMatches(getSaleNumericValue(bien, key), criterion);
  }
  if (definition?.kind === "boolean" || ["garage", "pool", "beach", "balcony", "terrace", "airConditioning", "centralHeating", "equippedKitchen", "furnished", "residence", "securedResidence", "independent", "constructible", "title", "blueTitle", "corner", "elevator", "directAccess", "mainStreet", "activityAllowed", "openSpace", "reception", "kitchenette", "extraction", "fiberInternet"].includes(key)) {
    const wantsYes = normalizeText(criterion.value) !== "non";
    return getSaleBooleanValue(bien, key) === wantsYes;
  }
  const expected = normalizeText(criterion.value);
  if (!expected) return true;
  const actual = normalizeText(getSaleTextValue(bien, key));
  if (key === "propertyType" && expected === "maison") return actual === "villa_maison";
  const acceptedValues = expected.split(/[,;|]/).map((item) => item.trim()).filter(Boolean);
  return acceptedValues.length > 0
    ? acceptedValues.some((item) => actual.includes(item) || item.includes(actual))
    : actual.includes(expected) || expected.includes(actual);
}

function criterionLabel(key: string) {
  const definition = getSaleCharacteristicDefinition(key);
  if (definition) return definition.label;
  const labels: Record<string, string> = {
    operation: "Type d'operation",
    propertyType: "Type de bien",
    location: "Localisation",
    surface: "Surface terrain",
    facade: "Facade",
    distanceBeach: "Distance plage (m)",
    budget: "Budget",
    bedrooms: "Nombre de chambres",
    bathrooms: "Salles de bain",
    floor: "Etage",
    independent: "Maison independante",
    garage: "Garage / Parking",
    pool: "Piscine",
    beach: "Proche plage",
    balcony: "Balcon",
    terrace: "Terrasse",
    airConditioning: "Climatisation",
    centralHeating: "Chauffage central",
    equippedKitchen: "Cuisine equipee",
    furnished: "Meuble",
    residence: "Residence",
    securedResidence: "Residence gardee",
    landUse: "Vocation",
    constructible: "Constructible",
    title: "Titre foncier",
    blueTitle: "Titre bleu",
    access: "Acces",
    corner: "Coin de rue",
    roadWidth: "Largeur route/voies",
    apartments: "Nombre appartements",
    commercialUnits: "Locaux commerciaux",
    rentalYield: "Rendement brut (%)",
    elevator: "Ascenseur",
    storefrontWidth: "Largeur vitrine",
    mainFacadeWidth: "Largeur facade principale",
    roomsOffices: "Pieces / bureaux",
    sanitaryCount: "Sanitaires",
    directAccess: "Acces direct rue",
    mainStreet: "Rue principale",
    activityAllowed: "Activite autorisee",
    openSpace: "Open space",
    reception: "Reception",
    kitchenette: "Kitchenette",
    extraction: "Extraction possible",
    fiberInternet: "Fibre / Internet",
    other: "Autres criteres",
  };
  return labels[key] || key;
}

function computeMatchResults(request: BuyerMatchRequest, biens: any[]): MatchResult[] {
  const activeCriteria = Object.entries(request.criteria).filter(([, criterion]) => criterion.importance !== "ignore" && String(criterion.value || "").trim());
  return biens.map((bien) => {
    const blockedBy: string[] = [];
    const matched: string[] = [];
    const missed: string[] = [];
    let earned = 0;
    let possible = 0;
    activeCriteria.forEach(([key, criterion]) => {
      const ok = criterionMatches(bien, key, criterion);
      const label = criterionLabel(key);
      if (criterion.importance === "obligatoire" && !ok) blockedBy.push(label);
      if (criterion.importance !== "obligatoire") {
        const weight = criterion.importance === "important" ? 2 : 1;
        possible += weight;
        if (ok) earned += weight;
      }
      (ok ? matched : missed).push(label);
    });
    const optionalScore = possible > 0 ? Math.round((earned / possible) * 100) : 100;
    const requiredPenalty = blockedBy.length > 0 ? Math.max(0, 55 - blockedBy.length * 12) : 100;
    const score = blockedBy.length > 0 ? Math.min(optionalScore, requiredPenalty) : optionalScore;
    const label = score >= 90 ? "Excellente correspondance" : score >= 80 ? "Tres bonne correspondance" : score >= 70 ? "Bonne correspondance" : score >= 55 ? "Correspondance moyenne" : "Hors obligations";
    return { bien, score, label, passedRequired: blockedBy.length === 0, matched, missed, blockedBy };
  }).sort((a, b) => Number(b.passedRequired) - Number(a.passedRequired) || b.score - a.score);
}

export default function VentesAdminPage() {
  const { user } = useAuth();
  const { biens, updateBien, deleteBien, refreshData, isLoading: propertiesLoading } = useProperties();
  const [loading, setLoading] = useState(true);
  const [reloading, setReloading] = useState(false);
  const [demands, setDemands] = useState<SalesDemand[]>([]);
  const [clientFiles, setClientFiles] = useState<SalesClientFile[]>([]);
  const [selectedClientFileId, setSelectedClientFileId] = useState("");
  const [clientFileDraft, setClientFileDraft] = useState<SalesClientFile | null>(null);
  const [clientFileSaving, setClientFileSaving] = useState(false);
  const [clientFileReminderAction, setClientFileReminderAction] = useState<"schedule" | "send" | null>(null);
  const [ownerListingRequests, setOwnerListingRequests] = useState<OwnerSaleListingRequest[]>([]);
  const [ownerRequestMessages, setOwnerRequestMessages] = useState<Record<string, OwnerRequestMessage[]>>({});
  const [ownerRequestChatDrafts, setOwnerRequestChatDrafts] = useState<Record<string, string>>({});
  const [ownerRequestSendingId, setOwnerRequestSendingId] = useState<string | null>(null);
  const [ownerRequestActionId, setOwnerRequestActionId] = useState<string | null>(null);
  const [previewPhoto, setPreviewPhoto] = useState<{ url: string; title: string } | null>(null);
  const [drafts, setDrafts] = useState<Record<string, DemandDraft>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("clients");
  const [matchRequests, setMatchRequests] = useState<BuyerMatchRequest[]>(DEFAULT_MATCH_REQUESTS);
  const [selectedMatchRequestId, setSelectedMatchRequestId] = useState(DEFAULT_MATCH_REQUESTS[0]?.id || "");
  const [selectedReverseBienId, setSelectedReverseBienId] = useState("");
  const [search, setSearch] = useState("");
  const [salesStageFilter, setSalesStageFilter] = useState("");
  const [bienFilter, setBienFilter] = useState("");
  const [assignedFilter, setAssignedFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selectedCalendarMonth, setSelectedCalendarMonth] = useState(() => monthKeyFromDate(new Date()));
  const [selectedCalendarDate, setSelectedCalendarDate] = useState("");

  const venteBiens = useMemo(
    () => biens.filter((bien) => bien.mode === "vente").sort((a, b) => String(a.reference || "").localeCompare(String(b.reference || ""))),
    [biens]
  );

  const matchingBiens = useMemo(() => {
    const realSaleBiens = venteBiens.filter((bien) => bien.statut !== "vendu");
    return expandImmeubleUnitsForMatching(expandLotissementLotsForMatching(realSaleBiens.length > 0 ? realSaleBiens : DEMO_SALE_BIENS));
  }, [venteBiens]);

  const matchPropertyTypeOptions = useMemo(() => {
    const types = Array.from(new Set(matchingBiens.map((bien) => String(bien.type || "").trim()).filter(Boolean)));
    return types.map((type) => ({ value: type, label: getSaleTypeLabel(type) }));
  }, [matchingBiens]);

  const matchLocationOptions = useMemo(() => {
    const zones = Array.from(new Set(matchingBiens.map((bien) => String(bien.zone || bien.terrain_zone || "").trim()).filter(Boolean)));
    return zones.map((zone) => ({ value: zone, label: zone }));
  }, [matchingBiens]);

  const loadDemands = async (mode: "initial" | "refresh" = "initial") => {
    if (mode === "refresh") setReloading(true);
    else setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set("search", search.trim());
      if (salesStageFilter) params.set("sales_stage", salesStageFilter);
      if (bienFilter) params.set("bien_id", bienFilter);
      if (assignedFilter.trim()) params.set("assigned_admin_id", assignedFilter.trim());
      if (dateFrom) params.set("date_from", dateFrom);
      if (dateTo) params.set("date_to", dateTo);
      const [response, ownerRequestsResponse, clientFilesResponse] = await Promise.all([
        fetch(`${API_URL}/admin/sales-demands${params.toString() ? `?${params.toString()}` : ""}`, {
          credentials: "include",
          cache: "no-store",
        }).catch(() => null),
        fetch(`${API_URL}/admin/owner-sale-listing-requests`, {
          credentials: "include",
          cache: "no-store",
        }).catch(() => null),
        fetch(`${API_URL}/admin/sales-client-files`, {
          credentials: "include",
          cache: "no-store",
        }).catch(() => null),
      ]);
      const payload = response?.ok ? await response.json().catch(() => []) : [];
      const ownerRequestsPayload = ownerRequestsResponse?.ok ? await ownerRequestsResponse.json().catch(() => []) : [];
      const clientFilesPayload = clientFilesResponse?.ok ? await clientFilesResponse.json().catch(() => []) : [];
      const rows = Array.isArray(payload) ? payload : [];
      setDemands(rows);
      setOwnerListingRequests(Array.isArray(ownerRequestsPayload) ? ownerRequestsPayload : []);
      const fileRows = Array.isArray(clientFilesPayload) ? clientFilesPayload : [];
      setClientFiles(fileRows);
      if (!selectedClientFileId && fileRows[0]?.id) setSelectedClientFileId(fileRows[0].id);
      setDrafts((current) => {
        const next = { ...current };
        rows.forEach((row: SalesDemand) => {
          if (!next[row.id]) next[row.id] = getInitialDraft(row);
        });
        return next;
      });
      if (response && !response.ok) {
        const errorPayload = await response.json().catch(() => null);
        toast.error(String(errorPayload?.error || "Demandes visites ventes indisponibles"));
      }
      if (ownerRequestsResponse && !ownerRequestsResponse.ok) {
        const errorPayload = await ownerRequestsResponse.json().catch(() => null);
        toast.error(String(errorPayload?.error || "Demandes proprietaires indisponibles"));
      }
      if (clientFilesResponse && !clientFilesResponse.ok) {
        const errorPayload = await clientFilesResponse.json().catch(() => null);
        toast.error(String(errorPayload?.error || "Dossiers clients indisponibles"));
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Chargement ventes impossible");
    } finally {
      setLoading(false);
      setReloading(false);
    }
  };

  useEffect(() => {
    void loadDemands("initial");
  }, []);

  const assignedAdminOptions = useMemo(() => {
    const map = new Map<string, string>();
    demands.forEach((row) => {
      const id = String(row.visit_assigned_admin_id || "").trim();
      if (!id) return;
      map.set(id, String(row.visit_assigned_admin_name || id).trim());
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [demands]);

  const pipeline = useMemo(() => {
    return SALES_STAGE_OPTIONS.map((stage) => ({
      ...stage,
      items: demands.filter((row) => String(row.sales_stage || "nouvelle_demande") === stage.value),
    }));
  }, [demands]);

  const scheduledDemands = useMemo(
    () => demands.filter((row) => String(row.sales_stage || "") === "visite_planifiee").sort((a, b) => String(a.visit_preferred_date || "").localeCompare(String(b.visit_preferred_date || ""))),
    [demands]
  );

  const scheduledByDate = useMemo(() => {
    const map = new Map<string, SalesDemand[]>();
    scheduledDemands.forEach((row) => {
      const key = isoDate(row.visit_preferred_date);
      if (!key) return;
      const bucket = map.get(key) || [];
      bucket.push(row);
      map.set(key, bucket);
    });
    return map;
  }, [scheduledDemands]);

  const calendarCells = useMemo(() => buildMonthCalendar(selectedCalendarMonth), [selectedCalendarMonth]);

  const selectedDayDemands = useMemo(() => {
    if (!selectedCalendarDate) return [];
    return scheduledByDate.get(selectedCalendarDate) || [];
  }, [scheduledByDate, selectedCalendarDate]);

  useEffect(() => {
    if (scheduledDemands.length === 0) {
      setSelectedCalendarDate("");
      return;
    }
    const currentSelected = isoDate(selectedCalendarDate);
    if (currentSelected && scheduledByDate.has(currentSelected)) return;
    const firstScheduledDate = isoDate(scheduledDemands[0]?.visit_preferred_date);
    if (!firstScheduledDate) return;
    setSelectedCalendarDate(firstScheduledDate);
    setSelectedCalendarMonth(firstScheduledDate.slice(0, 7));
  }, [scheduledDemands, scheduledByDate, selectedCalendarDate]);

  const referenceStats = useMemo(() => ({
    total: venteBiens.length,
    visible: venteBiens.filter((bien) => bien.visible_sur_site !== false).length,
    terrains: venteBiens.filter((bien) => bien.type === "terrain").length,
    lotissements: venteBiens.filter((bien) => bien.type === "lotissement").length,
  }), [venteBiens]);

  const selectedClientFile = useMemo(
    () => clientFiles.find((file) => String(file.id) === String(selectedClientFileId)) || clientFiles[0] || null,
    [clientFiles, selectedClientFileId]
  );

  useEffect(() => {
    if (selectedClientFile) {
      setClientFileDraft({
        ...JSON.parse(JSON.stringify(selectedClientFile)),
        criteria: mergeCriteriaWithSaleCharacteristics(
          selectedClientFile.criteria,
          String((selectedClientFile.criteria || []).find((criterion) => criterion.key === "propertyType")?.value || "")
        ),
      });
    } else if (clientFiles.length === 0 && !clientFileDraft?.id) {
      setClientFileDraft(null);
    }
  }, [selectedClientFile?.id]);

  const createClientFile = () => {
    setClientFileDraft({
      id: "",
      client_name: "Nouveau client",
      client_phone: "",
      client_email: "",
      status: "nouveau",
      progress_stage: "qualification",
      last_contact_at: new Date().toISOString().slice(0, 10),
      interested_bien_ids: [],
      criteria: buildCriteriaFromSaleCharacteristics(),
      notes: "",
      outcome: null,
      reminder_task: "",
      reminder_at: "",
      reminder_emails: ["ghaithhafsi2@gmail.com"],
    });
    setSelectedClientFileId("");
    setActiveTab("clients");
  };

  const saveClientFile = async () => {
    if (!clientFileDraft) return null;
    setClientFileSaving(true);
    try {
      const isNew = !clientFileDraft.id;
      const response = await fetch(
        isNew ? `${API_URL}/admin/sales-client-files` : `${API_URL}/admin/sales-client-files/${encodeURIComponent(clientFileDraft.id)}`,
        {
          method: isNew ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            ...clientFileDraft,
            criteria: (clientFileDraft.criteria || []).map((criterion) => ({
              ...criterion,
              condition: criterion.rule || criterion.condition || "exact",
            })),
          }),
        }
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(String(payload?.error || "Sauvegarde dossier impossible"));
      toast.success("Dossier client sauvegarde");
      await loadDemands("refresh");
      if (payload?.id) setSelectedClientFileId(String(payload.id));
      return payload as SalesClientFile;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Sauvegarde dossier impossible");
      return null;
    } finally {
      setClientFileSaving(false);
    }
  };

  const runClientFileReminderAction = async (action: "schedule" | "send") => {
    if (!clientFileDraft) return;
    setClientFileReminderAction(action);
    try {
      const saved = await saveClientFile();
      if (!saved?.id) throw new Error("Sauvegarde du dossier requise avant le rappel");
      const id = String(saved.id || "").trim();
      if (!id) throw new Error("Sauvegardez le dossier avant de programmer le rappel");
      const endpoint = action === "schedule" ? "schedule" : "send-now";
      const response = await fetch(`${API_URL}/admin/sales-client-files/${encodeURIComponent(id)}/reminder/${endpoint}`, {
        method: "POST",
        credentials: "include",
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(String(payload?.error || "Action rappel impossible"));
      toast.success(action === "schedule" ? "Rappel programme" : "Rappel envoye");
      await loadDemands("refresh");
      if (payload?.file) setClientFileDraft(payload.file);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Action rappel impossible");
    } finally {
      setClientFileReminderAction(null);
    }
  };

  const updateClientCriterion = (index: number, patch: Partial<SalesClientCriterion>) => {
    setClientFileDraft((current) => {
      if (!current) return current;
      const criteria = [...(current.criteria || [])];
      criteria[index] = { ...criteria[index], ...patch };
      if (criteria[index]?.key === "propertyType") {
        return { ...current, criteria: mergeCriteriaWithSaleCharacteristics(criteria, String(criteria[index]?.value || "")) };
      }
      return { ...current, criteria };
    });
  };

  const selectedMatchRequest = useMemo(
    () => matchRequests.find((request) => request.id === selectedMatchRequestId) || matchRequests[0],
    [matchRequests, selectedMatchRequestId]
  );

  const matchResults = useMemo(
    () => selectedMatchRequest ? computeMatchResults(selectedMatchRequest, matchingBiens) : [],
    [selectedMatchRequest, matchingBiens]
  );
  const selectedMatchCriteriaEntries = useMemo(() => {
    if (!selectedMatchRequest) return [] as Array<[string, MatchCriterion]>;
    const propertyType = String(selectedMatchRequest.criteria.propertyType?.value || "");
    const allowedKeys = new Set(buildCriteriaFromSaleCharacteristics(propertyType).map((criterion) => criterion.key));
    const orderOf = (key: string) => {
      const index = SALE_CHARACTERISTIC_DEFINITIONS.findIndex((item) => item.key === key);
      return index >= 0 ? index : 999;
    };
    return Object.entries(selectedMatchRequest.criteria)
      .filter(([key]) => allowedKeys.has(key))
      .sort(([left], [right]) => orderOf(left) - orderOf(right));
  }, [selectedMatchRequest]);

  const selectedReverseBien = useMemo(
    () => matchingBiens.find((bien) => String(bien.id) === String(selectedReverseBienId)) || matchingBiens[0],
    [matchingBiens, selectedReverseBienId]
  );

  const reverseMatches = useMemo(() => {
    if (!selectedReverseBien) return [];
    return matchRequests
      .map((request) => ({ request, result: computeMatchResults(request, [selectedReverseBien])[0] }))
      .filter((item) => item.result)
      .sort((a, b) => Number(b.result.passedRequired) - Number(a.result.passedRequired) || b.result.score - a.result.score);
  }, [matchRequests, selectedReverseBien]);

  const salesStageStats = useMemo(() => SALES_STAGE_OPTIONS.map((stage) => ({
    label: stage.label,
    value: demands.filter((row) => String(row.sales_stage || "nouvelle_demande") === stage.value).length,
  })), [demands]);

  const saleTypeStats = useMemo(() => ["appartement", "villa_maison", "terrain", "lotissement", "immeuble", "local_commercial"].map((type) => ({
    label: getSaleTypeLabel(type),
    value: venteBiens.filter((bien) => String(bien.type || "") === type).length,
  })), [venteBiens]);

  const visitDayStats = useMemo(() => {
    const labels = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
    const stats = labels.map((label) => ({ label, value: 0 }));
    scheduledDemands.forEach((row) => {
      const raw = isoDate(row.visit_preferred_date);
      if (!raw) return;
      const date = new Date(`${raw}T12:00:00`);
      const index = (date.getDay() + 6) % 7;
      stats[index].value += 1;
    });
    return stats;
  }, [scheduledDemands]);

  const updateMatchCriterion = (requestId: string, key: string, patch: Partial<MatchCriterion>) => {
    setMatchRequests((current) => current.map((request) => (
      request.id === requestId
        ? (() => {
            const nextCriteria = { ...request.criteria, [key]: { ...(request.criteria[key] || { importance: "ignore", value: "" }), ...patch } };
            if (key !== "propertyType") return { ...request, criteria: nextCriteria };
            const generated = recordCriteriaFromClientCriteria(buildCriteriaFromSaleCharacteristics(String(nextCriteria.propertyType?.value || "")));
            return { ...request, criteria: { ...generated, ...nextCriteria } };
          })()
        : request
    )));
  };

  const createMatchRequest = () => {
    const id = `REQ-${String(matchRequests.length + 1).padStart(3, "0")}`;
    const next: BuyerMatchRequest = {
      id,
      clientName: "Nouveau client",
      phone: "",
      email: "",
      status: "Nouveau",
      criteria: recordCriteriaFromClientCriteria(buildCriteriaFromSaleCharacteristics()),
    };
    setMatchRequests((current) => [...current, next]);
    setSelectedMatchRequestId(id);
    setActiveTab("matching");
  };

  const renderMatchValueControl = (key: string, criterion: MatchCriterion) => {
    const baseClass = "h-10 w-full min-w-0 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100";
    const updateValue = (value: string) => updateMatchCriterion(selectedMatchRequest?.id || "", key, { value });
    if (key === "propertyType") {
      return (
        <select value={criterion.value} onChange={(event) => updateValue(event.target.value)} className={baseClass}>
          <option value="">Tous les types</option>
          {matchPropertyTypeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      );
    }
    if (key === "location") {
      return (
        <select value={criterion.value} onChange={(event) => updateValue(event.target.value)} className={baseClass}>
          <option value="">Toutes les zones</option>
          {matchLocationOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      );
    }
    if (["garage", "pool", "beach", "balcony", "terrace", "airConditioning", "centralHeating", "equippedKitchen", "furnished", "residence", "securedResidence", "independent", "constructible", "title", "blueTitle", "corner", "elevator", "directAccess", "mainStreet", "activityAllowed", "openSpace", "reception", "kitchenette", "extraction", "fiberInternet"].includes(key)) {
      return (
        <select value={criterion.value || "oui"} onChange={(event) => updateValue(event.target.value)} className={baseClass}>
          {YES_NO_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      );
    }
    if (key === "landUse") {
      return (
        <select value={criterion.value} onChange={(event) => updateValue(event.target.value)} className={baseClass}>
          <option value="">Toutes les vocations</option>
          <option value="habitation">Habitation</option>
          <option value="commercial">Commercial</option>
          <option value="touristique">Touristique</option>
          <option value="agricole">Agricole</option>
        </select>
      );
    }
    if (key === "access") {
      return (
        <select value={criterion.value} onChange={(event) => updateValue(event.target.value)} className={baseClass}>
          <option value="">Tous les acces</option>
          <option value="route_goudronnee">Route goudronnee</option>
          <option value="rue_residentielle">Rue residentielle</option>
          <option value="piste">Piste</option>
        </select>
      );
    }
    if (key === "bedrooms") {
      return (
        <select value={criterion.value} onChange={(event) => updateValue(event.target.value)} className={baseClass}>
          {BEDROOM_OPTIONS.map((value) => <option key={value} value={value}>{value === "0" ? "Studio / 0" : `${value} chambre${value === "1" ? "" : "s"}`}</option>)}
        </select>
      );
    }
    if (key === "floor") {
      return (
        <select value={criterion.value} onChange={(event) => updateValue(event.target.value)} className={baseClass}>
          <option value="">Indifferent</option>
          {FLOOR_OPTIONS.map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
      );
    }
    if (key === "operation") {
      return (
        <select value={criterion.value || "Achat"} onChange={(event) => updateValue(event.target.value)} className={baseClass}>
          <option value="Achat">Achat</option>
        </select>
      );
    }
    if (["budget", "surface", "facade", "distanceBeach", "bathrooms", "roadWidth", "apartments", "commercialUnits", "rentalYield", "storefrontWidth", "mainFacadeWidth", "roomsOffices", "sanitaryCount"].includes(key)) {
      return <input type="number" min="0" value={criterion.value} onChange={(event) => updateValue(event.target.value)} className={baseClass} />;
    }
    return <input value={criterion.value} onChange={(event) => updateValue(event.target.value)} className={baseClass} />;
  };

  const renderClientCriterionValueControl = (criterion: SalesClientCriterion, index: number) => {
    const definition = getSaleCharacteristicDefinition(criterion.key);
    const baseClass = "rounded-lg border border-gray-200 px-3 py-2";
    const updateValue = (value: string) => updateClientCriterion(index, { value });
    if (criterion.key === "propertyType") {
      return (
        <select value={criterion.value} onChange={(event) => updateValue(event.target.value)} className={baseClass}>
          <option value="">Tous les types</option>
          {matchPropertyTypeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      );
    }
    if (criterion.key === "location") {
      return (
        <select value={criterion.value} onChange={(event) => updateValue(event.target.value)} className={baseClass}>
          <option value="">Toutes les zones</option>
          {matchLocationOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      );
    }
    if (definition?.kind === "boolean") {
      return (
        <select value={criterion.value || "oui"} onChange={(event) => updateValue(event.target.value)} className={baseClass}>
          {YES_NO_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      );
    }
    if (criterion.key === "landUse") {
      return (
        <select value={criterion.value} onChange={(event) => updateValue(event.target.value)} className={baseClass}>
          <option value="">Toutes les vocations</option>
          <option value="habitation">Habitation</option>
          <option value="commercial">Commercial</option>
          <option value="touristique">Touristique</option>
          <option value="agricole">Agricole</option>
        </select>
      );
    }
    if (criterion.key === "access") {
      return (
        <select value={criterion.value} onChange={(event) => updateValue(event.target.value)} className={baseClass}>
          <option value="">Tous les acces</option>
          <option value="route_goudronnee">Route goudronnee</option>
          <option value="rue_residentielle">Rue residentielle</option>
          <option value="piste">Piste</option>
        </select>
      );
    }
    if (criterion.key === "bedrooms") {
      return (
        <select value={criterion.value} onChange={(event) => updateValue(event.target.value)} className={baseClass}>
          {BEDROOM_OPTIONS.map((value) => <option key={value} value={value}>{value === "0" ? "Studio / 0" : `${value} chambre${value === "1" ? "" : "s"}`}</option>)}
        </select>
      );
    }
    if (criterion.key === "floor") {
      return (
        <select value={criterion.value} onChange={(event) => updateValue(event.target.value)} className={baseClass}>
          <option value="">Indifferent</option>
          {FLOOR_OPTIONS.map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
      );
    }
    if (criterion.key === "operation") {
      return (
        <select value={criterion.value || "Achat"} onChange={(event) => updateValue(event.target.value)} className={baseClass}>
          <option value="Achat">Achat</option>
        </select>
      );
    }
    if (definition?.kind === "number") {
      return <input type="number" min="0" value={criterion.value} onChange={(event) => updateValue(event.target.value)} className={baseClass} />;
    }
    return <input value={criterion.value} onChange={(event) => updateValue(event.target.value)} placeholder="Valeur ou plusieurs valeurs separees par virgule" className={baseClass} />;
  };

  const updateDraft = (id: string, patch: Partial<DemandDraft>) => {
    setDrafts((current) => ({
      ...current,
      [id]: {
        ...(current[id] || {
          sales_stage: "nouvelle_demande",
          visit_preferred_date: "",
          visit_time_slot: "",
          visit_assigned_admin_id: "",
          sales_last_note: "",
        }),
        ...patch,
      },
    }));
  };

  const saveDemand = async (id: string) => {
    const draft = drafts[id];
    if (!draft) return;
    setSavingId(id);
    try {
      const response = await fetch(`${API_URL}/admin/sales-demands/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(draft),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(String(payload?.error || "Mise a jour impossible"));
      toast.success("Demande vente mise a jour");
      await loadDemands("refresh");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Mise a jour impossible");
    } finally {
      setSavingId(null);
    }
  };

  const scheduleDemand = async (id: string) => {
    const draft = drafts[id];
    if (!draft) return;
    setSavingId(id);
    try {
      const response = await fetch(`${API_URL}/admin/sales-demands/${encodeURIComponent(id)}/schedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          visit_preferred_date: draft.visit_preferred_date,
          visit_time_slot: draft.visit_time_slot,
          visit_assigned_admin_id: draft.visit_assigned_admin_id || user?.id || "",
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(String(payload?.error || "Planification impossible"));
      toast.success("Visite planifiee");
      await loadDemands("refresh");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Planification impossible");
    } finally {
      setSavingId(null);
    }
  };

  const closeDemand = async (id: string, stage: "vendu" | "perdu") => {
    const draft = drafts[id];
    setSavingId(id);
    try {
      const response = await fetch(`${API_URL}/admin/sales-demands/${encodeURIComponent(id)}/close`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          sales_stage: stage,
          sales_last_note: draft?.sales_last_note || "",
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(String(payload?.error || "Cloture impossible"));
      toast.success(stage === "vendu" ? "Demande marquee vendue" : "Demande marquee perdue");
      await loadDemands("refresh");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Cloture impossible");
    } finally {
      setSavingId(null);
    }
  };

  const updateOwnerListingRequest = async (id: string, patch: { status?: string; admin_note?: string }) => {
    setOwnerRequestActionId(id);
    try {
      const response = await fetch(`${API_URL}/admin/owner-sale-listing-requests/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(patch),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(String(payload?.error || "Mise a jour impossible"));
      toast.success("Demande proprietaire mise a jour");
      await loadDemands("refresh");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Mise a jour impossible");
    } finally {
      setOwnerRequestActionId(null);
    }
  };

  const deleteOwnerListingRequest = async (id: string) => {
    if (!window.confirm("Supprimer cette demande proprietaire ?")) return;
    setOwnerRequestActionId(id);
    try {
      const response = await fetch(`${API_URL}/admin/owner-sale-listing-requests/${encodeURIComponent(id)}`, {
        method: "DELETE",
        credentials: "include",
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(String(payload?.error || "Suppression impossible"));
      toast.success("Demande supprimee");
      await loadDemands("refresh");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Suppression impossible");
    } finally {
      setOwnerRequestActionId(null);
    }
  };

  const publishOwnerListingRequest = async (request: OwnerSaleListingRequest) => {
    const payload = request.payload || {};
    const photos = Array.isArray(request.photos) ? request.photos.filter(Boolean) : [];
    const price = Number(payload.prix_affiche_client || payload.prix_proprietaire || request.price_tnd || 0);
    const normalizedTypeRue = normalizeOwnerRequestTypeRue(payload.type_rue);
    const normalizedTypePapier = normalizeOwnerRequestTypePapier(payload.type_papier);
    const visitDays = Array.isArray(payload.visit_days) ? payload.visit_days.map((day) => String(day || "").trim()).filter(Boolean) : [];
    const bedrooms = Number(payload.nb_chambres || payload.bedrooms || 0);
    setOwnerRequestActionId(request.id);
    try {
      const existingBien = biens.find((bien) => String((bien.ui_config as any)?.owner_sale_request_id || "").trim() === String(request.id));
      if (existingBien) {
        const existingConfig = ((existingBien.location_saisonniere_config || {}) as any);
        const existingUiConfig = ((existingBien.ui_config || {}) as any);
        await updateBien({
          ...(existingBien as any),
          statut: "disponible",
          visible_sur_site: true,
          location_saisonniere_config: {
            ...existingConfig,
            ...(payload.maps_url ? { google_maps_embed_url: String(payload.maps_url || "").trim() } : {}),
            ...(visitDays.length > 0 ? { visite_jours_autorises: visitDays, visit_days: visitDays } : {}),
          },
          ui_config: {
            ...existingUiConfig,
            owner_sale_request_id: request.id,
            owner_sale_request_maps_url: payload.maps_url || existingUiConfig.owner_sale_request_maps_url || "",
            owner_sale_request_type_rue: payload.type_rue || existingUiConfig.owner_sale_request_type_rue || "",
            owner_sale_request_type_papier: payload.type_papier || existingUiConfig.owner_sale_request_type_papier || "",
            owner_sale_request_visit_days: visitDays.length > 0 ? visitDays : (existingUiConfig.owner_sale_request_visit_days || []),
          },
        } as any);
        await updateOwnerListingRequest(request.id, { status: "mise_en_ligne", admin_note: request.admin_note || "" });
        await refreshData();
        toast.success(`Reference mise en ligne: ${existingBien.reference || existingBien.id}`);
        return;
      }
      const createResponse = await fetch(`${API_URL}/biens`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          titre: request.title,
          description: String(payload.description || ""),
          mode: "vente",
          type: request.property_type,
          nb_chambres: bedrooms,
          nb_salle_bain: Number(payload.nb_salle_bain || payload.bathrooms || 0),
          prix_nuitee: price,
          prix_affiche_client: price,
          prix_proprietaire: price,
          tarification_methode: "avec_commission",
          modalite_paiement_vente: payload.modalite_paiement_vente || request.payment_mode || "comptant",
          type_rue: normalizedTypeRue,
          type_papier: normalizedTypePapier,
          superficie_m2: payload.superficie_m2 || null,
          etage: payload.etage || null,
          annee_construction: payload.annee_construction || null,
          distance_plage_m: payload.distance_plage_m || null,
          configuration: payload.configuration || (bedrooms ? `S+${bedrooms}` : null),
          surface_local_m2: payload.surface_local_m2 || null,
          facade_m: payload.facade_m || null,
          type_terrain: request.property_type === "lotissement" ? "lotissement" : "terrain",
          terrain_surface_m2: payload.terrain_surface_m2 || null,
          terrain_facade_m: payload.terrain_facade_m || null,
          terrain_type_sol: payload.terrain_type_sol || null,
          terrain_prix_affiche_total: price,
          location_saisonniere_config: (payload.maps_url || visitDays.length > 0)
            ? {
                ...(payload.maps_url ? { google_maps_embed_url: String(payload.maps_url || "").trim() } : {}),
                ...(visitDays.length > 0 ? { visite_jours_autorises: visitDays, visit_days: visitDays } : {}),
              }
            : null,
          ui_config: {
            owner_sale_request_id: request.id,
            owner_sale_request_maps_url: payload.maps_url || "",
            owner_sale_request_type_rue: payload.type_rue || "",
            owner_sale_request_type_papier: payload.type_papier || "",
            owner_sale_request_visit_days: visitDays,
          },
          statut: "disponible",
          visible_sur_site: true,
        }),
      });
      const created = await createResponse.json().catch(() => null);
      if (!createResponse.ok) throw new Error(String(created?.detail ? `${created?.error || "Creation du bien impossible"}: ${created.detail}` : created?.error || "Creation du bien impossible"));
      const bienId = String(created?.id || "").trim();
      if (bienId) {
        for (const [index, photo] of photos.entries()) {
          await fetch(`${API_URL}/media`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
              bien_id: bienId,
              type: "image",
              url: photo,
              position: index,
              motif_upload: index === 0 ? "photo_couverture" : "photo_proprietaire",
            }),
          }).catch(() => null);
        }
      }
      await updateOwnerListingRequest(request.id, { status: "mise_en_ligne", admin_note: request.admin_note || "" });
      await refreshData();
      toast.success("Bien publie sur le site");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Publication impossible");
    } finally {
      setOwnerRequestActionId(null);
    }
  };

  const deleteSaleReference = async (bienId: string) => {
    if (!window.confirm("Supprimer cette reference de vente ?")) return;
    setOwnerRequestActionId(bienId);
    try {
      await deleteBien(bienId);
      toast.success("Reference supprimee");
      await Promise.all([refreshData(), loadDemands("refresh")]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Suppression impossible");
    } finally {
      setOwnerRequestActionId(null);
    }
  };

  const loadOwnerRequestMessages = async (requestId: string) => {
    try {
      const response = await fetch(`${API_URL}/admin/owner-sale-listing-requests/${encodeURIComponent(requestId)}/messages`, {
        credentials: "include",
        cache: "no-store",
      });
      const rows = await response.json().catch(() => []);
      if (!response.ok) throw new Error(String(rows?.error || "Chat indisponible"));
      setOwnerRequestMessages((current) => ({ ...current, [requestId]: Array.isArray(rows) ? rows : [] }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Chat indisponible");
    }
  };

  const sendOwnerRequestMessage = async (requestId: string, attachment?: { url: string; name: string }) => {
    const message = String(ownerRequestChatDrafts[requestId] || "").trim();
    if (!message && !attachment?.url) return;
    setOwnerRequestSendingId(requestId);
    try {
      const response = await fetch(`${API_URL}/admin/owner-sale-listing-requests/${encodeURIComponent(requestId)}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          message,
          attachment_url: attachment?.url || "",
          attachment_name: attachment?.name || "",
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(String(payload?.error || "Message non envoye"));
      setOwnerRequestChatDrafts((current) => ({ ...current, [requestId]: "" }));
      await loadOwnerRequestMessages(requestId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Message non envoye");
    } finally {
      setOwnerRequestSendingId(null);
    }
  };

  const uploadOwnerRequestAttachment = async (requestId: string, file: File) => {
    setOwnerRequestSendingId(requestId);
    try {
      const formData = new FormData();
      formData.append("image", file);
      formData.append("upload_scope", "owner_sale_request_chat");
      formData.append("preferred_provider", "cloudflare");
      const response = await fetch(`${API_URL}/upload`, {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(String(payload?.error || "Piece jointe non envoyee"));
      const url = String(payload?.url || "").trim();
      if (!url) throw new Error("URL piece jointe indisponible");
      await sendOwnerRequestMessage(requestId, { url, name: file.name });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Piece jointe non envoyee");
    } finally {
      setOwnerRequestSendingId(null);
    }
  };

  useEffect(() => {
    ownerListingRequests.forEach((request) => {
      if (!ownerRequestMessages[request.id]) {
        void loadOwnerRequestMessages(request.id);
      }
    });
  }, [ownerListingRequests]);

  return (
    <div className="min-w-0 space-y-6 p-3 sm:p-4 md:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-700">Module ventes</p>
          <h1 className="mt-2 text-3xl font-bold text-gray-900">Pilotage commercial des visites</h1>
          <p className="mt-2 max-w-3xl text-sm text-gray-600">
            File des demandes de visite, planification des rendez-vous, pipeline commercial et references publiques des biens en vente.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to={buildSalesCreateHref("appartement")} className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800">
            <Plus className="h-4 w-4" />
            Nouveau bien vente
          </Link>
          <button
            type="button"
            onClick={createClientFile}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-800 transition hover:border-emerald-300"
          >
            <Users className="h-4 w-4" />
            Nouveau dossier client
          </button>
          <button
            type="button"
            onClick={() => void loadDemands("refresh")}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition hover:border-emerald-300 hover:text-emerald-700"
          >
            <RefreshCw className={`h-4 w-4 ${reloading ? "animate-spin" : ""}`} />
            Actualiser
          </button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid h-auto grid-cols-2 gap-2 rounded-2xl border border-gray-200 bg-white p-2 shadow-sm xl:grid-cols-5">
          <TabsTrigger value="clients" className="rounded-lg border border-gray-200 bg-white px-4 py-2 data-[state=active]:border-emerald-500 data-[state=active]:bg-emerald-50">Clients ventes</TabsTrigger>
          <TabsTrigger value="biens" className="rounded-lg border border-gray-200 bg-white px-4 py-2 data-[state=active]:border-emerald-500 data-[state=active]:bg-emerald-50">Biens</TabsTrigger>
          <TabsTrigger value="matching" className="rounded-lg border border-gray-200 bg-white px-4 py-2 data-[state=active]:border-emerald-500 data-[state=active]:bg-emerald-50">Matchings</TabsTrigger>
          <TabsTrigger value="calendrier" className="rounded-lg border border-gray-200 bg-white px-4 py-2 data-[state=active]:border-emerald-500 data-[state=active]:bg-emerald-50">Calendriers</TabsTrigger>
          <TabsTrigger value="stats" className="rounded-lg border border-gray-200 bg-white px-4 py-2 data-[state=active]:border-emerald-500 data-[state=active]:bg-emerald-50">Stats</TabsTrigger>
        </TabsList>

        <TabsContent value="clients" className="mt-6 space-y-4">
          <section className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-bold text-slate-950">Dossiers clients</h2>
                <button type="button" onClick={createClientFile} className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700">
                  Nouveau
                </button>
              </div>
              <div className="mt-3 space-y-2">
                {clientFiles.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-4 text-sm text-gray-500">Aucun dossier client sauvegarde.</div>
                ) : clientFiles.map((file) => (
                  <button
                    key={file.id}
                    type="button"
                    onClick={() => setSelectedClientFileId(file.id)}
                    className={`w-full rounded-lg border p-3 text-left transition ${selectedClientFile?.id === file.id ? "border-emerald-400 bg-emerald-50" : "border-gray-200 bg-white hover:border-emerald-200"}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold text-slate-950">{file.client_name}</p>
                      <span className="rounded bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">{statusLabel(file.status)}</span>
                    </div>
                    <p className="mt-1 text-sm text-gray-600">{file.client_phone || "Telephone a completer"}</p>
                    <p className="mt-1 text-xs text-gray-500">Dernier contact: {dateLabel(file.last_contact_at)}</p>
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              {clientFileDraft ? (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h2 className="text-lg font-bold text-slate-950">{clientFileDraft.id ? "Dossier client ouvert" : "Nouveau dossier client"}</h2>
                    <button type="button" disabled={clientFileSaving} onClick={() => void saveClientFile()} className="inline-flex items-center gap-2 rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
                      <Save className="h-4 w-4" />
                      Sauvegarder
                    </button>
                  </div>
                  <div className="grid gap-3 md:grid-cols-3">
                    <label className="grid gap-1 text-sm font-medium text-gray-700">Nom client<input value={clientFileDraft.client_name} onChange={(event) => setClientFileDraft({ ...clientFileDraft, client_name: event.target.value })} className="rounded-lg border border-gray-200 px-3 py-2" /></label>
                    <label className="grid gap-1 text-sm font-medium text-gray-700">Telephone<input value={clientFileDraft.client_phone} onChange={(event) => setClientFileDraft({ ...clientFileDraft, client_phone: event.target.value })} className="rounded-lg border border-gray-200 px-3 py-2" /></label>
                    <label className="grid gap-1 text-sm font-medium text-gray-700">Email<input value={clientFileDraft.client_email || ""} onChange={(event) => setClientFileDraft({ ...clientFileDraft, client_email: event.target.value })} className="rounded-lg border border-gray-200 px-3 py-2" /></label>
                    <label className="grid gap-1 text-sm font-medium text-gray-700">Statut<select value={clientFileDraft.status} onChange={(event) => setClientFileDraft({ ...clientFileDraft, status: event.target.value, outcome: event.target.value === "success" || event.target.value === "echec" ? event.target.value : clientFileDraft.outcome })} className="rounded-lg border border-gray-200 px-3 py-2"><option value="nouveau">Nouveau</option><option value="recherche">Recherche</option><option value="visite">Visite</option><option value="negociation">Negociation</option><option value="success">Success</option><option value="echec">Echec</option></select></label>
                    <label className="grid gap-1 text-sm font-medium text-gray-700">Avancement<input value={clientFileDraft.progress_stage} onChange={(event) => setClientFileDraft({ ...clientFileDraft, progress_stage: event.target.value })} className="rounded-lg border border-gray-200 px-3 py-2" /></label>
                    <label className="grid gap-1 text-sm font-medium text-gray-700">Dernier contact<input type="date" value={String(clientFileDraft.last_contact_at || "").slice(0, 10)} onChange={(event) => setClientFileDraft({ ...clientFileDraft, last_contact_at: event.target.value })} className="rounded-lg border border-gray-200 px-3 py-2" /></label>
                  </div>
                  <div>
                    <p className="mb-2 text-sm font-bold text-slate-900">Biens interesses</p>
                    <select value="" onChange={(event) => {
                      const id = event.target.value;
                      if (!id || clientFileDraft.interested_bien_ids.includes(id)) return;
                      setClientFileDraft({ ...clientFileDraft, interested_bien_ids: [...clientFileDraft.interested_bien_ids, id] });
                    }} className="rounded-lg border border-gray-200 px-3 py-2 text-sm">
                      <option value="">Ajouter un bien</option>
                      {venteBiens.map((bien) => <option key={bien.id} value={bien.id}>{bien.reference || bien.id} - {bien.titre}</option>)}
                    </select>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {clientFileDraft.interested_bien_ids.map((id) => {
                        const bien = venteBiens.find((item) => String(item.id) === String(id));
                        return (
                          <button key={id} type="button" onClick={() => setClientFileDraft({ ...clientFileDraft, interested_bien_ids: clientFileDraft.interested_bien_ids.filter((item) => item !== id) })} className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800">
                            {(bien?.reference || id)} x
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div className="overflow-x-auto rounded-lg border border-gray-200">
                    <table className="w-full min-w-[780px] text-left text-sm">
                      <thead className="bg-gray-50 text-xs text-gray-500"><tr><th className="px-3 py-2">Critere</th><th className="px-3 py-2">Valeur / condition matching</th><th className="px-3 py-2">Importance</th></tr></thead>
                      <tbody className="divide-y divide-gray-100">
                        {clientFileDraft.criteria.map((criterion, index) => {
                          const definition = getSaleCharacteristicDefinition(criterion.key);
                          const isNumeric = definition?.kind === "number";
                          return (
                          <tr key={criterion.key}>
                            <td className="px-3 py-2 font-semibold text-slate-800">{criterion.label}</td>
                            <td className="px-3 py-2">
                              <div className="grid gap-2 md:grid-cols-[1fr_160px_120px]">
                                {renderClientCriterionValueControl(criterion, index)}
                                {isNumeric ? <select value={criterion.rule || "exact"} onChange={(event) => updateClientCriterion(index, { rule: event.target.value as NumericRule })} className="rounded-lg border border-gray-200 px-3 py-2">
                                  {Object.entries(MATCH_NUMERIC_RULE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                                </select> : <span className="rounded-lg bg-gray-50 px-3 py-2 text-gray-400">=</span>}
                                {isNumeric ? <input value={criterion.tolerance || ""} onChange={(event) => updateClientCriterion(index, { tolerance: event.target.value })} placeholder={criterion.rule === "between" ? "Max" : "+/-"} className="rounded-lg border border-gray-200 px-3 py-2" /> : <span className="rounded-lg bg-gray-50 px-3 py-2 text-gray-400">-</span>}
                              </div>
                            </td>
                            <td className="px-3 py-2"><select value={criterion.importance} onChange={(event) => updateClientCriterion(index, { importance: event.target.value as MatchImportance })} className={`rounded-lg border px-3 py-2 font-semibold ${MATCH_IMPORTANCE_STYLES[criterion.importance]}`}>{Object.entries(MATCH_IMPORTANCE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></td>
                          </tr>
                        );})}
                      </tbody>
                    </table>
                  </div>
                  <label className="grid gap-1 text-sm font-medium text-gray-700">Notes<textarea value={clientFileDraft.notes || ""} onChange={(event) => setClientFileDraft({ ...clientFileDraft, notes: event.target.value })} rows={4} className="rounded-lg border border-gray-200 px-3 py-2" /></label>
                  <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">Alarme dossier</p>
                        <h3 className="text-base font-bold text-slate-950">Rappel reserve aux admins</h3>
                      </div>
                      <CalendarDays className="h-5 w-5 text-amber-700" />
                    </div>
                    <div className="mt-3 grid gap-3 md:grid-cols-[1fr_220px]">
                      <label className="grid gap-1 text-sm font-medium text-gray-700">Tache a rappeler<input value={clientFileDraft.reminder_task || ""} onChange={(event) => setClientFileDraft({ ...clientFileDraft, reminder_task: event.target.value })} placeholder="Ex: rappeler le client pour confirmer budget" className="rounded-lg border border-amber-200 bg-white px-3 py-2" /></label>
                      <label className="grid gap-1 text-sm font-medium text-gray-700">Date et heure<input type="datetime-local" value={String(clientFileDraft.reminder_at || "").slice(0, 16)} onChange={(event) => setClientFileDraft({ ...clientFileDraft, reminder_at: event.target.value })} className="rounded-lg border border-amber-200 bg-white px-3 py-2" /></label>
                    </div>
                    <label className="mt-3 grid gap-1 text-sm font-medium text-gray-700">
                      Emails admins a notifier
                      <textarea value={(clientFileDraft.reminder_emails || ["ghaithhafsi2@gmail.com"]).join(", ")} onChange={(event) => setClientFileDraft({ ...clientFileDraft, reminder_emails: event.target.value.split(/[,\n;]/).map((item) => item.trim()).filter(Boolean) })} rows={2} placeholder="ghaithhafsi2@gmail.com, admin2@example.com" className="rounded-lg border border-amber-200 bg-white px-3 py-2" />
                    </label>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        disabled={!!clientFileReminderAction || clientFileSaving}
                        onClick={() => void runClientFileReminderAction("schedule")}
                        className="inline-flex items-center gap-2 rounded-lg border border-amber-300 bg-white px-4 py-2 text-sm font-semibold text-amber-800 transition hover:bg-amber-100 disabled:opacity-60"
                      >
                        <CalendarDays className="h-4 w-4" />
                        {clientFileReminderAction === "schedule" ? "Programmation..." : "Lancer l'envoi programme"}
                      </button>
                      <button
                        type="button"
                        disabled={!!clientFileReminderAction || clientFileSaving}
                        onClick={() => void runClientFileReminderAction("send")}
                        className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-amber-700 disabled:opacity-60"
                      >
                        <Send className="h-4 w-4" />
                        {clientFileReminderAction === "send" ? "Envoi..." : "Envoyer maintenant"}
                      </button>
                      {clientFileDraft.reminder_sent_at ? (
                        <span className="text-xs font-semibold text-emerald-700">Dernier envoi: {dateLabel(clientFileDraft.reminder_sent_at)}</span>
                      ) : (
                        <span className="text-xs text-amber-700">Aucun rappel envoye.</span>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-8 text-center text-sm text-gray-500">Selectionnez ou creez un dossier client.</div>
              )}
            </div>
          </section>

          <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
              <label className="grid gap-1 text-sm text-gray-700">
                <span className="inline-flex items-center gap-2 font-medium"><Filter className="h-4 w-4" />Recherche</span>
                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ID demande, client, ref, bien" className="rounded-lg border border-gray-200 px-3 py-2" />
              </label>
              <label className="grid gap-1 text-sm text-gray-700">
                <span className="font-medium">Etape</span>
                <select value={salesStageFilter} onChange={(event) => setSalesStageFilter(event.target.value)} className="rounded-lg border border-gray-200 px-3 py-2">
                  <option value="">Toutes</option>
                  {SALES_STAGE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
              <label className="grid gap-1 text-sm text-gray-700">
                <span className="font-medium">Bien</span>
                <select value={bienFilter} onChange={(event) => setBienFilter(event.target.value)} className="rounded-lg border border-gray-200 px-3 py-2">
                  <option value="">Tous</option>
                  {venteBiens.map((bien) => <option key={bien.id} value={bien.id}>{bien.reference} - {bien.titre}</option>)}
                </select>
              </label>
              <label className="grid gap-1 text-sm text-gray-700">
                <span className="font-medium">Commercial</span>
                <select value={assignedFilter} onChange={(event) => setAssignedFilter(event.target.value)} className="rounded-lg border border-gray-200 px-3 py-2">
                  <option value="">Tous</option>
                  {assignedAdminOptions.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
                </select>
              </label>
              <label className="grid gap-1 text-sm text-gray-700">
                <span className="font-medium">Date debut</span>
                <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} className="rounded-lg border border-gray-200 px-3 py-2" />
              </label>
              <label className="grid gap-1 text-sm text-gray-700">
                <span className="font-medium">Date fin</span>
                <input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} className="rounded-lg border border-gray-200 px-3 py-2" />
              </label>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" onClick={() => void loadDemands("refresh")} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700">Appliquer</button>
              <button type="button" onClick={() => {
                setSearch("");
                setSalesStageFilter("");
                setBienFilter("");
                setAssignedFilter("");
                setDateFrom("");
                setDateTo("");
                void loadDemands("refresh");
              }} className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:border-gray-300">Reinitialiser</button>
            </div>
          </section>

          {loading ? (
            <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">Chargement des demandes ventes...</div>
          ) : demands.length === 0 ? (
            <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">Aucune demande vente.</div>
          ) : (
            demands.map((row) => {
              const draft = drafts[row.id] || getInitialDraft(row);
              return (
                <div key={row.id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1 rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white">
                          <Hash className="h-3.5 w-3.5" />
                          Demande #{row.id}
                        </span>
                        <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">{row.bien_reference || row.bien_id}</span>
                        <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-700">{stageLabel(row.sales_stage)}</span>
                        <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">{statusLabel(row.status)}</span>
                      </div>
                      <h3 className="text-lg font-bold text-gray-900">{row.bien_titre || "Bien vente"}</h3>
                      <div className="grid gap-1 text-sm text-gray-600 md:grid-cols-2">
                        <p><span className="font-medium text-gray-900">Client:</span> {row.client_name || "-"}</p>
                        <p><span className="font-medium text-gray-900">Email:</span> {row.client_email || "-"}</p>
                        <p><span className="font-medium text-gray-900">Telephone:</span> {row.client_phone || "-"}</p>
                        <p><span className="font-medium text-gray-900">Creee le:</span> {dateLabel(row.created_at)}</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => updateDraft(row.id, { visit_assigned_admin_id: String(user?.id || "") })} className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700 hover:border-emerald-300 hover:text-emerald-700">M'affecter</button>
                      <button type="button" onClick={() => void closeDemand(row.id, "vendu")} disabled={savingId === row.id} className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60">Marquer vendu</button>
                      <button type="button" onClick={() => void closeDemand(row.id, "perdu")} disabled={savingId === row.id} className="rounded-lg bg-rose-600 px-3 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-60">Marquer perdu</button>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 lg:grid-cols-5">
                    <label className="grid gap-1 text-sm text-gray-700">
                      <span className="font-medium">Etape</span>
                      <select value={draft.sales_stage} onChange={(event) => updateDraft(row.id, { sales_stage: event.target.value as SalesStage })} className="rounded-lg border border-gray-200 px-3 py-2">
                        {SALES_STAGE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                      </select>
                    </label>
                    <label className="grid gap-1 text-sm text-gray-700">
                      <span className="font-medium">Date visite</span>
                      <input type="date" value={draft.visit_preferred_date} onChange={(event) => updateDraft(row.id, { visit_preferred_date: event.target.value })} className="rounded-lg border border-gray-200 px-3 py-2" />
                    </label>
                    <label className="grid gap-1 text-sm text-gray-700">
                      <span className="font-medium">Creneau</span>
                      <select value={draft.visit_time_slot} onChange={(event) => updateDraft(row.id, { visit_time_slot: event.target.value })} className="rounded-lg border border-gray-200 px-3 py-2">
                        <option value="">Choisir</option>
                        {TIME_SLOT_OPTIONS.map((slot) => <option key={slot} value={slot}>{slot}</option>)}
                      </select>
                    </label>
                    <label className="grid gap-1 text-sm text-gray-700">
                      <span className="font-medium">Commercial (id)</span>
                      <input value={draft.visit_assigned_admin_id} onChange={(event) => updateDraft(row.id, { visit_assigned_admin_id: event.target.value })} placeholder={row.visit_assigned_admin_name || "Affectation"} className="rounded-lg border border-gray-200 px-3 py-2" />
                    </label>
                    <div className="grid gap-2 self-end">
                      <button type="button" onClick={() => void saveDemand(row.id)} disabled={savingId === row.id} className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700 hover:border-emerald-300 hover:text-emerald-700 disabled:opacity-60">
                        <Save className="h-4 w-4" />
                        Sauvegarder
                      </button>
                      <button type="button" onClick={() => void scheduleDemand(row.id)} disabled={savingId === row.id} className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60">
                        <CalendarDays className="h-4 w-4" />
                        Planifier
                      </button>
                    </div>
                  </div>

                  <label className="mt-3 grid gap-1 text-sm text-gray-700">
                    <span className="font-medium">Note commerciale</span>
                    <textarea value={draft.sales_last_note} onChange={(event) => updateDraft(row.id, { sales_last_note: event.target.value })} rows={3} className="rounded-lg border border-gray-200 px-3 py-2" placeholder="Compte-rendu, besoin client, suivi..." />
                  </label>
                </div>
              );
            })
          )}
        </TabsContent>

        <TabsContent value="calendrier" className="mt-6">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(360px,0.8fr)]">
            <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
              <div className="mb-4 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setSelectedCalendarMonth((current) => shiftMonthKey(current, -1))}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 text-gray-700 transition hover:border-emerald-300 hover:text-emerald-700"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <div className="text-center">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700">Calendrier des visites</p>
                  <h3 className="mt-1 text-xl font-bold capitalize text-slate-950">{monthLabel(selectedCalendarMonth)}</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedCalendarMonth((current) => shiftMonthKey(current, 1))}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 text-gray-700 transition hover:border-emerald-300 hover:text-emerald-700"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>

              <div className="grid grid-cols-7 gap-2 text-center text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                {["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"].map((label) => (
                  <div key={label} className="py-2">{label}</div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-2">
                {calendarCells.map((cell, index) => {
                  if (!cell.date || !cell.day) {
                    return <div key={`empty-${index}`} className="aspect-square rounded-2xl bg-slate-50/60" />;
                  }
                  const dayVisits = scheduledByDate.get(cell.date) || [];
                  const isSelected = cell.date === selectedCalendarDate;
                  return (
                    <button
                      key={cell.date}
                      type="button"
                      onClick={() => setSelectedCalendarDate(cell.date || "")}
                      className={`relative aspect-square rounded-2xl border p-2 text-left transition ${
                        isSelected
                          ? "border-emerald-500 bg-emerald-600 text-white shadow-[0_14px_30px_rgba(16,185,129,0.2)]"
                          : dayVisits.length > 0
                            ? "border-emerald-200 bg-emerald-50 text-emerald-950 hover:border-emerald-300"
                            : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                      }`}
                    >
                      <span className={`text-sm font-semibold ${isSelected ? "text-white" : "text-current"}`}>{cell.day}</span>
                      {dayVisits.length > 0 ? (
                        <span className={`absolute bottom-2 left-2 inline-flex min-w-7 items-center justify-center rounded-full px-2 py-1 text-[11px] font-semibold ${
                          isSelected ? "bg-white/18 text-white" : "bg-emerald-600 text-white"
                        }`}>
                          {dayVisits.length}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-700">Jour selectionne</p>
                  <h3 className="mt-1 text-xl font-bold text-slate-950">
                    {selectedCalendarDate ? dateLabel(selectedCalendarDate) : "Aucune date"}
                  </h3>
                </div>
                {selectedCalendarDate ? (
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                    {(selectedDayDemands || []).length} visite{selectedDayDemands.length > 1 ? "s" : ""}
                  </span>
                ) : null}
              </div>

              <div className="mt-4">
            {scheduledDemands.length === 0 ? (
                <p className="text-sm text-gray-500">Aucune visite planifiee.</p>
              ) : selectedDayDemands.length === 0 ? (
                <p className="text-sm text-gray-500">Aucune visite pour cette date.</p>
              ) : (
                <div className="space-y-3">
                  {selectedDayDemands.map((row) => (
                    <div key={row.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1 rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white">
                          <Hash className="h-3.5 w-3.5" />
                          Demande #{row.id}
                        </span>
                        <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
                          {row.bien_reference || row.bien_id}
                        </span>
                      </div>
                      <p className="mt-3 text-base font-bold text-slate-950">{row.bien_titre || "Bien vente"}</p>
                      <div className="mt-3 grid gap-2 text-sm text-slate-600">
                        <p className="inline-flex items-center gap-2"><Clock3 className="h-4 w-4 text-amber-600" />{row.visit_time_slot || "Creneau a confirmer"}</p>
                        <p className="inline-flex items-center gap-2"><UserCheck className="h-4 w-4 text-emerald-600" />{row.client_name || "Client"}</p>
                        <p className="inline-flex items-center gap-2"><Phone className="h-4 w-4 text-sky-600" />{row.client_phone || "-"}</p>
                        <p className="inline-flex items-center gap-2"><Mail className="h-4 w-4 text-violet-600" />{row.client_email || "-"}</p>
                      </div>
                      <p className="mt-3 text-xs text-slate-500">
                        Commercial: {row.visit_assigned_admin_name || row.visit_assigned_admin_id || "Non affecte"}
                      </p>
                    </div>
                  ))}
                </div>
              )}
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="clients" className="mt-6">
          {ownerListingRequests.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500">Aucune demande proprietaire pour le moment.</div>
          ) : (
            <div className="grid gap-5">
              {ownerListingRequests.map((request) => {
                const payload = request.payload || {};
                const photos = Array.isArray(request.photos) ? request.photos : [];
                return (
                  <article key={request.id} className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_18px_45px_rgba(15,23,42,0.06)]">
                    <div className="grid gap-0 lg:grid-cols-[300px_minmax(0,1fr)_360px]">
                      <div className="grid h-72 grid-cols-2 gap-1 bg-slate-100 p-2 lg:h-auto">
                        {(photos.length > 0 ? photos.slice(0, 4) : [null]).map((photo, index) => (
                          <div key={`${request.id}-photo-${index}`} className="overflow-hidden rounded-2xl bg-slate-200">
                            {photo ? (
                              <button type="button" onClick={() => setPreviewPhoto({ url: resolveMediaUrl(photo), title: `${request.title} - photo ${index + 1}` })} className="h-full w-full">
                                <img src={resolveMediaUrl(photo)} alt={request.title} className="h-full min-h-32 w-full object-cover transition hover:scale-[1.02]" />
                              </button>
                            ) : <div className="flex h-full min-h-32 items-center justify-center text-xs text-slate-500">Photo</div>}
                          </div>
                        ))}
                      </div>
                      <div className="space-y-4 p-5">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700">Soumission proprietaire</p>
                            <h3 className="mt-1 text-xl font-bold text-slate-950">{request.title}</h3>
                            <p className="mt-1 text-sm text-slate-600">{getSaleTypeLabel(request.property_type)} - {request.region}, {request.zone}</p>
                          </div>
                          <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">{statusLabel(request.status)}</span>
                        </div>
                        <div className="grid gap-3 text-sm md:grid-cols-3">
                          <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Prix</p><p className="font-bold text-slate-950">{formatCurrency(Number(payload.prix_affiche_client || request.price_tnd || 0))}</p></div>
                          <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Surface</p><p className="font-bold text-slate-950">{Number(request.surface_m2 || 0).toLocaleString("fr-FR")} m2</p></div>
                          <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Paiement</p><p className="font-bold text-slate-950">{payload.modalite_paiement_vente === "facilite" || request.payment_mode === "facilite" ? "Facilite" : "Comptant"}</p></div>
                        </div>
                        <div className="grid gap-2 text-sm text-slate-700 md:grid-cols-2">
                          <p><span className="font-semibold">Proprietaire:</span> {request.owner_name}</p>
                          <p><span className="font-semibold">Telephone:</span> {request.owner_phone}</p>
                          <p><span className="font-semibold">Email:</span> {request.owner_email}</p>
                          <p><span className="font-semibold">Creee:</span> {dateLabel(request.created_at)}</p>
                        </div>
                        <p className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">{String(payload.description || "-")}</p>
                        <div className="grid gap-2 text-xs text-slate-600 md:grid-cols-2">
                          <p><span className="font-semibold">Adresse:</span> {request.address}</p>
                          <p><span className="font-semibold">Type de rue:</span> {String(payload.type_rue || "-")}</p>
                          <p><span className="font-semibold">Type de papier:</span> {String(payload.type_papier || "-")}</p>
                          <p><span className="font-semibold">Type de sol:</span> {String(payload.terrain_type_sol || "-")}</p>
                          <p><span className="font-semibold">Disponibilite:</span> {String(payload.availability || "-")}</p>
                          <p><span className="font-semibold">Photos:</span> {photos.length}</p>
                        </div>
                      </div>
                      <aside className="space-y-4 border-t border-slate-100 bg-slate-50/70 p-5 lg:border-l lg:border-t-0">
                        <textarea
                          defaultValue={String(request.admin_note || "")}
                          onBlur={(event) => void updateOwnerListingRequest(request.id, { admin_note: event.target.value })}
                          rows={3}
                          placeholder="Note admin avant validation..."
                          className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm"
                        />
                        <div className="rounded-2xl border border-slate-200 bg-white p-3">
                          <div className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-700">
                            <MessageCircle className="h-4 w-4" />
                            Chat proprietaire
                          </div>
                          <div className="mt-3 max-h-48 space-y-2 overflow-y-auto">
                            {(ownerRequestMessages[request.id] || []).length === 0 ? (
                              <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-500">Aucun message.</p>
                            ) : (ownerRequestMessages[request.id] || []).map((message) => (
                              <div key={message.id} className={`rounded-xl p-3 text-sm ${message.sender_role === "admin" ? "bg-emerald-50 text-emerald-950" : "bg-slate-100 text-slate-800"}`}>
                                <p className="text-xs font-semibold uppercase tracking-[0.14em] opacity-70">{message.sender_role === "admin" ? "Admin" : "Proprietaire"}</p>
                                {message.message_text ? <p className="mt-1">{message.message_text}</p> : null}
                                {message.attachment_url ? <a href={resolveMediaUrl(message.attachment_url)} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-2 font-semibold underline"><Paperclip className="h-4 w-4" />{message.attachment_name || "Piece jointe"}</a> : null}
                              </div>
                            ))}
                          </div>
                          <div className="mt-3 flex gap-2">
                            <input
                              value={ownerRequestChatDrafts[request.id] || ""}
                              onChange={(event) => setOwnerRequestChatDrafts((current) => ({ ...current, [request.id]: event.target.value }))}
                              placeholder="Message au proprietaire"
                              className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                            />
                            <label className="inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-100">
                              <UploadCloud className="h-4 w-4" />
                              <input type="file" className="hidden" onChange={(event) => {
                                const file = event.target.files?.[0];
                                event.target.value = "";
                                if (file) void uploadOwnerRequestAttachment(request.id, file);
                              }} />
                            </label>
                            <button type="button" disabled={ownerRequestSendingId === request.id} onClick={() => void sendOwnerRequestMessage(request.id)} className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-slate-950 text-white disabled:opacity-50">
                              <Send className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
                          <button type="button" disabled={ownerRequestActionId === request.id} onClick={() => void updateOwnerListingRequest(request.id, { status: "validee" })} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60">
                            <CheckCircle2 className="h-4 w-4" />
                            Valider
                          </button>
                          <button type="button" disabled={ownerRequestActionId === request.id} onClick={() => void publishOwnerListingRequest(request)} className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60">
                            <Eye className="h-4 w-4" />
                            Mettre en ligne
                          </button>
                          <button type="button" disabled={ownerRequestActionId === request.id} onClick={() => void updateOwnerListingRequest(request.id, { status: "rejetee" })} className="inline-flex items-center justify-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800 transition hover:bg-amber-100 disabled:opacity-60">
                            <XCircle className="h-4 w-4" />
                            Rejeter
                          </button>
                          <Link to={buildOwnerRequestCreateHref(request)} className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800">
                            <Plus className="h-4 w-4" />
                            Creer/modifier avant mise en ligne
                          </Link>
                          <button type="button" disabled={ownerRequestActionId === request.id} onClick={() => void deleteOwnerListingRequest(request.id)} className="inline-flex items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 transition hover:bg-rose-100 disabled:opacity-60">
                            <XCircle className="h-4 w-4" />
                            Supprimer
                          </button>
                        </div>
                      </aside>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="matching" className="mt-6 space-y-5">
          <div className="flex justify-end">
            <button
              type="button"
              onClick={createMatchRequest}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-800 transition hover:border-emerald-300"
            >
              <Target className="h-4 w-4" />
              Nouvelle demande matching
            </button>
          </div>
          {venteBiens.filter((bien) => bien.statut !== "vendu").length === 0 ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
              Apercu avec biens de demonstration. Ajoutez un bien en mode vente pour lancer le matching sur le catalogue reel.
            </div>
          ) : null}
          <div className="grid min-w-0 gap-4 2xl:grid-cols-[minmax(560px,0.88fr)_minmax(0,1.12fr)]">
            <section className="min-w-0 overflow-hidden rounded-lg border border-emerald-100 bg-white shadow-sm">
              <div className="flex flex-col gap-3 border-b border-emerald-100 bg-emerald-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-emerald-700 text-white">
                    <UserCheck className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-800">Informations du client</p>
                    <h2 className="text-lg font-bold text-slate-950">Demande client</h2>
                  </div>
                </div>
                <select value={selectedMatchRequest?.id || ""} onChange={(event) => setSelectedMatchRequestId(event.target.value)} className="min-w-0 rounded-md border border-emerald-200 bg-white px-3 py-2 text-sm font-semibold">
                  {matchRequests.map((request) => <option key={request.id} value={request.id}>{request.clientName} - {request.id}</option>)}
                </select>
              </div>

              {selectedMatchRequest ? (
                <div className="space-y-4 p-4">
                  <div className="grid min-w-0 gap-3 md:grid-cols-3">
                    <label className="grid min-w-0 gap-1 text-sm text-slate-700">
                      <span className="text-xs font-semibold text-slate-700">Nom du client</span>
                      <input value={selectedMatchRequest.clientName} onChange={(event) => setMatchRequests((current) => current.map((request) => request.id === selectedMatchRequest.id ? { ...request, clientName: event.target.value } : request))} className="min-w-0 rounded-md border border-slate-200 px-3 py-2" />
                    </label>
                    <label className="grid min-w-0 gap-1 text-sm text-slate-700">
                      <span className="text-xs font-semibold text-slate-700">Telephone</span>
                      <input value={selectedMatchRequest.phone} onChange={(event) => setMatchRequests((current) => current.map((request) => request.id === selectedMatchRequest.id ? { ...request, phone: event.target.value } : request))} className="min-w-0 rounded-md border border-slate-200 px-3 py-2" />
                    </label>
                    <label className="grid min-w-0 gap-1 text-sm text-slate-700">
                      <span className="text-xs font-semibold text-slate-700">Email</span>
                      <input value={selectedMatchRequest.email} onChange={(event) => setMatchRequests((current) => current.map((request) => request.id === selectedMatchRequest.id ? { ...request, email: event.target.value } : request))} className="min-w-0 rounded-md border border-slate-200 px-3 py-2" />
                    </label>
                  </div>

                  <div className="overflow-hidden rounded-lg border border-emerald-100">
                    <div className="flex items-center gap-2 bg-emerald-50 px-4 py-2 text-base font-bold text-emerald-950">
                      <Filter className="h-4 w-4" />
                      Criteres de recherche
                    </div>
                    <div className="overflow-x-auto">
                    <table className="min-w-[700px] w-full table-fixed text-left text-sm">
                      <colgroup>
                        <col className="w-[22%]" />
                        <col className="w-[25%]" />
                        <col className="w-[31%]" />
                        <col className="w-[22%]" />
                      </colgroup>
                      <thead className="bg-white text-xs text-slate-500">
                        <tr>
                          <th className="px-3 py-3">Critere</th>
                          <th className="px-3 py-3">Valeur</th>
                          <th className="px-3 py-3">Condition</th>
                          <th className="px-3 py-3">Importance</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {selectedMatchCriteriaEntries.map(([key, criterion]) => {
                          const isNumeric = getSaleCharacteristicDefinition(key)?.kind === "number";
                          return (
                            <tr key={key} className="align-top">
                              <td className="px-3 py-2.5 font-semibold text-slate-800">{criterionLabel(key)}</td>
                              <td className="px-3 py-2.5">
                                {renderMatchValueControl(key, criterion)}
                              </td>
                              <td className="px-3 py-2.5">
                                {isNumeric ? (
                                  <div className="grid grid-cols-[minmax(0,1fr)_6rem] gap-2">
                                    <select value={criterion.rule || "exact"} onChange={(event) => updateMatchCriterion(selectedMatchRequest.id, key, { rule: event.target.value as NumericRule })} className="min-w-0 rounded-lg border border-slate-200 px-2 py-2">
                                      {Object.entries(MATCH_NUMERIC_RULE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                                    </select>
                                    <input type="number" min="0" value={criterion.tolerance || ""} onChange={(event) => updateMatchCriterion(selectedMatchRequest.id, key, { tolerance: event.target.value })} placeholder={criterion.rule === "between" ? "Max" : "+/-"} className="min-w-0 rounded-lg border border-slate-200 px-2 py-2" />
                                  </div>
                                ) : (
                                  <span className="inline-flex rounded-md bg-slate-50 px-3 py-2 text-slate-500">-</span>
                                )}
                              </td>
                              <td className="px-3 py-2.5">
                                <select value={criterion.importance} onChange={(event) => updateMatchCriterion(selectedMatchRequest.id, key, { importance: event.target.value as MatchImportance })} className={`w-full min-w-0 rounded-lg border px-2 py-2 font-semibold ${MATCH_IMPORTANCE_STYLES[criterion.importance]}`}>
                                  {Object.entries(MATCH_IMPORTANCE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                                </select>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    </div>
                  </div>
                </div>
              ) : null}
            </section>

            <section className="min-w-0 overflow-hidden rounded-lg border border-emerald-100 bg-white shadow-sm">
              <div className="flex items-center justify-between gap-3 border-b border-emerald-100 bg-emerald-50 px-4 py-3">
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-emerald-700 text-white">
                    <Target className="h-4 w-4" />
                  </span>
                  <h2 className="text-lg font-bold text-slate-950">Resultats du matching</h2>
                </div>
                <span className="text-sm font-semibold text-slate-700">{matchResults.filter((result) => result.passedRequired).length} biens correspondants trouves</span>
              </div>
              <div className="space-y-2 p-4">
                {matchResults.slice(0, 8).map((result) => (
                  <article key={result.bien.id} className={`grid gap-3 rounded-lg border bg-white p-2.5 shadow-[0_6px_18px_rgba(15,23,42,0.04)] md:grid-cols-[132px_minmax(0,1fr)_138px] ${result.passedRequired ? "border-emerald-100" : "border-slate-200"}`}>
                    <img src={getSaleAdminImage(result.bien)} alt={String(result.bien.titre || result.bien.reference || "Bien")} className="h-28 w-full rounded-md object-cover md:h-full" />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded bg-emerald-700 px-2 py-0.5 text-xs font-bold text-white">{result.bien.reference || result.bien.id}</span>
                        {!result.passedRequired ? <span className="rounded-full bg-rose-50 px-2.5 py-1 text-xs font-bold text-rose-700">Ecarte obligations</span> : null}
                      </div>
                      <div className="mt-1 flex flex-wrap items-start justify-between gap-2">
                        <h3 className="min-w-0 truncate text-base font-bold text-slate-950">{result.bien.titre || "Bien vente"}</h3>
                        <span className="shrink-0 text-sm font-black text-emerald-700">{getSaleAdminPrice(result.bien)}</span>
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-3 text-xs font-medium text-slate-600">
                        <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{result.bien.zone || "Zone a definir"}</span>
                        <span className="inline-flex items-center gap-1"><Ruler className="h-3.5 w-3.5" />{getSaleAdminSurface(result.bien)}</span>
                        <span>{getSaleAdminMeta(result.bien)}</span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {result.matched.slice(0, 5).map((item) => <span key={item} className="rounded bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700">{item}</span>)}
                        {result.blockedBy.slice(0, 2).map((item) => <span key={item} className="rounded bg-rose-50 px-2 py-1 text-[11px] font-semibold text-rose-700">{item}</span>)}
                      </div>
                    </div>
                    <div className="flex flex-col items-stretch justify-between gap-2">
                      <div className={`rounded-md px-3 py-3 text-center ${result.score >= 80 ? "bg-emerald-50 text-emerald-800" : result.score >= 70 ? "bg-amber-50 text-amber-800" : "bg-slate-100 text-slate-700"}`}>
                        <p className="text-3xl font-black">{result.score}%</p>
                        <p className="text-xs font-semibold">{result.label}</p>
                      </div>
                      <Link to={buildSalesEditHref(String(result.bien.id || ""))} className="inline-flex items-center justify-center gap-2 rounded-md bg-emerald-800 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-900">
                        Voir le bien
                        <ExternalLink className="h-4 w-4" />
                      </Link>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          </div>

          <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(360px,0.85fr)_minmax(0,1.15fr)]">
            <section className="overflow-hidden rounded-lg border border-emerald-100 bg-white shadow-sm">
              <div className="flex items-center gap-3 border-b border-emerald-100 bg-emerald-50 px-4 py-3">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-emerald-700 text-white">
                  <Users className="h-4 w-4" />
                </span>
                <div>
                  <h2 className="text-lg font-bold text-slate-950">Correspondance inverse</h2>
                  <p className="text-xs text-slate-600">Pour un bien selectionne, voir les clients interesses</p>
                </div>
              </div>
              <div className="space-y-3 p-4">
                <select value={String(selectedReverseBien?.id || "")} onChange={(event) => setSelectedReverseBienId(event.target.value)} className="w-full min-w-0 rounded-md border border-slate-200 px-3 py-2 text-sm font-semibold">
                  {matchingBiens.map((bien) => <option key={bien.id} value={bien.id}>{bien.reference || bien.id} - {bien.titre}</option>)}
                </select>
                {selectedReverseBien ? (
                  <div className="grid gap-3 rounded-md border border-slate-200 bg-white p-3 sm:grid-cols-[120px_minmax(0,1fr)]">
                    <img src={getSaleAdminImage(selectedReverseBien)} alt={String(selectedReverseBien.titre || "Bien")} className="h-24 w-full rounded-md object-cover" />
                    <div className="min-w-0">
                      <span className="rounded bg-emerald-700 px-2 py-0.5 text-xs font-bold text-white">{selectedReverseBien.reference || selectedReverseBien.id}</span>
                      <h3 className="mt-1 truncate text-base font-bold text-slate-950">{selectedReverseBien.titre}</h3>
                      <p className="mt-1 text-lg font-black text-emerald-700">{getSaleAdminPrice(selectedReverseBien)}</p>
                      <button type="button" className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-md bg-emerald-800 px-3 py-2 text-sm font-semibold text-white">
                        Voir les clients correspondants
                        <ExternalLink className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            </section>

            <section className="overflow-hidden rounded-lg border border-emerald-100 bg-white shadow-sm">
              <div className="flex items-center justify-between gap-3 border-b border-emerald-100 bg-emerald-50 px-4 py-3">
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-emerald-700 text-white">
                    <MessageCircle className="h-4 w-4" />
                  </span>
                  <h2 className="text-lg font-bold text-slate-950">Clients interesses par ce bien</h2>
                </div>
                <span className="text-sm font-semibold text-slate-600">{reverseMatches.length} clients correspondants</span>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-[760px] w-full text-left text-sm">
                  <thead className="bg-white text-xs text-slate-500">
                    <tr>
                      <th className="px-4 py-2.5">Nom du client</th>
                      <th className="px-4 py-2.5">Budget</th>
                      <th className="px-4 py-2.5">Recherche</th>
                      <th className="px-4 py-2.5">Score</th>
                      <th className="px-4 py-2.5">Statut</th>
                      <th className="px-4 py-2.5">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {reverseMatches.map(({ request, result }) => (
                      <tr key={request.id}>
                        <td className="px-4 py-2.5 font-semibold text-slate-900">{request.clientName}</td>
                        <td className="px-4 py-2.5 text-slate-700">{formatCurrency(toMatchNumber(request.criteria.budget?.value) || 0)}</td>
                        <td className="px-4 py-2.5 text-slate-600">{[request.criteria.propertyType?.value ? getSaleTypeLabel(request.criteria.propertyType.value) : "", request.criteria.location?.value, request.criteria.surface?.value ? `${request.criteria.surface.value} m2` : ""].filter(Boolean).join(", ")}</td>
                        <td className="px-4 py-2.5"><span className={`rounded px-2.5 py-1 text-xs font-bold ${result.passedRequired ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{result.score}%</span></td>
                        <td className="px-4 py-2.5"><span className="rounded bg-sky-50 px-2 py-1 text-xs font-semibold text-sky-700">{request.status}</span></td>
                        <td className="px-4 py-2.5"><button type="button" className="inline-flex items-center gap-2 rounded-md border border-emerald-200 px-3 py-1.5 font-semibold text-emerald-800"><Phone className="h-4 w-4" />Contacter</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </TabsContent>

        <TabsContent value="biens" className="mt-6">
          <div className="space-y-4">
            <div className="grid gap-4 xl:grid-cols-4">
              <div className="rounded-2xl border border-slate-200 bg-[linear-gradient(145deg,#ffffff,#f8fafc)] p-5 shadow-[0_18px_36px_rgba(15,23,42,0.05)]">
                <div className="inline-flex rounded-2xl bg-slate-900 p-2 text-white"><FolderOpen className="h-5 w-5" /></div>
                <p className="mt-4 text-sm font-semibold text-slate-900">Catalogue vente</p>
                <p className="mt-1 text-sm text-slate-600">Tous les biens visibles et brouillons relies au tunnel commercial.</p>
                <div className="mt-4 flex items-center justify-between text-sm text-slate-600"><span>References</span><span className="font-semibold text-slate-950">{referenceStats.total}</span></div>
                <div className="mt-2 flex items-center justify-between text-sm text-slate-600"><span>Visibles sur site</span><span className="font-semibold text-slate-950">{referenceStats.visible}</span></div>
              </div>
              <div className="rounded-2xl border border-emerald-200 bg-[linear-gradient(145deg,rgba(236,253,245,0.95),rgba(255,255,255,0.98))] p-5 shadow-[0_18px_36px_rgba(16,185,129,0.08)]">
                <div className="inline-flex rounded-2xl bg-emerald-600 p-2 text-white"><Layers3 className="h-5 w-5" /></div>
                <p className="mt-4 text-sm font-semibold text-slate-900">Terrains et lots</p>
                <p className="mt-1 text-sm text-slate-600">Acces rapide a la creation et a l'edition des terrains et lotissements.</p>
                <div className="mt-4 flex items-center justify-between text-sm text-slate-600"><span>Terrains</span><span className="font-semibold text-slate-950">{referenceStats.terrains}</span></div>
                <div className="mt-2 flex items-center justify-between text-sm text-slate-600"><span>Lotissements</span><span className="font-semibold text-slate-950">{referenceStats.lotissements}</span></div>
              </div>
              <Link to={buildSalesCreateHref("lotissement")} className="rounded-2xl border border-amber-200 bg-[linear-gradient(145deg,rgba(255,251,235,0.96),rgba(255,255,255,0.98))] p-5 shadow-[0_18px_36px_rgba(245,158,11,0.08)] transition hover:translate-y-[-1px]">
                <div className="inline-flex rounded-2xl bg-amber-500 p-2 text-white"><Plus className="h-5 w-5" /></div>
                <p className="mt-4 text-sm font-semibold text-slate-900">Creer un lotissement</p>
                <p className="mt-1 text-sm text-slate-600">Ouvre directement l'editeur Biens en mode vente lotissement.</p>
              </Link>
              <Link to="/admin/biens" className="rounded-2xl border border-gray-200 bg-white p-5 shadow-[0_18px_36px_rgba(15,23,42,0.04)] transition hover:translate-y-[-1px]">
                <div className="inline-flex rounded-2xl bg-white p-2 text-slate-700 ring-1 ring-gray-200"><PencilLine className="h-5 w-5" /></div>
                <p className="mt-4 text-sm font-semibold text-slate-900">Admin biens complet</p>
                <p className="mt-1 text-sm text-slate-600">Acces integral a l'editeur, aux medias, aux caracteristiques et a la visibilite.</p>
              </Link>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <Link to={buildSalesCreateHref("appartement")} className="rounded-2xl border border-gray-200 bg-white p-4 transition hover:border-emerald-300">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Creation</p>
                <p className="mt-2 text-base font-semibold text-gray-900">Bien vente standard</p>
                <p className="mt-1 text-sm text-gray-600">Appartement, villa, studio ou local commercial.</p>
              </Link>
              <Link to={buildSalesCreateHref("terrain")} className="rounded-2xl border border-gray-200 bg-white p-4 transition hover:border-emerald-300">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Creation</p>
                <p className="mt-2 text-base font-semibold text-gray-900">Terrain</p>
                <p className="mt-1 text-sm text-gray-600">Surface, facade, documents, viabilisation et prix au m2.</p>
              </Link>
              <Link to={buildSalesCreateHref("lotissement")} className="rounded-2xl border border-gray-200 bg-white p-4 transition hover:border-emerald-300">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Creation</p>
                <p className="mt-2 text-base font-semibold text-gray-900">Lotissement</p>
                <p className="mt-1 text-sm text-gray-600">Lots, paliers de prix et galerie par terrain.</p>
              </Link>
            </div>
            {propertiesLoading ? (
              <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500">Chargement des biens vente...</div>
            ) : venteBiens.length === 0 ? (
              <div className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500">Aucun bien vente pour le moment.</div>
            ) : (
              <div className="grid gap-5 xl:grid-cols-2 2xl:grid-cols-3">
                {venteBiens.map((bien) => {
                  const TypeIcon = getSaleTypeIcon(bien.type);
                  const mediaCount = Array.isArray(bien.media)
                    ? bien.media.filter((item: any) => !String(item?.motif_upload || "").startsWith("preuve_type_")).length
                    : 0;
                  return (
                    <article
                      key={bien.id}
                      className="group overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_22px_50px_rgba(15,23,42,0.08)] transition hover:-translate-y-1 hover:shadow-[0_28px_60px_rgba(15,23,42,0.12)]"
                    >
                      <div className="relative aspect-[16/10] overflow-hidden bg-slate-200">
                        <img
                          src={getSaleAdminImage(bien)}
                          alt={String(bien.titre || bien.reference || "Bien vente")}
                          className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/78 via-slate-950/18 to-transparent" />
                        <div className="absolute left-4 right-4 top-4 flex items-start justify-between gap-3">
                          <div className="flex flex-wrap gap-2">
                            <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ${
                              bien.statut === "disponible" ? "bg-emerald-100/95 text-emerald-900" : "bg-white/90 text-slate-800"
                            }`}>
                              {bien.statut === "disponible" ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                              {String(bien.statut || "brouillon")}
                            </span>
                            <span className="inline-flex items-center gap-1 rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-slate-800">
                              <TypeIcon className="h-3.5 w-3.5" />
                              {getSaleTypeLabel(bien.type)}
                            </span>
                          </div>
                          <span className="inline-flex items-center gap-1 rounded-full bg-slate-950/75 px-3 py-1 text-xs font-semibold text-white backdrop-blur">
                            <ImageIcon className="h-3.5 w-3.5" />
                            {mediaCount}
                          </span>
                        </div>
                        <div className="absolute inset-x-4 bottom-4 flex items-end justify-between gap-3">
                          <div>
                            <p className="text-3xl font-black tracking-tight text-white">{getSaleAdminPrice(bien)}</p>
                            <p className="mt-1 text-xs font-semibold uppercase tracking-[0.22em] text-white/80">
                              {bien.reference || bien.id}
                            </p>
                          </div>
                          {bien.visible_sur_site !== false ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100/95 px-3 py-1 text-xs font-semibold text-emerald-900">
                              <Eye className="h-3.5 w-3.5" />
                              En ligne
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-rose-100/95 px-3 py-1 text-xs font-semibold text-rose-900">
                              <XCircle className="h-3.5 w-3.5" />
                              Hors ligne
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="space-y-5 p-5">
                        <div className="space-y-2">
                          <h3 className="text-xl font-bold tracking-tight text-slate-950">{bien.titre || "Bien vente"}</h3>
                          <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
                            <span className="inline-flex items-center gap-1.5">
                              <MapPin className="h-4 w-4 text-emerald-600" />
                              {bien.zone || "Zone a definir"}
                            </span>
                            <span className="inline-flex items-center gap-1.5">
                              <Ruler className="h-4 w-4 text-sky-600" />
                              {getSaleAdminSurface(bien)}
                            </span>
                          </div>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-3">
                          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Reference</p>
                            <p className="mt-1 text-sm font-bold text-slate-950">{bien.reference || bien.id}</p>
                          </div>
                          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Meta</p>
                            <p className="mt-1 text-sm font-bold text-slate-950">{getSaleAdminMeta(bien)}</p>
                          </div>
                          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Paiement</p>
                            <p className="mt-1 text-sm font-bold text-slate-950">
                              {bien.modalite_paiement_vente === "facilite" ? "Facilite" : "Comptant"}
                            </p>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-3 border-t border-slate-200 pt-4">
                          <Link
                            to={buildPropertyDetailsPath(bien as any)}
                            target="_blank"
                            className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
                          >
                            <ExternalLink className="h-4 w-4" />
                            Voir le site
                          </Link>
                          <Link
                            to={buildSalesEditHref(String(bien.id || ""))}
                            className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800 transition hover:border-emerald-300 hover:bg-emerald-100"
                          >
                            <PencilLine className="h-4 w-4" />
                            Gerer le bien
                          </Link>
                          <button
                            type="button"
                            disabled={ownerRequestActionId === String(bien.id || "")}
                            onClick={() => void deleteSaleReference(String(bien.id || ""))}
                            className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 transition hover:border-rose-300 hover:bg-rose-100 disabled:opacity-60"
                          >
                            <Trash2 className="h-4 w-4" />
                            Supprimer reference
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </TabsContent>
        <TabsContent value="stats" className="mt-6 space-y-5">
          <div className="grid gap-4 md:grid-cols-4">
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="inline-flex rounded-lg bg-emerald-50 p-2 text-emerald-700"><ClipboardList className="h-5 w-5" /></div>
              <p className="mt-3 text-sm text-gray-500">Demandes</p>
              <p className="text-2xl font-bold text-gray-900">{demands.length}</p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="inline-flex rounded-lg bg-amber-50 p-2 text-amber-700"><CalendarDays className="h-5 w-5" /></div>
              <p className="mt-3 text-sm text-gray-500">Visites planifiees</p>
              <p className="text-2xl font-bold text-gray-900">{scheduledDemands.length}</p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="inline-flex rounded-lg bg-sky-50 p-2 text-sky-700"><BadgeDollarSign className="h-5 w-5" /></div>
              <p className="mt-3 text-sm text-gray-500">Offres / compromis</p>
              <p className="text-2xl font-bold text-gray-900">{demands.filter((row) => ["offre_en_cours", "compromis_signe"].includes(String(row.sales_stage || ""))).length}</p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="inline-flex rounded-lg bg-rose-50 p-2 text-rose-700"><UserCheck className="h-5 w-5" /></div>
              <p className="mt-3 text-sm text-gray-500">Assignes</p>
              <p className="text-2xl font-bold text-gray-900">{assignedAdminOptions.length}</p>
            </div>
          </div>
          <div className="grid gap-5 xl:grid-cols-3">
            <StatsBars title="Pipeline commercial" rows={salesStageStats} colorClass="bg-emerald-600" />
            <StatsBars title="Types de biens vente" rows={saleTypeStats} colorClass="bg-sky-600" />
            <StatsBars title="Visites par jour" rows={visitDayStats} colorClass="bg-amber-500" />
          </div>
          <div className="grid gap-5 xl:grid-cols-2">
            <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              <h3 className="text-lg font-bold text-slate-950">Performance matching</h3>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl bg-emerald-50 p-4"><p className="text-xs font-semibold text-emerald-700">Demandes matching</p><p className="mt-1 text-2xl font-black text-emerald-900">{matchRequests.length}</p></div>
                <div className="rounded-xl bg-slate-50 p-4"><p className="text-xs font-semibold text-slate-600">Biens matchables</p><p className="mt-1 text-2xl font-black text-slate-950">{matchingBiens.length}</p></div>
                <div className="rounded-xl bg-amber-50 p-4"><p className="text-xs font-semibold text-amber-700">Dossiers clients</p><p className="mt-1 text-2xl font-black text-amber-900">{clientFiles.length}</p></div>
              </div>
            </section>
            <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              <h3 className="text-lg font-bold text-slate-950">References vente</h3>
              <div className="mt-4 grid gap-3 sm:grid-cols-4">
                <div className="rounded-xl bg-slate-50 p-4"><p className="text-xs text-slate-500">Total</p><p className="text-2xl font-black">{referenceStats.total}</p></div>
                <div className="rounded-xl bg-emerald-50 p-4"><p className="text-xs text-emerald-700">En ligne</p><p className="text-2xl font-black">{referenceStats.visible}</p></div>
                <div className="rounded-xl bg-sky-50 p-4"><p className="text-xs text-sky-700">Terrains</p><p className="text-2xl font-black">{referenceStats.terrains}</p></div>
                <div className="rounded-xl bg-amber-50 p-4"><p className="text-xs text-amber-700">Lots</p><p className="text-2xl font-black">{referenceStats.lotissements}</p></div>
              </div>
            </section>
          </div>
        </TabsContent>
      </Tabs>
      {previewPhoto ? (
        <button
          type="button"
          onClick={() => setPreviewPhoto(null)}
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/85 p-4"
          aria-label="Fermer l'apercu photo"
        >
          <img src={previewPhoto.url} alt={previewPhoto.title} className="max-h-[92vh] max-w-[94vw] rounded-2xl object-contain shadow-2xl" />
        </button>
      ) : null}
    </div>
  );
}

function StatsBars({ title, rows, colorClass }: { title: string; rows: Array<{ label: string; value: number }>; colorClass: string }) {
  const max = Math.max(1, ...rows.map((row) => Number(row.value || 0)));
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <h3 className="text-lg font-bold text-slate-950">{title}</h3>
      <div className="mt-4 space-y-3">
        {rows.map((row) => (
          <div key={row.label}>
            <div className="mb-1 flex items-center justify-between text-sm">
              <span className="font-semibold text-slate-700">{row.label}</span>
              <span className="font-bold text-slate-950">{row.value}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              <div className={`h-full rounded-full ${colorClass}`} style={{ width: `${Math.max(4, Math.round((Number(row.value || 0) / max) * 100))}%` }} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
