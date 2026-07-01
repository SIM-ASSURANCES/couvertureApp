import crypto from "crypto";
import rateLimit from "express-rate-limit";
import type { Request } from "express";

/**
 * Limiteur strict pour l'authentification : protège contre le brute-force.
 * 10 tentatives par fenêtre de 15 min et par IP.
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Trop de tentatives. Réessayez dans quelques minutes." },
});

/**
 * Limiteur pour les endpoints publics (souscriptions, QR, callback).
 * Évite le spam : chaque souscription crée une ligne en base + envoie un WhatsApp facturé.
 * 30 requêtes par minute et par IP.
 */
export const publicLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Trop de requêtes. Veuillez patienter." },
});

/** Requête Express enrichie du corps brut (nécessaire pour vérifier la signature Wave). */
export interface RawBodyRequest extends Request {
  rawBody?: Buffer;
}

/**
 * Vérifie la signature HMAC du webhook Wave CI.
 *
 * Wave envoie un en-tête `Wave-Signature` au format : `t=<timestamp>,v1=<hmac_hex>`.
 * Le payload signé est `<timestamp>.<corps_brut>`, et le HMAC-SHA256 est calculé
 * avec le secret webhook fourni par Wave.
 *
 * Renvoie `true` si la signature est valide, `false` sinon.
 */
export function verifyWaveSignature(
  rawBody: Buffer | undefined,
  signatureHeader: string | undefined,
  secret: string
): boolean {
  if (!rawBody || !signatureHeader) return false;

  // Parse "t=...,v1=...,v1=..."
  const parts = signatureHeader.split(",").map((p) => p.trim());
  const timestamp = parts.find((p) => p.startsWith("t="))?.slice(2);
  const signatures = parts
    .filter((p) => p.startsWith("v1="))
    .map((p) => p.slice(3));

  if (!timestamp || signatures.length === 0) return false;

  const signedPayload = `${timestamp}.${rawBody.toString("utf8")}`;
  const expected = crypto
    .createHmac("sha256", secret)
    .update(signedPayload)
    .digest("hex");

  const expectedBuf = Buffer.from(expected, "utf8");
  // Comparaison en temps constant contre chaque signature fournie
  return signatures.some((sig) => {
    const sigBuf = Buffer.from(sig, "utf8");
    return (
      sigBuf.length === expectedBuf.length &&
      crypto.timingSafeEqual(sigBuf, expectedBuf)
    );
  });
}
