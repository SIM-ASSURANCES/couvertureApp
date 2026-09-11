"use client";

import { ChevronRight, MapPin } from "lucide-react";
import Link from "next/link";

import { useExplorer } from "@/components/explorer/ExplorerProvider";
import { ReseauPanel } from "@/components/panel/ReseauPanel";
import { BrandLogo } from "@/components/ui/BrandLogo";
import { ConfidenceBadge } from "@/components/ui/ConfidenceBadge";
import { COUNTRY_KEY_FACTS } from "@/data/country";
import { SITE } from "@/lib/site";
import { DISTRICTS, getDistrict } from "@/lib/admin";
import { formatCompact, formatKm } from "@/lib/format";

const LEGEND = [
  { swatch: "size-3 rounded-full bg-accent-700 ring-2 ring-white dark:bg-accent-400 dark:ring-zinc-900", label: "Ville avec fiche détaillée" },
  { swatch: "size-2.5 rounded-full bg-zinc-600 ring-2 ring-white dark:bg-zinc-400 dark:ring-zinc-900", label: "Localité (OpenStreetMap)" },
  { swatch: "grid size-4 place-items-center rounded-full bg-zinc-600 text-[8px] text-white dark:bg-zinc-400", label: "Groupe de localités — cliquer pour zoomer" },
  { swatch: "h-0.5 w-4 bg-zinc-400", label: "Limite de district" },
];

const RESEAU_LEGEND = [
  {
    swatch: "grid size-4 place-items-center rounded-full bg-orange-600 text-[8px] font-semibold text-white ring-2 ring-white dark:ring-zinc-900",
    label: "Réseau : partenaires + sous-agents (nombre) — cliquer pour le détail",
  },
  { swatch: "size-3.5 rounded-sm bg-orange-500/35", label: "Région teintée selon la taille du réseau" },
];

/** Panneau d'accueil : chiffres clés, filtre par district, liste des fiches. */
export function HomePanel() {
  const { cities, districtFilter, setDistrictFilter, reseau } = useExplorer();
  const legend = reseau ? [...RESEAU_LEGEND, ...LEGEND] : LEGEND;
  const list = districtFilter ? cities.filter((c) => c.district === districtFilter) : cities;
  const district = getDistrict(districtFilter);

  return (
    <div className="px-5 pb-10 pt-1 md:pt-5">
      <p className="text-xs font-semibold uppercase tracking-wider text-accent-700 dark:text-accent-400">Carte interactive</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">Explorer la Côte d&apos;Ivoire</h1>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Touchez une ville sur la carte ou recherchez-la pour ouvrir sa fiche.</p>

      <ReseauPanel />

      <dl className="mt-5 grid grid-cols-2 gap-2">
        {COUNTRY_KEY_FACTS.map((f) => (
          <div key={f.label} className="rounded-2xl bg-zinc-50 p-3 ring-1 ring-zinc-900/5 dark:bg-zinc-800/50 dark:ring-white/5">
            <dt className="flex items-center justify-between gap-1 text-xs text-zinc-500 dark:text-zinc-400">
              {f.label}
              <ConfidenceBadge level={f.confidence} compact />
            </dt>
            <dd className="mt-1 text-lg font-semibold tabular-nums tracking-tight">{f.value}</dd>
            {f.hint && <dd className="text-[11px] leading-snug text-zinc-500 dark:text-zinc-400">{f.hint}</dd>}
          </div>
        ))}
      </dl>

      <section className="mt-7" aria-labelledby="cities-heading">
        <div className="flex items-center justify-between gap-3">
          <h2 id="cities-heading" className="text-sm font-semibold">
            Fiches villes <span className="font-normal text-zinc-400">({list.length})</span>
          </h2>
          <label className="sr-only" htmlFor="district-filter">
            Filtrer par district
          </label>
          <select
            id="district-filter"
            value={districtFilter ?? ""}
            onChange={(e) => setDistrictFilter(e.target.value || null)}
            className="h-9 max-w-[55%] rounded-xl border-0 bg-zinc-100 px-3 text-sm ring-1 ring-zinc-900/5 dark:bg-zinc-800 dark:ring-white/10"
          >
            <option value="">Tous les districts</option>
            {DISTRICTS.map((d) => (
              <option key={d.id} value={d.id}>
                {d.autonomous ? `${d.name} (autonome)` : d.name}
              </option>
            ))}
          </select>
        </div>

        {list.length > 0 ? (
          <ul className="mt-3 space-y-1">
            {list.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/ville/${c.id}`}
                  scroll={false}
                  className="group flex items-center gap-3 rounded-2xl p-2.5 transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/60"
                >
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-50 text-accent-600 dark:bg-accent-500/15 dark:text-accent-400">
                    <MapPin className="size-5" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{c.name}</span>
                    <span className="block truncate text-xs text-zinc-500 dark:text-zinc-400">
                      {c.regionName ?? "District autonome"} · {c.districtName}
                    </span>
                  </span>
                  <span className="shrink-0 text-right text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
                    {c.population && <span className="block font-medium text-zinc-700 dark:text-zinc-200">{formatCompact(c.population.value)} hab.</span>}
                    {c.roadKm != null && <span className="block">{formatKm(c.roadKm)} d&apos;Abidjan</span>}
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-zinc-300 transition-transform group-hover:translate-x-0.5 dark:text-zinc-600" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 rounded-2xl bg-zinc-50 p-4 text-sm text-zinc-500 dark:bg-zinc-800/50 dark:text-zinc-400">
            Aucune fiche détaillée pour le {district?.fullName.replace(/^D/, "d") ?? "district"} pour l&apos;instant. Ses localités restent
            consultables sur la carte.
          </p>
        )}
      </section>

      <section className="mt-7" aria-labelledby="legend-heading">
        <h2 id="legend-heading" className="text-sm font-semibold">
          Légende
        </h2>
        <ul className="mt-3 space-y-2">
          {legend.map((l) => (
            <li key={l.label} className="flex items-center gap-3 text-sm text-zinc-600 dark:text-zinc-300">
              <span className="grid w-5 place-items-center">
                <span className={l.swatch} />
              </span>
              {l.label}
            </li>
          ))}
        </ul>
      </section>

      <p className="mt-7 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
        Données : INS (RGPH 2021), OpenStreetMap, geoBoundaries, Wikidata, OSRM. Les contenus marqués{" "}
        <ConfidenceBadge level="to-verify" /> sont des textes de démonstration à valider auprès des sources officielles.
      </p>

      <footer className="mt-8 border-t border-zinc-900/5 pt-6 dark:border-white/10">
        {/* Espace protégé du logo respecté par les marges (≥ hauteur du « S »). */}
        <div className="py-3">
          <BrandLogo height={26} />
        </div>
        <p className="mt-2 text-sm font-semibold text-accent-700 dark:text-accent-400">{SITE.publisher.slogan}</p>
        <a
          href={SITE.publisher.url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1 inline-block text-xs text-zinc-500 underline-offset-2 hover:text-accent-700 hover:underline dark:text-zinc-400 dark:hover:text-accent-400"
        >
          {SITE.publisher.url.replace(/^https?:\/\//, "")}
        </a>
      </footer>
    </div>
  );
}
