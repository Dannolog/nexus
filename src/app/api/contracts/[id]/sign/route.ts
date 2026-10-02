import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth";
import { handle, json, ApiError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { record, newTxId } from "@/lib/revision";
import { inhaltsHash } from "@/lib/vertragSignatur";

export const dynamic = "force-dynamic";

const ROLLEN = {
  arbeitgeber: { bild: "signEmployerImage", name: "signEmployerName", am: "signEmployerAt" },
  arbeitnehmer: { bild: "signEmployeeImage", name: "signEmployeeName", am: "signEmployeeAt" },
} as const;
type Rolle = keyof typeof ROLLEN;

/**
 * Vertrag digital unterschreiben – je Rolle (Arbeitgeber / Arbeitnehmer) einmal.
 * Body: { rolle, bild (PNG data-URL), name }
 *
 * Beim ersten Unterschreiben wird die Prüfsumme des Inhalts festgehalten; ab dann ist der
 * Inhalt gesperrt. Haben beide unterschrieben, wird der Vertrag „aktiv" und das
 * Unterschriftsdatum gesetzt (falls noch leer).
 */
export const POST = (req: NextRequest, { params }: { params: { id: string } }) =>
  handle(async () => {
    const ctx = await requireAuth(req);
    const body = await req.json().catch(() => ({}));
    const rolle = String(body.rolle || "") as Rolle;
    if (!ROLLEN[rolle]) throw new ApiError("Unbekannte Rolle", 400);
    const bild = String(body.bild || "");
    if (!/^data:image\/png;base64,/.test(bild)) throw new ApiError("Keine Unterschrift übergeben", 400);
    if (bild.length > 600_000) throw new ApiError("Unterschrift zu groß", 413);
    const name = String(body.name || "").trim();
    if (!name) throw new ApiError("Bitte den Namen der unterschreibenden Person angeben", 400);

    return prisma.$transaction(async (tx) => {
      const c: any = await tx.employmentContract.findUnique({ where: { id: params.id } });
      if (!c || c.deletedAt) throw new ApiError("Vertrag nicht gefunden", 404);
      const f = ROLLEN[rolle];
      if (c[f.bild]) throw new ApiError(`Der Vertrag ist für den ${rolle === "arbeitgeber" ? "Arbeitgeber" : "Arbeitnehmer"} bereits unterschrieben.`, 409);

      const hash = inhaltsHash(c);
      if (c.signHash && c.signHash !== hash) {
        throw new ApiError("Der Vertragsinhalt weicht vom bereits unterschriebenen Stand ab – bitte Unterschriften zurücksetzen.", 409);
      }
      const jetzt = new Date();
      const andere = rolle === "arbeitgeber" ? c.signEmployeeImage : c.signEmployerImage;
      const data: Record<string, unknown> = {
        [f.bild]: bild, [f.name]: name, [f.am]: jetzt, signHash: hash, version: c.version + 1,
      };
      if (andere) {
        // Beide Seiten haben unterschrieben → Vertrag gilt
        if (c.status === "entwurf") data.status = "aktiv";
        if (!c.signDate) data.signDate = jetzt;
      }
      const after = await tx.employmentContract.update({ where: { id: c.id }, data });
      await record(tx, { txId: newTxId(), entity: "EmploymentContract", entityId: c.id, action: "UPDATE", before: c, after, ctx });
      return json(after);
    });
  });

/**
 * Unterschriften zurücksetzen (?rolle=arbeitgeber|arbeitnehmer, ohne = beide) –
 * nötig, wenn der Vertragsinhalt noch geändert werden soll.
 */
export const DELETE = (req: NextRequest, { params }: { params: { id: string } }) =>
  handle(async () => {
    const ctx = await requireAuth(req);
    const rolle = req.nextUrl.searchParams.get("rolle") as Rolle | null;
    if (rolle && !ROLLEN[rolle]) throw new ApiError("Unbekannte Rolle", 400);
    return prisma.$transaction(async (tx) => {
      const c: any = await tx.employmentContract.findUnique({ where: { id: params.id } });
      if (!c || c.deletedAt) throw new ApiError("Vertrag nicht gefunden", 404);
      const data: Record<string, unknown> = { version: c.version + 1 };
      for (const r of (rolle ? [rolle] : (Object.keys(ROLLEN) as Rolle[]))) {
        const f = ROLLEN[r];
        data[f.bild] = ""; data[f.name] = ""; data[f.am] = null;
      }
      const bleibt = rolle === "arbeitgeber" ? c.signEmployeeImage : rolle === "arbeitnehmer" ? c.signEmployerImage : "";
      if (!bleibt) data.signHash = "";
      const after = await tx.employmentContract.update({ where: { id: c.id }, data });
      await record(tx, { txId: newTxId(), entity: "EmploymentContract", entityId: c.id, action: "UPDATE", before: c, after, ctx });
      return json(after);
    });
  });
