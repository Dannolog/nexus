import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { json, handle, ApiError } from "@/lib/http";
import { requireApp, requireAuth } from "@/lib/auth";
import { KONTAKT_FELDER, PRIVATE_TEXTFELDER, ownerFelder, hauptwerteAusKanaelen, nameAus, zerlegeName, type Kanal } from "@/lib/kontakte";
import { sucheBedingung } from "@/lib/suche";

export const dynamic = "force-dynamic";

/**
 * GET /api/contacts — zentrales Kontaktregister.
 *   ?search=      Volltext über Name, Funktion, E-Mail, Telefon, Firma und Notiz;
 *                 mehrere Begriffe werden UND-verknüpft, "…" hält eine Wortgruppe zusammen
 *   ?ownerKind=&ownerId=   nur Kontakte einer Firma
 *   ?customerId=  Kurzform für ownerKind=customer (Abwärtskompatibilität)
 *   ?supplierId=  Kurzform für ownerKind=supplier
 *   ?favorite=1   nur Schnellauswahl
 *   ?category=    nur eine Kontaktart (z. B. „Vertreter", „Shop")
 */
export const GET = (req: NextRequest) =>
  handle(async () => {
    requireApp(req);
    const sp = req.nextUrl.searchParams;
    const search = (sp.get("search") || "").trim();
    const customerId = sp.get("customerId");
    const supplierId = sp.get("supplierId");
    const ownerKind = sp.get("ownerKind");
    const ownerId = sp.get("ownerId");
    const category = sp.get("category");

    const where: any = { deletedAt: null };
    if (customerId) { where.ownerKind = "customer"; where.ownerId = customerId; }
    else if (supplierId) { where.ownerKind = "supplier"; where.ownerId = supplierId; }
    else if (ownerKind) { where.ownerKind = ownerKind; if (ownerId) where.ownerId = ownerId; }
    if (sp.get("favorite") === "1") where.favorite = true;
    if (category) where.category = category;
    // Mehrfachsuche: „maier einkauf" findet nur Kontakte, auf die beides zutrifft.
    // Private Rufnummern/Adressen sind mitdurchsuchbar (Rückwärtssuche „wer ruft da an?"),
    // angezeigt werden sie aber nur in der zugeklappten Rubrik der Kontaktansicht.
    const bedingung = sucheBedingung(search, [
      "name", "role", "email", "phone", "mobile", "ownerName", "notes", "category",
      "privatePhone", "privateMobile", "privateEmail", "privateCity",
    ]);
    if (bedingung) Object.assign(where, bedingung);

    const rows = await prisma.contact.findMany({
      where,
      orderBy: [{ favorite: "desc" }, { name: "asc" }],
      take: Math.min(Number(sp.get("take") ?? 500), 2000),
      select: { ...KONTAKT_FELDER, channels: { orderBy: { sort: "asc" } } },
    });
    return json({ data: rows, count: rows.length });
  });

/** POST /api/contacts — Kontakt anlegen (Firma über ownerKind/ownerId oder customerId/supplierId). */
export const POST = (req: NextRequest) =>
  handle(async () => {
    await requireAuth(req);
    const body = await req.json().catch(() => ({}));
    // Vor- und Nachname werden getrennt geführt; der Anzeigename ergibt sich daraus.
    const firstName = String(body.firstName ?? "").trim();
    const lastName = String(body.lastName ?? "").trim();
    const name = nameAus(firstName, lastName, body.name);
    if (!name) throw new ApiError("Name erforderlich", 400);
    const zerlegt = firstName || lastName ? { firstName, lastName } : zerlegeName(name);

    // Mehrere E-Mails/Nummern: die Liste gewinnt, sonst die Einzelfelder
    const kanaele: Kanal[] = Array.isArray(body.channels)
      ? body.channels
          .map((k: any) => ({ kind: String(k.kind || "email"), value: String(k.value || "").trim(), label: String(k.label || "").trim() }))
          .filter((k: Kanal) => k.value)
      : [
          ...(body.email ? [{ kind: "email", value: String(body.email).trim(), label: "" }] : []),
          ...(body.phone ? [{ kind: "phone", value: String(body.phone).trim(), label: "" }] : []),
          ...(body.mobile ? [{ kind: "mobile", value: String(body.mobile).trim(), label: "" }] : []),
        ];
    const haupt = hauptwerteAusKanaelen(kanaele);

    const art = body.customerId ? "customer" : body.supplierId ? "supplier" : String(body.ownerKind || "frei");
    const id = String(body.customerId || body.supplierId || body.ownerId || "");
    const owner = await ownerFelder(art, id, String(body.ownerName || ""));

    const created = await prisma.contact.create({
      data: {
        name,
        firstName: zerlegt.firstName,
        lastName: zerlegt.lastName,
        role: String(body.role ?? ""),
        ...haupt,
        channels: { create: kanaele.map((k, i) => ({ kind: k.kind, value: k.value, label: k.label || "", sort: i })) },
        notes: String(body.notes ?? ""),
        category: String(body.category ?? "").trim(),
        // Private Angaben (bleiben in Nexus – der Abgleich fasst sie nicht an)
        ...Object.fromEntries(PRIVATE_TEXTFELDER.map((f) => [f, String(body[f] ?? "")])),
        ...(body.birthday ? { birthday: new Date(String(body.birthday)) } : {}),
        favorite: !!body.favorite,
        source: String(body.source || "nexus"),
        kontorId: String(body.kontorId || ""),
        projecteyeId: String(body.projecteyeId || ""),
        ...owner,
      },
      select: { ...KONTAKT_FELDER, channels: true },
    });
    return json(created, 201);
  });
