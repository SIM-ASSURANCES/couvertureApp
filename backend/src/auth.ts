import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

function loadSecret(): string {
  const s = process.env.JWT_SECRET;
  if (!s || s.length < 32) {
    throw new Error(
      "JWT_SECRET manquant ou trop court (32 caractères minimum requis). " +
        "Définissez une valeur forte dans les variables d'environnement."
    );
  }
  return s;
}

const SECRET = loadSecret();

export type ActorType = "admin" | "partenaire";

export interface AuthUser {
  sub: string;
  type: ActorType;
  role?: "ADMIN" | "SUPER_ADMIN";
  nom?: string;
}

export function signToken(user: AuthUser): string {
  return jwt.sign(user, SECRET, { expiresIn: "12h" });
}

export interface AuthedRequest extends Request {
  user?: AuthUser;
}

export function requireAuth(...types: ActorType[]) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Non authentifié" });
    }
    try {
      const payload = jwt.verify(header.slice(7), SECRET) as AuthUser;
      if (types.length && !types.includes(payload.type)) {
        return res.status(403).json({ error: "Accès refusé" });
      }
      req.user = payload;
      next();
    } catch {
      return res.status(401).json({ error: "Session expirée" });
    }
  };
}

export function requireSuperAdmin(
  req: AuthedRequest,
  res: Response,
  next: NextFunction
) {
  if (req.user?.role !== "SUPER_ADMIN") {
    return res.status(403).json({ error: "Réservé au Super Administrateur" });
  }
  next();
}
