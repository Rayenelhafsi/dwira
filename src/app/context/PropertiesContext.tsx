import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Bien, BienStatut, Media, DateStatus } from '../admin/types';
import { Property } from '../data/properties';

// Import existing data sources
import { mockBiens } from '../admin/data/mockData';
import { properties as siteProperties } from '../data/properties';

// ============================================
// CONVERSION UTILITIES
// ============================================

// Convert Bien (Admin format) to Property (Site format)
function bienToProperty(bien: Bien): Property {
  // Get zone name as location
  const zoneNames: Record<string, string> = {
    'z1': 'Kélibia Centre',
    'z2': 'El Mansoura',
    'z3': 'Petit Paris'
  };
  
  const typeToCategory: Record<string, Property['category']> = {
    'S1': 'S+1',
    'S2': 'S+2',
    'S3': 'S+3',
    'villa': 'Villa',
    'studio': 'Studio'
  };

  // Convert media to images array
  const images = bien.media?.map(m => m.url) || [];
  
  // If no images from media, use placeholder
  const propertyImages = images.length > 0 ? images : [
    'https://images.unsplash.com/photo-1560518883-ce09059eeffa?q=80&w=800&auto=format&fit=crop'
  ];

  // Determine if featured based on price (simple heuristic)
  const isFeatured = bien.prix_loyer > 300 || bien.statut === 'disponible';

  return {
    id: bien.id,
    title: bien.titre,
    slug: bien.titre.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    location: zoneNames[bien.zone_id] || 'Kélibia',
    pricePerNight: Math.round(bien.prix_loyer / 30), // Convert monthly to nightly
    rating: 4.5 + Math.random() * 0.5, // Mock rating
    reviews: Math.floor(Math.random() * 30) + 5,
    guests: bien.nb_chambres + 1,
    bedrooms: bien.nb_chambres,
    bathrooms: bien.nb_salle_bain,
    images: propertyImages,
    description: bien.description || `Superbe ${bien.type} de ${bien.surface}m²`,
    amenities: getAmenitiesFromType(bien.type, bien.meuble),
    category: typeToCategory[bien.type] || 'S+1',
    isFeatured,
    unavailableDates: bien.unavailableDates || [],
    cleaningFee: bien.charges || 0,
    serviceFee: Math.round(bien.prix_loyer * 0.1),
    proprietaire_id: bien.proprietaire_id
  };
}

// Convert Property (Site format) to Bien (Admin format)
function propertyToBien(property: Property): Bien {
  const categoryToType: Record<Property['category'], string> = {
    'S+1': 'S1',
    'S+2': 'S2',
    'S+3': 'S3',
    'S+4': 'S3',
    'Villa': 'villa',
    'Studio': 'studio'
  };

  const zoneIds: Record<string, string> = {
    'Kélibia Centre': 'z1',
    'El Mansoura': 'z2',
    'Petit Paris': 'z3',
    'Kélibia': 'z1',
    'Front de mer': 'z2'
  };

  return {
    id: property.id,
    reference: `REF-${property.id.padStart(3, '0')}`,
    titre: property.title,
    description: property.description,
    type: categoryToType[property.category] as any || 'S1',
    surface: property.bedrooms * 30 + 20, // Estimate
    nb_chambres: property.bedrooms,
    nb_salle_bain: property.bathrooms,
    meuble: true,
    prix_loyer: property.pricePerNight * 30, // Convert nightly to monthly
    charges: property.cleaningFee || 0,
    caution: property.pricePerNight * 60,
    mode_location: 'saisonniere',
    statut: 'disponible' as BienStatut,
    zone_id: zoneIds[property.location] || 'z1',
    proprietaire_id: property.proprietaire_id,
    date_ajout: new Date().toISOString().split('T')[0],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    media: property.images.map((url, idx) => ({
      id: `m${idx}`,
      bien_id: property.id,
      type: 'image' as const,
      url
    })),
    unavailableDates: property.unavailableDates
  };
}

// Helper function to get amenities based on property type
function getAmenitiesFromType(type: string, meuble: boolean): string[] {
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
  // Properties in admin format (Bien)
  biens: Bien[];
  // Properties in site format (Property)
  properties: Property[];
  // CRUD operations
  addBien: (bien: Omit<Bien, 'id' | 'created_at' | 'updated_at'>) => void;
  updateBien: (bien: Bien) => void;
  deleteBien: (id: string) => void;
  // Get single property
  getBienById: (id: string) => Bien | undefined;
  getPropertyById: (id: string) => Property | undefined;
  // Refresh data from both sources
  refreshData: () => void;
}

const PropertiesContext = createContext<PropertiesContextType | undefined>(undefined);

// ============================================
// CONTEXT PROVIDER
// ============================================

export function PropertiesProvider({ children }: { children: ReactNode }) {
  const [biens, setBiens] = useState<Bien[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);

  // Initialize data from both sources
  const initializeData = () => {
    // First, use mockBiens as the primary source (from admin)
    // This ensures the admin data is preserved
    const initialBiens = mockBiens.length > 0 ? mockBiens : siteProperties.map(propertyToBien);
    
    setBiens(initialBiens);
    
    // Convert to site format
    const initialProperties = initialBiens.map(bienToProperty);
    setProperties(initialProperties);
  };

  useEffect(() => {
    initializeData();
  }, []);

  // CRUD Operations
  const addBien = (newBien: Omit<Bien, 'id' | 'created_at' | 'updated_at'>) => {
    const bien: Bien = {
      ...newBien,
      id: Math.random().toString(36).substr(2, 9),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    
    setBiens(prev => [...prev, bien]);
    setProperties(prev => [...prev, bienToProperty(bien)]);
  };

  const updateBien = (updatedBien: Bien) => {
    const bienWithTimestamp = {
      ...updatedBien,
      updated_at: new Date().toISOString()
    };
    
    setBiens(prev => prev.map(b => b.id === bienWithTimestamp.id ? bienWithTimestamp : b));
    setProperties(prev => prev.map(p => p.id === bienWithTimestamp.id ? bienToProperty(bienWithTimestamp) : p));
  };

  const deleteBien = (id: string) => {
    setBiens(prev => prev.filter(b => b.id !== id));
    setProperties(prev => prev.filter(p => p.id !== id));
  };

  const getBienById = (id: string) => {
    return biens.find(b => b.id === id);
  };

  const getPropertyById = (id: string) => {
    return properties.find(p => p.id === id);
  };

  const refreshData = () => {
    initializeData();
  };

  const value: PropertiesContextType = {
    biens,
    properties,
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

// Export conversion utilities for external use
export { bienToProperty, propertyToBien };
