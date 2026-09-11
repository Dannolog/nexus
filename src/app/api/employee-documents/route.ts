import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth";
import { handle, json, ApiError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { bauDateiname, fuelleFormular, loesePlatzhalter, werteAusMitarbeiter } from "@/lib/documents";

export const dynamic = "force-dynamic";

/** Dateityp aus der Endung – damit Bilder später auch als Bild angezeigt werden können. */
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

/** Abgelegte Dokumente – ohne Dateidaten. Optional gefiltert nach Mitarbeiter. */
export const GET = (req: NextRequest) =>
  handle(async () => {
    await requireAuth(req);
    const url = new URL(req.url);
    const employeeId = url.searchParams.get("employeeId") || undefined;
    const data = await prisma.employeeDocument.findMany({
      where: { deletedAt: null, ...(employeeId ? { employeeId } : {}) },
      orderBy: { createdAt: "desc" },
      select: {
        id: true, employeeId: true, groupId: true, orgId: true, orgName: true, templateId: true, templateKey: true,
        title: true, fileName: true, mimeType: true, size: true, version: true, filled: true,
        note: true, createdAt: true, updatedAt: true,
      },
    });
    return json({ data });
  });

/**
 * Dokument bei einem Mitarbeiter ablegen. Zwei Wege:
 *  a) aus einer Vorlage erzeugen (templateId [+ fill=true] → wird vorausgefüllt)
 *  b) fertige Datei hochladen (base64), z. B. das unterschriebene Original
 * Die Version zählt je Mitarbeiter und Vorlage hoch – jede Änderung ist damit
 * nachvollziehbar und steckt im Dateinamen.
 */
export const POST = (req: NextRequest) =>
  handle(async () => {
    await requireAuth(req);
    const body = await req.json().catch(() => ({}));
    const { employeeId, groupId = "", orgId = "", templateId = "", base64, fileName, title = "", note = "" } = body as Record<string, any>;
    const fill = body.fill !== false;

    if (!employeeId) throw new ApiError("Mitarbeiter fehlt", 400);
    const emp = await prisma.employee.findFirst({ where: { id: employeeId, deletedAt: null } });
    if (!emp) throw new ApiError("Mitarbeiter nicht gefunden", 404);
    const org = orgId ? await prisma.organization.findFirst({ where: { id: orgId, deletedAt: null } }) : null;

    let daten: Buffer;
    let key = "dokument";
    let anzeige = title;
    let ausgefuellt = false;
    let mimeType = "application/pdf";

    if (templateId) {
      const t = await prisma.documentTemplate.findFirst({ where: { id: templateId, deletedAt: null } });
      if (!t) throw new ApiError("Vorlage nicht gefunden", 404);
      key = t.key;
      anzeige = anzeige || t.name;
      mimeType = t.mimeType || mimeType;
      daten = Buffer.from(t.data);
      if (fill) {
        const zuordnung = JSON.parse(t.fieldMap || "{}") as Record<string, string>;
        const { bytes, gefuellt } = await fuelleFormular(daten, loesePlatzhalter(zuordnung, werteAusMitarbeiter(emp, org)));
        daten = bytes;
        ausgefuellt = gefuellt > 0;
      }
    } else if (base64) {
      daten = Buffer.from(String(base64).replace(/^data:[^,]+,/, ""), "base64");
      key = (body.templateKey as string) || "upload";
      anzeige = anzeige || fileName || "Dokument";
      mimeType = dateiTyp(String(fileName || ""));
    } else {
      throw new ApiError("Weder Vorlage noch Datei übergeben", 400);
    }
    if (!daten.length) throw new ApiError("Datei ist leer", 400);

    // Version = bisher höchste Version dieses Dokumenttyps beim Mitarbeiter + 1
    const letzte = await prisma.employeeDocument.findFirst({
      where: { employeeId, templateKey: key },
      orderBy: { version: "desc" },
      select: { version: true },
    });
    const version = (letzte?.version ?? 0) + 1;

    const name = bauDateiname({
      orgName: org?.name || "",
      employeeKey: emp.employeeNumber || emp.name || emp.id.slice(0, 6),
      docKey: key,
      version,
      ext: mimeType === "application/pdf" ? ".pdf" : "",
    });

    const doc = await prisma.employeeDocument.create({
      data: {
        employeeId,
        groupId,
        orgId,
        orgName: org?.name || "",
        templateId,
        templateKey: key,
        title: anzeige,
        fileName: name,
        mimeType,
        data: daten,
        size: daten.length,
        version,
        filled: ausgefuellt,
        note,
      },
      select: {
        id: true, employeeId: true, groupId: true, orgName: true, templateKey: true, title: true,
        fileName: true, size: true, version: true, filled: true, createdAt: true,
      },
    });
    return json(doc, 201);
  });
