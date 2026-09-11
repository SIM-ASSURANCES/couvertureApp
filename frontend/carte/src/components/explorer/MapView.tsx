"use client";

import maplibregl, { type GeoJSONSource, type PaddingOptions } from "maplibre-gl";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { useExplorer } from "@/components/explorer/ExplorerProvider";
import { COUNTRY_BBOX, districtBbox } from "@/lib/admin";
import { DESKTOP_QUERY, useLatest } from "@/lib/hooks";
import { CITY_ZOOM, MAP_STYLES, MAX_BOUNDS, MAX_ZOOM, MIN_ZOOM, type Theme } from "@/lib/map/config";
import { addAppLayers, applyReseau, LAYER, LAYER_GROUPS, SOURCE, setDistrictFocus, setGroupVisibility, type LayerGroup } from "@/lib/map/layers";
import type { LngLat, LocalityProps } from "@/lib/types";

const LOCALE = {
  "Map.Title": "Carte interactive de la Côte d'Ivoire",
  "AttributionControl.ToggleAttribution": "Afficher ou masquer les crédits",
  "ScaleControl.Meters": "m",
  "ScaleControl.Kilometers": "km",
};

type MarkerKind = "city" | "locality" | "reseau" | "user";

function createMarker(kind: MarkerKind) {
  const el = document.createElement("div");
  el.className = "selection-marker";
  el.dataset.kind = kind;
  return new maplibregl.Marker({ element: el });
}

export default function MapView() {
  const ctx = useExplorer();
  const router = useRouter();
  const state = useLatest(ctx);
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const userMarkerRef = useRef<maplibregl.Marker | null>(null);
  const themeRef = useRef<Theme>("light");
  const focusedDistrict = useRef<string | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  /** Marges de caméra : la carte se recentre dans la zone réellement visible (hors panneau). */
  const padding = useLatest((): PaddingOptions => {
    const { panelCollapsed, sheetSnap } = state.current;
    if (matchMedia(DESKTOP_QUERY).matches) {
      return { top: 90, bottom: 40, left: panelCollapsed ? 60 : 450, right: 80 };
    }
    const h = window.innerHeight;
    const sheet = sheetSnap === "peek" ? 190 : Math.round(h * 0.55);
    return { top: 130, bottom: Math.min(sheet, h - 240), left: 24, right: 24 };
  });

  // --- Initialisation (une seule fois) ---
  useEffect(() => {
    const s = state.current;
    const selected = s.selectedCityId ? s.cityById.get(s.selectedCityId) : undefined;
    themeRef.current = document.documentElement.classList.contains("dark") ? "dark" : "light";

    const map = new maplibregl.Map({
      container: containerRef.current!,
      style: MAP_STYLES[themeRef.current],
      ...(selected
        ? { center: selected.coordinates, zoom: CITY_ZOOM - 1 }
        : { bounds: COUNTRY_BBOX, fitBoundsOptions: { padding: padding.current() } }),
      maxBounds: MAX_BOUNDS,
      minZoom: MIN_ZOOM,
      maxZoom: MAX_ZOOM,
      attributionControl: false,
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
      locale: LOCALE,
    });
    mapRef.current = map;
    map.touchZoomRotate.disableRotation();
    map.keyboard.disableRotation();
    map.addControl(
      new maplibregl.AttributionControl({
        compact: true,
        customAttribution: '<a href="https://www.geoboundaries.org/" target="_blank" rel="noopener">geoBoundaries</a> (CC BY 4.0)',
      }),
      "bottom-right",
    );
    map.addControl(new maplibregl.ScaleControl({ unit: "metric", maxWidth: 96 }), "bottom-right");

    map.on("style.load", () => {
      const st = state.current;
      addAppLayers(map, { theme: themeRef.current, cities: st.cities, visibility: st.layers, reseau: st.reseauAgrege });
      focusedDistrict.current = null;
      if (st.districtFilter) {
        setDistrictFocus(map, st.districtFilter, null);
        focusedDistrict.current = st.districtFilter;
      }
    });
    map.once("load", () => setStatus("ready"));
    map.on("error", (e) => {
      console.warn("[carte]", e.error?.message ?? e);
      if (!map.isStyleLoaded() && !map.loaded()) setStatus((prev) => (prev === "loading" ? "error" : prev));
    });

    // --- Interactions ---
    // Les pastilles du réseau de distribution sont au premier plan : elles captent le clic.
    const surReseau = (point: maplibregl.PointLike) => map.queryRenderedFeatures(point, { layers: [LAYER.reseauPoints] }).length > 0;

    map.on("click", LAYER.cities, (e) => {
      const id = e.features?.[0]?.properties?.id as string | undefined;
      if (!id || surReseau(e.point)) return;
      state.current.setActiveLocality(null);
      router.push(`/ville/${id}`, { scroll: false });
    });

    map.on("click", LAYER.clusters, async (e) => {
      const feature = e.features?.[0];
      if (!feature || surReseau(e.point)) return;
      const source = map.getSource<GeoJSONSource>(SOURCE.localities);
      const zoom = await source?.getClusterExpansionZoom(feature.properties.cluster_id as number);
      map.easeTo({ center: (feature.geometry as GeoJSON.Point).coordinates as LngLat, zoom: (zoom ?? map.getZoom() + 2) + 0.2 });
    });

    map.on("click", LAYER.localities, (e) => {
      const feature = e.features?.[0];
      if (!feature || surReseau(e.point)) return;
      const props = feature.properties as LocalityProps;
      state.current.setActiveLocality({ ...props, coordinates: (feature.geometry as GeoJSON.Point).coordinates as LngLat });
    });

    map.on("click", LAYER.reseauPoints, async (e) => {
      const feature = e.features?.[0];
      if (!feature) return;
      const center = (feature.geometry as GeoJSON.Point).coordinates as LngLat;
      if (feature.properties.cluster) {
        const zoom = await map.getSource<GeoJSONSource>(SOURCE.reseau)?.getClusterExpansionZoom(feature.properties.cluster_id as number);
        map.easeTo({ center, zoom: (zoom ?? map.getZoom() + 2) + 0.2 });
        return;
      }
      state.current.setActiveLieu(feature.properties.key as string);
    });

    map.on("click", (e) => {
      const hits = map.queryRenderedFeatures(e.point, { layers: [LAYER.cities, LAYER.localities, LAYER.clusters, LAYER.reseauPoints] });
      if (!hits.length) {
        state.current.setActiveLocality(null);
        state.current.setActiveLieu(null);
      }
    });

    let hovered: { source: string; id: string | number } | null = null;
    const setHover = (next: typeof hovered) => {
      if (hovered && map.getSource(hovered.source)) map.setFeatureState(hovered, { hover: false });
      hovered = next;
      if (hovered) map.setFeatureState(hovered, { hover: true });
    };
    for (const layer of [LAYER.cities, LAYER.localities]) {
      map.on("mousemove", layer, (e) => {
        const f = e.features?.[0];
        if (!f || f.id == null) return;
        map.getCanvas().style.cursor = "pointer";
        if (hovered?.id === f.id) return;
        setHover({ source: f.source, id: f.id });
        if (layer === LAYER.cities) router.prefetch(`/ville/${f.properties.id}`);
      });
      map.on("mouseleave", layer, () => {
        map.getCanvas().style.cursor = "";
        setHover(null);
      });
    }
    map.on("mouseenter", LAYER.clusters, () => (map.getCanvas().style.cursor = "pointer"));
    map.on("mouseleave", LAYER.clusters, () => (map.getCanvas().style.cursor = ""));
    map.on("mouseenter", LAYER.reseauPoints, () => (map.getCanvas().style.cursor = "pointer"));
    map.on("mouseleave", LAYER.reseauPoints, () => (map.getCanvas().style.cursor = ""));

    s.setMapApi({
      flyTo: (center, zoom = CITY_ZOOM) => map.flyTo({ center, zoom, padding: padding.current(), speed: 1.4 }),
      fitBounds: (bbox) => map.fitBounds(bbox, { padding: padding.current(), duration: 900, maxZoom: 9 }),
      resetView: () => map.fitBounds(COUNTRY_BBOX, { padding: padding.current(), duration: 900 }),
      zoomIn: () => map.zoomIn(),
      zoomOut: () => map.zoomOut(),
      showUserPosition: (center) => {
        userMarkerRef.current ??= createMarker("user");
        userMarkerRef.current.setLngLat(center).addTo(map);
        map.flyTo({ center, zoom: 11, padding: padding.current() });
      },
    });

    return () => {
      state.current.setMapApi(null);
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
      userMarkerRef.current = null;
    };
    // Initialisation unique : l'état courant est lu via des références.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Thème : changement de fond de carte (les couches sont rajoutées sur « style.load ») ---
  useEffect(() => {
    const map = mapRef.current;
    if (!map || themeRef.current === ctx.theme) return;
    themeRef.current = ctx.theme;
    map.setStyle(MAP_STYLES[ctx.theme], { diff: false });
  }, [ctx.theme]);

  // --- Ville sélectionnée : recentrage animé ---
  const selected = ctx.selectedCityId ? ctx.cityById.get(ctx.selectedCityId) : undefined;
  useEffect(() => {
    if (selected) mapRef.current?.flyTo({ center: selected.coordinates, zoom: CITY_ZOOM, padding: padding.current(), speed: 1.4 });
  }, [selected, padding]);

  // --- Marqueur de sélection (ville, localité ou lieu du réseau) ---
  const lieuActif = ctx.activeLieu ? ctx.reseauAgrege?.lieux.find((l) => l.lieu.key === ctx.activeLieu) : undefined;
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const target = ctx.activeLocality
      ? { kind: "locality" as const, coordinates: ctx.activeLocality.coordinates }
      : lieuActif
        ? { kind: "reseau" as const, coordinates: lieuActif.lieu.coordinates }
        : selected
          ? { kind: "city" as const, coordinates: selected.coordinates }
          : null;
    if (!target) {
      markerRef.current?.remove();
      return;
    }
    markerRef.current ??= createMarker(target.kind);
    markerRef.current.getElement().dataset.kind = target.kind;
    markerRef.current.setLngLat(target.coordinates).addTo(map);
  }, [ctx.activeLocality, lieuActif, selected]);

  // --- Réseau de distribution (transmis par l'espace admin) ---
  useEffect(() => {
    const map = mapRef.current;
    if (map?.getSource(SOURCE.reseau)) applyReseau(map, ctx.reseauAgrege);
  }, [ctx.reseauAgrege]);

  // --- Filtre par district : mise en avant et cadrage ---
  useEffect(() => {
    const map = mapRef.current;
    if (!map || focusedDistrict.current === ctx.districtFilter) return;
    if (map.getLayer(LAYER.districtsFill)) {
      setDistrictFocus(map, ctx.districtFilter, focusedDistrict.current);
      focusedDistrict.current = ctx.districtFilter;
    }
    const bbox = ctx.districtFilter ? districtBbox(ctx.districtFilter) : null;
    if (bbox) map.fitBounds(bbox, { padding: padding.current(), duration: 900, maxZoom: 9 });
    else if (!state.current.selectedCityId) map.fitBounds(COUNTRY_BBOX, { padding: padding.current(), duration: 900 });
  }, [ctx.districtFilter, padding, state]);

  // --- Visibilité des groupes de couches ---
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    for (const group of Object.keys(LAYER_GROUPS) as LayerGroup[]) setGroupVisibility(map, group, ctx.layers[group]);
  }, [ctx.layers]);

  return (
    <div className="absolute inset-0">
      <div ref={containerRef} className="size-full" role="region" aria-label="Carte interactive de la Côte d'Ivoire" />
      {status !== "ready" && (
        <div
          aria-live="polite"
          className="pointer-events-none absolute inset-0 grid place-items-center bg-zinc-100/60 text-sm text-zinc-500 backdrop-blur-[1px] dark:bg-zinc-950/60 dark:text-zinc-400"
        >
          {status === "loading" ? (
            <span className="flex items-center gap-2">
              <span className="size-2 animate-ping rounded-full bg-accent-500" />
              Chargement de la carte…
            </span>
          ) : (
            <span className="max-w-xs rounded-xl bg-white px-4 py-3 text-center shadow dark:bg-zinc-900">
              Le fond de carte n&apos;a pas pu être chargé. Vérifiez votre connexion puis rechargez la page.
            </span>
          )}
        </div>
      )}
    </div>
  );
}
