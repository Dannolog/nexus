"use client";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * QR-Code für die Anmeldung am PC (Register `auth.qr-login`, Server: src/lib/qrLogin.ts).
 * Zeigt den Code, fragt alle 2 s nach und erneuert ihn nach Ablauf selbst.
 * Gibt das Handy frei, kommt `onFrei(token, identity)`.
 */
export default function QrAnmeldung({ app = "nexus", onFrei }: { app?: string; onFrei: (token: string, identity: any) => void }) {
  const [code, setCode] = useState<{ id: string; key: string; qr: string; bis: number } | null>(null);
  const [rest, setRest] = useState(0);
  const [hinweis, setHinweis] = useState("");
  const [fertig, setFertig] = useState(false);
  const aktiv = useRef(true);

  const neu = useCallback(async () => {
    try {
      const r = await fetch("/api/auth/qr/start", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ app, basis: window.location.origin }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "QR-Code konnte nicht erzeugt werden");
      setCode(d);
    } catch (e: any) { setHinweis(e.message); setCode(null); }
  }, [app]);

  useEffect(() => { aktiv.current = true; neu(); return () => { aktiv.current = false; }; }, [neu]);

  useEffect(() => {
    if (!code || fertig) return;
    const t = setInterval(async () => {
      setRest(Math.max(0, Math.ceil((code.bis - Date.now()) / 1000)));
      try {
        const r = await fetch(`/api/auth/qr/${code.id}?k=${encodeURIComponent(code.key)}`, { cache: "no-store" });
        const d = await r.json();
        if (!aktiv.current) return;
        if (d.status === "frei") { setFertig(true); clearInterval(t); onFrei(d.token, d.identity); }
        else if (d.status === "abgelehnt") { setHinweis("Am Handy abgelehnt – neuer Code."); neu(); }
        else if (d.status === "abgelaufen") { setHinweis(""); neu(); }
      } catch { /* kurz offline – nächster Versuch */ }
    }, 2000);
    return () => clearInterval(t);
  }, [code, fertig, neu, onFrei]);

  return (
    <div style={{ display: "grid", justifyItems: "center", gap: 12 }}>
      <div style={{ width: 220, height: 220, borderRadius: 16, background: "#fff", padding: 10, boxSizing: "border-box", display: "grid", placeItems: "center",
        boxShadow: "0 10px 30px rgba(0,0,0,.25)", opacity: fertig ? 0.3 : 1, transition: "opacity .2s" }}>
        {code ? <img src={code.qr} alt="QR-Code zum Anmelden" width={200} height={200} style={{ width: 200, height: 200, imageRendering: "pixelated" }} />
          : <span className="login-dreh" style={{ borderColor: "rgba(0,0,0,.15)", borderTopColor: "#6366f1" }} />}
      </div>
      {fertig ? <div style={{ fontWeight: 700 }}>Freigegeben – melde an …</div> : (
        <>
          <ol className="muted" style={{ fontSize: 13.5, lineHeight: 1.6, margin: 0, paddingLeft: 20, maxWidth: 300, listStyle: "decimal" }}>
            <li>Mit dem Handy die Kamera auf den Code halten</li>
            <li>Am Handy in Nexus angemeldet sein</li>
            <li><b style={{ color: "var(--fg)" }}>Freigeben</b> tippen</li>
          </ol>
          {code && <div className="muted" style={{ fontSize: 12 }}>Gilt noch {rest || Math.ceil((code.bis - Date.now()) / 1000)} s · erneuert sich selbst</div>}
        </>
      )}
      {hinweis && <div style={{ fontSize: 13, color: "#f59e0b" }}>{hinweis}</div>}
    </div>
  );
}
