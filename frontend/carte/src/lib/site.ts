/** Préfixe de publication (basePath Next.js, cf. next.config.ts) pour les URL de fichiers de public/. */
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "/carte";

export const SITE = {
  name: "Atlas CI",
  description:
    "Explorez la Côte d'Ivoire sur une carte interactive : villes, districts, économie, culture, services et informations pratiques, avec des sources identifiées.",
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  /** Éditeur de la plateforme (charte graphique SIM Assurances). */
  publisher: {
    name: "SIM Assurances",
    legalName: "Société ivoirienne de micro-assurances",
    slogan: "LA protection pour tous",
    url: "https://www.simassurances.com",
  },
  /** Couleur corporate principale (#004B9C) : barre du navigateur, manifeste. */
  themeColor: "#004b9c",
} as const;
