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
  { href: "/projects", label: "Projekte", icon: "folder" },
  { href: "/tasks", label: "Aufgaben", icon: "tasks" },
  { href: "/employees", label: "Mitarbeiter", icon: "user" },
  { href: "/organizations", label: "Mandanten", icon: "building" },
  { href: "/identities", label: "Userverwaltung", icon: "shield" },
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
    <div
      onClick={() => setOpen(false)}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", display: "flex", justifyContent: "center", alignItems: "flex-start", paddingTop: "12vh", zIndex: 200 }}
    >
      <div onClick={(e) => e.stopPropagation()} className="card" style={{ width: 560, maxWidth: "92vw", overflow: "hidden", boxShadow: "0 20px 60px rgba(0,0,0,.4)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>
          <Icon name="search" size={18} style={{ opacity: 0.5 }} />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Suchen oder springen… (Kunden, Projekte, Mitarbeiter)"
            style={{ flex: 1, border: 0, outline: "none", background: "transparent", color: "var(--fg)", fontSize: 16 }}
          />
          <kbd style={{ fontSize: 11, padding: "2px 6px", borderRadius: 6, border: "1px solid var(--border)", color: "var(--muted)" }}>ESC</kbd>
        </div>
        <div style={{ maxHeight: 360, overflowY: "auto", padding: 6 }}>
          {q.trim() && items.length === 0 && (
            <div className="muted" style={{ padding: 18, textAlign: "center", fontSize: 14 }}>Keine Treffer für „{q}".</div>
          )}
          {!q.trim() && <div className="muted" style={{ padding: "6px 12px", fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5 }}>Schnellnavigation</div>}
          {items.map((it, i) => (
            <button
              key={it.href + i}
              onClick={() => go(it)}
              onMouseEnter={() => setActive(i)}
              style={{
                display: "flex", alignItems: "center", gap: 12, width: "100%", textAlign: "left",
                padding: "10px 12px", border: 0, borderRadius: 8, cursor: "pointer",
                background: i === active ? "var(--accent)" : "transparent",
                color: i === active ? "#fff" : "var(--fg)",
              }}
            >
              <Icon name={it.icon} size={18} style={{ opacity: i === active ? 1 : 0.7 }} />
              <span style={{ flex: 1, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.label}</span>
              {it.sub && <span style={{ fontSize: 12, opacity: 0.7 }}>{it.sub}</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
