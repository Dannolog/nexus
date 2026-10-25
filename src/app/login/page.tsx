"use client";
import { useState, useRef, useEffect } from "react";
import { setSession } from "@/lib/clientApi";
import AppLogo from "@/components/AppLogo";
import Icon from "@/components/Icon";
import TextField from "@/components/TextField";
import LoginHintergrund from "./LoginHintergrund";

export default function LoginPage() {
  // Leer starten, damit der graue Platzhalter sichtbar ist – die zuletzt benutzte
  // E-Mail wird (nur in diesem Browser) gemerkt und wieder eingesetzt.
  const [email, setEmail] = useState("");
  useEffect(() => {
    try {
      const letzte = localStorage.getItem("nexus-letzte-email");
      if (letzte) { setEmail(letzte); setTimeout(() => passwortRef.current?.focus(), 0); }
    } catch { /* Speicher gesperrt – egal */ }
  }, []);
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Login fehlgeschlagen");
      setSession(data.token, data.identity);
      try { localStorage.setItem("nexus-letzte-email", email.trim()); } catch { /* egal */ }
      // Nach abgelaufener Sitzung zurück auf die Seite, auf der gearbeitet wurde –
      // dort werden gesicherte Entwürfe wieder angeboten.
      const weiter = new URLSearchParams(window.location.search).get("weiter");
      window.location.href = weiter && weiter.startsWith("/") ? weiter : "/";
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  // Nach der E-Mail direkt ins Passwortfeld: Tab und Enter springen weiter.
  // (Die Vorschlagsliste des Browsers schluckt den ersten Tab sonst gelegentlich.)
  const passwortRef = useRef<HTMLInputElement>(null);
  const weiterZumPasswort = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Tab" && !e.shiftKey) { e.preventDefault(); passwortRef.current?.focus(); }
    else if (e.key === "Enter") { e.preventDefault(); passwortRef.current?.focus(); }
  };

  return (
    <main
      className="login-seite"
      style={{
        display: "grid",
        // minmax(0,1fr): die Spalte darf nie breiter als der Bildschirm werden –
        // sonst schiebt die Mindestbreite der Felder die Karte an den Rand.
        gridTemplateColumns: "minmax(0, 1fr)",
        placeItems: "center",
        minHeight: "100dvh",
        position: "relative",
        overflow: "hidden",
        padding: "max(24px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) max(24px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left))",
        background:
          "radial-gradient(900px 500px at 50% -5%, color-mix(in srgb, var(--accent) 16%, transparent), transparent 70%), " +
          "radial-gradient(700px 420px at 100% 110%, color-mix(in srgb, var(--accent) 9%, transparent), transparent 70%), var(--bg)",
      }}
    >
      <style>{`
        .login-karte {
          position: relative; z-index: 1; width: 100%; max-width: 420px; min-width: 0; box-sizing: border-box; padding: 40px 40px 28px;
          display: grid; gap: 18px; border-radius: 24px;
          background: color-mix(in srgb, var(--card) 86%, transparent);
          border: 1px solid color-mix(in srgb, var(--fg) 10%, transparent);
          box-shadow: 0 30px 80px rgba(0,0,0,.35), 0 0 0 1px rgba(255,255,255,.02) inset;
          backdrop-filter: blur(14px) saturate(1.2); -webkit-backdrop-filter: blur(14px) saturate(1.2);
          animation: loginEin .5s cubic-bezier(.2,.8,.2,1) both;
        }
        .login-badge {
          width: 72px; height: 72px; border-radius: 20px; display: grid; place-items: center;
          background: linear-gradient(135deg, #3b82f6, #6366f1);
          box-shadow: 0 10px 30px color-mix(in srgb, #4f6cf5 55%, transparent), 0 0 0 6px color-mix(in srgb, #4f6cf5 10%, transparent);
        }
        .login-feld { display: grid; gap: 8px; min-width: 0; font-size: 13.5px; font-weight: 600; color: color-mix(in srgb, var(--fg) 80%, transparent); }
        .login-feld .input { padding-top: 13px; padding-bottom: 13px; border-radius: 12px; font-size: 15.5px;
          background: color-mix(in srgb, var(--bg) 70%, transparent); transition: border-color .15s, box-shadow .15s; }
        .login-feld .input { caret-color: var(--accent); color: var(--fg); }
        .login-feld .input::placeholder { color: var(--muted); opacity: .75; transition: opacity .15s; }
        .login-feld .input:focus::placeholder { opacity: .4; }
        .login-feld .input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 22%, transparent); outline: none; }
        .login-feld .textfeld-icon { color: var(--muted) !important; transition: color .15s, opacity .15s; }
        .login-feld:focus-within .textfeld-icon { color: var(--accent) !important; opacity: 1 !important; }
        .login-feld:focus-within { color: var(--fg); }
        /* Autofill des Browsers: eigene Farben behalten, Cursor bleibt in Akzentfarbe */
        .login-feld .input:-webkit-autofill { -webkit-text-fill-color: var(--fg); caret-color: var(--accent);
          -webkit-box-shadow: 0 0 0 1000px var(--card) inset; transition: background-color 9999s; }
        .login-knopf {
          border: 0; border-radius: 12px; padding: 14px 16px; margin-top: 6px; cursor: pointer;
          display: flex; align-items: center; justify-content: center; gap: 10px;
          font-size: 16px; font-weight: 700; color: #fff;
          background: linear-gradient(90deg, #3b82f6, #6366f1);
          box-shadow: 0 10px 28px color-mix(in srgb, #4f6cf5 40%, transparent);
          transition: transform .12s, box-shadow .15s, filter .15s;
        }
        .login-knopf:hover:not(:disabled) { filter: brightness(1.08); box-shadow: 0 14px 34px color-mix(in srgb, #4f6cf5 50%, transparent); }
        .login-knopf:active:not(:disabled) { transform: translateY(1px); }
        .login-knopf:disabled { opacity: .7; cursor: wait; }
        .login-dreh { width: 18px; height: 18px; border-radius: 50%; border: 2px solid rgba(255,255,255,.4); border-top-color: #fff; animation: loginDreh .8s linear infinite; }
        @keyframes loginDreh { to { transform: rotate(360deg); } }
        @keyframes loginEin { from { opacity: 0; transform: translateY(12px) scale(.98); } to { opacity: 1; transform: none; } }
        @media (prefers-reduced-motion: reduce) { .login-karte { animation: none; } }
        @media (max-width: 480px) {
          .login-karte { padding: 28px 18px 20px; border-radius: 20px; }
          .login-karte p { font-size: 13px !important; }
          .login-badge { width: 64px; height: 64px; border-radius: 18px; }
          .login-karte h1 { font-size: 26px !important; }
        }
      `}</style>
      <LoginHintergrund />
      <form onSubmit={submit} className="login-karte">
        <div style={{ display: "grid", justifyItems: "center", gap: 12, marginBottom: 6 }}>
          <div className="login-badge"><AppLogo size={46} nurZeichen /></div>
          <h1 style={{ fontSize: 30, fontWeight: 800, lineHeight: 1.1, letterSpacing: "-0.01em", marginTop: 6 }}>Nexus</h1>
          <p className="muted" style={{ fontSize: 14, textAlign: "center" }}>
            Zentrale Stammdaten · <b style={{ color: "var(--fg)", fontWeight: 600 }}>ein Konto für alle Apps</b>
          </p>
        </div>

        <label className="login-feld">
          E-Mail
          <TextField type="email" value={email} onChange={setEmail} autoComplete="username" placeholder="name@bgroup.de"
            icon="user" autoFocus enterKeyHint="next" onKeyDown={weiterZumPasswort} />
        </label>
        <label className="login-feld">
          Passwort
          <TextField type="password" value={password} onChange={setPassword} autoComplete="current-password" placeholder="••••••••"
            icon="lock" inputRef={passwortRef} enterKeyHint="go" />
        </label>

        {err && (
          <div role="alert" style={{
            color: "#ef4444", fontSize: 13.5, background: "rgba(239,68,68,0.10)",
            border: "1px solid rgba(239,68,68,0.30)", borderRadius: 12, padding: "10px 12px",
            display: "flex", gap: 8, alignItems: "center",
          }}>
            <Icon name="alert" size={16} /> {err}
          </div>
        )}

        <button className="login-knopf" disabled={busy} type="submit">
          {busy ? <><span className="login-dreh" /> Anmelden…</> : <><Icon name="login" size={18} /> Anmelden</>}
        </button>

        <p className="muted" style={{ fontSize: 12.5, textAlign: "center", marginTop: 2 }}>
          Anmeldung mit dem zentralen Nexus-Konto
        </p>
      </form>
    </main>
  );
}
