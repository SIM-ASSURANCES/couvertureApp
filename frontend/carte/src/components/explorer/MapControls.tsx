"use client";

import { Layers, LocateFixed, Maximize, Minus, Moon, Plus, Sun } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { useExplorer } from "@/components/explorer/ExplorerProvider";
import { cn } from "@/lib/cn";
import { MAX_BOUNDS } from "@/lib/map/config";
import type { LayerGroup } from "@/lib/map/layers";

function ControlButton({ label, onClick, children, pressed }: { label: string; onClick(): void; children: React.ReactNode; pressed?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      className="grid size-10 place-items-center text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900 active:scale-95 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-white"
    >
      {children}
    </button>
  );
}

const LAYER_LABELS: Record<LayerGroup, string> = {
  localities: "Localités (OpenStreetMap)",
  boundaries: "Limites des districts et régions",
};

/** Contrôles de navigation : zoom, vue d'ensemble, géolocalisation, calques et thème. */
export function MapControls() {
  const { mapApi, theme, toggleTheme, layers, toggleLayer } = useExplorer();
  const [layersOpen, setLayersOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(null), 4000);
    return () => clearTimeout(t);
  }, [message]);

  useEffect(() => {
    if (!layersOpen) return;
    const close = (e: PointerEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !menuRef.current?.contains(e.target as Node)) setLayersOpen(false);
    };
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", close);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", close);
    };
  }, [layersOpen]);

  const locate = () => {
    if (!("geolocation" in navigator)) return setMessage("Géolocalisation non disponible sur cet appareil.");
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setLocating(false);
        const [w, s, e, n] = MAX_BOUNDS;
        if (coords.longitude < w || coords.longitude > e || coords.latitude < s || coords.latitude > n) {
          setMessage("Votre position se trouve hors de la zone couverte par la carte.");
          return;
        }
        mapApi?.showUserPosition([coords.longitude, coords.latitude]);
      },
      () => {
        setLocating(false);
        setMessage("Position indisponible (autorisation refusée ou signal insuffisant).");
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
    );
  };

  return (
    <div className="pointer-events-none absolute right-3 top-[7.5rem] z-10 flex flex-col items-end gap-2 md:right-4 md:top-4">
      <div className="surface pointer-events-auto flex flex-col divide-y divide-zinc-100 overflow-hidden rounded-2xl dark:divide-zinc-800">
        <ControlButton label="Zoom avant" onClick={() => mapApi?.zoomIn()}>
          <Plus className="size-[18px]" />
        </ControlButton>
        <ControlButton label="Zoom arrière" onClick={() => mapApi?.zoomOut()}>
          <Minus className="size-[18px]" />
        </ControlButton>
        <ControlButton label="Vue d'ensemble du pays" onClick={() => mapApi?.resetView()}>
          <Maximize className="size-4" />
        </ControlButton>
        <ControlButton label="Me localiser" onClick={locate}>
          <LocateFixed className={cn("size-4", locating && "animate-pulse text-accent-600")} />
        </ControlButton>
      </div>

      <div className="surface pointer-events-auto relative flex flex-col divide-y divide-zinc-100 rounded-2xl dark:divide-zinc-800" ref={menuRef}>
        <ControlButton label="Calques de la carte" onClick={() => setLayersOpen((o) => !o)} pressed={layersOpen}>
          <Layers className="size-4" />
        </ControlButton>
        <ControlButton label={theme === "dark" ? "Passer en mode clair" : "Passer en mode sombre"} onClick={toggleTheme}>
          {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
        </ControlButton>

        {layersOpen && (
          <fieldset className="surface absolute right-[calc(100%+0.5rem)] top-0 w-64 rounded-2xl p-3 animate-fade-in">
            <legend className="sr-only">Calques affichés</legend>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">Calques</p>
            {(Object.keys(LAYER_LABELS) as LayerGroup[]).map((g) => (
              <label key={g} className="flex cursor-pointer items-center justify-between gap-3 rounded-lg px-1 py-2 text-sm">
                {LAYER_LABELS[g]}
                <input
                  type="checkbox"
                  checked={layers[g]}
                  onChange={() => toggleLayer(g)}
                  className="size-4 accent-[var(--color-accent-600)]"
                />
              </label>
            ))}
          </fieldset>
        )}
      </div>

      {message && (
        <p role="status" className="surface pointer-events-auto max-w-[16rem] rounded-xl px-3 py-2 text-xs text-zinc-700 animate-fade-in dark:text-zinc-200">
          {message}
        </p>
      )}
    </div>
  );
}
