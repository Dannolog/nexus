import { prisma } from "./prisma";
import { ApiError } from "./http";
import { getEntity, EntityName } from "./entities";
import { AuthContext } from "./auth";
import { randomUUID } from "crypto";

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

export function newTxId() {
  return randomUUID();
}

/** Entfernt server-verwaltete Felder aus Client-Daten. */
function sanitize(entity: EntityName, data: Record<string, unknown>) {
  const def = getEntity(entity);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    if (def.protectedFields.includes(k)) continue;
    out[k] = v;
  }
  return out;
}

/** Schreibt einen Snapshot zurück (für Undo/Redo). null = Datensatz soft-löschen. */
async function applySnapshot(
  tx: Tx,
  entity: EntityName,
  entityId: string,
  snapshot: Record<string, unknown> | null
) {
  const def = getEntity(entity);
  const delegate = (tx as any)[def.delegate];
  const current = await delegate.findUnique({ where: { id: entityId } });
  const baseVersion = current?.version ?? 0;

  if (snapshot === null) {
    // vorher existierte der Datensatz nicht → soft-delete
    await delegate.update({
      where: { id: entityId },
      data: { deletedAt: new Date(), version: baseVersion + 1 },
    });
    return;
  }
  // Skalare aus Snapshot zurückschreiben (ohne id/createdAt/updatedAt)
  const data: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(snapshot)) {
    if (k === "id" || k === "createdAt" || k === "updatedAt" || k === "version") continue;
    data[k] = v;
  }
  data.version = baseVersion + 1;
  await delegate.update({ where: { id: entityId }, data });
}

async function record(
  tx: Tx,
  args: {
    txId: string;
    entity: EntityName;
    entityId: string;
    action: "CREATE" | "UPDATE" | "DELETE";
    before: unknown;
    after: unknown;
    ctx: AuthContext;
  }
) {
  await (tx as any).revision.create({
    data: {
      txId: args.txId,
      entity: args.entity,
      entityId: args.entityId,
      action: args.action,
      before: args.before ? JSON.stringify(args.before) : null,
      after: args.after ? JSON.stringify(args.after) : null,
      identityId: args.ctx.identityId,
      appKey: args.ctx.appKey,
    },
  });
}

// ---------- CRUD (revisions-bewusst, optimistisches Locking) ----------

export async function createEntity(
  entity: EntityName,
  data: Record<string, unknown>,
  ctx: AuthContext,
  txId = newTxId()
) {
  const def = getEntity(entity);
  const attempt = () =>
    prisma.$transaction(async (tx) => {
      const clean = sanitize(entity, data);
      // Zentrale fortlaufende Nummer vergeben (höchste vorhandene + 1), inkl. soft-deleted,
      // damit Nummern nie doppelt/wiederverwendet werden.
      if (def.autoNumberField) {
        const agg = await (tx as any)[def.delegate].aggregate({ _max: { [def.autoNumberField]: true } });
        const max = (agg?._max?.[def.autoNumberField] as number | null) ?? 0;
        clean[def.autoNumberField] = max + 1;
      }
      const created = await (tx as any)[def.delegate].create({ data: clean });
      await record(tx, { txId, entity, entityId: created.id, action: "CREATE", before: null, after: created, ctx });
      return created;
    });

  if (!def.autoNumberField) return attempt();
  // Bei parallelem POST können zwei Transaktionen dieselbe Nummer berechnen → Unique-Konflikt
  // (P2002). Dann neu berechnen und erneut versuchen.
  for (let i = 0; ; i++) {
    try {
      return await attempt();
    } catch (e: any) {
      if (e?.code === "P2002" && i < 5) continue;
      throw e;
    }
  }
}

export async function updateEntity(
  entity: EntityName,
  id: string,
  data: Record<string, unknown>,
  expectedVersion: number | undefined,
  ctx: AuthContext,
  txId = newTxId()
) {
  const def = getEntity(entity);
  return prisma.$transaction(async (tx) => {
    const delegate = (tx as any)[def.delegate];
    const current = await delegate.findUnique({ where: { id } });
    if (!current || current.deletedAt) throw new ApiError("Nicht gefunden", 404);
    if (expectedVersion != null && current.version !== expectedVersion) {
      throw new ApiError("Versionskonflikt", 409, { current });
    }
    const updated = await delegate.update({
      where: { id },
      data: { ...sanitize(entity, data), version: current.version + 1 },
    });
    await record(tx, { txId, entity, entityId: id, action: "UPDATE", before: current, after: updated, ctx });
    return updated;
  });
}

export async function deleteEntity(
  entity: EntityName,
  id: string,
  expectedVersion: number | undefined,
  ctx: AuthContext,
  txId = newTxId()
) {
  const def = getEntity(entity);
  return prisma.$transaction(async (tx) => {
    const delegate = (tx as any)[def.delegate];
    const current = await delegate.findUnique({ where: { id } });
    if (!current || current.deletedAt) throw new ApiError("Nicht gefunden", 404);
    if (expectedVersion != null && current.version !== expectedVersion) {
      throw new ApiError("Versionskonflikt", 409, { current });
    }
    const updated = await delegate.update({
      where: { id },
      data: { deletedAt: new Date(), version: current.version + 1 },
    });
    await record(tx, { txId, entity, entityId: id, action: "DELETE", before: current, after: null, ctx });
    return updated;
  });
}

// ---------- Undo / Redo ----------

/** Macht alle Änderungen einer Transaktion rückgängig (wendet before-Zustand an). */
export async function undoTx(txId: string, ctx: AuthContext) {
  return prisma.$transaction(async (tx) => {
    const revs = await (tx as any).revision.findMany({
      where: { txId, undone: false, action: { in: ["CREATE", "UPDATE", "DELETE"] } },
      orderBy: { createdAt: "desc" },
    });
    if (revs.length === 0) throw new ApiError("Keine rückgängig machbaren Änderungen für diese txId", 404);
    for (const r of revs) {
      const before = r.before ? JSON.parse(r.before) : null;
      await applySnapshot(tx, r.entity as EntityName, r.entityId, before);
      await (tx as any).revision.update({ where: { id: r.id }, data: { undone: true } });
    }
    return { txId, reverted: revs.length };
  });
}

/** Stellt eine zuvor rückgängig gemachte Transaktion wieder her (wendet after-Zustand an). */
export async function redoTx(txId: string, ctx: AuthContext) {
  return prisma.$transaction(async (tx) => {
    const revs = await (tx as any).revision.findMany({
      where: { txId, undone: true, action: { in: ["CREATE", "UPDATE", "DELETE"] } },
      orderBy: { createdAt: "asc" },
    });
    if (revs.length === 0) throw new ApiError("Keine wiederherstellbaren Änderungen für diese txId", 404);
    for (const r of revs) {
      const after = r.after ? JSON.parse(r.after) : null;
      await applySnapshot(tx, r.entity as EntityName, r.entityId, after);
      await (tx as any).revision.update({ where: { id: r.id }, data: { undone: false } });
    }
    return { txId, restored: revs.length };
  });
}
