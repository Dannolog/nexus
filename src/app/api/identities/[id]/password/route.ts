import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth";
import { handle, json, ApiError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { entschluessle } from "@/lib/geheimnis";

export const dynamic = "force-dynamic";

/**
 * Gibt das hinterlegte Anmeldepasswort **einer** Identität zurück, damit ein Admin es
 * an den Mitarbeiter weitergeben kann.
 *
 * Absichtlich eng gefasst:
 *  - nur für **globale Admins**
 *  - immer nur ein Datensatz, nie eine Liste
 *  - nur, wenn das Passwort über Nexus vergeben wurde (ältere Konten haben nur den Hash;
 *    dann hilft nur ein neues Passwort)
 *  - jeder Abruf wird im Verlauf vermerkt (nachvollziehbar, ohne den Wert zu speichern)
 */
export const GET = (req: NextRequest, { params }: { params: { id: string } }) =>
  handle(async () => {
    const ctx = await requireAuth(req);
    if (ctx.user.globalRole !== "admin") {
      throw new ApiError("Nur globale Admins dürfen ein Passwort abrufen", 403);
    }

    const identity = await prisma.identity.findFirst({
      where: { id: params.id, deletedAt: null },
      select: { id: true, email: true, name: true, passwordEnc: true },
    });
    if (!identity) throw new ApiError("Benutzer nicht gefunden", 404);

    const passwort = entschluessle(identity.passwordEnc || "");
    if (!passwort) {
      return json({
        vorhanden: false,
        hinweis: "Für diesen Benutzer ist kein weitergebbares Passwort hinterlegt. Es wurde vor dieser Funktion vergeben oder stammt aus einer anderen App – bitte ein neues Passwort erzeugen.",
      });
    }

    // Vermerk im Verlauf: wer wann welches Konto abgerufen hat (ohne den Wert selbst)
    await prisma.revision.create({
      data: {
        txId: `pw-${Date.now()}`,
        entity: "Identity",
        entityId: identity.id,
        action: "PASSWORD_READ",
        before: null,
        after: JSON.stringify({ email: identity.email, gelesenVon: ctx.identityName || ctx.identityId }),
        identityId: ctx.identityId,
        appKey: ctx.appKey,
      },
    }).catch(() => { /* Vermerk ist Beiwerk – der Abruf soll daran nicht scheitern */ });

    return json({ vorhanden: true, passwort });
  });
