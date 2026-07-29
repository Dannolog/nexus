import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth";
import { ApiError, error } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** Liefert die abgelegte Datei (Download/Anzeige über fetch + Blob in der UI). */
export const GET = async (req: NextRequest, { params }: { params: { id: string } }) => {
  try {
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
  } catch (e: any) {
    const status = e instanceof ApiError ? e.status : 500;
    return error(e?.message || "Datei konnte nicht geladen werden", status);
  }
};
