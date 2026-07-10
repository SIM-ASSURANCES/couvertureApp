/**
 * Migration additive : recopie les données Incendie/Accident historiques
 * (SouscriptionIncendie, SouscriptionAccident, TarifIncendie, TarifAccident,
 * colonnes QR de Partenaire) vers le modèle générique Produit/QrCode/Souscription.
 *
 * Idempotent : peut être relancé sans dupliquer (upsert partout).
 * Ne supprime ni ne modifie aucune table/colonne historique.
 *
 * Usage : npx tsx scripts/migrate-produits.ts
 */
import "dotenv/config";
import { PrismaClient, Branche, TypePaiement, StatutSouscription } from "@prisma/client";

const prisma = new PrismaClient();

async function upsertProduits() {
  const produits = [
    { code: "incendie", libelle: "Incendie", branche: Branche.INCENDIE_ACCIDENT, typePaiement: TypePaiement.FACTURE, couleurQr: "#b45309", ordre: 1 },
    { code: "accident", libelle: "Accident", branche: Branche.INCENDIE_ACCIDENT, typePaiement: TypePaiement.WAVE, couleurQr: "#004b9c", ordre: 2 },
    { code: "relaxmoto", libelle: "RelaxMoto", branche: Branche.RELAX, typePaiement: TypePaiement.WAVE, couleurQr: "#16215E", ordre: 3 },
    { code: "relaxauto", libelle: "RelaxAuto", branche: Branche.RELAX, typePaiement: TypePaiement.WAVE, couleurQr: "#51AEE2", ordre: 4 },
  ] as const;

  const byCode: Record<string, string> = {};
  for (const p of produits) {
    const created = await prisma.produit.upsert({
      where: { code: p.code },
      update: { libelle: p.libelle, branche: p.branche, typePaiement: p.typePaiement, couleurQr: p.couleurQr, ordre: p.ordre },
      create: p,
    });
    byCode[p.code] = created.id;
  }
  return byCode;
}

async function migrerTarifs(produitIdIncendie: string, produitIdAccident: string) {
  const incendieVariante = (prime: number) => (prime === 1000 ? "1000" : prime === 2000 ? "2000" : String(prime));

  const tarifsIncendie = await prisma.tarifIncendie.findMany();
  for (const t of tarifsIncendie) {
    await prisma.tarifProduit.upsert({
      where: { produitId_prime: { produitId: produitIdIncendie, prime: t.prime } },
      update: { primeHT: t.primeHT, fg: t.fg, taxes: t.taxes, capitalGaranti: t.capitalGaranti, commission: t.commission, libelleVariante: incendieVariante(t.prime) },
      create: {
        produitId: produitIdIncendie,
        prime: t.prime,
        primeHT: t.primeHT,
        fg: t.fg,
        taxes: t.taxes,
        capitalGaranti: t.capitalGaranti,
        commission: t.commission,
        libelleVariante: incendieVariante(t.prime),
      },
    });
  }

  const tarifsAccident = await prisma.tarifAccident.findMany();
  for (const t of tarifsAccident) {
    await prisma.tarifProduit.upsert({
      where: { produitId_prime: { produitId: produitIdAccident, prime: t.prime } },
      update: { primeHT: t.primeHT, fg: t.fg, taxes: t.taxes, capitalGaranti: t.capitalGaranti, commission: t.commission },
      create: {
        produitId: produitIdAccident,
        prime: t.prime,
        primeHT: t.primeHT,
        fg: t.fg,
        taxes: t.taxes,
        capitalGaranti: t.capitalGaranti,
        commission: t.commission,
      },
    });
  }

  console.log(`Tarifs migrés : ${tarifsIncendie.length} incendie, ${tarifsAccident.length} accident`);
}

async function migrerPartenaires(produitIdIncendie: string, produitIdAccident: string) {
  const partenaires = await prisma.partenaire.findMany();
  let qrCount = 0;

  for (const p of partenaires) {
    // Tous les partenaires existants appartiennent à la branche historique.
    await prisma.partenaire.update({
      where: { id: p.id },
      data: { branche: Branche.INCENDIE_ACCIDENT },
    });

    const qrs: { produitId: string; libelleVariante: string | null; token: string }[] = [];
    if (p.qrIncendie1000Token) qrs.push({ produitId: produitIdIncendie, libelleVariante: "1000", token: p.qrIncendie1000Token });
    if (p.qrIncendie2000Token) qrs.push({ produitId: produitIdIncendie, libelleVariante: "2000", token: p.qrIncendie2000Token });
    if (p.qrAccidentToken) qrs.push({ produitId: produitIdAccident, libelleVariante: null, token: p.qrAccidentToken });

    for (const qr of qrs) {
      // Prisma n'accepte pas `null` dans une clé composée pour upsert/findUnique :
      // on résout donc manuellement via findFirst avant de créer/mettre à jour.
      const existing = await prisma.qrCode.findFirst({
        where: { partenaireId: p.id, produitId: qr.produitId, libelleVariante: qr.libelleVariante },
      });
      await prisma.qrCode.upsert({
        where: { id: existing?.id ?? "__inexistant__" },
        update: { token: qr.token, actif: p.statut === "actif" },
        create: {
          partenaireId: p.id,
          produitId: qr.produitId,
          libelleVariante: qr.libelleVariante,
          token: qr.token,
          actif: p.statut === "actif",
        },
      });
      qrCount++;
    }
  }

  console.log(`Partenaires mis à jour : ${partenaires.length} (branche renseignée), ${qrCount} QR codes migrés`);
}

const mapStatutIncendie: Record<string, StatutSouscription> = {
  en_cours: StatutSouscription.en_cours,
  complet: StatutSouscription.complet,
  expire: StatutSouscription.expire,
};

const mapStatutDossierAccident: Record<string, StatutSouscription> = {
  paye_formulaire_attente: StatutSouscription.en_cours,
  complet: StatutSouscription.complet,
};

async function migrerSouscriptionsIncendie(produitId: string) {
  const rows = await prisma.souscriptionIncendie.findMany();
  for (const s of rows) {
    await prisma.souscription.upsert({
      where: { id: s.id },
      update: {},
      create: {
        id: s.id,
        produitId,
        partenaireId: s.partenaireId,
        telephone: s.telephone,
        nom: s.nom,
        prenom: s.prenom,
        email: s.email,
        refFacture: s.refFacture,
        commune: s.commune,
        quartier: s.quartier,
        numeroMaison: s.numeroMaison,
        pieceIdentiteUrl: s.pieceIdentiteUrl,
        montantPrime: s.montantPrime,
        capitalGaranti: s.capitalGaranti,
        commissionCalculee: s.commissionCalculee,
        statut: mapStatutIncendie[s.statut] ?? StatutSouscription.en_cours,
        lienFormulaireToken: s.lienFormulaireToken,
        whatsappEnvoyeAt: s.whatsappEnvoyeAt,
        relanceCount: s.relanceCount,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
      },
    });
  }
  console.log(`Souscriptions Incendie migrées : ${rows.length}`);
}

async function migrerSouscriptionsAccident(produitId: string) {
  const rows = await prisma.souscriptionAccident.findMany();
  for (const s of rows) {
    await prisma.souscription.upsert({
      where: { id: s.id },
      update: {},
      create: {
        id: s.id,
        produitId,
        partenaireId: s.partenaireId,
        telephone: s.telephone,
        nom: s.nom,
        prenom: s.prenom,
        dateNaissance: s.dateNaissance,
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
        formulaireComplement: s.formulaireComplement ?? undefined,
        whatsappEnvoyeAt: s.whatsappEnvoyeAt,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
      },
    });
  }
  console.log(`Souscriptions Accident migrées : ${rows.length}`);
}

async function main() {
  const byCode = await upsertProduits();
  console.log("Produits créés/à jour :", byCode);

  await migrerTarifs(byCode.incendie, byCode.accident);
  await migrerPartenaires(byCode.incendie, byCode.accident);
  await migrerSouscriptionsIncendie(byCode.incendie);
  await migrerSouscriptionsAccident(byCode.accident);

  console.log("Migration terminée ✓");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
