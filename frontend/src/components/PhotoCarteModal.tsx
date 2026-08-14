import { useState } from "react";
import { api, ApiError } from "../api";
import PhotoCapture from "./PhotoCapture";

interface Props {
  souscriptionId: string;
  /** Code produit (discriminant backend — voir CODE_INCENDIE_HISTORIQUE/CODE_ACCIDENT_HISTORIQUE côté serveur). */
  produit: string;
  onClose: () => void;
  onSaved: () => void;
}

/**
 * Modale réservée au Super Administrateur (global ou de la branche
 * Assurances Accidents/Dommages) pour remplacer la photo (selfie) utilisée
 * sur la carte virtuelle de prise en charge d'un client, quand la photo
 * déposée par le client lui-même est de mauvaise qualité ou incorrecte.
 * Réutilisable sur les 3 pages de liste (Accident historique, Dommages
 * unifiée, Accidents générique) — voir PATCH
 * /assurances-branche/souscriptions/:id/photo-carte.
 */
export default function PhotoCarteModal({ souscriptionId, produit, onClose, onSaved }: Props) {
  const [photo, setPhoto] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [erreur, setErreur] = useState("");

  async function enregistrer() {
    if (!photo) return;
    setSaving(true);
    setErreur("");
    try {
      await api.patch(`/assurances-branche/souscriptions/${souscriptionId}/photo-carte`, {
        selfieUrl: photo,
        produit,
      });
      onSaved();
      onClose();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : "Échec de l'enregistrement");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15, 23, 42, 0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        className="card"
        style={{ maxWidth: 420, width: "100%", padding: 24 }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="card-title" style={{ marginBottom: 4 }}>
          Modifier la photo de la carte
        </h3>
        <p className="muted" style={{ marginTop: 0, marginBottom: 16, fontSize: 13.5 }}>
          La nouvelle photo remplacera celle utilisée pour générer la carte de prise en charge de ce client.
        </p>
        <PhotoCapture label="Nouvelle photo" value={photo} onChange={setPhoto} capture="user" />
        {erreur && (
          <div style={{ color: "var(--danger)", fontSize: 13, marginTop: 8 }}>{erreur}</div>
        )}
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 20 }}>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>
            Annuler
          </button>
          <button type="button" className="btn btn-primary" onClick={enregistrer} disabled={!photo || saving}>
            {saving ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
      </div>
    </div>
  );
}
