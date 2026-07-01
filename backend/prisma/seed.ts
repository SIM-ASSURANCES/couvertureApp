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
      tauxCommissionIncendie: 0.20,
      tauxCommissionMensuelleIncendie: 0.10,
      tauxCommissionAccident: 0.15,
      primeAccident: 1000,
      primeHtIncendie1000: 800,
      primeHtIncendie2000: 1600,
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

  // Tarifications Incendie (référence historique)
  await prisma.tarifIncendie.createMany({
    data: [
      {
        prime: 1000,
        capitalGaranti: 250000,
        commission: 160,
      },
      {
        prime: 2000,
        capitalGaranti: 500000,
        commission: 320,
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

  await prisma.partenaire.create({
    data: {
      nomCommerce: "Électro Plus Adjamé",
      nomResponsable: "Konan Yao",
      telephone: "+225 07 01 02 03 04",
      localisation: "Adjamé, Abidjan",
      typeCommerce: "Electronique",
      produitIncendie: true,
      produitAccident: true,
      statut: "actif",
      qrIncendie1000Token: qr("i1k"),
      qrIncendie2000Token: qr("i2k"),
      qrAccidentToken: qr("acc"),
      email: "partenaire@simassurances.ci",
      passwordHash: await bcrypt.hash("Partenaire@2026", 10),
    },
  });

  await prisma.partenaire.create({
    data: {
      nomCommerce: "Vulcano Service Cocody",
      nomResponsable: "Aïcha Traoré",
      telephone: "+225 05 11 22 33 44",
      localisation: "Cocody, Abidjan",
      typeCommerce: "Vulcanisateur",
      produitIncendie: true,
      produitAccident: false,
      statut: "actif",
      qrIncendie1000Token: qr("i1k"),
      qrIncendie2000Token: qr("i2k"),
    },
  });

  await prisma.partenaire.create({
    data: {
      nomCommerce: "Garage Mécanique Yopougon",
      nomResponsable: "Bamba Issouf",
      telephone: "+225 01 88 77 66 55",
      localisation: "Yopougon, Abidjan",
      typeCommerce: "MecaniqueGarage",
      produitIncendie: false,
      produitAccident: true,
      statut: "actif",
      qrAccidentToken: qr("acc"),
    },
  });

  await prisma.partenaire.create({
    data: {
      nomCommerce: "Accessoire Auto Marcory",
      nomResponsable: "Diallo Fatou",
      telephone: "+225 07 44 55 66 77",
      localisation: "Marcory, Abidjan",
      typeCommerce: "AccessoireAuto",
      produitIncendie: true,
      produitAccident: true,
      statut: "inactif",
      qrIncendie1000Token: qr("i1k"),
      qrIncendie2000Token: qr("i2k"),
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
