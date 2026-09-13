import { prisma } from "@/lib/prisma";
import { json, handle } from "@/lib/http";

export const dynamic = "force-dynamic";

/** GET /api/health — Liveness + DB-Check. */
export const GET = () =>
  handle(async () => {
    // Gezählt wird der lebende Bestand – weich gelöschtes bleibt außen vor.
    const aktiv = { where: { deletedAt: null } };
    const counts = {
      customers: await prisma.customer.count(aktiv),
      contacts: await prisma.contact.count(aktiv),
      suppliers: await prisma.supplier.count(aktiv),
      projects: await prisma.project.count(aktiv),
      tasks: await prisma.task.count(aktiv),
      employees: await prisma.employee.count(aktiv),
      products: await prisma.product.count(aktiv),
      identities: await prisma.identity.count(aktiv),
    };
    return json({ ok: true, service: "nexus", counts });
  });
