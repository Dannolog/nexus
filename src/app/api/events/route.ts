import { NextRequest } from "next/server";
import { Client } from "pg";
import { verifyUserToken } from "@/lib/jwt";

export const dynamic = "force-dynamic";
export const maxDuration = 3600;

/**
 * Live-Meldungen für alle offenen Fenster (Server-Sent Events).
 *
 * Jede Änderung in der Datenbank – egal ob aus dieser Oberfläche, aus einer anderen
 * Sitzung oder aus einem Abgleich-Skript – löst den Postgres-Trigger `nexus_live_trg`
 * aus. Der sendet `pg_notify('nexus_live', <Tabelle>)`; diese Route reicht das an alle
 * verbundenen Browser weiter, die daraufhin ihre Liste neu laden.
 *
 * Bewusst ein **eigener Kanal** neben `nexus_sync`: Der Abgleich-Dienst soll nicht bei
 * jeder Dokumentänderung anlaufen, und die Oberfläche soll nicht nur bei Stammdaten reagieren.
 *
 * Eine einzige Datenbankverbindung versorgt alle Browser (Modul-globaler Verteiler).
 * Das Token kommt als Query-Parameter, weil `EventSource` keine eigenen Kopfzeilen kann.
 */

type Hoerer = (tabelle: string) => void;

const hoerer = new Set<Hoerer>();
let verbindung: Client | null = null;
let verbindet = false;

/** Eine gemeinsame LISTEN-Verbindung – wird bei Bedarf aufgebaut und hält sich selbst. */
async function verbinde() {
  if (verbindung || verbindet) return;
  verbindet = true;
  const url = process.env.DATABASE_URL || process.env.NEXUS_DATABASE_URL;
  const c = new Client({ connectionString: url });
  c.on("notification", (n) => {
    const tabelle = n.payload || "";
    for (const h of hoerer) {
      try { h(tabelle); } catch { /* ein defekter Stream darf die anderen nicht stören */ }
    }
  });
  c.on("error", () => {
    verbindung = null;
    verbindet = false;
    setTimeout(() => { if (hoerer.size) verbinde(); }, 5000);
  });
  try {
    await c.connect();
    await c.query("LISTEN nexus_live");
    verbindung = c;
  } catch {
    verbindung = null;
    setTimeout(() => { if (hoerer.size) verbinde(); }, 5000);
  } finally {
    verbindet = false;
  }
}

export const GET = async (req: NextRequest) => {
  const token = req.nextUrl.searchParams.get("token") || "";
  try {
    await verifyUserToken(token);
  } catch {
    return new Response("Nicht angemeldet", { status: 401 });
  }

  await verbinde();
  const kodierer = new TextEncoder();

  const strom = new ReadableStream({
    start(steuerung) {
      const sende = (art: string, daten: string) => {
        try { steuerung.enqueue(kodierer.encode(`event: ${art}\ndata: ${daten}\n\n`)); } catch { /* Stream zu */ }
      };
      sende("bereit", JSON.stringify({ zeit: Date.now() }));

      const h: Hoerer = (tabelle) => sende("aenderung", JSON.stringify({ tabelle, zeit: Date.now() }));
      hoerer.add(h);

      // Lebenszeichen, damit Zwischenstellen die Verbindung nicht abräumen
      const puls = setInterval(() => sende("puls", String(Date.now())), 25000);

      const aufraeumen = () => {
        clearInterval(puls);
        hoerer.delete(h);
        try { steuerung.close(); } catch { /* bereits geschlossen */ }
      };
      req.signal.addEventListener("abort", aufraeumen);
    },
  });

  return new Response(strom, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
};
