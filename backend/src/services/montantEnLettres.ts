// Montant en toutes lettres pour la mention « Arrêtée la présente facture à la
// somme de… » (services/factureHtml.ts). Orthographe française rectifiée :
// traits d'union entre les mots d'un même nombre, « et » seulement pour 21,
// 31, 41, 51, 61 et 71, « cents »/« quatre-vingts » avec « s » uniquement en
// fin de nombre (ou devant « million(s) » et « milliard(s) »), « mille »
// invariable.

const UNITES = [
  "zéro", "un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf",
  "dix", "onze", "douze", "treize", "quatorze", "quinze", "seize", "dix-sept", "dix-huit", "dix-neuf",
];
const DIZAINES = ["", "", "vingt", "trente", "quarante", "cinquante", "soixante"];

/** 1 à 99. `finDeNombre` : « quatre-vingts » prend un « s » seulement s'il termine le nombre. */
function moinsDeCent(n: number, finDeNombre: boolean): string {
  if (n < 20) return UNITES[n];
  const d = Math.floor(n / 10);
  const u = n % 10;
  if (d === 7) return n === 71 ? "soixante et onze" : `soixante-${UNITES[n - 60]}`;
  if (d === 9) return `quatre-vingt-${UNITES[n - 80]}`;
  if (d === 8) return u === 0 ? (finDeNombre ? "quatre-vingts" : "quatre-vingt") : `quatre-vingt-${UNITES[u]}`;
  if (u === 0) return DIZAINES[d];
  if (u === 1) return `${DIZAINES[d]} et un`;
  return `${DIZAINES[d]}-${UNITES[u]}`;
}

/** 1 à 999. */
function moinsDeMille(n: number, finDeNombre: boolean): string {
  const c = Math.floor(n / 100);
  const r = n % 100;
  if (c === 0) return moinsDeCent(r, finDeNombre);
  const cent = c === 1 ? "cent" : `${UNITES[c]} cent${r === 0 && finDeNombre ? "s" : ""}`;
  return r === 0 ? cent : `${cent} ${moinsDeCent(r, finDeNombre)}`;
}

/** Entier positif ou nul, jusqu'à 999 999 999 999. Hors de ces bornes : lève une erreur plutôt que d'imprimer un montant faux sur une facture. */
export function montantEnLettres(n: number): string {
  if (!Number.isInteger(n) || n < 0 || n > 999_999_999_999) {
    throw new RangeError(`Montant non convertible en lettres : ${n}`);
  }
  if (n === 0) return "zéro";

  const milliards = Math.floor(n / 1e9);
  const millions = Math.floor((n % 1e9) / 1e6);
  const milliers = Math.floor((n % 1e6) / 1e3);
  const reste = n % 1e3;

  const parts: string[] = [];
  if (milliards) parts.push(`${moinsDeMille(milliards, true)} milliard${milliards > 1 ? "s" : ""}`);
  if (millions) parts.push(`${moinsDeMille(millions, true)} million${millions > 1 ? "s" : ""}`);
  if (milliers) parts.push(milliers === 1 ? "mille" : `${moinsDeMille(milliers, false)} mille`);
  if (reste) parts.push(moinsDeMille(reste, true));
  return parts.join(" ");
}
