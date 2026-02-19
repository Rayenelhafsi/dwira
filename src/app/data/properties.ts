export interface DateStatus {
  start: string;
  end: string;
  status: 'blocked' | 'pending' | 'booked';
  paymentDeadline?: string; // Date when the first person must confirm payment (for pending status)
}

export interface Property {
  id: string;
  title: string;
  slug: string;
  location: string;
  pricePerNight: number;
  rating: number;
  reviews: number;
  guests: number;
  bedrooms: number;
  bathrooms: number;
  images: string[];
  description: string;
  amenities: string[];
  // Updated type definition to match client request
  category: "S+1" | "S+2" | "S+3" | "S+4" | "Villa" | "Studio";
  isFeatured?: boolean;
  unavailableDates?: DateStatus[];
  cleaningFee?: number;
  serviceFee?: number;
  // Owner information
  proprietaire_id: string;
}

export const properties: Property[] = [
  {
    id: "1",
    title: "Dar Jomana - Villa de Luxe avec Piscine",
    slug: "dar-jomana",
    location: "Kélibia",
    pricePerNight: 450,
    rating: 4.8,
    reviews: 24,
    guests: 3,
    bedrooms: 4,
    bathrooms: 3,
    images: [
      "https://images.unsplash.com/photo-1613490493576-7fde63acd811?q=80&w=1600&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?q=80&w=1600&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1613977257363-707ba9348227?q=80&w=1600&auto=format&fit=crop"
    ],
    description: "Une magnifique villa située à quelques pas de la plage de Kélibia. Idéale pour les familles, elle dispose d'une grande piscine privée et d'un jardin luxuriant.",
    amenities: ["Wifi", "Piscine", "Climatisation", "Cuisine équipée", "Parking", "Garage", "TV", "Lave-linge"],
    category: "Villa",
    isFeatured: true,
    unavailableDates: [
      { start: "2026-03-15", end: "2026-03-22", status: "booked" },
      { start: "2026-04-10", end: "2026-04-17", status: "pending", paymentDeadline: "2026-02-22" },
      { start: "2026-05-01", end: "2026-05-05", status: "blocked" }
    ],
    cleaningFee: 80,
    serviceFee: 50,
    proprietaire_id: 'p1'
  },
  {
    id: "2",
    title: "Appartement Vue Mer Panoramique",
    slug: "appartement-vue-mer",
    location: "Plage El Mansoura",
    pricePerNight: 220,
    rating: 4.6,
    reviews: 18,
    guests: 4,
    bedrooms: 2,
    bathrooms: 1,
    images: [
      "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?q=80&w=1600&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?q=80&w=1600&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1493809842364-78817add7ffb?q=80&w=1600&auto=format&fit=crop"
    ],
    description: "Profitez d'une vue imprenable sur la mer Méditerranée depuis ce charmant appartement moderne. Situé en front de mer, vous aurez un accès direct à la plage.",
    amenities: ["Wifi", "Vue sur mer", "Climatisation", "Balcon", "Ascenseur"],
    category: "S+2",
    isFeatured: true,
    unavailableDates: [
      { start: "2026-03-01", end: "2026-03-08", status: "booked" },
      { start: "2026-04-20", end: "2026-04-27", status: "pending", paymentDeadline: "2026-02-25" }
    ],
    cleaningFee: 40,
    proprietaire_id: 'p2'
  },
  {
    id: "3",
    title: "Studio Cosy Centre Ville",
    slug: "studio-cosy",
    location: "Centre Ville",
    pricePerNight: 90,
    rating: 4.5,
    reviews: 12,
    guests: 2,
    bedrooms: 1,
    bathrooms: 1,
    images: [
      "https://images.unsplash.com/photo-1554995207-c18c203602cb?q=80&w=1600&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1505691938895-1758d7feb511?q=80&w=1600&auto=format&fit=crop"
    ],
    description: "Un petit studio parfaitement agencé pour un couple ou un voyageur solo. Proche de toutes les commodités et du fort de Kélibia.",
    amenities: ["Wifi", "Climatisation", "Kitchenette", "Proche commerces"],
    category: "Studio",
    isFeatured: false,
    unavailableDates: [
      { start: "2026-03-10", end: "2026-03-15", status: "blocked" },
      { start: "2026-03-25", end: "2026-03-30", status: "booked" }
    ],
    serviceFee: 20,
    proprietaire_id: 'p3'
  },
  {
    id: "4",
    title: "Villa Les Palmiers",
    slug: "villa-les-palmiers",
    location: "Petit Paris",
    pricePerNight: 350,
    rating: 4.9,
    reviews: 32,
    guests: 6,
    bedrooms: 3,
    bathrooms: 2,
    images: [
      "https://images.unsplash.com/photo-1564013799919-ab600027ffc6?q=80&w=1600&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1575517111478-7f60e01f51f6?q=80&w=1600&auto=format&fit=crop"
    ],
    description: "Villa spacieuse avec un grand jardin arboré. Parfait pour se détendre au calme tout en étant proche de la mer.",
    amenities: ["Wifi", "Jardin", "Barbecue", "Parking", "Climatisation", "Garage"],
    category: "Villa",
    isFeatured: true,
    unavailableDates: [
      { start: "2026-04-05", end: "2026-04-12", status: "pending", paymentDeadline: "2026-02-28" },
      { start: "2026-05-15", end: "2026-05-20", status: "booked" }
    ],
    proprietaire_id: 'p1'
  },
  {
    id: "5",
    title: "Maison de Vacances Familiale",
    slug: "maison-familiale",
    location: "Kélibia",
    pricePerNight: 180,
    rating: 4.3,
    reviews: 8,
    guests: 5,
    bedrooms: 2,
    bathrooms: 1,
    images: [
      "https://images.unsplash.com/photo-1570129477492-45c003edd2be?q=80&w=1600&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1484154218962-a1c00207099b?q=80&w=1600&auto=format&fit=crop"
    ],
    description: "Une maison simple et accueillante pour vos vacances en famille. Bon rapport qualité-prix.",
    amenities: ["Wifi", "TV", "Cuisine", "Terrasse"],
    category: "S+2",
    isFeatured: false,
    unavailableDates: [
      { start: "2026-03-18", end: "2026-03-25", status: "blocked" }
    ],
    proprietaire_id: 'p2'
  },
    {
    id: "6",
    title: "Résidence La Blanche",
    slug: "residence-la-blanche",
    location: "Front de mer",
    pricePerNight: 280,
    rating: 4.7,
    reviews: 15,
    guests: 4,
    bedrooms: 2,
    bathrooms: 2,
    images: [
      "https://images.unsplash.com/photo-1499793983690-e29da59ef1c2?q=80&w=1600&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1464146072230-91cabc968266?q=80&w=1600&auto=format&fit=crop"
    ],
    description: "Appartement haut standing dans une résidence sécurisée avec accès direct à la plage.",
    amenities: ["Wifi", "Sécurité 24/7", "Climatisation", "Vue mer", "Piscine", "Garage"],
    category: "S+2",
    isFeatured: true,
    unavailableDates: [
      { start: "2026-03-05", end: "2026-03-12", status: "booked" },
      { start: "2026-04-15", end: "2026-04-22", status: "pending", paymentDeadline: "2026-03-01" },
      { start: "2026-05-10", end: "2026-05-14", status: "blocked" }
    ],
    proprietaire_id: 'p3'
  }
];
