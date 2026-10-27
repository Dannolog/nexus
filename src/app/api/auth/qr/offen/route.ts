import { NextRequest } from "next/server";
import { json, handle } from "@/lib/http";
import { requireAuth } from "@/lib/auth";
import { offeneFuer } from "@/lib/qrLogin";

export const dynamic = "force-dynamic";

/** GET /api/auth/qr/offen — offene Anmelde-Anfragen an mich (Hinweis „Ein Gerät möchte sich anmelden“). */
export const GET = (req: NextRequest) =>
  handle(async () => {
    const ctx = await requireAuth(req);
    return json(offeneFuer(ctx.identityId));
  });
