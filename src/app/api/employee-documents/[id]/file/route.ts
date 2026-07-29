import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth";
import { handle, ApiError } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** Liefert die abgelegte Datei (Download/Anzeige über fetch + Blob in der UI). */
export const GET = (req: NextRequest, { params }: { params: { id: string } }) =>
  handle(async () => {
    await requireAuth(req);
    const d = await prisma.employeeDocument.findFirst({ where: { id: params.id, deletedAt: null } });
    if (!d) throw new ApiError("Dokument nicht gefunden", 404);
    return new Response(new Uint8Array(Buffer.from(d.data)), {
      status: 200,
      headers: {
        "Content-Type": d.mimeType || "application/pdf",
        "Content-Disposition": `inline; filename="${encodeURIComponent(d.fileName)}"`,
        "X-Dateiname": encodeURIComponent(d.fileName),
        "Cache-Control": "no-store",
      },
    });
  });
