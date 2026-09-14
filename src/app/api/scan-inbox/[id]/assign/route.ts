import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth";
import { handle, json, ApiError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { bauDateiname } from "@/lib/documents";

export const dynamic = "force-dynamic";

/**
 * Scan einem Mitarbeiter zuordnen: Aus dem Posteingang wird ein Dokument in dessen Akte
 * (`EmployeeDocument`), optional in einer Rubrik. Der Scan bleibt als Beleg erhalten und
 * ist danach als „zugeordnet" gekennzeichnet.
 *
 * Body: { employeeId, groupId?, orgId?, title? }
 */
export const POST = (req: NextRequest, { params }: { params: { id: string } }) =>
  handle(async () => {
    await requireAuth(req);
    const body = await req.json().catch(() => ({}));
    const employeeId = String(body.employeeId || "");
    if (!employeeId) throw new ApiError("Mitarbeiter fehlt", 400);

    const scan = await prisma.scanDocument.findFirst({ where: { id: params.id, deletedAt: null } });
    if (!scan) throw new ApiError("Scan nicht gefunden", 404);
    if (scan.status === "zugeordnet" && scan.documentId) {
      throw new ApiError("Dieser Scan ist bereits zugeordnet.", 409);
    }
    const emp = await prisma.employee.findFirst({ where: { id: employeeId, deletedAt: null } });
    if (!emp) throw new ApiError("Mitarbeiter nicht gefunden", 404);
    const orgId = String(body.orgId || "");
    const org = orgId ? await prisma.organization.findFirst({ where: { id: orgId, deletedAt: null } }) : null;

    const titel = String(body.title || scan.title).trim();
    const key = "scan";
    // Version wie in der Akte üblich: je Mitarbeiter und Dokumentart hochzählen
    const letzte = await prisma.employeeDocument.findFirst({
      where: { employeeId, templateKey: key },
      orderBy: { version: "desc" },
      select: { version: true },
    });
    const version = (letzte?.version ?? 0) + 1;

    const doc = await prisma.employeeDocument.create({
      data: {
        employeeId,
        groupId: String(body.groupId || ""),
        orgId,
        orgName: org?.name || "",
        templateKey: key,
        title: titel,
        fileName: bauDateiname({
          orgName: org?.name || "",
          employeeKey: emp.employeeNumber || emp.name || emp.id.slice(0, 6),
          docKey: key,
          version,
          ext: ".pdf",
        }),
        mimeType: scan.mimeType,
        data: scan.data,
        size: scan.size,
        version,
        sha256: scan.sha256,
        note: scan.note || `gescannt am ${scan.scannedAt.toLocaleString("de-DE")}${scan.scannerName ? ` (${scan.scannerName})` : ""}`,
      },
      select: { id: true, fileName: true, version: true, title: true },
    });

    await prisma.scanDocument.update({
      where: { id: scan.id },
      data: { status: "zugeordnet", employeeId, groupId: String(body.groupId || ""), documentId: doc.id },
    });

    return json({ ok: true, dokument: doc }, 201);
  });
