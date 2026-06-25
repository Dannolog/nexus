"use client";

// Client-seitiger API-Helfer für die Nexus-UI. Token liegt im localStorage.
const TOKEN_KEY = "nexus_token";
const USER_KEY = "nexus_user";

export function getToken() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}
export function getUser(): any {
  if (typeof window === "undefined") return null;
  try {
    return JSON.parse(localStorage.getItem(USER_KEY) || "null");
  } catch {
    return null;
  }
}
export function setSession(token: string, user: any) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}
export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export class ConflictError extends Error {
  current: any;
  constructor(current: any) {
    super("Versionskonflikt");
    this.current = current;
  }
}

export async function api(path: string, opts: RequestInit = {}) {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(opts.headers as Record<string, string>),
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(path, { ...opts, headers });
  if (res.status === 401) {
    clearSession();
    if (typeof window !== "undefined") window.location.href = "/login";
    throw new Error("Nicht angemeldet");
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 409) throw new ConflictError(data.current);
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}
