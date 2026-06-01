import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const props = await prisma.property.findMany({ include: { availability: true, media: true } });
console.log(JSON.stringify(props.map(p=>({id:p.id,title:p.title,location:p.location,capacity:p.capacity,price:Number(p.pricePerNight),status:p.status,nearBeach:p.nearBeach,pool:p.pool,parking:p.parking,availability:p.availability})), null, 2));
await prisma.$disconnect();
