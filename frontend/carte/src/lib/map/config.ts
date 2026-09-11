import { COUNTRY_BBOX } from "@/lib/admin";
import { BASE_PATH } from "@/lib/site";
import type { BBox } from "@/lib/types";

export type Theme = "light" | "dark";

/** Fonds de carte vectoriels (données OpenStreetMap). Surchargeables par variables d'environnement. */
export const MAP_STYLES: Record<Theme, string> = {
  light: process.env.NEXT_PUBLIC_MAP_STYLE_LIGHT || "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
  dark: process.env.NEXT_PUBLIC_MAP_STYLE_DARK || "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
};

/**
 * Piles de polices servies par le fond de carte (glyphes CARTO).
 * À adapter si vous changez de fournisseur de tuiles.
 */
export const FONT_MEDIUM = ["Montserrat Medium", "Open Sans Bold", "Noto Sans Regular", "HanWangHeiLight Regular", "NanumBarunGothic Regular"];
export const FONT_REGULAR = ["Montserrat Regular", "Open Sans Regular", "Noto Sans Regular", "HanWangHeiLight Regular", "NanumBarunGothic Regular"];

export const DATA_URLS = {
  country: `${BASE_PATH}/data/civ-country.geojson`,
  districts: `${BASE_PATH}/data/civ-districts.geojson`,
  regions: `${BASE_PATH}/data/civ-regions.geojson`,
  labels: `${BASE_PATH}/data/civ-admin-labels.geojson`,
  localities: `${BASE_PATH}/data/localities.geojson`,
} as const;

export const CITY_ZOOM = 10;
export const MIN_ZOOM = 4.5;
export const MAX_ZOOM = 17;

const pad = 4;
export const MAX_BOUNDS: BBox = [
  COUNTRY_BBOX[0] - pad,
  COUNTRY_BBOX[1] - pad,
  COUNTRY_BBOX[2] + pad,
  COUNTRY_BBOX[3] + pad,
];

export const PALETTE = {
  // Couleurs corporate SIM Assurances : #004B9C (clair) / #51AEE2 (sombre), marine #19307A pour le contour national.
  light: {
    accent: "#004b9c",
    mask: "#f4f4f5",
    maskOpacity: 0.8,
    country: "#19307a",
    districtLine: "#a1a1aa",
    regionLine: "#d4d4d8",
    adminLabel: "#71717a",
    halo: "#ffffff",
    cluster: "#52525b",
    clusterText: "#ffffff",
    clusterStroke: "rgba(255,255,255,0.9)",
    locality: "#52525b",
    localityLabel: "#3f3f46",
    cityLabel: "#19307a",
    cityStroke: "#ffffff",
  },
  dark: {
    accent: "#51aee2",
    mask: "#09090b",
    maskOpacity: 0.72,
    country: "#86c6ec",
    districtLine: "#52525b",
    regionLine: "#3f3f46",
    adminLabel: "#a1a1aa",
    halo: "#18181b",
    cluster: "#52525b",
    clusterText: "#fafafa",
    clusterStroke: "rgba(9,9,11,0.9)",
    locality: "#a1a1aa",
    localityLabel: "#d4d4d8",
    cityLabel: "#fafafa",
    cityStroke: "#18181b",
  },
} as const satisfies Record<Theme, Record<string, string | number>>;
