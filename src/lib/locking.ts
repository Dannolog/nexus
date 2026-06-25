import { prisma } from "./prisma";
import { AuthContext } from "./auth";

const LOCK_TTL_MS = 5 * 60 * 1000; // 5 min, per Heartbeat verlängerbar

/** Setzt/erneuert einen weichen Edit-Lock. Gibt bestehenden Lock zurück, wenn fremd. */
export async function acquireLock(entity: string, entityId: string, ctx: AuthContext) {
  const now = new Date();
  const existing = await prisma.editLock.findUnique({ where: { entity_entityId: { entity, entityId } } });

  if (existing && existing.expiresAt > now && existing.identityId !== ctx.identityId) {
    return { ok: false as const, lock: existing }; // fremd & aktiv → Hinweis
  }
  const expiresAt = new Date(now.getTime() + LOCK_TTL_MS);
  const lock = await prisma.editLock.upsert({
    where: { entity_entityId: { entity, entityId } },
    update: { identityId: ctx.identityId, identityName: ctx.identityName, appKey: ctx.appKey, expiresAt },
    create: { entity, entityId, identityId: ctx.identityId, identityName: ctx.identityName, appKey: ctx.appKey, expiresAt },
  });
  return { ok: true as const, lock };
}

export async function releaseLock(entity: string, entityId: string, ctx: AuthContext) {
  const existing = await prisma.editLock.findUnique({ where: { entity_entityId: { entity, entityId } } });
  if (existing && existing.identityId === ctx.identityId) {
    await prisma.editLock.delete({ where: { id: existing.id } });
  }
  return { ok: true };
}

/** Aktiver Lock eines Datensatzes (für UI-Hinweis), abgelaufene gelten als frei. */
export async function getActiveLock(entity: string, entityId: string) {
  const lock = await prisma.editLock.findUnique({ where: { entity_entityId: { entity, entityId } } });
  if (!lock || lock.expiresAt <= new Date()) return null;
  return lock;
}
