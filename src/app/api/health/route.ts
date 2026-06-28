import { prisma } from "@/lib/prisma";
import { json, handle } from "@/lib/http";

export const dynamic = "force-dynamic";

/** GET /api/health — Liveness + DB-Check. */
export const GET = () =>
  handle(async () => {
    const counts = {
      customers: await prisma.customer.count(),
      projects: await prisma.project.count(),
      tasks: await prisma.task.count(),
      employees: await prisma.employee.count(),
      identities: await prisma.identity.count(),
    };
    return json({ ok: true, service: "nexus", counts });
  });
