import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { json, handle, ApiError } from "@/lib/http";
import { requireApp, requireAuth } from "@/lib/auth";
import { KONTAKT_FELDER, PRIVATE_TEXTFELDER, ownerFelder, hauptwerteAusKanaelen, nameAus, zerlegeName, type Kanal } from "@/lib/kontakte";

export const dynamic = "force-dynamic";

/** GET /api/contacts/:id — ein Kontakt. */
export const GET = (req: NextRequest, { params }: { params: { id: string } }) =>
  handle(async () => {
    requireApp(req);
    const row = await prisma.contact.findFirst({
      where: { id: params.id, deletedAt: null },
      select: { ...KONTAKT_FELDER, channels: { orderBy: { sort: "asc" } } },
    });
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
    for (const f of ["role", "email", "phone", "mobile", "notes", "category", "kontorId", "clockerId", "projecteyeId", "source", ...PRIVATE_TEXTFELDER]) {
      if (typeof body[f] === "string") data[f] = body[f];
    }

    // Vor-/Nachname getrennt – der Anzeigename wird daraus gebildet
    if (body.firstName !== undefined || body.lastName !== undefined || typeof body.name === "string") {
      const firstName = String(body.firstName ?? aktuell.firstName ?? "").trim();
      const lastName = String(body.lastName ?? aktuell.lastName ?? "").trim();
      const name = nameAus(firstName, lastName, body.name ?? aktuell.name);
      if (!name) throw new ApiError("Name erforderlich", 400);
      const zerlegt = firstName || lastName ? { firstName, lastName } : zerlegeName(name);
      data.name = name;
      data.firstName = zerlegt.firstName;
      data.lastName = zerlegt.lastName;
    }

    // Mehrere E-Mails/Nummern: die übergebene Liste ersetzt die bisherige vollständig;
    // daraus werden auch die Hauptwerte neu bestimmt (die gehen in den Abgleich).
    let kanaele: Kanal[] | null = null;
    if (Array.isArray(body.channels)) {
      kanaele = body.channels
        .map((k: any) => ({ kind: String(k.kind || "email"), value: String(k.value || "").trim(), label: String(k.label || "").trim() }))
        .filter((k: Kanal) => k.value);
      Object.assign(data, hauptwerteAusKanaelen(kanaele ?? []));
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

    const row = await prisma.$transaction(async (tx) => {
      if (kanaele) {
        await tx.contactChannel.deleteMany({ where: { contactId: params.id } });
        if (kanaele.length) {
          await tx.contactChannel.createMany({
            data: kanaele.map((k, i) => ({ contactId: params.id, kind: k.kind, value: k.value, label: k.label || "", sort: i })),
          });
        }
      }
      return tx.contact.update({
        where: { id: params.id },
        data: { ...data, version: aktuell.version + 1 },
        select: { ...KONTAKT_FELDER, channels: { orderBy: { sort: "asc" } } },
      });
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
