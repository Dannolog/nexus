import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { handle, ApiError } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** Die Datei selbst – zum Ansehen im Betrachter oder zum Speichern. */
export const GET = (req: NextRequest, { params }: { params: { id: string } }) =>
  handle(async () => {
    await requireAuth(req);
    const d = await prisma.organizationDocument.findFirst({ where: { id: params.id, deletedAt: null } });
    if (!d) throw new ApiError("Nicht gefunden", 404);
    return new NextResponse(Buffer.from(d.data), {
      headers: {
        "Content-Type": d.mimeType || "application/pdf",
        "Content-Length": String(d.size || d.data.length),
        "X-Dateiname": encodeURIComponent(d.fileName),
        "Cache-Control": "no-store",
      },
    });
  });
