import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth";
import { handle, json, ApiError } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** Bezeichnung ändern. */
export const PATCH = (req: NextRequest, { params }: { params: { id: string } }) =>
  handle(async () => {
    await requireAuth(req);
    const body = await req.json().catch(() => ({}));
    if (typeof body.title !== "string") throw new ApiError("Keine Änderungen übergeben", 400);
    const b = await prisma.contactImage.update({
      where: { id: params.id },
      data: { title: body.title.trim() },
      select: { id: true, title: true },
    });
    return json(b);
  });

/** Bild entfernen. */
export const DELETE = (req: NextRequest, { params }: { params: { id: string } }) =>
  handle(async () => {
    await requireAuth(req);
    await prisma.contactImage.delete({ where: { id: params.id } });
    return json({ ok: true });
  });
