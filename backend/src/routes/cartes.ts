import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { asyncHandler } from "../util.js";
import { htmlToPng } from "../services/pdf.js";
import { renderCarteHtml, CARTE_WIDTH, CARTE_HEIGHT, type CarteData } from "../services/carteHtml.js";

export const cartesRouter = Router();

const bodySchema = z.object({
  type: z.enum(["incendie", "accident", "relaxmoto", "relaxauto"]),
  souscriptionId: z.string().min(10).max(60),
});

const sanitizeFilename = (s: string) => s.replace(/[^a-zA-Z0-9-_]+/g, "-");

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
      carte = {
        matricule: `POL-INC-${debut.getFullYear()}-${s.id.slice(0, 8).toUpperCase()}`,
        nom: s.nom ?? "",
        prenom: s.prenom ?? "",
        dateNaissance: s.dateNaissance ? s.dateNaissance.toISOString() : null,
        photoDataUrl: s.selfieUrl,
      };
    } else if (body.type === "accident") {
      const s = await prisma.souscriptionAccident.findUnique({ where: { id: body.souscriptionId } });
      if (!s || s.waveStatut !== "confirme") return res.status(404).json({ error: "Souscription non disponible" });
      if (!s.pieceIdentiteUrl || !s.selfieUrl) {
        return res.status(400).json({ error: "Complétez d'abord vos photos (pièce d'identité + selfie)." });
      }
      carte = {
        matricule: s.numeroPolice ?? "",
        nom: s.nom,
        prenom: s.prenom,
        dateNaissance: s.dateNaissance ? s.dateNaissance.toISOString() : null,
        photoDataUrl: s.selfieUrl,
      };
    } else {
      const s = await prisma.souscription.findUnique({
        where: { id: body.souscriptionId },
        include: { documents: true },
      });
      if (!s || s.waveStatut !== "confirme") return res.status(404).json({ error: "Souscription non disponible" });
      const selfie = s.documents
        .filter((d) => d.type === "Selfie")
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
      if (!selfie) {
        return res.status(400).json({ error: "Photo selfie introuvable pour cette souscription." });
      }
      carte = {
        matricule: s.numeroPolice ?? "",
        nom: s.nom ?? "",
        prenom: s.prenom ?? "",
        dateNaissance: s.dateNaissance ? s.dateNaissance.toISOString() : null,
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
