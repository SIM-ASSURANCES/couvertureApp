import QRCode from "qrcode";
import { randomUUID } from "crypto";

const BASE = process.env.APP_PUBLIC_URL || "http://localhost:5173";

export function newQrToken(prefix: string) {
  return `${prefix}_${randomUUID().slice(0, 8)}`;
}

export function qrTargetUrl(produit: "incendie" | "accident", token: string) {
  return `${BASE}/s/${produit}/${token}`;
}

export async function qrDataUrl(
  produit: "incendie" | "accident",
  token: string
): Promise<string> {
  const color = produit === "incendie" ? "#b45309" : "#004b9c";
  return QRCode.toDataURL(qrTargetUrl(produit, token), {
    width: 600,
    margin: 2,
    color: { dark: color, light: "#ffffff" },
  });
}
