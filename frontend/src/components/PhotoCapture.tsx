import { useRef } from "react";

interface Props {
  label: string;
  value: string | null;
  onChange: (dataUrl: string | null) => void;
  /** "environment" = caméra arrière (pièce d'identité), "user" = caméra avant (selfie). */
  capture?: "environment" | "user";
  required?: boolean;
}

/**
 * Capture une photo depuis l'appareil du souscripteur (caméra arrière pour
 * une pièce d'identité, avant pour un selfie) et la convertit en data URL —
 * même approche que SignaturePad : pas de service de stockage de fichiers,
 * la photo voyage et se stocke comme chaîne base64.
 */
export default function PhotoCapture({ label, value, onChange, capture = "environment", required }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => onChange(typeof reader.result === "string" ? reader.result : null);
    reader.readAsDataURL(file);
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
          className="btn btn-ghost"
          style={{ width: "100%", justifyContent: "center", padding: "18px 0", border: "1.5px dashed var(--border, #e5e7eb)" }}
        >
          📷 Prendre une photo
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
