import type { MetadataRoute } from "next";

import { SITE } from "@/lib/site";
import { getCityIds } from "@/server/cities";

export const dynamic = "force-static";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const ids = await getCityIds();
  return [
    { url: SITE.url, changeFrequency: "weekly", priority: 1 },
    ...ids.map((id) => ({ url: `${SITE.url}/ville/${id}`, changeFrequency: "monthly" as const, priority: 0.8 })),
  ];
}
