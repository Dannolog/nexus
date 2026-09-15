import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth";
import { handle, json, ApiError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { mailKaskade } from "@/lib/mailKaskade";
import { newTxId } from "@/lib/revision";

export const dynamic = "force-dynamic";

/**
 * Adresse ändern: Beschriftung anpassen – oder mit `{ haupt: true }` zur **Haupt**adresse
 * machen. Dabei tauschen Haupt- und Zweitadresse die Plätze, und die neue Hauptadresse
 * zieht wie gewohnt in den Mitarbeiterstammsatz und die Fachanwendungen mit.
 */
export const PATCH = (req: NextRequest, { params }: { params: { id: string; mailId: string } }) =>
  handle(async () => {
    const ctx = await requireAuth(req);
    const body = await req.json().catch(() => ({}));
    const eintrag = await prisma.identityEmail.findFirst({ where: { id: params.mailId, identityId: params.id } });
    if (!eintrag) throw new ApiError("Adresse nicht gefunden", 404);

    if (body.haupt === true) {
      const txId = newTxId();
      const ergebnis = await prisma.$transaction(async (tx) => {
        const identity = await tx.identity.findFirst({ where: { id: params.id, deletedAt: null } });
        if (!identity) throw new ApiError("Zugang nicht gefunden", 404);
        const alteHaupt = identity.email;

        // Plätze tauschen: bisherige Hauptadresse wird Zweitadresse
        await tx.identityEmail.delete({ where: { id: eintrag.id } });
        const aktualisiert = await tx.identity.update({
          where: { id: identity.id },
          data: { email: eintrag.email, version: identity.version + 1 },
        });
        await tx.identityEmail.create({
          data: { identityId: identity.id, email: alteHaupt, label: eintrag.label || "" },
        });

        // Mitarbeiterstammsatz nachziehen (wie bei jeder Änderung der Hauptadresse)
        const mit = await mailKaskade(tx, "Identity", aktualisiert, alteHaupt, eintrag.email, aktualisiert.name);
        await tx.revision.create({
          data: {
            txId, entity: "Identity", entityId: identity.id, action: "UPDATE",
            before: JSON.stringify({ ...identity, passwordHash: undefined, passwordEnc: undefined }),
            after: JSON.stringify({ ...aktualisiert, passwordHash: undefined, passwordEnc: undefined }),
            identityId: ctx.identityId, appKey: ctx.appKey,
          },
        });
        if (mit) {
          await tx.revision.create({
            data: {
              txId, entity: mit.entity, entityId: mit.id, action: "UPDATE",
              before: JSON.stringify(mit.before), after: JSON.stringify(mit.after),
              identityId: ctx.identityId, appKey: ctx.appKey,
            },
          });
        }
        return aktualisiert;
      });
      return json({ ok: true, hauptadresse: ergebnis.email });
    }

    if (typeof body.label === "string") {
      const neu = await prisma.identityEmail.update({ where: { id: eintrag.id }, data: { label: body.label.trim() } });
      return json(neu);
    }
    throw new ApiError("Keine Änderungen übergeben", 400);
  });

/** Adresse entfernen – die Hauptadresse bleibt davon unberührt. */
export const DELETE = (req: NextRequest, { params }: { params: { id: string; mailId: string } }) =>
  handle(async () => {
    await requireAuth(req);
    const eintrag = await prisma.identityEmail.findFirst({ where: { id: params.mailId, identityId: params.id } });
    if (!eintrag) throw new ApiError("Adresse nicht gefunden", 404);
    await prisma.identityEmail.delete({ where: { id: eintrag.id } });
    return json({ ok: true });
  });
