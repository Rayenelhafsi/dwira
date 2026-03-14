import type { ServicePayantBien, ServicePayantTarification } from "../admin/types";

export type NormalizedServicePayant = ServicePayantBien & {
  categorie: string;
  description_courte: string;
  prix_affiche: string;
  type_tarification: ServicePayantTarification;
};

function parseBasePrice(value?: string | number | null) {
  if (typeof value === "number") return Math.max(0, value);
  const text = String(value || "").replace(",", ".").trim();
  const match = text.match(/(\d+(?:\.\d+)?)/);
  return match ? Math.max(0, Number(match[1])) : 0;
}

export function normalizeServicePayant(service: Partial<ServicePayantBien> | null | undefined): NormalizedServicePayant {
  const prix = Math.max(0, Number(service?.prix ?? (parseBasePrice(service?.prix_affiche) || 0)));
  const type_tarification = normalizeServiceTarification(service?.type_tarification);
  return {
    id: String(service?.id || `service_${Date.now()}`),
    categorie: String(service?.categorie || "Services client").trim() || "Services client",
    label: String(service?.label || "").trim(),
    description_courte: String(service?.description_courte || "").trim(),
    prix_affiche: String(service?.prix_affiche || "").trim() || buildDefaultDisplayPrice(prix, type_tarification),
    prix,
    type_tarification,
    enabled: service?.enabled !== false,
  };
}

export function normalizeServiceTarification(value?: string | null): ServicePayantTarification {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "sur_demande") return "sur_demande";
  if (normalized === "a_partir_de") return "a_partir_de";
  return "fixe";
}

export function getServiceTarificationLabel(type: ServicePayantTarification) {
  if (type === "sur_demande") return "Sur demande";
  if (type === "a_partir_de") return "A partir de";
  return "Fixe";
}

export function getServiceDisplayPrice(service: Partial<ServicePayantBien> | null | undefined) {
  const normalized = normalizeServicePayant(service);
  return normalized.prix_affiche || buildDefaultDisplayPrice(normalized.prix, normalized.type_tarification);
}

export function splitServicesByTarification(services: Array<Partial<ServicePayantBien> | null | undefined>) {
  const normalized = services
    .map((service) => normalizeServicePayant(service))
    .filter((service) => service.enabled !== false && service.label);

  return {
    all: normalized,
    fixes: normalized.filter((service) => service.type_tarification === "fixe"),
    variables: normalized.filter((service) => service.type_tarification !== "fixe"),
  };
}

function buildDefaultDisplayPrice(prix: number, type: ServicePayantTarification) {
  if (type === "sur_demande") return "Sur demande";
  if (type === "a_partir_de") return `A partir de ${prix} TND`;
  return `${prix} TND`;
}
