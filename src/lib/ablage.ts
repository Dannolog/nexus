import { prisma } from "@/lib/prisma";

/**
 * Ziel in der Betriebsakte: ein **Mandant** (Organization) oder eine **eigene Akte** (Dossier).
 * Beide legen ihre Dokumente in `OrganizationDocument.orgId` ab.
 */
export type Ablage =
  | { typ: "mandant"; id: string; name: string; org: NonNullable<Awaited<ReturnType<typeof prisma.organization.findFirst>>> }
  | { typ: "akte"; id: string; name: string; org: null };

export async function findeAblage(id: string): Promise<Ablage | null> {
  if (!id) return null;
  const org = await prisma.organization.findFirst({ where: { id, deletedAt: null } });
  if (org) return { typ: "mandant", id, name: org.name, org };
  const akte = await prisma.dossier.findFirst({ where: { id, deletedAt: null } });
  if (akte) return { typ: "akte", id, name: akte.name, org: null };
  return null;
}
