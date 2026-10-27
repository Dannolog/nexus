import { NextRequest } from "next/server";
import { json, handle } from "@/lib/http";
import { requireAuth } from "@/lib/auth";
import { holen, geraetVon, APP_NAMEN } from "@/lib/qrLogin";

export const dynamic = "force-dynamic";

/** GET /api/auth/qr/:id/info — das angemeldete Handy sieht, welches Gerät für welche App fragt. */
export const GET = (req: NextRequest, { params }: { params: { id: string } }) =>
  handle(async () => {
    await requireAuth(req);
    const s = holen(params.id);
    return json({ app: s.app, appName: APP_NAMEN[s.app] || s.app, geraet: geraetVon(s.ua), ip: s.ip, restSek: Math.ceil((s.bis - Date.now()) / 1000) });
  });
