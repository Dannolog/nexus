import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { json, handle, ApiError } from "@/lib/http";
import { requireAuth } from "@/lib/auth";
import { KONTAKT_FELDER } from "@/lib/kontakte";

export const dynamic = "force-dynamic";

/** PATCH /api/supplier-contacts/:id – Adapter auf das zentrale Kontaktregister. */
export const PATCH = (req: NextRequest, { params }: { params: { id: string } }) =>
  handle(async () => {
    await requireAuth(req);
    const body = await req.json().catch(() => ({}));
    const aktuell = await prisma.contact.findFirst({ where: { id: params.id, deletedAt: null } });
    if (!aktuell) throw new ApiError("Nicht gefunden", 404);
    const data: Record<string, unknown> = {};
    for (const f of ["name", "role", "email", "phone", "mobile", "notes"]) {
      if (typeof body[f] === "string") data[f] = f === "name" ? body[f].trim() : body[f];
    }
    const updated = await prisma.contact.update({
      where: { id: params.id },
      data: { ...data, version: aktuell.version + 1 },
      select: KONTAKT_FELDER,
    });
    return json({ ...updated, supplierId: updated.ownerId });
  });

/** DELETE /api/supplier-contacts/:id – weich löschen, damit der Abgleich es mitbekommt. */
export const DELETE = (req: NextRequest, { params }: { params: { id: string } }) =>
  handle(async () => {
    await requireAuth(req);
    const aktuell = await prisma.contact.findFirst({ where: { id: params.id, deletedAt: null } });
    if (!aktuell) throw new ApiError("Nicht gefunden", 404);
    await prisma.contact.update({
      where: { id: params.id },
      data: { deletedAt: new Date(), version: aktuell.version + 1 },
    });
    return json({ ok: true });
  });
