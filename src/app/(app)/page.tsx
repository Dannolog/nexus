"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/clientApi";

const TILES = [
  { href: "/customers", label: "Kunden", key: "customers" },
  { href: "/projects", label: "Projekte", key: "projects" },
  { href: "/employees", label: "Mitarbeiter", key: "employees" },
  { href: "/identities", label: "User", key: "identities" },
];

export default function Dashboard() {
  const [counts, setCounts] = useState<any>(null);
  useEffect(() => {
    api("/api/health").then((d) => setCounts(d.counts)).catch(() => {});
  }, []);
  return (
    <div>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>Übersicht</h1>
      <p className="muted" style={{ marginBottom: 20 }}>Zentrale Stammdaten für alle Apps</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(180px,1fr))", gap: 16 }}>
        {TILES.map((t) => (
          <Link key={t.href} href={t.href} className="card" style={{ padding: 20, textDecoration: "none", color: "var(--fg)" }}>
            <div style={{ fontSize: 32, fontWeight: 700 }}>{counts ? counts[t.key] ?? "–" : "…"}</div>
            <div className="muted">{t.label}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
