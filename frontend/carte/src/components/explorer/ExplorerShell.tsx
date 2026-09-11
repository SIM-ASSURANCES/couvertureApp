"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { useExplorer } from "@/components/explorer/ExplorerProvider";
import { LocalityCard } from "@/components/explorer/LocalityCard";
import { MapControls } from "@/components/explorer/MapControls";
import { Panel } from "@/components/explorer/Panel";
import { ReseauCard } from "@/components/explorer/ReseauCard";
import { SearchBar } from "@/components/explorer/SearchBar";
import { isTypingTarget } from "@/lib/hooks";

// MapLibre (~800 Ko) est chargé à part, uniquement côté client : le panneau s'affiche immédiatement.
const MapView = dynamic(() => import("@/components/explorer/MapView"), {
  ssr: false,
  loading: () => <div className="absolute inset-0 animate-pulse bg-zinc-200/60 dark:bg-zinc-900" />,
});

/** Mise en page de l'explorateur : carte plein écran + éléments flottants + panneau. */
export function ExplorerShell({ children }: { children: React.ReactNode }) {
  const { selectedCityId, activeLocality, activeLieu } = useExplorer();
  const router = useRouter();

  // Échap ferme la fiche ouverte (sauf pendant la saisie ou si une localité / un lieu du réseau est affiché).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && selectedCityId && !activeLocality && !activeLieu && !isTypingTarget(e.target)) router.push("/", { scroll: false });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedCityId, activeLocality, activeLieu, router]);

  return (
    <div className="relative h-dvh w-full overflow-hidden">
      <MapView />
      <header className="pointer-events-none absolute inset-x-0 top-0 z-30 flex p-3 md:p-4">
        <SearchBar />
      </header>
      <MapControls />
      <LocalityCard />
      <ReseauCard />
      <Panel>{children}</Panel>
    </div>
  );
}
