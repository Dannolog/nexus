import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { json, handle, ApiError } from "@/lib/http";
import { resolveAppKey } from "@/lib/auth";
import { signUserToken } from "@/lib/jwt";

export const dynamic = "force-dynamic";

/**
 * POST /api/auth/login { email, password } — zentrales Login, prüft appAccess.allowed.
 *
 * Angemeldet werden darf mit **jeder** hinterlegten Adresse: der Hauptadresse
 * (`Identity.email`, z. B. die Firmen-Adresse) oder einer der weiteren Adressen
 * (`IdentityEmail`, z. B. privat). Das Passwort ist dasselbe.
 */
export const POST = (req: NextRequest) =>
  handle(async () => {
    const appKey = resolveAppKey(req); // welche App fragt an
    const { email, password } = await req.json().catch(() => ({}));
    if (!email || !password) throw new ApiError("email und password erforderlich", 400);

    const adresse = String(email).toLowerCase().trim();
    const identity =
      (await prisma.identity.findFirst({
        where: { email: adresse, deletedAt: null },
        include: { appAccess: true },
      })) ||
      // Zweit-/Drittadresse → über die Zuordnung auf die Identität kommen
      (await prisma.identity.findFirst({
        where: { deletedAt: null, emails: { some: { email: adresse } } },
        include: { appAccess: true },
      }));
    if (!identity || identity.deletedAt) throw new ApiError("Login fehlgeschlagen", 401);

    const ok = await bcrypt.compare(String(password), identity.passwordHash);
    if (!ok) throw new ApiError("Login fehlgeschlagen", 401);

    // App-Zulassung prüfen (außer eigene UI "nexus" oder globaler Admin)
    if (appKey !== "nexus" && identity.globalRole !== "admin") {
      const access = identity.appAccess.find((a) => a.appKey === appKey);
      if (!access || !access.allowed) {
        throw new ApiError(`Kein Zugriff auf App '${appKey}'`, 403);
      }
    }

    const token = await signUserToken({
      sub: identity.id,
      email: identity.email,
      name: identity.name,
      globalRole: identity.globalRole,
    });

    return json({
      token,
      identity: {
        id: identity.id,
        email: identity.email,
        name: identity.name,
        globalRole: identity.globalRole,
        // app-spezifischer Hash-Cache-Fallback (offline-Login): Hash mitliefern,
        // damit die App ihn lokal cachen kann (Entscheidung §7-2).
        passwordHash: identity.passwordHash,
        appAccess: identity.appAccess.map((a) => ({
          appKey: a.appKey,
          allowed: a.allowed,
          role: a.role,
          rights: a.rights,
        })),
      },
    });
  });
