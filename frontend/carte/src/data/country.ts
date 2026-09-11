import type { Confidence } from "@/lib/schema/city";

export interface CountryFact {
  label: string;
  value: string;
  hint?: string;
  source?: string;
  confidence: Confidence;
}

/** Chiffres clés nationaux (panneau d'accueil). */
export const COUNTRY_KEY_FACTS: CountryFact[] = [
  {
    label: "Population",
    value: "29 389 150",
    hint: "RGPH 2021",
    source: "ins-rgph-2021",
    confidence: "verified",
  },
  {
    label: "Superficie",
    value: "≈ 322 460 km²",
    hint: "322 462 ou 322 463 km² selon les sources",
    confidence: "to-verify",
  },
  {
    label: "Districts",
    value: "14",
    hint: "dont 2 autonomes",
    source: "decret-2011-263",
    confidence: "verified",
  },
  {
    label: "Régions",
    value: "31",
    source: "decret-2011-263",
    confidence: "verified",
  },
];

/** Informations pratiques communes à tout le pays (reprises sur chaque fiche). */
export const COUNTRY_PRACTICAL = {
  capitals: { political: "Yamoussoukro", economic: "Abidjan" },
  currency: { label: "Franc CFA", code: "XOF", source: "bceao" },
  callingCode: { label: "+225", hint: "numéros à 10 chiffres depuis 2021", source: "artci" },
  timezone: { label: "UTC+0 (GMT)", hint: "pas d'heure d'été" },
  officialLanguage: "Français",
  driving: "Conduite à droite",
} as const;
