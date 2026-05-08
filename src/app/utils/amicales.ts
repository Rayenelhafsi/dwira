export type AmicaleItem = {
  id: string;
  name: string;
  code: string;
  createdAt: string;
};

const AMICALES_STORAGE_KEY = "dwira_admin_amicales_v1";

function normalizeString(value: unknown) {
  return String(value || "").trim();
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
        const createdAt = normalizeString(row?.createdAt) || new Date().toISOString();
        if (!id || !name || !code) return null;
        return { id, name, code, createdAt } as AmicaleItem;
      })
      .filter((row): row is AmicaleItem => Boolean(row));
  } catch {
    return [];
  }
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
      createdAt: normalizeString(item.createdAt) || new Date().toISOString(),
    });
  });
  localStorage.setItem(AMICALES_STORAGE_KEY, JSON.stringify(Array.from(dedupedById.values())));
}

export function addAmicale(name: string, code: string) {
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
