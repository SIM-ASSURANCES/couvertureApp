// Relecture SERVEUR des données d'un contrat (POST /contrats/pdf, routes/
// contrats.ts) pour les produits à devis calculé : SecurPro / SecurHome+ /
// SecurMoto (Assurances Dommages, modèle générique) et les cinq produits IMF
// (SouscriptionImf). Complète chargerDonneesVerifieesServeur (contrats.ts), qui
// couvrait déjà Incendie, Accident et les produits Relax.
//
// Pourquoi : l'endpoint est public et fabriquait un PDF "officiel" (logo,
// signature de la compagnie, numéro de police) à partir de données saisies par
// l'appelant — n'importe qui pouvait émettre une fausse attestation
// d'assurance (audit sécurité 2026-10-05). Ici, TOUT ce qui figure sur le
// contrat vient de la base ; rien de ce qu'envoie le client n'est conservé.
//
// Les mappers IMF sont le portage fidèle des fonctions souscriptionImfToContrat*
// de frontend/src/contract.ts (qui construisaient jusqu'ici ces données dans le
// navigateur) : à garder cohérents si un contrat IMF évolue.

import { prisma } from "../db.js";
import { mapperSouscriptionGenerique } from "./contratGenerique.js";
import {
  SECURPRO_CLASSE_LABELS,
  SECURSTOCK_CLASSE_LABELS,
  SECURSTOCK_LOCALISATION_LABELS,
  sansParentheses,
  type LigneGarantie,
  type ContratSecurpro,
  type ContratSecurhome,
  type ContratSecurMoto,
  type ContratSecurstock,
  type ContratSecurecolte,
  type ContratCoupsdurs,
  type ContratDeces,
  type LigneCoupsdurs,
  type BeneficiaireCoupsdurs,
  type SanteCoupsdurs,
} from "./contractHtml.js";

// ───────────────────────── Assurances Dommages (modèle générique) ─────────────────────────

export type TypeDommages = "securpro_dommages" | "securhome_dommages" | "securmoto";

function plusTroisMois(d: Date): Date {
  const x = new Date(d);
  x.setMonth(x.getMonth() + 3);
  return x;
}

/**
 * Relit une souscription Dommages CONFIRMÉE et du bon produit (un id valide
 * d'un autre produit est refusé, comme pour les types déjà vérifiés).
 * `null` si introuvable, non confirmée ou d'un autre produit.
 */
export async function chargerContratDommagesVerifie(
  type: TypeDommages,
  souscriptionId: string
): Promise<ContratSecurpro | ContratSecurhome | ContratSecurMoto | null> {
  const s = await prisma.souscription.findUnique({
    where: { id: souscriptionId },
    include: {
      partenaire: { select: { nomCommerce: true, nomResponsable: true, localisation: true } },
      produit: { select: { code: true, libelle: true } },
    },
  });
  if (!s || s.waveStatut !== "confirme" || s.produit.code !== type) return null;

  const d = await mapperSouscriptionGenerique(s);
  const r = (d.resultat ?? {}) as {
    lignes?: LigneGarantie[];
    primeNetteHT?: number;
    accessoires?: number;
    taxes?: number;
  };
  const dateDebut = (d.dateDebut ?? s.createdAt).toISOString();
  const dateFin = (d.dateFin ?? plusTroisMois(s.createdAt)).toISOString();
  const statutOccupation = d.statutOccupation ?? "proprietaire";
  const valeurBatimentOuLoyer = statutOccupation === "locataire" ? d.loyerMensuel ?? 0 : d.valeurBatiment ?? 0;
  // La prime TTC est celle réellement payée (montantPrime), jamais recalculée
  // depuis `resultat` — c'est la valeur qui fait foi dans la base.
  const montants = {
    primeNetteHT: r.primeNetteHT ?? 0,
    accessoires: r.accessoires ?? 0,
    taxes: r.taxes ?? 0,
    primeTTC: s.montantPrime,
  };

  if (type === "securpro_dommages") {
    return {
      numeroPolice: d.numeroPolice ?? "",
      intermediaire: d.partenaire,
      dateDebut,
      dateFin,
      dateSouscription: s.createdAt.toISOString(),
      nom: d.nom,
      prenom: d.prenom,
      nomCommercial: d.nomCommercial,
      referenceCIE: d.refFacture,
      telephone: d.telephone,
      ville: d.ville,
      communeQuartier: d.communeQuartier,
      classeLabel: d.classe ? SECURPRO_CLASSE_LABELS[d.classe] ?? `Classe ${d.classe}` : "—",
      statutOccupation,
      valeurBatimentOuLoyer,
      contenu: d.contenu ?? 0,
      dansMarche: !!d.dansMarche,
      lignes: r.lignes ?? [],
      ...montants,
      signature: d.signature,
    };
  }

  if (type === "securhome_dommages") {
    return {
      numeroPolice: d.numeroPolice ?? "",
      partenaire: d.partenaire,
      dateDebut,
      dateFin,
      nom: d.nom,
      prenom: d.prenom,
      telephone: d.telephone,
      ville: d.ville,
      communeQuartier: d.communeQuartier,
      referenceCIE: d.refFacture,
      nombrePieces: d.nombrePieces,
      statutOccupation,
      valeurBatimentOuLoyer,
      contenu: d.contenu ?? 0,
      lignes: r.lignes ?? [],
      ...montants,
      signature: d.signature,
    };
  }

  // securmoto
  return {
    numeroPolice: d.numeroPolice ?? "",
    partenaire: d.partenaire,
    dateDebut,
    dateFin,
    nom: d.nom,
    prenom: d.prenom,
    telephone: d.telephone,
    valeurMoto: d.valeurMoto ?? 0,
    ageMoto: d.ageMoto ?? "NEUVE",
    capitalGaranti: s.capitalGaranti,
    ...montants,
    signature: d.signature,
  };
}

// ───────────────────────── IMF (SouscriptionImf) ─────────────────────────

export type TypeImf = "securpro" | "securstock" | "securecolte" | "coupsdurs" | "deces";

/** Codes produit IMF acceptés pour chaque type de contrat (COUPS DURS existe en trois variantes). */
const CODES_PRODUIT_IMF: Record<TypeImf, string[]> = {
  securpro: ["securpro"],
  securstock: ["securstock"],
  securecolte: ["securecolte"],
  coupsdurs: ["coupsdurs", "coupsdurs_classique", "coupsdurs_incapacite"],
  deces: ["deces"],
};

const COUPSDURS_VARIANTE_LABELS: Record<string, string> = {
  maladie: "Maladie Coups Durs",
  deces: "Décès suite à Coups Durs",
  plafond_500000: "Incapacité temporaire de l'emprunteur — plafond 500 000",
  plafond_1000000: "Incapacité temporaire de l'emprunteur — plafond 1 000 000",
};

type ContratImf = ContratSecurpro | ContratSecurstock | ContratSecurecolte | ContratCoupsdurs | ContratDeces;

/**
 * Relit une souscription IMF non annulée du bon produit. L'identifiant peut
 * être l'id serveur OU l'`offlineId` généré hors-ligne par l'agent (le contrat
 * "provisoire" d'une saisie hors-ligne est alors servi dès que la
 * synchronisation a eu lieu ; avant, la souscription n'existe pas en base et
 * rien ne peut être émis — voir message d'erreur de la route).
 */
export async function chargerContratImfVerifie(type: TypeImf, souscriptionId: string): Promise<ContratImf | null> {
  const s = await prisma.souscriptionImf.findFirst({
    where: { OR: [{ id: souscriptionId }, { offlineId: souscriptionId }] },
    include: {
      agent: {
        select: {
          nom: true,
          prenom: true,
          agence: { select: { nom: true, zone: { select: { nom: true } } } },
          zone: { select: { nom: true } },
          zones: { select: { nom: true } },
        },
      },
    },
  });
  if (!s || s.statut === "annulee" || !CODES_PRODUIT_IMF[type].includes(s.produitCode)) return null;

  // Même calcul que mapSouscriptionAdmin (routes/imf.ts), dont le frontend
  // tirait agentNom/agenceNom/zoneNom pour l'intermédiaire affiché.
  const agentNom = s.agent ? `${s.agent.prenom} ${s.agent.nom}` : null;
  const agenceNom = s.agent?.agence?.nom ?? null;
  const zoneNom =
    s.agent?.agence?.zone.nom ??
    (s.agent?.zones.length ? s.agent.zones.map((z) => z.nom).join(", ") : s.agent?.zone?.nom ?? null);
  const intermediaire = [agentNom, agenceNom ?? zoneNom].filter(Boolean).join(" — ");

  const debut = new Date(s.createdAt);
  const fin = new Date(debut);
  fin.setFullYear(fin.getFullYear() + 1);
  const commun = {
    numeroPolice: s.numeroPolice,
    intermediaire,
    dateDebut: debut.toISOString(),
    dateFin: fin.toISOString(),
    dateSouscription: s.createdAt.toISOString(),
    nom: s.nom,
    prenom: s.prenom,
    telephone: s.telephone,
    typePiece: s.typePiece,
    numeroPiece: s.numeroPiece,
    ville: s.ville,
    communeQuartier: s.communeQuartier,
    signature: s.signature ?? null,
  };

  if (type === "securpro") {
    const entrees = s.entrees as unknown as {
      classe?: number;
      statutOccupation?: "proprietaire" | "locataire";
      valeurBatiment?: number;
      loyerMensuel?: number;
      contenu?: number;
      dansMarche?: boolean;
    };
    const resultat = s.resultat as unknown as { lignes?: LigneGarantie[]; primeNetteHT?: number; accessoires?: number; taxes?: number };
    const statutOccupation = entrees.statutOccupation ?? "proprietaire";
    return {
      ...commun,
      classeLabel: entrees.classe ? sansParentheses(SECURPRO_CLASSE_LABELS[entrees.classe] ?? `Classe ${entrees.classe}`) : "—",
      statutOccupation,
      valeurBatimentOuLoyer: statutOccupation === "locataire" ? entrees.loyerMensuel ?? 0 : entrees.valeurBatiment ?? 0,
      contenu: entrees.contenu ?? 0,
      dansMarche: !!entrees.dansMarche,
      lignes: resultat.lignes ?? [],
      primeNetteHT: resultat.primeNetteHT ?? 0,
      accessoires: resultat.accessoires ?? 0,
      taxes: resultat.taxes ?? 0,
      primeTTC: s.primeTTC,
    };
  }

  if (type === "securstock") {
    const entrees = s.entrees as unknown as { classe?: number; capitalDeclare?: number; localisation?: string };
    const resultat = s.resultat as unknown as {
      capitauxTotaux?: number;
      lignes?: LigneGarantie[];
      primeNetteHT?: number;
      accessoires?: number;
      taxes?: number;
    };
    return {
      ...commun,
      classeLabel: entrees.classe ? sansParentheses(SECURSTOCK_CLASSE_LABELS[entrees.classe] ?? `Classe ${entrees.classe}`) : "—",
      localisationLabel: entrees.localisation ? SECURSTOCK_LOCALISATION_LABELS[entrees.localisation] ?? entrees.localisation : "—",
      montantStock: entrees.capitalDeclare ?? 0,
      capitalRetenu: resultat.capitauxTotaux ?? 0,
      lignes: resultat.lignes ?? [],
      primeNetteHT: resultat.primeNetteHT ?? 0,
      accessoires: resultat.accessoires ?? 0,
      taxes: resultat.taxes ?? 0,
      primeTTC: s.primeTTC,
    };
  }

  if (type === "securecolte") {
    const entrees = s.entrees as unknown as { valeurPackage?: number; superficieHa?: number };
    const resultat = s.resultat as unknown as {
      capitalFaible?: number;
      capitalMoyenne?: number;
      capitalForte?: number;
      capitalDeces?: number;
    };
    const capitaux =
      resultat.capitalFaible !== undefined
        ? [
            { label: "Faible sécheresse (20%)", montant: resultat.capitalFaible },
            { label: "Moyenne sécheresse (50%)", montant: resultat.capitalMoyenne ?? 0 },
            { label: "Forte sécheresse (100%)", montant: resultat.capitalForte ?? 0 },
            { label: "Décès de l'agriculteur (100%)", montant: resultat.capitalDeces ?? 0 },
          ]
        : undefined;
    return {
      ...commun,
      montantPack: s.primeTTC,
      valeurPackage: entrees.valeurPackage ?? null,
      superficieHa: entrees.superficieHa ?? null,
      capitaux,
    };
  }

  if (type === "deces") {
    const entrees = s.entrees as unknown as { beneficiaires?: BeneficiaireCoupsdurs[] };
    const resultat = s.resultat as unknown as { lignes?: { capital: number; prime: number }[] };
    return {
      ...commun,
      capitalGaranti: resultat.lignes?.[0]?.capital ?? 0,
      primeTTC: s.primeTTC,
      beneficiaires: entrees.beneficiaires ?? null,
    };
  }

  // coupsdurs (trois variantes de code produit)
  const entrees = s.entrees as unknown as {
    libelleVariante?: string;
    deces?: boolean;
    incapacite?: string | null;
    sante?: SanteCoupsdurs;
    beneficiaires?: BeneficiaireCoupsdurs[];
  };
  let lignes: LigneCoupsdurs[];
  if (s.produitCode === "coupsdurs") {
    // Produit fusionné : une ou plusieurs garanties combinées (Maladie
    // toujours incluse), reconstituées dans le même ordre que le serveur.
    const resultat = s.resultat as unknown as { lignes?: { capital: number; prime: number }[] };
    const cles = ["maladie", ...(entrees.deces ? ["deces"] : []), ...(entrees.incapacite ? [entrees.incapacite] : [])];
    lignes = cles.map((cle, i) => ({
      cle,
      garantieLabel: COUPSDURS_VARIANTE_LABELS[cle] ?? cle,
      capital: resultat.lignes?.[i]?.capital ?? 0,
      prime: resultat.lignes?.[i]?.prime ?? 0,
    }));
  } else {
    // Polices émises avant la fusion des produits : une seule garantie.
    const resultat = s.resultat as unknown as { capitalGaranti?: number; prime?: number };
    const variante = entrees.libelleVariante ?? "—";
    lignes = [
      {
        cle: variante,
        garantieLabel: COUPSDURS_VARIANTE_LABELS[variante] ?? variante,
        capital: resultat.capitalGaranti ?? 0,
        prime: resultat.prime ?? s.primeTTC,
      },
    ];
  }
  return {
    ...commun,
    lignes,
    primeTTC: s.primeTTC,
    sante: entrees.sante ?? null,
    beneficiaires: entrees.beneficiaires ?? null,
  };
}
