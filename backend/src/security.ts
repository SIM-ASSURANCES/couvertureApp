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

/**
 * Limiteur pour l'API partenaire (`/api/partner/v1/*`). Partitionné par clé
 * API (`req.partner.apiKeyId`) plutôt que par IP : un partenaire qui appelle
 * depuis un seul serveur ne doit pas être pénalisé par un autre, et une clé
 * ne doit pas pouvoir contourner la limite en changeant d'IP sortante.
 * Retombe sur l'IP tant que `requireApiKey()` n'a pas encore posé `req.partner`
 * (requêtes non authentifiées).
 * 120 requêtes par minute et par clé.
 */
export const partnerLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) =>
    (req as { partner?: { apiKeyId?: string } }).partner?.apiKeyId ?? req.ip ?? "inconnu",
  message: { error: { code: "rate_limite", message: "Trop de requêtes. Veuillez ralentir." } },
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
/** Tolérance anti-rejeu : au-delà, un webhook pourtant signé valablement est refusé. */
const WAVE_SIGNATURE_MAX_AGE_MS = 5 * 60 * 1000;

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

  const timestampMs = Number(timestamp) * 1000;
  if (!Number.isFinite(timestampMs) || Math.abs(Date.now() - timestampMs) > WAVE_SIGNATURE_MAX_AGE_MS) {
    return false;
  }

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
