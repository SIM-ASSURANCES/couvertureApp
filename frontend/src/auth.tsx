import {
  createContext,
  useContext,
  useState,
  type ReactNode,
} from "react";
import { Navigate } from "react-router-dom";
import { api, getUser } from "./api";

type Role = "ADMIN" | "SUPER_ADMIN";
export type BrancheAcces = "INCENDIE_ACCIDENT" | "RELAX" | "IMF";
export interface SessionUser {
  id: string;
  type: "admin" | "partenaire" | "agent_imf";
  nom: string;
  email?: string;
  commerce?: string;
  role?: Role;
  branches?: BrancheAcces[];
  produit?: "incendie" | "accident";
  // Agent IMF (type === "agent_imf")
  roleImf?: "AGENT" | "RESPONSABLE_ZONE";
  agenceNom?: string | null;
  zoneNom?: string | null;
}

interface AuthCtx {
  user: SessionUser | null;
  login: (email: string, password: string) => Promise<SessionUser>;
  logout: () => void;
}

const Ctx = createContext<AuthCtx>(null!);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(
    () => getUser() as SessionUser | null
  );

  async function login(email: string, password: string): Promise<SessionUser> {
    const res = await api.post<{ token: string; user: SessionUser }>(
      "/auth/login",
      { email, password }
    );
    localStorage.setItem("sim_token", res.token);
    localStorage.setItem("sim_user", JSON.stringify(res.user));
    setUser(res.user);
    return res.user;
  }

  function logout() {
    localStorage.removeItem("sim_token");
    localStorage.removeItem("sim_user");
    setUser(null);
  }

  return <Ctx.Provider value={{ user, login, logout }}>{children}</Ctx.Provider>;
}

export function RequireAuth({
  type,
  children,
}: {
  type: "admin" | "partenaire" | "agent_imf";
  children: ReactNode;
}) {
  const { user } = useAuth();
  if (!user || user.type !== type) return <Navigate to="/" replace />;
  return <>{children}</>;
}
