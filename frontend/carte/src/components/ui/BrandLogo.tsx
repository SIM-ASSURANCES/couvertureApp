"use client";
// Composant client : utilisé par la page 404 (serveur), il n'apparaît ainsi que comme référence
// dans les données de chaque page, sans préchargement parasite du logo.

/* eslint-disable @next/next/no-img-element -- fichiers officiels déjà optimisés (WebP) */
import { cn } from "@/lib/cn";
import { BASE_PATH } from "@/lib/site";

/**
 * Logotype officiel SIM Assurances (fichiers fournis avec la charte graphique, public/brand/).
 *
 * Règles de la charte appliquées :
 * - version couleur sur fond clair, version blanche sur fond sombre ou bleu ;
 * - jamais de rotation ni de déformation (ratio d'origine conservé) ;
 * - taille minimale : 40 mm de long, soit ~151 px à l'écran → `height` ≥ 24 px ;
 * - espace protégé égal à la hauteur du « S » (~45 % de la hauteur du logo) : prévoir ce retrait autour.
 */
const RATIO = 640 / 98;
const SRC = {
  color: `${BASE_PATH}/brand/sim-assurances-logo.webp`,
  white: `${BASE_PATH}/brand/sim-assurances-logo-white.webp`,
};
const ALT = "SIM Assurances — Société ivoirienne de micro-assurances";

export function BrandLogo({
  variant = "auto",
  height = 24,
  className,
}: {
  /** `auto` : couleur en thème clair, blanc en thème sombre. */
  variant?: "auto" | "color" | "white";
  height?: number;
  className?: string;
}) {
  const h = Math.max(24, height);
  const size = { width: Math.round(h * RATIO), height: h };
  if (variant !== "auto") {
    return <img src={SRC[variant]} alt={ALT} {...size} decoding="async" className={cn("block max-w-none", className)} />;
  }
  // Chargement différé : le navigateur ne télécharge que la variante visible (l'autre est en display:none).
  return (
    <>
      <img src={SRC.color} alt={ALT} {...size} loading="lazy" decoding="async" className={cn("block max-w-none dark:hidden", className)} />
      <img src={SRC.white} alt={ALT} {...size} loading="lazy" decoding="async" className={cn("hidden max-w-none dark:block", className)} />
    </>
  );
}

/** Symbole seul, en blanc translucide : motif décoratif inspiré des couvertures de la charte. */
export function BrandMotif({ className }: { className?: string }) {
  return <img src={`${BASE_PATH}/brand/sim-assurances-mark-white.webp`} alt="" aria-hidden width={586} height={512} className={cn("pointer-events-none select-none", className)} />;
}
