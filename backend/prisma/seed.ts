import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "crypto";

const prisma = new PrismaClient();

function qr(prefix: string) {
  return `${prefix}_${randomUUID().slice(0, 8)}`;
}

async function main() {
  await prisma.journalActivite.deleteMany();
  await prisma.souscriptionIncendie.deleteMany();
  await prisma.souscriptionAccident.deleteMany();
  await prisma.partenaire.deleteMany();
  await prisma.admin.deleteMany();
  await prisma.parametre.deleteMany();

  await prisma.parametre.create({
    data: {
      id: 1,
      tauxCommissionIncendie: 0.15,
      tauxCommissionAccident: 0.15,
      primeAccident: 1000,
      primeIncendie: 1000,
    },
  });

  // Tarifications Accident
  await prisma.tarifAccident.createMany({
    data: [
      {
        prime: 500,
        capitalGaranti: 100000,
        commission: 93.24,
      },
      {
        prime: 1000,
        capitalGaranti: 250000,
        commission: 186.48,
      },
    ],
  });

  // Tarifications Incendie
  await prisma.tarifIncendie.createMany({
    data: [
      {
        prime: 1000,
        capitalGaranti: 500000,
        commission: 177.78,
      },
      {
        prime: 2000,
        capitalGaranti: 1000000,
        commission: 355.56,
      },
    ],
  });

  await prisma.admin.create({
    data: {
      nom: "Gohore Arnaud",
      email: "admin@simassurances.ci",
      role: "SUPER_ADMIN",
      passwordHash: await bcrypt.hash("Admin@2026", 10),
    },
  });
  await prisma.admin.create({
    data: {
      nom: "Konaté Mariam",
      email: "mariam@simassurances.ci",
      role: "ADMIN",
      passwordHash: await bcrypt.hash("Admin@2026", 10),
    },
  });

  const p1 = await prisma.partenaire.create({
    data: {
      nomCommerce: "Électro Plus Adjamé",
      nomResponsable: "Konan Yao",
      telephone: "+225 07 01 02 03 04",
      localisation: "Adjamé, Abidjan",
      typeCommerce: "Electronique",
      produitIncendie: true,
      produitAccident: true,
      statut: "actif",
      qrIncendieToken: qr("inc"),
      qrAccidentToken: qr("acc"),
      email: "partenaire@simassurances.ci",
      passwordHash: await bcrypt.hash("Partenaire@2026", 10),
    },
  });

  const p2 = await prisma.partenaire.create({
    data: {
      nomCommerce: "Super Marché Cocody",
      nomResponsable: "Aïcha Traoré",
      telephone: "+225 05 11 22 33 44",
      localisation: "Cocody, Abidjan",
      typeCommerce: "Alimentation",
      produitIncendie: true,
      produitAccident: false,
      statut: "actif",
      qrIncendieToken: qr("inc"),
    },
  });

  const p3 = await prisma.partenaire.create({
    data: {
      nomCommerce: "Textile Yopougon",
      nomResponsable: "Bamba Issouf",
      telephone: "+225 01 88 77 66 55",
      localisation: "Yopougon, Abidjan",
      typeCommerce: "Textile",
      produitIncendie: false,
      produitAccident: true,
      statut: "actif",
      qrAccidentToken: qr("acc"),
    },
  });

  await prisma.partenaire.create({
    data: {
      nomCommerce: "Boutique Marcory",
      nomResponsable: "Diallo Fatou",
      telephone: "+225 07 44 55 66 77",
      localisation: "Marcory, Abidjan",
      typeCommerce: "Autre",
      produitIncendie: true,
      produitAccident: true,
      statut: "inactif",
      qrIncendieToken: qr("inc"),
      qrAccidentToken: qr("acc"),
    },
  });

  console.log("Seed terminé ✓");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
