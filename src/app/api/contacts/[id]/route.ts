import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { json, handle } from "@/lib/http";
import { requireAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** PATCH /api/contacts/:id */
export const PATCH = (req: NextRequest, { params }: { params: { id: string } }) =>
  handle(async () => {
    await requireAuth(req);
    const body = await req.json().catch(() => ({}));
    const { id: _ignore, customerId: _c, ...data } = body ?? {};
    const updated = await prisma.customerContact.update({ where: { id: params.id }, data });
    return json(updated);
  });

/** DELETE /api/contacts/:id (hart — Sub-Entität) */
export const DELETE = (req: NextRequest, { params }: { params: { id: string } }) =>
  handle(async () => {
    await requireAuth(req);
    await prisma.customerContact.delete({ where: { id: params.id } });
    return json({ ok: true });
  });
