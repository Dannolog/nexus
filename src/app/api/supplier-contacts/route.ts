import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { json, handle, ApiError } from "@/lib/http";
import { requireApp, requireAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/supplier-contacts?supplierId=…  – Ansprechpartner eines Lieferanten
 * GET /api/supplier-contacts?search=…      – Ansprechpartner über alle Lieferanten suchen
 *                                            (liefert den Lieferanten mit)
 */
export const GET = (req: NextRequest) =>
  handle(async () => {
    requireApp(req);
    const sp = req.nextUrl.searchParams;
    const supplierId = sp.get("supplierId");
    const search = sp.get("search")?.trim();

    if (supplierId) {
      const rows = await prisma.supplierContact.findMany({
        where: { supplierId },
        orderBy: { name: "asc" },
      });
      return json({ data: rows, count: rows.length });
    }

    if (search) {
      const rows = await prisma.supplierContact.findMany({
        where: {
          OR: ["name", "role", "email", "phone", "mobile"].map((f) => ({
            [f]: { contains: search, mode: "insensitive" as const },
          })),
        },
        orderBy: { name: "asc" },
        take: 200,
        include: { supplier: { select: { id: true, number: true, name: true, shortCode: true } } },
      });
      return json({ data: rows, count: rows.length });
    }

    throw new ApiError("supplierId oder search erforderlich", 400);
  });

/** POST /api/supplier-contacts { supplierId, name, role?, email?, phone?, mobile?, notes? } */
export const POST = (req: NextRequest) =>
  handle(async () => {
    await requireAuth(req);
    const body = await req.json().catch(() => ({}));
    if (!body.supplierId || !String(body.name || "").trim()) {
      throw new ApiError("supplierId und name erforderlich", 400);
    }
    const created = await prisma.supplierContact.create({
      data: {
        supplierId: body.supplierId,
        name: String(body.name).trim(),
        role: body.role ?? "",
        email: body.email ?? "",
        phone: body.phone ?? "",
        mobile: body.mobile ?? "",
        notes: body.notes ?? "",
      },
    });
    return json(created, 201);
  });
