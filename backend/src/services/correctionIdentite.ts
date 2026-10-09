// Correction, par un admin, des informations d'un client qui s'est trompé à la
// souscription (nom, date de naissance, téléphone…) — tous produits : modèle
// générique (dont les Assurances Santé) et les deux modèles historiques
// Incendie / Accident.
//
// Seule l'identité du client est corrigeable ici. Le produit, la formule, la
// prime, les dates et le numéro de police ne le sont jamais : ce ne sont pas
// des erreurs de saisie du client. Contrat, facture et carte étant rebâtis
// depuis la base à chaque téléchargement, une correction s'y retrouve aussitôt.

import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { normaliserTelephone, resoudreOuCreerClient } from "./clients.js";
import {
  AGE_MAX_ASSURE_PRINCIPAL,
  AGE_MIN_ASSURE_PRINCIPAL,
  VALIDATION_SANTE,
  ageRevolu,
  estProduitSante,
  ficheSanteSchema,
  lireFicheSante,
  lirePersonnesAssureesSante,
  personneAssureeSanteSchema,
  validerPersonnesAssureesSante,
  type FicheSante,
  type PersonneAssureeSante,
} from "./assurancesSante.js";

export const MODELES_SOUSCRIPTION = ["generique", "incendie", "accident"] as const;
export type ModeleSouscription = (typeof MODELES_SOUSCRIPTION)[number];

/** Refus métier d'une correction, avec le statut HTTP à renvoyer. */
export class CorrectionRefusee extends Error {
  constructor(
    public statut: number,
    message: string
  ) {
    super(message);
  }
}

const CHAMPS = [
  "nom",
  "prenom",
  "telephone",
  "dateNaissance",
  "sexe",
  "email",
  "civilite",
  "ville",
  "commune",
  "adresse",
  "numeroPieceIdentite",
] as const;
type Champ = (typeof CHAMPS)[number];
type Valeurs = Partial<Record<Champ, string | null>>;

const texteFacultatif = (max: number) =>
  z.preprocess((v) => (typeof v === "string" && !v.trim() ? null : v), z.string().trim().max(max).nullable()).optional();

export const correctionIdentiteSchema = z.object({
  modele: z.enum(MODELES_SOUSCRIPTION),
  champs: z
    .object({
      nom: z.string().trim().min(1).max(160).optional(),
      prenom: texteFacultatif(120),
      telephone: z.string().trim().min(6).max(30).optional(),
      dateNaissance: z.preprocess((v) => (v === "" ? null : v), z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable()).optional(),
      sexe: z.preprocess((v) => (v === "" ? null : v), z.enum(["masculin", "feminin"]).nullable()).optional(),
      email: z.preprocess((v) => (typeof v === "string" && !v.trim() ? null : v), z.string().trim().email().max(160).nullable()).optional(),
      civilite: texteFacultatif(10),
      ville: texteFacultatif(120),
      commune: texteFacultatif(120),
      adresse: texteFacultatif(200),
      numeroPieceIdentite: texteFacultatif(60),
    })
    .strict(),
  // Assurances Santé uniquement.
  ficheSante: ficheSanteSchema.optional(),
  personnesAssurees: z.array(personneAssureeSanteSchema).max(4).optional(),
});
export type CorrectionIdentite = z.infer<typeof correctionIdentiteSchema>;

const isoJour = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);

interface Fiche {
  id: string;
  modele: ModeleSouscription;
  produitCode: string;
  produitLibelle: string;
  numeroPolice: string | null;
  createdAt: Date;
  clientId: string | null;
  produitId: string | null;
  confirmee: boolean;
  validationStatut: string | null;
  valeurs: Valeurs;
  /** Champs corrigeables pour CETTE souscription (ceux que le produit collecte). */
  applicables: Champ[];
  donneesSpecifiques: unknown;
  carteNovelia: boolean;
}

/**
 * Champs corrigeables : nom, prénom et téléphone toujours ; les autres
 * seulement s'ils ont été collectés pour cette souscription (un produit
 * Dommages n'a ni date de naissance ni sexe : rien à corriger). Santé : la
 * liste est celle de son formulaire, sans prénom (un seul « Nom complet »).
 */
function champsApplicables(modele: ModeleSouscription, produitCode: string, valeurs: Valeurs): Champ[] {
  if (modele === "accident") return ["nom", "prenom", "telephone", "dateNaissance"];
  if (modele === "incendie") {
    return ["nom", "prenom", "telephone", "dateNaissance", ...(valeurs.email != null ? (["email"] as Champ[]) : [])];
  }
  if (estProduitSante(produitCode)) return ["nom", "telephone", "dateNaissance", "sexe", "email"];
  const facultatifs: Champ[] = ["dateNaissance", "sexe", "email", "civilite", "ville", "commune", "adresse", "numeroPieceIdentite"];
  return ["nom", "prenom", "telephone", ...facultatifs.filter((c) => valeurs[c] != null)];
}

async function chargerFiche(modele: ModeleSouscription, id: string): Promise<Fiche | null> {
  if (modele === "incendie") {
    const s = await prisma.souscriptionIncendie.findUnique({ where: { id } });
    if (!s) return null;
    const valeurs: Valeurs = { nom: s.nom, prenom: s.prenom, telephone: s.telephone, dateNaissance: isoJour(s.dateNaissance), email: s.email };
    return {
      id: s.id,
      modele,
      produitCode: "incendie",
      produitLibelle: "Incendie Habitation en Inclusion",
      numeroPolice: null,
      createdAt: s.createdAt,
      clientId: s.clientId,
      produitId: null,
      confirmee: s.statut === "complet",
      validationStatut: null,
      valeurs,
      applicables: champsApplicables(modele, "incendie", valeurs),
      donneesSpecifiques: null,
      carteNovelia: false,
    };
  }
  if (modele === "accident") {
    const s = await prisma.souscriptionAccident.findUnique({ where: { id } });
    if (!s) return null;
    const valeurs: Valeurs = { nom: s.nom, prenom: s.prenom, telephone: s.telephone, dateNaissance: isoJour(s.dateNaissance) };
    return {
      id: s.id,
      modele,
      produitCode: "accident",
      produitLibelle: "Accidents (historique)",
      numeroPolice: s.numeroPolice,
      createdAt: s.createdAt,
      clientId: s.clientId,
      produitId: null,
      confirmee: s.waveStatut === "confirme",
      validationStatut: null,
      valeurs,
      applicables: champsApplicables(modele, "accident", valeurs),
      donneesSpecifiques: null,
      carteNovelia: false,
    };
  }
  const s = await prisma.souscription.findUnique({
    where: { id },
    include: { produit: { select: { code: true, libelle: true } }, carte: { select: { noveliaRef: true, numeroPoliceNovelia: true } } },
  });
  if (!s) return null;
  const valeurs: Valeurs = {
    nom: s.nom,
    prenom: s.prenom,
    telephone: s.telephone,
    dateNaissance: isoJour(s.dateNaissance),
    sexe: s.sexe,
    email: s.email,
    civilite: s.civilite,
    ville: s.ville,
    commune: s.commune,
    adresse: s.adresse,
    numeroPieceIdentite: s.numeroPieceIdentite,
  };
  return {
    id: s.id,
    modele,
    produitCode: s.produit.code,
    produitLibelle: s.produit.libelle,
    numeroPolice: s.numeroPolice,
    createdAt: s.createdAt,
    clientId: s.clientId,
    produitId: s.produitId,
    confirmee: s.waveStatut === "confirme",
    validationStatut: s.validationStatut,
    valeurs,
    applicables: champsApplicables(modele, s.produit.code, valeurs),
    donneesSpecifiques: s.donneesSpecifiques,
    carteNovelia: !!(s.carte?.noveliaRef || s.carte?.numeroPoliceNovelia),
  };
}

/**
 * Ce que l'admin doit savoir. Sans `modifies` (ouverture de la fenêtre) : tout
 * ce qui pourrait s'appliquer. Avec `modifies` (après enregistrement) :
 * seulement ce que la correction faite entraîne réellement.
 */
function avertissements(f: Fiche, modifies?: string[]): string[] {
  const identiteTouchee = !modifies || modifies.some((m) => ["nom", "prenom", "dateNaissance", "sexe"].includes(m));
  const telephoneTouche = !modifies || modifies.includes("telephone");
  return [
    ...(f.carteNovelia && identiteTouchee
      ? ["La carte de prise en charge a déjà été transmise à NOVELIA avec l'ancienne identité : la correction n'y est pas répercutée, elle est à signaler à NOVELIA."]
      : []),
    ...(f.confirmee && telephoneTouche
      ? ["Le téléphone est l'identifiant de connexion de l'espace client : s'il change, le client se connecte avec le nouveau numéro et le même mot de passe."]
      : []),
  ];
}

/** Ce que l'admin peut corriger sur une souscription, avec les valeurs actuelles. */
export async function lireIdentiteCorrigeable(modele: ModeleSouscription, id: string) {
  const f = await chargerFiche(modele, id);
  if (!f) return null;
  const sante = modele === "generique" && estProduitSante(f.produitCode);
  return {
    id: f.id,
    modele,
    produitCode: f.produitCode,
    produitLibelle: f.produitLibelle,
    numeroPolice: f.numeroPolice,
    champs: Object.fromEntries(f.applicables.map((c) => [c, f.valeurs[c] ?? null])),
    sante: sante
      ? { ficheSante: lireFicheSante(f.donneesSpecifiques), personnesAssurees: lirePersonnesAssureesSante(f.donneesSpecifiques) }
      : null,
    avertissements: avertissements(f),
  };
}

function dateNaissanceValide(iso: string): Date {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime()) || d.getUTCFullYear() < 1900 || d.getTime() > Date.now()) {
    throw new CorrectionRefusee(400, "Date de naissance invalide.");
  }
  return d;
}

/**
 * Applique une correction. Retourne la liste des champs réellement modifiés
 * et les valeurs avant/après pour le journal d'activité (les données de santé
 * n'y figurent que par leur nom, jamais par leur valeur).
 */
export async function corrigerIdentite(id: string, correction: CorrectionIdentite) {
  const f = await chargerFiche(correction.modele, id);
  if (!f) throw new CorrectionRefusee(404, "Souscription introuvable.");
  const sante = correction.modele === "generique" && estProduitSante(f.produitCode);

  const horsListe = (Object.keys(correction.champs) as Champ[]).filter((c) => !f.applicables.includes(c));
  if (horsListe.length) throw new CorrectionRefusee(400, `Champ(s) non modifiable(s) pour ce produit : ${horsListe.join(", ")}.`);
  if ((correction.ficheSante || correction.personnesAssurees) && !sante) {
    throw new CorrectionRefusee(400, "La fiche de santé et les personnes couvertes ne concernent que les Assurances Santé.");
  }

  // ── Champs d'identité : on ne garde que ce qui change vraiment ──
  const apres: Valeurs = {};
  for (const champ of f.applicables) {
    const nouvelle = correction.champs[champ];
    if (nouvelle === undefined) continue;
    if ((nouvelle ?? null) !== (f.valeurs[champ] ?? null)) apres[champ] = nouvelle ?? null;
  }
  if ("nom" in apres && !apres.nom) throw new CorrectionRefusee(400, "Le nom est obligatoire.");
  // Un prénom déjà renseigné ne s'efface pas (Accident : colonne obligatoire).
  if ("prenom" in apres && !apres.prenom && (correction.modele === "accident" || f.valeurs.prenom)) {
    throw new CorrectionRefusee(400, "Le prénom est obligatoire.");
  }
  if ("dateNaissance" in apres) {
    if (!apres.dateNaissance) {
      if (sante || correction.modele === "accident") throw new CorrectionRefusee(400, "La date de naissance est obligatoire.");
    } else {
      const naissance = dateNaissanceValide(apres.dateNaissance);
      if (sante) {
        // Même condition qu'à la demande, appréciée à la date de la demande.
        const age = ageRevolu(naissance, f.createdAt);
        if (age < AGE_MIN_ASSURE_PRINCIPAL || age > AGE_MAX_ASSURE_PRINCIPAL) {
          throw new CorrectionRefusee(400, `L'assuré principal doit avoir entre ${AGE_MIN_ASSURE_PRINCIPAL} et ${AGE_MAX_ASSURE_PRINCIPAL} ans à la date de la demande.`);
        }
      }
    }
  }
  if (sante && "sexe" in apres && !apres.sexe) throw new CorrectionRefusee(400, "Le sexe est obligatoire.");

  const nomFinal = apres.nom ?? f.valeurs.nom ?? null;
  const prenomFinal = "prenom" in apres ? apres.prenom ?? null : f.valeurs.prenom ?? null;
  const telephoneChange = "telephone" in apres;
  if (telephoneChange) {
    const cle = normaliserTelephone(apres.telephone ?? "");
    if (cle.length < 8) throw new CorrectionRefusee(400, "Numéro de téléphone invalide.");
  }

  // Un même client ne détient pas deux fois le même produit : la correction ne
  // doit pas créer le doublon que la souscription publique refuse.
  if (correction.modele === "generique" && f.produitId && (telephoneChange || "nom" in apres) && nomFinal) {
    const doublon = await prisma.souscription.findFirst({
      where: {
        id: { not: f.id },
        produitId: f.produitId,
        nom: { equals: nomFinal, mode: "insensitive" },
        telephone: apres.telephone ?? f.valeurs.telephone ?? "",
        OR: [
          { waveStatut: "confirme" },
          { validationStatut: { in: [VALIDATION_SANTE.EN_ATTENTE, VALIDATION_SANTE.VALIDEE] } },
        ],
      },
      select: { id: true },
    });
    if (doublon) throw new CorrectionRefusee(409, "Une autre souscription existe déjà pour ce nom et ce numéro sur ce produit.");
  }

  // ── Assurances Santé : fiche de l'assuré principal et personnes couvertes ──
  let donneesSpecifiques: Prisma.InputJsonValue | undefined;
  const santeModifie: string[] = [];
  if (sante && estProduitSante(f.produitCode)) {
    const base = (f.donneesSpecifiques ?? {}) as Record<string, unknown>;
    const suite: Record<string, unknown> = { ...base };
    if (correction.ficheSante) {
      const avant = (lireFicheSante(base) ?? {}) as Partial<FicheSante>;
      const cles = [...new Set([...Object.keys(avant), ...Object.keys(correction.ficheSante)])] as (keyof FicheSante)[];
      const changees = cles.filter((k) => (avant[k] ?? null) !== (correction.ficheSante![k] ?? null));
      if (changees.length) {
        suite.ficheSante = correction.ficheSante;
        santeModifie.push(...changees.map((k) => `ficheSante.${k}`));
      }
    }
    if (correction.personnesAssurees) {
      const erreur = validerPersonnesAssureesSante(f.produitCode, correction.personnesAssurees);
      if (erreur) throw new CorrectionRefusee(400, erreur);
      const forme = (p: PersonneAssureeSante) => `${p.lien}|${p.nom}|${p.prenom}|${p.dateNaissance}`;
      if (lirePersonnesAssureesSante(base).map(forme).join("\n") !== correction.personnesAssurees.map(forme).join("\n")) {
        suite.personnesAssurees = correction.personnesAssurees;
        santeModifie.push("personnesAssurees");
      }
    }
    if (santeModifie.length) donneesSpecifiques = suite as Prisma.InputJsonValue;
  }

  const modifies = [...(Object.keys(apres) as Champ[]), ...santeModifie];
  if (modifies.length === 0) return { modifies, avant: {}, apres: {}, avertissements: [] };

  // Téléphone corrigé : la souscription rejoint le client de ce numéro (créé
  // au besoin) — l'identifiant client CL-… est attaché au téléphone.
  const clientId = telephoneChange ? (await resoudreOuCreerClient(apres.telephone!, nomFinal, prenomFinal)).id : undefined;

  const { dateNaissance, sexe, ...texte } = apres;
  const commun = {
    ...texte,
    ...("dateNaissance" in apres ? { dateNaissance: dateNaissance ? new Date(dateNaissance) : null } : {}),
    ...(clientId ? { clientId } : {}),
  };
  if (correction.modele === "incendie") {
    await prisma.souscriptionIncendie.update({ where: { id: f.id }, data: commun as Prisma.SouscriptionIncendieUncheckedUpdateInput });
  } else if (correction.modele === "accident") {
    await prisma.souscriptionAccident.update({ where: { id: f.id }, data: commun as Prisma.SouscriptionAccidentUncheckedUpdateInput });
  } else {
    await prisma.souscription.update({
      where: { id: f.id },
      data: {
        ...(commun as Prisma.SouscriptionUncheckedUpdateInput),
        ...("sexe" in apres ? { sexe: sexe as "masculin" | "feminin" | null } : {}),
        ...(donneesSpecifiques ? { donneesSpecifiques } : {}),
      },
    });
  }

  // La fiche Client reprend le nom de la souscription dont elle est née : on
  // la corrige avec elle, sauf si elle porte déjà un autre nom (autre contrat).
  if (!telephoneChange && f.clientId && ("nom" in apres || "prenom" in apres)) {
    await prisma.client.updateMany({
      where: { id: f.clientId, nom: f.valeurs.nom ?? null, prenom: f.valeurs.prenom ?? null },
      data: { nom: nomFinal, prenom: prenomFinal },
    });
  }

  const avant = Object.fromEntries((Object.keys(apres) as Champ[]).map((c) => [c, f.valeurs[c] ?? null]));
  return {
    modifies,
    avant: { ...avant, ...(santeModifie.length ? { sante: santeModifie } : {}) },
    apres: { ...apres, ...(santeModifie.length ? { sante: santeModifie } : {}) },
    avertissements: avertissements(f, modifies),
  };
}
