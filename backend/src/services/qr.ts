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

/** couleur : Produit.couleurQr — passée par l'appelant (résolue via Prisma), #004b9c par défaut */
export async function qrDataUrl(
  produitCode: string,
  token: string,
  couleur: string = "#004b9c"
): Promise<string> {
  return QRCode.toDataURL(qrTargetUrl(produitCode, token), {
    width: 600,
    margin: 2,
    color: { dark: couleur, light: "#ffffff" },
  });
}
