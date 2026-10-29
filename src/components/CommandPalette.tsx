"use client";
import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/clientApi";
import Icon from "@/components/Icon";

const SOURCES = [
  { key: "customers", label: "Kunde", icon: "users", title: (r: any) => r.companyName || r.contactName || "(ohne Namen)" },
  { key: "projects", label: "Projekt", icon: "folder", title: (r: any) => r.name },
  { key: "tasks", label: "Aufgabe", icon: "tasks", title: (r: any) => r.title },
  { key: "employees", label: "Mitarbeiter", icon: "user", title: (r: any) => r.name },
];

const NAV = [
  { href: "/", label: "Übersicht", icon: "home" },
  { href: "/customers", label: "Kunden", icon: "users" },
  { href: "/contacts", label: "Kontakte", icon: "id-card" },
  { href: "/projects", label: "Projekte", icon: "folder" },
  { href: "/tasks", label: "Aufgaben", icon: "tasks" },
  { href: "/employees", label: "Mitarbeiter", icon: "user" },
  { href: "/documents", label: "Dokumente", icon: "archive" },
  { href: "/scan", label: "Scannen", icon: "printer" },
  { href: "/organizations", label: "Mandanten", icon: "building" },
  { href: "/betriebsakte", label: "Betriebsakte", icon: "folder" },
  { href: "/identities", label: "Userverwaltung", icon: "shield" },
  { href: "/backups", label: "Datensicherung", icon: "archive" },
  { href: "/history", label: "Verlauf", icon: "history" },
];

type Item = { icon: string; label: string; sub?: string; href: string };

export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Item[]>([]);
  const [active, setActive] = useState(0);
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  // Globaler Hotkey ⌘K / Strg+K + Event-Trigger (Klick aus Sidebar)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("open-command-palette", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("open-command-palette", onOpen);
    };
  }, []);

  useEffect(() => {
    if (open) {
      setQ("");
      setResults([]);
      setActive(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  // Live-Suche (debounced) über alle Quellen
  useEffect(() => {
    if (!open) return;
    if (!q.trim()) { setResults([]); return; }
    let cancelled = false;
    const t = setTimeout(async () => {
      const all: Item[] = [];
      await Promise.all(
        SOURCES.map(async (s) => {
          try {
            const d = await api(`/api/${s.key}?search=${encodeURIComponent(q)}&take=6`);
            for (const r of d.data) {
              const title = s.title(r);
              all.push({ icon: s.icon, label: title, sub: s.label, href: `/${s.key}?q=${encodeURIComponent(title)}` });
            }
          } catch { /* ignore */ }
        })
      );
      if (!cancelled) { setResults(all); setActive(0); }
    }, 180);
    return () => { cancelled = true; clearTimeout(t); };
  }, [q, open]);

  const items: Item[] = q.trim()
    ? results
    : NAV.map((n) => ({ icon: n.icon, label: n.label, sub: "Seite", href: n.href }));

  const go = useCallback((item?: Item) => {
    if (!item) return;
    setOpen(false);
    router.push(item.href);
  }, [router]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") { setOpen(false); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, items.length - 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    if (e.key === "Enter") { e.preventDefault(); go(items[active]); }
  }

  if (!open) return null;

  return (
    <div onClick={() => setOpen(false)} className="cp-huelle">
      <div onClick={(e) => e.stopPropagation()} className="card cp-fenster" role="dialog" aria-label="Suchen">
        <div className="cp-kopf">
          <Icon name="search" size={19} style={{ color: "var(--accent)" }} />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Suchen oder springen… (Kunden, Kontakte, Mitarbeiter)"
            enterKeyHint="go"
          />
          {q && <button className="btn btn-icon btn-flach" aria-label="Eingabe leeren" onClick={() => { setQ(""); inputRef.current?.focus(); }}><Icon name="x" size={15} /></button>}
          <button className="cp-esc" onClick={() => setOpen(false)}>ESC</button>
        </div>
        <div className="cp-liste">
          {q.trim() && items.length === 0 && (
            <div className="leer-zustand" style={{ padding: 28 }}>
              <span className="leer-icon" style={{ width: 48, height: 48, borderRadius: 14 }}><Icon name="search" size={22} /></span>
              Keine Treffer für „{q}".
            </div>
          )}
          {!q.trim() && <div className="sektion-titel" style={{ padding: "8px 12px 6px" }}>Schnell springen</div>}
          {items.map((it, i) => (
            <button key={it.href + i} onClick={() => go(it)} onMouseEnter={() => setActive(i)}
              className={"cp-eintrag" + (i === active ? " aktiv" : "")}>
              <span className="cp-icon"><Icon name={it.icon} size={16} /></span>
              <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.label}</span>
              {it.sub && <span className="abzeichen">{it.sub}</span>}
            </button>
          ))}
        </div>
        <div className="cp-fuss only-desktop">
          <span><kbd>↑</kbd><kbd>↓</kbd> auswählen</span><span><kbd>↵</kbd> öffnen</span><span><kbd>Esc</kbd> schließen</span>
        </div>
      </div>
    </div>
  );
}
