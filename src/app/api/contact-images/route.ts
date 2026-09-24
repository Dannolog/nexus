import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth";
import { handle, json, ApiError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { miniaturAusBild } from "@/lib/bilder";

export const dynamic = "force-dynamic";

const FELDER = { id: true, contactId: true, title: true, mimeType: true, size: true, thumb: true, quelle: true, sort: true, createdAt: true } as const;

/** Bilder eines Kontakts – ohne die großen Daten, nur mit Vorschau. */
export const GET = (req: NextRequest) =>
  handle(async () => {
    await requireAuth(req);
    const contactId = req.nextUrl.searchParams.get("contactId") || "";
    if (!contactId) throw new ApiError("Kontakt fehlt", 400);
    const data = await prisma.contactImage.findMany({
      where: { contactId },
      orderBy: [{ sort: "asc" }, { createdAt: "asc" }],
      select: FELDER,
    });
    return json({ data, count: data.length });
  });

/** Bild hinterlegen – Visitenkarte, Foto oder Schriftstück. */
export const POST = (req: NextRequest) =>
  handle(async () => {
    await requireAuth(req);
    const body = await req.json().catch(() => ({}));
    const contactId = String(body.contactId || "");
    const base64 = String(body.base64 || "");
    if (!contactId) throw new ApiError("Kontakt fehlt", 400);
    if (!base64) throw new ApiError("Kein Bild übergeben", 400);

    const kontakt = await prisma.contact.findFirst({ where: { id: contactId, deletedAt: null } });
    if (!kontakt) throw new ApiError("Kontakt nicht gefunden", 404);

    const daten = Buffer.from(base64.replace(/^data:[^,]+,/, ""), "base64");
    if (!daten.length) throw new ApiError("Datei ist leer", 400);
    const mimeType = base64.match(/^data:([^;,]+)/)?.[1] || String(body.mimeType || "image/jpeg");

    const letzte = await prisma.contactImage.findFirst({ where: { contactId }, orderBy: { sort: "desc" }, select: { sort: true } });
    const bild = await prisma.contactImage.create({
      data: {
        contactId,
        title: String(body.title || "").trim() || "Visitenkarte",
        mimeType,
        data: daten,
        size: daten.length,
        thumb: await miniaturAusBild(daten),
        quelle: body.quelle === "scan" ? "scan" : "upload",
        sort: (letzte?.sort ?? 0) + 1,
      },
      select: FELDER,
    });
    return json(bild, 201);
  });
