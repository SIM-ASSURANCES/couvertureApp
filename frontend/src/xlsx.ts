/**
 * Génère et télécharge un fichier Excel (.xlsx) à partir d'un tableau d'objets.
 * Usage strictement en écriture — jamais utilisé pour lire un fichier externe,
 * donc non concerné par les failles de la librairie xlsx liées au parsing.
 */
export async function exportExcel(
  rows: Record<string, unknown>[],
  filename: string,
  sheetName = "Feuille1"
) {
  await exportExcelMultiSheet([{ name: sheetName, rows }], filename);
}

/**
 * Variante multi-feuilles : une feuille par entrée du tableau `sheets`.
 * `xlsx` (SheetJS) est chargé à la demande, au moment du clic "Exporter"
 * (audit perf 2026-09-11) — cette librairie est relativement lourde et
 * n'est utile qu'aux quelques pages admin qui l'appellent, jamais au
 * parcours public de souscription.
 */
export async function exportExcelMultiSheet(
  sheets: { name: string; rows: Record<string, unknown>[] }[],
  filename: string
) {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  for (const { name, rows } of sheets) {
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31)); // Excel limite les noms de feuille à 31 caractères
  }
  XLSX.writeFile(wb, filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`);
}
