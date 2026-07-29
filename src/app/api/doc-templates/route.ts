import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth";
import { handle, json, ApiError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { leseFormularfelder, slug, STANDARD_FELDZUORDNUNG } from "@/lib/documents";

export const dynamic = "force-dynamic";

/** Liste der Vorlagen – ohne die Dateidaten (die kommen über /file). */
export const GET = (req: NextRequest) =>
  handle(async () => {
    await requireAuth(req);
    const data = await prisma.documentTemplate.findMany({
      where: { deletedAt: null },
      orderBy: { name: "asc" },
      select: {
        id: true, key: true, name: true, fileName: true, mimeType: true, version: true,
        formFields: true, fieldMap: true, note: true, archived: true, createdAt: true, updatedAt: true,
      },
    });
    return json({ data });
  });

/**
 * Vorlage anlegen ODER ersetzen (dann steigt die Version).
 * Die Datei kommt als base64 im JSON – das spart multipart und reicht für Formulare
 * dieser Größe (wenige hundert KB).
 */
export const POST = (req: NextRequest) =>
  handle(async () => {
    await requireAuth(req);
    const body = await req.json().catch(() => ({}));
    const { name, fileName, base64, note } = body as Record<string, string>;
    if (!base64) throw new ApiError("Datei fehlt", 400);
    if (!name?.trim()) throw new ApiError("Name fehlt", 400);

    const daten = Buffer.from(base64.replace(/^data:[^,]+,/, ""), "base64");
    if (!daten.length) throw new ApiError("Datei ist leer", 400);
    const key = (body.key as string)?.trim() || slug(name).toLowerCase();
    const felder = await leseFormularfelder(daten);

    const vorhanden = await prisma.documentTemplate.findUnique({ where: { key } });
    if (vorhanden) {
      // Ersetzen = neue Version der Vorlage
      const t = await prisma.documentTemplate.update({
        where: { key },
        data: {
          name: name.trim(),
          fileName: fileName || vorhanden.fileName,
          data: daten,
          version: { increment: 1 },
          formFields: JSON.stringify(felder),
          note: note ?? vorhanden.note,
          deletedAt: null,
        },
        select: { id: true, key: true, name: true, version: true, formFields: true },
      });
      return json({ ...t, ersetzt: true });
    }

    // Für den bekannten Personalfragebogen gleich die Standard-Zuordnung hinterlegen
    const passendeZuordnung = felder.some((f) => f.name === "Vorname (Minijob)")
      ? JSON.stringify(STANDARD_FELDZUORDNUNG)
      : "{}";

    const t = await prisma.documentTemplate.create({
      data: {
        key,
        name: name.trim(),
        fileName: fileName || `${key}.pdf`,
        data: daten,
        formFields: JSON.stringify(felder),
        fieldMap: passendeZuordnung,
        note: note ?? "",
      },
      select: { id: true, key: true, name: true, version: true, formFields: true, fieldMap: true },
    });
    return json(t, 201);
  });
