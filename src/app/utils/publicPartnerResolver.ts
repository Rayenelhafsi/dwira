import { fetchAmicalesPublic, findAmicaleBySlug, type AmicaleItem } from "./amicales";
import { fetchPartnerAgenciesPublic, findPartnerAgencyBySlug, type PartnerAgencyItem } from "./partnerAgencies";

export type PublicPartnerResolution =
  | { kind: "amicale"; item: AmicaleItem }
  | { kind: "partner_agency"; item: PartnerAgencyItem }
  | null;

export async function resolvePublicPartnerBySlug(slug: string): Promise<PublicPartnerResolution> {
  const [amicales, partnerAgencies] = await Promise.all([
    fetchAmicalesPublic().catch(() => [] as AmicaleItem[]),
    fetchPartnerAgenciesPublic().catch(() => [] as PartnerAgencyItem[]),
  ]);
  const amicale = findAmicaleBySlug(slug, amicales);
  if (amicale) {
    return { kind: "amicale", item: amicale };
  }
  const partnerAgency = findPartnerAgencyBySlug(slug, partnerAgencies);
  if (partnerAgency) {
    return { kind: "partner_agency", item: partnerAgency };
  }
  return null;
}
