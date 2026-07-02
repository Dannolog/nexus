"use client";
import { useState } from "react";
import { setSession } from "@/lib/clientApi";
import AppLogo from "@/components/AppLogo";
import Icon from "@/components/Icon";
import TextField from "@/components/TextField";

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
      window.location.href = "/";
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main
      style={{
        display: "grid",
        placeItems: "center",
        minHeight: "100vh",
        padding: 16,
        background:
          "radial-gradient(900px 500px at 50% -5%, rgba(59,130,246,0.14), transparent 70%), var(--bg)",
      }}
    >
      <form
        onSubmit={submit}
        className="card"
        style={{
          padding: 32,
          width: 380,
          maxWidth: "100%",
          display: "grid",
          gap: 16,
          boxShadow: "0 12px 40px rgba(0,0,0,0.10)",
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
          <TextField type="email" value={email} onChange={setEmail} autoComplete="username" placeholder="name@firma.de" inputStyle={{ paddingTop: 11, paddingBottom: 11 }} />
        </label>
        <label style={{ fontSize: 13, fontWeight: 500, display: "grid", gap: 6 }}>
          Passwort
          <TextField type="password" value={password} onChange={setPassword} autoComplete="current-password" placeholder="••••••••" inputStyle={{ paddingTop: 11, paddingBottom: 11 }} />
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
