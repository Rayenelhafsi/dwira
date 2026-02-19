import { 
  Utilisateur, Zone, Proprietaire, Bien, Locataire, Contrat, Paiement, Maintenance, Notification 
} from '../types';

export const mockUsers: Utilisateur[] = [
  { id: '1', nom: 'Admin Ghaith', email: 'admin@dwira.com', role: 'admin', created_at: '2023-01-01' },
  { id: '2', nom: 'Agent Immo', email: 'agent@dwira.com', role: 'user', created_at: '2023-02-15' }
];

export const mockZones: Zone[] = [
  { id: 'z1', nom: 'Kélibia Centre', description: 'Zone urbaine dynamique' },
  { id: 'z2', nom: 'El Mansoura', description: 'Zone touristique balnéaire' },
  { id: 'z3', nom: 'Petit Paris', description: 'Quartier résidentiel calme' }
];

export const mockProprietaires: Proprietaire[] = [
  { id: 'p1', nom: 'Ahmed Ben Ali', telephone: '+216 55 123 456', email: 'ahmed@gmail.com', cin: '09876543' },
  { id: 'p2', nom: 'Fatma Zahra', telephone: '+216 22 987 654', email: 'fatma@yahoo.fr', cin: '01234567' },
  { id: 'p3', nom: 'Société Immobilière du Cap', telephone: '+216 71 111 222', email: 'contact@sicap.tn', cin: '12345678' }
];

export const mockBiens: Bien[] = [
  {
    id: 'b1',
    reference: 'REF-001',
    titre: 'Villa de Luxe avec Piscine',
    description: 'Magnifique villa moderne à 5min de la plage. Cette somptueuse villa offre un cadre de vie exceptionnel avec ses 4 chambres spacieuses, sa piscine privée et son jardin paysager. Parfaitement équipée pour des vacances inoubliables en famille ou entre amis.',
    type: 'villa',
    surface: 250,
    nb_chambres: 4,
    nb_salle_bain: 3,
    meuble: true,
    prix_loyer: 450,
    charges: 50,
    caution: 1000,
    mode_location: 'saisonniere',
    statut: 'disponible',
    zone_id: 'z2',
    proprietaire_id: 'p1',
    date_ajout: '2023-05-10',
    created_at: '2023-05-10',
    updated_at: '2023-06-01',
    media: [
      { id: 'm1', bien_id: 'b1', type: 'image', url: 'https://images.unsplash.com/photo-1613490493576-7fde63acd811?q=80&w=800&auto=format&fit=crop' },
      { id: 'm2', bien_id: 'b1', type: 'image', url: 'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?q=80&w=800&auto=format&fit=crop' },
      { id: 'm3', bien_id: 'b1', type: 'image', url: 'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?q=80&w=800&auto=format&fit=crop' },
      { id: 'm4', bien_id: 'b1', type: 'image', url: 'https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?q=80&w=800&auto=format&fit=crop' }
    ],
    unavailableDates: [
      { start: '2024-12-20', end: '2024-12-31', status: 'booked', color: '#ef4444' },
      { start: '2025-01-05', end: '2025-01-10', status: 'pending', color: '#f97316', paymentDeadline: '2025-01-03' },
      { start: '2025-02-01', end: '2025-02-07', status: 'blocked', color: '#111827' }
    ]
  },
  {
    id: 'b2',
    reference: 'REF-002',
    titre: 'Appartement S+2 Vue Mer',
    description: 'Vue imprenable sur la Méditerranée. Appartement moderne et lumineux avec balcon offrant une vue panoramique exceptionnelle. Idéalement situé près des commodités et de la plage.',
    type: 'S2',
    surface: 95,
    nb_chambres: 2,
    nb_salle_bain: 1,
    meuble: true,
    prix_loyer: 1200,
    charges: 100,
    caution: 2400,
    mode_location: 'annuelle',
    statut: 'loue',
    zone_id: 'z2',
    proprietaire_id: 'p2',
    date_ajout: '2023-04-15',
    created_at: '2023-04-15',
    updated_at: '2023-04-20',
    media: [
      { id: 'm5', bien_id: 'b2', type: 'image', url: 'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?q=80&w=800&auto=format&fit=crop' },
      { id: 'm6', bien_id: 'b2', type: 'image', url: 'https://images.unsplash.com/photo-1502005229762-cf1b2da7c5d6?q=80&w=800&auto=format&fit=crop' },
      { id: 'm7', bien_id: 'b2', type: 'image', url: 'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?q=80&w=800&auto=format&fit=crop' }
    ],
    unavailableDates: [
      { start: '2024-12-01', end: '2025-11-30', status: 'booked', color: '#ef4444' }
    ]
  },
  {
    id: 'b3',
    reference: 'REF-003',
    titre: 'Studio Centre Ville',
    description: 'Idéal étudiant ou jeune couple. Studio fonctionnel en plein centre-ville, proche de toutes commodités. Entièrement rénové avec goût.',
    type: 'studio',
    surface: 45,
    nb_chambres: 1,
    nb_salle_bain: 1,
    meuble: false,
    prix_loyer: 600,
    charges: 30,
    caution: 1200,
    mode_location: 'annuelle',
    statut: 'disponible',
    zone_id: 'z1',
    proprietaire_id: 'p3',
    date_ajout: '2023-06-20',
    created_at: '2023-06-20',
    updated_at: '2023-06-20',
    media: [
      { id: 'm8', bien_id: 'b3', type: 'image', url: 'https://images.unsplash.com/photo-1554995207-c18c203602cb?q=80&w=800&auto=format&fit=crop' },
      { id: 'm9', bien_id: 'b3', type: 'image', url: 'https://images.unsplash.com/photo-1536376072261-38c75010e6c9?q=80&w=800&auto=format&fit=crop' }
    ],
    unavailableDates: []
  },
  {
    id: 'b4',
    reference: 'REF-004',
    titre: 'Local Commercial',
    description: 'Grand local sur rue passante. Excellent emplacement pour votre commerce avec forte visibilité et passage. Surface généreuse avec arrière-boutique.',
    type: 'local',
    surface: 120,
    nb_chambres: 0,
    nb_salle_bain: 1,
    meuble: false,
    prix_loyer: 2500,
    charges: 0,
    caution: 5000,
    mode_location: 'annuelle',
    statut: 'maintenance',
    zone_id: 'z1',
    proprietaire_id: 'p3',
    date_ajout: '2023-01-10',
    created_at: '2023-01-10',
    updated_at: '2023-07-01',
    media: [
      { id: 'm10', bien_id: 'b4', type: 'image', url: 'https://images.unsplash.com/photo-1497366216548-37526070297c?q=80&w=800&auto=format&fit=crop' },
      { id: 'm11', bien_id: 'b4', type: 'image', url: 'https://images.unsplash.com/photo-1497366811353-6870744d04b2?q=80&w=800&auto=format&fit=crop' }
    ],
    unavailableDates: [
      { start: '2024-12-15', end: '2024-12-25', status: 'blocked', color: '#111827' }
    ]
  }
];

export const mockLocataires: Locataire[] = [
  { id: 'l1', nom: 'Sami Tounsi', telephone: '20 111 222', email: 'sami@gmail.com', cin: '05555555', score_fiabilite: 9, created_at: '2023-03-10' },
  { id: 'l2', nom: 'Amel Karoui', telephone: '50 333 444', email: 'amel@yahoo.com', cin: '06666666', score_fiabilite: 7, created_at: '2023-04-05' },
  { id: 'l3', nom: 'Jean Dupont', telephone: '98 777 888', email: 'jean@france.fr', cin: 'P1234567', score_fiabilite: 10, created_at: '2023-06-01' }
];

export const mockContrats: Contrat[] = [
  { 
    id: 'c1', 
    bien_id: 'b2', 
    locataire_id: 'l1', 
    date_debut: '2023-05-01', 
    date_fin: '2024-04-30', 
    depot_garantie: 2400, 
    statut: 'actif', 
    created_at: '2023-04-28' 
  }
];

export const mockPaiements: Paiement[] = [
  { id: 'pay1', contrat_id: 'c1', montant: 1200, date_paiement: '2023-05-01', statut: 'paye', methode: 'virement' },
  { id: 'pay2', contrat_id: 'c1', montant: 1200, date_paiement: '2023-06-01', statut: 'paye', methode: 'virement' },
  { id: 'pay3', contrat_id: 'c1', montant: 1200, date_paiement: '2023-07-01', statut: 'en_attente', methode: 'virement' }
];

export const mockMaintenances: Maintenance[] = [
  { id: 'maint1', bien_id: 'b4', description: 'Peinture façade et réparation porte', cout: 1500, statut: 'en_cours', created_at: '2023-07-01' }
];

export const mockNotifications: Notification[] = [
  { id: 'n1', utilisateur_id: '1', type: 'info', message: 'Nouveau contrat signé pour REF-002', lu: false, created_at: '2023-07-05T10:30:00' },
  { id: 'n2', utilisateur_id: '1', type: 'warning', message: 'Retard de paiement pour contrat C1', lu: false, created_at: '2023-07-06T09:15:00' }
];
