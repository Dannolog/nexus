"use client";
import { useEffect, useRef, useState } from "react";

/**
 * Anmeldung ohne Passwort: fragt eine Bestätigung auf den angemeldeten Geräten an und zeigt die Zahl,
 * die dort angetippt werden muss. Wartet (alle 2 s) auf die Antwort – Server: /api/auth/qr/anfrage.
 * Ob es das Konto gibt bzw. ob es dafür freigegeben ist, verrät der Server nicht – dann läuft es ab.
 */
export default function BestaetigungWarten({ email, app = "nexus", onFrei, onAbbruch }:
  { email: string; app?: string; onFrei: (token: string, identity: any) => void; onAbbruch: (meldung?: string) => void }) {
  const [anf, setAnf] = useState<{ id: string; key: string; zahl: number; bis: number } | null>(null);
  const [rest, setRest] = useState(120);
  const fertig = useRef(false);

  useEffect(() => {
    fetch("/api/auth/qr/anfrage", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, app }) })
      .then(async (r) => { const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || "Anfrage fehlgeschlagen"); setAnf(d); })
      .catch((e) => onAbbruch(e.message));
  }, [email, app]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!anf) return;
    const t = setInterval(async () => {
      setRest(Math.max(0, Math.ceil((anf.bis - Date.now()) / 1000)));
      try {
        const r = await fetch(`/api/auth/qr/${anf.id}?k=${encodeURIComponent(anf.key)}`, { cache: "no-store" });
        const d = await r.json();
        if (fertig.current) return;
        if (d.status === "frei") { fertig.current = true; clearInterval(t); onFrei(d.token, d.identity); }
        else if (d.status === "abgelehnt") { fertig.current = true; clearInterval(t); onAbbruch("Die Anmeldung wurde abgelehnt."); }
        else if (d.status === "abgelaufen") {
          fertig.current = true; clearInterval(t);
          onAbbruch("Keine Bestätigung erhalten. Ohne Passwort geht es nur, wenn es für dein Konto freigegeben ist und du auf einem anderen Gerät angemeldet bist.");
        }
      } catch { /* kurz offline */ }
    }, 2000);
    return () => clearInterval(t);
  }, [anf]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={{ display: "grid", justifyItems: "center", gap: 12, textAlign: "center" }}>
      <div className="muted" style={{ fontSize: 14 }}>Bestätige die Anmeldung auf einem Gerät, auf dem du in Nexus angemeldet bist, und tippe dort diese Zahl:</div>
      <div style={{ fontSize: 56, fontWeight: 800, letterSpacing: ".04em", lineHeight: 1, padding: "14px 28px", borderRadius: 18,
        background: "color-mix(in srgb, var(--accent) 12%, transparent)", border: "1px solid color-mix(in srgb, var(--accent) 35%, transparent)", minWidth: 120 }}>
        {anf ? anf.zahl : <span className="login-dreh" style={{ display: "inline-block", borderColor: "rgba(127,127,127,.3)", borderTopColor: "var(--accent)" }} />}
      </div>
      {anf && <div className="muted" style={{ fontSize: 12 }}>Wartet auf Bestätigung … noch {rest} s</div>}
    </div>
  );
}
