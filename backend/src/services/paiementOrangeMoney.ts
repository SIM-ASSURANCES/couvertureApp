/**
 * Orange Money côté SIM : relie une tentative Orange (TentativeOrangeMoney) à la ligne qu'elle paie
 * et confirme la souscription. Appelé par la notification Orange, par la page de retour et par les
 * routes /verify (filet si la notification se perd). L'API Orange elle-même est dans orangeMoney.ts.
 */
import type { TentativeOrangeMoney } from "@prisma/client";
import { prisma } from "../db.js";
import { confirmerEcheance } from "./paiementWave.js";
import { confirmerAccident } from "./accident.js";
import { interpreterStatutOrangeMoney, statutTransactionOrangeMoney, type IssueOrangeMoney } from "./orangeMoney.js";

export type CibleOrangeMoney = "echeance" | "accident";

/** Statuts Orange définitifs : la tentative n'est plus interrogée. */
const STATUTS_FINAUX = new Set(["SUCCESS", "FAILED", "EXPIRED", "ERREUR"]);

/**
 * Enregistre le statut Orange d'une tentative et, si le paiement a réussi, confirme la ligne payée
 * (idempotent : confirmerEcheance/confirmerAccident ne refont rien sur une ligne déjà confirmée).
 * Le montant payé chez Orange est celui de la tentative ; il doit toujours égaler le montant dû,
 * relu en base — sinon rien n'est confirmé (incident journalisé pour traitement manuel).
 */
export async function appliquerStatutOrangeMoney(
  t: TentativeOrangeMoney,
  status: string,
  txnid?: string | null
): Promise<IssueOrangeMoney> {
  const issue = interpreterStatutOrangeMoney(status);
  await prisma.tentativeOrangeMoney.update({
    where: { id: t.id },
    data: { statut: status.toUpperCase(), txnid: txnid ?? t.txnid },
  });
  if (issue !== "paye") return issue;

  const reference = txnid || t.txnid || `OM-${t.id}`;
  if (t.cible === "echeance") {
    const p = await prisma.paiement.findUnique({ where: { id: t.cibleId } });
    if (!p) return "echoue";
    if (p.statut === "paye") return "paye";
    if (p.montant !== t.montant) {
      console.error(`[OrangeMoney] montant incohérent échéance ${p.id} : payé ${t.montant}, dû ${p.montant} (tentative ${t.id})`);
      return "en_attente";
    }
    await prisma.paiement.update({ where: { id: p.id }, data: { orangeMoneyTransactionId: reference } });
    await confirmerEcheance({ ...p, orangeMoneyTransactionId: reference });
    return "paye";
  }

  const s = await prisma.souscriptionAccident.findUnique({ where: { id: t.cibleId } });
  if (!s) return "echoue";
  if (s.waveStatut === "confirme" && !s.renouvellementEnCoursDepuis) return "paye";
  if (s.montantPrime !== t.montant) {
    console.error(`[OrangeMoney] montant incohérent accident ${s.id} : payé ${t.montant}, dû ${s.montantPrime} (tentative ${t.id})`);
    return "en_attente";
  }
  await prisma.souscriptionAccident.update({ where: { id: s.id }, data: { orangeMoneyTransactionId: reference } });
  await confirmerAccident(s);
  return "paye";
}

/** Interroge Orange pour une tentative non finale et applique le résultat ; `null` si Orange ne répond pas. */
export async function synchroniserTentativeOrangeMoney(t: TentativeOrangeMoney): Promise<IssueOrangeMoney | null> {
  if (STATUTS_FINAUX.has(t.statut)) return interpreterStatutOrangeMoney(t.statut);
  if (!t.payToken) return null;
  const r = await statutTransactionOrangeMoney({ orderId: t.id, montant: t.montant, payToken: t.payToken });
  if (!r) return null;
  return appliquerStatutOrangeMoney(t, r.status, r.txnid);
}

/**
 * Filet des routes /verify : si une tentative Orange encore ouverte existe pour cette ligne, on
 * demande son statut à Orange. Ne lève jamais (une panne Orange ne doit pas casser la vérification
 * Wave qui suit).
 */
export async function synchroniserOrangeMoneyPour(cible: CibleOrangeMoney, cibleId: string): Promise<void> {
  try {
    const ouvertes = await prisma.tentativeOrangeMoney.findMany({
      where: { cible, cibleId, statut: { in: ["INITIATED", "PENDING"] } },
      orderBy: { createdAt: "desc" },
      take: 3,
    });
    for (const t of ouvertes) {
      if ((await synchroniserTentativeOrangeMoney(t)) === "paye") return;
    }
  } catch (e) {
    console.error("[OrangeMoney] synchronisation", cible, cibleId, e);
  }
}
