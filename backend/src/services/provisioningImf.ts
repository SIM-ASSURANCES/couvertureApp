import { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { CATALOGUE_PRODUITS_IMF, garantiesInitiales } from "./cataloguesImf.js";
import {
  SECURPRO_DEFAUT,
  SECURSTOCK_DEFAUT,
  PALIERS_SECURECOLTE_DEFAUT,
  TARIFS_FIXES_DEFAUT,
  PRODUITS_TARIF_FIXE_IMF,
} from "./baremesImfDefaut.js";

/**
 * Provisionnement (idempotent) du paramétrage d'une IMF partenaire — appelé à
 * la création de l'IMF, et en filet de sécurité au premier chargement des
 * onglets « Produits & garanties » / « Barèmes & tarifs » et du simulateur
 * (routes/imfPartenaires.ts et routes/imfPartenairesReseau.ts).
 */

/** Une ligne ImfProduit par produit du catalogue de référence. */
export async function ensureProduitsImf(imfId: string, tx: Prisma.TransactionClient = prisma): Promise<void> {
  const existants = await tx.imfProduit.findMany({ where: { imfId }, select: { code: true } });
  const presents = new Set(existants.map((p) => p.code));
  const manquants = CATALOGUE_PRODUITS_IMF.filter((p) => !presents.has(p.code));
  if (manquants.length === 0) return;
  await tx.imfProduit.createMany({
    data: manquants.map((p) => ({ imfId, code: p.code, actif: true, garanties: garantiesInitiales(p.code) })),
    skipDuplicates: true,
  });
}

/**
 * Barèmes / tarifs de l'IMF. Chaque famille est copiée UNE fois : d'abord
 * depuis la table globale correspondante (valeurs *live*, éventuellement déjà
 * ajustées par un admin), sinon depuis les valeurs par défaut du dossier TARIFS.
 */
export async function ensureBaremesImf(imfId: string, tx: Prisma.TransactionClient = prisma): Promise<void> {
  // SECURPRO
  if ((await tx.imfBaremeSecurpro.count({ where: { imfId } })) === 0) {
    const live = await tx.baremeSecurpro.findMany({ orderBy: { classe: "asc" } });
    const src = live.length
      ? live.map((b) => ({ classe: b.classe, limiteCapital: b.limiteCapital, tauxIncendie: b.tauxIncendie, tauxCommission: b.tauxCommission }))
      : SECURPRO_DEFAUT;
    await tx.imfBaremeSecurpro.createMany({ data: src.map((b) => ({ imfId, ...b })), skipDuplicates: true });
  }
  // SECURSTOCK
  if ((await tx.imfBaremeSecurstock.count({ where: { imfId } })) === 0) {
    const live = await tx.baremeSecurstock.findMany({ orderBy: { classe: "asc" } });
    const src = live.length
      ? live.map((b) => ({
          classe: b.classe,
          limiteCapital: b.limiteCapital,
          tauxDommageElectrique: b.tauxDommageElectrique,
          tauxAutreCause: b.tauxAutreCause,
          tauxCommission: b.tauxCommission,
        }))
      : SECURSTOCK_DEFAUT;
    await tx.imfBaremeSecurstock.createMany({ data: src.map((b) => ({ imfId, ...b })), skipDuplicates: true });
  }
  // SECURECOLTE — paliers de sécheresse
  if ((await tx.imfPalierSecurecolte.count({ where: { imfId } })) === 0) {
    const live = await tx.palierSecurecolte.findMany();
    const src = live.length
      ? live.map((p) => ({ seuil: p.seuil, pourcentageIndice: p.pourcentageIndice, montantIndemnite: p.montantIndemnite }))
      : PALIERS_SECURECOLTE_DEFAUT;
    await tx.imfPalierSecurecolte.createMany({ data: src.map((p) => ({ imfId, ...p })), skipDuplicates: true });
  }
  // Tarifs fixes COUPS DURS / SECURECOLTE
  if ((await tx.imfTarifFixe.count({ where: { imfId } })) === 0) {
    const live = await tx.tarifProduit.findMany({
      where: { produit: { code: { in: [...PRODUITS_TARIF_FIXE_IMF] } } },
      include: { produit: { select: { code: true } } },
    });
    const src = live.length
      ? live
          .filter((t) => t.libelleVariante)
          .map((t) => ({
            produitCode: t.produit.code,
            libelleVariante: t.libelleVariante as string,
            prime: t.prime,
            primeHT: t.primeHT,
            fg: t.fg,
            taxes: t.taxes,
            capitalGaranti: t.capitalGaranti,
            commission: t.commission,
          }))
      : TARIFS_FIXES_DEFAUT.map((t) => ({
          produitCode: t.produitCode,
          libelleVariante: t.libelleVariante,
          prime: t.prime,
          primeHT: t.primeHT ?? null,
          fg: t.fg ?? null,
          taxes: t.taxes ?? null,
          capitalGaranti: t.capitalGaranti,
          commission: t.commission,
        }));
    if (src.length) {
      await tx.imfTarifFixe.createMany({ data: src.map((t) => ({ imfId, ...t })), skipDuplicates: true });
    }
  }
}
