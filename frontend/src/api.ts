export const API_BASE =
  import.meta.env.VITE_API_URL ?? "http://localhost:4000/api";
const BASE = API_BASE;

export function getToken() {
  return localStorage.getItem("sim_token");
}
export function getUser(): {
  type: "admin" | "partenaire";
  nom: string;
  email?: string;
  commerce?: string;
  role?: "ADMIN" | "SUPER_ADMIN";
  branches?: ("INCENDIE_ACCIDENT" | "RELAX" | "IMF" | "IMF_PARTENAIRES")[];
} | null {
  const raw = localStorage.getItem("sim_user");
  return raw ? JSON.parse(raw) : null;
}

/**
 * Page de connexion propre à un type de compte. Depuis la séparation des
 * espaces (2026-09-18), "/" n'accepte QUE les administrateurs : y renvoyer un
 * partenaire (déconnexion, session expirée…) lui faisait saisir ses
 * identifiants sur la page admin, qui les refusait toujours — d'où « mon
 * nouveau mot de passe n'est pas reconnu ». La page partenaire accepte aussi
 * les agents IMF (repli automatique, voir pages/partenaire/Login.tsx).
 */
export function pageConnexion(type: string | null | undefined): string {
  return type === "partenaire" || type === "agent_imf" ? "/partenaire/connexion" : "/";
}

export class ApiError extends Error {}

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getToken();
  const res = await fetch(BASE + path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
  if (res.status === 401) {
    // Type lu AVANT d'effacer la session ; à défaut, déduit de l'URL courante.
    const type =
      getUser()?.type ??
      (/^\/(partenaire|agent-imf)(\/|$)/.test(location.pathname) ? "partenaire" : null);
    localStorage.removeItem("sim_token");
    localStorage.removeItem("sim_user");
    if (
      !location.pathname.startsWith("/login") &&
      !location.pathname.endsWith("/connexion") &&
      location.pathname !== "/"
    ) {
      location.href = pageConnexion(type);
    }
  }
  if (!res.ok) {
    let msg = "Erreur";
    try {
      msg = (await res.json()).error || msg;
    } catch {
      /* ignore */
    }
    throw new ApiError(msg);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  get: <T>(p: string) => request<T>(p),
  post: <T>(p: string, body?: unknown) =>
    request<T>(p, { method: "POST", body: JSON.stringify(body ?? {}) }),
  patch: <T>(p: string, body?: unknown) =>
    request<T>(p, { method: "PATCH", body: JSON.stringify(body ?? {}) }),
  put: <T>(p: string, body?: unknown) =>
    request<T>(p, { method: "PUT", body: JSON.stringify(body ?? {}) }),
  del: <T>(p: string) => request<T>(p, { method: "DELETE" }),
};

export async function downloadCsv(path: string, filename: string) {
  const token = getToken();
  const res = await fetch(BASE + path, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new ApiError("Export impossible");
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
