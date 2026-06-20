export type AmicaleItem = {
  id: string;
  name: string;
  code: string;
  logoUrl?: string;
  hotelMarkupPercent?: number;
  createdAt: string;
};

const AMICALES_STORAGE_KEY = "dwira_admin_amicales_v1";
const API_URL = import.meta.env.VITE_API_URL || "/api";

function normalizeString(value: unknown) {
  return String(value || "").trim();
}

export function normalizeAmicaleHotelMarkupPercent(value: unknown) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  return Math.round((numeric + Number.EPSILON) * 100) / 100;
}

export function normalizeAmicaleSlug(value: string) {
  return normalizeString(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function readAmicales(): AmicaleItem[] {
  try {
    const raw = localStorage.getItem(AMICALES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((row) => {
        const id = normalizeString(row?.id);
        const name = normalizeString(row?.name);
        const code = normalizeString(row?.code);
        const logoUrl = normalizeString(row?.logoUrl);
        const hotelMarkupPercent = normalizeAmicaleHotelMarkupPercent(row?.hotelMarkupPercent ?? row?.hotel_markup_percent);
        const createdAt = normalizeString(row?.createdAt) || new Date().toISOString();
        if (!id || !name || !code) return null;
        return { id, name, code, logoUrl: logoUrl || undefined, hotelMarkupPercent, createdAt } as AmicaleItem;
      })
      .filter((row): row is AmicaleItem => Boolean(row));
  } catch {
    return [];
  }
}

function normalizeApiRow(row: any): AmicaleItem | null {
  const id = normalizeString(row?.id);
  const name = normalizeString(row?.name);
  const code = normalizeString(row?.code);
  const logoUrl = normalizeString(row?.logo_url || row?.logoUrl);
  const hotelMarkupPercent = normalizeAmicaleHotelMarkupPercent(row?.hotel_markup_percent ?? row?.hotelMarkupPercent);
  const createdAt = normalizeString(row?.created_at || row?.createdAt) || new Date().toISOString();
  if (!id || !name) return null;
  return { id, name, code, logoUrl: logoUrl || undefined, hotelMarkupPercent, createdAt };
}

export async function fetchAmicalesAdmin(): Promise<AmicaleItem[]> {
  const response = await fetch(`${API_URL}/amicales`, { credentials: "include" });
  if (!response.ok) throw new Error("Impossible de charger les amicales");
  const rows = await response.json();
  const normalized = Array.isArray(rows) ? rows.map(normalizeApiRow).filter((item): item is AmicaleItem => Boolean(item)) : [];
  saveAmicales(normalized);
  return normalized;
}

export async function fetchAmicalesPublic(): Promise<AmicaleItem[]> {
  const response = await fetch(`${API_URL}/public/amicales`);
  if (!response.ok) throw new Error("Impossible de charger les amicales");
  const rows = await response.json();
  const normalized = Array.isArray(rows) ? rows.map(normalizeApiRow).filter((item): item is AmicaleItem => Boolean(item)) : [];
  return normalized;
}

export async function createAmicaleApi(payload: { name: string; code: string; logoUrl?: string; hotelMarkupPercent?: number }) {
  const response = await fetch(`${API_URL}/amicales`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      name: payload.name,
      code: payload.code,
      logo_url: payload.logoUrl || null,
      hotel_markup_percent: normalizeAmicaleHotelMarkupPercent(payload.hotelMarkupPercent),
    }),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    const message = String(data?.error || data?.message || "").trim();
    throw new Error(message || "Ajout amicale impossible");
  }
  return normalizeApiRow(await response.json());
}

export async function updateAmicaleApi(payload: { id: string; name: string; code: string; logoUrl?: string; hotelMarkupPercent?: number }) {
  const response = await fetch(`${API_URL}/amicales/${encodeURIComponent(payload.id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      name: payload.name,
      code: payload.code,
      logo_url: payload.logoUrl || null,
      hotel_markup_percent: normalizeAmicaleHotelMarkupPercent(payload.hotelMarkupPercent),
    }),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    const message = String(data?.error || data?.message || "").trim();
    throw new Error(message || "Mise a jour amicale impossible");
  }
  return normalizeApiRow(await response.json());
}

export async function deleteAmicaleApi(id: string) {
  const response = await fetch(`${API_URL}/amicales/${encodeURIComponent(id)}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!response.ok) throw new Error("Suppression amicale impossible");
}

export function saveAmicales(items: AmicaleItem[]) {
  const dedupedById = new Map<string, AmicaleItem>();
  items.forEach((item) => {
    const id = normalizeString(item.id);
    const name = normalizeString(item.name);
    const code = normalizeString(item.code);
    if (!id || !name || !code) return;
    dedupedById.set(id, {
      id,
      name,
      code,
      logoUrl: normalizeString(item.logoUrl) || undefined,
      hotelMarkupPercent: normalizeAmicaleHotelMarkupPercent(item.hotelMarkupPercent),
      createdAt: normalizeString(item.createdAt) || new Date().toISOString(),
    });
  });
  localStorage.setItem(AMICALES_STORAGE_KEY, JSON.stringify(Array.from(dedupedById.values())));
}

export function addAmicale(name: string, code: string, logoUrl?: string) {
  const nextName = normalizeString(name);
  const nextCode = normalizeString(code);
  if (!nextName || !nextCode) return { ok: false as const, reason: "invalid" as const };
  const current = readAmicales();
  const duplicate = current.find((item) => item.name.toLowerCase() === nextName.toLowerCase());
  if (duplicate) return { ok: false as const, reason: "duplicate_name" as const };
  const created: AmicaleItem = {
    id: `am_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name: nextName,
    code: nextCode,
    logoUrl: normalizeString(logoUrl) || undefined,
    createdAt: new Date().toISOString(),
  };
  saveAmicales([created, ...current]);
  return { ok: true as const, item: created };
}

export function removeAmicale(id: string) {
  const nextId = normalizeString(id);
  if (!nextId) return;
  const current = readAmicales();
  saveAmicales(current.filter((item) => item.id !== nextId));
}

export function findAmicaleById(id: string) {
  const nextId = normalizeString(id);
  if (!nextId) return null;
  return readAmicales().find((item) => item.id === nextId) || null;
}

export function findAmicaleBySlug(slug: string, items: AmicaleItem[] = readAmicales()) {
  const nextSlug = normalizeAmicaleSlug(slug);
  if (!nextSlug) return null;
  return (Array.isArray(items) ? items : []).find((item) => normalizeAmicaleSlug(item.name) === nextSlug) || null;
}
