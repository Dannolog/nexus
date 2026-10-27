import { NextRequest } from "next/server";
import { json, handle, ApiError } from "@/lib/http";
import { resolveAppKey } from "@/lib/auth";
import { starten, ipVon, basisPruefen, APP_NAMEN } from "@/lib/qrLogin";

export const dynamic = "force-dynamic";

/**
 * POST /api/auth/qr/start { app?, basis?, geraet? } — neuen QR-Code für die Anmeldung erzeugen.
 * Die App ergibt sich aus dem X-App-Key; ohne Key darf `app` genannt werden (nur zur Anzeige
 * und Freigabeprüfung – das ausgestellte Token prüft jede App ohnehin live).
 * `basis` = Nexus-Adresse, die das Handy erreicht (z. B. https://192.168.1.10:3052).
 * `ua`/`ip` des eigentlichen PCs reichen App-Server als `geraet`/X-Forwarded-For durch.
 */
export const POST = (req: NextRequest) =>
  handle(async () => {
    const body = await req.json().catch(() => ({}));
    let app = resolveAppKey(req);
    if (app === "nexus" && body.app) {
      app = String(body.app);
      if (!APP_NAMEN[app]) throw new ApiError("Unbekannte App", 400);
    }
    const ua = String(body.geraet || req.headers.get("user-agent") || "");
    const r = await starten({ app, basis: basisPruefen(body.basis, req), ip: ipVon(req), ua });
    return json(r);
  });
