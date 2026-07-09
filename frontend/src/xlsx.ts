import * as XLSX from "xlsx";

/**
 * Génère et télécharge un fichier Excel (.xlsx) à partir d'un tableau d'objets.
 * Usage strictement en écriture — jamais utilisé pour lire un fichier externe,
 * donc non concerné par les failles de la librairie xlsx liées au parsing.
 */
export function exportExcel(
  rows: Record<string, unknown>[],
  filename: string,
  sheetName = "Feuille1"
) {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`);
}
