import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";

import { authRouter } from "./routes/auth.js";
import { partenairesRouter } from "./routes/partenaires.js";
import { souscriptionsRouter } from "./routes/souscriptions.js";
import { statsRouter } from "./routes/stats.js";
import { journalRouter } from "./routes/journal.js";
import { adminsRouter } from "./routes/admins.js";
import { parametresRouter } from "./routes/parametres.js";
import { meRouter } from "./routes/me.js";
import { publicRouter } from "./routes/public.js";
import { commissionsRouter } from "./routes/commissions.js";
import { notificationsRouter } from "./routes/notifications.js";
import { relaxRouter } from "./routes/relax.js";
import { requestContext } from "./context.js";
import { authLimiter, publicLimiter } from "./security.js";
import { requireAuth, requireBranche } from "./auth.js";

const app = express();
// 1 seul proxy en amont (Traefik). Évite le contournement du rate limiter
// signalé par express-rate-limit quand "trust proxy" vaut true.
app.set("trust proxy", 1);

// En-têtes de sécurité HTTP (anti-clickjacking, MIME-sniffing, HSTS, etc.)
app.use(helmet());

// CORS restreint au domaine du frontend (configurable via CORS_ORIGIN, sinon APP_PUBLIC_URL)
const allowedOrigins = (process.env.CORS_ORIGIN || process.env.APP_PUBLIC_URL || "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);
app.use(
  cors({
    origin: allowedOrigins.length ? allowedOrigins : true,
    credentials: true,
  })
);

// Conserve le corps brut des requêtes pour vérifier la signature du webhook Wave
app.use(
  express.json({
    limit: "5mb",
    verify: (req, _res, buf) => {
      (req as { rawBody?: Buffer }).rawBody = buf;
    },
  })
);

// Capture l'IP de chaque requête dans un contexte async accessible par logAction
app.use((req, _res, next) => {
  const ip =
    (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
    req.ip ||
    req.socket.remoteAddress ||
    undefined;
  requestContext.run({ ip }, next);
});

app.get("/api/health", (_req, res) => res.json({ ok: true, publicUrl: process.env.APP_PUBLIC_URL ?? "(non défini)" }));

app.use("/api/auth", authLimiter, authRouter);
app.use("/api/public", publicLimiter, publicRouter);
app.use("/api/partenaires", partenairesRouter);
// Incendie/Accident et Relax sont deux branches métier distinctes : ces routeurs
// exposent des données exclusives à chacune, donc restreints à l'admin ayant la
// branche correspondante (un SUPER_ADMIN a toujours accès aux deux).
app.use(
  "/api/souscriptions",
  requireAuth("admin"),
  requireBranche("INCENDIE_ACCIDENT"),
  souscriptionsRouter
);
app.use(
  "/api/stats",
  requireAuth("admin"),
  requireBranche("INCENDIE_ACCIDENT"),
  statsRouter
);
app.use("/api/journal", journalRouter);
app.use("/api/admins", adminsRouter);
app.use("/api/parametres", parametresRouter);
app.use("/api/me", meRouter);
app.use("/api/commissions", commissionsRouter);
app.use("/api/notifications", notificationsRouter);
app.use(
  "/api/relax",
  requireAuth("admin"),
  requireBranche("RELAX"),
  relaxRouter
);

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof ZodError) {
    return res.status(400).json({ error: "Données invalides", details: err.errors });
  }
  console.error(err);
  res.status(500).json({ error: "Erreur serveur" });
});

const PORT = Number(process.env.PORT) || 4000;
app.listen(PORT, () => console.log(`API SIM Assurances sur http://localhost:${PORT}`));
