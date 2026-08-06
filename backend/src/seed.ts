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
 * Correction ponctuelle : les taux de commission du catalogue IMF (COUPS
 * DURS, SECURECOLTE) étaient à 0 (valeur de départ à la création des
 * tarifs). Ne corrige que les lignes encore à 0, pour ne jamais écraser un
 * ajustement manuel fait depuis. SECURPRO/SECURSTOCK n'ont pas besoin de
 * cette correction : leur tauxCommission (20%) est le défaut de colonne,
 * déjà appliqué par Postgres à la création de la colonne.
 */
async function corrigerCommissionsImf() {
  const corrections = [
    { produitCode: "coupsdurs_classique", libelleVariante: "maladie", taux: 0.1 },
    { produitCode: "coupsdurs_classique", libelleVariante: "deces", taux: 0.1 },
    { produitCode: "coupsdurs_incapacite", libelleVariante: "plafond_500000", taux: 0.1 },
    { produitCode: "coupsdurs_incapacite", libelleVariante: "plafond_1000000", taux: 0.1 },
    { produitCode: "securecolte", libelleVariante: "pack", taux: 0.22 },
  ];
  for (const c of corrections) {
    const produit = await prisma.produit.findUnique({ where: { code: c.produitCode } });
    if (!produit) continue;
    const tarif = await prisma.tarifProduit.findFirst({
      where: { produitId: produit.id, libelleVariante: c.libelleVariante },
    });
    if (tarif && tarif.commission === 0) {
      await prisma.tarifProduit.update({ where: { id: tarif.id }, data: { commission: c.taux } });
      console.log(`[seed] TarifProduit ${c.produitCode}/${c.libelleVariante} : commission corrigée 0 -> ${c.taux}.`);
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

  // Catalogue à prix fixe : COUPS DURS (produit unique fusionné, garanties
  // combinables — voir calculerDevisImf) et SECURECOLTE (1 pack). Ces
  // produits ne dépendent d'aucune formule — de simples lignes TarifProduit,
  // comme pour Relax.
  //
  // NB : "coupsdurs_classique"/"coupsdurs_incapacite" (ci-dessous) sont les
  // anciens produits, avant la fusion en un seul écran de souscription —
  // conservés uniquement pour l'historique des polices déjà émises (sinistres,
  // bordereaux, contrats), plus jamais proposés à la souscription.
  const produits: {
    code: string;
    libelle: string;
    tarifs: { libelleVariante: string; prime: number; primeHT?: number; fg?: number; taxes?: number; capitalGaranti: number; commission: number }[];
  }[] = [
    {
      code: "coupsdurs",
      libelle: "Coups Durs",
      tarifs: [
        { libelleVariante: "maladie", prime: 14000, capitalGaranti: 500_000, commission: 0.1 },
        { libelleVariante: "deces", prime: 4000, capitalGaranti: 500_000, commission: 0.1 },
        { libelleVariante: "plafond_500000", prime: 4000, primeHT: 3229, fg: 1500, taxes: 271, capitalGaranti: 500_000, commission: 0.1 },
        { libelleVariante: "plafond_1000000", prime: 6000, primeHT: 5094, fg: 1500, taxes: 406, capitalGaranti: 1_000_000, commission: 0.1 },
      ],
    },
    {
      code: "coupsdurs_classique",
      libelle: "Coups Durs — Classique (ancien)",
      tarifs: [
        { libelleVariante: "maladie", prime: 14000, capitalGaranti: 500_000, commission: 0 },
        { libelleVariante: "deces", prime: 4000, capitalGaranti: 500_000, commission: 0 },
      ],
    },
    {
      code: "coupsdurs_incapacite",
      libelle: "Coups Durs — Incapacité temporaire de l'emprunteur (ancien)",
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
        where: { produitId_libelleVariante: { produitId: produit.id, libelleVariante: t.libelleVariante } },
        update: {},
        create: { produitId: produit.id, ...t },
      });
    }
  }
}

/**
 * Tarifs RelaxMoto/RelaxAuto : deux formules par produit, chacune avec son
 * propre montant PAR échéance (voir echeancier.ts — le mensuel n'est jamais
 * la prime annuelle divisée). Valeurs de départ à ajuster depuis l'admin ;
 * idempotent (upsert), ne touche jamais un montant déjà édité en prod.
 */
async function seedTarificationRelax() {
  const produits: {
    code: string;
    libelle: string;
    capitalGaranti: number;
    tarifs: { libelleVariante: string; prime: number; commission: number }[];
  }[] = [
    {
      code: "relaxmoto",
      libelle: "RelaxMoto",
      capitalGaranti: 500_000,
      tarifs: [
        { libelleVariante: "annuel", prime: 25_000, commission: 0.1 },
        { libelleVariante: "mensuel", prime: 2_500, commission: 0.1 },
      ],
    },
    {
      code: "relaxauto",
      libelle: "RelaxAuto",
      capitalGaranti: 1_000_000,
      tarifs: [
        { libelleVariante: "annuel", prime: 25_000, commission: 0.1 },
        { libelleVariante: "mensuel", prime: 2_500, commission: 0.1 },
      ],
    },
  ];

  for (const p of produits) {
    const produit = await prisma.produit.upsert({
      where: { code: p.code },
      update: {},
      create: { code: p.code, libelle: p.libelle, branche: "RELAX", typePaiement: "WAVE" },
    });
    for (const t of p.tarifs) {
      await prisma.tarifProduit.upsert({
        where: { produitId_libelleVariante: { produitId: produit.id, libelleVariante: t.libelleVariante } },
        update: {},
        create: { produitId: produit.id, capitalGaranti: p.capitalGaranti, ...t },
      });
    }
  }
}

/**
 * Catalogue de la refonte Assurances Accidents/Dommages (sélecteur de
 * produit après scan d'un QR "sous-branche") : produits réellement tarifés
 * (RelaxAccidents Frais Médicaux, RelaxVoyage), rattachement de RelaxMoto à
 * la sous-branche Accidents, et lignes présentationnelles pour les produits
 * "Bientôt disponible" (Incendie — ponté vers le modèle historique —,
 * RelaxAccidents générique, SecurHome, SecurPro). Idempotent (upsert) :
 * tourne à chaque démarrage du conteneur, pas besoin de script manuel.
 */
async function seedCatalogueAssurancesAccidentsDommages() {
  // RelaxAccidents Frais Médicaux (remplace l'ancien produit Accident) —
  // capitaux garantis repris des lignes TarifAccident historiques si
  // présentes, pour ne jamais inventer une valeur.
  const raf = await prisma.produit.upsert({
    where: { code: "relaxaccidents_fraismedicaux" },
    update: {},
    create: {
      code: "relaxaccidents_fraismedicaux",
      libelle: "RelaxAccidents Frais Médicaux",
      branche: "INCENDIE_ACCIDENT",
      sousBranche: "ASSURANCES_ACCIDENTS",
      typePaiement: "WAVE",
      couleurQr: "#004b9c",
      ordre: 1,
    },
  });
  const tarifsAccidentHistoriques = await prisma.tarifAccident.findMany();
  for (const t of tarifsAccidentHistoriques) {
    await prisma.tarifProduit.upsert({
      where: { produitId_libelleVariante: { produitId: raf.id, libelleVariante: String(t.prime) } },
      update: {},
      create: {
        produitId: raf.id,
        libelleVariante: String(t.prime),
        prime: t.prime,
        primeHT: t.primeHT,
        fg: t.fg,
        taxes: t.taxes,
        capitalGaranti: t.capitalGaranti,
        commission: 0,
      },
    });
  }
  // Filet de sécurité si aucune ligne TarifAccident n'existe (base neuve) :
  // valeurs connues du catalogue (1000/500 FCFA).
  if (tarifsAccidentHistoriques.length === 0) {
    const filet = [
      { prime: 1000, capitalGaranti: 500_000 },
      { prime: 500, capitalGaranti: 250_000 },
    ];
    for (const f of filet) {
      await prisma.tarifProduit.upsert({
        where: { produitId_libelleVariante: { produitId: raf.id, libelleVariante: String(f.prime) } },
        update: {},
        create: { produitId: raf.id, libelleVariante: String(f.prime), prime: f.prime, capitalGaranti: f.capitalGaranti, commission: 0 },
      });
    }
  }

  // RelaxVoyage — 4 formules (Décès/IPT en capitalGaranti, Frais de Santé +
  // Bagages en donneesSpecifiques).
  const voyage = await prisma.produit.upsert({
    where: { code: "relaxvoyage" },
    update: {},
    create: {
      code: "relaxvoyage",
      libelle: "RelaxVoyage",
      branche: "INCENDIE_ACCIDENT",
      sousBranche: "ASSURANCES_ACCIDENTS",
      typePaiement: "WAVE",
      couleurQr: "#004b9c",
      ordre: 2,
    },
  });
  const formulesVoyage = [
    { prime: 250, decesIpt: 100_000, fraisSante: 50_000, bagages: "Pas de garantie" },
    { prime: 400, decesIpt: 250_000, fraisSante: 100_000, bagages: "Pas de garantie" },
    { prime: 600, decesIpt: 500_000, fraisSante: 150_000, bagages: "Pas de garantie" },
    { prime: 1000, decesIpt: 1_000_000, fraisSante: 250_000, bagages: "2 500 FCFA / Kg" },
  ];
  for (const f of formulesVoyage) {
    await prisma.tarifProduit.upsert({
      where: { produitId_libelleVariante: { produitId: voyage.id, libelleVariante: String(f.prime) } },
      update: {},
      create: {
        produitId: voyage.id,
        libelleVariante: String(f.prime),
        prime: f.prime,
        capitalGaranti: f.decesIpt,
        commission: 0,
        donneesSpecifiques: { fraisSante: f.fraisSante, bagages: f.bagages },
      },
    });
  }

  // RelaxMoto rejoint le sélecteur Accidents (branche RELAX inchangée).
  await prisma.produit.update({ where: { code: "relaxmoto" }, data: { sousBranche: "ASSURANCES_ACCIDENTS" } });

  // Incendie : ligne présentationnelle uniquement (flux réel = SouscriptionIncendie).
  await prisma.produit.upsert({
    where: { code: "incendie" },
    update: {},
    create: { code: "incendie", libelle: "Incendie", branche: "INCENDIE_ACCIDENT", sousBranche: "ASSURANCES_DOMMAGES", typePaiement: "FACTURE" },
  });

  // Produits "Bientôt disponible" (pas de mécanisme de prime fourni).
  const placeholders = [
    { code: "relaxaccidents", libelle: "RelaxAccidents", sousBranche: "ASSURANCES_ACCIDENTS" },
    { code: "securhome_dommages", libelle: "SecurHome", sousBranche: "ASSURANCES_DOMMAGES" },
    { code: "securpro_dommages", libelle: "SecurPro", sousBranche: "ASSURANCES_DOMMAGES" },
  ];
  for (const p of placeholders) {
    await prisma.produit.upsert({
      where: { code: p.code },
      update: {},
      create: { code: p.code, libelle: p.libelle, branche: "INCENDIE_ACCIDENT", sousBranche: p.sousBranche, typePaiement: "WAVE", actif: false },
    });
  }

  console.log("[seed] Catalogue Assurances Accidents/Dommages synchronisé.");
}

async function main() {
  await seedSuperAdmin();
  await seedTarificationRelax();
  await seedCatalogueAssurancesAccidentsDommages();
  await corrigerCapitalGarantiIncendie();
  await seedTarificationImf();
  await corrigerCommissionsImf();
}

main()
  .catch((e) => { console.error("[seed] Erreur :", e); process.exit(1); })
  .finally(() => prisma.$disconnect());
