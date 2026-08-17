import { prisma } from "../db.js";
import { sendSMS, messageRappelEcheance, lienClientRelax } from "./notify.js";

/**
 * Bornes [minuit, minuit+1j) du jour tombant `joursDepuisAujourdhui` jours à
 * partir d'aujourd'hui (0 = aujourd'hui, 5 = dans 5 jours) — comparaison par
 * jour calendaire, jamais par horodatage exact.
 */
function plageJour(joursDepuisAujourdhui: number): { gte: Date; lt: Date } {
  const debut = new Date();
  debut.setHours(0, 0, 0, 0);
  debut.setDate(debut.getDate() + joursDepuisAujourdhui);
  const fin = new Date(debut);
  fin.setDate(fin.getDate() + 1);
  return { gte: debut, lt: fin };
}

/**
 * Relances SMS automatiques d'échéance : J-5 et jour J, pour les 3 modèles
 * de souscription. Aucun indicateur "déjà envoyé" nécessaire — un client déjà
 * renouvelé a une `dateFin` déjà avancée, qui ne retombe donc plus dans la
 * plage du jour ciblé à la prochaine exécution (le mécanisme s'auto-corrige,
 * y compris entre le rappel J-5 et le rappel J-0). Appelée quotidiennement
 * par le planificateur (voir index.ts) ou à la demande via
 * POST /admin/relances/executer.
 */
export async function envoyerRelancesEcheance(): Promise<{ envoyes: number }> {
  let envoyes = 0;
  const lien = lienClientRelax();

  for (const joursRestants of [5, 0]) {
    const plage = plageJour(joursRestants);

    const [generiques, accidents, incendies] = await Promise.all([
      prisma.souscription.findMany({
        where: { waveStatut: "confirme", dateFin: plage },
        select: { telephone: true, prenom: true },
      }),
      prisma.souscriptionAccident.findMany({
        where: { waveStatut: "confirme", dateFin: plage },
        select: { telephone: true, prenom: true },
      }),
      prisma.souscriptionIncendie.findMany({
        where: { statut: "complet", dateFin: plage },
        select: { telephone: true, prenom: true },
      }),
    ]);

    for (const s of [...generiques, ...accidents, ...incendies]) {
      await sendSMS(s.telephone, messageRappelEcheance(s.prenom ?? "", joursRestants, lien));
      envoyes++;
    }
  }

  return { envoyes };
}
