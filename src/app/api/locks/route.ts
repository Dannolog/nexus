import { NextRequest } from "next/server";
import { json, handle, ApiError } from "@/lib/http";
import { requireApp, requireAuth } from "@/lib/auth";
import { acquireLock, releaseLock, getActiveLock } from "@/lib/locking";

export const dynamic = "force-dynamic";

/** GET /api/locks?entity=&entityId= — aktiver Lock (oder null). */
export const GET = (req: NextRequest) =>
  handle(async () => {
    requireApp(req);
    const sp = req.nextUrl.searchParams;
    const entity = sp.get("entity");
    const entityId = sp.get("entityId");
    if (!entity || !entityId) throw new ApiError("entity und entityId erforderlich", 400);
    return json({ lock: await getActiveLock(entity, entityId) });
  });

/** POST /api/locks { entity, entityId } — Lock setzen/erneuern (Heartbeat). */
export const POST = (req: NextRequest) =>
  handle(async () => {
    const ctx = await requireAuth(req);
    const { entity, entityId } = await req.json().catch(() => ({}));
    if (!entity || !entityId) throw new ApiError("entity und entityId erforderlich", 400);
    const res = await acquireLock(entity, entityId, ctx);
    // 200 mit ok:false bedeutet: fremd gelockt (weicher Hinweis, kein harter Block)
    return json(res, 200);
  });

/** DELETE /api/locks { entity, entityId } — eigenen Lock freigeben. */
export const DELETE = (req: NextRequest) =>
  handle(async () => {
    const ctx = await requireAuth(req);
    const { entity, entityId } = await req.json().catch(() => ({}));
    if (!entity || !entityId) throw new ApiError("entity und entityId erforderlich", 400);
    return json(await releaseLock(entity, entityId, ctx));
  });
