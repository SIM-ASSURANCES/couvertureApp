#!/usr/bin/env node
// Extrait les villes et bourgs (place=city|town) de Côte d'Ivoire depuis OpenStreetMap
// (API Overpass, ODbL) et les rattache à leur district / région par point-dans-polygone.
//
//   public/data/localities.geojson   couche « localités » (clusterisée sur la carte)
//
// Prérequis : npm run data:boundaries

import { fetchJson, pointInGeometry, readJson, round, slugify, writeJson } from "./lib/geo.mjs";

// Serveur principal puis miroirs publics : Overpass renvoie parfois des 429/504 transitoires.
const ENDPOINTS = [
  process.env.OVERPASS_URL,
  "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
].filter(Boolean);
const QUERY = `[out:json][timeout:120];
area["ISO3166-1"="CI"][admin_level=2]->.a;
node(area.a)["place"~"^(city|town)$"]["name"];
out body;`;

const districts = readJson("public/data/civ-districts.geojson").features;
const regions = readJson("public/data/civ-regions.geojson").features;

async function overpass() {
  for (let attempt = 0; attempt < ENDPOINTS.length * 2; attempt++) {
    const url = ENDPOINTS[attempt % ENDPOINTS.length];
    try {
      console.log(`→ Requête Overpass (villes et bourgs) : ${new URL(url).host}`);
      return await fetchJson(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "data=" + encodeURIComponent(QUERY),
      });
    } catch (err) {
      console.warn(`  ! ${err.message} — nouvel essai`);
      await new Promise((r) => setTimeout(r, 3000 * (attempt + 1)));
    }
  }
  throw new Error("Overpass indisponible : réessayez plus tard ou définissez OVERPASS_URL.");
}

const { elements } = await overpass();

const toInt = (v) => {
  const n = Number(String(v ?? "").replace(/[\s.,]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

const OFFSETS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

/** Rattache un point à un polygone ; tolère les points côtiers exclus de peu par la simplification. */
function locate(point, features) {
  const hit = features.find((f) => pointInGeometry(point, f.geometry));
  if (hit) return hit;
  for (const r of [0.01, 0.02, 0.05])
    for (const [dx, dy] of OFFSETS) {
      const p = [point[0] + dx * r, point[1] + dy * r];
      const near = features.find((f) => pointInGeometry(p, f.geometry));
      if (near) return near;
    }
  return undefined;
}

const seen = new Set();
const features = elements
  .map((e) => {
    const point = [round(e.lon, 5), round(e.lat, 5)];
    const district = locate(point, districts);
    const region = locate(point, regions);
    const name = e.tags["name:fr"] ?? e.tags.name;
    let slug = slugify(name);
    if (seen.has(slug)) slug = `${slug}-${e.id}`;
    seen.add(slug);
    const properties = {
      id: slug,
      osmId: e.id,
      name,
      place: e.tags.place,
      population: toInt(e.tags.population),
      populationYear: toInt(e.tags["population:date"]?.slice(0, 4)),
      populationSource: e.tags["source:population"],
      wikidata: e.tags.wikidata,
      district: district?.properties.id,
      region: region?.properties.id,
    };
    for (const k of Object.keys(properties)) if (properties[k] === undefined) delete properties[k];
    return { type: "Feature", properties, geometry: { type: "Point", coordinates: point } };
  })
  // Les plus peuplées d'abord : utile pour l'ordre d'affichage des étiquettes.
  .sort((a, b) => (b.properties.population ?? 0) - (a.properties.population ?? 0));

writeJson("public/data/localities.geojson", {
  type: "FeatureCollection",
  metadata: {
    source: "© contributeurs OpenStreetMap (ODbL) — extraction Overpass place=city|town",
    extractedAt: new Date().toISOString().slice(0, 10),
    count: features.length,
  },
  features,
});

const orphans = features.filter((f) => !f.properties.district).map((f) => f.properties.name);
if (orphans.length) console.warn(`  ! ${orphans.length} localité(s) hors limites : ${orphans.join(", ")}`);
console.log(`${features.length} localités prêtes.`);
