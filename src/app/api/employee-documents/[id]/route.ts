import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth";
import { handle, json, ApiError } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export const PATCH = (req: NextRequest, { params }: { params: { id: string } }) =>
  handle(async () => {
    await requireAuth(req);
    const body = await req.json().catch(() => ({}));
    const data: Record<string, unknown> = {};
    if (typeof body.title === "string") data.title = body.title;
    if (typeof body.note === "string") data.note = body.note;
    if (!Object.keys(data).length) throw new ApiError("Keine Änderungen übergeben", 400);
    const d = await prisma.employeeDocument.update({
      where: { id: params.id },
      data,
      select: { id: true, title: true, note: true, version: true, fileName: true },
    });
    return json(d);
  });

/** Weich löschen – das Dokument verschwindet aus der Liste, bleibt aber in der Datenbank. */
export const DELETE = (req: NextRequest, { params }: { params: { id: string } }) =>
  handle(async () => {
    await requireAuth(req);
    await prisma.employeeDocument.update({ where: { id: params.id }, data: { deletedAt: new Date() } });
    return json({ ok: true });
  });
