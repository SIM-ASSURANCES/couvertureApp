import { useRef, useState } from "react";
import { Download, ImageUp, Trash2 } from "lucide-react";
import { Card } from "../../../../components/ui";
import { api } from "../../../../api";
import type { Imf } from "../../../../types";

const TYPES_ACCEPTES = ["image/png", "image/jpeg", "image/webp"];
const TAILLE_MAX = 1024 * 1024; // 1 Mo — même limite que le serveur

function lireEnDataUrl(fichier: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("Lecture du fichier impossible."));
    r.readAsDataURL(fichier);
  });
}

/**
 * Onglet « Logo » de la fiche IMF (2026-11-24) : envoyer le logo depuis l'ordinateur ou le téléphone
 * (PNG, JPEG ou WebP, 1 Mo max), le télécharger, ou le retirer. Le logo envoyé remplace l'adresse
 * saisie dans l'onglet Général et s'affiche partout où le logo de l'IMF apparaît (espace agent…).
 */
export default function OngletLogo({ imf, reload, notify }: { imf: Imf; reload: () => void; notify: (m: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState("");
  const logoEnvoye = !!imf.logoUrl && imf.logoUrl.includes(`/imf-logos/${imf.id}`);
  // Logo envoyé : la route publique force le téléchargement ; adresse externe : ouverte telle quelle.
  const lienTelechargement = imf.logoUrl
    ? logoEnvoye
      ? `${imf.logoUrl}${imf.logoUrl.includes("?") ? "&" : "?"}telecharger=1`
      : imf.logoUrl
    : null;

  async function envoyer(fichier: File | undefined) {
    if (!fichier) return;
    setErreur("");
    if (!TYPES_ACCEPTES.includes(fichier.type)) {
      setErreur("Format non pris en charge : choisissez une image PNG, JPEG ou WebP.");
      return;
    }
    if (fichier.size > TAILLE_MAX) {
      setErreur(`Image trop lourde (${(fichier.size / 1024 / 1024).toFixed(1)} Mo) : 1 Mo maximum.`);
      return;
    }
    setEnvoi(true);
    try {
      await api.post(`/imf-partenaires/${imf.id}/logo`, { image: await lireEnDataUrl(fichier) });
      notify("Logo enregistré ✓");
      reload();
    } catch (err) {
      setErreur((err as Error).message);
    } finally {
      setEnvoi(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function retirer() {
    if (!confirm(`Retirer le logo de ${imf.nom} ?`)) return;
    try {
      await api.del(`/imf-partenaires/${imf.id}/logo`);
      notify("Logo retiré");
      reload();
    } catch (err) {
      notify((err as Error).message);
    }
  }

  return (
    <Card title="Logo de l'IMF">
      <div style={{ display: "flex", gap: 24, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div
          style={{
            width: 220,
            height: 140,
            borderRadius: 12,
            border: "1px dashed var(--border, #d6dbe3)",
            background: "var(--bg-2, #f5f8fc)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
          }}
        >
          {imf.logoUrl ? (
            <img
              data-testid="logo-imf"
              src={imf.logoUrl}
              alt={`Logo de ${imf.nom}`}
              style={{ maxWidth: "90%", maxHeight: "90%", objectFit: "contain" }}
            />
          ) : (
            <span className="muted" style={{ fontSize: 13 }}>Aucun logo</span>
          )}
        </div>

        <div style={{ flex: "1 1 260px", minWidth: 0 }}>
          <p className="muted" style={{ marginTop: 0, fontSize: 13.5 }}>
            Image PNG, JPEG ou WebP, 1 Mo maximum. Le logo s'affiche dans l'espace des agents de l'IMF.
            {imf.logoUrl && !logoEnvoye && " Le logo actuel provient d'une adresse saisie dans l'onglet Général."}
          </p>
          <input
            ref={inputRef}
            type="file"
            accept={TYPES_ACCEPTES.join(",")}
            style={{ display: "none" }}
            onChange={(e) => envoyer(e.target.files?.[0])}
          />
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button className="btn btn-primary" disabled={envoi} onClick={() => inputRef.current?.click()}>
              <ImageUp size={16} /> {envoi ? "Envoi…" : imf.logoUrl ? "Remplacer le logo" : "Envoyer un logo"}
            </button>
            {lienTelechargement && (
              <a className="btn btn-ghost" href={lienTelechargement} download target={logoEnvoye ? undefined : "_blank"} rel="noreferrer">
                <Download size={16} /> Télécharger le logo
              </a>
            )}
            {imf.logoUrl && (
              <button className="btn btn-ghost" onClick={retirer}>
                <Trash2 size={16} /> Retirer
              </button>
            )}
          </div>
          {erreur && (
            <div role="alert" style={{ color: "var(--danger, #dc2626)", fontSize: 13, marginTop: 10 }}>
              {erreur}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
