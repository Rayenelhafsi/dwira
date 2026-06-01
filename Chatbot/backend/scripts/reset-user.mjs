import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const c = await prisma.client.findFirst({ where: { platform: 'website', platformUserId: 'agent_flow_2' } });
if (c) {
  const convs = await prisma.conversation.findMany({ where: { clientId: c.id }, select: { id: true } });
  const ids = convs.map(x => x.id);
  if (ids.length) await prisma.message.deleteMany({ where: { conversationId: { in: ids } } });
  await prisma.conversation.deleteMany({ where: { clientId: c.id } });
  await prisma.reservation.deleteMany({ where: { clientId: c.id } });
  await prisma.client.delete({ where: { id: c.id } });
}
await prisma.$disconnect();
