import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth";
import { handle, json, ApiError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { scannerStatus, einzugProblem } from "@/lib/scanner";

export const dynamic = "force-dynamic";

/**
 * Kurzstatus des Geräts – wird von der Oberfläche alle paar Sekunden abgefragt,
 * damit sofort sichtbar ist, ob Papier im Einzug liegt.
 * Antwort: { state, adf, papierImEinzug, problem }
 */
export const GET = (req: NextRequest, { params }: { params: { id: string } }) =>
  handle(async () => {
    await requireAuth(req);
    const s = await prisma.scanner.findFirst({ where: { id: params.id, deletedAt: null } });
    if (!s) throw new ApiError("Scanner nicht gefunden", 404);
    try {
      const st = await scannerStatus(s.host, 4000);
      return json({
        ...st,
        papierImEinzug: /Loaded/i.test(st.adf),
        problem: /Empty/i.test(st.adf) ? "" : einzugProblem(st.adf),
      });
    } catch (e: any) {
      throw new ApiError(`Scanner nicht erreichbar: ${e.message}`, 503);
    }
  });
