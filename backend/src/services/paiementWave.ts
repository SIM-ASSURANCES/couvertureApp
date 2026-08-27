import bcrypt from "bcryptjs";
import { prisma } from "../db.js";
import { getWaveSession, newNumeroPolice, numeroPoliceRenouvellement, genererMotDePasseClient, lienClientRelax, messageClientRelax, sendSMS } from "./notify.js";
import { genererCarte } from "./novelia.js";
import type { Paiement } from "@prisma/client";

/**
 * Avance `date` de `nombrePeriodes` cycles RelaxMoto/RelaxAuto ("mensuel" =
 * 1 mois, "annuel" = 1 an). Le nombre de périodes correspond aux cycles payés
 * d'avance à la souscription (voir Souscription.nombrePeriodes).
 */
function avancerDateCycle(date: Date, cycle: "mensuel" | "annuel", nombrePeriodes = 1): Date {
  const n = Math.max(1, nombrePeriodes);
  const d = new Date(date);
  if (cycle === "mensuel") d.setMonth(d.getMonth() + n);
  else d.setFullYear(d.getFullYear() + n);
  return d;
}

/**
 * Confirme le paiement d'une échéance. Deux cas selon le produit (distingués
 * par `cycleFacturation`, renseigné uniquement pour un abonnement) :
 * - Abonnement (RelaxMoto/RelaxAuto) : 1ère échéance → police, couverture pour
 *   la durée du cycle choisi (1 mois si "mensuel" à 2 500 FCFA, 1 an si
 *   "annuel" à 25 000 FCFA), espace client (identifiant/mot de passe envoyés
 *   par SMS) ; renouvellement (déclenché par le CLIENT, espace client) →
 *   prolonge dateFin de la même durée, au même tarif — le cycle initial ne
 *   change jamais.
 * - Formule à paiement unique (RelaxAccidents Frais Médicaux/générale,
 *   RelaxVoyage, SecurHome+, SecurPro Dommages) : pas d'abonnement ni d'espace
 *   client, couverture 3 mois (comme l'ancien produit Accident) ; renouvellement
 *   (déclenché par l'ADMIN, relance SMS) → prolonge dateFin de 3 mois sur la
 *   MÊME souscription (police conservée) — voir POST
 *   /assurances-branche/souscriptions/:id/relance-renouvellement.
 * Idempotent dans tous les cas.
 */
export async function confirmerEcheance(p: Paiement): Promise<void> {
  if (p.statut === "paye") return;

  await prisma.paiement.update({
    where: { id: p.id },
    data: { statut: "paye", datePaiement: new Date() },
  });

  if (p.estRenouvellement) {
    const s = await prisma.souscription.findUnique({ where: { id: p.souscriptionId } });
    if (!s) return;
    const base = s.dateFin && s.dateFin > new Date() ? s.dateFin : new Date();
    const dateFin =
      s.cycleFacturation === "mensuel" || s.cycleFacturation === "annuel"
        ? // Un renouvellement reconduit la même durée que la souscription
          // initiale : un contrat pris pour 3 mois se renouvelle par 3 mois.
          avancerDateCycle(base, s.cycleFacturation, s.nombrePeriodes)
        : (() => {
            const d = new Date(base);
            d.setMonth(d.getMonth() + 3);
            return d;
          })();
    await prisma.souscription.update({
      where: { id: s.id },
      data: {
        dateFin,
        numeroPolice: numeroPoliceRenouvellement(s.numeroPolice, s.dateFin),
        statutAbonnement: s.cycleFacturation ? "actif" : s.statutAbonnement,
        renouvellementEnCoursDepuis: null,
        renouveleAt: new Date(),
        nombrePaiements: { increment: 1 },
      },
    });
    return;
  }

  if (p.numeroEcheance === 1) {
    const s = await prisma.souscription.findUnique({
      where: { id: p.souscriptionId },
      include: { produit: { select: { code: true } } },
    });
    if (!s || s.statutAbonnement || s.waveStatut === "confirme") return; // déjà activé (idempotence)

    // Pour un abonnement, la prime enregistrée est le total payé (tarif du
    // cycle × nombrePeriodes) : on retrouve le tarif par son cycle, pas par le
    // montant, qui ne correspond plus à aucune ligne dès deux périodes.
    const tarif =
      s.cycleFacturation === "mensuel" || s.cycleFacturation === "annuel"
        ? await prisma.tarifProduit.findFirst({
            where: { produitId: s.produitId, libelleVariante: s.cycleFacturation },
          })
        : await prisma.tarifProduit.findFirst({
            where: { produitId: s.produitId, prime: s.montantPrime },
          });
    const dateDebut = new Date();

    if (s.cycleFacturation !== "mensuel" && s.cycleFacturation !== "annuel") {
      const dateFin = new Date(dateDebut);
      // RelaxVoyage ne couvre que le trajet déclaré (24h), jamais 3 mois — et
      // n'est donc jamais renouvelable (voir POST /client/renouveler et
      // /assurances-branche/souscriptions/:id/relance-renouvellement, qui
      // rejettent ce produit).
      if (s.produit.code === "relaxvoyage") {
        dateFin.setHours(dateFin.getHours() + 24);
      } else {
        dateFin.setMonth(dateFin.getMonth() + 3);
      }
      const numeroPolice = newNumeroPolice();

      // Accès espace client (voir branche abonnement ci-dessous) — désormais
      // ouvert à tous les produits, pas seulement RelaxMoto/Auto.
      const motDePasse = genererMotDePasseClient();

      await prisma.souscription.update({
        where: { id: s.id },
        data: {
          waveStatut: "confirme",
          numeroPolice,
          dateDebut,
          dateFin,
          statut: "complet",
          commissionCalculee: tarif?.commission ?? null,
          clientPasswordHash: await bcrypt.hash(motDePasse, 10),
        },
      });
      await genererCarte(s.id);
      await sendSMS(s.telephone, messageClientRelax(numeroPolice, motDePasse, lienClientRelax()));
      return;
    }

    // Couverture sur toute la durée payée d'avance (ex. 3 × mensuel = 3 mois).
    const dateFin = avancerDateCycle(dateDebut, s.cycleFacturation, s.nombrePeriodes);

    // Crée l'accès de l'espace client (identifiant = téléphone) à l'activation.
    const motDePasse = genererMotDePasseClient();
    const numeroPolice = newNumeroPolice();

    await prisma.souscription.update({
      where: { id: s.id },
      data: {
        waveStatut: "confirme",
        statutAbonnement: "actif",
        numeroPolice,
        dateDebut,
        dateFin,
        statut: "complet",
        whatsappEnvoyeAt: new Date(),
        commissionCalculee: tarif?.commission ?? null,
        clientPasswordHash: await bcrypt.hash(motDePasse, 10),
      },
    });

    await genererCarte(s.id);

    await sendSMS(s.telephone, messageClientRelax(numeroPolice, motDePasse, lienClientRelax()));
  }
}

/**
 * Interroge l'API Wave pour l'état réel du paiement d'une échéance et confirme
 * si réussi. Filet de sécurité indépendant du webhook.
 */
export async function verifierPaiementEcheance(
  p: Paiement
): Promise<"paye" | "echoue" | "en_attente"> {
  if (p.statut === "paye") return "paye";

  if (p.waveTransactionId) {
    const session = await getWaveSession(p.waveTransactionId);
    if (session) {
      const paye =
        session.payment_status === "succeeded" ||
        session.checkout_status === "complete";
      const montantOk =
        session.amount == null || Number(session.amount) === p.montant;
      if (paye && montantOk) {
        await confirmerEcheance(p);
        return "paye";
      }
      if (session.checkout_status === "expired") {
        return "echoue";
      }
    }
  }

  return (p.statut as "en_attente" | "echoue") ?? "en_attente";
}
