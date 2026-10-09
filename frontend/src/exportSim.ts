import { api } from "./api";
import type { ReponseExportSim } from "./exportSimClasseur";

/**
 * Export Excel au format SIM Assurances : les 25 colonnes de la feuille
 * « PROPOSITION SIM ASSURANCES » du modèle fourni, pour la liste des clients
 * comme pour celle des contrats. Le serveur envoie les lignes déjà mises en
 * forme (« NA » là où la donnée n'existe pas) ; le classeur est bâti par
 * exportSimClasseur.ts. Écriture seule : aucun fichier externe n'est lu.
 */

/** Filtres transmis au serveur — mêmes noms que les paramètres de GET /assurances-branche/export-sim. */
export interface FiltresExportSim {
  /** Modèles de données à inclure, parmi « generique », « incendie » et « accident » (tous par défaut). */
  modeles?: ("generique" | "incendie" | "accident")[];
  sousBranche?: string;
  produit?: string;
  partenaireId?: string;
  /** « confirme » (par défaut), « attente » ou « tous ». */
  statut?: "confirme" | "attente" | "tous";
  statutIncendie?: string;
  q?: string;
  from?: string;
  to?: string;
}

/** Interroge le serveur avec les filtres de la page, puis télécharge le fichier. Renvoie le nombre de lignes exportées. */
export async function exporterFormatSim(filtres: FiltresExportSim, nomFichier: string): Promise<number> {
  const params = new URLSearchParams();
  if (filtres.modeles?.length) params.set("modeles", filtres.modeles.join(","));
  for (const cle of ["sousBranche", "produit", "partenaireId", "statut", "statutIncendie", "q", "from", "to"] as const) {
    const v = filtres[cle];
    if (v) params.set(cle, v);
  }
  const reponse = await api.get<ReponseExportSim>(`/assurances-branche/export-sim?${params.toString()}`);

  // `xlsx` (SheetJS) et le constructeur de classeur sont chargés à la demande,
  // au clic « Export Excel », comme pour les autres exports admin.
  const [XLSX, { construireClasseurSim }] = await Promise.all([import("xlsx"), import("./exportSimClasseur")]);
  XLSX.writeFile(construireClasseurSim(XLSX, reponse), nomFichier.endsWith(".xlsx") ? nomFichier : `${nomFichier}.xlsx`);
  return reponse.lignes.length;
}
