import type { ExpressionSpecification, FilterSpecification, GeoJSONSource, Map as MlMap } from "maplibre-gl";

import { DATA_URLS, FONT_MEDIUM, FONT_REGULAR, PALETTE, type Theme } from "@/lib/map/config";
import { reseauToGeoJSON, type ReseauAgrege } from "@/lib/reseau";
import type { CitySummary } from "@/lib/types";

export const SOURCE = {
  country: "civ-country",
  districts: "civ-districts",
  regions: "civ-regions",
  labels: "civ-admin-labels",
  localities: "localities",
  cities: "cities",
  reseau: "reseau",
} as const;

export const LAYER = {
  mask: "app-country-mask",
  districtsFill: "app-districts-fill",
  regionsLine: "app-regions-line",
  districtsLine: "app-districts-line",
  countryLine: "app-country-line",
  districtLabels: "app-district-labels",
  regionLabels: "app-region-labels",
  clusters: "app-localities-clusters",
  clusterCount: "app-localities-cluster-count",
  localities: "app-localities",
  localityLabels: "app-locality-labels",
  cities: "app-cities",
  cityLabels: "app-city-labels",
  reseauRegions: "app-reseau-regions-fill",
  reseauPoints: "app-reseau-points",
  reseauCount: "app-reseau-count",
} as const;

export const LAYER_GROUPS = {
  localities: [LAYER.clusters, LAYER.clusterCount, LAYER.localities, LAYER.localityLabels],
  boundaries: [LAYER.regionsLine, LAYER.districtsLine, LAYER.districtLabels, LAYER.regionLabels],
  reseau: [LAYER.reseauRegions, LAYER.reseauPoints, LAYER.reseauCount],
} as const;
export type LayerGroup = keyof typeof LAYER_GROUPS;

export function citiesToGeoJSON(cities: CitySummary[]): GeoJSON.FeatureCollection<GeoJSON.Point> {
  return {
    type: "FeatureCollection",
    features: cities.map((c) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: c.coordinates },
      properties: { id: c.id, name: c.name, population: c.population?.value ?? 0 },
    })),
  };
}

/** Masque les étiquettes de villes du fond de carte : nos propres couches les remplacent. */
export function hideBasemapPlaceLabels(map: MlMap) {
  for (const layer of map.getStyle().layers ?? []) {
    if (layer.type === "symbol" && /place[_-]?(city|town)/i.test(layer.id)) {
      map.setLayoutProperty(layer.id, "visibility", "none");
    }
  }
}

interface AddLayersOptions {
  theme: Theme;
  cities: CitySummary[];
  visibility: Record<LayerGroup, boolean>;
  /** Réseau de distribution (espace admin uniquement). */
  reseau: ReseauAgrege | null;
}

const active: ExpressionSpecification = ["boolean", ["feature-state", "active"], false];
const hover: ExpressionSpecification = ["boolean", ["feature-state", "hover"], false];

/** Ajoute (ou rajoute après un changement de style) toutes les couches de l'application. */
export function addAppLayers(map: MlMap, { theme, cities, visibility, reseau }: AddLayersOptions) {
  const c = PALETTE[theme];
  // Les villes à fiche sont retirées de la source avant regroupement : aucun cluster ne les recouvre.
  const notDetailed: FilterSpecification = ["!", ["in", ["get", "osmId"], ["literal", cities.map((city) => city.osmId)]]];
  const vis = (group: LayerGroup) => (visibility[group] ? "visible" : "none") as "visible" | "none";

  hideBasemapPlaceLabels(map);

  map.addSource(SOURCE.country, { type: "geojson", data: DATA_URLS.country });
  map.addSource(SOURCE.districts, { type: "geojson", data: DATA_URLS.districts, promoteId: "id" });
  map.addSource(SOURCE.regions, { type: "geojson", data: DATA_URLS.regions, promoteId: "id" });
  map.addSource(SOURCE.labels, { type: "geojson", data: DATA_URLS.labels });
  map.addSource(SOURCE.localities, {
    type: "geojson",
    data: DATA_URLS.localities,
    filter: notDetailed,
    cluster: true,
    clusterRadius: 48,
    clusterMaxZoom: 8,
    promoteId: "id",
  });
  map.addSource(SOURCE.cities, { type: "geojson", data: citiesToGeoJSON(cities), promoteId: "id" });

  // Contexte : masque hors frontières + focus sur un district filtré.
  map.addLayer({
    id: LAYER.mask,
    type: "fill",
    source: SOURCE.country,
    filter: ["==", ["get", "kind"], "mask"],
    paint: { "fill-color": c.mask, "fill-opacity": c.maskOpacity },
  });
  map.addLayer({
    id: LAYER.districtsFill,
    type: "fill",
    source: SOURCE.districts,
    paint: { "fill-color": c.mask, "fill-opacity": 0 },
  });
  // Régions teintées selon la taille du réseau (opacité réglée par applyReseau).
  map.addLayer({
    id: LAYER.reseauRegions,
    type: "fill",
    source: SOURCE.regions,
    layout: { visibility: vis("reseau") },
    paint: { "fill-color": c.reseau, "fill-opacity": 0 },
  });

  // Limites administratives.
  map.addLayer({
    id: LAYER.regionsLine,
    type: "line",
    source: SOURCE.regions,
    minzoom: 6.2,
    layout: { visibility: vis("boundaries"), "line-join": "round" },
    paint: { "line-color": c.regionLine, "line-width": 0.8, "line-dasharray": [2, 2] },
  });
  map.addLayer({
    id: LAYER.districtsLine,
    type: "line",
    source: SOURCE.districts,
    layout: { visibility: vis("boundaries"), "line-join": "round" },
    paint: {
      "line-color": ["case", active, c.accent, c.districtLine],
      // `zoom` doit rester au premier niveau d'un interpolate : l'état (actif) se décide à chaque palier.
      "line-width": ["interpolate", ["linear"], ["zoom"], 5, ["case", active, 2.2, 0.6], 9, ["case", active, 2.8, 1.4]],
    },
  });
  map.addLayer({
    id: LAYER.countryLine,
    type: "line",
    source: SOURCE.country,
    filter: ["==", ["get", "kind"], "outline"],
    layout: { "line-join": "round" },
    paint: { "line-color": c.country, "line-width": ["interpolate", ["linear"], ["zoom"], 5, 1.3, 10, 2.4] },
  });
  map.addLayer({
    id: LAYER.districtLabels,
    type: "symbol",
    source: SOURCE.labels,
    maxzoom: 7.2,
    filter: ["==", ["get", "kind"], "district"],
    layout: {
      visibility: vis("boundaries"),
      "text-field": ["upcase", ["get", "name"]],
      "text-font": FONT_MEDIUM,
      "text-size": ["interpolate", ["linear"], ["zoom"], 5, 9, 7, 11],
      "text-letter-spacing": 0.12,
      "text-max-width": 8,
    },
    paint: { "text-color": c.adminLabel, "text-halo-color": c.halo, "text-halo-width": 1.2, "text-opacity": 0.85 },
  });
  map.addLayer({
    id: LAYER.regionLabels,
    type: "symbol",
    source: SOURCE.labels,
    minzoom: 7.2,
    maxzoom: 10,
    filter: ["==", ["get", "kind"], "region"],
    layout: {
      visibility: vis("boundaries"),
      "text-field": ["get", "name"],
      "text-font": FONT_REGULAR,
      "text-size": 11,
      "text-letter-spacing": 0.08,
    },
    paint: { "text-color": c.adminLabel, "text-halo-color": c.halo, "text-halo-width": 1.2, "text-opacity": 0.8 },
  });

  // Localités OSM (regroupées aux petites échelles).
  map.addLayer({
    id: LAYER.clusters,
    type: "circle",
    source: SOURCE.localities,
    filter: ["has", "point_count"],
    layout: { visibility: vis("localities") },
    paint: {
      "circle-color": c.cluster,
      "circle-opacity": 0.75,
      "circle-radius": ["step", ["get", "point_count"], 11, 8, 14, 20, 17],
      "circle-stroke-width": 2,
      "circle-stroke-color": c.clusterStroke,
    },
  });
  map.addLayer({
    id: LAYER.clusterCount,
    type: "symbol",
    source: SOURCE.localities,
    filter: ["has", "point_count"],
    layout: {
      visibility: vis("localities"),
      "text-field": ["get", "point_count_abbreviated"],
      "text-font": FONT_MEDIUM,
      "text-size": 11,
      "text-allow-overlap": true,
    },
    paint: { "text-color": c.clusterText },
  });
  map.addLayer({
    id: LAYER.localities,
    type: "circle",
    source: SOURCE.localities,
    filter: ["!", ["has", "point_count"]],
    layout: { visibility: vis("localities") },
    paint: {
      "circle-color": c.locality,
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 6, ["case", hover, 5.5, 3.5], 11, ["case", hover, 8, 6]],
      "circle-stroke-width": 1.5,
      "circle-stroke-color": c.cityStroke,
    },
  });
  map.addLayer({
    id: LAYER.localityLabels,
    type: "symbol",
    source: SOURCE.localities,
    minzoom: 7,
    filter: ["!", ["has", "point_count"]],
    layout: {
      visibility: vis("localities"),
      "text-field": ["get", "name"],
      "text-font": FONT_REGULAR,
      "text-size": ["interpolate", ["linear"], ["zoom"], 7, 10.5, 11, 12.5],
      "text-anchor": "top",
      "text-offset": [0, 0.7],
      "symbol-sort-key": ["-", 0, ["coalesce", ["get", "population"], 0]],
    },
    paint: { "text-color": c.localityLabel, "text-halo-color": c.halo, "text-halo-width": 1.3 },
  });

  // Villes disposant d'une fiche détaillée : toujours au premier plan.
  map.addLayer({
    id: LAYER.cities,
    type: "circle",
    source: SOURCE.cities,
    paint: {
      "circle-color": c.accent,
      "circle-radius": [
        "+",
        ["interpolate", ["linear"], ["get", "population"], 50000, 6, 500000, 8.5, 5000000, 11.5],
        ["case", hover, 2.5, 0],
      ],
      "circle-stroke-width": 2.5,
      "circle-stroke-color": c.cityStroke,
    },
  });
  map.addLayer({
    id: LAYER.cityLabels,
    type: "symbol",
    source: SOURCE.cities,
    layout: {
      "text-field": ["get", "name"],
      "text-font": FONT_MEDIUM,
      "text-size": ["interpolate", ["linear"], ["zoom"], 5, 11.5, 9, 14],
      "text-variable-anchor": ["left", "right", "top", "bottom"],
      "text-radial-offset": 1,
      "text-justify": "auto",
      "symbol-sort-key": ["-", 0, ["get", "population"]],
    },
    paint: { "text-color": c.cityLabel, "text-halo-color": c.halo, "text-halo-width": 1.6 },
  });

  // Réseau de distribution : une pastille par ville/commune (partenaires + sous-agents),
  // regroupées aux petites échelles en additionnant les effectifs.
  map.addSource(SOURCE.reseau, {
    type: "geojson",
    data: reseauToGeoJSON(reseau),
    cluster: true,
    clusterRadius: 36,
    clusterMaxZoom: 9,
    clusterProperties: {
      total: ["+", ["get", "total"]],
      nbPartenaires: ["+", ["get", "nbPartenaires"]],
      nbAgents: ["+", ["get", "nbAgents"]],
    },
  });
  map.addLayer({
    id: LAYER.reseauPoints,
    type: "circle",
    source: SOURCE.reseau,
    layout: { visibility: vis("reseau") },
    paint: {
      "circle-color": c.reseau,
      "circle-opacity": 0.92,
      "circle-radius": ["interpolate", ["linear"], ["get", "total"], 1, 10, 10, 15, 50, 22, 200, 30],
      "circle-stroke-width": 2.5,
      "circle-stroke-color": c.cityStroke,
    },
  });
  map.addLayer({
    id: LAYER.reseauCount,
    type: "symbol",
    source: SOURCE.reseau,
    layout: {
      visibility: vis("reseau"),
      "text-field": ["to-string", ["get", "total"]],
      "text-font": FONT_MEDIUM,
      "text-size": 11.5,
      "text-allow-overlap": true,
      "text-ignore-placement": true,
    },
    paint: { "text-color": "#ffffff" },
  });

  applyReseau(map, reseau);
}

/** Met à jour les pastilles du réseau et la teinte des régions (à rappeler après chaque changement de style). */
export function applyReseau(map: MlMap, reseau: ReseauAgrege | null) {
  map.getSource<GeoJSONSource>(SOURCE.reseau)?.setData(reseauToGeoJSON(reseau));
  if (!map.getSource(SOURCE.regions) || !map.getLayer(LAYER.reseauRegions)) return;
  map.removeFeatureState({ source: SOURCE.regions });
  let max = 0;
  for (const r of reseau?.regions ?? []) {
    if (r.id === "inconnue") continue;
    const total = r.nbPartenaires + r.nbAgents;
    map.setFeatureState({ source: SOURCE.regions, id: r.id }, { reseau: total });
    max = Math.max(max, total);
  }
  const n: ExpressionSpecification = ["coalesce", ["feature-state", "reseau"], 0];
  const teinte = (plafond: number): ExpressionSpecification => [
    "case",
    [">", n, 0],
    ["interpolate", ["linear"], n, 1, plafond / 4, Math.max(2, max), plafond],
    0,
  ];
  // Vue d'ensemble du pays : régions bien teintées ; à l'échelle d'une commune, la teinte s'efface
  // pour laisser lire le fond de carte (`zoom` doit rester au premier niveau de l'interpolation).
  map.setPaintProperty(
    LAYER.reseauRegions,
    "fill-opacity",
    max > 0 ? ["interpolate", ["linear"], ["zoom"], 7, teinte(0.42), 10, teinte(0.12), 12, teinte(0.04)] : 0,
  );
}

/** Met en avant un district (contour accentué, autres districts estompés). */
export function setDistrictFocus(map: MlMap, districtId: string | null, previous: string | null) {
  if (previous) map.setFeatureState({ source: SOURCE.districts, id: previous }, { active: false });
  if (districtId) map.setFeatureState({ source: SOURCE.districts, id: districtId }, { active: true });
  map.setPaintProperty(
    LAYER.districtsFill,
    "fill-opacity",
    districtId ? ["case", active, 0, 0.55] : 0,
  );
}

export function setGroupVisibility(map: MlMap, group: LayerGroup, visible: boolean) {
  for (const id of LAYER_GROUPS[group]) {
    if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", visible ? "visible" : "none");
  }
}
