import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { json, handle } from "@/lib/http";
import { requireAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** PATCH /api/supplier-contacts/:id */
export const PATCH = (req: NextRequest, { params }: { params: { id: string } }) =>
  handle(async () => {
    await requireAuth(req);
    const body = await req.json().catch(() => ({}));
    const data: Record<string, unknown> = {};
    for (const f of ["name", "role", "email", "phone", "mobile", "notes"]) {
      if (typeof body[f] === "string") data[f] = f === "name" ? body[f].trim() : body[f];
    }
    const updated = await prisma.supplierContact.update({ where: { id: params.id }, data });
    return json(updated);
  });

/** DELETE /api/supplier-contacts/:id (hart – Sub-Eintrag wie bei Kunden-Kontakten) */
export const DELETE = (req: NextRequest, { params }: { params: { id: string } }) =>
  handle(async () => {
    await requireAuth(req);
    await prisma.supplierContact.delete({ where: { id: params.id } });
    return json({ ok: true });
  });
