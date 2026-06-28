"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/clientApi";
import Icon from "@/components/Icon";

const TILES = [
  { href: "/customers", label: "Kunden", key: "customers", icon: "users" },
  { href: "/projects", label: "Projekte", key: "projects", icon: "folder" },
  { href: "/tasks", label: "Aufgaben", key: "tasks", icon: "tasks" },
  { href: "/employees", label: "Mitarbeiter", key: "employees", icon: "user" },
];

export default function Dashboard() {
  const [counts, setCounts] = useState<any>(null);
  useEffect(() => {
    api("/api/health").then((d) => setCounts(d.counts)).catch(() => {});
  }, []);
  return (
    <div>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4, display: "flex", alignItems: "center", gap: 10 }}>
        <Icon name="home" size={24} /> Übersicht
      </h1>
      <p className="muted" style={{ marginBottom: 20 }}>Zentrale Stammdaten für alle Apps</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(180px,1fr))", gap: 16 }}>
        {TILES.map((t) => (
          <Link key={t.href} href={t.href} className="card" style={{ padding: 20, textDecoration: "none", color: "var(--fg)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ fontSize: 32, fontWeight: 700 }}>{counts ? counts[t.key] ?? "–" : "…"}</div>
              <span style={{ color: "var(--accent)", opacity: 0.85 }}><Icon name={t.icon} size={26} /></span>
            </div>
            <div className="muted">{t.label}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
