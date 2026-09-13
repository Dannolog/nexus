import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { json, handle, ApiError } from "@/lib/http";
import { requireApp, requireAuth } from "@/lib/auth";
import { KONTAKT_FELDER, ownerFelder } from "@/lib/kontakte";

export const dynamic = "force-dynamic";

/**
 * Ansprechpartner von Lieferanten – **Adapter auf das zentrale Kontaktregister**
 * (`Contact`, siehe /mnt/devip3/shared/sync/KONTAKTE.md). Die Route bleibt bestehen,
 * damit Oberfläche und andere Apps unverändert weiterarbeiten; gespeichert wird zentral.
 *
 * GET ?supplierId=…  – Ansprechpartner eines Lieferanten
 * GET ?search=…      – über alle Lieferanten suchen (liefert den Lieferanten mit)
 */
export const GET = (req: NextRequest) =>
  handle(async () => {
    requireApp(req);
    const sp = req.nextUrl.searchParams;
    const supplierId = sp.get("supplierId");
    const search = sp.get("search")?.trim();

    if (supplierId) {
      const rows = await prisma.contact.findMany({
        where: { deletedAt: null, ownerKind: "supplier", ownerId: supplierId },
        orderBy: { name: "asc" },
        select: KONTAKT_FELDER,
      });
      return json({ data: rows.map((r) => ({ ...r, supplierId })), count: rows.length });
    }

    if (search) {
      const rows = await prisma.contact.findMany({
        where: {
          deletedAt: null,
          ownerKind: "supplier",
          OR: ["name", "role", "email", "phone", "mobile"].map((f) => ({
            [f]: { contains: search, mode: "insensitive" as const },
          })),
        },
        orderBy: { name: "asc" },
        take: 200,
        include: { supplier: { select: { id: true, number: true, name: true, shortCode: true } } },
      });
      return json({ data: rows.map((r) => ({ ...r, supplierId: r.ownerId })), count: rows.length });
    }

    throw new ApiError("supplierId oder search erforderlich", 400);
  });

/** POST { supplierId, name, role?, email?, phone?, mobile?, notes? } */
export const POST = (req: NextRequest) =>
  handle(async () => {
    await requireAuth(req);
    const body = await req.json().catch(() => ({}));
    if (!body.supplierId || !String(body.name || "").trim()) {
      throw new ApiError("supplierId und name erforderlich", 400);
    }
    const owner = await ownerFelder("supplier", String(body.supplierId));
    const created = await prisma.contact.create({
      data: {
        name: String(body.name).trim(),
        role: body.role ?? "", email: body.email ?? "",
        phone: body.phone ?? "", mobile: body.mobile ?? "", notes: body.notes ?? "",
        source: "nexus",
        ...owner,
      },
      select: KONTAKT_FELDER,
    });
    return json({ ...created, supplierId: body.supplierId }, 201);
  });
