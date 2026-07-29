"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { getUser, clearSession } from "@/lib/clientApi";
import AppLogo from "@/components/AppLogo";
import Icon from "@/components/Icon";
import CommandPalette from "@/components/CommandPalette";

const NAV = [
  { href: "/", label: "Übersicht", icon: "home" },
  { href: "/customers", label: "Kunden", icon: "users" },
  { href: "/projects", label: "Projekte", icon: "folder" },
  { href: "/products", label: "Artikel", icon: "package" },
  { href: "/tasks", label: "Aufgaben", icon: "tasks" },
  { href: "/employees", label: "Mitarbeiter", icon: "user" },
  { href: "/contracts", label: "Arbeitsverträge", icon: "file-text" },
  { href: "/documents", label: "Dokumente", icon: "archive" },
  { href: "/organizations", label: "Mandanten", icon: "building" },
  { href: "/identities", label: "Userverwaltung", icon: "shield" },
  { href: "/history", label: "Verlauf (Undo/Redo)", icon: "history" },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<any>(null);
  const [ready, setReady] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [updateVerfuegbar, setUpdateVerfuegbar] = useState(false);
  const buildIdRef = useRef<string | null>(null);
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

  // Mobiles Menü bei Seitenwechsel schließen
  useEffect(() => { setMenuOpen(false); }, [pathname]);

  // Neue App-Version erkennen: Build-Kennung regelmäßig abfragen; ändert sie sich,
  // wurde neu ausgerollt → Hinweisleiste mit „Neu laden" (wie in kontor/ProjectEye).
  useEffect(() => {
    async function pruefen() {
      try {
        const res = await fetch("/api/version", { cache: "no-store" });
        const { buildId } = await res.json();
        if (!buildId || buildId === "unknown") return;
        if (buildIdRef.current === null) buildIdRef.current = buildId;
        else if (buildId !== buildIdRef.current) setUpdateVerfuegbar(true);
      } catch { /* offline o. ä. – beim nächsten Durchlauf erneut versuchen */ }
    }
    pruefen();
    const iv = setInterval(pruefen, 30_000);
    const beiFokus = () => pruefen();
    window.addEventListener("focus", beiFokus);
    return () => { clearInterval(iv); window.removeEventListener("focus", beiFokus); };
  }, []);

  function toggleTheme() {
    const el = document.documentElement;
    const dark = el.classList.toggle("dark");
    localStorage.theme = dark ? "dark" : "light";
  }

  if (!ready) return null;

  return (
    <div className="app-shell">
      {/* Hinweis auf eine neu ausgerollte Version – ein Klick lädt sie */}
      {updateVerfuegbar && (
        <div className="update-leiste">
          <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Icon name="redo" size={16} /> Neue Version von Nexus verfügbar
          </span>
          <button onClick={() => window.location.reload()}>Jetzt laden</button>
        </div>
      )}

      {/* Mobile Topbar mit Logo + Hamburger */}
      <header className="topbar">
        <button onClick={() => setMenuOpen(true)} aria-label="Menü öffnen"
          style={{ display: "inline-flex", border: 0, background: "transparent", color: "var(--fg)", cursor: "pointer", padding: 4 }}>
          <Icon name="menu" size={24} />
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700, fontSize: 18 }}>
          <AppLogo size={24} /> Nexus
        </div>
      </header>

      {/* Overlay (mobil, schließt das Menü) */}
      <div className={"sidebar-overlay" + (menuOpen ? " open" : "")} onClick={() => setMenuOpen(false)} />

      <aside className={"sidebar" + (menuOpen ? " open" : "")} style={{ background: "var(--card)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, fontWeight: 700, fontSize: 20, padding: "4px 8px 12px" }}>
          <AppLogo size={28} /> Nexus
          <button className="sidebar-close" onClick={() => setMenuOpen(false)} aria-label="Menü schließen"
            style={{ marginLeft: "auto", border: 0, background: "transparent", color: "var(--fg)", cursor: "pointer", padding: 4 }}>
            <Icon name="x" size={20} />
          </button>
        </div>
        <button
          onClick={() => window.dispatchEvent(new Event("open-command-palette"))}
          style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", marginBottom: 8, borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--muted)", cursor: "pointer", fontSize: 13 }}
        >
          <Icon name="search" size={15} />
          <span style={{ flex: 1, textAlign: "left" }}>Suchen…</span>
          <kbd style={{ fontSize: 11, padding: "1px 5px", borderRadius: 5, border: "1px solid var(--border)" }}>⌘K</kbd>
        </button>
        {NAV.map((n) => {
          const active = n.href === "/" ? pathname === "/" : pathname.startsWith(n.href);
          return (
            <Link key={n.href} href={n.href}
              style={{ padding: "8px 10px", borderRadius: 8, fontSize: 14,
                background: active ? "var(--accent)" : "transparent",
                color: active ? "#fff" : "var(--fg)", textDecoration: "none",
                display: "flex", alignItems: "center", gap: 8 }}>
              <Icon name={n.icon} size={18} />{n.label}
            </Link>
          );
        })}
        <div style={{ marginTop: "auto", display: "grid", gap: 8, paddingTop: 12 }}>
          <button className="btn" onClick={toggleTheme}><Icon name="moon" /> Theme</button>
          <div className="muted" style={{ fontSize: 12, padding: "0 4px" }}>{user?.name} ({user?.globalRole})</div>
          <button className="btn" onClick={() => { clearSession(); window.location.href = "/login"; }}><Icon name="logout" /> Abmelden</button>
        </div>
      </aside>
      <main className="main">{children}</main>
      <CommandPalette />
    </div>
  );
}
