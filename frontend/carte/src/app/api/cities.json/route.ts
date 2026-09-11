import { ADMIN_BOUNDARIES_SOURCE } from "@/lib/admin";
import { getCityIndex } from "@/server/cities";

export const dynamic = "force-static";

/**
 * GET /api/cities.json — index léger de toutes les villes (réutilisable par une app mobile ou un partenaire).
 * Suffixe .json : en export statique, un fichier « api/cities » entrerait en conflit avec le dossier des fiches (api/cities/<id>).
 */
export async function GET() {
  const cities = await getCityIndex();
  return Response.json({
    data: cities,
    meta: {
      count: cities.length,
      coordinates: "OpenStreetMap (ODbL)",
      population: "INS — RGPH 2021",
      boundaries: `${ADMIN_BOUNDARIES_SOURCE.name} — ${ADMIN_BOUNDARIES_SOURCE.license}`,
    },
  });
}
