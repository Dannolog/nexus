import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth";
import { handle, json, ApiError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { findeAdresse } from "@/lib/scanner";

export const dynamic = "force-dynamic";

/** Scanner umbenennen oder Notiz ändern. */
export const PATCH = (req: NextRequest, { params }: { params: { id: string } }) =>
  handle(async () => {
    await requireAuth(req);
    const body = await req.json().catch(() => ({}));
    const data: Record<string, unknown> = {};
    if (typeof body.name === "string" && body.name.trim()) data.name = body.name.trim();
    if (typeof body.host === "string" && body.host.trim()) {
      const alt = await prisma.scanner.findUnique({ where: { id: params.id } });
      if (body.host.trim() !== alt?.host) {
        // Neue Adresse vorher prüfen – sonst steht ein toter Eintrag in der Liste.
        try {
          const f = await findeAdresse(body.host);
          data.host = f.host;
          data.model = f.model;
        } catch (e: any) { throw new ApiError(e.message, 400); }
      }
    }
    if (typeof body.note === "string") data.note = body.note;
    if (!Object.keys(data).length) throw new ApiError("Keine Änderungen übergeben", 400);
    return json(await prisma.scanner.update({ where: { id: params.id }, data }));
  });

/** Scanner entfernen (weich – bereits gescannte Dokumente bleiben unberührt). */
export const DELETE = (req: NextRequest, { params }: { params: { id: string } }) =>
  handle(async () => {
    await requireAuth(req);
    await prisma.scanner.update({ where: { id: params.id }, data: { deletedAt: new Date() } });
    return json({ ok: true });
  });
