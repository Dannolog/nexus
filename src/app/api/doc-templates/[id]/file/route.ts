import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth";
import { handle, error, ApiError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { bauDateiname, fuelleFormular, loesePlatzhalter, werteAusMitarbeiter } from "@/lib/documents";

export const dynamic = "force-dynamic";

/**
 * Liefert die Vorlagendatei.
 *   ?employeeId=…  → vorausgefüllt mit den Stammdaten dieses Mitarbeiters
 *   ?orgId=…       → Firma für Dateiname und Arbeitgeberfelder
 * Der Abruf läuft über fetch mit Bearer-Token; die UI reicht das Ergebnis als Download durch.
 */
export const GET = (req: NextRequest, { params }: { params: { id: string } }) =>
  handle(async () => {
    await requireAuth(req);
    const t = await prisma.documentTemplate.findFirst({ where: { id: params.id, deletedAt: null } });
    if (!t) throw new ApiError("Vorlage nicht gefunden", 404);

    const url = new URL(req.url);
    const employeeId = url.searchParams.get("employeeId") || "";
    const orgId = url.searchParams.get("orgId") || "";

    let daten = Buffer.from(t.data);
    let dateiname = t.fileName;

    if (employeeId) {
      const emp = await prisma.employee.findFirst({ where: { id: employeeId, deletedAt: null } });
      if (!emp) throw new ApiError("Mitarbeiter nicht gefunden", 404);
      const org = orgId ? await prisma.organization.findFirst({ where: { id: orgId, deletedAt: null } }) : null;

      const zuordnung = JSON.parse(t.fieldMap || "{}") as Record<string, string>;
      const werte = werteAusMitarbeiter(emp, org);
      const { bytes } = await fuelleFormular(daten, loesePlatzhalter(zuordnung, werte));
      daten = bytes;
      dateiname = bauDateiname({
        orgName: org?.name || "",
        employeeKey: emp.employeeNumber || emp.name || emp.id.slice(0, 6),
        docKey: t.key,
        version: t.version,
      });
    }

    return new Response(new Uint8Array(daten), {
      status: 200,
      headers: {
        "Content-Type": t.mimeType || "application/pdf",
        "Content-Disposition": `inline; filename="${encodeURIComponent(dateiname)}"`,
        "X-Dateiname": encodeURIComponent(dateiname),
        "Cache-Control": "no-store",
      },
    });
  }).catch(() => error("Vorlage konnte nicht geladen werden", 500));
