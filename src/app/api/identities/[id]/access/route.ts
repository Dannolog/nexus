import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { json, handle, ApiError } from "@/lib/http";
import { requireApp } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** GET /api/identities/:id/access — welche Apps + Rollen darf dieser User. */
export const GET = (req: NextRequest, { params }: { params: { id: string } }) =>
  handle(async () => {
    requireApp(req);
    const identity = await prisma.identity.findUnique({
      where: { id: params.id },
      include: { appAccess: true },
    });
    if (!identity) throw new ApiError("Nicht gefunden", 404);
    return json({
      identityId: identity.id,
      email: identity.email,
      globalRole: identity.globalRole,
      access: identity.appAccess,
    });
  });
