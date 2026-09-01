import { useState } from "react";
import { Download, Image as ImageIcon } from "lucide-react";
import { useFetch } from "../useFetch";

interface Photos {
  pieceIdentiteUrl: string | null;
  selfieUrl: string | null;
  typePiece: "CNI" | "Permis" | "Passeport" | null;
}

const sanitize = (s: string) => s.replace(/[^a-zA-Z0-9-_]+/g, "-");

/**
 * Section "Pièces fournies par le client" — comme AccesClientModal, ce n'est
 * pas une modale autonome mais un bloc à intégrer dans une modale de détail
 * existante (ClientsAccident.tsx, ClientsIncendie.tsx, accidents/Clients.tsx).
 * Les photos ne transitent pas dans les listes (data URL volumineuses) : elles
 * sont chargées à l'ouverture du détail via
 * GET /assurances-branche/clients/:produitType/:id/photos.
 */
export default function PhotosClientModal({
  souscriptionId,
  produitType,
  referenceFichier,
}: {
  souscriptionId: string;
  produitType: "generique" | "incendie" | "accident";
  /** Utilisé pour nommer les fichiers téléchargés (n° de police de préférence). */
  referenceFichier?: string | null;
}) {
  const { data, loading } = useFetch<Photos>(
    `/assurances-branche/clients/${produitType}/${souscriptionId}/photos`
  );
  const [agrandie, setAgrandie] = useState<{ url: string; titre: string } | null>(null);

  const base = sanitize(referenceFichier || souscriptionId);
  const libellePiece =
    data?.typePiece === "Permis" ? "Permis de conduire" : data?.typePiece === "Passeport" ? "Passeport" : "Pièce d'identité";

  const vignettes = [
    { url: data?.pieceIdentiteUrl ?? null, titre: libellePiece, fichier: `piece-${base}` },
    { url: data?.selfieUrl ?? null, titre: "Selfie", fichier: `selfie-${base}` },
  ];
  const aucune = !loading && !data?.pieceIdentiteUrl && !data?.selfieUrl;

  return (
    <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--border, #e5e7eb)" }}>
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10 }}>Pièces fournies par le client</div>

      {loading && <div className="muted" style={{ fontSize: 12.5 }}>Chargement…</div>}
      {aucune && (
        <div className="muted" style={{ fontSize: 12.5, display: "flex", alignItems: "center", gap: 6 }}>
          <ImageIcon size={14} /> Aucune photo fournie pour ce contrat.
        </div>
      )}

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        {vignettes
          .filter((v) => v.url)
          .map((v) => (
            <div key={v.titre} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div className="muted" style={{ fontSize: 11.5, fontWeight: 600 }}>{v.titre}</div>
              <img
                src={v.url!}
                alt={v.titre}
                onClick={() => setAgrandie({ url: v.url!, titre: v.titre })}
                style={{
                  width: 132,
                  height: 132,
                  objectFit: "cover",
                  borderRadius: 10,
                  border: "1.5px solid var(--border, #e5e7eb)",
                  cursor: "zoom-in",
                }}
              />
              <a
                className="btn btn-ghost"
                href={v.url!}
                download={`${v.fichier}.jpg`}
                style={{ padding: "6px 10px", fontSize: 12.5, justifyContent: "center" }}
              >
                <Download size={13} /> Télécharger
              </a>
            </div>
          ))}
      </div>

      {agrandie && (
        <div
          onClick={() => setAgrandie(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15,27,45,.75)",
            display: "grid",
            placeItems: "center",
            zIndex: 80,
            padding: 24,
            cursor: "zoom-out",
          }}
        >
          <img
            src={agrandie.url}
            alt={agrandie.titre}
            style={{ maxWidth: "100%", maxHeight: "90vh", borderRadius: 12, boxShadow: "0 10px 40px rgba(0,0,0,.4)" }}
          />
        </div>
      )}
    </div>
  );
}
