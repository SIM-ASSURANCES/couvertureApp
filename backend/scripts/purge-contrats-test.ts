/**
 * Supprime définitivement les contrats de test des branches Incendie et
 * Accident — c'est-à-dire exactement ce que la page "Contrats" affiche
 * aujourd'hui : SouscriptionIncendie au statut "complet" et
 * SouscriptionAccident au statut Wave "confirme".
 *
 * Ne touche à rien d'autre : ni aux souscriptions encore en attente/
 * incomplètes, ni aux partenaires, ni aux autres branches (Relax, IMF).
 *
 * Script volontairement à exécution manuelle (pas branché sur le démarrage
 * du conteneur comme seed.ts) : c'est une purge ponctuelle de données de
 * test, pas une correction idempotente à réappliquer à chaque déploiement.
 *
 * Usage :
 *   npx tsx scripts/purge-contrats-test.ts            (aperçu, ne supprime rien)
 *   npx tsx scripts/purge-contrats-test.ts --confirm   (supprime réellement)
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const confirm = process.argv.includes("--confirm");

  const [nbIncendie, nbAccident] = await Promise.all([
    prisma.souscriptionIncendie.count({ where: { statut: "complet" } }),
    prisma.souscriptionAccident.count({ where: { waveStatut: "confirme" } }),
  ]);

  console.log(`Contrats Incendie (statut "complet") : ${nbIncendie}`);
  console.log(`Contrats Accident (Wave "confirme")  : ${nbAccident}`);

  if (!confirm) {
    console.log("\nAucune suppression effectuée (mode aperçu). Relancer avec --confirm pour supprimer réellement.");
    return;
  }

  const [resInc, resAcc] = await Promise.all([
    prisma.souscriptionIncendie.deleteMany({ where: { statut: "complet" } }),
    prisma.souscriptionAccident.deleteMany({ where: { waveStatut: "confirme" } }),
  ]);

  console.log(`\nSupprimé : ${resInc.count} contrat(s) Incendie, ${resAcc.count} contrat(s) Accident.`);
}

main()
  .catch((e) => { console.error("Erreur :", e); process.exit(1); })
  .finally(() => prisma.$disconnect());
