import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { json, handle, ApiError } from "@/lib/http";
import { requireAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** GET /api/auth/me — aktueller User aus dem Bearer-Token. */
export const GET = (req: NextRequest) =>
  handle(async () => {
    const ctx = await requireAuth(req);
    const identity = await prisma.identity.findUnique({
      where: { id: ctx.identityId },
      include: { appAccess: true },
    });
    if (!identity) throw new ApiError("Nicht gefunden", 404);
    const { passwordHash, ...safe } = identity;
    return json(safe);
  });
