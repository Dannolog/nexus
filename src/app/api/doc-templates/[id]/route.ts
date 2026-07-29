import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth";
import { handle, json, ApiError } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** Einzelne Vorlage (ohne Dateidaten). */
export const GET = (req: NextRequest, { params }: { params: { id: string } }) =>
  handle(async () => {
    await requireAuth(req);
    const t = await prisma.documentTemplate.findFirst({
      where: { id: params.id, deletedAt: null },
      select: {
        id: true, key: true, name: true, fileName: true, version: true,
        formFields: true, fieldMap: true, note: true, archived: true, createdAt: true, updatedAt: true,
      },
    });
    if (!t) throw new ApiError("Vorlage nicht gefunden", 404);
    return json(t);
  });

/** Name, Notiz, Feldzuordnung oder Archiv-Status ändern (nicht die Datei – die geht über POST). */
export const PATCH = (req: NextRequest, { params }: { params: { id: string } }) =>
  handle(async () => {
    await requireAuth(req);
    const body = await req.json().catch(() => ({}));
    const data: Record<string, unknown> = {};
    if (typeof body.name === "string") data.name = body.name.trim();
    if (typeof body.note === "string") data.note = body.note;
    if (typeof body.archived === "boolean") data.archived = body.archived;
    if (body.fieldMap && typeof body.fieldMap === "object") data.fieldMap = JSON.stringify(body.fieldMap);
    if (typeof body.fieldMap === "string") data.fieldMap = body.fieldMap;
    if (!Object.keys(data).length) throw new ApiError("Keine Änderungen übergeben", 400);

    const t = await prisma.documentTemplate.update({
      where: { id: params.id },
      data,
      select: { id: true, key: true, name: true, version: true, fieldMap: true, note: true, archived: true },
    });
    return json(t);
  });

/** Vorlage entfernen (weich – abgelegte Dokumente bleiben erhalten). */
export const DELETE = (req: NextRequest, { params }: { params: { id: string } }) =>
  handle(async () => {
    await requireAuth(req);
    await prisma.documentTemplate.update({ where: { id: params.id }, data: { deletedAt: new Date() } });
    return json({ ok: true });
  });
