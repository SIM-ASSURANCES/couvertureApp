"use client";

import { Store, User, X } from "lucide-react";
import { useEffect } from "react";

import { useExplorer } from "@/components/explorer/ExplorerProvider";
import { getRegion } from "@/lib/admin";
import { pluriel, type ReseauAgent } from "@/lib/reseau";

function Inactif({ statut }: { statut: string }) {
  if (statut === "actif") return null;
  return <span className="ml-1.5 rounded-full bg-zinc-200 px-1.5 py-0.5 align-middle text-[10px] font-medium text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300">inactif</span>;
}

function detailAgent(agent: ReseauAgent, herite: boolean): string {
  const parts = [agent.telephone];
  if (herite) parts.push(agent.localisation ? `« ${agent.localisation} » non reconnu : placé chez son partenaire` : "sans localisation : placé chez son partenaire");
  else if (agent.localisation) parts.push(`« ${agent.localisation} »`);
  return parts.filter(Boolean).join(" · ");
}

/** Carte d'information d'un lieu du réseau : partenaires présents et leurs sous-agents. */
export function ReseauCard() {
  const { activeLieu, setActiveLieu, reseauAgrege, setSheetSnap } = useExplorer();
  const lr = activeLieu ? reseauAgrege?.lieux.find((l) => l.lieu.key === activeLieu) : undefined;

  useEffect(() => {
    if (!activeLieu) return;
    setSheetSnap("peek");
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setActiveLieu(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeLieu, setActiveLieu, setSheetSnap]);

  if (!lr) return null;
  const region = getRegion(lr.lieu.region);

  return (
    <div
      role="dialog"
      aria-labelledby="reseau-title"
      className="surface absolute inset-x-3 bottom-[12rem] z-30 flex max-h-[55dvh] flex-col rounded-2xl animate-rise md:inset-x-auto md:bottom-8 md:right-4 md:max-h-[calc(100%-10rem)] md:w-96"
    >
      <div className="flex items-start justify-between gap-3 p-4 pb-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-orange-600 dark:text-orange-400">Réseau de distribution</p>
          <h2 id="reseau-title" className="text-lg font-semibold tracking-tight">
            {lr.lieu.name}
          </h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {lr.lieu.commune && "Commune d'Abidjan · "}
            {region?.name ?? "Région non déterminée"}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setActiveLieu(null)}
          aria-label="Fermer"
          className="grid size-8 shrink-0 place-items-center rounded-full text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="flex gap-2 px-4">
        <span className="rounded-full bg-orange-100 px-2.5 py-1 text-xs font-medium text-orange-800 dark:bg-orange-500/15 dark:text-orange-300">
          {pluriel(lr.nbPartenaires, "partenaire")}
        </span>
        <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
          {pluriel(lr.nbAgents, "sous-agent")}
        </span>
      </div>

      <ul className="scrollbar-thin mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain px-4 pb-4">
        {lr.groupes.map((g) => (
          <li key={g.partenaire.id} className="rounded-xl bg-zinc-50 p-3 ring-1 ring-zinc-900/5 dark:bg-zinc-800/50 dark:ring-white/5">
            <div className="flex items-start gap-2">
              <Store aria-hidden className="mt-0.5 size-4 shrink-0 text-orange-600 dark:text-orange-400" />
              <div className="min-w-0 flex-1">
                <p className="font-medium leading-tight">
                  {g.partenaire.nomCommerce}
                  <Inactif statut={g.partenaire.statut} />
                </p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  {g.partenaire.nomResponsable} · {g.partenaire.telephone}
                </p>
                {g.ici ? (
                  g.partenaire.localisation && <p className="text-[11px] text-zinc-400">« {g.partenaire.localisation} »</p>
                ) : (
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                    Partenaire basé ailleurs ({g.partenaire.localisation ? `« ${g.partenaire.localisation} »` : "localisation non renseignée"}) : seuls ses
                    sous-agents sont ici.
                  </p>
                )}
              </div>
            </div>
            {g.agents.length > 0 && (
              <ul className="mt-2 space-y-1.5 border-t border-zinc-900/5 pt-2 dark:border-white/10">
                {g.agents.map(({ agent, herite }) => (
                  <li key={agent.id} className="flex items-start gap-2 text-sm">
                    <User aria-hidden className="mt-0.5 size-3.5 shrink-0 text-zinc-400" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">
                        {agent.nom ?? "Sous-agent"}
                        <Inactif statut={agent.statut} />
                      </span>
                      {detailAgent(agent, herite) && <span className="block text-[11px] text-zinc-500 dark:text-zinc-400">{detailAgent(agent, herite)}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
