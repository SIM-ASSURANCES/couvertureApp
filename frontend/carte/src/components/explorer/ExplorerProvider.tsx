"use client";

import { useParams } from "next/navigation";
import { createContext, use, useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";

import type { LayerGroup } from "@/lib/map/layers";
import { DATA_URLS, type Theme } from "@/lib/map/config";
import type { BBox, CitySummary, LngLat, Locality, LocalityProps } from "@/lib/types";

/** API impérative exposée par la carte au reste de l'interface. */
export interface MapApi {
  flyTo(coordinates: LngLat, zoom?: number): void;
  fitBounds(bbox: BBox): void;
  resetView(): void;
  zoomIn(): void;
  zoomOut(): void;
  showUserPosition(coordinates: LngLat): void;
}

export type SheetSnap = "peek" | "half" | "full";

interface ExplorerContextValue {
  cities: CitySummary[];
  cityById: Map<string, CitySummary>;
  selectedCityId: string | null;
  districtFilter: string | null;
  setDistrictFilter(id: string | null): void;
  activeLocality: Locality | null;
  setActiveLocality(l: Locality | null): void;
  mapApi: MapApi | null;
  setMapApi(api: MapApi | null): void;
  sheetSnap: SheetSnap;
  setSheetSnap(s: SheetSnap): void;
  panelCollapsed: boolean;
  setPanelCollapsed(v: boolean): void;
  layers: Record<LayerGroup, boolean>;
  toggleLayer(group: LayerGroup): void;
  theme: Theme;
  toggleTheme(): void;
  ensureLocalities(): Promise<Locality[]>;
}

const ExplorerContext = createContext<ExplorerContextValue | null>(null);

export function useExplorer() {
  const ctx = use(ExplorerContext);
  if (!ctx) throw new Error("useExplorer doit être utilisé dans <ExplorerProvider>");
  return ctx;
}

// --- Thème : la classe `dark` sur <html> est la source de vérité ---
function subscribeTheme(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  const media = matchMedia("(prefers-color-scheme: dark)");
  const onSystem = () => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem("theme");
    } catch {}
    if (!stored) document.documentElement.classList.toggle("dark", media.matches);
  };
  media.addEventListener("change", onSystem);
  return () => {
    observer.disconnect();
    media.removeEventListener("change", onSystem);
  };
}
const getTheme = (): Theme => (document.documentElement.classList.contains("dark") ? "dark" : "light");
const getServerTheme = (): Theme => "light";

// --- Localités : chargées à la demande (recherche, carte les charge elle-même) ---
let localitiesPromise: Promise<Locality[]> | null = null;
function fetchLocalities(): Promise<Locality[]> {
  localitiesPromise ??= fetch(DATA_URLS.localities)
    .then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json() as Promise<GeoJSON.FeatureCollection<GeoJSON.Point, LocalityProps>>;
    })
    .then((fc) => fc.features.map((f) => ({ ...f.properties, coordinates: f.geometry.coordinates as LngLat })))
    .catch((err) => {
      localitiesPromise = null;
      throw err;
    });
  return localitiesPromise;
}

export function ExplorerProvider({ cities, children }: { cities: CitySummary[]; children: React.ReactNode }) {
  const params = useParams<{ id?: string }>();
  const selectedCityId = typeof params?.id === "string" ? params.id : null;

  const cityById = useMemo(() => new Map(cities.map((c) => [c.id, c])), [cities]);
  const [districtFilter, setDistrictFilter] = useState<string | null>(null);
  const [activeLocality, setActiveLocality] = useState<Locality | null>(null);
  const [mapApi, setMapApi] = useState<MapApi | null>(null);
  const [sheetSnap, setSheetSnap] = useState<SheetSnap>(selectedCityId ? "half" : "peek");
  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const [layers, setLayers] = useState<Record<LayerGroup, boolean>>({ localities: true, boundaries: true });
  const theme = useSyncExternalStore(subscribeTheme, getTheme, getServerTheme);

  // Ouverture d'une fiche : panneau visible, localité éventuelle refermée.
  const [lastSelected, setLastSelected] = useState(selectedCityId);
  if (lastSelected !== selectedCityId) {
    setLastSelected(selectedCityId);
    setSheetSnap(selectedCityId ? "half" : "peek");
    if (selectedCityId) {
      setActiveLocality(null);
      setPanelCollapsed(false);
    }
  }

  const toggleTheme = useCallback(() => {
    const next: Theme = getTheme() === "dark" ? "light" : "dark";
    document.documentElement.classList.toggle("dark", next === "dark");
    try {
      localStorage.setItem("theme", next);
    } catch {}
  }, []);

  const toggleLayer = useCallback((group: LayerGroup) => setLayers((l) => ({ ...l, [group]: !l[group] })), []);

  useEffect(() => {
    document.documentElement.style.colorScheme = theme;
  }, [theme]);

  const value = useMemo<ExplorerContextValue>(
    () => ({
      cities,
      cityById,
      selectedCityId,
      districtFilter,
      setDistrictFilter,
      activeLocality,
      setActiveLocality,
      mapApi,
      setMapApi,
      sheetSnap,
      setSheetSnap,
      panelCollapsed,
      setPanelCollapsed,
      layers,
      toggleLayer,
      theme,
      toggleTheme,
      ensureLocalities: fetchLocalities,
    }),
    [cities, cityById, selectedCityId, districtFilter, activeLocality, mapApi, sheetSnap, panelCollapsed, layers, toggleLayer, theme, toggleTheme],
  );

  return <ExplorerContext value={value}>{children}</ExplorerContext>;
}
