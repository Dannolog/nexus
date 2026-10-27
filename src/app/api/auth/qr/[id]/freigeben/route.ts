import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { json, handle, ApiError } from "@/lib/http";
import { requireAuth } from "@/lib/auth";
import { signUserToken } from "@/lib/jwt";
import { holen, entscheiden, geraetVon, APP_NAMEN } from "@/lib/qrLogin";

export const dynamic = "force-dynamic";

/**
 * POST /api/auth/qr/:id/freigeben { ablehnen?: true, zahl? } — das Handy gibt den PC frei (oder lehnt ab).
 * Der PC bekommt ein eigenes, frisch ausgestelltes Token – nie das Token des Handys.
 */
export const POST = (req: NextRequest, { params }: { params: { id: string } }) =>
  handle(async () => {
    const ctx = await requireAuth(req);
    const body = await req.json().catch(() => ({}));
    const s = holen(params.id);
    // Anfrage per E-Mail: nur der angefragte Admin, und nur mit der richtigen Zahl
    if (s.fuer && s.fuer !== ctx.identityId) throw new ApiError("Diese Anfrage gilt nicht für dein Konto.", 403);
    if (s.fuer && !body.ablehnen && Number(body.zahl) !== s.zahl) {
      entscheiden(params.id, null);
      throw new ApiError("Falsche Zahl – die Anmeldung wurde abgelehnt. Bitte am Gerät neu anfragen.", 400);
    }
    if (body.ablehnen) {
      entscheiden(params.id, null);
      return json({ ok: true, abgelehnt: true });
    }
    const identity = await prisma.identity.findFirst({ where: { id: ctx.identityId, deletedAt: null }, include: { appAccess: true } });
    if (!identity) throw new ApiError("Konto nicht gefunden", 401);
    if (s.app !== "nexus" && identity.globalRole !== "admin") {
      const a = identity.appAccess.find((x) => x.appKey === s.app);
      if (!a || !a.allowed) throw new ApiError(`Du hast keinen Zugriff auf ${APP_NAMEN[s.app] || s.app}.`, 403);
    }
    const token = await signUserToken({ sub: identity.id, email: identity.email, name: identity.name, globalRole: identity.globalRole });
    entscheiden(params.id, {
      token,
      identity: {
        id: identity.id, email: identity.email, name: identity.name, globalRole: identity.globalRole,
        appAccess: identity.appAccess.map((a) => ({ appKey: a.appKey, allowed: a.allowed, role: a.role, rights: a.rights })),
      },
    });
    console.log(`[qr-login] ${APP_NAMEN[s.app] || s.app} freigegeben (${geraetVon(s.ua)})`);
    return json({ ok: true, geraet: geraetVon(s.ua), appName: APP_NAMEN[s.app] || s.app });
  });
