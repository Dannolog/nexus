import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth";
import { handle, json, ApiError } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** Notiz ändern (Text, Titel oder Rubrik). */
export const PATCH = (req: NextRequest, { params }: { params: { id: string } }) =>
  handle(async () => {
    await requireAuth(req);
    const body = await req.json().catch(() => ({}));
    const data: Record<string, unknown> = {};
    if (typeof body.title === "string") data.title = body.title.trim();
    if (typeof body.text === "string") data.text = body.text;
    if (typeof body.groupId === "string") data.groupId = body.groupId;
    if (!Object.keys(data).length) throw new ApiError("Keine Änderungen übergeben", 400);
    const note = await prisma.employeeNote.update({ where: { id: params.id }, data });
    return json(note);
  });

/** Weich löschen – die Notiz verschwindet aus der Akte, bleibt aber in der Datenbank. */
export const DELETE = (req: NextRequest, { params }: { params: { id: string } }) =>
  handle(async () => {
    await requireAuth(req);
    await prisma.employeeNote.update({ where: { id: params.id }, data: { deletedAt: new Date() } });
    return json({ ok: true });
  });
