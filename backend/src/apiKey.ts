import crypto from "crypto";
import type { Request, Response, NextFunction, RequestHandler } from "express";
import type { EnvApiKey } from "@prisma/client";
import { prisma } from "./db.js";

// =====================================================================
// Socle de l'API partenaire (accès serveur-à-serveur).
//
//   - génération / hachage des clés (`sk_live_…` / `sk_test_…`)
//   - middleware `requireApiKey()` : authentifie et pose `req.partner`
//   - middleware `requireScope()`  : vérifie les portées sur `req.partner`
//   - middleware `withIdempotency()` : rejoue une écriture déjà traitée
//   - middleware `journaliserRequetesPartenaire()` : trace chaque appel
//
// Voir routes/partnerApi.ts (routeur `/api/partner/v1`) et
// routes/partenaires.ts (création / révocation des clés par un admin).
// =====================================================================

/** Portées accordables à une clé API partenaire. */
export const SCOPES_API = [
  "catalogue:read",
  "souscriptions:write",
  "souscriptions:read",
  "documents:read",
] as const;
export type ScopeApi = (typeof SCOPES_API)[number];

/**
 * Événements poussés vers l'URL webhook du partenaire (voir
 * services/partnerWebhook.ts). Une clé ne reçoit que ceux listés dans
 * `PartnerApiKey.webhookEvents`.
 */
export const EVENEMENTS_WEBHOOK = [
  "souscription.creee",
  "paiement.recu",
  "souscription.confirmee",
  "contrat.disponible",
  "souscription.rejetee",
] as const;
export type EvenementWebhook = (typeof EVENEMENTS_WEBHOOK)[number];

export interface PartnerContext {
  partenaireId: string;
  apiKeyId: string;
  env: EnvApiKey;
  scopes: string[];
}

export interface PartnerRequest extends Request {
  partner?: PartnerContext;
}

// ─────────────────────────────────────────────────────────────────────
// Génération / hachage
// ─────────────────────────────────────────────────────────────────────

/**
 * SHA-256 hex du secret. Le secret est un jeton aléatoire de 256 bits :
 * pas besoin d'un KDF lent (bcrypt/argon2), réservé aux secrets à faible
 * entropie comme les mots de passe.
 */
export function hashCle(secret: string): string {
  return crypto.createHash("sha256").update(secret, "utf8").digest("hex");
}

/**
 * Fabrique une nouvelle clé API. Le `secret` complet n'est renvoyé qu'ici
 * (affiché une seule fois au moment de la création) ; seuls `prefix` et
 * `hash` sont stockés.
 */
export function genererCleApi(env: EnvApiKey): {
  secret: string;
  prefix: string;
  hash: string;
} {
  const secret = `sk_${env}_${crypto.randomBytes(32).toString("base64url")}`;
  return { secret, prefix: secret.slice(0, 16), hash: hashCle(secret) };
}

/** Comparaison en temps constant de deux empreintes hex de même longueur. */
function hashEgal(a: string, b: string): boolean {
  const ba = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

// ─────────────────────────────────────────────────────────────────────
// Liste blanche d'IP (IPv4 exact ou CIDR ; IPv6 en correspondance exacte)
// ─────────────────────────────────────────────────────────────────────

function ipv4EnEntier(ip: string): number | null {
  const m = ip.trim().match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return null;
  const octets = m.slice(1, 5).map(Number);
  if (octets.some((o) => o > 255)) return null;
  return ((octets[0] << 24) | (octets[1] << 16) | (octets[2] << 8) | octets[3]) >>> 0;
}

function ipCorrespond(ip: string, entree: string): boolean {
  const e = entree.trim();
  if (!e) return false;
  // Node préfixe parfois les IPv4 en "::ffff:1.2.3.4" derrière un proxy.
  const ipV4 = ip.replace(/^::ffff:/i, "");
  if (!e.includes("/")) return ip === e || ipV4 === e;

  const [reseau, bitsStr] = e.split("/");
  const bits = Number(bitsStr);
  const ipInt = ipv4EnEntier(ipV4);
  const resInt = ipv4EnEntier(reseau);
  if (ipInt === null || resInt === null || !Number.isInteger(bits) || bits < 0 || bits > 32) {
    return false;
  }
  if (bits === 0) return true;
  const masque = (0xffffffff << (32 - bits)) >>> 0;
  return (ipInt & masque) === (resInt & masque);
}

/** Vrai si `ip` est autorisée. Une liste vide n'impose aucune restriction. */
export function ipDansAllowlist(ip: string | undefined, liste: string[]): boolean {
  if (liste.length === 0) return true;
  if (!ip) return false;
  return liste.some((e) => ipCorrespond(ip, e));
}

// ─────────────────────────────────────────────────────────────────────
// Réponses normalisées
// ─────────────────────────────────────────────────────────────────────

/** Erreur : `{ error: { code, message, details? } }` avec un `code` stable. */
export function apiError(
  res: Response,
  status: number,
  code: string,
  message: string,
  details?: unknown
): Response {
  return res
    .status(status)
    .json({ error: { code, message, ...(details !== undefined ? { details } : {}) } });
}

/** Succès : `{ data, meta? }`. */
export function apiOk(
  res: Response,
  data: unknown,
  meta?: Record<string, unknown>,
  status = 200
): Response {
  return res.status(status).json({ data, ...(meta ? { meta } : {}) });
}

// ─────────────────────────────────────────────────────────────────────
// Authentification
// ─────────────────────────────────────────────────────────────────────

/**
 * Authentifie la requête via `Authorization: Bearer sk_live_…` et pose
 * `req.partner`. Sans argument : authentification seule. Avec des portées :
 * elles doivent toutes être accordées à la clé.
 */
export function requireApiKey(...scopesRequis: ScopeApi[]): RequestHandler {
  return (req: PartnerRequest, res: Response, next: NextFunction) => {
    void (async () => {
      const header = req.headers.authorization;
      if (!header?.startsWith("Bearer ")) {
        return apiError(res, 401, "non_authentifie", "En-tête « Authorization: Bearer <clé> » manquant.");
      }
      const secret = header.slice(7).trim();
      if (!/^sk_(live|test)_/.test(secret) || secret.length < 24) {
        return apiError(res, 401, "cle_invalide", "Clé API mal formée.");
      }

      const cle = await prisma.partnerApiKey.findUnique({
        where: { prefix: secret.slice(0, 16) },
        include: { partenaire: { select: { statut: true } } },
      });
      if (!cle || !hashEgal(hashCle(secret), cle.hash)) {
        return apiError(res, 401, "cle_invalide", "Clé API inconnue.");
      }
      if (cle.statut !== "active" || cle.revokedAt) {
        return apiError(res, 401, "cle_revoquee", "Cette clé API a été révoquée.");
      }
      if (cle.expireAt && cle.expireAt.getTime() <= Date.now()) {
        return apiError(res, 401, "cle_expiree", "Cette clé API a expiré.");
      }
      if (cle.partenaire.statut !== "actif") {
        return apiError(res, 403, "partenaire_inactif", "Le compte partenaire associé est inactif.");
      }
      if (!ipDansAllowlist(req.ip, cle.ipAllowlist)) {
        return apiError(res, 403, "ip_refusee", "Adresse IP non autorisée pour cette clé.");
      }
      const manquants = scopesRequis.filter((s) => !cle.scopes.includes(s));
      if (manquants.length) {
        return apiError(res, 403, "scope_manquant", `Portée(s) requise(s) : ${manquants.join(", ")}.`);
      }

      req.partner = {
        partenaireId: cle.partenaireId,
        apiKeyId: cle.id,
        env: cle.environnement,
        scopes: cle.scopes,
      };
      // Horodatage best-effort : ne bloque pas la requête.
      prisma.partnerApiKey
        .update({ where: { id: cle.id }, data: { dernierUsageAt: new Date() } })
        .catch(() => {});
      next();
    })().catch(next);
  };
}

/** Vérifie des portées sur `req.partner` déjà posé par `requireApiKey()`. */
export function requireScope(...scopesRequis: ScopeApi[]): RequestHandler {
  return (req: PartnerRequest, res: Response, next: NextFunction) => {
    if (!req.partner) {
      return apiError(res, 401, "non_authentifie", "Authentification requise.");
    }
    const manquants = scopesRequis.filter((s) => !req.partner!.scopes.includes(s));
    if (manquants.length) {
      return apiError(res, 403, "scope_manquant", `Portée(s) requise(s) : ${manquants.join(", ")}.`);
    }
    next();
  };
}

// ─────────────────────────────────────────────────────────────────────
// Idempotence des écritures
// ─────────────────────────────────────────────────────────────────────

/**
 * Rend `POST` rejouable sans doublon : la première requête portant une
 * valeur `Idempotency-Key` donnée est exécutée puis sa réponse mémorisée ;
 * un rejeu (même corps) renvoie la réponse mémorisée sans ré-exécuter le
 * handler. Un enregistrement « verrou » (responseStatus 0) est posé dès
 * réception pour fermer la fenêtre de concurrence ; il est remplacé par la
 * vraie réponse en sortie, ou supprimé si le handler renvoie une 5xx (erreur
 * transitoire → la requête reste rejouable).
 *
 * À chaîner APRÈS `requireApiKey()`.
 */
export function withIdempotency(): RequestHandler {
  return (req: PartnerRequest, res: Response, next: NextFunction) => {
    void (async () => {
      if (!req.partner) {
        return apiError(res, 401, "non_authentifie", "Authentification requise.");
      }
      const brute = req.header("Idempotency-Key");
      if (!brute || brute.length < 8 || brute.length > 255) {
        return apiError(
          res,
          400,
          "idempotency_key_requis",
          "En-tête « Idempotency-Key » requis (8 à 255 caractères)."
        );
      }

      const cle = `${req.partner.apiKeyId}:${brute}`;
      const requestHash = crypto
        .createHash("sha256")
        .update(`${req.method} ${req.path}\n${JSON.stringify(req.body ?? null)}`)
        .digest("hex");

      const repondreDepuis = (rec: {
        responseStatus: number;
        requestHash: string;
        responseBody: unknown;
      }): Response => {
        if (rec.responseStatus === 0) {
          return apiError(
            res,
            409,
            "idempotency_en_cours",
            "Une requête portant cette clé Idempotency-Key est déjà en cours de traitement."
          );
        }
        if (rec.requestHash !== requestHash) {
          return apiError(
            res,
            409,
            "idempotency_key_reutilisee",
            "Cette clé Idempotency-Key a déjà servi pour une requête au corps différent."
          );
        }
        return res.status(rec.responseStatus).json(rec.responseBody);
      };

      const existant = await prisma.idempotencyRecord.findUnique({ where: { cle } });
      if (existant) return repondreDepuis(existant);

      try {
        await prisma.idempotencyRecord.create({
          data: {
            cle,
            apiKeyId: req.partner.apiKeyId,
            requestHash,
            responseStatus: 0,
            responseBody: {},
          },
        });
      } catch (e: unknown) {
        if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2002") {
          const rec = await prisma.idempotencyRecord.findUnique({ where: { cle } });
          if (rec) return repondreDepuis(rec);
        }
        throw e;
      }

      const jsonOrigine = res.json.bind(res);
      res.json = ((corps: unknown) => {
        const suite =
          res.statusCode < 500
            ? prisma.idempotencyRecord.update({
                where: { cle },
                data: {
                  responseStatus: res.statusCode,
                  responseBody: JSON.parse(JSON.stringify(corps ?? null)),
                },
              })
            : prisma.idempotencyRecord.delete({ where: { cle } });
        suite.catch((err: unknown) => console.error("[idempotency] persistance", err));
        return jsonOrigine(corps);
      }) as Response["json"];

      next();
    })().catch(next);
  };
}

// ─────────────────────────────────────────────────────────────────────
// Journalisation
// ─────────────────────────────────────────────────────────────────────

/**
 * Trace chaque appel authentifié dans `PartnerApiRequest` (best-effort, à la
 * fin de la réponse). Un handler peut renseigner `res.locals.souscriptionId`
 * pour le rattacher. À chaîner APRÈS `requireApiKey()`.
 */
export function journaliserRequetesPartenaire(): RequestHandler {
  return (req: PartnerRequest, res: Response, next: NextFunction) => {
    const debut = Date.now();
    res.on("finish", () => {
      if (!req.partner) return;
      prisma.partnerApiRequest
        .create({
          data: {
            apiKeyId: req.partner.apiKeyId,
            partenaireId: req.partner.partenaireId,
            methode: req.method,
            chemin: req.path,
            statusCode: res.statusCode,
            ip: req.ip ?? null,
            idempotencyKey: req.header("Idempotency-Key") ?? null,
            souscriptionId: (res.locals.souscriptionId as string | undefined) ?? null,
            dureeMs: Date.now() - debut,
          },
        })
        .catch((e: unknown) => console.error("[partnerApiRequest] journal", e));
    });
    next();
  };
}
