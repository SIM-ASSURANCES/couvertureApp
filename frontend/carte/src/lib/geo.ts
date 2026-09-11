import type { LngLat } from "@/lib/types";

const toRad = (d: number) => (d * Math.PI) / 180;
const toDeg = (r: number) => (r * 180) / Math.PI;

/** Distance orthodromique (à vol d'oiseau) en kilomètres. */
export function haversineKm([lon1, lat1]: LngLat, [lon2, lat2]: LngLat): number {
  const R = 6371.0088;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Cap initial de `from` vers `to`, en degrés (0 = nord, sens horaire). */
export function bearing([lon1, lat1]: LngLat, [lon2, lat2]: LngLat): number {
  const y = Math.sin(toRad(lon2 - lon1)) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lon2 - lon1));
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

const DIRECTIONS = ["nord", "nord-est", "est", "sud-est", "sud", "sud-ouest", "ouest", "nord-ouest"] as const;

export function cardinal(deg: number): string {
  return DIRECTIONS[Math.round(deg / 45) % 8]!;
}

/** « nord » → « au nord » ; « est » → « à l'est ». */
export const directionPhrase = (d: string) => (d === "est" || d === "ouest" ? `à l'${d}` : `au ${d}`);

/** « 7,6890° N · 5,0284° O » */
export function formatCoordinates(lat: number, lon: number, digits = 4): string {
  const f = (n: number) => Math.abs(n).toFixed(digits).replace(".", ",");
  return `${f(lat)}° ${lat >= 0 ? "N" : "S"} · ${f(lon)}° ${lon >= 0 ? "E" : "O"}`;
}
