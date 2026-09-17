// Aperçu en direct du devis SECURMOTO — copie exacte des formules de
// backend/src/services/securMoto.ts (source de vérité, qui recalcule
// systématiquement à la soumission). Ce module ne sert qu'à afficher un
// aperçu instantané pendant la saisie, jamais envoyé tel quel au serveur.

export type AgeMoto = "NEUVE" | "1 AN" | "2 ANS";

const VALEUR_MOTO_MAX = 700_000;
const ACCESSOIRES = 2500;
const TAUX_TAXE = 0.0725;

const TAUX_CAPITAL_GARANTI: Record<AgeMoto, number> = {
  "NEUVE": 0.5,
  "1 AN": 0.35,
  "2 ANS": 0.2,
};

function tauxPrimeNette(ageMoto: AgeMoto, garantieVol: boolean): number {
  if (ageMoto === "NEUVE") return garantieVol ? 0.097 : 0.047;
  if (ageMoto === "1 AN") return 0.035;
  return 0.025; // "2 ANS"
}

export interface SecurMotoInput {
  valeurMoto: number;
  ageMoto: AgeMoto;
  garantieVol: boolean;
}

export interface ResultatSecurMoto {
  capitalGaranti: number;
  primeNetteHT: number;
  accessoires: number;
  taxes: number;
  primeTTC: number;
}

const round = (n: number) => Math.round(n);

export function validerEntreesSecurMoto(input: SecurMotoInput): void {
  if (!(input.valeurMoto > 0)) {
    throw new Error("La valeur de la moto doit être positive.");
  }
  if (input.valeurMoto > VALEUR_MOTO_MAX) {
    throw new Error(`La valeur de la moto est limitée à ${VALEUR_MOTO_MAX.toLocaleString("fr-FR")} FCFA.`);
  }
  if (input.garantieVol && input.ageMoto !== "NEUVE") {
    throw new Error("La garantie Vol n'est disponible que pour une moto neuve.");
  }
}

export function calculerSecurMoto(input: SecurMotoInput): ResultatSecurMoto {
  validerEntreesSecurMoto(input);

  const capitalGaranti = round(input.valeurMoto * TAUX_CAPITAL_GARANTI[input.ageMoto]);
  const primeNetteHT = round(input.valeurMoto * tauxPrimeNette(input.ageMoto, input.garantieVol));
  const accessoires = ACCESSOIRES;
  const taxes = round((primeNetteHT + accessoires) * TAUX_TAXE);
  const primeTTC = primeNetteHT + accessoires + taxes;

  return { capitalGaranti, primeNetteHT, accessoires, taxes, primeTTC };
}
