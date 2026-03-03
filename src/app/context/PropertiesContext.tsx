import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Bien, BienStatut, Media, DateStatus, BienType, Zone, Proprietaire, BienMode, TypePapierAppartementVente, TypeRueAppartementVente, TypeTerrainVente } from '../admin/types';
import { Property } from '../data/properties';

// API Base URL
const API_URL = import.meta.env.VITE_API_URL || '/api';
const CHARACTERISTICS_MARKER = '[CARACTERISTIQUES_JSON]';
const LEGACY_TYPE_MAP: Record<string, BienType> = {
  S1: 'appartement',
  S2: 'appartement',
  S3: 'appartement',
  S4: 'appartement',
  villa: 'villa_maison',
  local: 'local_commercial',
};
const DEFAULT_MODE: BienMode = 'location_saisonniere';
const DEFAULT_MODE_PRIORITIES: Record<BienMode, number> = {
  location_saisonniere: 1,
  vente: 2,
  location_annuelle: 3,
};

async function getApiErrorMessage(response: Response, fallback: string) {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const data = await response.json().catch(() => null);
    const message = String(data?.error || data?.message || '').trim();
    if (message) return message;
  } else {
    const text = await response.text().catch(() => '');
    if (text && !text.startsWith('<!DOCTYPE')) return text;
  }
  return fallback;
}

function normalizeBienType(type: string): BienType {
  return (LEGACY_TYPE_MAP[type] || type || 'appartement') as BienType;
}

function parseDescriptionAndCharacteristics(rawDescription?: string | null): { description: string; caracteristiques: string[] } {
  const descriptionText = rawDescription || '';
  const markerIndex = descriptionText.indexOf(CHARACTERISTICS_MARKER);
  if (markerIndex === -1) {
    return { description: descriptionText, caracteristiques: [] };
  }

  const cleanDescription = descriptionText.slice(0, markerIndex).trim();
  const jsonPart = descriptionText.slice(markerIndex + CHARACTERISTICS_MARKER.length).trim();
  try {
    const parsed = JSON.parse(jsonPart);
    return {
      description: cleanDescription,
      caracteristiques: Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : [],
    };
  } catch {
    return { description: cleanDescription, caracteristiques: [] };
  }
}

// ============================================
// CONVERSION UTILITIES
// ============================================

// Convert DB row to Bien format (without unavailable dates - fetched separately)
function dbRowToBien(row: any, media: any[] = [], unavailableDates: any[] = []): Bien {
  // Helper to convert string/number to number
  const toNumber = (val: any): number => {
    if (val === null || val === undefined) return 0;
    if (typeof val === 'number') return val;
    return parseFloat(val) || 0;
  };
  const toNullableNumber = (val: any): number | null => {
    if (val === null || val === undefined || val === '') return null;
    if (typeof val === 'number') return Number.isFinite(val) ? val : null;
    const parsed = parseFloat(val);
    return Number.isFinite(parsed) ? parsed : null;
  };
  const toBoolean = (val: any): boolean => val === 1 || val === true || val === '1';
  const toStringArray = (val: any): string[] => Array.isArray(val)
    ? val.map((item) => String(item || '').trim()).filter(Boolean)
    : [];

  const parsedDescription = parseDescriptionAndCharacteristics(row.description);
  let immeubleDetails: any = {};
  let terrainDetails: any = {};
  let immeubleAppartements: any[] = [];
  let lotissementTerrains: any[] = [];
  let lotissementPaliersPrix: any[] = [];
  try {
    const raw = (row as any).immeuble_details_json;
    if (raw) immeubleDetails = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {}
  try {
    const raw = (row as any).immeuble_appartements_json;
    if (raw) immeubleAppartements = Array.isArray(raw) ? raw : JSON.parse(raw);
  } catch {}
  try {
    const raw = (row as any).terrain_details_json;
    if (raw) terrainDetails = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {}
  try {
    const raw = (row as any).lotissement_terrains_json;
    if (raw) lotissementTerrains = Array.isArray(raw) ? raw : JSON.parse(raw);
  } catch {}
  try {
    const raw = (row as any).lotissement_paliers_prix_m2_json;
    if (raw) lotissementPaliersPrix = Array.isArray(raw) ? raw : JSON.parse(raw);
  } catch {}
  let uiConfig: any = null;
  try {
    const raw = (row as any).ui_config_json;
    if (raw) uiConfig = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {}
  const caracteristiquesFromDb = typeof row.caracteristiques_list === 'string' && row.caracteristiques_list.trim().length > 0
    ? row.caracteristiques_list.split('||').map((x: string) => x.trim()).filter(Boolean)
    : [];
  const caracteristiqueIdsFromDb = typeof row.caracteristique_ids_list === 'string' && row.caracteristique_ids_list.trim().length > 0
    ? row.caracteristique_ids_list.split('||').map((x: string) => x.trim()).filter(Boolean)
    : [];

  return {
    id: row.id,
    reference: row.reference,
    titre: row.titre,
    description: parsedDescription.description,
    caracteristiques: caracteristiquesFromDb.length > 0 ? caracteristiquesFromDb : parsedDescription.caracteristiques,
    caracteristique_ids: caracteristiqueIdsFromDb,
    mode: (row.mode || row.mode_bien || DEFAULT_MODE) as BienMode,
    type: normalizeBienType(row.type),
    nb_chambres: toNumber(row.nb_chambres),
    nb_salle_bain: toNumber(row.nb_salle_bain),
    prix_nuitee: toNumber(row.prix_nuitee),
    tarification_methode: ((row as any).tarification_methode || null) as any,
    prix_affiche_client: toNullableNumber((row as any).prix_affiche_client),
    prix_fixe_proprietaire: toNullableNumber((row as any).prix_fixe_proprietaire),
    prix_final: toNullableNumber((row as any).prix_final),
    revenu_agence: toNullableNumber((row as any).revenu_agence),
    commission_pourcentage_proprietaire: toNullableNumber((row as any).commission_pourcentage_proprietaire),
    commission_pourcentage_client: toNullableNumber((row as any).commission_pourcentage_client),
    montant_max_reduction_negociation: toNullableNumber((row as any).montant_max_reduction_negociation),
    prix_minimum_accepte: toNullableNumber((row as any).prix_minimum_accepte),
    modalite_paiement_vente: ((row as any).modalite_paiement_vente || null) as any,
    pourcentage_premiere_partie_promesse: toNullableNumber((row as any).pourcentage_premiere_partie_promesse),
    montant_premiere_partie_promesse: toNullableNumber((row as any).montant_premiere_partie_promesse),
    montant_deuxieme_partie: toNullableNumber((row as any).montant_deuxieme_partie),
    nombre_tranches: toNullableNumber((row as any).nombre_tranches),
    periode_tranches_mois: toNullableNumber((row as any).periode_tranches_mois),
    montant_par_tranche: toNullableNumber((row as any).montant_par_tranche),
    avance: toNumber(row.avance),
    caution: toNumber((row as any).caution),
    type_rue: ((row as any).type_rue || null) as TypeRueAppartementVente | null,
    type_papier: ((row as any).type_papier || null) as TypePapierAppartementVente | null,
    superficie_m2: toNullableNumber((row as any).superficie_m2),
    etage: toNullableNumber((row as any).etage),
    configuration: ((row as any).configuration || null) as string | null,
    annee_construction: toNullableNumber((row as any).annee_construction),
    distance_plage_m: toNullableNumber((row as any).distance_plage_m),
    proche_plage: toBoolean((row as any).proche_plage),
    chauffage_central: toBoolean((row as any).chauffage_central),
    climatisation: toBoolean((row as any).climatisation),
    balcon: toBoolean((row as any).balcon),
    terrasse: toBoolean((row as any).terrasse),
    ascenseur: toBoolean((row as any).ascenseur),
    vue_mer: toBoolean((row as any).vue_mer),
    gaz_ville: toBoolean((row as any).gaz_ville),
    cuisine_equipee: toBoolean((row as any).cuisine_equipee),
    place_parking: toBoolean((row as any).place_parking),
    syndic: toBoolean((row as any).syndic),
    meuble: toBoolean((row as any).meuble),
    independant: toBoolean((row as any).independant),
    eau_puits: toBoolean((row as any).eau_puits),
    eau_sonede: toBoolean((row as any).eau_sonede),
    electricite_steg: toBoolean((row as any).electricite_steg),
    surface_local_m2: toNullableNumber((row as any).surface_local_m2),
    facade_m: toNullableNumber((row as any).facade_m),
    hauteur_plafond_m: toNullableNumber((row as any).hauteur_plafond_m),
    activite_recommandee: ((row as any).activite_recommandee || null) as string | null,
    toilette: toBoolean((row as any).toilette),
    reserve_local: toBoolean((row as any).reserve_local),
    vitrine: toBoolean((row as any).vitrine),
    coin_angle: toBoolean((row as any).coin_angle),
    electricite_3_phases: toBoolean((row as any).electricite_3_phases),
    alarme: toBoolean((row as any).alarme),
    type_terrain: ((row as any).type_terrain || null) as TypeTerrainVente | null,
    terrain_facade_m: toNullableNumber((row as any).terrain_facade_m),
    terrain_surface_m2: toNullableNumber((row as any).terrain_surface_m2),
    terrain_distance_plage_m: toNullableNumber((row as any).terrain_distance_plage_m),
    terrain_zone: ((row as any).terrain_zone || null) as string | null,
    terrain_constructible: toBoolean((row as any).terrain_constructible),
    terrain_angle: toBoolean((row as any).terrain_angle),
    terrain_prix_affiche_total: toNullableNumber((row as any).terrain_prix_affiche_total),
    terrain_prix_affiche_par_m2: toNullableNumber((row as any).terrain_prix_affiche_par_m2),
    terrain_mode_affichage_prix: ((row as any).terrain_mode_affichage_prix || null) as any,
    terrain_disponibilite_reseaux: toStringArray((terrainDetails as any).disponibilite_reseaux),
    terrain_hauteur_construction_autorisee: ((terrainDetails as any).hauteur_construction_autorisee || null) as any,
    terrain_route_acces_largeur_m: toNullableNumber((terrainDetails as any).route_acces_largeur_m),
    terrain_forme: ((terrainDetails as any).forme || null) as string | null,
    terrain_topographie: ((terrainDetails as any).topographie || null) as any,
    terrain_bornage: toBoolean((terrainDetails as any).bornage),
    terrain_travaux_municipalite_autorises: toBoolean((terrainDetails as any).travaux_municipalite_autorises),
    terrain_limites_cadastrales: toBoolean((terrainDetails as any).limites_cadastrales),
    terrain_visualisation_limites_cadastrales: toBoolean((terrainDetails as any).visualisation_limites_cadastrales),
    terrain_voisinage: ((terrainDetails as any).voisinage || null) as any,
    terrain_proximites_commodites: toStringArray((terrainDetails as any).proximites_commodites),
    terrain_proximites_commodites_autres: ((terrainDetails as any).proximites_commodites_autres || null) as string | null,
    terrain_viabilisation_eau_sources: toStringArray((terrainDetails as any).viabilisation_eau_sources),
    terrain_viabilisation_onas: ((terrainDetails as any).viabilisation_onas || null) as any,
    terrain_viabilisation_steg: ((terrainDetails as any).viabilisation_steg || null) as any,
    terrain_viabilisation_gaz_ville: toBoolean((terrainDetails as any).viabilisation_gaz_ville),
    terrain_viabilisation_fibre_optique: toBoolean((terrainDetails as any).viabilisation_fibre_optique),
    terrain_viabilisation_telephone_fixe: toBoolean((terrainDetails as any).viabilisation_telephone_fixe),
    terrain_type_sol: ((terrainDetails as any).type_sol || null) as any,
    terrain_vegetation: ((terrainDetails as any).vegetation || null) as string | null,
    terrain_niveau_sonore: ((terrainDetails as any).niveau_sonore || null) as any,
    terrain_risque_inondation: toBoolean((terrainDetails as any).risque_inondation),
    terrain_exposition_vent: ((terrainDetails as any).exposition_vent || null) as string | null,
    terrain_ideal_utilisations: toStringArray((terrainDetails as any).ideal_utilisations),
    terrain_documents_disponibles: toStringArray((terrainDetails as any).documents_disponibles),
    immeuble_surface_terrain_m2: toNullableNumber((immeubleDetails as any).surface_terrain_m2),
    immeuble_surface_batie_m2: toNullableNumber((immeubleDetails as any).surface_batie_m2),
    immeuble_nb_niveaux: toNullableNumber((immeubleDetails as any).nb_niveaux),
    immeuble_nb_garages: toNullableNumber((immeubleDetails as any).nb_garages),
    immeuble_nb_appartements: toNullableNumber((immeubleDetails as any).nb_appartements),
    immeuble_nb_locaux_commerciaux: toNullableNumber((immeubleDetails as any).nb_locaux_commerciaux),
    immeuble_distance_plage_m: toNullableNumber((immeubleDetails as any).distance_plage_m),
    immeuble_proche_plage: toBoolean((immeubleDetails as any).proche_plage),
    immeuble_ascenseur: toBoolean((immeubleDetails as any).ascenseur),
    immeuble_parking_sous_sol: toBoolean((immeubleDetails as any).parking_sous_sol),
    immeuble_parking_exterieur: toBoolean((immeubleDetails as any).parking_exterieur),
    immeuble_syndic: toBoolean((immeubleDetails as any).syndic),
    immeuble_vue_mer: toBoolean((immeubleDetails as any).vue_mer),
    immeuble_appartements: (Array.isArray(immeubleAppartements) ? immeubleAppartements : []).map((item, idx) => ({
      index: Number(item?.index || idx + 1),
      reference: item?.reference ? String(item.reference) : null,
      chambres: Number(item?.chambres || 0),
      salle_bain: Number(item?.salle_bain || 0),
      superficie_m2: toNullableNumber(item?.superficie_m2),
      configuration: item?.configuration ? String(item.configuration) : null,
    })),
    immeuble_garages: (Array.isArray((immeubleDetails as any)?.garages) ? (immeubleDetails as any).garages : []).map((item: any, idx: number) => ({
      index: Number(item?.index || idx + 1),
      reference: item?.reference ? String(item.reference) : null,
    })),
    immeuble_locaux_commerciaux: (Array.isArray((immeubleDetails as any)?.locaux_commerciaux) ? (immeubleDetails as any).locaux_commerciaux : []).map((item: any, idx: number) => ({
      index: Number(item?.index || idx + 1),
      reference: item?.reference ? String(item.reference) : null,
    })),
    lotissement_nb_terrains: toNullableNumber((row as any).lotissement_nb_terrains),
    lotissement_prix_total: toNullableNumber((row as any).lotissement_prix_total),
    lotissement_mode_prix_m2: ((row as any).lotissement_mode_prix_m2 || null) as any,
    lotissement_prix_m2_unique: toNullableNumber((row as any).lotissement_prix_m2_unique),
    lotissement_terrains: (Array.isArray(lotissementTerrains) ? lotissementTerrains : []).map((item, idx) => ({
      index: Number(item?.index || idx + 1),
      reference: item?.reference ? String(item.reference) : null,
      type_terrain: (item?.type_terrain || null) as TypeTerrainVente | null,
      surface_m2: toNullableNumber(item?.surface_m2),
      type_rue: (item?.type_rue || null) as TypeRueAppartementVente | null,
      type_papier: (item?.type_papier || null) as TypePapierAppartementVente | null,
      terrain_zone: item?.terrain_zone ? String(item.terrain_zone) : null,
      terrain_distance_plage_m: toNullableNumber(item?.terrain_distance_plage_m),
      terrain_constructible: toBoolean(item?.terrain_constructible),
      terrain_angle: toBoolean(item?.terrain_angle),
    })),
    lotissement_paliers_prix_m2: (Array.isArray(lotissementPaliersPrix) ? lotissementPaliersPrix : []).map((item) => ({
      min_m2: Number(item?.min_m2 || 0),
      max_m2: toNullableNumber(item?.max_m2),
      prix_m2: Number(item?.prix_m2 || 0),
    })),
    statut: row.statut as BienStatut,
    visible_sur_site: row.visible_sur_site === 1 || row.visible_sur_site === true || row.visible_sur_site === '1',
    ui_config: uiConfig && typeof uiConfig === 'object' ? uiConfig : null,
    menage_en_cours: row.menage_en_cours === 1 || row.menage_en_cours === true || row.menage_en_cours === '1',
    zone_id: row.zone_id,
    proprietaire_id: row.proprietaire_id,
    date_ajout: row.date_ajout,
    created_at: row.created_at,
    updated_at: row.updated_at,
    media: (Array.isArray(media) ? media : [])
      .map(m => ({
        id: m.id,
        bien_id: m.bien_id,
        type: m.type,
        url: m.url,
        position: m.position || 0,
        motif_upload: m.motif_upload || null,
      }))
      .sort((a, b) => (a.position || 0) - (b.position || 0)),

    unavailableDates: (Array.isArray(unavailableDates) ? unavailableDates : []).map(ud => ({
      start: ud.start_date,
      end: ud.end_date,
      status: ud.status,
      color: ud.color || (ud.status === 'booked' ? '#ef4444' : ud.status === 'pending' ? '#f97316' : '#111827'),
      paymentDeadline: ud.paymentDeadline || ud.payment_deadline || undefined,
    }))
  };
}

// Convert Bien (Admin format) to Property (Site format)
function bienToProperty(bien: Bien, zoneNames: Record<string, string> = {}): Property {
  const typeToCategory: Record<string, Property['category']> = {
    'S1': 'S+1',
    'S2': 'S+2',
    'S3': 'S+3',
    'S4': 'S+4',
    'appartement': 'S+2',
    'villa_maison': 'Villa',
    'studio': 'Studio',
    'local': 'S+1',
    'local_commercial': 'S+1',
    'immeuble': 'S+4',
    'terrain': 'S+1',
    'lotissement': 'S+1',
    'bungalow': 'Villa',
    'villa': 'Villa',
  };

  const detailPath = bien.mode === 'vente' && bien.type === 'immeuble'
    ? `/vente/immeuble/${encodeURIComponent((bien.titre || '').toLowerCase().replace(/[^a-z0-9]+/g, '-'))}`
    : bien.mode === 'vente' && bien.type === 'lotissement'
      ? `/vente/lotissement/${encodeURIComponent((bien.titre || '').toLowerCase().replace(/[^a-z0-9]+/g, '-'))}`
      : `/properties/${encodeURIComponent((bien.titre || '').toLowerCase().replace(/[^a-z0-9]+/g, '-'))}`;

  return {
    id: bien.id,
    reference: bien.reference,
    title: bien.titre,
    slug: bien.titre.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    detailPath,
    mode: bien.mode,
    location: zoneNames[bien.zone_id || ''] || 'KÃ©libia',
    pricePerNight: bien.prix_nuitee,
    priceContext: bien.mode === 'vente' ? 'sale' : 'night',
    rating: 4.5 + Math.random() * 0.5,
    reviews: Math.floor(Math.random() * 30) + 5,
    guests: bien.nb_chambres + 1,
    bedrooms: bien.nb_chambres,
    bathrooms: bien.nb_salle_bain,
    images: bien.media && bien.media.length > 0 
      ? bien.media.filter((m: any) => {
        if (m.type === 'video') return false;
        const motif = String(m.motif_upload || '');
        const isProof = motif === 'preuve_type_rue'
          || motif === 'preuve_type_papier'
          || motif.startsWith('preuve_type_rue|')
          || motif.startsWith('preuve_type_papier|');
        return !m.motif_upload || !isProof;
      }).map((m: any) => m.url) 
      : ['https://images.unsplash.com/photo-1560518883-ce09059eeffa?q=80&w=800&auto=format&fit=crop'],
    videos: bien.media && bien.media.length > 0
      ? bien.media.filter((m: any) => m.type === 'video' && m.url).map((m: any) => m.url)
      : [],
    description: bien.description || `Superbe ${bien.type}`,
    amenities: bien.caracteristiques && bien.caracteristiques.length > 0 ? bien.caracteristiques : getAmenitiesFromType(bien.type),
    category: typeToCategory[bien.type] || 'S+1',
    isFeatured: bien.prix_nuitee > 300 || bien.statut === 'disponible',
    unavailableDates: bien.unavailableDates || [],
    cleaningFee: bien.avance || 0,
    serviceFee: Math.round(bien.prix_nuitee * 0.1),
    proprietaire_id: bien.proprietaire_id || ''
  };
}

function getAmenitiesFromType(type: BienType): string[] {
  const baseAmenities = ['Wifi', 'Climatisation'];
  if (type === 'villa' || type === 'villa_maison' || type === 'bungalow') {
    return [...baseAmenities, 'Piscine', 'Jardin', 'Garage', 'Parking'];
  }
  if (type === 'studio' || type === 'S1' || type === 'appartement') {
    return [...baseAmenities, 'Kitchenette'];
  }
  if (type === 'local' || type === 'local_commercial') {
    return [...baseAmenities, 'Parking'];
  }
  return [...baseAmenities, 'Balcon', 'Vue sur mer'];
}

// ============================================
// CONTEXT TYPES
// ============================================

interface PropertiesContextType {
  biens: Bien[];
  properties: Property[];
  zones: Zone[];
  proprietaires: Proprietaire[];
  modePriorities: Record<BienMode, number>;
  loading: boolean;
  isLoading: boolean;
  error: string | null;
  addBien: (newBien: Omit<Bien, 'id' | 'created_at' | 'updated_at'>) => Promise<string>;
  updateBien: (updatedBien: Bien) => Promise<void>;
  deleteBien: (id: string) => Promise<void>;
  saveModePriorities: (next: Record<BienMode, number>) => Promise<void>;
  getBienById: (id: string) => Bien | undefined;
  getPropertyById: (id: string) => Property | undefined;
  refreshData: () => Promise<void>;
}

const PropertiesContext = createContext<PropertiesContextType | undefined>(undefined);

// ============================================
// CONTEXT PROVIDER
// ============================================

export function PropertiesProvider({ children }: { children: ReactNode }) {
  const [biens, setBiens] = useState<Bien[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [proprietaires, setProprietaires] = useState<Proprietaire[]>([]);
  const [modePriorities, setModePriorities] = useState<Record<BienMode, number>>(DEFAULT_MODE_PRIORITIES);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch data from API
  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [biensResponse, zonesResponse, propsResponse, modePrioritiesResponse] = await Promise.all([
        fetch(`${API_URL}/biens`),
        fetch(`${API_URL}/zones`),
        fetch(`${API_URL}/proprietaires`),
        fetch(`${API_URL}/site-mode-priorities`),
      ]);
      if (!biensResponse.ok) throw new Error('Failed to fetch biens');
      const biensData = await biensResponse.json();
      const zonesData = zonesResponse.ok ? await zonesResponse.json() : [];
      const propsData = propsResponse.ok ? await propsResponse.json() : [];
      const modePrioritiesData = modePrioritiesResponse.ok ? await modePrioritiesResponse.json() : null;
      
      // Fetch media and unavailable dates for each bien
      const mappedBiens = await Promise.all(biensData.map(async (bien: any) => {
        // Fetch media for this bien
        let media: any[] = [];
        try {
          const mediaResponse = await fetch(`${API_URL}/media/${bien.id}`);
          if (mediaResponse.ok) {
            media = await mediaResponse.json();
          }
        } catch (e) {
          console.warn(`Failed to fetch media for bien ${bien.id}`);
        }
        
        // Fetch unavailable dates for this bien
        let unavailableDates: any[] = [];
        try {
          const datesResponse = await fetch(`${API_URL}/unavailable-dates/${bien.id}`);
          if (datesResponse.ok) {
            unavailableDates = await datesResponse.json();
          }
        } catch (e) {
          console.warn(`Failed to fetch unavailable dates for bien ${bien.id}`);
        }
        
        return dbRowToBien(bien, media, unavailableDates);
      }));
      
      const zoneNameById: Record<string, string> = {};
      for (const zone of Array.isArray(zonesData) ? zonesData : []) {
        zoneNameById[zone.id] = zone.nom;
      }

      setBiens(mappedBiens);
      setProperties(mappedBiens.filter((bien) => bien.visible_sur_site !== false).map((bien) => bienToProperty(bien, zoneNameById)));
      setZones(Array.isArray(zonesData) ? zonesData : []);
      setProprietaires(Array.isArray(propsData) ? propsData : []);
      setModePriorities({
        location_saisonniere: Number(modePrioritiesData?.location_saisonniere || DEFAULT_MODE_PRIORITIES.location_saisonniere),
        vente: Number(modePrioritiesData?.vente || DEFAULT_MODE_PRIORITIES.vente),
        location_annuelle: Number(modePrioritiesData?.location_annuelle || DEFAULT_MODE_PRIORITIES.location_annuelle),
      });
    } catch (err: any) {
      console.warn('API unavailable, using local mock data:', err.message);
      // Fall back to local mock data when API is unavailable
      const localModule = await import('../data/properties');
      const localProperties = localModule.properties;
      
      // Convert local properties to bienes format
      const localBiens: Bien[] = localProperties.map((p: Property) => ({
        id: p.id,
        reference: p.id,
        titre: p.title,
        description: p.description,
        mode: 'location_saisonniere',
        type: p.category === 'Studio' ? 'studio' : p.category === 'Villa' ? 'villa_maison' : 'appartement',
        nb_chambres: p.bedrooms,
        nb_salle_bain: p.bathrooms,
        prix_nuitee: p.pricePerNight,
        tarification_methode: null,
        prix_affiche_client: null,
        prix_fixe_proprietaire: null,
        prix_final: null,
        revenu_agence: null,
        commission_pourcentage_proprietaire: 3,
        commission_pourcentage_client: 2,
        montant_max_reduction_negociation: null,
        prix_minimum_accepte: null,
        modalite_paiement_vente: null,
        pourcentage_premiere_partie_promesse: null,
        montant_premiere_partie_promesse: null,
        montant_deuxieme_partie: null,
        nombre_tranches: null,
        periode_tranches_mois: null,
        montant_par_tranche: null,
        avance: p.cleaningFee || 0,
        caution: 0,
        type_rue: null,
        type_papier: null,
        superficie_m2: null,
        etage: null,
        configuration: null,
        annee_construction: null,
        distance_plage_m: null,
        proche_plage: false,
        chauffage_central: false,
        climatisation: false,
        balcon: false,
        terrasse: false,
        ascenseur: false,
        vue_mer: false,
        gaz_ville: false,
        cuisine_equipee: false,
        place_parking: false,
        syndic: false,
        meuble: false,
        independant: false,
        eau_puits: false,
        eau_sonede: false,
        electricite_steg: false,
        surface_local_m2: null,
        facade_m: null,
        hauteur_plafond_m: null,
        activite_recommandee: null,
        toilette: false,
        reserve_local: false,
        vitrine: false,
        coin_angle: false,
        electricite_3_phases: false,
        alarme: false,
        type_terrain: null,
        terrain_facade_m: null,
        terrain_surface_m2: null,
        terrain_distance_plage_m: null,
        terrain_zone: null,
        terrain_constructible: false,
        terrain_angle: false,
        immeuble_surface_terrain_m2: null,
        immeuble_surface_batie_m2: null,
        immeuble_nb_niveaux: null,
        immeuble_nb_garages: null,
        immeuble_nb_appartements: null,
        immeuble_nb_locaux_commerciaux: null,
        immeuble_distance_plage_m: null,
        immeuble_proche_plage: false,
        immeuble_ascenseur: false,
        immeuble_parking_sous_sol: false,
        immeuble_parking_exterieur: false,
        immeuble_syndic: false,
        immeuble_vue_mer: false,
        immeuble_appartements: [],
        statut: 'disponible' as BienStatut,
        visible_sur_site: true,
        ui_config: null,
        menage_en_cours: false,
        zone_id: 'z1',
        proprietaire_id: p.proprietaire_id || '',
        date_ajout: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        media: (p.images || []).map((url, idx) => ({
          id: `local-media-${p.id}-${idx}`,
          bien_id: p.id,
          type: 'image',
          url,
          position: idx
        })),
        unavailableDates: p.unavailableDates?.map(ud => ({
          start: ud.start,
          end: ud.end,
          status: ud.status,
          color: ud.status === 'booked' ? '#ef4444' : ud.status === 'pending' ? '#f97316' : '#111827'
        })) || []
      }));

      setBiens(localBiens);
      setProperties(localProperties);
      setZones([
        { id: 'z1', nom: 'KÃ©libia Centre', description: 'Centre ville de KÃ©libia' },
        { id: 'z2', nom: 'El Mansoura', description: 'Quartier El Mansoura' },
        { id: 'z3', nom: 'Petit Paris', description: 'Quartier Petit Paris' }
      ]);
      setProprietaires([
        { id: 'p1', nom: 'PropriÃ©taire 1', telephone: '', email: '', cin: '' },
        { id: 'p2', nom: 'PropriÃ©taire 2', telephone: '', email: '', cin: '' },
        { id: 'p3', nom: 'PropriÃ©taire 3', telephone: '', email: '', cin: '' }
      ]);
      setModePriorities(DEFAULT_MODE_PRIORITIES);
      setError(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // CRUD Operations
  const addBien = async (newBien: Omit<Bien, 'id' | 'created_at' | 'updated_at'>): Promise<string> => {
    try {
      const response = await fetch(`${API_URL}/biens`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newBien)
      });
      
      if (!response.ok) {
        const message = await getApiErrorMessage(response, 'Creation du bien impossible');
        throw new Error(message);
      }

      const createdBien = await response.json();
      await fetchData(); // Refresh data
      return String(createdBien?.id || '');
    } catch (err: any) {
      console.error('Error creating bien:', err);
      throw err;
    }
  };

  const updateBien = async (updatedBien: Bien) => {
    try {
      const response = await fetch(`${API_URL}/biens/${updatedBien.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedBien)
      });
      
      if (!response.ok) {
        const message = await getApiErrorMessage(response, 'Mise a jour du bien impossible');
        throw new Error(message);
      }
      
      await fetchData(); // Refresh data
    } catch (err: any) {
      console.error('Error updating bien:', err);
      throw err;
    }
  };

  const deleteBien = async (id: string) => {
    try {
      const response = await fetch(`${API_URL}/biens/${id}`, {
        method: 'DELETE'
      });
      
      if (!response.ok) throw new Error(await getApiErrorMessage(response, 'Suppression du bien impossible'));
      
      await fetchData(); // Refresh data
    } catch (err: any) {
      console.error('Error deleting bien:', err);
      throw err;
    }
  };

  const saveModePriorities = async (next: Record<BienMode, number>) => {
    const response = await fetch(`${API_URL}/site-mode-priorities`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(next),
    });
    if (!response.ok) {
      throw new Error(await getApiErrorMessage(response, 'Mise a jour des priorites impossible'));
    }
    const data = await response.json().catch(() => null);
    setModePriorities({
      location_saisonniere: Number(data?.location_saisonniere || next.location_saisonniere || DEFAULT_MODE_PRIORITIES.location_saisonniere),
      vente: Number(data?.vente || next.vente || DEFAULT_MODE_PRIORITIES.vente),
      location_annuelle: Number(data?.location_annuelle || next.location_annuelle || DEFAULT_MODE_PRIORITIES.location_annuelle),
    });
  };

  const getBienById = (id: string) => {
    return biens.find(b => b.id === id);
  };

  const getPropertyById = (id: string) => {
    return properties.find(p => p.id === id);
  };

  const refreshData = async () => {
    await fetchData();
  };

  const value: PropertiesContextType = {
    biens,
    properties,
    zones,
    proprietaires,
    modePriorities,
    loading,
    isLoading: loading,
    error,
    addBien,
    updateBien,
    deleteBien,
    saveModePriorities,
    getBienById,
    getPropertyById,
    refreshData
  };

  return (
    <PropertiesContext.Provider value={value}>
      {children}
    </PropertiesContext.Provider>
  );
}

// ============================================
// HOOK
// ============================================

export function useProperties() {
  const context = useContext(PropertiesContext);
  if (context === undefined) {
    throw new Error('useProperties must be used within a PropertiesProvider');
  }
  return context;
}

export { bienToProperty };


