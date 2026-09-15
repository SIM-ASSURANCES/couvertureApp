/**
 * Correction ponctuelle : RelaxVoyage ne couvre que le trajet déclaré (24h),
 * jamais 3 mois — voir services/paiementWave.ts::confirmerEcheance, corrigé
 * par le commit 0f81b21 (2026-08-27). Les souscriptions RelaxVoyage confirmées
 * AVANT ce correctif ont conservé une échéance à 3 mois en base, jamais
 * recalculée automatiquement.
 *
 * Ce script recherche les souscriptions RelaxVoyage confirmées dont l'écart
 * dateFin - dateDebut n'est pas ~24h, et les corrige à dateDebut + 24h.
 *
 * Par défaut : DRY-RUN (affiche ce qui serait corrigé, n'écrit rien).
 * Pour appliquer réellement : npx tsx scripts/fix-relaxvoyage-echeance-24h.ts --apply
 *
 * Idempotent : peut être relancé sans risque (les lignes déjà à 24h sont ignorées).
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const APPLIQUER = process.argv.includes("--apply");
const DUREE_ATTENDUE_H = 24;
const TOLERANCE_H = 1; // marge pour l'arrondi éventuel des dates stockées

async function main() {
  const produit = await prisma.produit.findUnique({ where: { code: "relaxvoyage" } });
  if (!produit) {
    console.error('Produit "relaxvoyage" introuvable — rien à corriger.');
    return;
  }

  const rows = await prisma.souscription.findMany({
    where: {
      produitId: produit.id,
      waveStatut: "confirme",
      dateDebut: { not: null },
      dateFin: { not: null },
    },
    select: { id: true, numeroPolice: true, telephone: true, nom: true, prenom: true, dateDebut: true, dateFin: true },
  });

  const aCorreriger = rows.filter((s) => {
    const ecartH = (s.dateFin!.getTime() - s.dateDebut!.getTime()) / (1000 * 60 * 60);
    return Math.abs(ecartH - DUREE_ATTENDUE_H) > TOLERANCE_H;
  });

  console.log(`${rows.length} souscription(s) RelaxVoyage confirmée(s) au total.`);
  console.log(`${aCorreriger.length} à corriger (échéance ≠ ~24h après la date d'effet) :\n`);

  for (const s of aCorreriger) {
    const ecartH = Math.round((s.dateFin!.getTime() - s.dateDebut!.getTime()) / (1000 * 60 * 60));
    const nouvelleDateFin = new Date(s.dateDebut!);
    nouvelleDateFin.setHours(nouvelleDateFin.getHours() + DUREE_ATTENDUE_H);

    console.log(
      `- ${s.numeroPolice ?? s.id} (${s.prenom ?? ""} ${s.nom ?? ""}, ${s.telephone}) : ` +
        `échéance actuelle ${s.dateFin!.toISOString()} (~${ecartH}h) → ${nouvelleDateFin.toISOString()} (24h)`
    );

    if (APPLIQUER) {
      await prisma.souscription.update({
        where: { id: s.id },
        data: { dateFin: nouvelleDateFin },
      });
    }
  }

  if (!APPLIQUER) {
    console.log(
      aCorreriger.length > 0
        ? "\nAucune écriture effectuée (dry-run). Relancer avec --apply pour corriger réellement."
        : "\nRien à corriger."
    );
  } else {
    console.log(`\n${aCorreriger.length} souscription(s) corrigée(s) ✓`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
