"use client";
import { useState } from "react";
import { setSession } from "@/lib/clientApi";
import AppLogo from "@/components/AppLogo";

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
    <main style={{ display: "grid", placeItems: "center", minHeight: "100vh", padding: 16 }}>
      <form onSubmit={submit} className="card" style={{ padding: 28, width: 360, display: "grid", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <AppLogo size={32} />
          <h1 style={{ fontSize: 22, fontWeight: 700 }}>Nexus</h1>
        </div>
        <p className="muted" style={{ marginTop: -8, fontSize: 14 }}>Zentrale Stammdaten-Anmeldung</p>
        <label style={{ fontSize: 13 }}>E-Mail
          <input className="input" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
        </label>
        <label style={{ fontSize: 13 }}>Passwort
          <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        </label>
        {err && <div style={{ color: "#ef4444", fontSize: 13 }}>{err}</div>}
        <button className="btn btn-primary" disabled={busy} type="submit">{busy ? "…" : "🔑 Anmelden"}</button>
      </form>
    </main>
  );
}
