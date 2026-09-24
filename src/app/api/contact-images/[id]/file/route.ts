import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { handle, ApiError } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** Das Bild in voller Größe – zum Ansehen oder Speichern. */
export const GET = (req: NextRequest, { params }: { params: { id: string } }) =>
  handle(async () => {
    await requireAuth(req);
    const b = await prisma.contactImage.findUnique({ where: { id: params.id } });
    if (!b) throw new ApiError("Nicht gefunden", 404);
    const endung = (b.mimeType.split("/")[1] || "jpg").replace("jpeg", "jpg");
    return new NextResponse(Buffer.from(b.data), {
      headers: {
        "Content-Type": b.mimeType,
        "Content-Length": String(b.size || b.data.length),
        "X-Dateiname": encodeURIComponent(`${b.title || "Bild"}.${endung}`),
        "Cache-Control": "no-store",
      },
    });
  });
