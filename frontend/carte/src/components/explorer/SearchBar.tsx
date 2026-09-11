"use client";

import { Loader2, MapPin, Search, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";

import { useExplorer } from "@/components/explorer/ExplorerProvider";
import { BrandLogo, BrandMotif } from "@/components/ui/BrandLogo";
import { getDistrict } from "@/lib/admin";
import { cn } from "@/lib/cn";
import { formatCompact } from "@/lib/format";
import { isTypingTarget } from "@/lib/hooks";
import { normalize, search, type SearchEntry } from "@/lib/search";
import type { Locality } from "@/lib/types";

/** En-tête flottant : bandeau de marque SIM Assurances + recherche instantanée (combobox accessible). */
export function SearchBar() {
  const { cities, ensureLocalities, mapApi, setActiveLocality, setSheetSnap } = useExplorer();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [localities, setLocalities] = useState<Locality[] | null>(null);
  const [loadError, setLoadError] = useState(false);

  const entries = useMemo<SearchEntry[]>(() => {
    const detailed = new Set(cities.map((c) => c.osmId));
    return [
      ...cities.map((c) => ({
        key: `c-${c.id}`,
        id: c.id,
        name: c.name,
        kind: "city" as const,
        coordinates: c.coordinates,
        district: c.districtName,
        population: c.population?.value,
        norm: normalize(c.name),
      })),
      ...(localities ?? [])
        .filter((l) => !detailed.has(l.osmId))
        .map((l) => ({
          key: `l-${l.id}`,
          id: l.id,
          name: l.name,
          kind: "locality" as const,
          coordinates: l.coordinates,
          district: getDistrict(l.district)?.name,
          population: l.population,
          norm: normalize(l.name),
        })),
    ];
  }, [cities, localities]);

  const results = query.trim() ? search(entries, query, 8) : entries.filter((e) => e.kind === "city").slice(0, 5);

  const loadLocalities = () => {
    if (localities || loadError) return;
    ensureLocalities().then(setLocalities, () => setLoadError(true));
  };

  // Raccourcis : « / » ou Ctrl/⌘+K pour rechercher.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === "/" && !isTypingTarget(e.target)) || (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey))) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const select = (entry: SearchEntry) => {
    setOpen(false);
    setQuery("");
    inputRef.current?.blur();
    if (entry.kind === "city") {
      router.push(`/ville/${entry.id}`, { scroll: false });
      return;
    }
    const loc = localities?.find((l) => l.id === entry.id);
    if (loc) {
      setActiveLocality(loc);
      setSheetSnap("peek");
      mapApi?.flyTo(loc.coordinates, 11);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      setOpen(true);
      setActiveIndex((i) => Math.min(results.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      setActiveIndex((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter" && open && results[activeIndex]) {
      select(results[activeIndex]!);
    } else if (e.key === "Escape") {
      if (query) setQuery("");
      else inputRef.current?.blur();
      setOpen(false);
    } else return;
    e.preventDefault();
  };

  const showList = open && (results.length > 0 || query.trim().length > 0);
  const optionId = (i: number) => `${listId}-opt-${i}`;

  return (
    <div className="pointer-events-auto relative w-full md:w-[400px]">
      <div className="surface overflow-hidden rounded-2xl">
        {/* Bandeau de marque : dégradé de la charte + logo blanc (espace protégé ≥ hauteur du « S »). */}
        <div className="brand-band relative flex h-12 items-center justify-between overflow-hidden px-4 md:h-[3.25rem]">
          <Link href="/" className="relative z-10 rounded-sm" aria-label="SIM Assurances — retour à la carte">
            <BrandLogo variant="white" height={24} />
          </Link>
          <span className="relative z-10 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/85">Carte interactive</span>
          <BrandMotif className="absolute -right-3 -top-5 h-24 w-auto opacity-[0.12]" />
        </div>
        <div className="flex h-12 items-center gap-2 pl-4 pr-1.5">
        <Search aria-hidden className="size-4 shrink-0 text-zinc-400" />
        <input
          ref={inputRef}
          type="search"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList && results[activeIndex] ? optionId(activeIndex) : undefined}
          aria-label="Rechercher une ville"
          placeholder="Rechercher une ville…"
          autoComplete="off"
          spellCheck={false}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActiveIndex(0);
            setOpen(true);
          }}
          onFocus={() => {
            setOpen(true);
            loadLocalities();
          }}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={onKeyDown}
          className="h-full min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-zinc-400 [&::-webkit-search-cancel-button]:hidden"
        />
        {query ? (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              inputRef.current?.focus();
            }}
            aria-label="Effacer la recherche"
            className="grid size-9 place-items-center rounded-xl text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800"
          >
            <X className="size-4" />
          </button>
        ) : (
          <kbd className="mr-1.5 hidden rounded-md border border-zinc-200 px-1.5 py-0.5 text-[11px] text-zinc-400 md:inline dark:border-zinc-700">/</kbd>
        )}
        </div>
      </div>

      {showList && (
        <div className="surface absolute inset-x-0 top-[calc(100%+0.5rem)] z-40 overflow-hidden rounded-2xl animate-rise">
          {!query.trim() && <p className="px-4 pb-1 pt-3 text-xs font-medium uppercase tracking-wide text-zinc-400">Villes principales</p>}
          <ul id={listId} role="listbox" aria-label="Résultats de recherche" className="max-h-[60dvh] overflow-y-auto p-1.5">
            {results.map((r, i) => (
              <li
                key={r.key}
                id={optionId(i)}
                role="option"
                aria-selected={i === activeIndex}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => select(r)}
                onMouseEnter={() => setActiveIndex(i)}
                className={cn(
                  "flex cursor-pointer items-center gap-3 rounded-xl px-2.5 py-2",
                  i === activeIndex && "bg-zinc-100 dark:bg-zinc-800",
                )}
              >
                <span
                  className={cn(
                    "grid size-8 shrink-0 place-items-center rounded-full",
                    r.kind === "city"
                      ? "bg-accent-50 text-accent-600 dark:bg-accent-500/15 dark:text-accent-400"
                      : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400",
                  )}
                >
                  <MapPin aria-hidden className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{r.name}</span>
                  <span className="block truncate text-xs text-zinc-500 dark:text-zinc-400">
                    {r.kind === "city" ? "Fiche détaillée" : "Localité OSM"}
                    {r.district && ` · ${r.district}`}
                  </span>
                </span>
                {r.population && <span className="shrink-0 text-xs tabular-nums text-zinc-400">{formatCompact(r.population)} hab.</span>}
              </li>
            ))}
          </ul>
          {query.trim() && results.length === 0 && (
            <p className="px-4 pb-4 pt-1 text-sm text-zinc-500">
              Aucune ville trouvée pour « {query.trim()} ».
            </p>
          )}
          {query.trim() && !localities && !loadError && (
            <p className="flex items-center gap-2 border-t border-zinc-100 px-4 py-2 text-xs text-zinc-400 dark:border-zinc-800">
              <Loader2 className="size-3 animate-spin" /> Chargement des localités…
            </p>
          )}
        </div>
      )}
    </div>
  );
}
