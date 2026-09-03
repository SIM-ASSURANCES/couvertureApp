import { Router, type Request } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { lireTokenOptionnel } from "../auth.js";
import { asyncHandler } from "../util.js";
import { htmlToPng } from "../services/pdf.js";
import { renderCarteHtml, CARTE_WIDTH, CARTE_HEIGHT, type CarteData } from "../services/carteHtml.js";
import { SEXE_LABELS, garantieAffichee, resoudreDateNaissance } from "../services/carteRender.js";

export const cartesRouter = Router();

const bodySchema = z.object({
  type: z.enum(["incendie", "accident", "relaxmoto", "relaxauto", "relaxaccidents_fraismedicaux", "relaxvoyage"]),
  souscriptionId: z.string().min(10).max(60),
  // Preuve de paiement, pour le parcours public juste après souscription (le
  // client n'a pas encore de compte à ce moment) — voir autoriserAcces.
  paiementId: z.string().min(10).max(60).optional(),
});

/**
 * La carte porte des données personnelles (photo, nom, date de naissance) :
 * elle n'est servie qu'à un demandeur légitime. Trois voies, dans l'ordre où
 * elles se présentent en pratique :
 *   1. un admin authentifié (pages Contrats/Clients) ;
 *   2. le client connecté, pour sa propre souscription (espace client) ;
 *   3. un `paiementId` confirmé rattaché à cette souscription — le seul cas
 *      public, celui du retour de paiement Wave où le compte client vient
 *      tout juste d'être créé (voir pages/public/Souscription.tsx).
 */
async function autoriserAcces(
  req: Request,
  type: string,
  souscriptionId: string,
  paiementId?: string
): Promise<boolean> {
  const user = lireTokenOptionnel(req.headers.authorization);
  if (user?.type === "admin") return true;
  if (user?.type === "client" && user.sub === souscriptionId) return true;

  if (paiementId) {
    const p = await prisma.paiement.findUnique({ where: { id: paiementId } });
    if (p && p.souscriptionId === souscriptionId && p.statut === "paye") return true;
  }

  // Modèles historiques (Incendie/Accident) : ils n'ont pas de lignes Paiement,
  // donc aucune preuve de paiement à présenter, et leur parcours public de
  // complétion dépend de cet accès. Ces deux produits ne sont plus proposés à
  // la souscription (remplacés par RelaxAccidents Frais Médicaux et le modèle
  // générique) — exception volontairement limitée à eux.
  if (type === "incendie" || type === "accident") return true;

  return false;
}

const sanitizeFilename = (s: string) => s.replace(/[^a-zA-Z0-9-_]+/g, "-");

/** Génère la carte virtuelle de prise en charge (PNG) — texte réel + photo du souscripteur. */
cartesRouter.post(
  "/png",
  asyncHandler(async (req, res) => {
    const body = bodySchema.parse(req.body);

    if (!(await autoriserAcces(req, body.type, body.souscriptionId, body.paiementId))) {
      return res.status(403).json({ error: "Accès non autorisé à cette carte." });
    }

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
        dateNaissance: (await resoudreDateNaissance(s.dateNaissance, s.telephone))?.toISOString() ?? null,
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
        dateNaissance: (await resoudreDateNaissance(s.dateNaissance, s.telephone))?.toISOString() ?? null,
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
      const { label, montant } = garantieAffichee(s.produit.code, s.capitalGaranti);
      carte = {
        matricule: s.numeroPolice ?? "",
        nom: s.nom ?? "",
        prenom: s.prenom ?? "",
        dateNaissance: (await resoudreDateNaissance(s.dateNaissance, s.telephone))?.toISOString() ?? null,
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
