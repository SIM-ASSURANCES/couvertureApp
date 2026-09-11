// Utilitaires géographiques partagés par les scripts de préparation des données.
// Aucune dépendance externe : les scripts doivent rester exécutables avec Node seul.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const UA = { "User-Agent": "atlas-ci-data-pipeline/1.0 (contact: voir README)" };

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

export function writeJson(relPath, data, pretty = false) {
  const file = path.join(ROOT, relPath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, pretty ? 2 : 0) + "\n");
  const kb = (fs.statSync(file).size / 1024).toFixed(1);
  console.log(`  ✓ ${relPath} (${kb} Ko)`);
}

export function readJson(relPath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relPath), "utf8"));
}

export async function fetchJson(url, init = {}) {
  const res = await fetch(url, { ...init, headers: { ...UA, ...(init.headers ?? {}) } });
  if (!res.ok) throw new Error(`HTTP ${res.status} sur ${url}`);
  return res.json();
}

/** Arrondit une coordonnée (5 décimales ≈ 1 m, 4 ≈ 11 m). */
export const round = (n, d = 4) => Math.round(n * 10 ** d) / 10 ** d;

// --- Simplification Douglas-Peucker (en degrés, suffisant à l'échelle d'un pays) ---
function sqSegDist(p, a, b) {
  let [x, y] = a;
  let dx = b[0] - x;
  let dy = b[1] - y;
  if (dx !== 0 || dy !== 0) {
    const t = ((p[0] - x) * dx + (p[1] - y) * dy) / (dx * dx + dy * dy);
    if (t > 1) [x, y] = b;
    else if (t > 0) {
      x += dx * t;
      y += dy * t;
    }
  }
  dx = p[0] - x;
  dy = p[1] - y;
  return dx * dx + dy * dy;
}

export function simplifyRing(points, tolerance) {
  if (points.length <= 4) return points;
  const sqTol = tolerance * tolerance;
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop();
    let maxSq = 0;
    let index = 0;
    for (let i = first + 1; i < last; i++) {
      const d = sqSegDist(points[i], points[first], points[last]);
      if (d > maxSq) {
        index = i;
        maxSq = d;
      }
    }
    if (maxSq > sqTol) {
      keep[index] = 1;
      stack.push([first, index], [index, last]);
    }
  }
  const out = points.filter((_, i) => keep[i]);
  return out.length >= 4 ? out : points;
}

const mapRings = (geometry, fn) => {
  if (geometry.type === "Polygon") return { type: "Polygon", coordinates: geometry.coordinates.map(fn) };
  if (geometry.type === "MultiPolygon")
    return { type: "MultiPolygon", coordinates: geometry.coordinates.map((poly) => poly.map(fn)) };
  throw new Error(`Géométrie non gérée : ${geometry.type}`);
};

export function simplifyGeometry(geometry, tolerance, decimals = 4) {
  return mapRings(geometry, (ring) =>
    simplifyRing(ring, tolerance).map(([x, y]) => [round(x, decimals), round(y, decimals)]),
  );
}

export const polygonsOf = (geometry) =>
  geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;

export function bbox(geometry) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const poly of polygonsOf(geometry))
    for (const [x, y] of poly[0]) {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  return [round(minX), round(minY), round(maxX), round(maxY)];
}

function ringArea(ring) {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1]);
  return a / 2;
}

/** Centroïde surfacique du plus grand polygone (point d'étiquette). */
export function labelPoint(geometry) {
  const polys = polygonsOf(geometry);
  const main = polys.reduce((best, p) => (Math.abs(ringArea(p[0])) > Math.abs(ringArea(best[0])) ? p : best));
  const ring = main[0];
  let cx = 0, cy = 0, a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const f = ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
    cx += (ring[j][0] + ring[i][0]) * f;
    cy += (ring[j][1] + ring[i][1]) * f;
    a += f;
  }
  const c = [cx / (3 * a), cy / (3 * a)];
  return pointInGeometry(c, geometry) ? [round(c[0]), round(c[1])] : [round(ring[0][0]), round(ring[0][1])];
}

function pointInRing([x, y], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function pointInGeometry(point, geometry) {
  return polygonsOf(geometry).some(
    (poly) => pointInRing(point, poly[0]) && !poly.slice(1).some((hole) => pointInRing(point, hole)),
  );
}

export function haversineKm([lon1, lat1], [lon2, lat2]) {
  const R = 6371.0088;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Slug stable, sans accents (identifiants d'URL). */
export const slugify = (s) =>
  s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
