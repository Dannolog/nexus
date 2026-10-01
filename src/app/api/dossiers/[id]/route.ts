import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth";
import { handle, json, ApiError } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** Akte umbenennen, Notiz/Farbe/Reihenfolge ändern. */
export const PATCH = (req: NextRequest, { params }: { params: { id: string } }) =>
  handle(async () => {
    await requireAuth(req);
    const body = await req.json().catch(() => ({}));
    const data: Record<string, unknown> = {};
    if (typeof body.name === "string" && body.name.trim()) {
      const name = body.name.trim();
      const doppelt = await prisma.dossier.findFirst({
        where: { name: { equals: name, mode: "insensitive" }, deletedAt: null, NOT: { id: params.id } },
      });
      if (doppelt) throw new ApiError(`Die Akte „${name}" gibt es bereits.`, 409);
      data.name = name;
    }
    if (typeof body.note === "string") data.note = body.note;
    if (typeof body.color === "string") data.color = body.color;
    if (Number.isFinite(body.sort)) data.sort = Number(body.sort);
    if (!Object.keys(data).length) throw new ApiError("Keine Änderungen übergeben", 400);
    return json(await prisma.dossier.update({ where: { id: params.id }, data }));
  });

/**
 * Akte entfernen – nur wenn sie leer ist, damit keine Dokumente unauffindbar werden.
 */
export const DELETE = (req: NextRequest, { params }: { params: { id: string } }) =>
  handle(async () => {
    await requireAuth(req);
    const anzahl = await prisma.organizationDocument.count({ where: { orgId: params.id, deletedAt: null } });
    if (anzahl > 0) {
      throw new ApiError(`Die Akte enthält noch ${anzahl} Dokument${anzahl === 1 ? "" : "e"} – bitte erst verschieben oder entfernen.`, 409);
    }
    await prisma.dossier.update({ where: { id: params.id }, data: { deletedAt: new Date() } });
    return json({ ok: true });
  });
