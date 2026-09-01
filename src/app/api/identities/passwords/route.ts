import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { requireAuth } from "@/lib/auth";
import { handle, json, ApiError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { verschluessle } from "@/lib/geheimnis";
import { erzeugePasswort } from "@/lib/passwort";
import { newTxId } from "@/lib/revision";

export const dynamic = "force-dynamic";

/**
 * POST /api/identities/passwords — vergibt für mehrere Benutzer auf einmal ein neues,
 * sicheres Passwort (zentral für alle Apps, da sich die Apps über Nexus anmelden).
 *
 * Body:
 *  - `modus: "fehlende"` (Vorgabe) — nur Konten **ohne** hinterlegtes Passwort
 *  - `modus: "alle"` — alle Konten bekommen ein neues Passwort (alte werden ungültig)
 *  - `ids: string[]` — statt eines Modus gezielt einzelne Konten
 *
 * Nur für globale Admins. Die neuen Passwörter werden **einmalig** zurückgegeben, damit
 * der Admin sie weitergeben kann; gespeichert werden sie als bcrypt-Hash plus
 * verschlüsselte Kopie. Jede Vergabe wird im Verlauf vermerkt (ohne den Wert).
 */
export const POST = (req: NextRequest) =>
  handle(async () => {
    const ctx = await requireAuth(req);
    if (ctx.user.globalRole !== "admin") {
      throw new ApiError("Nur globale Admins dürfen Passwörter vergeben", 403);
    }

    const body = await req.json().catch(() => ({}));
    const ids = Array.isArray(body.ids) ? body.ids.map(String).filter(Boolean) : null;
    const modus = body.modus === "alle" ? "alle" : "fehlende";

    const identities = await prisma.identity.findMany({
      where: {
        deletedAt: null,
        ...(ids ? { id: { in: ids } } : modus === "fehlende" ? { passwordEnc: "" } : {}),
      },
      select: { id: true, email: true, name: true },
      orderBy: { name: "asc" },
    });
    if (!identities.length) return json({ anzahl: 0, benutzer: [] });

    const txId = newTxId();
    const benutzer: { id: string; name: string; email: string; passwort: string }[] = [];

    for (const identity of identities) {
      const passwort = erzeugePasswort();
      await prisma.identity.update({
        where: { id: identity.id },
        data: {
          passwordHash: await bcrypt.hash(passwort, 10),
          passwordEnc: verschluessle(passwort),
          version: { increment: 1 },
        },
      });
      await prisma.revision.create({
        data: {
          txId,
          entity: "Identity",
          entityId: identity.id,
          action: "PASSWORD_SET",
          before: null,
          after: JSON.stringify({ email: identity.email, vergebenVon: ctx.identityName || ctx.identityId, sammelvergabe: true }),
          identityId: ctx.identityId,
          appKey: ctx.appKey,
        },
      }).catch(() => { /* Vermerk ist Beiwerk – die Vergabe soll daran nicht scheitern */ });
      benutzer.push({ ...identity, passwort });
    }

    return json({ anzahl: benutzer.length, benutzer });
  });
