import { useRef, useState } from "react";

interface Props {
  label: string;
  value: string | null;
  onChange: (dataUrl: string | null) => void;
  /** "environment" = caméra arrière (pièce d'identité), "user" = caméra avant (selfie). */
  capture?: "environment" | "user";
  required?: boolean;
}

const MAX_DIMENSION = 1280;
const JPEG_QUALITY = 0.82;

/** Redimensionne/compresse l'image (photo de téléphone non compressée = plusieurs Mo, dépasse vite la taille max des requêtes). */
async function compresser(file: File): Promise<string> {
  let bitmap: ImageBitmap | HTMLImageElement;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    bitmap = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  }
  const w = bitmap.width;
  const h = bitmap.height;
  const scale = Math.min(1, MAX_DIMENSION / Math.max(w, h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Contexte canvas indisponible");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  if ("close" in bitmap) bitmap.close();
  return canvas.toDataURL("image/jpeg", JPEG_QUALITY);
}

/**
 * Capture une photo depuis l'appareil du souscripteur (caméra arrière pour
 * une pièce d'identité, avant pour un selfie), la compresse (une photo de
 * téléphone non compressée peut faire plusieurs Mo — trop lourd une fois
 * encodée en base64) puis la convertit en data URL — même approche que
 * SignaturePad : pas de service de stockage de fichiers, la photo voyage et
 * se stocke comme chaîne base64.
 */
export default function PhotoCapture({ label, value, onChange, capture = "environment", required }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [traitement, setTraitement] = useState(false);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setTraitement(true);
    try {
      onChange(await compresser(file));
    } catch {
      // Repli : envoie l'image telle quelle si la compression échoue.
      const reader = new FileReader();
      reader.onload = () => onChange(typeof reader.result === "string" ? reader.result : null);
      reader.readAsDataURL(file);
    } finally {
      setTraitement(false);
    }
  }

  return (
    <div className="field">
      <label className="label">
        {label} {required && <span className="req">*</span>}
      </label>
      {value ? (
        <div style={{ position: "relative", display: "inline-block" }}>
          <img
            src={value}
            alt={label}
            style={{ width: 140, height: 140, objectFit: "cover", borderRadius: 10, border: "1.5px solid var(--border, #e5e7eb)" }}
          />
          <button
            type="button"
            onClick={() => {
              onChange(null);
              if (inputRef.current) inputRef.current.value = "";
            }}
            style={{
              position: "absolute", top: -8, right: -8, width: 26, height: 26, borderRadius: "50%",
              border: "none", background: "var(--danger, #dc2626)", color: "#fff", cursor: "pointer", fontSize: 14,
            }}
          >
            ×
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={traitement}
          className="btn btn-ghost"
          style={{ width: "100%", justifyContent: "center", padding: "18px 0", border: "1.5px dashed var(--border, #e5e7eb)", opacity: traitement ? 0.6 : 1 }}
        >
          {traitement ? "Traitement…" : "📷 Prendre une photo"}
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture={capture}
        onChange={handleFile}
        style={{ display: "none" }}
      />
    </div>
  );
}
