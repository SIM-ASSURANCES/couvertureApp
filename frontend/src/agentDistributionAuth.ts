import { API_BASE } from "./api";

const BASE = API_BASE;
const TOKEN_KEY = "sim_agentdist_token";
const USER_KEY = "sim_agentdist_user";

export interface AgentDistributionUser {
  id: string;
  nom: string;
  telephone: string;
  type: "agent_distribution";
  produit: "incendie" | "accident";
  partenaireNom: string;
}

export function getAgentDistToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function getAgentDistUser(): AgentDistributionUser | null {
  const raw = localStorage.getItem(USER_KEY);
  return raw ? JSON.parse(raw) : null;
}

export async function agentDistLogin(telephone: string, motDePasse: string): Promise<AgentDistributionUser> {
  const res = await fetch(`${BASE}/auth/agent-distribution/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ telephone, motDePasse }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Identifiants invalides");
  localStorage.setItem(TOKEN_KEY, data.token);
  localStorage.setItem(USER_KEY, JSON.stringify(data.user));
  return data.user;
}

export function agentDistLogout() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export class AgentDistApiError extends Error {}

async function agentDistRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getAgentDistToken();
  const res = await fetch(`${BASE}/agent-distribution${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
  if (res.status === 401) {
    agentDistLogout();
    if (location.pathname !== "/agent-distribution/connexion") location.href = "/agent-distribution/connexion";
  }
  if (!res.ok) {
    let msg = "Erreur";
    try {
      msg = (await res.json()).error || msg;
    } catch {
      /* ignore */
    }
    throw new AgentDistApiError(msg);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const agentDistApi = {
  get: <T>(p: string) => agentDistRequest<T>(p),
  patch: <T>(p: string, body?: unknown) => agentDistRequest<T>(p, { method: "PATCH", body: JSON.stringify(body ?? {}) }),
};
