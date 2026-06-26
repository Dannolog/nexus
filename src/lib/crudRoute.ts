import { NextRequest } from "next/server";
import { prisma } from "./prisma";
import { json, handle, ApiError } from "./http";
import { requireApp, requireAuth } from "./auth";
import { getEntity, EntityName } from "./entities";
import { createEntity, updateEntity, deleteEntity } from "./revision";
import { getActiveLock } from "./locking";

/** GET /api/<entity> — Liste mit Suche/Filter. Nur App-Key nötig (Lesen). */
export function makeList(entity: EntityName) {
  const def = getEntity(entity);
  return (req: NextRequest) =>
    handle(async () => {
      requireApp(req);
      const sp = req.nextUrl.searchParams;
      const search = sp.get("search")?.trim();
      const includeDeleted = sp.get("deleted") === "1";
      const archived = sp.get("archived"); // "0" | "1" | null
      const take = Math.min(Number(sp.get("take") ?? 200), 1000);

      const where: any = {};
      if (!includeDeleted) where.deletedAt = null;
      if (search)
        where.OR = def.searchable.map((f) => ({ [f]: { contains: search, mode: "insensitive" } }));
      if (archived === "0") where.archived = false;
      if (archived === "1") where.archived = true;

      const rows = await (prisma as any)[def.delegate].findMany({
        where,
        take,
        orderBy: { updatedAt: "desc" },
      });
      // Logos NICHT in der Liste mitsenden (Transfer schlank halten) — werden
      // über /api/<entity>/:id/logo asynchron nachgeladen.
      for (const r of rows) if ("logo" in r) delete r.logo;
      return json({ data: rows, count: rows.length });
    });
}

/** POST /api/<entity> — anlegen. App-Key + User-JWT. */
export function makeCreate(entity: EntityName) {
  return (req: NextRequest) =>
    handle(async () => {
      const ctx = await requireAuth(req);
      const body = await req.json().catch(() => ({}));
      const created = await createEntity(entity, body, ctx);
      return json(created, 201);
    });
}

/** GET /api/<entity>/:id — einzeln (inkl. aktivem Lock-Hinweis). */
export function makeGet(entity: EntityName) {
  const def = getEntity(entity);
  return (req: NextRequest, ctx2: { params: { id: string } }) =>
    handle(async () => {
      requireApp(req);
      const row = await (prisma as any)[def.delegate].findUnique({ where: { id: ctx2.params.id } });
      if (!row) throw new ApiError("Nicht gefunden", 404);
      const lock = await getActiveLock(entity, ctx2.params.id);
      return json({ ...row, _lock: lock });
    });
}

/** PATCH /api/<entity>/:id — ändern (optimistisches Locking via expectedVersion). */
export function makePatch(entity: EntityName) {
  return (req: NextRequest, ctx2: { params: { id: string } }) =>
    handle(async () => {
      const ctx = await requireAuth(req);
      const body = await req.json().catch(() => ({}));
      const { expectedVersion, ...data } = body ?? {};
      const updated = await updateEntity(entity, ctx2.params.id, data, expectedVersion, ctx);
      return json(updated);
    });
}

/** GET /api/<entity>/:id/logo — Firmenlogo/-symbol asynchron laden (nur das logo-Feld). */
export function makeLogoGet(entity: EntityName) {
  const def = getEntity(entity);
  return (req: NextRequest, ctx2: { params: { id: string } }) =>
    handle(async () => {
      requireApp(req);
      const row = await (prisma as any)[def.delegate].findUnique({
        where: { id: ctx2.params.id },
        select: { logo: true },
      });
      if (!row) throw new ApiError("Nicht gefunden", 404);
      return json({ logo: row.logo || "" });
    });
}

/** DELETE /api/<entity>/:id — soft-delete (optimistisches Locking optional via ?expectedVersion). */
export function makeDelete(entity: EntityName) {
  return (req: NextRequest, ctx2: { params: { id: string } }) =>
    handle(async () => {
      const ctx = await requireAuth(req);
      const ev = req.nextUrl.searchParams.get("expectedVersion");
      const expectedVersion = ev != null ? Number(ev) : undefined;
      const deleted = await deleteEntity(entity, ctx2.params.id, expectedVersion, ctx);
      return json(deleted);
    });
}
