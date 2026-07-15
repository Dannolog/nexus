import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { json, handle, ApiError } from "@/lib/http";
import { requireApp, requireAuth } from "@/lib/auth";
import { newTxId } from "@/lib/revision";
import { randomUUID } from "crypto";

export const dynamic = "force-dynamic";

/** GET /api/identities?appKey= — User + ihre Rolle/Rechte (für eine App gefiltert). */
export const GET = (req: NextRequest) =>
  handle(async () => {
    requireApp(req);
    const appKey = req.nextUrl.searchParams.get("appKey");
    const identities = await prisma.identity.findMany({
      where: { deletedAt: null },
      include: { appAccess: appKey ? { where: { appKey } } : true },
      orderBy: { name: "asc" },
    });
    return json({
      data: identities.map(({ passwordHash, ...rest }) => rest),
      count: identities.length,
    });
  });

/**
 * POST /api/identities — Upsert per email (App→Zentrale-Push, §3.7).
 * Body: { email, name?, password?, globalRole?, origin?, appAccess?: [{appKey,allowed,role,rights,localUserId}] }
 */
export const POST = (req: NextRequest) =>
  handle(async () => {
    const ctx = await requireAuth(req);
    const body = await req.json().catch(() => ({}));
    const email = String(body.email ?? "").toLowerCase().trim();
    if (!email) throw new ApiError("email erforderlich", 400);

    const txId = newTxId();
    const existing = await prisma.identity.findUnique({ where: { email }, include: { appAccess: true } });
    // passwordHash: entweder ein bereits fertiger bcrypt-Hash (z.B. Login-Umzug aus kontor —
    // Login ohne Passwort-Neusetzen) ODER Klartext-`password`, den wir hier hashen.
    const rawHash = typeof body.passwordHash === "string" ? body.passwordHash.trim() : "";
    const isBcrypt = /^\$2[aby]\$\d{2}\$/.test(rawHash);
    if (rawHash && !isBcrypt) throw new ApiError("passwordHash muss ein bcrypt-Hash sein ($2a/$2b/$2y…)", 400);
    const passwordHash = isBcrypt
      ? rawHash
      : body.password
        ? await bcrypt.hash(String(body.password), 10)
        : undefined;

    const result = await prisma.$transaction(async (tx) => {
      let identity;
      let action: "CREATE" | "UPDATE";
      let before: any = null;

      if (existing) {
        action = "UPDATE";
        before = { ...existing, appAccess: undefined };
        identity = await tx.identity.update({
          where: { id: existing.id },
          data: {
            name: body.name ?? existing.name,
            globalRole: body.globalRole ?? existing.globalRole,
            ...(passwordHash ? { passwordHash } : {}),
            version: existing.version + 1,
          },
        });
      } else {
        action = "CREATE";
        identity = await tx.identity.create({
          data: {
            email,
            name: body.name ?? email,
            passwordHash: passwordHash ?? (await bcrypt.hash(randomUUID(), 10)),
            globalRole: body.globalRole ?? "user",
            origin: body.origin ?? ctx.appKey,
          },
        });
      }

      // appAccess upserten (pro appKey)
      const accessList: any[] = Array.isArray(body.appAccess) ? body.appAccess : [];
      for (const a of accessList) {
        // Spec sendet { app, role }; ältere Aufrufer { appKey } → beide akzeptieren.
        const appKey = a.appKey || a.app;
        if (!appKey) continue;
        await tx.identityAppAccess.upsert({
          where: { identityId_appKey: { identityId: identity.id, appKey } },
          update: {
            allowed: a.allowed ?? true,
            role: a.role ?? "user",
            rights: typeof a.rights === "string" ? a.rights : JSON.stringify(a.rights ?? {}),
            localUserId: a.localUserId ?? null,
            syncedAt: new Date(),
          },
          create: {
            identityId: identity.id,
            appKey,
            allowed: a.allowed ?? true,
            role: a.role ?? "user",
            rights: typeof a.rights === "string" ? a.rights : JSON.stringify(a.rights ?? {}),
            localUserId: a.localUserId ?? null,
            syncedAt: new Date(),
          },
        });
      }

      await tx.revision.create({
        data: {
          txId, entity: "Identity", entityId: identity.id, action,
          before: before ? JSON.stringify(before) : null,
          after: JSON.stringify({ ...identity, passwordHash: undefined }),
          identityId: ctx.identityId, appKey: ctx.appKey,
        },
      });

      return tx.identity.findUnique({ where: { id: identity.id }, include: { appAccess: true } });
    });

    const { passwordHash: _ph, ...safe } = result as any;
    return json(safe, existing ? 200 : 201);
  });
