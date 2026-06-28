import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { json, handle } from "@/lib/http";
import { requireApp } from "@/lib/auth";

export const dynamic = "force-dynamic";

const SYNC_ENTITIES: { key: string; delegate: string }[] = [
  { key: "customers", delegate: "customer" },
  { key: "projects", delegate: "project" },
  { key: "tasks", delegate: "task" },
  { key: "employees", delegate: "employee" },
  { key: "organizations", delegate: "organization" },
];

/**
 * GET /api/changes?since=<ISO> — Delta-Sync für App-Caches.
 * Liefert geänderte/gelöschte Datensätze seit `since` + Identities inkl. appAccess.
 * Nächster Cursor = `now` (Server-Zeit).
 */
export const GET = (req: NextRequest) =>
  handle(async () => {
    const appKey = requireApp(req);
    const sinceRaw = req.nextUrl.searchParams.get("since");
    const since = sinceRaw ? new Date(sinceRaw) : new Date(0);
    const now = new Date();

    const out: Record<string, unknown> = { now: now.toISOString(), since: since.toISOString() };

    for (const e of SYNC_ENTITIES) {
      const rows = await (prisma as any)[e.delegate].findMany({
        where: { updatedAt: { gt: since } },
        orderBy: { updatedAt: "asc" },
      });
      out[e.key] = rows; // enthält auch soft-deleted (deletedAt gesetzt) → App entfernt lokal
    }

    // Identities + appAccess für die anfragende App (oder alle bei nexus-UI)
    const identities = await prisma.identity.findMany({
      where: { updatedAt: { gt: since } },
      include: { appAccess: appKey === "nexus" ? true : { where: { appKey } } },
    });
    out.identities = identities.map(({ passwordHash, ...rest }) => rest);

    return json(out);
  });
