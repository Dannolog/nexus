import { NextRequest } from "next/server";
import { ApiError } from "./http";
import { verifyUserToken, JwtPayload } from "./jwt";

/** Bekannte Apps + ihr API-Key (Header X-App-Key) aus der Env. */
const APP_KEYS: Record<string, string | undefined> = {
  kontor: process.env.APP_KEY_KONTOR,
  clocker: process.env.APP_KEY_CLOCKER,
  cnc: process.env.APP_KEY_CNC,
  schaltplan: process.env.APP_KEY_SCHALTPLAN,
  projecteye: process.env.APP_KEY_PROJECTEYE,
  vision: process.env.APP_KEY_VISION,
  // "nexus" = die eigene UI (kein Key nötig, wird intern gesetzt)
};

export type AuthContext = {
  appKey: string; // welche App ("nexus" für die eigene UI)
  identityId: string;
  identityName: string;
  user: JwtPayload;
};

/** Identifiziert die zugreifende App über X-App-Key. Gibt den App-Namen zurück. */
export function resolveAppKey(req: NextRequest): string {
  const provided = req.headers.get("x-app-key");
  // Interne UI-Aufrufe tragen ein Bearer-Token aber keinen App-Key → "nexus".
  if (!provided) return "nexus";
  for (const [name, key] of Object.entries(APP_KEYS)) {
    if (key && provided === key) return name;
  }
  throw new ApiError("Unbekannter X-App-Key", 401);
}

/** Vollständiger Auth-Kontext: App-Key + User-JWT (Bearer). Pflicht für Schreibzugriffe. */
export async function requireAuth(req: NextRequest): Promise<AuthContext> {
  const appKey = resolveAppKey(req);
  const header = req.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) throw new ApiError("Bearer-Token fehlt", 401);
  let user: JwtPayload;
  try {
    user = await verifyUserToken(token);
  } catch {
    throw new ApiError("Ungültiges/abgelaufenes Token", 401);
  }
  return { appKey, identityId: user.sub, identityName: user.name, user };
}

/** Nur App-Key prüfen (für reine Lesezugriffe ohne User-Kontext erlaubt). */
export function requireApp(req: NextRequest): string {
  return resolveAppKey(req);
}
