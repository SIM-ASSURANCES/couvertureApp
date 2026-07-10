import { randomBytes } from "crypto";
import { prisma } from "../db.js";

function newNumeroCarte(): string {
  const year = new Date().getFullYear();
  const suffix = randomBytes(4).toString("hex").toUpperCase();
  return `CARTE-${year}-${suffix}`;
}

/**
 * Génère la carte de prise en charge d'une souscription (RelaxMoto/RelaxAuto)
 * dès l'activation de l'abonnement (1ère échéance payée). Idempotent.
 *
 * Mode stub tant que NOVELIA_API_KEY n'est pas défini : génère un numéro local
 * sans appeler d'API externe. Point d'extension pour la vraie intégration
 * NOVELIA une fois la documentation/les identifiants disponibles.
 */
export async function genererCarte(souscriptionId: string): Promise<void> {
  const existante = await prisma.carte.findUnique({ where: { souscriptionId } });
  if (existante) return;

  if (!process.env.NOVELIA_API_KEY) {
    await prisma.carte.create({
      data: { souscriptionId, numero: newNumeroCarte(), statut: "generee" },
    });
    return;
  }

  // TODO(intégration NOVELIA réelle) : appeler l'API NOVELIA ici une fois la
  // documentation/clé fournie (endpoint, format de requête/réponse). En
  // attendant, on conserve le comportement stub pour ne pas bloquer le flux.
  await prisma.carte.create({
    data: { souscriptionId, numero: newNumeroCarte(), statut: "generee" },
  });
}

/** Renouvelle une carte existante (nouvelle période de couverture). */
export async function renouvelerCarte(souscriptionId: string): Promise<void> {
  const carte = await prisma.carte.findUnique({ where: { souscriptionId } });
  if (!carte) return;
  await prisma.carte.update({
    where: { souscriptionId },
    data: { dateRenouvellement: new Date() },
  });
}
