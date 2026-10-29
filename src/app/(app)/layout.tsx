"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { getUser, clearSession } from "@/lib/clientApi";
import AppLogo from "@/components/AppLogo";
import Icon from "@/components/Icon";
import CommandPalette from "@/components/CommandPalette";
import SitzungsWaechter from "@/components/SitzungsWaechter";
import NavLoader from "@/components/NavLoader";
import AnmeldeAnfragen from "@/components/AnmeldeAnfragen";

/** Menü in Gruppen – so findet man Stammdaten, Personal, Ablage und System auf einen Blick. */
const GRUPPEN: { titel: string; eintraege: { href: string; label: string; icon: string }[] }[] = [
  { titel: "", eintraege: [{ href: "/", label: "Übersicht", icon: "home" }] },
  { titel: "Stammdaten", eintraege: [
    { href: "/customers", label: "Kunden", icon: "users" },
    { href: "/contacts", label: "Kontakte", icon: "id-card" },
    { href: "/suppliers", label: "Lieferanten", icon: "truck" },
    { href: "/products", label: "Artikel", icon: "package" },
    { href: "/projects", label: "Projekte", icon: "folder" },
    { href: "/tasks", label: "Aufgaben", icon: "tasks" },
  ] },
  { titel: "Personal", eintraege: [
    { href: "/employees", label: "Mitarbeiter", icon: "user" },
    { href: "/contracts", label: "Arbeitsverträge", icon: "file-text" },
    { href: "/visitenkarten", label: "Visitenkarten", icon: "id-card" },
  ] },
  { titel: "Ablage", eintraege: [
    { href: "/documents", label: "Dokumente", icon: "archive" },
    { href: "/scan", label: "Scannen", icon: "printer" },
    { href: "/betriebsakte", label: "Betriebsakte", icon: "folder" },
    { href: "/organizations", label: "Mandanten", icon: "building" },
  ] },
  { titel: "System", eintraege: [
    { href: "/identities", label: "Userverwaltung", icon: "shield" },
    { href: "/backups", label: "Datensicherung", icon: "save" },
    { href: "/history", label: "Verlauf", icon: "history" },
  ] },
];
const NAV = GRUPPEN.flatMap((g) => g.eintraege);

/** Untere Leiste auf dem Handy: die meistgenutzten Bereiche plus „Mehr“ für das ganze Menü. */
const TABS = [
  { href: "/", label: "Start", icon: "home" },
  { href: "/contacts", label: "Kontakte", icon: "id-card" },
  { href: "/customers", label: "Kunden", icon: "users" },
  { href: "/employees", label: "Personal", icon: "user" },
];

const istAktiv = (href: string, pfad: string) => (href === "/" ? pfad === "/" : pfad.startsWith(href));

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<any>(null);
  const [ready, setReady] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  // Breite der Seitenleiste am Rechner – per Ziehgriff verstellbar und gemerkt
  const [breite, setBreite] = useState(220);
  const [zieht, setZieht] = useState(false);
  const [abmeldenFrage, setAbmeldenFrage] = useState(false);
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

  // Gemerkte Menübreite übernehmen
  useEffect(() => {
    const gespeichert = Number(localStorage.getItem("nexus-menue-breite"));
    if (gespeichert >= 180 && gespeichert <= 460) setBreite(gespeichert);
  }, []);

  useEffect(() => {
    document.documentElement.style.setProperty("--sidebar-breite", `${breite}px`);
  }, [breite]);

  /** Ziehgriff: Breite folgt dem Zeiger, Grenzen 180–460 px. */
  function griffStart(e: React.PointerEvent) {
    e.preventDefault();
    setZieht(true);
    document.body.classList.add("sidebar-zieht");
    const bewegen = (ev: PointerEvent) => {
      const neu = Math.min(460, Math.max(180, ev.clientX));
      setBreite(neu);
    };
    const ende = () => {
      document.body.classList.remove("sidebar-zieht");
      setZieht(false);
      window.removeEventListener("pointermove", bewegen);
      window.removeEventListener("pointerup", ende);
      setBreite((b) => { localStorage.setItem("nexus-menue-breite", String(b)); return b; });
    };
    window.addEventListener("pointermove", bewegen);
    window.addEventListener("pointerup", ende);
  }

  function abmelden() {
    clearSession();
    window.location.href = "/login";
  }

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

      {/* Handy: Kopfleiste mit Seitentitel und Suche */}
      <header className="topbar">
        <button className="topbar-knopf" onClick={() => setMenuOpen(true)} aria-label="Menü öffnen"><Icon name="menu" size={22} /></button>
        <div className="topbar-titel">
          <AppLogo size={22} />
          <span>{NAV.find((n) => istAktiv(n.href, pathname))?.label || "Nexus"}</span>
        </div>
        <button className="topbar-knopf" aria-label="Suchen" onClick={() => window.dispatchEvent(new Event("open-command-palette"))}>
          <Icon name="search" size={20} />
        </button>
      </header>

      {/* Overlay (mobil, schließt das Menü) */}
      <div className={"sidebar-overlay" + (menuOpen ? " open" : "")} onClick={() => setMenuOpen(false)} />

      <aside className={"sidebar" + (menuOpen ? " open" : "")}>
        <div className="sidebar-marke">
          <AppLogo size={30} /> <span>Nexus</span>
          <button className="sidebar-close" onClick={() => setMenuOpen(false)} aria-label="Menü schließen"
            style={{ marginLeft: "auto", border: 0, background: "transparent", color: "var(--fg)", cursor: "pointer", padding: 4 }}>
            <Icon name="x" size={20} />
          </button>
        </div>
        <button className="sidebar-suche" onClick={() => window.dispatchEvent(new Event("open-command-palette"))}>
          <Icon name="search" size={15} />
          <span style={{ flex: 1, textAlign: "left" }}>Suchen…</span>
          <kbd>⌘K</kbd>
        </button>
        <nav className="sidebar-nav">
          {GRUPPEN.map((g) => (
            <div key={g.titel || "start"} className="nav-gruppe">
              {g.titel && <div className="nav-gruppe-titel">{g.titel}</div>}
              {g.eintraege.map((n) => (
                <Link key={n.href} href={n.href} className={"nav-eintrag" + (istAktiv(n.href, pathname) ? " aktiv" : "")}
                  aria-current={istAktiv(n.href, pathname) ? "page" : undefined}>
                  <Icon name={n.icon} size={17} /><span>{n.label}</span>
                </Link>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-fuss">
          <div className="nutzer-karte">
            <span className="nutzer-avatar">{String(user?.name || "?").trim().split(/\s+/).map((t: string) => t[0]).slice(0, 2).join("").toUpperCase()}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="nutzer-name">{user?.name}</div>
              <div className="nutzer-rolle">{user?.globalRole === "admin" ? "Administrator" : "Benutzer"}</div>
            </div>
            <button className="btn btn-icon btn-flach" onClick={toggleTheme} title="Hell / Dunkel umschalten" aria-label="Hell / Dunkel umschalten">
              <Icon name="moon" size={16} />
            </button>
            <button className="btn btn-icon btn-flach" onClick={() => setAbmeldenFrage(true)} title="Abmelden" aria-label="Abmelden">
              <Icon name="logout" size={16} />
            </button>
          </div>
        </div>
        {/* Ziehgriff nur am Rechner – verbreitert oder verschmälert das Menü */}
        <div className={"sidebar-griff" + (zieht ? " aktiv" : "")} onPointerDown={griffStart}
          role="separator" aria-label="Menübreite ändern" title="Ziehen, um das Menü breiter zu machen" />
      </aside>

      {/* Abmelden: eigenes Fenster, auf dem Handy fingerfreundlich und über der Tastatur */}
      {abmeldenFrage && (
        <div className="cd-schatten" onClick={() => setAbmeldenFrage(false)} style={{ zIndex: 120 }}>
          <div onClick={(e) => e.stopPropagation()} className="card cd-fenster">
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
              <span className="nutzer-avatar" style={{ width: 44, height: 44, fontSize: 15 }}>
                {String(user?.name || "?").trim().split(/\s+/).map((t: string) => t[0]).slice(0, 2).join("").toUpperCase()}
              </span>
              <div style={{ minWidth: 0 }}>
                <h2 style={{ fontSize: 18, fontWeight: 700 }}>Abmelden?</h2>
                {user?.name && <div className="muted" style={{ fontSize: 13 }}>Angemeldet als {user.name}</div>}
              </div>
            </div>
            <div className="muted" style={{ fontSize: 14, marginBottom: 20, lineHeight: 1.5 }}>
              Du wirst von Nexus abgemeldet und landest wieder auf der Anmeldeseite.
            </div>
            <div className="cd-knoepfe">
              <button className="btn" onClick={() => setAbmeldenFrage(false)} autoFocus>Angemeldet bleiben</button>
              <button className="btn btn-primary" style={{ background: "var(--rot)", borderColor: "var(--rot)" }} onClick={abmelden}><Icon name="logout" /> Abmelden</button>
            </div>
          </div>
        </div>
      )}
      <main className="main">{children}</main>

      {/* Handy: untere Leiste – Daumen erreicht die wichtigsten Bereiche sofort */}
      <nav className="tab-leiste" aria-label="Schnellnavigation">
        {TABS.map((t) => (
          <Link key={t.href} href={t.href} className={istAktiv(t.href, pathname) ? "aktiv" : ""}>
            <Icon name={t.icon} size={21} /><span>{t.label}</span>
          </Link>
        ))}
        <button onClick={() => setMenuOpen(true)} className={menuOpen || !TABS.some((t) => istAktiv(t.href, pathname)) ? "aktiv" : ""}>
          <Icon name="menu" size={21} /><span>Mehr</span>
        </button>
      </nav>
      <CommandPalette />
      <SitzungsWaechter />
      <NavLoader />
      <AnmeldeAnfragen />
    </div>
  );
}
