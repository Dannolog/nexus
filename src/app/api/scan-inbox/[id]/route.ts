import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth";
import { handle, json, ApiError } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** Namen oder Notiz eines Scans ändern (der Dateiname zieht mit). */
export const PATCH = (req: NextRequest, { params }: { params: { id: string } }) =>
  handle(async () => {
    await requireAuth(req);
    const body = await req.json().catch(() => ({}));
    const aktuell = await prisma.scanDocument.findFirst({ where: { id: params.id, deletedAt: null } });
    if (!aktuell) throw new ApiError("Nicht gefunden", 404);

    const data: Record<string, unknown> = {};
    if (typeof body.title === "string" && body.title.trim()) {
      const titel = body.title.trim();
      data.title = titel;
      const endung = aktuell.fileName.match(/\.[^.]+$/)?.[0] || ".pdf";
      data.fileName = `${titel.replace(/[^\wäöüÄÖÜß .-]+/g, "_")}${endung}`;
    }
    if (typeof body.note === "string") data.note = body.note;
    if (!Object.keys(data).length) throw new ApiError("Keine Änderungen übergeben", 400);

    const doc = await prisma.scanDocument.update({
      where: { id: params.id },
      data,
      select: { id: true, title: true, fileName: true, note: true, status: true },
    });
    return json(doc);
  });

/** Scan verwerfen (weich – bleibt in der Datenbank). */
export const DELETE = (req: NextRequest, { params }: { params: { id: string } }) =>
  handle(async () => {
    await requireAuth(req);
    await prisma.scanDocument.update({ where: { id: params.id }, data: { deletedAt: new Date() } });
    return json({ ok: true });
  });
