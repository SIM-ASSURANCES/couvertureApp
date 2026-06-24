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
} | null {
  const raw = localStorage.getItem("sim_user");
  return raw ? JSON.parse(raw) : null;
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
    localStorage.removeItem("sim_token");
    localStorage.removeItem("sim_user");
    if (!location.pathname.startsWith("/login") && location.pathname !== "/") {
      location.href = "/";
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
