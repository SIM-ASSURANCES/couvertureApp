import crypto from "crypto";
import type { PartnerWebhookDelivery } from "@prisma/client";
import { prisma } from "../db.js";
import type { EvenementWebhook } from "../apiKey.js";

// =====================================================================
// Webhooks sortants vers l'URL configurée sur la clé API du partenaire.
//
//   - signature HMAC-SHA256 façon Wave : en-tête `X-SIM-Signature: t=<ts>,v1=<hmac>`
//     sur le payload `<ts>.<corps_brut>` (voir security.ts::verifyWaveSignature)
//   - une tentative immédiate à l'émission, puis retries à backoff croissant
//     rejoués par un cron (index.ts) ; abandon après 6 tentatives ou 24 h
//   - chaque tentative est tracée dans PartnerWebhookDelivery
// =====================================================================

/** Délais (minutes) avant la n-ième nouvelle tentative. Au-delà → abandon. */
const BACKOFF_MINUTES = [1, 5, 30, 120, 360];
const DELAI_ABANDON_MS = 24 * 60 * 60 * 1000;
const TIMEOUT_REQUETE_MS = 10_000;

/**
 * Refus basique des URL manifestement internes (défense en profondeur —
 * l'URL est déjà posée par un super-administrateur). HTTPS obligatoire.
 */
export function webhookUrlValide(url: string): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.protocol !== "https:") return false;
  const h = u.hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal")) return false;
  if (h === "127.0.0.1" || h === "0.0.0.0" || h === "::1") return false;
  if (/^10\./.test(h) || /^192\.168\./.test(h) || /^169\.254\./.test(h)) return false;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return false;
  return true;
}

function signer(corps: string, secret: string, timestamp: number): string {
  return crypto.createHmac("sha256", secret).update(`${timestamp}.${corps}`, "utf8").digest("hex");
}

/**
 * Exécute une tentative de livraison et met à jour la ligne (statut,
 * compteur, prochaine tentative). Idempotent : ne fait rien si déjà livrée.
 */
async function tenterLivraison(
  livraison: PartnerWebhookDelivery,
  url: string,
  secret: string
): Promise<void> {
  if (livraison.statut === "livre") return;

  const corps = JSON.stringify({
    evenement: livraison.evenement,
    cree_le: livraison.createdAt.toISOString(),
    donnees: livraison.payload,
  });
  const ts = Math.floor(Date.now() / 1000);

  let statusCode: number | null = null;
  let livree = false;
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-SIM-Signature": `t=${ts},v1=${signer(corps, secret, ts)}`,
        "X-SIM-Evenement": livraison.evenement,
        "User-Agent": "SIM-Assurances-Webhook/1",
      },
      body: corps,
      signal: AbortSignal.timeout(TIMEOUT_REQUETE_MS),
    });
    statusCode = resp.status;
    livree = resp.status >= 200 && resp.status < 300;
  } catch {
    livree = false;
  }

  const tentatives = livraison.tentatives + 1;

  if (livree) {
    await prisma.partnerWebhookDelivery.update({
      where: { id: livraison.id },
      data: {
        statut: "livre",
        tentatives,
        dernierStatusCode: statusCode,
        livreAt: new Date(),
        prochaineTentativeAt: null,
      },
    });
    return;
  }

  const abandon =
    tentatives > BACKOFF_MINUTES.length ||
    Date.now() - livraison.createdAt.getTime() > DELAI_ABANDON_MS;
  const delaiMin = BACKOFF_MINUTES[Math.min(tentatives - 1, BACKOFF_MINUTES.length - 1)];

  await prisma.partnerWebhookDelivery.update({
    where: { id: livraison.id },
    data: {
      statut: abandon ? "echec" : "en_attente",
      tentatives,
      dernierStatusCode: statusCode,
      prochaineTentativeAt: abandon ? null : new Date(Date.now() + delaiMin * 60_000),
    },
  });
}

/**
 * Émet un événement vers le partenaire propriétaire de `apiKeyId`. No-op si la
 * clé n'a pas d'URL webhook, si elle n'est pas active, ou si l'événement n'est
 * pas souscrit (`webhookEvents`) — sauf `ignorerFiltre` (endpoint de test).
 * Crée la ligne de livraison puis tente une première fois en arrière-plan ; la
 * fonction rend la main dès la ligne créée (elle ne bloque pas l'appelant sur
 * le `fetch`).
 */
export async function emettreWebhook(
  apiKeyId: string,
  evenement: EvenementWebhook | "test",
  payload: Record<string, unknown>,
  ignorerFiltre = false
): Promise<void> {
  const cle = await prisma.partnerApiKey.findUnique({
    where: { id: apiKeyId },
    select: { webhookUrl: true, webhookSecret: true, webhookEvents: true, statut: true },
  });
  if (!cle || cle.statut !== "active" || !cle.webhookUrl || !cle.webhookSecret) return;
  if (!ignorerFiltre && !cle.webhookEvents.includes(evenement)) return;
  if (!webhookUrlValide(cle.webhookUrl)) {
    console.error("[partnerWebhook] URL invalide, émission ignorée", cle.webhookUrl);
    return;
  }

  const livraison = await prisma.partnerWebhookDelivery.create({
    data: {
      apiKeyId,
      evenement,
      payload: JSON.parse(JSON.stringify(payload)),
      url: cle.webhookUrl,
    },
  });

  void tenterLivraison(livraison, cle.webhookUrl, cle.webhookSecret).catch((e) =>
    console.error("[partnerWebhook] tentative immédiate", e)
  );
}

/**
 * Rejoue les livraisons en attente dont l'heure de nouvelle tentative est
 * passée. Appelé par un cron (index.ts). Abandonne une livraison dont la clé a
 * entre-temps été révoquée ou dont le webhook a été retiré.
 */
export async function rejouerWebhooksEnAttente(): Promise<void> {
  const enAttente = await prisma.partnerWebhookDelivery.findMany({
    where: {
      statut: "en_attente",
      OR: [{ prochaineTentativeAt: null }, { prochaineTentativeAt: { lte: new Date() } }],
    },
    orderBy: { createdAt: "asc" },
    take: 50,
  });
  if (enAttente.length === 0) return;

  const clesParId = new Map<string, { url: string; secret: string } | null>();
  for (const livraison of enAttente) {
    if (!clesParId.has(livraison.apiKeyId)) {
      const k = await prisma.partnerApiKey.findUnique({
        where: { id: livraison.apiKeyId },
        select: { webhookUrl: true, webhookSecret: true, statut: true },
      });
      clesParId.set(
        livraison.apiKeyId,
        k && k.statut === "active" && k.webhookUrl && k.webhookSecret
          ? { url: k.webhookUrl, secret: k.webhookSecret }
          : null
      );
    }
    const cle = clesParId.get(livraison.apiKeyId) ?? null;
    if (!cle) {
      await prisma.partnerWebhookDelivery.update({
        where: { id: livraison.id },
        data: { statut: "echec", prochaineTentativeAt: null },
      });
      continue;
    }
    await tenterLivraison(livraison, cle.url, cle.secret);
  }
}
