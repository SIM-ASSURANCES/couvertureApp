import type { LngLat } from "@/lib/types";

/** Normalisation insensible à la casse, aux accents et à la ponctuation (« Bouaké » ≈ « bouake »). */
export function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/['’\-_.]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export interface SearchEntry {
  key: string;
  id: string;
  name: string;
  kind: "city" | "locality";
  coordinates: LngLat;
  district?: string;
  population?: number;
  norm: string;
}

function score(entry: SearchEntry, q: string): number {
  if (entry.norm === q) return 0;
  if (entry.norm.startsWith(q)) return 1;
  if (entry.norm.split(" ").some((w) => w.startsWith(q))) return 2;
  if (entry.norm.includes(q)) return 3;
  return -1;
}

/** Recherche instantanée : correspondance exacte > préfixe > début de mot > sous-chaîne. */
export function search(entries: SearchEntry[], query: string, limit = 8): SearchEntry[] {
  const q = normalize(query);
  if (!q) return [];
  return entries
    .map((e) => ({ e, s: score(e, q) }))
    .filter((r) => r.s >= 0)
    .sort(
      (a, b) =>
        a.s - b.s ||
        (a.e.kind === b.e.kind ? 0 : a.e.kind === "city" ? -1 : 1) ||
        (b.e.population ?? 0) - (a.e.population ?? 0) ||
        a.e.name.localeCompare(b.e.name, "fr"),
    )
    .slice(0, limit)
    .map((r) => r.e);
}
