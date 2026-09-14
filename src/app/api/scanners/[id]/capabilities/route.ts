import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth";
import { handle, json, ApiError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { faehigkeiten } from "@/lib/scanner";

export const dynamic = "force-dynamic";

/** Was kann das Gerät? Quellen, Auflösungen, Duplex – für die Auswahl in der Oberfläche. */
export const GET = (req: NextRequest, { params }: { params: { id: string } }) =>
  handle(async () => {
    await requireAuth(req);
    const s = await prisma.scanner.findFirst({ where: { id: params.id, deletedAt: null } });
    if (!s) throw new ApiError("Scanner nicht gefunden", 404);
    try {
      const f = await faehigkeiten(s.host);
      if (f.model && f.model !== s.model) await prisma.scanner.update({ where: { id: s.id }, data: { model: f.model } });
      return json(f);
    } catch (e: any) {
      throw new ApiError(`Scanner nicht erreichbar: ${e.message}`, 503);
    }
  });
