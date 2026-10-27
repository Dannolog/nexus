"use client";
import { useEffect, useState } from "react";
import { getToken, getUser } from "@/lib/clientApi";
import AppLogo from "@/components/AppLogo";
import Icon from "@/components/Icon";

/**
 * Freigabe am Handy: Der QR-Code einer App (oder der Nexus-Anmeldung) führt hierher.
 * Ohne Nexus-Anmeldung erst anmelden, dann geht es automatisch hierher zurück.
 * Server: /api/auth/qr/:id/info und /freigeben (src/lib/qrLogin.ts, Register auth.qr-login).
 */
export default function QrFreigabe({ params }: { params: { id: string } }) {
  const [info, setInfo] = useState<any>(null);
  const [stand, setStand] = useState<"laedt" | "frage" | "laeuft" | "frei" | "abgelehnt" | "fehler">("laedt");
  const [meldung, setMeldung] = useState("");
  const ich = typeof window !== "undefined" ? getUser() : null;

  const zurAnmeldung = () => { window.location.href = `/login?weiter=${encodeURIComponent(`/qr/${params.id}`)}`; };

  useEffect(() => {
    const t = getToken();
    if (!t) { zurAnmeldung(); return; }
    fetch(`/api/auth/qr/${encodeURIComponent(params.id)}/info`, { headers: { Authorization: `Bearer ${t}` }, cache: "no-store" })
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (r.status === 401) { zurAnmeldung(); return; }
        if (!r.ok) throw new Error(d.error || "Unbekannter Fehler");
        setInfo(d); setStand("frage");
      })
      .catch((e) => { setMeldung(e.message); setStand("fehler"); });
  }, [params.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function entscheiden(ablehnen: boolean) {
    setStand("laeuft");
    try {
      const r = await fetch(`/api/auth/qr/${encodeURIComponent(params.id)}/freigeben`, {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ ablehnen }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "Freigabe fehlgeschlagen");
      try { navigator.vibrate?.(40); } catch { /* egal */ }
      setStand(ablehnen ? "abgelehnt" : "frei");
    } catch (e: any) { setMeldung(e.message); setStand("fehler"); }
  }

  const knopf: React.CSSProperties = { border: 0, borderRadius: 14, padding: "16px", fontSize: 17, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 10 };

  return (
    <main style={{ minHeight: "100dvh", display: "grid", placeItems: "center", gridTemplateColumns: "minmax(0,1fr)", background: "radial-gradient(900px 500px at 50% -5%, color-mix(in srgb, var(--accent) 16%, transparent), transparent 70%), var(--bg)",
      padding: "max(24px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) max(24px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left))" }}>
      <style>{`@keyframes qrDreh{to{transform:rotate(360deg)}}@keyframes qrEin{from{opacity:0;transform:scale(.6)}to{opacity:1;transform:none}}`}</style>
      <div className="card" style={{ width: "100%", maxWidth: 420, boxSizing: "border-box", borderRadius: 22, padding: "30px 22px 22px", display: "grid", gap: 16, textAlign: "center" }}>
        <div style={{ display: "grid", justifyItems: "center", gap: 8 }}>
          <div style={{ width: 60, height: 60, borderRadius: 18, display: "grid", placeItems: "center", background: "linear-gradient(135deg,#3b82f6,#6366f1)" }}><AppLogo size={38} nurZeichen /></div>
          <h1 style={{ fontSize: 22, fontWeight: 800 }}>Anmeldung per QR-Code</h1>
        </div>

        {stand === "laedt" && <div style={{ display: "grid", placeItems: "center", padding: 20 }}><span style={{ width: 30, height: 30, borderRadius: "50%", border: "3px solid color-mix(in srgb, var(--accent) 25%, transparent)", borderTopColor: "var(--accent)", animation: "qrDreh .8s linear infinite" }} /></div>}

        {(stand === "frage" || stand === "laeuft") && info && (
          <>
            <div style={{ fontSize: 16, lineHeight: 1.5 }}>
              Ein Gerät möchte sich als <b>{ich?.name || ich?.email || "du"}</b> bei <b>{info.appName}</b> anmelden.
            </div>
            <div style={{ display: "grid", gap: 6, padding: "12px 14px", borderRadius: 14, background: "color-mix(in srgb, var(--fg) 5%, transparent)", textAlign: "left", fontSize: 14 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}><Icon name="maximize" size={16} /> {info.geraet}</div>
              <div className="muted" style={{ display: "flex", gap: 8, alignItems: "center" }}><Icon name="wifi" size={16} /> {info.ip}</div>
            </div>
            <div style={{ fontSize: 13, color: "#f59e0b" }}>Nur freigeben, wenn du gerade selbst vor diesem Gerät sitzt.</div>
            <button style={{ ...knopf, color: "#fff", background: "linear-gradient(90deg,#3b82f6,#6366f1)" }} disabled={stand === "laeuft"} onClick={() => entscheiden(false)}>
              {stand === "laeuft" ? "Gibt frei …" : <><Icon name="check" size={20} /> Freigeben</>}
            </button>
            <button style={{ ...knopf, fontSize: 15, background: "transparent", color: "var(--fg)", border: "1px solid var(--border)" }} disabled={stand === "laeuft"} onClick={() => entscheiden(true)}>
              <Icon name="x" size={18} /> Ablehnen
            </button>
          </>
        )}

        {stand === "frei" && (
          <div style={{ display: "grid", justifyItems: "center", gap: 10 }}>
            <div style={{ width: 64, height: 64, borderRadius: "50%", background: "#16a34a", color: "#fff", display: "grid", placeItems: "center", animation: "qrEin .35s cubic-bezier(.2,.8,.2,1) both" }}><Icon name="check" size={34} /></div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>{info?.appName} ist angemeldet.</div>
            <div className="muted" style={{ fontSize: 13.5 }}>Du kannst dieses Fenster schließen.</div>
          </div>
        )}
        {stand === "abgelehnt" && <div style={{ fontSize: 15 }}>Abgelehnt – das Gerät wurde nicht angemeldet.</div>}
        {stand === "fehler" && <div role="alert" style={{ color: "#ef4444", fontSize: 14.5, lineHeight: 1.5 }}>{meldung}</div>}

        {stand !== "laedt" && <a href="/" className="muted" style={{ fontSize: 13 }}>Zu Nexus</a>}
      </div>
    </main>
  );
}
