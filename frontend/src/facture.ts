// Facture d'un paiement confirmé (PDF, texte réel) — rendue entièrement côté
// serveur, voir backend/src/services/facture.ts + factureHtml.ts. Le navigateur
// ne fournit AUCUNE donnée de facture : il désigne seulement le paiement.

import { API_BASE } from "./api";

export interface FactureResume {
  paiementId: string;
  numeroFacture: string;
  datePaiement: string | null;
  montant: number;
  estRenouvellement: boolean;
  periodeDebut: string | null;
  periodeFin: string | null;
}

// Même convention que carte.ts : session admin, sinon session client.
function jeton() {
  return localStorage.getItem("sim_token") || localStorage.getItem("sim_client_token");
}

/** Factures d'une souscription (une par paiement confirmé) — admin ou client propriétaire. */
export async function listerFactures(souscriptionId: string): Promise<FactureResume[]> {
  const token = jeton();
  const res = await fetch(`${API_BASE}/factures/souscription/${encodeURIComponent(souscriptionId)}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    let message = "Impossible de charger les factures.";
    try {
      message = (await res.json()).error ?? message;
    } catch {
      /* réponse non-JSON */
    }
    throw new Error(message);
  }
  return res.json();
}

/**
 * `souscriptionId` : à fournir uniquement dans le parcours public juste après
 * paiement (le client n'a pas encore de session) — c'est la preuve d'accès
 * attendue par le backend, valable 48 h (voir routes/factures.ts). Depuis
 * l'admin ou l'espace client, le jeton de session suffit.
 */
export async function telechargerFacture(paiementId: string, souscriptionId?: string): Promise<void> {
  const token = jeton();
  const res = await fetch(`${API_BASE}/factures/pdf`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ paiementId, souscriptionId }),
  });
  if (!res.ok) {
    let message = "Erreur lors de la génération de la facture.";
    try {
      message = (await res.json()).error ?? message;
    } catch {
      /* réponse non-JSON */
    }
    throw new Error(message);
  }

  // Nom de fichier = numéro de facture, fourni par le serveur.
  const nom = /filename="([^"]+)"/.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? "facture.pdf";
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nom;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
