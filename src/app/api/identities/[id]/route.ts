import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { verschluessle } from "@/lib/geheimnis";
import { prisma } from "@/lib/prisma";
import { json, handle, ApiError } from "@/lib/http";
import { requireApp, requireAuth } from "@/lib/auth";
import { newTxId } from "@/lib/revision";
import { mailKaskade } from "@/lib/mailKaskade";

export const dynamic = "force-dynamic";

/** GET /api/identities/:id */
export const GET = (req: NextRequest, { params }: { params: { id: string } }) =>
  handle(async () => {
    requireApp(req);
    const identity = await prisma.identity.findUnique({
      where: { id: params.id },
      include: { appAccess: true },
    });
    if (!identity) throw new ApiError("Nicht gefunden", 404);
    const { passwordHash, passwordEnc, ...safe } = identity;
    return json(safe);
  });

/** PATCH /api/identities/:id { name?, globalRole?, password?, expectedVersion?, appAccess?[] } → Revision */
export const PATCH = (req: NextRequest, { params }: { params: { id: string } }) =>
  handle(async () => {
    const ctx = await requireAuth(req);
    const body = await req.json().catch(() => ({}));
    const txId = newTxId();

    const result = await prisma.$transaction(async (tx) => {
      const current = await tx.identity.findUnique({ where: { id: params.id }, include: { appAccess: true } });
      if (!current || current.deletedAt) throw new ApiError("Nicht gefunden", 404);
      if (body.expectedVersion != null && current.version !== body.expectedVersion) {
        throw new ApiError("Versionskonflikt", 409, { current: { ...current, passwordHash: undefined } });
      }
      const passwordHash = body.password ? await bcrypt.hash(String(body.password), 10) : undefined;
      // Zusätzlich verschlüsselt merken, damit ein Admin das Passwort weitergeben kann.
      const passwordEnc = body.password ? verschluessle(String(body.password)) : undefined;
      // Anmeldekennung: geänderte E-Mail muss eindeutig bleiben und beim Mitarbeiter mitziehen.
      const neueMail = body.email != null ? String(body.email).trim() : "";
      if (neueMail && neueMail.toLowerCase() !== current.email.toLowerCase()) {
        const belegt = await tx.identity.findFirst({ where: { email: neueMail, NOT: { id: params.id } } });
        if (belegt) throw new ApiError(`Die E-Mail „${neueMail}" ist bereits für „${belegt.name || belegt.email}" vergeben.`, 409);
      }
      const updated = await tx.identity.update({
        where: { id: params.id },
        data: {
          ...(neueMail ? { email: neueMail } : {}),
          ...(body.name != null ? { name: body.name } : {}),
          ...(body.globalRole != null ? { globalRole: body.globalRole } : {}),
          ...(passwordHash ? { passwordHash } : {}),
          ...(passwordEnc ? { passwordEnc } : {}),
          version: current.version + 1,
        },
      });

      if (Array.isArray(body.appAccess)) {
        for (const a of body.appAccess) {
          if (!a.appKey) continue;
          await tx.identityAppAccess.upsert({
            where: { identityId_appKey: { identityId: params.id, appKey: a.appKey } },
            update: {
              allowed: a.allowed ?? true,
              role: a.role ?? "user",
              rights: typeof a.rights === "string" ? a.rights : JSON.stringify(a.rights ?? {}),
              syncedAt: new Date(),
            },
            create: {
              identityId: params.id,
              appKey: a.appKey,
              allowed: a.allowed ?? true,
              role: a.role ?? "user",
              rights: typeof a.rights === "string" ? a.rights : JSON.stringify(a.rights ?? {}),
              syncedAt: new Date(),
            },
          });
        }
      }

      // E-Mail geändert → Mitarbeiterstammsatz nachziehen (Verlauf mit derselben txId)
      if (neueMail && neueMail.toLowerCase() !== current.email.toLowerCase()) {
        const mit = await mailKaskade(tx, "Identity", updated, current.email, neueMail, updated.name);
        if (mit) {
          await tx.revision.create({
            data: {
              txId, entity: mit.entity, entityId: mit.id, action: "UPDATE",
              before: JSON.stringify(mit.before), after: JSON.stringify(mit.after),
              identityId: ctx.identityId, appKey: ctx.appKey,
            },
          });
        }
      }

      await tx.revision.create({
        data: {
          txId, entity: "Identity", entityId: params.id, action: "UPDATE",
          before: JSON.stringify({ ...current, passwordHash: undefined, appAccess: undefined }),
          after: JSON.stringify({ ...updated, passwordHash: undefined }),
          identityId: ctx.identityId, appKey: ctx.appKey,
        },
      });

      return tx.identity.findUnique({ where: { id: params.id }, include: { appAccess: true } });
    });

    const { passwordHash, ...safe } = result as any;
    return json(safe);
  });
