import QRCode from "qrcode";
import { randomUUID } from "crypto";

const BASE = process.env.APP_PUBLIC_URL || "http://localhost:5173";

export function newQrToken(prefix: string) {
  return `${prefix}_${randomUUID().slice(0, 8)}`;
}

/** produitCode : code générique du produit ("incendie", "accident", "relaxmoto", "relaxauto"...) */
export function qrTargetUrl(produitCode: string, token: string) {
  return `${BASE}/s/${produitCode}/${token}`;
}

async function qrDataUrlPourCible(url: string, couleur: string): Promise<string> {
  return QRCode.toDataURL(url, {
    width: 600,
    margin: 2,
    color: { dark: couleur, light: "#ffffff" },
  });
}

/** couleur : Produit.couleurQr — passée par l'appelant (résolue via Prisma), #004b9c par défaut */
export async function qrDataUrl(
  produitCode: string,
  token: string,
  couleur: string = "#004b9c"
): Promise<string> {
  return qrDataUrlPourCible(qrTargetUrl(produitCode, token), couleur);
}

/**
 * IMF : lien public de simulation d'un agent — route dédiée `/imf/:token`
 * (pas `/s/:produit/:token`, qui est le chooser/formulaire Accidents-Dommages
 * et ne sait pas traiter produitCode="imf"). Utilisé par
 * GET /imf/agents/:id/qr — voir pages/public/SimulationImf.tsx côté frontend.
 */
export function qrImfTargetUrl(token: string) {
  return `${BASE}/imf/${token}`;
}

export async function qrDataUrlImf(token: string, couleur: string = "#004b9c"): Promise<string> {
  return qrDataUrlPourCible(qrImfTargetUrl(token), couleur);
}
