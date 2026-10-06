// Facture d'un paiement confirmé (modèle Souscription : Accidents, Secur,
// RelaxVoyage…). UNE facture par ligne Paiement — premier paiement ET chaque
// renouvellement — jamais une par souscription : la souscription est
// réécrite à chaque renouvellement, le paiement est l'événement facturé.
//
// Règle d'or héritée de l'audit sécurité du 2026-10-05 : tout ce qui figure
// sur la facture est relu EN BASE ici. Aucune donnée venue du navigateur.

import type { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { mapperSouscriptionGenerique } from "./contratGenerique.js";
import { resoudreOuCreerClient } from "./clients.js";

type Tx = Prisma.TransactionClient;

/**
 * Numéro suivant : FAC-AAAA-NNNNNN. Une seule requête SQL atomique
 * (INSERT … ON CONFLICT DO UPDATE … RETURNING) — deux confirmations au même
 * instant reçoivent deux numéros distincts. Appelée DANS la transaction de
 * l'émission : si celle-ci échoue, le compteur est annulé avec elle, d'où
 * une suite sans trou.
 */
export async function prochainNumeroFacture(annee: number, tx: Tx): Promise<string> {
  const rows = await tx.$queryRaw<{ dernier: number }[]>`
    INSERT INTO "CompteurFacture" ("annee", "dernier") VALUES (${annee}, 1)
    ON CONFLICT ("annee") DO UPDATE SET "dernier" = "CompteurFacture"."dernier" + 1
    RETURNING "dernier"`;
  return `FAC-${annee}-${String(rows[0].dernier).padStart(6, "0")}`;
}

interface OptionsEmission {
  /**
   * Rattrapage des paiements antérieurs à la fonctionnalité : la période ne
   * peut plus être reconstituée pour un renouvellement (dateFin a été
   * écrasée), on la laisse vide plutôt que d'imprimer une date fausse.
   */
  rattrapage?: boolean;
}

/**
 * Attribue son numéro de facture à un paiement confirmé. Idempotente et sûre
 * en concurrence : la ligne est verrouillée (FOR UPDATE) avant de relire
 * `numeroFacture`, donc un double appel ne consomme jamais deux numéros.
 * Ne fait rien si le paiement n'est pas encore `paye`.
 */
export async function emettreFacture(paiementId: string, options: OptionsEmission = {}): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Paiement" WHERE "id" = ${paiementId} FOR UPDATE`;
    const p = await tx.paiement.findUnique({
      where: { id: paiementId },
      include: { souscription: { select: { dateDebut: true, dateFin: true, nombrePaiements: true } } },
    });
    if (!p || p.statut !== "paye" || p.numeroFacture) return;

    const dateRef = p.datePaiement ?? new Date();
    const numeroFacture = await prochainNumeroFacture(dateRef.getFullYear(), tx);

    // Période : figée par confirmerEcheance quand elle est connue (c'est le
    // seul moment où la durée exacte du paiement l'est). À défaut, on retombe
    // sur les dates de la souscription — fiables uniquement pour le tout
    // premier paiement d'une souscription jamais renouvelée ; en rattrapage
    // d'un paiement plus ancien on préfère laisser vide que se tromper.
    let periodeDebut = p.periodeDebut;
    let periodeFin = p.periodeFin;
    if (!periodeDebut && !periodeFin) {
      const premierSansRenouvellement = !p.estRenouvellement && p.souscription.nombrePaiements <= 1;
      if (premierSansRenouvellement || !options.rattrapage) {
        periodeDebut = p.souscription.dateDebut;
        periodeFin = p.souscription.dateFin;
      }
    }

    await tx.paiement.update({
      where: { id: paiementId },
      data: { numeroFacture, factureEmiseAt: new Date(), periodeDebut, periodeFin },
    });
  });
}

export interface DonneesFacture {
  numeroFacture: string;
  /** Date du paiement (et non de la génération du PDF) : la facture est la même à chaque téléchargement. */
  dateFacture: Date;
  client: { nomComplet: string; adresse: string | null; telephone: string; identifiant: string | null };
  produitLibelle: string;
  numeroPolice: string | null;
  avenant: "Nouvelle affaire" | "Renouvellement";
  periodeDebut: Date | null;
  periodeFin: Date | null;
  /** Intermédiaire (nom du responsable du partenaire, comme partout ailleurs dans l'application). */
  bureau: string;
  assure: string;
  montant: number;
  /** `null` quand le détail n'est pas connu ou ne correspond pas au montant payé : la facture n'affiche alors que la prime totale. */
  detailPrime: { primeNette: number; accessoires: number; taxes: number } | null;
  moyenPaiement: string | null;
}

/**
 * Détail Prime nette / Accessoires / Taxes, ou `null`. Deux sources, dans
 * l'ordre : le devis calculé stocké sur la souscription (produits Secur), puis
 * le tarif catalogue (TarifProduit.primeHT/fg/taxes). Le détail n'est retenu
 * QUE si sa somme égale exactement le montant payé : une option (ex. Décès),
 * un supplément ou un nombre de périodes que le tarif ne reflète pas le
 * rendraient faux — dans ce cas la facture indique la prime totale seule.
 */
async function detailDePrime(
  s: Parameters<typeof mapperSouscriptionGenerique>[0],
  montant: number
): Promise<DonneesFacture["detailPrime"]> {
  const g = await mapperSouscriptionGenerique(s);
  const r = (g.resultat ?? null) as { primeNetteHT?: number; accessoires?: number; taxes?: number } | null;

  let candidat: { primeNette: number; accessoires: number; taxes: number } | null = null;
  if (r && typeof r.primeNetteHT === "number") {
    candidat = { primeNette: r.primeNetteHT, accessoires: r.accessoires ?? 0, taxes: r.taxes ?? 0 };
  } else if (g.primeHT != null && g.taxes != null) {
    // RelaxAccidents générale : supplément moto/tricycle déjà intégré par le mapper.
    candidat = { primeNette: g.primeHT, accessoires: g.fg ?? 0, taxes: g.taxes };
  } else {
    const tarif = await prisma.tarifProduit.findFirst({
      where: s.cycleFacturation
        ? { produitId: s.produitId, libelleVariante: s.cycleFacturation }
        : { produitId: s.produitId, prime: s.montantPrime },
    });
    if (tarif?.primeHT != null && tarif.taxes != null) {
      const n = s.cycleFacturation ? Math.max(1, s.nombrePeriodes) : 1;
      candidat = {
        primeNette: tarif.primeHT * n,
        accessoires: (tarif.fg ?? 0) * n,
        taxes: tarif.taxes * n,
      };
    }
  }
  if (!candidat) return null;

  const arrondi = {
    primeNette: Math.round(candidat.primeNette),
    accessoires: Math.round(candidat.accessoires),
    taxes: Math.round(candidat.taxes),
  };
  return arrondi.primeNette + arrondi.accessoires + arrondi.taxes === montant ? arrondi : null;
}

function moyenDePaiement(p: { waveTransactionId: string | null; djoganaTransactionId: string | null }): string | null {
  if (p.djoganaTransactionId) return "Peya pay";
  // Canal API partenaire : le partenaire a encaissé lui-même (voir partnerApi.ts).
  if (p.waveTransactionId?.startsWith("API-")) return "Encaissé par le partenaire";
  if (p.waveTransactionId) return "Wave";
  return null;
}

/** `null` si le paiement n'existe pas ou n'est pas encore confirmé (jamais de facture sur un paiement en attente). */
export async function chargerDonneesFacture(paiementId: string): Promise<DonneesFacture | null> {
  let p = await prisma.paiement.findUnique({ where: { id: paiementId } });
  if (!p || p.statut !== "paye") return null;

  // Paiement confirmé avant la sortie de la fonctionnalité et pas encore rattrapé
  // (ou émission interrompue) : on l'émet à la volée.
  if (!p.numeroFacture) {
    await emettreFacture(paiementId);
    p = await prisma.paiement.findUnique({ where: { id: paiementId } });
    if (!p?.numeroFacture) return null;
  }

  const s = await prisma.souscription.findUnique({
    where: { id: p.souscriptionId },
    include: {
      produit: { select: { code: true, libelle: true } },
      partenaire: { select: { nomCommerce: true, nomResponsable: true, localisation: true } },
      client: { select: { identifiant: true } },
    },
  });
  if (!s) return null;

  const nomComplet = [s.prenom, s.nom].filter(Boolean).join(" ").trim();
  const adresse = [s.adresse, s.quartier, s.commune, s.ville].filter(Boolean).join(", ");

  // L'identifiant client figure TOUJOURS sur la facture. Une souscription pas
  // encore rattachée à un Client (créée avant l'introduction du modèle et pas
  // encore rattrapée, ou rattrapage ignoré faute de téléphone exploitable) est
  // rattachée ici, avec la même résolution que partout ailleurs (clé = téléphone
  // normalisé) — l'identifiant est alors le même sur tous les documents du client.
  let identifiantClient = s.client?.identifiant ?? null;
  if (!identifiantClient) {
    try {
      const client = await resoudreOuCreerClient(s.telephone, s.nom, s.prenom);
      await prisma.souscription.updateMany({ where: { id: s.id, clientId: null }, data: { clientId: client.id } });
      identifiantClient = client.identifiant;
    } catch (err) {
      // Téléphone vide ou invalide : la facture reste valable, sans identifiant.
      console.error("[facture] identifiant client non résolu pour", s.id, err);
    }
  }

  return {
    numeroFacture: p.numeroFacture!,
    dateFacture: p.datePaiement ?? p.updatedAt,
    client: {
      nomComplet: nomComplet || s.telephone,
      adresse: adresse || null,
      telephone: s.telephone,
      identifiant: identifiantClient,
    },
    produitLibelle: s.produit.libelle,
    numeroPolice: s.numeroPolice,
    avenant: p.estRenouvellement ? "Renouvellement" : "Nouvelle affaire",
    periodeDebut: p.periodeDebut,
    periodeFin: p.periodeFin,
    bureau: s.partenaire.nomResponsable || s.partenaire.nomCommerce,
    assure: nomComplet || s.telephone,
    montant: p.montant,
    detailPrime: await detailDePrime(s, p.montant),
    moyenPaiement: moyenDePaiement(p),
  };
}
