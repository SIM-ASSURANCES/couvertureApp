import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

const SECRET = process.env.JWT_SECRET || "dev-secret";

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
