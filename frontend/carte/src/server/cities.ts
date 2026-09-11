import "server-only";

import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

import enrichmentJson from "@/data/generated/cities-enrichment.json";
import { resolveSource, SOURCES } from "@/data/sources";
import { getDistrict, getRegion } from "@/lib/admin";
import { bearing, cardinal, haversineKm } from "@/lib/geo";
import { CitySchema, EnrichmentSchema, type City, type Source } from "@/lib/schema/city";
import type { CityDetail, CitySummary, LngLat, LocalityProps, NearbyPlace } from "@/lib/types";

/**
 * Dépôt des villes (côté serveur uniquement).
 *
 * Ajouter une ville = déposer un fichier JSON dans src/data/cities/ puis lancer
 * `npm run data:enrich`. Aucune modification de code n'est nécessaire : le fichier est
 * découvert, validé (Zod) et fusionné avec les données générées au moment du build.
 */

const CITIES_DIR = path.join(process.cwd(), "src", "data", "cities");
const LOCALITIES_FILE = path.join(process.cwd(), "public", "data", "localities.geojson");
const ORIGIN_ID = "abidjan";
const NEARBY_COUNT = 6;

const enrichment = EnrichmentSchema.parse(enrichmentJson);

interface LoadedCity {
  city: City;
  coordinates: LngLat;
  osmId: number;
}

let citiesPromise: Promise<LoadedCity[]> | null = null;
let localitiesPromise: Promise<{ props: LocalityProps; coordinates: LngLat }[]> | null = null;

async function readCities(): Promise<LoadedCity[]> {
  const files = (await fs.readdir(CITIES_DIR)).filter((f) => f.endsWith(".json")).sort();
  const loaded = await Promise.all(
    files.map(async (file) => {
      const raw: unknown = JSON.parse(await fs.readFile(path.join(CITIES_DIR, file), "utf8"));
      const parsed = CitySchema.safeParse(raw);
      if (!parsed.success) {
        throw new Error(`Fiche ville invalide « ${file} » :\n${z.prettifyError(parsed.error)}`);
      }
      const city = parsed.data;
      if (`${city.id}.json` !== file) throw new Error(`« ${file} » : l'id doit correspondre au nom du fichier (${city.id}).`);
      if (!getDistrict(city.admin.district)) throw new Error(`« ${file} » : district inconnu « ${city.admin.district} ».`);
      if (city.admin.region && !getRegion(city.admin.region)) throw new Error(`« ${file} » : région inconnue « ${city.admin.region} ».`);
      const coords = enrichment.cities[city.id]?.coordinates;
      if (!coords) {
        throw new Error(`« ${file} » : coordonnées absentes. Lancez « npm run data:enrich » pour les récupérer depuis OpenStreetMap.`);
      }
      return { city, coordinates: [coords.lon, coords.lat] as LngLat, osmId: Number(city.refs.osm.split("/")[1]) };
    }),
  );
  return loaded;
}

const loadCities = () => (citiesPromise ??= readCities());

async function loadLocalities() {
  localitiesPromise ??= fs.readFile(LOCALITIES_FILE, "utf8").then((txt) => {
    const fc = JSON.parse(txt) as GeoJSON.FeatureCollection<GeoJSON.Point, LocalityProps>;
    return fc.features.map((f) => ({ props: f.properties, coordinates: f.geometry.coordinates as LngLat }));
  });
  return localitiesPromise;
}

function toSummary({ city, coordinates, osmId }: LoadedCity): CitySummary {
  const district = getDistrict(city.admin.district)!;
  const region = getRegion(city.admin.region);
  return {
    id: city.id,
    name: city.name,
    tagline: city.tagline,
    coordinates,
    osmId,
    district: district.id,
    districtName: district.name,
    region: region?.id ?? null,
    regionName: region?.name ?? null,
    population: city.population ? { value: city.population.value, year: city.population.year } : null,
    status: city.admin.status,
    roadKm: enrichment.cities[city.id]?.roadFromAbidjan?.distanceKm ?? null,
  };
}

/** Index léger de toutes les villes, trié par population décroissante. */
export async function getCityIndex(): Promise<CitySummary[]> {
  const cities = await loadCities();
  return cities.map(toSummary).sort((a, b) => (b.population?.value ?? 0) - (a.population?.value ?? 0));
}

export async function getCityIds(): Promise<string[]> {
  return (await loadCities()).map((c) => c.city.id);
}

async function computeNearby(target: LoadedCity, all: LoadedCity[]): Promise<NearbyPlace[]> {
  const byOsm = new Map(all.map((c) => [c.osmId, c]));
  const localities = await loadLocalities();
  const seen = new Set<string>([target.city.name]);
  return localities
    .filter((l) => l.props.osmId !== target.osmId)
    .map((l) => ({ l, d: haversineKm(target.coordinates, l.coordinates) }))
    .sort((a, b) => a.d - b.d)
    .filter(({ l }) => (seen.has(l.props.name) ? false : (seen.add(l.props.name), true)))
    .slice(0, NEARBY_COUNT)
    .map(({ l, d }) => {
      const cityId = byOsm.get(l.props.osmId)?.city.id;
      return {
        name: l.props.name,
        distanceKm: Math.round(d),
        direction: cardinal(bearing(target.coordinates, l.coordinates)),
        coordinates: l.coordinates,
        population: l.props.population,
        ...(cityId ? { cityId } : { locality: l.props }),
      };
    });
}

function collectSources(city: City, generated: (typeof enrichment.cities)[string]): Source[] {
  const refs: (string | Source)[] = [...city.sources, "osm", "geoboundaries"];
  if (generated.elevation || generated.image) refs.push("wikidata");
  if (generated.image) refs.push("commons");
  if (generated.roadFromAbidjan) refs.push("osrm");
  const seen = new Set<string>();
  return refs
    .map(resolveSource)
    .filter((s): s is Source => Boolean(s) && !seen.has(s!.id) && (seen.add(s!.id), true));
}

/** Fiche complète (éditorial + généré + calculé). `null` si la ville n'existe pas. */
export async function getCityDetail(id: string): Promise<CityDetail | null> {
  const all = await loadCities();
  const target = all.find((c) => c.city.id === id);
  if (!target) return null;
  const { city } = target;
  const generated = enrichment.cities[id]!;
  const district = getDistrict(city.admin.district)!;
  const origin = all.find((c) => c.city.id === ORIGIN_ID);

  const fromAbidjan =
    origin && origin !== target
      ? {
          straightKm: Math.round(haversineKm(origin.coordinates, target.coordinates)),
          direction: cardinal(bearing(origin.coordinates, target.coordinates)),
          road: generated.roadFromAbidjan
            ? {
                distanceKm: generated.roadFromAbidjan.distanceKm,
                durationMin: generated.roadFromAbidjan.durationMin,
                computedAt: generated.roadFromAbidjan.computedAt,
              }
            : null,
        }
      : null;

  return {
    city,
    computed: {
      coordinates: generated.coordinates!,
      elevation: generated.elevation ?? null,
      image: generated.image ?? null,
      wikipedia: generated.wikipedia ?? null,
      districtName: district.name,
      districtFullName: district.fullName,
      regionName: getRegion(city.admin.region)?.name ?? null,
      fromAbidjan,
      nearby: await computeNearby(target, all),
      sources: collectSources(city, generated),
      generatedAt: enrichment.generatedAt,
    },
  };
}

export const ALL_SOURCES = SOURCES;
