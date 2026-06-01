import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const client = await prisma.client.findFirst({ where: { platform: 'website', platformUserId: 'agent_flow_3' } });
const reservation = client ? await prisma.reservation.findFirst({ where: { clientId: client.id }, orderBy: { id: 'desc' }, include: { property: true } }) : null;
console.log(JSON.stringify({
  client: client ? { fullName: client.fullName, phone: client.phone, language: client.language } : null,
  reservation: reservation ? { id: reservation.id, status: reservation.status, totalPrice: Number(reservation.totalPrice), property: reservation.property.title } : null,
}, null, 2));
await prisma.$disconnect();
