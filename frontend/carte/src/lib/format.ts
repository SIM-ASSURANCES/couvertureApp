const integer = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const compact = new Intl.NumberFormat("fr-FR", { notation: "compact", maximumFractionDigits: 1 });
const longDate = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

export const formatNumber = (n: number) => integer.format(n);

/** 832 371 → « 832,4 k » ; 5 616 633 → « 5,6 M ». */
export const formatCompact = (n: number) => compact.format(n).replace(/\s?k$/, " k");

export const formatKm = (km: number) => `${integer.format(Math.round(km))} km`;

/** 242 → « 4 h 02 » ; 36 → « 36 min ». */
export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return `${h} h ${String(m).padStart(2, "0")}`;
}

export function formatDate(iso: string): string {
  const d = new Date(iso.length === 7 ? `${iso}-01` : iso);
  if (Number.isNaN(d.getTime())) return iso;
  if (iso.length === 7) return new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" }).format(d);
  if (iso.length === 4) return iso;
  return longDate.format(d);
}

export const PLACE_LABEL: Record<string, string> = { city: "Ville", town: "Ville secondaire" };
