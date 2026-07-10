import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const p = await prisma.produit.findUnique({ where: { code: "relaxmoto" } });
if (!p) throw new Error("produit introuvable");
await prisma.tarifProduit.upsert({
  where: { produitId_prime: { produitId: p.id, prime: 1500 } },
  update: {},
  create: { produitId: p.id, prime: 1500, capitalGaranti: 300000, commission: 225 },
});
console.log("tarif test créé");
await prisma.$disconnect();
