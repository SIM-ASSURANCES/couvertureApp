import type { MetadataRoute } from "next";

import { BASE_PATH, SITE } from "@/lib/site";

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${SITE.name} — Carte interactive de la Côte d'Ivoire`,
    short_name: SITE.name,
    description: SITE.description,
    lang: "fr",
    start_url: `${BASE_PATH}/`,
    display: "standalone",
    background_color: "#ffffff",
    theme_color: SITE.themeColor,
    icons: [{ src: `${BASE_PATH}/icon.png`, sizes: "512x512", type: "image/png", purpose: "any" }],
  };
}
