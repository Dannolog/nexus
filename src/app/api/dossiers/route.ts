import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth";
import { handle, json, ApiError } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * Eigene Akten der Betriebsakte (z. B. „Fuhrpark", „Immobilie Hauptstraße") – frei benannt,
 * stehen neben den Mandanten. Mit Anzahl der darin liegenden Dokumente.
 */
export const GET = (req: NextRequest) =>
  handle(async () => {
    await requireAuth(req);
    const akten = await prisma.dossier.findMany({
      where: { deletedAt: null },
      orderBy: [{ sort: "asc" }, { name: "asc" }],
    });
    const zahlen = akten.length
      ? await prisma.organizationDocument.groupBy({
          by: ["orgId"], where: { deletedAt: null, orgId: { in: akten.map((a) => a.id) } }, _count: true,
        })
      : [];
    const zahl = new Map(zahlen.map((z) => [z.orgId, z._count]));
    return json({ data: akten.map((a) => ({ ...a, dokumente: zahl.get(a.id) || 0 })) });
  });

/** Neue Akte anlegen. */
export const POST = (req: NextRequest) =>
  handle(async () => {
    await requireAuth(req);
    const body = await req.json().catch(() => ({}));
    const name = String(body.name || "").trim();
    if (!name) throw new ApiError("Name fehlt", 400);
    const doppelt = await prisma.dossier.findFirst({ where: { name: { equals: name, mode: "insensitive" }, deletedAt: null } });
    if (doppelt) throw new ApiError(`Die Akte „${name}" gibt es bereits.`, 409);
    const letzte = await prisma.dossier.findFirst({ where: { deletedAt: null }, orderBy: { sort: "desc" }, select: { sort: true } });
    const akte = await prisma.dossier.create({
      data: { name, note: String(body.note || ""), color: String(body.color || ""), sort: (letzte?.sort ?? 0) + 10 },
    });
    return json(akte, 201);
  });
