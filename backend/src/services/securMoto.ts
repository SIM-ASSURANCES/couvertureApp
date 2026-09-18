// Moteur de calcul de la prime — SECURMOTO (Assurances Dommages, deux-roues).
// Fonction pure (pas d'accès Prisma), sur le modèle de securhomeDommages.ts —
// la route publique (routes/public.ts) recalcule systématiquement côté
// serveur à la soumission, jamais confiance dans un montant envoyé par le
// client (le frontend ne fait qu'un aperçu en direct avec la même formule,
// voir frontend/src/securMoto.ts).
//
// Barème d'après la cotation SECURMOTO fournie — souscription individuelle
// (effectif toujours égal à 1, pas de réduction de groupe : le barème source
// prévoit un tarif dégressif par effectif pour les polices flotte, écarté
// pour cette souscription publique individuelle).

export type AgeMoto = "NEUVE" | "1 AN" | "2 ANS";

const VALEUR_MOTO_MAX = 700_000;
const ACCESSOIRES = 2500;
const TAUX_TAXE = 0.0725;

const TAUX_CAPITAL_GARANTI: Record<AgeMoto, number> = {
  "NEUVE": 0.5,
  "1 AN": 0.35,
  "2 ANS": 0.2,
};

function tauxPrimeNette(ageMoto: AgeMoto): number {
  if (ageMoto === "NEUVE") return 0.047;
  if (ageMoto === "1 AN") return 0.035;
  return 0.025; // "2 ANS"
}

export interface SecurMotoInput {
  valeurMoto: number;
  ageMoto: AgeMoto;
}

export interface ResultatSecurMoto {
  capitalGaranti: number;
  primeNetteHT: number;
  accessoires: number;
  taxes: number;
  primeTTC: number;
}

const round = (n: number) => Math.round(n);

/** Valide les entrées — lève une erreur avec un message utilisateur si invalide. */
export function validerEntreesSecurMoto(input: SecurMotoInput): void {
  if (!(input.valeurMoto > 0)) {
    throw new Error("La valeur de la moto doit être positive.");
  }
  if (input.valeurMoto > VALEUR_MOTO_MAX) {
    throw new Error(`La valeur de la moto est limitée à ${VALEUR_MOTO_MAX.toLocaleString("fr-FR")} FCFA.`);
  }
}

export function calculerSecurMoto(input: SecurMotoInput): ResultatSecurMoto {
  validerEntreesSecurMoto(input);

  const capitalGaranti = round(input.valeurMoto * TAUX_CAPITAL_GARANTI[input.ageMoto]);
  const primeNetteHT = round(input.valeurMoto * tauxPrimeNette(input.ageMoto));
  const accessoires = ACCESSOIRES;
  const taxes = round((primeNetteHT + accessoires) * TAUX_TAXE);
  const primeTTC = primeNetteHT + accessoires + taxes;

  return { capitalGaranti, primeNetteHT, accessoires, taxes, primeTTC };
}
