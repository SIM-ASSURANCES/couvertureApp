#!/usr/bin/env node
// Enrichit les fiches villes éditoriales (src/data/cities/*.json) avec des données
// ouvertes et traçables, sans jamais les saisir à la main :
//   • coordonnées       → OpenStreetMap (nœud référencé par refs.osm)
//   • altitude, image   → Wikidata (P2044, P18) + Wikimedia Commons (auteur, licence)
//   • route depuis Abidjan → OSRM (itinéraire routier calculé sur OpenStreetMap)
//
//   src/data/generated/cities-enrichment.json

import fs from "node:fs";
import path from "node:path";
import { ROOT, fetchJson, round, writeJson } from "./lib/geo.mjs";

const CITIES_DIR = path.join(ROOT, "src/data/cities");
const ORIGIN_ID = "abidjan";
const OSRM = process.env.OSRM_URL ?? "https://router.project-osrm.org";
const today = new Date().toISOString().slice(0, 10);

const cities = fs
  .readdirSync(CITIES_DIR)
  .filter((f) => f.endsWith(".json"))
  .map((f) => JSON.parse(fs.readFileSync(path.join(CITIES_DIR, f), "utf8")));
console.log(`→ ${cities.length} fiches trouvées`);

// 1. Coordonnées OSM
const osmIds = cities.map((c) => c.refs?.osm?.replace("node/", "")).filter(Boolean);
const osm = await fetchJson(`https://api.openstreetmap.org/api/0.6/nodes.json?nodes=${osmIds.join(",")}`);
const nodes = new Map(osm.elements.map((n) => [n.id, n]));

// 2. Wikidata
const qids = cities.map((c) => c.refs?.wikidata).filter(Boolean);
const wd = await fetchJson(
  `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${qids.join("|")}&props=claims|sitelinks&sitefilter=frwiki&format=json`,
);
const bestClaim = (claims = []) =>
  claims.find((c) => c.rank === "preferred") ?? claims.find((c) => c.rank === "normal");

// 3. Images Commons (auteur + licence obligatoires pour l'attribution)
const files = [];
for (const q of qids) {
  const f = bestClaim(wd.entities[q]?.claims?.P18)?.mainsnak.datavalue?.value;
  if (f) files.push(f);
}
const commons = files.length
  ? await fetchJson(
      `https://commons.wikimedia.org/w/api.php?action=query&titles=${files.map((f) => encodeURIComponent("File:" + f)).join("|")}&prop=imageinfo&iiprop=url|extmetadata|size&iiurlwidth=960&format=json`,
    )
  : { query: { pages: {} } };
const norm = (s) => s.replace(/_/g, " ");
const imageByFile = new Map(
  Object.values(commons.query.pages).map((p) => [norm(p.title.replace(/^File:/, "")), p]),
);
const stripHtml = (s = "") => s.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
const cleanUrl = (u) => (u ? u.split("?")[0] : u);

// 4. OSRM : une seule requête matricielle depuis Abidjan
const withCoords = cities.filter((c) => nodes.has(Number(c.refs?.osm?.replace("node/", ""))));
const coordOf = (c) => nodes.get(Number(c.refs.osm.replace("node/", "")));
const originIndex = withCoords.findIndex((c) => c.id === ORIGIN_ID);
let table = null;
if (originIndex >= 0) {
  const coords = withCoords.map((c) => `${coordOf(c).lon},${coordOf(c).lat}`).join(";");
  table = await fetchJson(`${OSRM}/table/v1/driving/${coords}?sources=${originIndex}&annotations=distance,duration`);
}

const out = {};
for (const c of cities) {
  const entry = {};
  const node = c.refs?.osm ? nodes.get(Number(c.refs.osm.replace("node/", ""))) : undefined;
  if (node) entry.coordinates = { lat: round(node.lat, 5), lon: round(node.lon, 5), source: "osm", ref: c.refs.osm };
  else console.warn(`  ! ${c.id} : pas de nœud OSM (refs.osm)`);

  const entity = c.refs?.wikidata ? wd.entities[c.refs.wikidata] : undefined;
  const ele = bestClaim(entity?.claims?.P2044)?.mainsnak.datavalue?.value;
  if (ele?.unit?.endsWith("/Q11573")) entry.elevation = { value: Math.round(Number(ele.amount)), source: "wikidata" };

  const frwiki = entity?.sitelinks?.frwiki?.title;
  if (frwiki) entry.wikipedia = { title: frwiki, url: `https://fr.wikipedia.org/wiki/${encodeURIComponent(frwiki.replace(/ /g, "_"))}` };

  const file = bestClaim(entity?.claims?.P18)?.mainsnak.datavalue?.value;
  const page = file ? imageByFile.get(norm(file)) : undefined;
  const info = page?.imageinfo?.[0];
  if (info) {
    const m = info.extmetadata ?? {};
    entry.image = {
      src: cleanUrl(info.thumburl ?? info.url),
      width: info.thumbwidth ?? info.width,
      height: info.thumbheight ?? info.height,
      author: stripHtml(m.Artist?.value).replace(/\s*https?:\/\/\S+/g, "").trim() || "Auteur inconnu",
      license: m.LicenseShortName?.value ?? "Voir la page du fichier",
      licenseUrl: m.LicenseUrl?.value,
      pageUrl: info.descriptionurl,
      title: stripHtml(m.ObjectName?.value) || file,
    };
  }

  const i = withCoords.indexOf(c);
  if (table && i >= 0 && c.id !== ORIGIN_ID) {
    const distance = table.distances?.[0]?.[i];
    const duration = table.durations?.[0]?.[i];
    if (distance != null && duration != null)
      entry.roadFromAbidjan = {
        distanceKm: Math.round(distance / 1000),
        durationMin: Math.round(duration / 60),
        source: "osrm",
        computedAt: today,
      };
  }
  out[c.id] = entry;
}

writeJson("src/data/generated/cities-enrichment.json", { generatedAt: today, cities: out }, true);
console.log("Enrichissement terminé.");
