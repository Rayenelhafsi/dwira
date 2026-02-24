import { Immeuble, Lotissement, Bien } from '../types';

// Données mock pour les immeubles
export const immeubles: Immeuble[] = [
  {
    id: 'imm-001',
    titre: 'Résidence Les Oliviers',
    reference: 'IMM-2024-001',
    localisation: 'Centre-ville Kélibia',
    statut: 'disponible',
    type: 'immeuble',
    distance_plage: 500,
    surface_terrain: 800,
    surface_batie: 1200,
    nombre_niveaux: 4,
    description: 'Immeuble moderne en plein centre-ville, à quelques pas de la plage. Construction récente avec finitions haut de gamme.',
    images: [
      {
        url: 'https://images.unsplash.com/photo-1559329146-807aff9ff1fb?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxtb2Rlcm4lMjBhcGFydG1lbnQlMjBidWlsZGluZyUyMGV4dGVyaW9yfGVufDF8fHx8MTc3MTg0NTA5OHww&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral',
        alt: 'Vue extérieure de la Résidence Les Oliviers'
      },
      {
        url: 'https://images.unsplash.com/photo-1759848915476-11bb5f92f8cd?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxtZWRpdGVycmFuZWFuJTIwY29hc3RhbCUyMHByb3BlcnR5fGVufDF8fHx8MTc3MTg5MTYxN3ww&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral',
        alt: 'Vue sur la côte depuis l\'immeuble'
      }
    ],
    caracteristiques_generales: {
      eau_puits: false,
      eau_sonede: true,
      electricite_steg: true
    },
    caracteristiques: {
      vue_mer: true,
      proche_plage: true,
      ascenseur: true,
      parking_sous_sol: true,
      parking_exterieur: false,
      syndic: true
    },
    tarification: {
      prix_affiche: 850000,
      commission: 42500,
      prix_final: 892500
    },
    paiement: {
      mode: 'facilite',
      montant_total: 892500,
      promesse: 200000,
      reste: 692500
    },
    appartements: [
      {
        id: 'app-001',
        reference: 'IMM-001-APP-A1',
        nombre_chambres: 2,
        nombre_salles_bain: 1,
        surface: 85,
        configuration: 'S+2',
        etage: 1,
        statut: 'disponible',
        prix: 180000,
        images: [
          {
            url: 'https://images.unsplash.com/photo-1738168279272-c08d6dd22002?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxsdXh1cnklMjBhcGFydG1lbnQlMjBpbnRlcmlvciUyMGxpdmluZyUyMHJvb218ZW58MXx8fHwxNzcxODE2NDY5fDA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral',
            alt: 'Salon appartement A1'
          },
          {
            url: 'https://images.unsplash.com/photo-1597497522150-2f50bffea452?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxtb2Rlcm4lMjBraXRjaGVuJTIwYXBhcnRtZW50fGVufDF8fHx8MTc3MTg2NzIzOXww&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral',
            alt: 'Cuisine appartement A1'
          },
          {
            url: 'https://images.unsplash.com/photo-1556020685-ae41abfc9365?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxiZWRyb29tJTIwYXBhcnRtZW50JTIwaW50ZXJpb3J8ZW58MXx8fHwxNzcxODkxNjEyfDA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral',
            alt: 'Chambre appartement A1'
          }
        ]
      },
      {
        id: 'app-002',
        reference: 'IMM-001-APP-A2',
        nombre_chambres: 3,
        nombre_salles_bain: 2,
        surface: 120,
        configuration: 'S+3',
        etage: 2,
        statut: 'disponible',
        prix: 250000,
        images: [
          {
            url: 'https://images.unsplash.com/photo-1738168279272-c08d6dd22002?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxsdXh1cnklMjBhcGFydG1lbnQlMjBpbnRlcmlvciUyMGxpdmluZyUyMHJvb218ZW58MXx8fHwxNzcxODE2NDY5fDA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral',
            alt: 'Salon appartement A2'
          },
          {
            url: 'https://images.unsplash.com/photo-1768118422932-4cdcca2ced8f?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxiYWxjb255JTIwYXBhcnRtZW50JTIwdmlld3xlbnwxfHx8fDE3NzE4OTE2MTh8MA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral',
            alt: 'Balcon appartement A2'
          }
        ]
      },
      {
        id: 'app-003',
        reference: 'IMM-001-APP-A3',
        nombre_chambres: 1,
        nombre_salles_bain: 1,
        surface: 65,
        configuration: 'S+1',
        etage: 3,
        statut: 'vendu',
        prix: 140000,
        images: [
          {
            url: 'https://images.unsplash.com/photo-1738168279272-c08d6dd22002?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxsdXh1cnklMjBhcGFydG1lbnQlMjBpbnRlcmlvciUyMGxpdmluZyUyMHJvb218ZW58MXx8fHwxNzcxODE2NDY5fDA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral',
            alt: 'Studio appartement A3'
          }
        ]
      }
    ],
    garages: [
      {
        id: 'gar-001',
        reference: 'IMM-001-GAR-G1',
        surface: 15,
        type: 'sous-sol',
        statut: 'disponible',
        prix: 25000,
        images: [
          {
            url: 'https://images.unsplash.com/photo-1740479231174-43522f4eab3f?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxnYXJhZ2UlMjBwYXJraW5nJTIwaW50ZXJpb3J8ZW58MXx8fHwxNzcxODkxNjEyfDA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral',
            alt: 'Garage G1'
          }
        ]
      },
      {
        id: 'gar-002',
        reference: 'IMM-001-GAR-G2',
        surface: 15,
        type: 'sous-sol',
        statut: 'disponible',
        prix: 25000,
        images: [
          {
            url: 'https://images.unsplash.com/photo-1740479231174-43522f4eab3f?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxnYXJhZ2UlMjBwYXJraW5nJTIwaW50ZXJpb3J8ZW58MXx8fHwxNzcxODkxNjEyfDA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral',
            alt: 'Garage G2'
          }
        ]
      }
    ],
    locaux_commerciaux: [
      {
        id: 'loc-001',
        reference: 'IMM-001-LOC-L1',
        surface: 80,
        facade: 8,
        hauteur_plafond: 3.5,
        activite_recommandee: 'Commerce de détail',
        statut: 'disponible',
        prix: 180000,
        images: [
          {
            url: 'https://images.unsplash.com/photo-1677785078383-af0ac5cd0422?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxjb21tZXJjaWFsJTIwc3BhY2UlMjBzdG9yZWZyb250fGVufDF8fHx8MTc3MTg5MTYxMnww&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral',
            alt: 'Local commercial L1'
          },
          {
            url: 'https://images.unsplash.com/photo-1641159930908-e9eb9ccdc002?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxvZmZpY2UlMjBjb21tZXJjaWFsJTIwc3BhY2UlMjBlbXB0eXxlbnwxfHx8fDE3NzE4OTE2MTh8MA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral',
            alt: 'Intérieur local L1'
          }
        ]
      }
    ]
  },
  {
    id: 'imm-002',
    titre: 'Immeuble Dar El Bahri',
    reference: 'IMM-2024-002',
    localisation: 'Front de mer Kélibia',
    statut: 'disponible',
    type: 'immeuble',
    distance_plage: 50,
    surface_terrain: 500,
    surface_batie: 900,
    nombre_niveaux: 3,
    description: 'Immeuble avec vue panoramique sur la mer, idéalement situé sur le front de mer.',
    images: [
      {
        url: 'https://images.unsplash.com/photo-1559329146-807aff9ff1fb?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxtb2Rlcm4lMjBhcGFydG1lbnQlMjBidWlsZGluZyUyMGV4dGVyaW9yfGVufDF8fHx8MTc3MTg0NTA5OHww&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral',
        alt: 'Vue extérieure Dar El Bahri'
      }
    ],
    caracteristiques_generales: {
      eau_puits: false,
      eau_sonede: true,
      electricite_steg: true
    },
    caracteristiques: {
      vue_mer: true,
      proche_plage: true,
      ascenseur: false,
      parking_sous_sol: false,
      parking_exterieur: true,
      syndic: false
    },
    tarification: {
      prix_affiche: 650000,
      commission: 32500,
      prix_final: 682500
    },
    paiement: {
      mode: 'comptant',
      montant_total: 682500,
      promesse: 682500,
      reste: 0
    },
    appartements: [
      {
        id: 'app-004',
        reference: 'IMM-002-APP-A1',
        nombre_chambres: 4,
        nombre_salles_bain: 2,
        surface: 150,
        configuration: 'S+4',
        etage: 2,
        statut: 'disponible',
        prix: 320000,
        images: [
          {
            url: 'https://images.unsplash.com/photo-1738168279272-c08d6dd22002?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxsdXh1cnklMjBhcGFydG1lbnQlMjBpbnRlcmlvciUyMGxpdmluZyUyMHJvb218ZW58MXx8fHwxNzcxODE2NDY5fDA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral',
            alt: 'Salon spacieux'
          },
          {
            url: 'https://images.unsplash.com/photo-1757439402224-56c48352f719?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxiYXRocm9vbSUyMG1vZGVybiUyMGFwYXJ0bWVudHxlbnwxfHx8fDE3NzE4OTE2MTd8MA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral',
            alt: 'Salle de bain moderne'
          }
        ]
      },
      {
        id: 'app-005',
        reference: 'IMM-002-APP-A2',
        nombre_chambres: 2,
        nombre_salles_bain: 1,
        surface: 90,
        configuration: 'S+2',
        etage: 1,
        statut: 'reserve',
        prix: 190000,
        images: [
          {
            url: 'https://images.unsplash.com/photo-1738168279272-c08d6dd22002?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxsdXh1cnklMjBhcGFydG1lbnQlMjBpbnRlcmlvciUyMGxpdmluZyUyMHJvb218ZW58MXx8fHwxNzcxODE2NDY5fDA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral',
            alt: 'Salon appartement A2'
          }
        ]
      }
    ],
    garages: [],
    locaux_commerciaux: [
      {
        id: 'loc-002',
        reference: 'IMM-002-LOC-L1',
        surface: 60,
        facade: 6,
        hauteur_plafond: 3,
        activite_recommandee: 'Restaurant / Café',
        statut: 'disponible',
        prix: 150000,
        images: [
          {
            url: 'https://images.unsplash.com/photo-1641159930908-e9eb9ccdc002?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxvZmZpY2UlMjBjb21tZXJjaWFsJTIwc3BhY2UlMjBlbXB0eXxlbnwxfHx8fDE3NzE4OTE2MTh8MA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral',
            alt: 'Espace commercial'
          }
        ]
      }
    ]
  }
];

// Données mock pour les lotissements
export const lotissements: Lotissement[] = [
  {
    id: 'lot-001',
    titre: 'Lotissement Jardins de la Mer',
    reference: 'LOT-2024-001',
    localisation: 'Zone touristique Kélibia',
    statut: 'disponible',
    type: 'lotissement',
    nombre_total_terrains: 15,
    description: 'Lotissement résidentiel haut standing avec vue mer, à proximité immédiate de la plage.',
    images: [
      {
        url: 'https://images.unsplash.com/photo-1764222233275-87dc016c11dc?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxsYW5kJTIwcGxvdCUyMHJlc2lkZW50aWFsJTIwZGV2ZWxvcG1lbnR8ZW58MXx8fHwxNzcxODkxNjE0fDA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral',
        alt: 'Vue aérienne du lotissement'
      },
      {
        url: 'https://images.unsplash.com/photo-1769248395023-9511d4b07523?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxyZXNpZGVudGlhbCUyMG5laWdoYm9yaG9vZCUyMGRldmVsb3BtZW50fGVufDF8fHx8MTc3MTg5MTYxNHww&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral',
        alt: 'Vue du quartier'
      }
    ],
    caracteristiques_generales: {
      eau_puits: false,
      eau_sonede: true,
      electricite_steg: true
    },
    tarification: {
      prix_affiche: 1200000,
      commission: 60000,
      prix_final: 1260000,
      prix_au_m2: 250,
      mode_prix: 'paliers'
    },
    paiement: {
      mode: 'facilite',
      montant_total: 1260000,
      promesse: 300000,
      reste: 960000
    },
    terrains: [
      {
        id: 'ter-001',
        reference: 'LOT-001-TER-T1',
        facade: 20,
        surface: 400,
        type_terrain: 'habitation',
        zone: 'Résidentielle A',
        distance_plage: 200,
        constructible: true,
        terrain_angle: true,
        statut: 'disponible',
        prix: 100000,
        prix_au_m2: 250,
        images: [
          {
            url: 'https://images.unsplash.com/photo-1763809677783-9b126e2dde88?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxlbXB0eSUyMGxhbmQlMjB0ZXJyYWluJTIwYWVyaWFsJTIwdmlld3xlbnwxfHx8fDE3NzE4OTE2MTN8MA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral',
            alt: 'Terrain T1'
          }
        ]
      },
      {
        id: 'ter-002',
        reference: 'LOT-001-TER-T2',
        facade: 15,
        surface: 350,
        type_terrain: 'habitation',
        zone: 'Résidentielle A',
        distance_plage: 250,
        constructible: true,
        terrain_angle: false,
        statut: 'disponible',
        prix: 87500,
        prix_au_m2: 250,
        images: [
          {
            url: 'https://images.unsplash.com/photo-1763809677783-9b126e2dde88?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxlbXB0eSUyMGxhbmQlMjB0ZXJyYWluJTIwYWVyaWFsJTIwdmlld3xlbnwxfHx8fDE3NzE4OTE2MTN8MA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral',
            alt: 'Terrain T2'
          }
        ]
      },
      {
        id: 'ter-003',
        reference: 'LOT-001-TER-T3',
        facade: 18,
        surface: 380,
        type_terrain: 'habitation',
        zone: 'Résidentielle A',
        distance_plage: 220,
        constructible: true,
        terrain_angle: false,
        statut: 'vendu',
        prix: 95000,
        prix_au_m2: 250,
        images: [
          {
            url: 'https://images.unsplash.com/photo-1763809677783-9b126e2dde88?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxlbXB0eSUyMGxhbmQlMjB0ZXJyYWluJTIwYWVyaWFsJTIwdmlld3xlbnwxfHx8fDE3NzE4OTE2MTN8MA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral',
            alt: 'Terrain T3'
          }
        ]
      },
      {
        id: 'ter-004',
        reference: 'LOT-001-TER-T4',
        facade: 25,
        surface: 500,
        type_terrain: 'habitation',
        zone: 'Résidentielle A',
        distance_plage: 180,
        constructible: true,
        terrain_angle: true,
        statut: 'disponible',
        prix: 125000,
        prix_au_m2: 250,
        images: [
          {
            url: 'https://images.unsplash.com/photo-1763809677783-9b126e2dde88?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxlbXB0eSUyMGxhbmQlMjB0ZXJyYWluJTIwYWVyaWFsJTIwdmlld3xlbnwxfHx8fDE3NzE4OTE2MTN8MA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral',
            alt: 'Terrain T4'
          }
        ]
      },
      {
        id: 'ter-005',
        reference: 'LOT-001-TER-T5',
        facade: 16,
        surface: 320,
        type_terrain: 'habitation',
        zone: 'Résidentielle B',
        distance_plage: 300,
        constructible: true,
        terrain_angle: false,
        statut: 'reserve',
        prix: 80000,
        prix_au_m2: 250,
        images: [
          {
            url: 'https://images.unsplash.com/photo-1763809677783-9b126e2dde88?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxlbXB0eSUyMGxhbmQlMjB0ZXJyYWluJTIwYWVyaWFsJTIwdmlld3xlbnwxfHx8fDE3NzE4OTE2MTN8MA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral',
            alt: 'Terrain T5'
          }
        ]
      }
    ]
  },
  {
    id: 'lot-002',
    titre: 'Lotissement Les Pins',
    reference: 'LOT-2024-002',
    localisation: 'Route Menzel Temime',
    statut: 'disponible',
    type: 'lotissement',
    nombre_total_terrains: 20,
    description: 'Lotissement agricole avec possibilité de construction, idéal pour projet résidentiel ou agricole.',
    images: [
      {
        url: 'https://images.unsplash.com/photo-1763809677783-9b126e2dde88?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxlbXB0eSUyMGxhbmQlMjB0ZXJyYWluJTIwYWVyaWFsJTIwdmlld3xlbnwxfHx8fDE3NzE4OTE2MTN8MA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral',
        alt: 'Vue du lotissement Les Pins'
      }
    ],
    caracteristiques_generales: {
      eau_puits: true,
      eau_sonede: true,
      electricite_steg: true
    },
    tarification: {
      prix_affiche: 800000,
      commission: 40000,
      prix_final: 840000,
      prix_au_m2: 100,
      mode_prix: 'unique'
    },
    paiement: {
      mode: 'comptant',
      montant_total: 840000,
      promesse: 840000,
      reste: 0
    },
    terrains: [
      {
        id: 'ter-006',
        reference: 'LOT-002-TER-T1',
        facade: 30,
        surface: 1000,
        type_terrain: 'agricole',
        zone: 'Agricole',
        constructible: true,
        terrain_angle: false,
        statut: 'disponible',
        prix: 100000,
        prix_au_m2: 100,
        images: [
          {
            url: 'https://images.unsplash.com/photo-1763809677783-9b126e2dde88?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxlbXB0eSUyMGxhbmQlMjB0ZXJyYWluJTIwYWVyaWFsJTIwdmlld3xlbnwxfHx8fDE3NzE4OTE2MTN8MA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral',
            alt: 'Terrain agricole T1'
          }
        ]
      },
      {
        id: 'ter-007',
        reference: 'LOT-002-TER-T2',
        facade: 25,
        surface: 800,
        type_terrain: 'agricole',
        zone: 'Agricole',
        constructible: true,
        terrain_angle: true,
        statut: 'disponible',
        prix: 80000,
        prix_au_m2: 100,
        images: [
          {
            url: 'https://images.unsplash.com/photo-1763809677783-9b126e2dde88?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxlbXB0eSUyMGxhbmQlMjB0ZXJyYWluJTIwYWVyaWFsJTIwdmlld3xlbnwxfHx8fDE3NzE4OTE2MTN8MA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral',
            alt: 'Terrain agricole T2'
          }
        ]
      }
    ]
  }
];

// Tous les biens (union des immeubles et lotissements)
export const allBiens: Bien[] = [...immeubles, ...lotissements];
