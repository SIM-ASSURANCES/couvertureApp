/**
 * Construction du classeur Excel « format SIM Assurances » : une feuille aux 25
 * colonnes du modèle fourni (TEMPLATE PLATEFORME QR CODE.xlsx, feuille
 * « PROPOSITION SIM ASSURANCES »). Fonction pure — pas d'appel réseau ni de
 * téléchargement ici, voir exportSim.ts.
 */

/** Réponse de GET /assurances-branche/export-sim : lignes déjà mises en forme par le serveur (« NA » si la donnée n'existe pas). */
export interface ReponseExportSim {
  colonnes: string[];
  /** Colonnes dont les valeurs sont des dates AAAA-MM-JJ (ou « NA »). */
  colonnesDate: string[];
  lignes: Record<string, string | number>[];
}

const JOURS_1900_A_1970 = 25569;

/** « AAAA-MM-JJ » → numéro de série Excel, ou `null` si ce n'est pas une date (« NA »). */
function serieExcel(valeur: unknown): number | null {
  if (typeof valeur !== "string") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valeur);
  if (!m) return null;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86_400_000 + JOURS_1900_A_1970;
}

/** Largeur de colonne (en caractères) d'après le contenu le plus long, bornée pour rester lisible. */
function largeur(titre: string, valeurs: unknown[]): number {
  const plusLong = valeurs.reduce<number>((max, v) => Math.max(max, String(v ?? "").length), titre.length);
  return Math.min(Math.max(plusLong + 2, 12), 42);
}

/** Bâtit le classeur (une feuille « SIM ASSURANCES ») à partir de la réponse du serveur. */
export function construireClasseurSim(XLSX: typeof import("xlsx"), { colonnes, colonnesDate, lignes }: ReponseExportSim) {
  const feuille = XLSX.utils.aoa_to_sheet([colonnes, ...lignes.map((l) => colonnes.map((c) => l[c]))]);

  // Dates : vraies dates Excel (triables, filtrables) affichées jj/mm/aaaa ; « NA » reste du texte.
  colonnes.forEach((nom, col) => {
    if (!colonnesDate.includes(nom)) return;
    lignes.forEach((l, i) => {
      const serie = serieExcel(l[nom]);
      if (serie === null) return;
      feuille[XLSX.utils.encode_cell({ r: i + 1, c: col })] = { t: "n", v: serie, z: "dd/mm/yyyy" };
    });
  });
  feuille["!cols"] = colonnes.map((nom) => ({ wch: largeur(nom, lignes.map((l) => l[nom])) }));

  const classeur = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(classeur, feuille, "SIM ASSURANCES");
  return classeur;
}
