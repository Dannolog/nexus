"use client";
import { useEffect, useRef, useState } from "react";
import { getToken } from "@/lib/clientApi";
import Icon from "@/components/Icon";

/**
 * „Ein Gerät möchte sich anmelden“ – erscheint auf jeder angemeldeten Nexus-Seite, wenn jemand
 * auf der Anmeldeseite (Nexus oder einer App) die eigene E-Mail eingibt und „ohne Passwort“ wählt.
 * Nur für Admins und ausdrücklich freigegebene User (Identity.anmeldungBestaetigen).
 * Bestätigen = die Zahl antippen, die das anfragende Gerät zeigt (Schutz vor versehentlichem „Ja“).
 * Server: /api/auth/qr/offen + /api/auth/qr/:id/freigeben (src/lib/qrLogin.ts, Register auth.qr-login).
 */
type Anfrage = { id: string; appName: string; geraet: string; ip: string; auswahl: number[]; restSek: number };

export default function AnmeldeAnfragen() {
  const [liste, setListe] = useState<Anfrage[]>([]);
  const [erledigt, setErledigt] = useState<string[]>([]);
  const [meldung, setMeldung] = useState<{ text: string; ok: boolean } | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const gesehen = useRef(new Set<string>());

  useEffect(() => {
    let aus = false;
    const holen = async () => {
      const t = getToken();
      if (!t || document.visibilityState !== "visible") return;
      try {
        const r = await fetch("/api/auth/qr/offen", { headers: { Authorization: `Bearer ${t}` }, cache: "no-store" });
        if (!r.ok || aus) return;
        const d: Anfrage[] = await r.json();
        setListe(Array.isArray(d) ? d : []);
        for (const a of d) if (!gesehen.current.has(a.id)) { gesehen.current.add(a.id); try { navigator.vibrate?.([60, 80, 60]); } catch { /* egal */ } }
      } catch { /* offline – nächster Versuch */ }
    };
    holen();
    const iv = setInterval(holen, 3000);
    const sicht = () => holen();
    document.addEventListener("visibilitychange", sicht);
    return () => { aus = true; clearInterval(iv); document.removeEventListener("visibilitychange", sicht); };
  }, []);

  const a = liste.find((x) => !erledigt.includes(x.id));

  async function antworten(zahl: number | null) {
    if (!a || laeuft) return;
    setLaeuft(true);
    try {
      const r = await fetch(`/api/auth/qr/${encodeURIComponent(a.id)}/freigeben`, {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify(zahl == null ? { ablehnen: true } : { zahl }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "Fehlgeschlagen");
      setMeldung({ ok: zahl != null, text: zahl == null ? "Anmeldung abgelehnt." : `${a.appName} auf ${a.geraet} ist angemeldet.` });
    } catch (e: any) { setMeldung({ ok: false, text: e.message }); }
    finally {
      setErledigt((x) => [...x, a.id]); setLaeuft(false);
      setTimeout(() => setMeldung(null), 4000);
    }
  }

  return (
    <>
      {a && (
        <div className="aa-huelle">
          <div className="card aa-karte" role="alertdialog" aria-label="Anmelde-Anfrage">
            <div className="aa-symbol"><Icon name="lock" size={26} /></div>
            <div style={{ fontSize: 18, fontWeight: 800, lineHeight: 1.25 }}>Ein Gerät möchte sich anmelden</div>
            <div className="aa-geraet">
              <div><b>{a.appName}</b> · {a.geraet}</div>
              <div className="muted">IP {a.ip}</div>
            </div>
            <div style={{ fontSize: 14, lineHeight: 1.45 }}>Warst du das? Dann tippe die Zahl, die <b>auf dem Gerät</b> angezeigt wird:</div>
            <div className="aa-zahlen">
              {a.auswahl.map((z) => (
                <button key={z} disabled={laeuft} onClick={() => antworten(z)} className="btn">{z}</button>
              ))}
            </div>
            <button disabled={laeuft} onClick={() => antworten(null)} className="btn aa-nein">
              <Icon name="x" size={16} /> Nein, das war ich nicht
            </button>
          </div>
        </div>
      )}
      {meldung && (
        <div role="status" className="aa-meldung" style={{ background: meldung.ok ? "#16a34a" : "#ef4444" }}>{meldung.text}</div>
      )}
    </>
  );
}
