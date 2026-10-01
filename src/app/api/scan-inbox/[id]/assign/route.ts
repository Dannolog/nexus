import { NextRequest } from "next/server";
import crypto from "crypto";
import { PDFDocument } from "pdf-lib";
import { requireAuth } from "@/lib/auth";
import { handle, json, ApiError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { bauDateiname } from "@/lib/documents";
import { findeAblage } from "@/lib/ablage";

export const dynamic = "force-dynamic";

const sha = (b: Buffer | Uint8Array) => crypto.createHash("sha256").update(b).digest("hex");

async function seitenAus(quelle: PDFDocument, seiten: number[]): Promise<Buffer> {
  const ziel = await PDFDocument.create();
  const kopien = await ziel.copyPages(quelle, seiten);
  kopien.forEach((p) => ziel.addPage(p));
  return Buffer.from(await ziel.save());
}

/**
 * Scan (ganz oder nur bestimmte Seiten) ablegen – in die **Mitarbeiterakte** oder in die
 * **Betriebsakte** (Mandant oder eigene Akte).
 *
 * Body: {
 *   ziel: "mitarbeiter" | "betriebsakte",
 *   employeeId?,            // bei ziel=mitarbeiter
 *   orgId?,                 // bei mitarbeiter: Firma (optional) · bei betriebsakte: Mandant/Akte (Pflicht)
 *   groupId?, title?,
 *   seiten?: number[],      // 0-basiert; leer/fehlt = alle
 *   rest?: "behalten" | "alles" | "loeschen",
 *                           // nur bei Teilauswahl: restliche Seiten im Posteingang lassen (Scan wird
 *                           // auf den Rest gekürzt) · ganzen Scan unverändert lassen · Rest verwerfen
 *   thumb?                  // Vorschaubild der ersten verbleibenden Seite (vom Browser gerendert)
 * }
 */
export const POST = (req: NextRequest, { params }: { params: { id: string } }) =>
  handle(async () => {
    await requireAuth(req);
    const body = await req.json().catch(() => ({}));
    const ziel = body.ziel === "betriebsakte" ? "betriebsakte" : "mitarbeiter";
    const groupId = String(body.groupId || "");

    const scan = await prisma.scanDocument.findFirst({ where: { id: params.id, deletedAt: null } });
    if (!scan) throw new ApiError("Scan nicht gefunden", 404);
    if (scan.status === "zugeordnet") throw new ApiError("Dieser Scan ist bereits zugeordnet.", 409);

    // ── Seiten bestimmen ──
    const istPdf = Buffer.from(scan.data.subarray(0, 1024)).toString("latin1").includes("%PDF");
    let pdf: PDFDocument | null = null;
    let anzahl = 1;
    if (istPdf) {
      pdf = await PDFDocument.load(scan.data, { ignoreEncryption: true });
      anzahl = pdf.getPageCount();
    }
    const gewuenscht: number[] = Array.isArray(body.seiten)
      ? Array.from(new Set<number>(body.seiten.map((n: any) => Number(n)))).sort((a, b) => a - b)
      : [];
    if (gewuenscht.some((n) => !Number.isInteger(n) || n < 0 || n >= anzahl)) {
      throw new ApiError(`Ungültige Seitenauswahl – der Scan hat ${anzahl} Seite${anzahl === 1 ? "" : "n"}.`, 400);
    }
    const teil = !!pdf && gewuenscht.length > 0 && gewuenscht.length < anzahl;
    const seiten = teil ? gewuenscht : Array.from({ length: anzahl }, (_, i) => i);
    const restSeiten = teil ? Array.from({ length: anzahl }, (_, i) => i).filter((i) => !seiten.includes(i)) : [];
    const rest = teil ? (["behalten", "alles", "loeschen"].includes(body.rest) ? body.rest : "behalten") : "";

    const daten = teil ? await seitenAus(pdf!, seiten) : Buffer.from(scan.data);
    const mime = teil ? "application/pdf" : scan.mimeType;
    const hash = teil ? sha(daten) : scan.sha256;
    const titel = String(body.title || scan.title).trim() || scan.title;
    const seitenText = teil ? ` · Seite${seiten.length === 1 ? "" : "n"} ${seiten.map((i) => i + 1).join(", ")} von ${anzahl}` : "";
    const notiz = (scan.note || `gescannt am ${scan.scannedAt.toLocaleString("de-DE")}${scan.scannerName ? ` (${scan.scannerName})` : ""}`) + seitenText;

    // ── Ablegen ──
    let dokument: { id: string; fileName: string; version: number; title: string };
    let zielName = "";
    let employeeId = "";
    let orgId = String(body.orgId || "");

    if (ziel === "mitarbeiter") {
      employeeId = String(body.employeeId || "");
      if (!employeeId) throw new ApiError("Mitarbeiter fehlt", 400);
      const emp = await prisma.employee.findFirst({ where: { id: employeeId, deletedAt: null } });
      if (!emp) throw new ApiError("Mitarbeiter nicht gefunden", 404);
      const org = orgId ? await prisma.organization.findFirst({ where: { id: orgId, deletedAt: null } }) : null;
      const key = "scan";
      // Version wie in der Akte üblich: je Mitarbeiter und Dokumentart hochzählen
      const letzte = await prisma.employeeDocument.findFirst({
        where: { employeeId, templateKey: key }, orderBy: { version: "desc" }, select: { version: true },
      });
      const version = (letzte?.version ?? 0) + 1;
      dokument = await prisma.employeeDocument.create({
        data: {
          employeeId, groupId, orgId: org?.id || "", orgName: org?.name || "",
          templateKey: key, title: titel,
          fileName: bauDateiname({
            orgName: org?.name || "",
            employeeKey: emp.employeeNumber || emp.name || emp.id.slice(0, 6),
            docKey: key, version, ext: mime === "application/pdf" ? ".pdf" : (scan.fileName.match(/\.[a-z0-9]+$/i)?.[0] || ".pdf"),
          }),
          mimeType: mime, data: daten, size: daten.length, version, sha256: hash, note: notiz,
        },
        select: { id: true, fileName: true, version: true, title: true },
      });
      zielName = emp.name;
      orgId = "";
    } else {
      const ablage = await findeAblage(orgId);
      if (!ablage) throw new ApiError("Bitte einen Mandanten oder eine Akte wählen.", 400);
      const docKey = titel.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 60) || "scan";
      const letzte = await prisma.organizationDocument.findFirst({
        where: { orgId, docKey }, orderBy: { version: "desc" }, select: { version: true },
      });
      const endung = mime === "application/pdf" ? ".pdf" : (scan.fileName.match(/\.[a-z0-9]+$/i)?.[0] || "");
      dokument = await prisma.organizationDocument.create({
        data: {
          orgId, groupId, title: titel,
          fileName: `${titel.replace(/[^\wäöüÄÖÜß .-]+/g, "_")}${endung}`,
          mimeType: mime, data: daten, size: daten.length, sha256: hash,
          version: (letzte?.version ?? 0) + 1, docKey,
          documentDate: scan.scannedAt, note: notiz,
        },
        select: { id: true, fileName: true, version: true, title: true },
      });
      zielName = ablage.name;
    }

    // ── Posteingang nachführen ──
    const verlauf = (() => { try { return JSON.parse(scan.zuordnungen || "[]"); } catch { return []; } })();
    verlauf.push({
      am: new Date().toISOString(), ziel, name: zielName, documentId: dokument.id,
      seiten: seiten.map((i) => i + 1), von: anzahl,
    });
    const update: Record<string, unknown> = { zuordnungen: JSON.stringify(verlauf) };
    const erledigt = { status: "zugeordnet", employeeId, orgId, groupId, documentId: dokument.id };

    if (!teil) {
      Object.assign(update, erledigt);
    } else if (rest === "loeschen") {
      // Rest verwerfen: Der Scan behält nur die abgelegten Seiten (als Beleg) und ist erledigt
      Object.assign(update, erledigt, { data: daten, size: daten.length, pages: seiten.length, sha256: hash, mimeType: "application/pdf" });
    } else if (rest === "behalten") {
      // Nur die restlichen Seiten bleiben im Posteingang – für weitere Zuordnungen
      const restDaten = await seitenAus(pdf!, restSeiten);
      Object.assign(update, {
        data: restDaten, size: restDaten.length, pages: restSeiten.length, sha256: sha(restDaten), mimeType: "application/pdf",
        ...(typeof body.thumb === "string" && body.thumb.startsWith("data:image/") && body.thumb.length < 400_000 ? { thumb: body.thumb } : {}),
      });
    }
    // rest === "alles": Scan bleibt unverändert offen, nur der Verlauf wächst

    await prisma.scanDocument.update({ where: { id: scan.id }, data: update });

    return json({
      ok: true, dokument, ziel, zielName,
      seiten: seiten.length, von: anzahl, rest: teil ? rest : "",
      restSeiten: rest === "behalten" ? restSeiten.length : 0,
    }, 201);
  });
