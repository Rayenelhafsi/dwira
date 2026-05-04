import type { Property } from "../data/properties";

const normalizeRouteToken = (value?: string | null): string =>
  decodeURIComponent(String(value || "").trim()).toLowerCase();

const normalizeReferenceToken = (value?: string | null): string => {
  const normalized = normalizeRouteToken(value).replace(/[^a-z0-9]/g, "");
  if (!normalized) return "";
  if (normalized.startsWith("ref")) {
    const digits = normalized.slice(3).replace(/[^0-9]/g, "");
    if (digits) return `ref${digits}`;
  }
  return normalized;
};

export const getPropertyRouteToken = (property: Pick<Property, "reference" | "slug" | "id">): string => {
  const reference = String(property.reference || "").trim();
  if (reference) {
    const compact = normalizeReferenceToken(reference);
    if (/^ref\d+$/i.test(compact)) return compact.toUpperCase();
    return reference;
  }
  const slug = String(property.slug || "").trim();
  if (slug) return slug;
  return String(property.id || "").trim();
};

export const buildPropertyDetailsPath = (property: Pick<Property, "reference" | "slug" | "id" | "detailPath">): string => {
  if (property.detailPath && property.detailPath.startsWith("/vente/")) return property.detailPath;
  return `/properties/${encodeURIComponent(getPropertyRouteToken(property))}`;
};

export const buildReservationConfirmationPath = (property: Pick<Property, "reference" | "slug" | "id">): string =>
  `/reservation/confirmation/${encodeURIComponent(getPropertyRouteToken(property))}`;

export const propertyMatchesRouteToken = (property: Pick<Property, "reference" | "slug" | "id">, token?: string | null): boolean => {
  const normalizedToken = normalizeRouteToken(token);
  const normalizedReferenceToken = normalizeReferenceToken(token);
  const propertyReferenceToken = normalizeReferenceToken(property.reference);
  if (!normalizedToken) return false;
  return (
    normalizeRouteToken(property.reference) === normalizedToken
    || (normalizedReferenceToken !== "" && propertyReferenceToken === normalizedReferenceToken)
    || normalizeRouteToken(property.slug) === normalizedToken
    || normalizeRouteToken(property.id) === normalizedToken
  );
};
