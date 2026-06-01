import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
await prisma.message.deleteMany({});
await prisma.conversation.deleteMany({});
await prisma.reservation.deleteMany({});
await prisma.client.deleteMany({});
await prisma.propertyMedia.deleteMany({});
await prisma.availability.deleteMany({});
await prisma.property.deleteMany({});

const villa = await prisma.property.create({ data: {
  title: "Villa Azul Kelibia S+4",
  type: "villa",
  location: "Kelibia",
  capacity: 8,
  bedrooms: 4,
  bathrooms: 2,
  nearBeach: true,
  pool: true,
  parking: true,
  description: "Pied dans l'eau, vue sur mer, family friendly",
  pricePerNight: 480,
  status: "active",
}});
await prisma.propertyMedia.create({ data: { propertyId: villa.id, imageUrl: "https://example.com/villa-azul-1.jpg" } });

const apt = await prisma.property.create({ data: {
  title: "Appartement Marina S+2",
  type: "appartement",
  location: "Mansoura",
  capacity: 4,
  bedrooms: 2,
  bathrooms: 1,
  nearBeach: true,
  pool: false,
  parking: true,
  description: "Proche plage",
  pricePerNight: 220,
  status: "active",
}});
await prisma.propertyMedia.create({ data: { propertyId: apt.id, imageUrl: "https://example.com/marina-1.jpg" } });
await prisma.availability.create({ data: { propertyId: apt.id, unavailableStart: new Date('2026-08-12'), unavailableEnd: new Date('2026-08-20') } });

console.log(JSON.stringify({ villaId: villa.id, aptId: apt.id }));
await prisma.$disconnect();
