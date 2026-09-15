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

/** Abgelaufene oder fehlende Anmeldung – wird nicht mehr still weitergeleitet. */
export class SitzungAbgelaufenError extends Error {
  constructor() {
    super("Sitzung abgelaufen");
    this.name = "SitzungAbgelaufenError";
  }
}

/** Wann läuft das aktuelle Token ab? (Zeitstempel in ms; 0 = unbekannt) */
export function tokenLaeuftAb(): number {
  const t = getToken();
  if (!t) return 0;
  try {
    const nutzlast = JSON.parse(atob(t.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return nutzlast?.exp ? nutzlast.exp * 1000 : 0;
  } catch {
    return 0;
  }
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
    // Früher wurde hier sofort zur Anmeldung gesprungen – ungespeicherte Eingaben waren weg.
    // Jetzt meldet sich der Sitzungswächter, sichert Entwürfe und fragt nach.
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("nexus-sitzung-abgelaufen"));
    }
    throw new SitzungAbgelaufenError();
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 409) throw new ConflictError(data.current);
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}
