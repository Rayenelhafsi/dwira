type CapacityEntry = {
  name: string;
  value: string | number | null | undefined;
};

const normalizeCapacityLabel = (value: string) =>
  String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const toNullableNonNegativeInt = (value: string | number | null | undefined): number | null => {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Math.floor(parsed));
};

export function deriveBedroomsFromConfiguration(configuration?: string | null): number {
  if (!configuration) return 0;
  const match = String(configuration).match(/S\s*\+\s*(\d+)/i);
  if (!match) return 0;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

export function extractCapacityFromEntries(entries: CapacityEntry[]) {
  let bedrooms = 0;
  let hasBedrooms = false;
  let bathrooms: number | null = null;
  let configuration: string | null = null;

  for (const entry of entries) {
    const name = normalizeCapacityLabel(entry.name);
    const rawValue = String(entry.value ?? '').trim();
    if (!name || !rawValue) continue;

    if (name.startsWith('configuration')) {
      configuration = rawValue;
      continue;
    }

    if (name.startsWith('nombre chambres')) {
      const parsed = toNullableNonNegativeInt(rawValue);
      if (parsed !== null) {
        bedrooms += parsed;
        hasBedrooms = true;
      }
      continue;
    }

    if (name.includes('nombre salles de bain') || name.includes('nombre salle de bain')) {
      const parsed = toNullableNonNegativeInt(rawValue);
      if (parsed !== null) bathrooms = parsed;
    }
  }

  return {
    bedrooms: hasBedrooms ? bedrooms : null,
    bathrooms,
    configuration,
  };
}

export function extractCapacityFromCharacteristicLines(lines?: string[] | null) {
  const entries: CapacityEntry[] = [];
  for (const line of Array.isArray(lines) ? lines : []) {
    const raw = String(line || '').trim();
    if (!raw) continue;
    const separatorIndex = raw.indexOf(':');
    if (separatorIndex < 0) continue;
    entries.push({
      name: raw.slice(0, separatorIndex).trim(),
      value: raw.slice(separatorIndex + 1).trim(),
    });
  }
  return extractCapacityFromEntries(entries);
}

export function resolveBienCapacity(input: {
  nbChambres?: number | string | null;
  nbSalleBain?: number | string | null;
  configuration?: string | null;
  caracteristiques?: string[] | null;
}) {
  const derived = extractCapacityFromCharacteristicLines(input.caracteristiques);
  const configuration = String(input.configuration || '').trim() || derived.configuration || null;
  const explicitBedrooms = toNullableNonNegativeInt(input.nbChambres);
  const explicitBathrooms = toNullableNonNegativeInt(input.nbSalleBain);
  const bedroomsFromConfiguration = deriveBedroomsFromConfiguration(configuration);

  const bedrooms =
    explicitBedrooms && explicitBedrooms > 0
      ? explicitBedrooms
      : derived.bedrooms !== null
        ? derived.bedrooms
        : bedroomsFromConfiguration > 0
          ? bedroomsFromConfiguration
          : explicitBedrooms ?? 0;

  const bathrooms =
    explicitBathrooms && explicitBathrooms > 0
      ? explicitBathrooms
      : derived.bathrooms ?? explicitBathrooms ?? 0;

  return {
    bedrooms,
    bathrooms,
    configuration,
  };
}
