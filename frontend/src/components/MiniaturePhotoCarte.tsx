import { useFetch } from "../useFetch";

/**
 * Miniature de la photo utilisée pour la carte de prise en charge. La photo
 * (data URL de plusieurs dizaines de Ko) ne figure plus dans les listes de
 * clients — voir backend/src/services/allegement.ts — : elle est chargée ici, à
 * l'ouverture de la fiche, via GET /assurances-branche/clients/:type/:id/photos.
 */
export default function MiniaturePhotoCarte({
  souscriptionId,
  produitType,
}: {
  souscriptionId: string;
  produitType: "incendie" | "accident";
}) {
  const { data } = useFetch<{ selfieUrl: string | null }>(
    `/assurances-branche/clients/${produitType}/${souscriptionId}/photos`
  );
  if (!data?.selfieUrl) return null;
  return (
    <img
      src={data.selfieUrl}
      alt="Photo carte"
      style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 8, border: "1.5px solid var(--border, #e5e7eb)" }}
    />
  );
}
