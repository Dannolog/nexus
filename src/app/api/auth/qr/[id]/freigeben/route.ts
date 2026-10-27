import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { json, handle, ApiError } from "@/lib/http";
import { requireAuth } from "@/lib/auth";
import { signUserToken } from "@/lib/jwt";
import { holen, entscheiden, geraetVon, APP_NAMEN } from "@/lib/qrLogin";

export const dynamic = "force-dynamic";

/**
 * POST /api/auth/qr/:id/freigeben { ablehnen?: true } — das Handy gibt den PC frei (oder lehnt ab).
 * Der PC bekommt ein eigenes, frisch ausgestelltes Token – nie das Token des Handys.
 */
export const POST = (req: NextRequest, { params }: { params: { id: string } }) =>
  handle(async () => {
    const ctx = await requireAuth(req);
    const body = await req.json().catch(() => ({}));
    const s = holen(params.id);
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
