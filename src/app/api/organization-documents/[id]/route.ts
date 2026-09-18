import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth";
import { handle, json, ApiError } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** Titel, Notiz, Rubrik oder Datum eines Dokuments ändern. */
export const PATCH = (req: NextRequest, { params }: { params: { id: string } }) =>
  handle(async () => {
    await requireAuth(req);
    const body = await req.json().catch(() => ({}));
    const data: Record<string, unknown> = {};
    if (typeof body.title === "string" && body.title.trim()) data.title = body.title.trim();
    if (typeof body.note === "string") data.note = body.note;
    if (typeof body.groupId === "string") data.groupId = body.groupId;
    if (body.documentDate !== undefined) data.documentDate = body.documentDate ? new Date(String(body.documentDate)) : null;
    if (!Object.keys(data).length) throw new ApiError("Keine Änderungen übergeben", 400);
    const d = await prisma.organizationDocument.update({
      where: { id: params.id },
      data,
      select: { id: true, title: true, note: true, groupId: true, documentDate: true, version: true },
    });
    return json(d);
  });

/** Weich löschen – bleibt in der Datenbank. */
export const DELETE = (req: NextRequest, { params }: { params: { id: string } }) =>
  handle(async () => {
    await requireAuth(req);
    await prisma.organizationDocument.update({ where: { id: params.id }, data: { deletedAt: new Date() } });
    return json({ ok: true });
  });
