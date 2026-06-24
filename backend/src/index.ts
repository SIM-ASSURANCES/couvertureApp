import "dotenv/config";
import express from "express";
import cors from "cors";
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

const app = express();
app.use(cors());
app.use(express.json({ limit: "5mb" }));

app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.use("/api/auth", authRouter);
app.use("/api/public", publicRouter);
app.use("/api/partenaires", partenairesRouter);
app.use("/api/souscriptions", souscriptionsRouter);
app.use("/api/stats", statsRouter);
app.use("/api/journal", journalRouter);
app.use("/api/admins", adminsRouter);
app.use("/api/parametres", parametresRouter);
app.use("/api/me", meRouter);

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof ZodError) {
    return res.status(400).json({ error: "Données invalides", details: err.errors });
  }
  console.error(err);
  res.status(500).json({ error: "Erreur serveur" });
});

const PORT = Number(process.env.PORT) || 4000;
app.listen(PORT, () => console.log(`API SIM Assurances sur http://localhost:${PORT}`));
