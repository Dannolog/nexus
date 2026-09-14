import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { json, handle, ApiError } from "@/lib/http";
import { requireApp, requireAuth } from "@/lib/auth";
import { KONTAKT_FELDER, PRIVATE_TEXTFELDER, ownerFelder } from "@/lib/kontakte";

export const dynamic = "force-dynamic";

/** GET /api/contacts/:id — ein Kontakt. */
export const GET = (req: NextRequest, { params }: { params: { id: string } }) =>
  handle(async () => {
    requireApp(req);
    const row = await prisma.contact.findFirst({ where: { id: params.id, deletedAt: null }, select: KONTAKT_FELDER });
    if (!row) throw new ApiError("Nicht gefunden", 404);
    return json(row);
  });

/** PATCH /api/contacts/:id — ändern; die Firma lässt sich dabei wechseln. */
export const PATCH = (req: NextRequest, { params }: { params: { id: string } }) =>
  handle(async () => {
    await requireAuth(req);
    const body = await req.json().catch(() => ({}));
    const aktuell = await prisma.contact.findFirst({ where: { id: params.id, deletedAt: null } });
    if (!aktuell) throw new ApiError("Nicht gefunden", 404);
    // Optimistisches Sperren – ProjectEye schickt expectedVersion und behandelt 409 selbst.
    if (body.expectedVersion != null && aktuell.version !== Number(body.expectedVersion)) {
      throw new ApiError("Versionskonflikt", 409, { current: aktuell });
    }

    const data: Record<string, unknown> = {};
    for (const f of ["name", "role", "email", "phone", "mobile", "notes", "category", "kontorId", "clockerId", "projecteyeId", "source", ...PRIVATE_TEXTFELDER]) {
      if (typeof body[f] === "string") data[f] = body[f];
    }
    // Geburtstag: leerer Wert entfernt ihn wieder
    if (body.birthday !== undefined) data.birthday = body.birthday ? new Date(String(body.birthday)) : null;
    if (typeof body.favorite === "boolean") data.favorite = body.favorite;
    if (body.ownerKind != null || body.customerId != null || body.supplierId != null) {
      const art = body.customerId ? "customer" : body.supplierId ? "supplier" : String(body.ownerKind || "frei");
      const id = String(body.customerId || body.supplierId || body.ownerId || "");
      Object.assign(data, await ownerFelder(art, id, String(body.ownerName ?? aktuell.ownerName)));
    }
    if (!Object.keys(data).length) throw new ApiError("Keine Änderungen übergeben", 400);

    const row = await prisma.contact.update({
      where: { id: params.id },
      data: { ...data, version: aktuell.version + 1 },
      select: KONTAKT_FELDER,
    });
    return json(row);
  });

/** DELETE /api/contacts/:id — weich löschen (die Gegenseite entfernt ihn beim nächsten Abgleich). */
export const DELETE = (req: NextRequest, { params }: { params: { id: string } }) =>
  handle(async () => {
    await requireAuth(req);
    const aktuell = await prisma.contact.findFirst({ where: { id: params.id, deletedAt: null } });
    if (!aktuell) throw new ApiError("Nicht gefunden", 404);
    const ev = req.nextUrl.searchParams.get("expectedVersion");
    if (ev != null && ev !== "" && aktuell.version !== Number(ev)) {
      throw new ApiError("Versionskonflikt", 409, { current: aktuell });
    }
    await prisma.contact.update({
      where: { id: params.id },
      data: { deletedAt: new Date(), version: aktuell.version + 1 },
    });
    return json({ ok: true });
  });
