import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { asyncHandler } from "../util.js";
import { htmlToPng } from "../services/pdf.js";
import { renderCarteHtml, CARTE_WIDTH, CARTE_HEIGHT, type CarteData } from "../services/carteHtml.js";

export const cartesRouter = Router();

const bodySchema = z.object({
  type: z.enum(["incendie", "accident", "relaxmoto", "relaxauto", "relaxaccidents_fraismedicaux", "relaxvoyage"]),
  souscriptionId: z.string().min(10).max(60),
});

const sanitizeFilename = (s: string) => s.replace(/[^a-zA-Z0-9-_]+/g, "-");

const SEXE_LABELS: Record<string, string> = { masculin: "Masculin", feminin: "Féminin" };

/**
 * Libellé + montant de la garantie affichée dans la bannière de la carte
 * (refonte Novelia) — adapté par produit : "FMP" (Frais Médicaux et
 * Pharmaceutiques) pour RelaxAccidents Frais Médicaux, "DÉCÈS/IPT" pour
 * RelaxVoyage (capitalGaranti y porte ce montant, voir seed.ts), "CAPITAL
 * GARANTI" en générique pour les autres produits (RelaxMoto/Auto, Incendie,
 * ancien Accident).
 */
function garantieAffichee(produitCode: string, capitalGaranti: number): { label: string; montant: number } {
  if (produitCode === "relaxaccidents_fraismedicaux") return { label: "FMP", montant: capitalGaranti };
  if (produitCode === "relaxvoyage") return { label: "DÉCÈS/IPT", montant: capitalGaranti };
  return { label: "CAPITAL GARANTI", montant: capitalGaranti };
}

/** Génère la carte virtuelle de prise en charge (PNG) — texte réel + photo du souscripteur. */
cartesRouter.post(
  "/png",
  asyncHandler(async (req, res) => {
    const body = bodySchema.parse(req.body);

    let carte: CarteData;

    if (body.type === "incendie") {
      const s = await prisma.souscriptionIncendie.findUnique({ where: { id: body.souscriptionId } });
      if (!s) return res.status(404).json({ error: "Souscription introuvable" });
      if (!s.pieceIdentiteUrl || !s.selfieUrl) {
        return res.status(400).json({ error: "Complétez d'abord vos photos (pièce d'identité + selfie)." });
      }
      const debut = s.createdAt;
      const { label, montant } = garantieAffichee("incendie", s.capitalGaranti);
      carte = {
        matricule: `POL-INC-${debut.getFullYear()}-${s.id.slice(0, 8).toUpperCase()}`,
        nom: s.nom ?? "",
        prenom: s.prenom ?? "",
        dateNaissance: s.dateNaissance ? s.dateNaissance.toISOString() : null,
        dateDebut: debut.toISOString(),
        sexeLabel: null,
        garantieLabel: label,
        garantieMontant: montant,
        photoDataUrl: s.selfieUrl,
      };
    } else if (body.type === "accident") {
      const s = await prisma.souscriptionAccident.findUnique({ where: { id: body.souscriptionId } });
      if (!s || s.waveStatut !== "confirme") return res.status(404).json({ error: "Souscription non disponible" });
      if (!s.pieceIdentiteUrl || !s.selfieUrl) {
        return res.status(400).json({ error: "Complétez d'abord vos photos (pièce d'identité + selfie)." });
      }
      const { label, montant } = garantieAffichee("accident", s.capitalGaranti);
      carte = {
        matricule: s.numeroPolice ?? "",
        nom: s.nom,
        prenom: s.prenom,
        dateNaissance: s.dateNaissance ? s.dateNaissance.toISOString() : null,
        dateDebut: s.dateDebut ? s.dateDebut.toISOString() : null,
        sexeLabel: null,
        garantieLabel: label,
        garantieMontant: montant,
        photoDataUrl: s.selfieUrl,
      };
    } else {
      const s = await prisma.souscription.findUnique({
        where: { id: body.souscriptionId },
        include: { documents: true, produit: { select: { code: true } } },
      });
      if (!s || s.waveStatut !== "confirme") return res.status(404).json({ error: "Souscription non disponible" });
      const selfie = s.documents
        .filter((d) => d.type === "Selfie")
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
      if (!selfie) {
        return res.status(400).json({ error: "Photo selfie introuvable pour cette souscription." });
      }
      // Repli : certains produits (ex. RelaxMoto/RelaxAuto avant l'ajout du
      // champ à leur formulaire) n'ont pas collecté la date de naissance sur
      // CETTE souscription — on la reprend d'un autre contrat confirmé du
      // même client (même téléphone) si elle y est disponible, plutôt que de
      // laisser la carte sans date de naissance alors que l'info est connue.
      let dateNaissance = s.dateNaissance;
      if (!dateNaissance) {
        const autre = await prisma.souscription.findFirst({
          where: { telephone: s.telephone, dateNaissance: { not: null } },
          orderBy: { createdAt: "desc" },
          select: { dateNaissance: true },
        });
        dateNaissance = autre?.dateNaissance ?? null;
      }

      const { label, montant } = garantieAffichee(s.produit.code, s.capitalGaranti);
      carte = {
        matricule: s.numeroPolice ?? "",
        nom: s.nom ?? "",
        prenom: s.prenom ?? "",
        dateNaissance: dateNaissance ? dateNaissance.toISOString() : null,
        dateDebut: s.dateDebut ? s.dateDebut.toISOString() : null,
        sexeLabel: s.sexe ? SEXE_LABELS[s.sexe] ?? null : null,
        garantieLabel: label,
        garantieMontant: montant,
        photoDataUrl: selfie.url,
      };
    }

    const html = renderCarteHtml(carte);
    const png = await htmlToPng(html, CARTE_WIDTH, CARTE_HEIGHT);
    const filename = `carte-${sanitizeFilename(carte.matricule || "sim")}.png`;
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(png);
  })
);
