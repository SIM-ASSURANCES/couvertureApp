"use client";

import { ChevronDown, Loader2, MapPin } from "lucide-react";
import { useState } from "react";

import { useExplorer } from "@/components/explorer/ExplorerProvider";
import { cn } from "@/lib/cn";
import { bboxLieux, pluriel, type LieuReseau } from "@/lib/reseau";

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl bg-white/80 p-2.5 ring-1 ring-zinc-900/5 dark:bg-zinc-900/60 dark:ring-white/5">
      <dt className="text-[11px] text-zinc-500 dark:text-zinc-400">{label}</dt>
      <dd className="text-lg font-semibold tabular-nums tracking-tight">{value}</dd>
      {hint && <dd className="text-[10px] leading-snug text-zinc-500 dark:text-zinc-400">{hint}</dd>}
    </div>
  );
}

const effectifs = (x: { nbPartenaires: number; nbAgents: number }) => `${x.nbPartenaires} P · ${x.nbAgents} SA`;

/** Réseau de distribution (espace admin) : totaux, classement par région et lieux, partenaires non localisés. */
export function ReseauPanel() {
  const { reseau, reseauAgrege: agg, inclureInactifs, setInclureInactifs, mapApi, setActiveLieu, layers, toggleLayer } = useExplorer();
  const [regionOuverte, setRegionOuverte] = useState<string | null>(null);

  if (!reseau) return null;

  const montrerCalque = () => {
    if (!layers.reseau) toggleLayer("reseau");
  };
  const ouvrirLieu = (lr: LieuReseau) => {
    montrerCalque();
    setActiveLieu(lr.lieu.key);
    mapApi?.flyTo(lr.lieu.coordinates, lr.lieu.commune ? 12 : 11);
  };
  const ouvrirRegion = (id: string, lieux: LieuReseau[]) => {
    const suivante = regionOuverte === id ? null : id;
    setRegionOuverte(suivante);
    if (!suivante) return;
    montrerCalque();
    const bbox = bboxLieux(lieux);
    if (bbox) mapApi?.fitBounds(bbox);
    else if (lieux[0]) mapApi?.flyTo(lieux[0].lieu.coordinates, 10);
  };

  return (
    <section
      aria-labelledby="reseau-heading"
      className="mt-5 rounded-2xl bg-orange-50/70 p-4 ring-1 ring-orange-900/10 dark:bg-orange-500/10 dark:ring-orange-300/15"
    >
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="reseau-heading" className="text-sm font-semibold">
          Réseau de distribution
        </h2>
        <span className="text-[11px] text-zinc-500 dark:text-zinc-400">Accidents &amp; Dommages</span>
      </div>

      {!agg ? (
        <p className="mt-3 flex items-center gap-2 text-sm text-zinc-500">
          <Loader2 className="size-4 animate-spin" /> Placement des partenaires…
        </p>
      ) : (
        <>
          <dl className="mt-3 grid grid-cols-3 gap-2">
            <Stat label="Partenaires" value={String(agg.totaux.partenaires)} />
            <Stat label="Sous-agents" value={String(agg.totaux.agents)} />
            <Stat
              label="Localisés"
              value={agg.totaux.partenaires ? `${Math.round((agg.totaux.partenairesLocalises / agg.totaux.partenaires) * 100)} %` : "—"}
              hint={`${agg.totaux.partenairesLocalises}/${agg.totaux.partenaires} partenaires`}
            />
          </dl>

          <label className="mt-3 flex cursor-pointer items-center gap-2 text-xs text-zinc-600 dark:text-zinc-300">
            <input type="checkbox" checked={inclureInactifs} onChange={(e) => setInclureInactifs(e.target.checked)} className="size-3.5 accent-orange-600" />
            Inclure les partenaires et sous-agents inactifs
          </label>

          <h3 className="mt-4 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Par région</h3>
          {agg.regions.length === 0 ? (
            <p className="mt-2 text-sm text-zinc-500">Aucun partenaire localisé pour l&apos;instant.</p>
          ) : (
            <ul className="mt-2 space-y-0.5">
              {agg.regions.map((r) => {
                const max = Math.max(1, ...agg.regions.map((x) => x.nbPartenaires + x.nbAgents));
                const open = regionOuverte === r.id;
                return (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => ouvrirRegion(r.id, r.lieux)}
                      aria-expanded={open}
                      className="w-full rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-white/80 dark:hover:bg-zinc-800/60"
                    >
                      <span className="flex items-center justify-between gap-2 text-sm">
                        <span className="min-w-0 truncate font-medium">{r.name}</span>
                        <span className="flex shrink-0 items-center gap-1 text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
                          {effectifs(r)}
                          <ChevronDown aria-hidden className={cn("size-3.5 transition-transform", open && "rotate-180")} />
                        </span>
                      </span>
                      <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-orange-900/10 dark:bg-white/10">
                        <span className="block h-full rounded-full bg-orange-500" style={{ width: `${((r.nbPartenaires + r.nbAgents) / max) * 100}%` }} />
                      </span>
                    </button>
                    {open && (
                      <ul className="mb-1 ml-3 mt-1 space-y-0.5 border-l border-orange-900/15 pl-2 dark:border-orange-300/20">
                        {r.lieux.map((lr) => (
                          <li key={lr.lieu.key}>
                            <button
                              type="button"
                              onClick={() => ouvrirLieu(lr)}
                              className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1 text-left text-sm hover:bg-white/80 dark:hover:bg-zinc-800/60"
                            >
                              <span className="flex min-w-0 items-center gap-1.5">
                                <MapPin aria-hidden className="size-3.5 shrink-0 text-orange-600 dark:text-orange-400" />
                                <span className="truncate">{lr.lieu.name}</span>
                              </span>
                              <span className="shrink-0 text-xs tabular-nums text-zinc-500 dark:text-zinc-400">{effectifs(lr)}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          <p className="mt-2 text-[11px] leading-snug text-zinc-500 dark:text-zinc-400">
            P : partenaires · SA : sous-agents. Positions déduites de la localisation saisie (ville ou commune) ; un sous-agent sans localisation
            reconnue est compté chez son partenaire.
          </p>

          {agg.nonLocalises.length > 0 && (
            <details className="mt-3 rounded-xl bg-white/70 p-3 ring-1 ring-zinc-900/5 dark:bg-zinc-900/50 dark:ring-white/5">
              <summary className="cursor-pointer text-xs font-semibold text-zinc-700 dark:text-zinc-200">
                Non localisés : {pluriel(agg.nonLocalises.length, "partenaire")}
              </summary>
              <ul className="mt-2 space-y-1.5">
                {agg.nonLocalises.map(({ partenaire: p, agents }) => (
                  <li key={p.id} className="text-xs">
                    <span className="font-medium">{p.nomCommerce}</span>
                    <span className="text-zinc-500 dark:text-zinc-400">
                      {" "}
                      — {p.localisation ? `« ${p.localisation} » non reconnu` : "localisation non renseignée"}
                      {agents.length > 0 && ` · ${pluriel(agents.length, "sous-agent")} non placé${agents.length > 1 ? "s" : ""}`}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[11px] text-zinc-500 dark:text-zinc-400">
                À corriger depuis la page Partenaires : indiquer la ville ou la commune (ex. « Cocody, Angré », « Bouaké »).
              </p>
            </details>
          )}
        </>
      )}
    </section>
  );
}
