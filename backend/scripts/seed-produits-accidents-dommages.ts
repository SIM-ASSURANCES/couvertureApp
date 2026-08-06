/**
 * Seed additif et idempotent (upsert partout) des nouveaux produits de la
 * refonte Assurances Accidents/Dommages — Phase 2 (sélecteur de produit
 * après scan d'un QR "sous-branche") :
 * - RelaxVoyage (sous-branche ASSURANCES_ACCIDENTS) : 4 formules réellement
 *   tarifées.
 * - RelaxAccidents générique et SecurHome/SecurPro (Dommages) : lignes
 *   Produit présentationnelles, actif:false ("Bientôt disponible" dans le
 *   sélecteur), sans mécanisme de prime pour l'instant.
 * - Incendie : ligne Produit présentationnelle (sousBranche
 *   ASSURANCES_DOMMAGES) pour apparaître dans le sélecteur — le flux réel de
 *   souscription reste sur le modèle historique SouscriptionIncendie.
 * - RelaxMoto (déjà existant) : ajoute sousBranche=ASSURANCES_ACCIDENTS pour
 *   qu'il apparaisse dans le sélecteur Accidents, sans toucher à sa branche
 *   (RELAX, inchangée — relax.ts continue de fonctionner tel quel).
 *
 * Usage : npx tsx scripts/seed-produits-accidents-dommages.ts
 */
import "dotenv/config";
import { PrismaClient, Branche, TypePaiement } from "@prisma/client";

const prisma = new PrismaClient();

async function upsertPlaceholder(code: string, libelle: string, sousBranche: string) {
  await prisma.produit.upsert({
    where: { code },
    update: { libelle, sousBranche, actif: false },
    create: {
      code,
      libelle,
      branche: Branche.INCENDIE_ACCIDENT,
      sousBranche,
      typePaiement: TypePaiement.WAVE,
      actif: false,
    },
  });
  console.log(`Produit "${code}" (${libelle}) prêt — Bientôt disponible.`);
}

async function upsertRelaxVoyage() {
  const produit = await prisma.produit.upsert({
    where: { code: "relaxvoyage" },
    update: {
      libelle: "RelaxVoyage",
      branche: Branche.INCENDIE_ACCIDENT,
      sousBranche: "ASSURANCES_ACCIDENTS",
      typePaiement: TypePaiement.WAVE,
      actif: true,
    },
    create: {
      code: "relaxvoyage",
      libelle: "RelaxVoyage",
      branche: Branche.INCENDIE_ACCIDENT,
      sousBranche: "ASSURANCES_ACCIDENTS",
      typePaiement: TypePaiement.WAVE,
      couleurQr: "#004b9c",
      ordre: 2,
      actif: true,
    },
  });

  // Décès/IPT porté par capitalGaranti (seule valeur affichée sur le
  // contrat/la carte) ; Frais de Santé + Bagages en donneesSpecifiques.
  const formules: {
    prime: number;
    decesIpt: number;
    fraisSante: number;
    bagages: string;
  }[] = [
    { prime: 250, decesIpt: 100_000, fraisSante: 50_000, bagages: "Pas de garantie" },
    { prime: 400, decesIpt: 250_000, fraisSante: 100_000, bagages: "Pas de garantie" },
    { prime: 600, decesIpt: 500_000, fraisSante: 150_000, bagages: "Pas de garantie" },
    { prime: 1000, decesIpt: 1_000_000, fraisSante: 250_000, bagages: "2 500 FCFA / Kg" },
  ];

  for (const f of formules) {
    await prisma.tarifProduit.upsert({
      where: { produitId_libelleVariante: { produitId: produit.id, libelleVariante: String(f.prime) } },
      update: {
        prime: f.prime,
        capitalGaranti: f.decesIpt,
        donneesSpecifiques: { fraisSante: f.fraisSante, bagages: f.bagages },
      },
      create: {
        produitId: produit.id,
        libelleVariante: String(f.prime),
        prime: f.prime,
        capitalGaranti: f.decesIpt,
        commission: 0,
        donneesSpecifiques: { fraisSante: f.fraisSante, bagages: f.bagages },
      },
    });
  }
  console.log(`Produit "relaxvoyage" prêt, ${formules.length} formule(s).`);
}

async function upsertRelaxMotoSousBranche() {
  const existant = await prisma.produit.findUnique({ where: { code: "relaxmoto" } });
  if (!existant) {
    console.warn('⚠️  Produit "relaxmoto" introuvable — RelaxMoto ne pourra pas apparaître dans le sélecteur Accidents.');
    return;
  }
  await prisma.produit.update({
    where: { code: "relaxmoto" },
    data: { sousBranche: "ASSURANCES_ACCIDENTS" },
  });
  console.log('Produit "relaxmoto" rattaché à la sous-branche ASSURANCES_ACCIDENTS (branche RELAX inchangée).');
}

async function upsertIncendiePlaceholder() {
  // Ligne présentationnelle uniquement : le flux réel reste sur
  // SouscriptionIncendie (voir pont token dans public.ts /qr/:token).
  await prisma.produit.upsert({
    where: { code: "incendie" },
    update: { libelle: "Incendie", sousBranche: "ASSURANCES_DOMMAGES", actif: true },
    create: {
      code: "incendie",
      libelle: "Incendie",
      branche: Branche.INCENDIE_ACCIDENT,
      sousBranche: "ASSURANCES_DOMMAGES",
      typePaiement: TypePaiement.FACTURE,
      actif: true,
    },
  });
  console.log('Produit "incendie" (présentationnel) prêt — pont vers SouscriptionIncendie.');
}

async function main() {
  await upsertRelaxVoyage();
  await upsertRelaxMotoSousBranche();
  await upsertIncendiePlaceholder();
  await upsertPlaceholder("relaxaccidents", "RelaxAccidents", "ASSURANCES_ACCIDENTS");
  await upsertPlaceholder("securhome_dommages", "SecurHome", "ASSURANCES_DOMMAGES");
  await upsertPlaceholder("securpro_dommages", "SecurPro", "ASSURANCES_DOMMAGES");
  console.log("Seed produits Accidents/Dommages terminé ✓");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
