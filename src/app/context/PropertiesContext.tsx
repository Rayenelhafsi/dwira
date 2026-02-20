import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Bien, BienStatut, Media, DateStatus, BienType, Zone, Proprietaire } from '../admin/types';
import { Property } from '../data/properties';

// API Base URL
const API_URL = 'http://localhost:3001/api';

// ============================================
// CONVERSION UTILITIES
// ============================================

// Convert DB row to Bien format
function dbRowToBien(row: any): Bien {
  // Helper to convert string/number to number
  const toNumber = (val: any): number => {
    if (val === null || val === undefined) return 0;
    if (typeof val === 'number') return val;
    return parseFloat(val) || 0;
  };

  return {
    id: row.id,
    reference: row.reference,
    titre: row.titre,
    description: row.description,
    type: row.type as BienType,
    surface: toNumber(row.surface),
    nb_chambres: toNumber(row.nb_chambres),
    nb_salle_bain: toNumber(row.nb_salle_bain),
    prix_nuitee: toNumber(row.prix_nuitee),
    avance: toNumber(row.avance),
    caution: toNumber(row.caution),
    charges: toNumber(row.charges),
    statut: row.statut as BienStatut,
    menage_en_cours: row.menage_en_cours === 1 || row.menage_en_cours === true || row.menage_en_cours === '1',
    zone_id: row.zone_id,
    proprietaire_id: row.proprietaire_id,
    date_ajout: row.date_ajout,
    created_at: row.created_at,
    updated_at: row.updated_at,
    media: [],
    unavailableDates: []
  };
}

// Convert Bien (Admin format) to Property (Site format)
function bienToProperty(bien: Bien): Property {
  const zoneNames: Record<string, string> = {
    'z1': 'Kélibia Centre',
    'z2': 'El Mansoura',
    'z3': 'Petit Paris'
  };
  
  const typeToCategory: Record<string, Property['category']> = {
    'S1': 'S+1',
    'S2': 'S+2',
    'S3': 'S+3',
    'S4': 'S+4',
    'villa': 'Villa',
    'studio': 'Studio',
    'local': 'S+1'
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
    images: [
      'https://images.unsplash.com/photo-1560518883-ce09059eeffa?q=80&w=800&auto=format&fit=crop'
    ],
    description: bien.description || `Superbe ${bien.type}`,
    amenities: getAmenitiesFromType(bien.type),
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
  if (type === 'villa') {
    return [...baseAmenities, 'Piscine', 'Jardin', 'Garage', 'Parking'];
  }
  if (type === 'studio' || type === 'S1') {
    return [...baseAmenities, 'Kitchenette'];
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
      // Fetch biens
      const biensResponse = await fetch(`${API_URL}/biens`);
      if (!biensResponse.ok) throw new Error('Failed to fetch biens');
      const biensData = await biensResponse.json();
      const mappedBiens = biensData.map(dbRowToBien);
      
      setBiens(mappedBiens);
      setProperties(mappedBiens.map(bienToProperty));

      // Fetch zones
      const zonesResponse = await fetch(`${API_URL}/zones`);
      if (zonesResponse.ok) {
        const zonesData = await zonesResponse.json();
        setZones(zonesData);
      }

      // Fetch proprietaires
      const propsResponse = await fetch(`${API_URL}/proprietaires`);
      if (propsResponse.ok) {
        const propsData = await propsResponse.json();
        setProprietaires(propsData);
      }
    } catch (err: any) {
      console.error('Error fetching data:', err);
      setError(err.message);
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
