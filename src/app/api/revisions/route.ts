import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { json, handle } from "@/lib/http";
import { requireApp } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** GET /api/revisions?entity=&entityId=&txId= — Änderungsverlauf (global oder gefiltert). */
export const GET = (req: NextRequest) =>
  handle(async () => {
    requireApp(req);
    const sp = req.nextUrl.searchParams;
    const where: any = {};
    if (sp.get("entity")) where.entity = sp.get("entity");
    if (sp.get("entityId")) where.entityId = sp.get("entityId");
    if (sp.get("txId")) where.txId = sp.get("txId");
    const take = Math.min(Number(sp.get("take") ?? 100), 500);
    const rows = await prisma.revision.findMany({ where, take, orderBy: { createdAt: "desc" } });
    return json({ data: rows, count: rows.length });
  });
