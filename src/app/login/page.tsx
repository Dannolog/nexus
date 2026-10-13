"use client";
import { useState, useRef } from "react";
import { setSession } from "@/lib/clientApi";
import AppLogo from "@/components/AppLogo";
import Icon from "@/components/Icon";
import TextField from "@/components/TextField";
import LoginHintergrund from "./LoginHintergrund";

export default function LoginPage() {
  const [email, setEmail] = useState("admin@nexus.local");
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
        placeItems: "center",
        minHeight: "100dvh",
        position: "relative",
        overflow: "hidden",
        padding: "max(24px, env(safe-area-inset-top)) 16px max(24px, env(safe-area-inset-bottom))",
        background:
          "radial-gradient(900px 500px at 50% -5%, color-mix(in srgb, var(--accent) 16%, transparent), transparent 70%), " +
          "radial-gradient(700px 420px at 100% 110%, color-mix(in srgb, var(--accent) 9%, transparent), transparent 70%), var(--bg)",
      }}
    >
      <style>{`
        .login-karte { padding: 32px; width: 380px; }
        @media (max-width: 480px) {
          .login-karte { padding: 24px 18px; width: 100%; border-radius: 18px; }
          .login-karte h1 { font-size: 22px !important; }
        }
      `}</style>
      <LoginHintergrund />
      <form
        onSubmit={submit}
        className="card login-karte"
        style={{
          position: "relative",
          zIndex: 1,
          maxWidth: "100%",
          display: "grid",
          gap: 16,
          boxShadow: "0 12px 40px rgba(0,0,0,0.10)",
          background: "color-mix(in srgb, var(--card) 92%, transparent)",
          backdropFilter: "blur(6px)",
          WebkitBackdropFilter: "blur(6px)",
        }}
      >
        <div style={{ display: "grid", justifyItems: "center", gap: 10, marginBottom: 4 }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 16,
              display: "grid",
              placeItems: "center",
              background: "color-mix(in srgb, var(--accent) 14%, transparent)",
            }}
          >
            <AppLogo size={34} />
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 700, lineHeight: 1 }}>Nexus</h1>
          <p className="muted" style={{ fontSize: 13, textAlign: "center" }}>
            Zentrale Stammdaten-Anmeldung
          </p>
        </div>

        <label style={{ fontSize: 13, fontWeight: 500, display: "grid", gap: 6 }}>
          E-Mail
          <TextField type="email" value={email} onChange={setEmail} autoComplete="username" placeholder="name@firma.de"
            autoFocus enterKeyHint="next" onKeyDown={weiterZumPasswort}
            inputStyle={{ paddingTop: 11, paddingBottom: 11 }} />
        </label>
        <label style={{ fontSize: 13, fontWeight: 500, display: "grid", gap: 6 }}>
          Passwort
          <TextField type="password" value={password} onChange={setPassword} autoComplete="current-password" placeholder="••••••••"
            inputRef={passwortRef} enterKeyHint="go"
            inputStyle={{ paddingTop: 11, paddingBottom: 11 }} />
        </label>

        {err && (
          <div
            style={{
              color: "#ef4444",
              fontSize: 13,
              background: "rgba(239,68,68,0.10)",
              border: "1px solid rgba(239,68,68,0.30)",
              borderRadius: 8,
              padding: "8px 10px",
            }}
          >
            {err}
          </div>
        )}

        <button
          className="btn btn-primary"
          disabled={busy}
          type="submit"
          style={{ justifyContent: "center", padding: "11px 16px", marginTop: 4 }}
        >
          {busy ? "…" : <><Icon name="login" /> Anmelden</>}
        </button>
      </form>
    </main>
  );
}
