import type { City, CityImage, Source } from "@/lib/schema/city";

/** [longitude, latitude] — ordre GeoJSON / MapLibre. */
export type LngLat = [number, number];
export type BBox = [number, number, number, number];

/** Résumé léger d'une ville, envoyé au client pour la carte, la liste et la recherche. */
export interface CitySummary {
  id: string;
  name: string;
  tagline: string;
  coordinates: LngLat;
  osmId: number;
  district: string;
  districtName: string;
  region: string | null;
  regionName: string | null;
  population: { value: number; year: number } | null;
  status: string[];
  roadKm: number | null;
}

export interface NearbyPlace {
  name: string;
  distanceKm: number;
  direction: string;
  coordinates: LngLat;
  population?: number;
  /** Présent si la localité dispose d'une fiche détaillée. */
  cityId?: string;
  /** Propriétés OSM, pour afficher la carte de localité sinon. */
  locality?: LocalityProps;
}

/** Valeurs calculées ou générées, fusionnées à la fiche éditoriale côté serveur. */
export interface CityComputed {
  coordinates: { lat: number; lon: number; source: string; ref: string };
  elevation: { value: number; source: string } | null;
  image: CityImage | null;
  wikipedia: { title: string; url: string } | null;
  districtName: string;
  districtFullName: string;
  regionName: string | null;
  fromAbidjan: {
    straightKm: number;
    direction: string;
    road: { distanceKm: number; durationMin: number; computedAt: string } | null;
  } | null;
  nearby: NearbyPlace[];
  sources: Source[];
  generatedAt: string;
}

export interface CityDetail {
  city: City;
  computed: CityComputed;
}

/** Propriétés d'une localité OSM (public/data/localities.geojson). */
export interface LocalityProps {
  id: string;
  osmId: number;
  name: string;
  place: "city" | "town";
  population?: number;
  populationYear?: number;
  populationSource?: string;
  wikidata?: string;
  district?: string;
  region?: string;
}

export interface Locality extends LocalityProps {
  coordinates: LngLat;
}
