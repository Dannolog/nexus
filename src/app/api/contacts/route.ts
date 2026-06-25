import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { json, handle, ApiError } from "@/lib/http";
import { requireApp, requireAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** GET /api/contacts?customerId= — Ansprechpartner eines Kunden. */
export const GET = (req: NextRequest) =>
  handle(async () => {
    requireApp(req);
    const customerId = req.nextUrl.searchParams.get("customerId");
    if (!customerId) throw new ApiError("customerId erforderlich", 400);
    const rows = await prisma.customerContact.findMany({ where: { customerId } });
    return json({ data: rows, count: rows.length });
  });

/** POST /api/contacts { customerId, name, role?, email?, phone?, mobile? } */
export const POST = (req: NextRequest) =>
  handle(async () => {
    await requireAuth(req);
    const body = await req.json().catch(() => ({}));
    if (!body.customerId || !body.name) throw new ApiError("customerId und name erforderlich", 400);
    const created = await prisma.customerContact.create({
      data: {
        customerId: body.customerId,
        name: body.name,
        role: body.role ?? "",
        email: body.email ?? "",
        phone: body.phone ?? "",
        mobile: body.mobile ?? "",
      },
    });
    return json(created, 201);
  });
