"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { getUser, clearSession } from "@/lib/clientApi";
import AppLogo from "@/components/AppLogo";

const NAV = [
  { href: "/", label: "Übersicht", icon: "🏠" },
  { href: "/customers", label: "Kunden", icon: "👥" },
  { href: "/projects", label: "Projekte", icon: "📁" },
  { href: "/employees", label: "Mitarbeiter", icon: "🧑‍💼" },
  { href: "/organizations", label: "Mandanten", icon: "🏢" },
  { href: "/identities", label: "Userverwaltung", icon: "🔐" },
  { href: "/history", label: "Verlauf (Undo/Redo)", icon: "🕘" },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<any>(null);
  const [ready, setReady] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    const u = getUser();
    if (!u) {
      router.replace("/login");
      return;
    }
    setUser(u);
    setReady(true);
  }, [router]);

  function toggleTheme() {
    const el = document.documentElement;
    const dark = el.classList.toggle("dark");
    localStorage.theme = dark ? "dark" : "light";
  }

  if (!ready) return null;

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden" }}>
      <aside className="card" style={{ width: 220, height: "100vh", flexShrink: 0, borderRadius: 0, borderTop: 0, borderBottom: 0, borderLeft: 0, padding: 16, display: "flex", flexDirection: "column", gap: 4, overflowY: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, fontWeight: 700, fontSize: 20, padding: "4px 8px 12px" }}>
          <AppLogo size={28} /> Nexus
        </div>
        {NAV.map((n) => {
          const active = n.href === "/" ? pathname === "/" : pathname.startsWith(n.href);
          return (
            <Link key={n.href} href={n.href}
              style={{ padding: "8px 10px", borderRadius: 8, fontSize: 14,
                background: active ? "var(--accent)" : "transparent",
                color: active ? "#fff" : "var(--fg)", textDecoration: "none",
                display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 18, textAlign: "center" }}>{n.icon}</span>{n.label}
            </Link>
          );
        })}
        <div style={{ marginTop: "auto", display: "grid", gap: 8, paddingTop: 12 }}>
          <button className="btn" onClick={toggleTheme}>🌓 Theme</button>
          <div className="muted" style={{ fontSize: 12, padding: "0 4px" }}>{user?.name} ({user?.globalRole})</div>
          <button className="btn" onClick={() => { clearSession(); window.location.href = "/login"; }}>🚪 Abmelden</button>
        </div>
      </aside>
      <main style={{ flex: 1, padding: 24, overflow: "auto" }}>{children}</main>
    </div>
  );
}
