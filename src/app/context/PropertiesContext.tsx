import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Bien, BienStatut, Media, DateStatus, BienType, Zone, Proprietaire, BienMode } from '../admin/types';
import { Property } from '../data/properties';

// API Base URL
const API_URL = 'http://localhost:3001/api';
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

  const parsedDescription = parseDescriptionAndCharacteristics(row.description);
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
    avance: toNumber(row.avance),
    caution: toNumber((row as any).caution),
    statut: row.statut as BienStatut,
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
        position: m.position || 0
      }))
      .sort((a, b) => (a.position || 0) - (b.position || 0)),

    unavailableDates: (Array.isArray(unavailableDates) ? unavailableDates : []).map(ud => ({
      start: ud.start_date,
      end: ud.end_date,
      status: ud.status,
      color: ud.color || (ud.status === 'booked' ? '#ef4444' : ud.status === 'pending' ? '#f97316' : '#111827')
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
    'bungalow': 'Villa',
    'villa': 'Villa',
  };

  return {
    id: bien.id,
    title: bien.titre,
    slug: bien.titre.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    location: zoneNames[bien.zone_id || ''] || 'Kélibia',
    pricePerNight: bien.prix_nuitee,
    rating: 4.5 + Math.random() * 0.5,
    reviews: Math.floor(Math.random() * 30) + 5,
    guests: bien.nb_chambres + 1,
    bedrooms: bien.nb_chambres,
    bathrooms: bien.nb_salle_bain,
    images: bien.media && bien.media.length > 0 
      ? bien.media.map((m: any) => m.url) 
      : ['https://images.unsplash.com/photo-1560518883-ce09059eeffa?q=80&w=800&auto=format&fit=crop'],
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
  loading: boolean;
  isLoading: boolean;
  error: string | null;
  addBien: (newBien: Omit<Bien, 'id' | 'created_at' | 'updated_at'>) => Promise<void>;
  updateBien: (updatedBien: Bien) => Promise<void>;
  deleteBien: (id: string) => Promise<void>;
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch data from API
  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [biensResponse, zonesResponse, propsResponse] = await Promise.all([
        fetch(`${API_URL}/biens`),
        fetch(`${API_URL}/zones`),
        fetch(`${API_URL}/proprietaires`),
      ]);
      if (!biensResponse.ok) throw new Error('Failed to fetch biens');
      const biensData = await biensResponse.json();
      const zonesData = zonesResponse.ok ? await zonesResponse.json() : [];
      const propsData = propsResponse.ok ? await propsResponse.json() : [];
      
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
      setProperties(mappedBiens.map((bien) => bienToProperty(bien, zoneNameById)));
      setZones(Array.isArray(zonesData) ? zonesData : []);
      setProprietaires(Array.isArray(propsData) ? propsData : []);
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
        avance: p.cleaningFee || 0,
        caution: 0,
        statut: 'disponible' as BienStatut,
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
        { id: 'z1', nom: 'Kélibia Centre', description: 'Centre ville de Kélibia' },
        { id: 'z2', nom: 'El Mansoura', description: 'Quartier El Mansoura' },
        { id: 'z3', nom: 'Petit Paris', description: 'Quartier Petit Paris' }
      ]);
      setProprietaires([
        { id: 'p1', nom: 'Propriétaire 1', telephone: '', email: '', cin: '' },
        { id: 'p2', nom: 'Propriétaire 2', telephone: '', email: '', cin: '' },
        { id: 'p3', nom: 'Propriétaire 3', telephone: '', email: '', cin: '' }
      ]);
      setError(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // CRUD Operations
  const addBien = async (newBien: Omit<Bien, 'id' | 'created_at' | 'updated_at'>) => {
    try {
      const response = await fetch(`${API_URL}/biens`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newBien)
      });
      
      if (!response.ok) throw new Error('Failed to create bien');
      
      await fetchData(); // Refresh data
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
      
      if (!response.ok) throw new Error('Failed to update bien');
      
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
      
      if (!response.ok) throw new Error('Failed to delete bien');
      
      await fetchData(); // Refresh data
    } catch (err: any) {
      console.error('Error deleting bien:', err);
      throw err;
    }
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
    loading,
    isLoading: loading,
    error,
    addBien,
    updateBien,
    deleteBien,
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

