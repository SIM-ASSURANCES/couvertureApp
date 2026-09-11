"use client";

import { ArrowUpRight, X } from "lucide-react";
import { useEffect } from "react";

import { useExplorer } from "@/components/explorer/ExplorerProvider";
import { ConfidenceBadge } from "@/components/ui/ConfidenceBadge";
import { InfoRow, NotAvailable } from "@/components/ui/primitives";
import { getDistrict, getRegion } from "@/lib/admin";
import { formatKm, formatNumber, PLACE_LABEL } from "@/lib/format";
import { cardinal, bearing, formatCoordinates, haversineKm } from "@/lib/geo";

/** Carte d'information minimale pour une localité OSM sans fiche détaillée. */
export function LocalityCard() {
  const { activeLocality: l, setActiveLocality, cityById, setSheetSnap } = useExplorer();

  useEffect(() => {
    if (!l) return;
    setSheetSnap("peek");
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setActiveLocality(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [l, setActiveLocality, setSheetSnap]);

  if (!l) return null;
  const district = getDistrict(l.district);
  const region = getRegion(l.region);
  const abidjan = cityById.get("abidjan");
  const km = abidjan ? haversineKm(abidjan.coordinates, l.coordinates) : null;
  const dir = abidjan ? cardinal(bearing(abidjan.coordinates, l.coordinates)) : null;

  return (
    <div
      role="dialog"
      aria-labelledby="locality-title"
      className="surface absolute inset-x-3 bottom-[12rem] z-30 rounded-2xl p-4 animate-rise md:inset-x-auto md:bottom-8 md:right-4 md:w-80"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="locality-title" className="text-lg font-semibold tracking-tight">
            {l.name}
          </h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">{PLACE_LABEL[l.place] ?? "Localité"} · OpenStreetMap</p>
        </div>
        <button
          type="button"
          onClick={() => setActiveLocality(null)}
          aria-label="Fermer"
          className="grid size-8 place-items-center rounded-full text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800"
        >
          <X className="size-4" />
        </button>
      </div>

      <dl className="mt-2">
        <InfoRow label="District" hint={district ? "Déduit des limites geoBoundaries" : undefined}>
          {district?.name ?? <NotAvailable />}
        </InfoRow>
        <InfoRow label="Région">{region?.name ?? <NotAvailable />}</InfoRow>
        <InfoRow
          label="Population"
          hint={l.population ? [l.populationSource ?? "Source non précisée", l.populationYear].filter(Boolean).join(" · ") : undefined}
        >
          {l.population ? `${formatNumber(l.population)} hab.` : <NotAvailable />}
        </InfoRow>
        {km != null && l.name !== "Abidjan" && (
          <InfoRow label="Depuis Abidjan" hint={<ConfidenceBadge level="computed" className="mt-1" />}>
            {formatKm(km)} au {dir}
          </InfoRow>
        )}
        <InfoRow label="Coordonnées">
          <span className="tabular-nums">{formatCoordinates(l.coordinates[1], l.coordinates[0], 3)}</span>
        </InfoRow>
      </dl>

      <p className="mt-3 rounded-xl bg-zinc-50 px-3 py-2 text-xs text-zinc-500 dark:bg-zinc-800/60 dark:text-zinc-400">
        Fiche détaillée pas encore disponible pour cette localité.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <a
          href={`https://www.openstreetmap.org/node/${l.osmId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-3 py-1.5 text-xs font-medium hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700"
        >
          OpenStreetMap <ArrowUpRight className="size-3" />
        </a>
        {l.wikidata && (
          <a
            href={`https://www.wikidata.org/wiki/${l.wikidata}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-3 py-1.5 text-xs font-medium hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700"
          >
            Wikidata <ArrowUpRight className="size-3" />
          </a>
        )}
      </div>
    </div>
  );
}
