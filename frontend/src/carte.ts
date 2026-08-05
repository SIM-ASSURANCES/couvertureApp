// Téléchargement de la carte virtuelle de prise en charge (PNG, texte réel +
// photo du souscripteur) — rendu entièrement côté serveur, voir
// backend/src/services/carteHtml.ts + services/pdf.ts (htmlToPng).

import { API_BASE } from "./api";

export type TypeCarte = "incendie" | "accident" | "relaxmoto" | "relaxauto" | "relaxaccidents_fraismedicaux";

const sanitizeFilename = (s: string) => s.replace(/[^a-zA-Z0-9-_]+/g, "-");

export async function telechargerCarte(type: TypeCarte, souscriptionId: string) {
  const res = await fetch(`${API_BASE}/cartes/png`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type, souscriptionId }),
  });
  if (!res.ok) {
    let message = "Erreur lors de la génération de la carte.";
    try {
      message = (await res.json()).error ?? message;
    } catch {
      /* réponse non-JSON */
    }
    throw new Error(message);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `carte-${sanitizeFilename(souscriptionId)}.png`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
