import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { json, handle, ApiError } from "@/lib/http";
import { resolveAppKey } from "@/lib/auth";
import { anfragen, ipVon, APP_NAMEN } from "@/lib/qrLogin";

export const dynamic = "force-dynamic";

/**
 * POST /api/auth/qr/anfrage { email, app?, geraet? } — Anmeldung ohne Passwort (Admins + freigegebene User):
 * Auf den angemeldeten Seiten des Admins erscheint eine Anfrage. Danach wie beim QR-Code
 * GET /api/auth/qr/:id?k=<key> abfragen. Antwort ist für jede Adresse gleich.
 */
export const POST = (req: NextRequest) =>
  handle(async () => {
    const body = await req.json().catch(() => ({}));
    let app = resolveAppKey(req);
    if (app === "nexus" && body.app) {
      app = String(body.app);
      if (!APP_NAMEN[app]) throw new ApiError("Unbekannte App", 400);
    }
    const mail = String(body.email || "").toLowerCase().trim();
    if (!mail) throw new ApiError("E-Mail eingeben", 400);
    const ident =
      (await prisma.identity.findFirst({ where: { email: mail, deletedAt: null } })) ||
      (await prisma.identity.findFirst({ where: { deletedAt: null, emails: { some: { email: mail } } } }));
    // Admins immer, andere nur mit ausdrücklicher Freigabe in der Userverwaltung
    const fuer = ident && (ident.globalRole === "admin" || ident.anmeldungBestaetigen) ? ident.id : null;
    const ua = String(body.geraet || req.headers.get("user-agent") || "");
    return json(anfragen({ app, ip: ipVon(req), ua, fuer, mail }));
  });
