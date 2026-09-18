import { NextRequest } from "next/server";
import crypto from "crypto";
import { requireAuth } from "@/lib/auth";
import { handle, json, ApiError } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const FELDER = {
  id: true, orgId: true, groupId: true, title: true, fileName: true, mimeType: true,
  size: true, version: true, docKey: true, documentDate: true, note: true,
  createdAt: true, updatedAt: true,
} as const;

/** Dateityp aus der Endung – damit Bilder später als Bild angezeigt werden können. */
function dateiTyp(name: string) {
  const e = (name.match(/\.([a-z0-9]+)$/i)?.[1] || "").toLowerCase();
  const karte: Record<string, string> = {
    pdf: "application/pdf",
    jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif",
    webp: "image/webp", heic: "image/heic", bmp: "image/bmp", tif: "image/tiff", tiff: "image/tiff",
    txt: "text/plain", csv: "text/csv",
  };
  return karte[e] || "application/octet-stream";
}

/** Dokumente eines Mandanten – ohne Dateidaten, neueste zuerst. */
export const GET = (req: NextRequest) =>
  handle(async () => {
    await requireAuth(req);
    const orgId = req.nextUrl.searchParams.get("orgId") || "";
    if (!orgId) throw new ApiError("Mandant fehlt", 400);
    const data = await prisma.organizationDocument.findMany({
      where: { orgId, deletedAt: null },
      orderBy: [{ documentDate: "desc" }, { createdAt: "desc" }],
      select: FELDER,
    });
    return json({ data, count: data.length });
  });

/**
 * Dokument beim Mandanten ablegen. Die Version zählt je Mandant und Dokumentart (`docKey`)
 * hoch – so entstehen Stände desselben Schriftstücks, ältere bleiben erhalten.
 */
export const POST = (req: NextRequest) =>
  handle(async () => {
    await requireAuth(req);
    const body = await req.json().catch(() => ({}));
    const orgId = String(body.orgId || "");
    const base64 = String(body.base64 || "");
    if (!orgId) throw new ApiError("Mandant fehlt", 400);
    if (!base64) throw new ApiError("Keine Datei übergeben", 400);

    const org = await prisma.organization.findFirst({ where: { id: orgId, deletedAt: null } });
    if (!org) throw new ApiError("Mandant nicht gefunden", 404);

    const daten = Buffer.from(base64.replace(/^data:[^,]+,/, ""), "base64");
    if (!daten.length) throw new ApiError("Datei ist leer", 400);

    const dateiname = String(body.fileName || "Dokument.pdf");
    const titel = String(body.title || "").trim() || dateiname.replace(/\.[^.]+$/, "");
    const docKey = String(body.docKey || titel.toLowerCase().replace(/[^a-z0-9]+/g, "-")).slice(0, 60) || "dokument";

    const letzte = await prisma.organizationDocument.findFirst({
      where: { orgId, docKey }, orderBy: { version: "desc" }, select: { version: true },
    });
    const version = (letzte?.version ?? 0) + 1;

    const doc = await prisma.organizationDocument.create({
      data: {
        orgId,
        groupId: String(body.groupId || ""),
        title: titel,
        fileName: dateiname,
        mimeType: dateiTyp(dateiname),
        data: daten,
        size: daten.length,
        sha256: crypto.createHash("sha256").update(daten).digest("hex"),
        version,
        docKey,
        documentDate: body.documentDate ? new Date(String(body.documentDate)) : new Date(),
        note: String(body.note || ""),
      },
      select: FELDER,
    });
    return json(doc, 201);
  });
