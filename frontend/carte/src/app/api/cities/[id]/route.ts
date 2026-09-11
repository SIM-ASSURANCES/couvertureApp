import { getCityDetail, getCityIds } from "@/server/cities";

export const dynamic = "force-static";
export const dynamicParams = false;

export async function generateStaticParams() {
  return (await getCityIds()).map((id) => ({ id }));
}

/** GET /api/cities/:id — fiche complète (contenu éditorial + données calculées + sources). */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await getCityDetail(id);
  if (!detail) return Response.json({ error: "Ville introuvable" }, { status: 404 });
  return Response.json({ data: detail });
}
