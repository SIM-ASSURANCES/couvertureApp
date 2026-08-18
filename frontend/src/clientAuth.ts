import { API_BASE } from "./api";

const BASE = API_BASE;
const TOKEN_KEY = "sim_client_token";
const USER_KEY = "sim_client_user";

export interface ClientUser {
  id: string;
  nom: string;
  telephone: string;
  type: "client";
  produitType: "generique" | "incendie" | "accident";
  produit: string;
  produitLibelle: string;
  numeroPolice: string | null;
}

export function getClientToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function getClientUser(): ClientUser | null {
  const raw = localStorage.getItem(USER_KEY);
  return raw ? JSON.parse(raw) : null;
}

export async function clientLogin(telephone: string, motDePasse: string): Promise<ClientUser> {
  const res = await fetch(`${BASE}/auth/client/login`, {
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

export function clientLogout() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export interface ClientProfilIdentite {
  nom: string | null;
  prenom: string | null;
  dateNaissance: string | null;
  sexe: "masculin" | "feminin" | null;
  typePiece: "CNI" | "Permis" | null;
  pieceIdentiteUrl: string | null;
  selfieUrl: string | null;
}

/**
 * Identité déjà connue du client, pour pré-remplir la souscription à un
 * nouveau produit (voir pages/public/Souscription.tsx). Ne passe volontairement
 * PAS par `clientApi` : celle-ci redirige vers /client/connexion sur 401, ce
 * qui casserait la page publique si le token est absent/expiré — ici on veut
 * un best-effort silencieux, jamais bloquant.
 */
export async function getClientProfilIdentite(): Promise<ClientProfilIdentite | null> {
  const token = getClientToken();
  if (!token) return null;
  try {
    const res = await fetch(`${BASE}/client/profil-identite`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export class ClientApiError extends Error {}

async function clientRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getClientToken();
  const res = await fetch(`${BASE}/client${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
  if (res.status === 401) {
    clientLogout();
    if (location.pathname !== "/client/connexion") location.href = "/client/connexion";
  }
  if (!res.ok) {
    let msg = "Erreur";
    try {
      msg = (await res.json()).error || msg;
    } catch {
      /* ignore */
    }
    throw new ClientApiError(msg);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const clientApi = {
  get: <T>(p: string) => clientRequest<T>(p),
  post: <T>(p: string, body?: unknown) => clientRequest<T>(p, { method: "POST", body: JSON.stringify(body ?? {}) }),
};
