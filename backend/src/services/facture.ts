// Facture d'un paiement confirmé (modèle Souscription : Accidents, Secur,
// RelaxVoyage…). UNE facture par ligne Paiement — premier paiement ET chaque
// renouvellement — jamais une par souscription : la souscription est
// réécrite à chaque renouvellement, le paiement est l'événement facturé.
//
// Règle d'or héritée de l'audit sécurité du 2026-10-05 : tout ce qui figure
// sur la facture est relu EN BASE ici. Aucune donnée venue du navigateur.

import type { Prisma, TarifProduit } from "@prisma/client";
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
  /**
   * Détail de la prime, dont les lignes s'additionnent TOUJOURS pour donner
   * `montant` : primeHT + accessoires + taxes (+ optionDeces) = Prime TTC.
   * `null` quand le détail n'est pas connu (RelaxMoto/Auto, RelaxVoyage : rien
   * en base) ou ne se réconcilie pas avec le montant payé : la facture
   * n'affiche alors que la Prime TTC.
   */
  detailPrime: { primeHT: number; accessoires: number; taxes: number; optionDeces: number | null } | null;
  moyenPaiement: string | null;
}

/**
 * Détail Prime HT / Accessoires / Taxes, ou `null`. Sources, dans l'ordre : le
 * devis calculé stocké sur la souscription (produits Secur à devis), le mapper
 * (RelaxAccidents générale, supplément moto/tricycle compris), puis le tarif
 * catalogue (TarifProduit.primeHT/fg/taxes).
 *
 * Le catalogue suit DEUX conventions selon le produit (constaté en base) :
 *  - accessoires EN PLUS  : HT + accessoires + taxes = TTC (RelaxAccidents
 *    générale, SecurHome, Décès, devis Secur) ;
 *  - accessoires COMPRIS dans le HT : HT + taxes = TTC (RelaxAccidents Frais
 *    Médicaux et Livreurs, anciens Accident/Incendie).
 * On reconnaît la convention par le calcul, et dans le second cas on affiche le
 * HT hors accessoires : sur une facture, les lignes doivent s'additionner sous
 * les yeux du client (792 + 140 + 68 = 1 000, et non 932 + 140 + 68).
 *
 * L'option Décès (Frais Médicaux) s'ajoute au prix de la formule : elle est
 * isolée sur sa propre ligne, le détail portant sur la formule seule.
 */
export async function detailDePrime(
  s: Parameters<typeof mapperSouscriptionGenerique>[0],
  montant: number,
  // Barèmes déjà chargés : évite une requête par souscription quand on traite
  // une liste entière (export Excel). Absent : comportement d'origine (facture).
  tarifs?: TarifProduit[]
): Promise<DonneesFacture["detailPrime"]> {
  const g = await mapperSouscriptionGenerique(s, tarifs);
  const r = (g.resultat ?? null) as
    | { primeNetteHT?: number; primeNetteHT2?: number; accessoires?: number; taxes?: number }
    | null;

  const primeOption = g.optionDeces?.prime && g.optionDeces.prime > 0 ? g.optionDeces.prime : 0;
  const base = montant - primeOption; // prix de la formule seule
  if (base <= 0) return null;

  let brut: { ht: number; accessoires: number; taxes: number } | null = null;
  const htDevis = r?.primeNetteHT2 ?? r?.primeNetteHT;
  if (typeof htDevis === "number") {
    brut = { ht: htDevis, accessoires: r?.accessoires ?? 0, taxes: r?.taxes ?? 0 };
  } else if (g.primeHT != null && g.taxes != null) {
    brut = { ht: g.primeHT, accessoires: g.fg ?? 0, taxes: g.taxes };
  } else {
    const tarif = tarifs
      ? tarifs.find(
          (t) =>
            t.produitId === s.produitId &&
            (s.cycleFacturation ? t.libelleVariante === s.cycleFacturation : t.prime === base)
        ) ?? null
      : await prisma.tarifProduit.findFirst({
          where: s.cycleFacturation
            ? { produitId: s.produitId, libelleVariante: s.cycleFacturation }
            : { produitId: s.produitId, prime: base },
        });
    if (tarif?.primeHT != null && tarif.taxes != null) {
      const n = s.cycleFacturation ? Math.max(1, s.nombrePeriodes) : 1;
      brut = { ht: tarif.primeHT * n, accessoires: (tarif.fg ?? 0) * n, taxes: tarif.taxes * n };
    }
  }
  if (!brut) return null;

  // Quelle convention ? (tolérance d'arrondi : les barèmes sont des flottants.)
  const proche = (a: number, b: number) => Math.abs(a - b) <= 1.5;
  let htHorsAccessoires: number;
  if (proche(brut.ht + brut.accessoires + brut.taxes, base)) htHorsAccessoires = brut.ht;
  else if (proche(brut.ht + brut.taxes, base)) htHorsAccessoires = brut.ht - brut.accessoires;
  else return null; // ne se réconcilie pas avec le montant payé : pas de détail inventé

  // Le franc CFA n'a pas de subdivision : accessoires et taxes arrondis, le HT
  // absorbe l'arrondi pour que la somme tombe juste, à l'unité près.
  const accessoires = Math.round(brut.accessoires);
  const taxes = Math.round(brut.taxes);
  const primeHT = base - accessoires - taxes;
  if (primeHT < 0 || Math.abs(primeHT - htHorsAccessoires) > 2) return null;

  return { primeHT, accessoires, taxes, optionDeces: primeOption || null };
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
    // Mode rattrapage : pour un paiement ancien, ne jamais recopier les dates
    // ACTUELLES de la police (réécrites par les renouvellements suivants) — la
    // période déjà figée sur le paiement est conservée, sinon laissée vide.
    await emettreFacture(paiementId, { rattrapage: true });
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
