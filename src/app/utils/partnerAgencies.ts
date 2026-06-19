export type PartnerAgencyItem = {
  id: string;
  name: string;
  slug: string;
  marginMultiplier: number;
  isActive: boolean;
  logoUrl?: string;
  createdAt: string;
};

const PARTNER_AGENCIES_STORAGE_KEY = "dwira_partner_agencies_v1";
const API_URL = import.meta.env.VITE_API_URL || "/api";

function normalizeString(value: unknown) {
  return String(value || "").trim();
}

export function normalizePartnerAgencySlug(value: string) {
  return normalizeString(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeApiRow(row: any): PartnerAgencyItem | null {
  const id = normalizeString(row?.id);
  const name = normalizeString(row?.name);
  const slug = normalizePartnerAgencySlug(row?.slug || row?.name);
  const marginMultiplierRaw = Number(row?.margin_multiplier ?? row?.marginMultiplier ?? 1);
  const marginMultiplier = Number.isFinite(marginMultiplierRaw) && marginMultiplierRaw >= 1 ? marginMultiplierRaw : 1;
  const isActive = Number(row?.is_active ?? row?.isActive ?? 1) === 1;
  const logoUrl = normalizeString(row?.logo_url || row?.logoUrl);
  const createdAt = normalizeString(row?.created_at || row?.createdAt) || new Date().toISOString();
  if (!id || !name || !slug) return null;
  return {
    id,
    name,
    slug,
    marginMultiplier,
    isActive,
    logoUrl: logoUrl || undefined,
    createdAt,
  };
}

export function savePartnerAgencies(items: PartnerAgencyItem[]) {
  const deduped = new Map<string, PartnerAgencyItem>();
  items.forEach((item) => {
    const id = normalizeString(item.id);
    const name = normalizeString(item.name);
    const slug = normalizePartnerAgencySlug(item.slug || item.name);
    if (!id || !name || !slug) return;
    deduped.set(id, {
      id,
      name,
      slug,
      marginMultiplier: Number.isFinite(Number(item.marginMultiplier)) && Number(item.marginMultiplier) >= 1 ? Number(item.marginMultiplier) : 1,
      isActive: item.isActive !== false,
      logoUrl: normalizeString(item.logoUrl) || undefined,
      createdAt: normalizeString(item.createdAt) || new Date().toISOString(),
    });
  });
  localStorage.setItem(PARTNER_AGENCIES_STORAGE_KEY, JSON.stringify(Array.from(deduped.values())));
}

export function readPartnerAgencies(): PartnerAgencyItem[] {
  try {
    const raw = localStorage.getItem(PARTNER_AGENCIES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeApiRow).filter((item): item is PartnerAgencyItem => Boolean(item));
  } catch {
    return [];
  }
}

export async function fetchPartnerAgenciesAdmin(): Promise<PartnerAgencyItem[]> {
  const response = await fetch(`${API_URL}/partner-agencies`, { credentials: "include" });
  if (!response.ok) throw new Error("Impossible de charger les agences partenaires");
  const rows = await response.json();
  const normalized = Array.isArray(rows) ? rows.map(normalizeApiRow).filter((item): item is PartnerAgencyItem => Boolean(item)) : [];
  savePartnerAgencies(normalized);
  return normalized;
}

export async function fetchPartnerAgenciesPublic(): Promise<PartnerAgencyItem[]> {
  const response = await fetch(`${API_URL}/public/partner-agencies`);
  if (!response.ok) throw new Error("Impossible de charger les agences partenaires");
  const rows = await response.json();
  return Array.isArray(rows) ? rows.map(normalizeApiRow).filter((item): item is PartnerAgencyItem => Boolean(item)) : [];
}

export async function createPartnerAgencyApi(payload: { name: string; slug?: string }) {
  const response = await fetch(`${API_URL}/partner-agencies`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      name: payload.name,
      slug: payload.slug || undefined,
    }),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(String(data?.error || "Ajout agence partenaire impossible"));
  }
  return normalizeApiRow(await response.json());
}

export async function updatePartnerAgencyApi(id: string, payload: { name: string; slug?: string; logoUrl?: string | null; isActive?: boolean }) {
  const response = await fetch(`${API_URL}/partner-agencies/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      name: payload.name,
      slug: payload.slug || undefined,
      logo_url: payload.logoUrl || null,
      is_active: payload.isActive === undefined ? undefined : (payload.isActive ? 1 : 0),
    }),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(String(data?.error || "Mise a jour agence partenaire impossible"));
  }
  return normalizeApiRow(await response.json());
}

export async function deletePartnerAgencyApi(id: string) {
  const response = await fetch(`${API_URL}/partner-agencies/${encodeURIComponent(id)}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!response.ok) throw new Error("Suppression agence partenaire impossible");
}

export function findPartnerAgencyBySlug(slug: string, items: PartnerAgencyItem[] = readPartnerAgencies()) {
  const nextSlug = normalizePartnerAgencySlug(slug);
  if (!nextSlug) return null;
  return (Array.isArray(items) ? items : []).find((item) => normalizePartnerAgencySlug(item.slug || item.name) === nextSlug) || null;
}

export function findPartnerAgencyById(id: string, items: PartnerAgencyItem[] = readPartnerAgencies()) {
  const nextId = normalizeString(id);
  if (!nextId) return null;
  return (Array.isArray(items) ? items : []).find((item) => item.id === nextId) || null;
}
