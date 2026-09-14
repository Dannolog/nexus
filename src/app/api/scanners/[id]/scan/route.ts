import { NextRequest } from "next/server";
import crypto from "crypto";
import { requireAuth } from "@/lib/auth";
import { handle, json, ApiError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { scanne, seitenAlsPdf, abbrechen, ScanOptionen } from "@/lib/scanner";

export const dynamic = "force-dynamic";
export const maxDuration = 300;   // Scannen dauert – vor allem mit Einzug

/**
 * Scan auslösen. Das Ergebnis landet als PDF im **Posteingang** – Zuordnung zu einem
 * Mitarbeiter kann sofort oder später erfolgen („erst liegen lassen").
 */
export const POST = (req: NextRequest, { params }: { params: { id: string } }) =>
  handle(async () => {
    await requireAuth(req);
    const s = await prisma.scanner.findFirst({ where: { id: params.id, deletedAt: null } });
    if (!s) throw new ApiError("Scanner nicht gefunden", 404);
    const body = await req.json().catch(() => ({}));

    const optionen: ScanOptionen = {
      source: body.source === "Feeder" ? "Feeder" : "Platen",
      colorMode: body.colorMode === "Grayscale8" ? "Grayscale8" : "RGB24",
      resolution: Number(body.resolution) || 200,
      duplex: !!body.duplex,
    };

    let pdf: Buffer;
    let seitenzahl = 0;
    try {
      const seiten = await scanne(s.host, optionen);
      seitenzahl = seiten.length;
      pdf = await seitenAlsPdf(seiten);
    } catch (e: any) {
      await abbrechen(s.host);
      throw new ApiError(`Scannen fehlgeschlagen: ${e.message}`, 502);
    }

    const jetzt = new Date();
    const stempel = jetzt.toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
    const titel = String(body.title || "").trim() || `Scan ${stempel}`;
    const sha256 = crypto.createHash("sha256").update(pdf).digest("hex");

    const doc = await prisma.scanDocument.create({
      data: {
        title: titel,
        fileName: `${titel.replace(/[^\wäöüÄÖÜß .-]+/g, "_")}.pdf`,
        data: pdf,
        size: pdf.length,
        pages: seitenzahl,
        sha256,
        scannerName: s.name,
        scannedAt: jetzt,
      },
      select: { id: true, title: true, fileName: true, pages: true, size: true, sha256: true, scannedAt: true, status: true },
    });
    await prisma.scanner.update({ where: { id: s.id }, data: { lastUsedAt: jetzt } });
    return json(doc, 201);
  });
