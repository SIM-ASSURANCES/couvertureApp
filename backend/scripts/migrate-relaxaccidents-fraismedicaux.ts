/**
 * Migration additive : recopie les données Accident historiques
 * (SouscriptionAccident, TarifAccident, colonne qrAccidentToken de
 * Partenaire/AgentDistribution) vers le modèle générique
 * Produit/TarifProduit/QrCode/Souscription, sous le nouveau produit
 * "relaxaccidents_fraismedicaux" (refonte Assurances Accidents/Dommages).
 *
 * Ne supprime ni ne modifie aucune table/colonne historique — SouscriptionAccident
 * reste consultable en lecture seule le temps de la transition.
 * Idempotent : peut être relancé sans dupliquer (upsert partout).
 *
 * Usage : npx tsx scripts/migrate-relaxaccidents-fraismedicaux.ts
 */
import "dotenv/config";
import { PrismaClient, Branche, TypePaiement, StatutSouscription } from "@prisma/client";

const prisma = new PrismaClient();

const PRODUIT_CODE = "relaxaccidents_fraismedicaux";

async function upsertProduitEtTarifs() {
  const produit = await prisma.produit.upsert({
    where: { code: PRODUIT_CODE },
    update: {
      libelle: "RelaxAccidents Frais Médicaux",
      branche: Branche.INCENDIE_ACCIDENT,
      sousBranche: "ASSURANCES_ACCIDENTS",
      typePaiement: TypePaiement.WAVE,
    },
    create: {
      code: PRODUIT_CODE,
      libelle: "RelaxAccidents Frais Médicaux",
      branche: Branche.INCENDIE_ACCIDENT,
      sousBranche: "ASSURANCES_ACCIDENTS",
      typePaiement: TypePaiement.WAVE,
      couleurQr: "#004b9c",
      ordre: 1,
    },
  });

  // Reprend les tarifs Accident existants tels quels (capitaux garantis
  // inchangés) — seule la commission est remise à 0 pour cette refonte,
  // réglable ensuite depuis l'admin (décision explicite de l'utilisateur).
  const tarifsAccident = await prisma.tarifAccident.findMany({ orderBy: { prime: "asc" } });
  for (const t of tarifsAccident) {
    await prisma.tarifProduit.upsert({
      where: { produitId_libelleVariante: { produitId: produit.id, libelleVariante: String(t.prime) } },
      update: {
        prime: t.prime,
        primeHT: t.primeHT,
        fg: t.fg,
        taxes: t.taxes,
        capitalGaranti: t.capitalGaranti,
      },
      create: {
        produitId: produit.id,
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
  console.log(`Produit "${PRODUIT_CODE}" prêt, ${tarifsAccident.length} tarif(s) migré(s) (commission=0).`);
  return produit.id;
}

/** Trouve/crée le QrCode générique correspondant à un token legacy (même valeur de token conservée). */
async function upsertQrCode(params: {
  produitId: string;
  partenaireId: string;
  agentDistributionId: string | null;
  token: string;
  actif: boolean;
}) {
  const existing = await prisma.qrCode.findUnique({ where: { token: params.token } });
  if (existing) {
    await prisma.qrCode.update({ where: { id: existing.id }, data: { actif: params.actif } });
    return;
  }
  await prisma.qrCode.create({
    data: {
      partenaireId: params.partenaireId,
      agentDistributionId: params.agentDistributionId,
      produitId: params.produitId,
      libelleVariante: null,
      token: params.token,
      actif: params.actif,
    },
  });
}

async function migrerQrPartenaires(produitId: string) {
  const partenaires = await prisma.partenaire.findMany({ where: { produitAccident: true } });
  let count = 0;
  for (const p of partenaires) {
    if (!p.qrAccidentToken) continue;
    await upsertQrCode({
      produitId,
      partenaireId: p.id,
      agentDistributionId: null,
      token: p.qrAccidentToken,
      actif: p.statut === "actif",
    });
    count++;
  }
  console.log(`QR partenaires migrés : ${count}`);
}

async function migrerQrAgents(produitId: string) {
  const agents = await prisma.agentDistribution.findMany({
    where: { qrAccidentToken: { not: null } },
    include: { partenaire: true },
  });
  let count = 0;
  for (const a of agents) {
    if (!a.qrAccidentToken) continue;
    await upsertQrCode({
      produitId,
      partenaireId: a.partenaireId,
      agentDistributionId: a.id,
      token: a.qrAccidentToken,
      actif: a.statut === "actif" && a.partenaire.statut === "actif",
    });
    count++;
  }
  console.log(`QR agents de distribution migrés : ${count}`);
}

const mapStatutDossierAccident: Record<string, StatutSouscription> = {
  paye_formulaire_attente: StatutSouscription.en_cours,
  complet: StatutSouscription.complet,
};

async function migrerSouscriptions(produitId: string) {
  const rows = await prisma.souscriptionAccident.findMany();
  for (const s of rows) {
    await prisma.souscription.upsert({
      where: { id: s.id },
      update: {},
      create: {
        id: s.id,
        produitId,
        partenaireId: s.partenaireId,
        agentDistributionId: s.agentDistributionId,
        telephone: s.telephone,
        nom: s.nom,
        prenom: s.prenom,
        dateNaissance: s.dateNaissance,
        pieceIdentiteUrl: s.pieceIdentiteUrl,
        montantPrime: s.montantPrime,
        capitalGaranti: s.capitalGaranti,
        commissionCalculee: s.commissionCalculee,
        waveNumero: s.waveNumero,
        waveTransactionId: s.waveTransactionId,
        waveStatut: s.waveStatut,
        numeroPolice: s.numeroPolice,
        dateDebut: s.dateDebut,
        dateFin: s.dateFin,
        statut: mapStatutDossierAccident[s.statutDossier] ?? StatutSouscription.en_cours,
        whatsappEnvoyeAt: s.whatsappEnvoyeAt,
        relanceCount: s.relanceCount,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
      },
    });

    // Photo selfie (déjà collectée pour la carte virtuelle) → Document, pour
    // rester cohérent avec le mécanisme générique déjà utilisé par Relax.
    if (s.selfieUrl) {
      const existant = await prisma.document.findFirst({ where: { souscriptionId: s.id, type: "Selfie" } });
      if (!existant) {
        await prisma.document.create({ data: { souscriptionId: s.id, type: "Selfie", url: s.selfieUrl } });
      }
    }
    if (s.pieceIdentiteUrl) {
      const existant = await prisma.document.findFirst({ where: { souscriptionId: s.id, type: "CNI" } });
      if (!existant) {
        await prisma.document.create({ data: { souscriptionId: s.id, type: "CNI", url: s.pieceIdentiteUrl } });
      }
    }
  }
  console.log(`Souscriptions Accident migrées : ${rows.length}`);
}

async function main() {
  const produitId = await upsertProduitEtTarifs();
  await migrerQrPartenaires(produitId);
  await migrerQrAgents(produitId);
  await migrerSouscriptions(produitId);

  const totalAvant = await prisma.souscriptionAccident.count();
  const totalApres = await prisma.souscription.count({ where: { produitId } });
  console.log(`Vérification : ${totalAvant} SouscriptionAccident vs ${totalApres} Souscription (nouveau produit).`);
  if (totalAvant !== totalApres) {
    console.warn("⚠️  Écart détecté entre l'ancien et le nouveau total — à investiguer avant bascule.");
  } else {
    console.log("Migration terminée ✓ — aucune perte de donnée détectée.");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
