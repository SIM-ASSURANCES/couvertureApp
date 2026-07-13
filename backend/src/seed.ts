import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function seedSuperAdmin() {
  const email = process.env.SUPER_ADMIN_EMAIL;
  const password = process.env.SUPER_ADMIN_PASSWORD;
  const nom = process.env.SUPER_ADMIN_NOM ?? "Super Admin";

  if (!email || !password) {
    console.log("[seed] SUPER_ADMIN_EMAIL / SUPER_ADMIN_PASSWORD non définis — création du super admin ignorée.");
    return;
  }

  const existing = await prisma.admin.findUnique({ where: { email } });
  if (existing) {
    console.log(`[seed] Super admin ${email} existe déjà.`);
    return;
  }

  await prisma.admin.create({
    data: {
      nom,
      email,
      passwordHash: await bcrypt.hash(password, 10),
      role: "SUPER_ADMIN",
    },
  });

  console.log(`[seed] Super admin ${email} créé avec succès.`);
}

/**
 * Correction ponctuelle : le capital garanti Incendie était deux fois trop
 * faible (250 000/500 000 FCFA au lieu de 500 000/1 000 000 FCFA). Ne
 * corrige que les lignes encore sur l'ancienne valeur, pour ne jamais
 * écraser un ajustement manuel fait depuis via la page Paramètres.
 */
async function corrigerCapitalGarantiIncendie() {
  const corrections = [
    { prime: 1000, ancien: 250000, correct: 500000 },
    { prime: 2000, ancien: 500000, correct: 1000000 },
  ];

  for (const c of corrections) {
    const tarif = await prisma.tarifIncendie.findUnique({ where: { prime: c.prime } });
    if (tarif && tarif.capitalGaranti === c.ancien) {
      await prisma.tarifIncendie.update({
        where: { prime: c.prime },
        data: { capitalGaranti: c.correct },
      });
      console.log(`[seed] TarifIncendie prime=${c.prime} : capitalGaranti corrigé ${c.ancien} -> ${c.correct}.`);
    }

    const backfill = await prisma.souscriptionIncendie.updateMany({
      where: { montantPrime: c.prime, capitalGaranti: c.ancien },
      data: { capitalGaranti: c.correct },
    });
    if (backfill.count > 0) {
      console.log(
        `[seed] SouscriptionIncendie prime=${c.prime} : ${backfill.count} contrat(s) corrigé(s) (capitalGaranti).`
      );
    }
  }
}

/**
 * Barèmes SECURPRO / SECURSTOCK (4 classes de risque chacun) et catalogue à
 * prix fixe COUPS DURS / SECURECOLTE, d'après le dossier TARIFS. Idempotent :
 * n'insère que ce qui manque, ne touche jamais aux valeurs déjà éditées via
 * les pages d'administration (upsert sur la clé métier, sans écraser à
 * chaque redémarrage un ajustement fait depuis).
 */
async function seedTarificationImf() {
  const securpro = [
    { classe: 1, limiteCapital: 50_000_000, tauxIncendie: 0.00072 },
    { classe: 2, limiteCapital: 40_000_000, tauxIncendie: 0.000864 },
    { classe: 3, limiteCapital: 30_000_000, tauxIncendie: 0.0010368 },
    { classe: 4, limiteCapital: 20_000_000, tauxIncendie: 0.00124416 },
  ];
  for (const b of securpro) {
    await prisma.baremeSecurpro.upsert({
      where: { classe: b.classe },
      update: {},
      create: b,
    });
  }

  const securstock = [
    { classe: 1, limiteCapital: 20_000_000, tauxDommageElectrique: 0.0014, tauxAutreCause: 0.001 },
    { classe: 2, limiteCapital: 15_000_000, tauxDommageElectrique: 0.0019, tauxAutreCause: 0.001 },
    { classe: 3, limiteCapital: 10_000_000, tauxDommageElectrique: 0.0024, tauxAutreCause: 0.0013 },
    { classe: 4, limiteCapital: 5_000_000, tauxDommageElectrique: 0.0034, tauxAutreCause: 0.0017 },
  ];
  for (const b of securstock) {
    await prisma.baremeSecurstock.upsert({
      where: { classe: b.classe },
      update: {},
      create: b,
    });
  }

  const paliersSecurecolte = [
    { seuil: "forte", pourcentageIndice: 0.75, montantIndemnite: 100_000 },
    { seuil: "moyenne", pourcentageIndice: 0.85, montantIndemnite: 50_000 },
    { seuil: "faible", pourcentageIndice: 0.95, montantIndemnite: 10_000 },
  ];
  for (const p of paliersSecurecolte) {
    const existant = await prisma.palierSecurecolte.findFirst({ where: { seuil: p.seuil } });
    if (!existant) await prisma.palierSecurecolte.create({ data: p });
  }

  // Catalogue à prix fixe : COUPS DURS (2 produits distincts, chacun avec ses
  // variantes) et SECURECOLTE (1 pack). Ces produits ne dépendent d'aucune
  // formule — de simples lignes TarifProduit, comme pour Relax.
  const produits: {
    code: string;
    libelle: string;
    tarifs: { libelleVariante: string; prime: number; primeHT?: number; fg?: number; taxes?: number; capitalGaranti: number; commission: number }[];
  }[] = [
    {
      code: "coupsdurs_classique",
      libelle: "Coups Durs — Classique",
      tarifs: [
        { libelleVariante: "maladie", prime: 14000, capitalGaranti: 500_000, commission: 0 },
        { libelleVariante: "deces", prime: 4000, capitalGaranti: 500_000, commission: 0 },
      ],
    },
    {
      code: "coupsdurs_incapacite",
      libelle: "Coups Durs — Incapacité temporaire de l'emprunteur",
      tarifs: [
        { libelleVariante: "plafond_500000", prime: 4000, primeHT: 3229, fg: 1500, taxes: 271, capitalGaranti: 500_000, commission: 0 },
        { libelleVariante: "plafond_1000000", prime: 6000, primeHT: 5094, fg: 1500, taxes: 406, capitalGaranti: 1_000_000, commission: 0 },
      ],
    },
    {
      code: "securecolte",
      libelle: "SECURECOLTE",
      tarifs: [
        { libelleVariante: "pack", prime: 31300, capitalGaranti: 250_000, commission: 0 },
      ],
    },
  ];

  for (const p of produits) {
    const produit = await prisma.produit.upsert({
      where: { code: p.code },
      update: {},
      create: { code: p.code, libelle: p.libelle, branche: "IMF", typePaiement: "FACTURE" },
    });
    for (const t of p.tarifs) {
      await prisma.tarifProduit.upsert({
        where: { produitId_prime: { produitId: produit.id, prime: t.prime } },
        update: {},
        create: { produitId: produit.id, ...t },
      });
    }
  }
}

async function main() {
  await seedSuperAdmin();
  await corrigerCapitalGarantiIncendie();
  await seedTarificationImf();
}

main()
  .catch((e) => { console.error("[seed] Erreur :", e); process.exit(1); })
  .finally(() => prisma.$disconnect());
