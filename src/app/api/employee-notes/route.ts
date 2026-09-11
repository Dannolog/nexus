import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth";
import { handle, json, ApiError } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** Notizen eines Mitarbeiters (neueste zuerst). */
export const GET = (req: NextRequest) =>
  handle(async () => {
    await requireAuth(req);
    const employeeId = new URL(req.url).searchParams.get("employeeId") || "";
    if (!employeeId) throw new ApiError("Mitarbeiter fehlt", 400);
    const data = await prisma.employeeNote.findMany({
      where: { employeeId, deletedAt: null },
      orderBy: { createdAt: "desc" },
    });
    return json({ data });
  });

/** Notiz in der Akte ablegen – optional in einer Rubrik. */
export const POST = (req: NextRequest) =>
  handle(async () => {
    const ctx = await requireAuth(req);
    const body = await req.json().catch(() => ({}));
    const employeeId = String(body.employeeId || "");
    const text = String(body.text || "").trim();
    if (!employeeId) throw new ApiError("Mitarbeiter fehlt", 400);
    if (!text) throw new ApiError("Die Notiz ist leer", 400);
    const emp = await prisma.employee.findFirst({ where: { id: employeeId, deletedAt: null } });
    if (!emp) throw new ApiError("Mitarbeiter nicht gefunden", 404);
    // Urheber nur als Anzeigename – kein Passwort, keine Kennung
    const wer = await prisma.identity.findFirst({ where: { id: ctx.identityId }, select: { name: true } });
    const note = await prisma.employeeNote.create({
      data: {
        employeeId,
        groupId: String(body.groupId || ""),
        title: String(body.title || "").trim(),
        text,
        author: wer?.name || "",
      },
    });
    return json(note, 201);
  });
