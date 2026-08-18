// Téléchargement de la carte virtuelle de prise en charge (PNG, texte réel +
// photo du souscripteur) — rendu entièrement côté serveur, voir
// backend/src/services/carteHtml.ts + services/pdf.ts (htmlToPng).

import { API_BASE } from "./api";

// "incendie"/"accident" pour les modèles historiques, sinon le code produit
// du modèle générique (relaxmoto, relaxauto, relaxaccidents_fraismedicaux,
// relaxvoyage, relaxaccidents, securhome_dommages, securpro_dommages...) —
// le backend (routes/cartes.ts) traite tout code non-incendie/accident de
// façon générique, donc ce type reste volontairement large.
export type TypeCarte = string;

const sanitizeFilename = (s: string) => s.replace(/[^a-zA-Z0-9-_]+/g, "-");

/**
 * `paiementId` : à fournir dans le parcours public juste après paiement (le
 * client n'a pas encore de session) — c'est la preuve d'accès attendue par le
 * backend, voir routes/cartes.ts::autoriserAcces. Depuis l'admin ou l'espace
 * client, le jeton de session suffit et est transmis automatiquement.
 */
export async function telechargerCarte(type: TypeCarte, souscriptionId: string, paiementId?: string) {
  const token = localStorage.getItem("sim_token") || localStorage.getItem("sim_client_token");
  const res = await fetch(`${API_BASE}/cartes/png`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ type, souscriptionId, paiementId }),
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
