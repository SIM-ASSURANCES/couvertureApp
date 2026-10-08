import bcrypt from "bcryptjs";
import { prisma } from "../db.js";
import { getWaveSession, newNumeroPolice, numeroPoliceRenouvellement, genererMotDePasseClient, lienClientRelax, messageClientRelax, messageClientSante, messageRelaxVoyageActive, sendSMS, dateDebutPremiereActivation } from "./notify.js";
import { genererCarte, renouvelerCarte } from "./novelia.js";
import { emettreFacture } from "./facture.js";
import { DUREE_CONTRAT_SANTE_MOIS, estProduitSante, paiementBloqueParValidation } from "./assurancesSante.js";
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
 * Durée de couverture (en mois) d'un produit à formule unique (pas
 * d'abonnement, `cycleFacturation` reste null) — 3 mois par défaut. Pour
 * RelaxAccidents générale, le souscripteur choisit une périodicité
 * annuelle/mensuelle à la souscription (stockée dans
 * `donneesSpecifiques.cycle`, voir routes/public.ts), qui fixe la durée du
 * contrat ET celle de chaque renouvellement (le cycle initial ne change
 * jamais, comme pour un abonnement RelaxMoto/Auto). RelaxAccidents Frais
 * Médicaux (grand public) : 2 mois (demande explicite, 2026-10-01 —
 * auparavant retombait sur le défaut 3 mois, jamais fixé explicitement).
 * Sa version Livreurs/MotoTaxis reste à 1 mois (inchangé, demande distincte
 * du 2026-09-17). Ne retouche jamais les contrats déjà confirmés : les deux
 * mois ne s'appliquent qu'aux nouvelles souscriptions et à leurs
 * renouvellements futurs, comme pour tous les ajustements de durée de ce
 * fichier.
 */
function dureeFormuleMois(produitCode: string, donneesSpecifiques: unknown): number {
  if (produitCode === "relaxaccidents") {
    const cycle = (donneesSpecifiques as { cycle?: string } | null)?.cycle;
    if (cycle === "mensuel") return 1;
    if (cycle === "annuel") return 12;
  }
  if (produitCode === "relaxaccidents_fraismedicaux") return 2;
  if (produitCode === "relaxaccidents_fraismedicaux_livreurs") return 1;
  // Assurances Santé (Solo, Duo, Famille) : contrat annuel.
  if (estProduitSante(produitCode)) return DUREE_CONTRAT_SANTE_MOIS;
  return 3;
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
 *
 * Point d'entrée UNIQUE de toute confirmation (Wave, Peya pay, API partenaire,
 * renouvellements) : la facture du paiement est émise ici, juste après — voir
 * confirmerEcheance plus bas.
 */
async function activerOuProlonger(p: Paiement): Promise<void> {
  if (p.statut === "paye") return;

  // Assurances Santé : la demande doit avoir été validée par un admin avant
  // tout paiement. Verrou placé ici, point d'entrée unique de toutes les
  // confirmations, pour qu'aucun canal (Wave, Peya pay, mode test) ne puisse
  // activer un contrat sur une demande en attente ou refusée.
  const soumise = await prisma.souscription.findUnique({
    where: { id: p.souscriptionId },
    select: { validationStatut: true },
  });
  if (paiementBloqueParValidation(soumise?.validationStatut)) {
    throw new Error(`Paiement ${p.id} refusé : demande non validée (${soumise?.validationStatut}).`);
  }

  await prisma.paiement.update({
    where: { id: p.id },
    data: { statut: "paye", datePaiement: new Date() },
  });

  if (p.estRenouvellement) {
    const s = await prisma.souscription.findUnique({
      where: { id: p.souscriptionId },
      include: { produit: { select: { code: true } } },
    });
    if (!s) return;
    const base = s.dateFin && s.dateFin > new Date() ? s.dateFin : new Date();
    const dateFin =
      s.cycleFacturation === "mensuel" || s.cycleFacturation === "annuel"
        ? // Un renouvellement reconduit la même durée que la souscription
          // initiale : un contrat pris pour 3 mois se renouvelle par 3 mois.
          avancerDateCycle(base, s.cycleFacturation, s.nombrePeriodes)
        : (() => {
            const d = new Date(base);
            d.setMonth(d.getMonth() + dureeFormuleMois(s.produit.code, s.donneesSpecifiques));
            return d;
          })();
    // Police conservée si le renouvellement tombe dans le délai de grâce
    // (2 jours après l'échéance) ; police neuve au-delà. La carte NOVELIA suit
    // exactement la même règle — voir novelia.ts::renouvelerCarte.
    const numeroPolice = numeroPoliceRenouvellement(s.numeroPolice, s.dateFin);
    const creerNouvellePolice = numeroPolice !== s.numeroPolice;
    // Période couverte par CE paiement, figée pour la facture : dateFin de la
    // souscription sera encore écrasée au renouvellement suivant.
    await prisma.paiement.update({
      where: { id: p.id },
      data: { periodeDebut: base, periodeFin: dateFin },
    });
    await prisma.souscription.update({
      where: { id: s.id },
      data: {
        dateFin,
        numeroPolice,
        statutAbonnement: s.cycleFacturation ? "actif" : s.statutAbonnement,
        renouvellementEnCoursDepuis: null,
        renouveleAt: new Date(),
        nombrePaiements: { increment: 1 },
      },
    });
    await renouvelerCarte(s.id, { creerNouvellePolice });
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
    // Délai d'attente de 72h avant prise d'effet pour les produits Accidents
    // (voir dateDebutPremiereActivation) — RelaxVoyage et les produits
    // Dommages (SecurHome+, SecurPro) restent à effet immédiat.
    const dateDebut = dateDebutPremiereActivation(s.produit.code);

    if (s.cycleFacturation !== "mensuel" && s.cycleFacturation !== "annuel") {
      const dateFin = new Date(dateDebut);
      // RelaxVoyage ne couvre que le trajet déclaré (24h), jamais 3 mois — et
      // n'est donc jamais renouvelable (voir POST /client/renouveler et
      // /assurances-branche/souscriptions/:id/relance-renouvellement, qui
      // rejettent ce produit).
      const estRelaxVoyage = s.produit.code === "relaxvoyage";
      if (estRelaxVoyage) {
        dateFin.setHours(dateFin.getHours() + 24);
      } else {
        dateFin.setMonth(dateFin.getMonth() + dureeFormuleMois(s.produit.code, s.donneesSpecifiques));
      }
      const numeroPolice = newNumeroPolice();

      // Accès espace client — ouvert à tous les produits formule unique SAUF
      // RelaxVoyage : couverture 24h non renouvelable, un compte n'aurait
      // aucune utilité (décision 2026-09-18).
      const motDePasse = estRelaxVoyage ? null : genererMotDePasseClient();

      await prisma.souscription.update({
        where: { id: s.id },
        data: {
          waveStatut: "confirme",
          numeroPolice,
          dateDebut,
          dateFin,
          statut: "complet",
          commissionCalculee: tarif?.commission ?? null,
          ...(motDePasse ? { clientPasswordHash: await bcrypt.hash(motDePasse, 10) } : {}),
        },
      });
      await genererCarte(s.id);
      if (motDePasse) {
        // Santé : le SMS annonce aussi la carte physique, remise sous 7 jours.
        const message = estProduitSante(s.produit.code) ? messageClientSante : messageClientRelax;
        await sendSMS(s.telephone, message(numeroPolice, motDePasse, lienClientRelax()));
      } else {
        await sendSMS(s.telephone, messageRelaxVoyageActive(s.prenom ?? "", numeroPolice));
      }
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
 * Confirme le paiement d'une échéance (voir activerOuProlonger) puis émet sa
 * facture. L'émission ne peut JAMAIS faire échouer la confirmation : le client
 * a payé, la police est active. En cas d'incident, la facture est numérotée
 * plus tard, à la première consultation (routes/factures.ts) ou au prochain
 * démarrage (seed.ts).
 */
export async function confirmerEcheance(p: Paiement): Promise<void> {
  await activerOuProlonger(p);
  await emettreFacture(p.id).catch((err) => console.error("[facture] émission différée pour", p.id, err));
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
