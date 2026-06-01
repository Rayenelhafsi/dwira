import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.property.deleteMany({});
  await prisma.availability.deleteMany({});
  await prisma.propertyMedia.deleteMany({});
  await prisma.client.deleteMany({});
  await prisma.conversation.deleteMany({});
  await prisma.message.deleteMany({});
  await prisma.reservation.deleteMany({});

  const p1 = await prisma.property.create({
    data: {
      title: "Villa Azul Kelibia",
      type: "villa",
      location: "Kelibia",
      capacity: 8,
      bedrooms: 4,
      bathrooms: 2,
      nearBeach: true,
      pool: true,
      parking: true,
      description: "Family villa near beach",
      pricePerNight: 480,
      status: "active",
      media: { create: [{ imageUrl: "https://example.com/villa-azul-1.jpg" }] },
    },
  });

  const p2 = await prisma.property.create({
    data: {
      title: "Appartement Marina",
      type: "apartment",
      location: "Mansoura",
      capacity: 4,
      bedrooms: 2,
      bathrooms: 1,
      nearBeach: true,
      pool: false,
      parking: true,
      description: "Apartment close to Mansoura beach",
      pricePerNight: 220,
      status: "active",
      media: { create: [{ imageUrl: "https://example.com/marina-1.jpg" }] },
    },
  });

  await prisma.availability.create({
    data: {
      propertyId: p2.id,
      unavailableStart: new Date("2026-08-12"),
      unavailableEnd: new Date("2026-08-20"),
    },
  });

  console.log(JSON.stringify({ seeded: true, properties: [p1.id, p2.id] }));
}

main().finally(async () => prisma.$disconnect());
