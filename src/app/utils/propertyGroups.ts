import type { Property } from '../data/properties';
import type { PropertyGroup } from '../admin/types';
import { resolveStayAvailability, type NormalizedUnavailableDateRange } from './availability';

export type PropertyGroupCombination = {
  id: string;
  group: PropertyGroup;
  properties: Property[];
  totalBedrooms: number;
  totalGuests: number;
  totalNightlyPrice: number;
  references: string[];
};

export function aggregateGroupUnavailableDates(properties: Property[]): NormalizedUnavailableDateRange[] {
  const ranges = new Map<string, NormalizedUnavailableDateRange>();
  for (const property of properties) {
    for (const range of Array.isArray(property.unavailableDates) ? property.unavailableDates : []) {
      const key = `${range.start}-${range.end}-${range.status}`;
      if (!ranges.has(key)) {
        ranges.set(key, {
          start: String(range.start || '').slice(0, 10),
          end: String(range.end || '').slice(0, 10),
          status: range.status,
          paymentDeadline: range.paymentDeadline,
          reservationDemandId: range.reservationDemandId || null,
        });
      }
    }
  }
  return Array.from(ranges.values());
}

function buildSubsets<T>(items: T[], maxSize: number): T[][] {
  const results: T[][] = [];
  const limit = Math.min(maxSize, items.length);
  const visit = (index: number, current: T[]) => {
    if (current.length >= 2) results.push([...current]);
    if (current.length >= limit) return;
    for (let nextIndex = index; nextIndex < items.length; nextIndex += 1) {
      current.push(items[nextIndex]);
      visit(nextIndex + 1, current);
      current.pop();
    }
  };
  visit(0, []);
  return results;
}

export function findPropertyGroupCombinations(params: {
  propertyGroups: PropertyGroup[];
  properties: Property[];
  stayStart?: string;
  stayEnd?: string;
  minBedrooms?: number;
  locationLabels?: string[];
  maxResults?: number;
}): PropertyGroupCombination[] {
  const {
    propertyGroups,
    properties,
    stayStart = '',
    stayEnd = '',
    minBedrooms = 0,
    locationLabels = [],
    maxResults = 6,
  } = params;
  if (!stayStart || !stayEnd || minBedrooms < 2) return [];
  const propertyById = new Map(properties.map((property) => [String(property.id || '').trim(), property]));
  const normalizedLocations = locationLabels.map((value) => String(value || '').trim().toLowerCase()).filter(Boolean);
  const candidates: PropertyGroupCombination[] = [];
  for (const group of propertyGroups) {
    if (!group.active) continue;
    const groupProperties = (group.items || [])
      .map((item) => propertyById.get(String(item.bien_id || '').trim()) || null)
      .filter((item): item is Property => Boolean(item));
    const visibleProperties = groupProperties.filter((property) => property.mode === 'location_saisonniere');
    if (visibleProperties.length < 2) continue;
    if (normalizedLocations.length > 0) {
      const hasLocationMatch = visibleProperties.some((property) =>
        normalizedLocations.some((label) => String(property.location || '').trim().toLowerCase().includes(label))
      );
      if (!hasLocationMatch) continue;
    }
    const subsets = buildSubsets(visibleProperties, Math.min(4, visibleProperties.length));
    for (const subset of subsets) {
      const totalBedrooms = subset.reduce((sum, property) => sum + Math.max(0, Number(property.bedrooms || 0)), 0);
      if (totalBedrooms < minBedrooms) continue;
      const allAvailable = subset.every((property) =>
        resolveStayAvailability(property.unavailableDates || [], stayStart, stayEnd).exactAvailable
      );
      if (!allAvailable) continue;
      candidates.push({
        id: `${group.id}:${subset.map((property) => property.id).join(',')}`,
        group,
        properties: subset,
        totalBedrooms,
        totalGuests: subset.reduce((sum, property) => sum + Math.max(1, Number(property.guests || 1)), 0),
        totalNightlyPrice: subset.reduce((sum, property) => sum + Math.max(0, Number(property.pricePerNight || 0)), 0),
        references: subset.map((property) => String(property.reference || property.id || '').trim()).filter(Boolean),
      });
    }
  }
  return candidates
    .sort((left, right) => {
      const bedroomDiff = Math.abs(left.totalBedrooms - minBedrooms) - Math.abs(right.totalBedrooms - minBedrooms);
      if (bedroomDiff !== 0) return bedroomDiff;
      if (left.properties.length !== right.properties.length) return left.properties.length - right.properties.length;
      return left.totalNightlyPrice - right.totalNightlyPrice;
    })
    .slice(0, maxResults);
}
