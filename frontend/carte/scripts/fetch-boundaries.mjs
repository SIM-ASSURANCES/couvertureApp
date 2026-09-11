#!/usr/bin/env node
// Télécharge les limites administratives (geoBoundaries, CC BY 4.0), les simplifie
// et produit les fichiers consommés par la carte et par le mini-localisateur SVG.
//
//   public/data/civ-country.geojson     contour national + masque « hors pays »
//   public/data/civ-districts.geojson   14 districts (dont 2 autonomes)
//   public/data/civ-regions.geojson     31 régions + 2 districts autonomes
//   public/data/civ-admin-labels.geojson points d'étiquette
//   src/data/generated/admin-geo.json   emprises (bbox) pour le zoom sur filtre
//   src/data/generated/country-outline.json tracés SVG projetés (localisateur)

import { bbox, fetchJson, labelPoint, polygonsOf, readJson, round, simplifyGeometry, writeJson } from "./lib/geo.mjs";

const API = "https://www.geoboundaries.org/api/current/gbOpen/CIV";
const admin = readJson("src/data/reference/admin-divisions.json");

async function load(level) {
  const meta = await fetchJson(`${API}/${level}/`);
  console.log(`→ ${level} : ${meta.boundaryCanonical ?? level} (${meta.boundarySource}, ${meta.boundaryYearRepresented})`);
  const geo = await fetchJson(meta.simplifiedGeometryGeoJSON);
  return { meta, features: geo.features };
}

function byGbName(list, gbName, level) {
  const hit = list.find((d) => d.gbName === gbName);
  if (!hit) throw new Error(`${level} inconnu dans admin-divisions.json : « ${gbName} »`);
  return hit;
}

const [adm0, adm1, adm2] = await Promise.all([load("ADM0"), load("ADM1"), load("ADM2")]);

// --- Pays : contour + masque (monde troué par la Côte d'Ivoire) ---
const countryGeom = simplifyGeometry(adm0.features[0].geometry, 0.003);
const countryBbox = bbox(countryGeom);
const world = [[-180, -85], [180, -85], [180, 85], [-180, 85], [-180, -85]];
const holes = polygonsOf(countryGeom).map((poly) => poly[0].slice().reverse());
writeJson("public/data/civ-country.geojson", {
  type: "FeatureCollection",
  features: [
    { type: "Feature", properties: { kind: "outline" }, geometry: countryGeom },
    { type: "Feature", properties: { kind: "mask" }, geometry: { type: "Polygon", coordinates: [world, ...holes] } },
  ],
});

// --- Districts ---
const districts = adm1.features.map((f) => {
  const d = byGbName(admin.districts, f.properties.shapeName, "District");
  const geometry = simplifyGeometry(f.geometry, 0.002);
  return { d, geometry, bbox: bbox(geometry), label: labelPoint(geometry) };
});
writeJson("public/data/civ-districts.geojson", {
  type: "FeatureCollection",
  features: districts.map(({ d, geometry }) => ({
    type: "Feature",
    id: admin.districts.indexOf(d) + 1,
    properties: { id: d.id, name: d.name, autonomous: d.autonomous },
    geometry,
  })),
});

// --- Régions ---
const regions = adm2.features.map((f) => {
  const r = byGbName(admin.regions, f.properties.shapeName, "Région");
  const geometry = simplifyGeometry(f.geometry, 0.002);
  return { r, geometry, bbox: bbox(geometry), label: labelPoint(geometry) };
});
writeJson("public/data/civ-regions.geojson", {
  type: "FeatureCollection",
  features: regions.map(({ r, geometry }) => ({
    type: "Feature",
    properties: { id: r.id, name: r.name, district: r.district },
    geometry,
  })),
});

writeJson("public/data/civ-admin-labels.geojson", {
  type: "FeatureCollection",
  features: [
    ...districts.map(({ d, label }) => ({
      type: "Feature",
      properties: { kind: "district", id: d.id, name: d.autonomous ? `D.A. ${d.name}` : d.name },
      geometry: { type: "Point", coordinates: label },
    })),
    ...regions
      .filter(({ r }) => !r.autonomousDistrict)
      .map(({ r, label }) => ({
        type: "Feature",
        properties: { kind: "region", id: r.id, name: r.name },
        geometry: { type: "Point", coordinates: label },
      })),
  ],
});

writeJson(
  "src/data/generated/admin-geo.json",
  {
    source: {
      name: "geoBoundaries (gbOpen CIV ADM0/ADM1/ADM2)",
      origin: adm1.meta.boundarySource,
      year: Number(adm1.meta.boundaryYearRepresented),
      license: adm1.meta.boundaryLicense,
      url: "https://www.geoboundaries.org/",
    },
    country: { bbox: countryBbox },
    districts: Object.fromEntries(districts.map(({ d, bbox: b }) => [d.id, { bbox: b }])),
    regions: Object.fromEntries(regions.map(({ r, bbox: b }) => [r.id, { bbox: b }])),
  },
  true,
);

// --- Tracés SVG pour le mini-localisateur (projection équirectangulaire corrigée) ---
const [minX, minY, maxX, maxY] = countryBbox;
const k = Math.cos((((minY + maxY) / 2) * Math.PI) / 180);
const WIDTH = 200;
const scale = WIDTH / ((maxX - minX) * k);
const HEIGHT = Math.round((maxY - minY) * scale);
const project = ([x, y]) => [round((x - minX) * k * scale, 1), round((maxY - y) * scale, 1)];
const toPath = (geometry) =>
  polygonsOf(simplifyGeometry(geometry, 0.02))
    .map((poly) => poly.map((ring) => "M" + ring.map((p) => project(p).join(",")).join("L") + "Z").join(""))
    .join("");

writeJson(
  "src/data/generated/country-outline.json",
  {
    width: WIDTH,
    height: HEIGHT,
    bbox: countryBbox,
    k: round(k, 6),
    scale: round(scale, 6),
    country: toPath(adm0.features[0].geometry),
    districts: districts.map(({ d, geometry }) => ({ id: d.id, path: toPath(geometry) })),
  },
  false,
);

console.log("Limites administratives prêtes.");
