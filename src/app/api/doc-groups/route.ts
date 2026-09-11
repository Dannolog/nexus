import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth";
import { handle, json, ApiError } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * Rubriken der Mitarbeiterakte (z. B. „Krankenversicherung"). Sie gelten für alle
 * Mitarbeiter gleich – einmal angelegt, überall nutzbar.
 */
const STANDARD = [
  "Arbeitsvertrag",
  "Krankenversicherung",
  "Sozialversicherung & Steuer",
  "Zeugnisse & Nachweise",
  "Schriftverkehr",
  "Sonstiges",
];

/** Liste der Rubriken. Beim ersten Aufruf werden die üblichen Rubriken angelegt. */
export const GET = (req: NextRequest) =>
  handle(async () => {
    await requireAuth(req);
    let data = await prisma.documentGroup.findMany({
      where: { deletedAt: null },
      orderBy: [{ sort: "asc" }, { name: "asc" }],
    });
    if (data.length === 0) {
      await prisma.documentGroup.createMany({ data: STANDARD.map((name, i) => ({ name, sort: (i + 1) * 10 })) });
      data = await prisma.documentGroup.findMany({ where: { deletedAt: null }, orderBy: [{ sort: "asc" }, { name: "asc" }] });
    }
    return json({ data });
  });

/** Neue Rubrik anlegen. */
export const POST = (req: NextRequest) =>
  handle(async () => {
    await requireAuth(req);
    const body = await req.json().catch(() => ({}));
    const name = String(body.name || "").trim();
    if (!name) throw new ApiError("Name fehlt", 400);
    const doppelt = await prisma.documentGroup.findFirst({ where: { name, deletedAt: null } });
    if (doppelt) throw new ApiError(`Die Rubrik „${name}" gibt es bereits.`, 409);
    const letzte = await prisma.documentGroup.findFirst({ where: { deletedAt: null }, orderBy: { sort: "desc" }, select: { sort: true } });
    const gruppe = await prisma.documentGroup.create({
      data: { name, color: String(body.color || ""), sort: (letzte?.sort ?? 0) + 10 },
    });
    return json(gruppe, 201);
  });
