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
        <div style={{ position: "fixed", inset: 0, zIndex: 9000, background: "rgba(0,0,0,.45)", display: "grid", placeItems: "center", padding: 16 }}>
          <div className="card" role="alertdialog" aria-label="Anmelde-Anfrage" style={{ width: 400, maxWidth: "100%", boxSizing: "border-box", borderRadius: 18, padding: "22px 20px 18px", display: "grid", gap: 14, textAlign: "center" }}>
            <div style={{ justifySelf: "center", width: 52, height: 52, borderRadius: 16, display: "grid", placeItems: "center", color: "#fff", background: "linear-gradient(135deg,#3b82f6,#6366f1)" }}><Icon name="lock" size={26} /></div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>Ein Gerät möchte sich anmelden</div>
            <div style={{ display: "grid", gap: 4, fontSize: 14, padding: "10px 12px", borderRadius: 12, background: "color-mix(in srgb, var(--fg) 5%, transparent)" }}>
              <div><b>{a.appName}</b> · {a.geraet}</div>
              <div className="muted">IP {a.ip}</div>
            </div>
            <div style={{ fontSize: 14 }}>Warst du das? Dann tippe die Zahl, die <b>auf dem Gerät</b> angezeigt wird:</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
              {a.auswahl.map((z) => (
                <button key={z} disabled={laeuft} onClick={() => antworten(z)} className="btn"
                  style={{ height: 64, fontSize: 26, fontWeight: 800, justifyContent: "center", borderRadius: 14 }}>{z}</button>
              ))}
            </div>
            <button disabled={laeuft} onClick={() => antworten(null)} className="btn" style={{ justifyContent: "center", color: "#ef4444" }}>
              <Icon name="x" size={16} /> Nein, das war ich nicht
            </button>
          </div>
        </div>
      )}
      {meldung && (
        <div role="status" style={{ position: "fixed", left: "50%", bottom: 24, transform: "translateX(-50%)", zIndex: 9001, padding: "10px 16px", borderRadius: 12, color: "#fff", fontSize: 14, fontWeight: 600,
          background: meldung.ok ? "#16a34a" : "#ef4444", boxShadow: "0 10px 30px rgba(0,0,0,.3)", maxWidth: "calc(100% - 32px)" }}>{meldung.text}</div>
      )}
    </>
  );
}
