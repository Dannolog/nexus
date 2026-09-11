import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth";
import { handle, json, ApiError } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** Rubrik umbenennen, umsortieren oder einfärben. */
export const PATCH = (req: NextRequest, { params }: { params: { id: string } }) =>
  handle(async () => {
    await requireAuth(req);
    const body = await req.json().catch(() => ({}));
    const data: Record<string, unknown> = {};
    if (typeof body.name === "string" && body.name.trim()) data.name = body.name.trim();
    if (typeof body.color === "string") data.color = body.color;
    if (Number.isFinite(body.sort)) data.sort = Number(body.sort);
    if (!Object.keys(data).length) throw new ApiError("Keine Änderungen übergeben", 400);
    const gruppe = await prisma.documentGroup.update({ where: { id: params.id }, data });
    return json(gruppe);
  });

/**
 * Rubrik entfernen. Dokumente und Notizen bleiben erhalten – sie rutschen in
 * „Ohne Zuordnung" und können neu einsortiert werden.
 */
export const DELETE = (req: NextRequest, { params }: { params: { id: string } }) =>
  handle(async () => {
    await requireAuth(req);
    await prisma.employeeDocument.updateMany({ where: { groupId: params.id }, data: { groupId: "" } });
    await prisma.employeeNote.updateMany({ where: { groupId: params.id }, data: { groupId: "" } });
    await prisma.documentGroup.update({ where: { id: params.id }, data: { deletedAt: new Date() } });
    return json({ ok: true });
  });
