import { NextRequest } from "next/server";
import crypto from "crypto";
import { requireAuth } from "@/lib/auth";
import { handle, json, ApiError } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const FELDER = {
  id: true, title: true, fileName: true, mimeType: true, size: true, pages: true, sha256: true,
  scannerName: true, scannedAt: true, status: true, employeeId: true, groupId: true,
  documentId: true, note: true, createdAt: true,
} as const;

/**
 * Posteingang der Scans – ohne Dateidaten, neueste zuerst.
 * Jeder Eintrag trägt Warnhinweise: gleicher **Name** oder gleicher **Inhalt** wie ein
 * anderer Scan bzw. wie ein bereits abgelegtes Dokument.
 *   ?status=offen|zugeordnet   nur ein Zustand
 */
export const GET = (req: NextRequest) =>
  handle(async () => {
    await requireAuth(req);
    const status = req.nextUrl.searchParams.get("status");
    const rows = await prisma.scanDocument.findMany({
      where: { deletedAt: null, ...(status ? { status } : {}) },
      orderBy: { scannedAt: "desc" },
      select: FELDER,
    });

    // Warnungen vorbereiten: Namen und Prüfsummen zählen
    const nameZahl = new Map<string, number>();
    const hashZahl = new Map<string, number>();
    for (const r of rows) {
      const n = r.title.trim().toLowerCase();
      nameZahl.set(n, (nameZahl.get(n) || 0) + 1);
      if (r.sha256) hashZahl.set(r.sha256, (hashZahl.get(r.sha256) || 0) + 1);
    }
    // Inhaltsgleiche Dokumente, die schon in einer Mitarbeiterakte liegen
    const hashes = rows.map((r) => r.sha256).filter(Boolean);
    const abgelegt = hashes.length
      ? await prisma.employeeDocument.findMany({
          where: { deletedAt: null, sha256: { in: hashes } },
          select: { sha256: true, fileName: true, employeeId: true },
        })
      : [];
    const abgelegtNach = new Map(abgelegt.map((d) => [d.sha256, d]));

    const data = rows.map((r) => ({
      ...r,
      warnungen: {
        // gleicher Name wie ein anderer Scan
        name: (nameZahl.get(r.title.trim().toLowerCase()) || 0) > 1,
        // inhaltlich identischer Scan im Posteingang
        inhalt: !!r.sha256 && (hashZahl.get(r.sha256) || 0) > 1,
        // inhaltsgleich zu einem bereits abgelegten Dokument
        bereitsAbgelegt: !!r.sha256 && abgelegtNach.has(r.sha256),
      },
    }));
    return json({ data, count: data.length });
  });

/** Datei ohne Scanner in den Posteingang legen (z. B. vom Handy fotografiert). */
export const POST = (req: NextRequest) =>
  handle(async () => {
    await requireAuth(req);
    const body = await req.json().catch(() => ({}));
    const base64 = String(body.base64 || "");
    if (!base64) throw new ApiError("Keine Datei übergeben", 400);
    const daten = Buffer.from(base64.replace(/^data:[^,]+,/, ""), "base64");
    if (!daten.length) throw new ApiError("Datei ist leer", 400);
    const name = String(body.fileName || "Dokument").replace(/\.[^.]+$/, "");
    const titel = String(body.title || "").trim() || name;
    const mimeType = /\.pdf$/i.test(String(body.fileName || "")) ? "application/pdf" : String(body.mimeType || "application/octet-stream");

    const doc = await prisma.scanDocument.create({
      data: {
        title: titel,
        fileName: String(body.fileName || `${titel}.pdf`),
        mimeType,
        data: daten,
        size: daten.length,
        pages: Number(body.pages) || 1,
        sha256: crypto.createHash("sha256").update(daten).digest("hex"),
        scannerName: String(body.scannerName || "Upload"),
      },
      select: FELDER,
    });
    return json(doc, 201);
  });
