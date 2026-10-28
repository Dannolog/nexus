"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api, getUser } from "@/lib/clientApi";
import Icon from "@/components/Icon";
import { useLive } from "@/lib/live";

/** Kennzahlen – je Bereich eine Farbe, damit man sie auf einen Blick unterscheidet. */
const KACHELN = [
  { href: "/customers", label: "Kunden", key: "customers", icon: "users", farbe: "#4f6cf5" },
  { href: "/contacts", label: "Kontakte", key: "contacts", icon: "id-card", farbe: "#10b981" },
  { href: "/suppliers", label: "Lieferanten", key: "suppliers", icon: "truck", farbe: "#f59e0b" },
  { href: "/projects", label: "Projekte", key: "projects", icon: "folder", farbe: "#8b5cf6" },
  { href: "/tasks", label: "Aufgaben", key: "tasks", icon: "tasks", farbe: "#ec4899" },
  { href: "/employees", label: "Mitarbeiter", key: "employees", icon: "user", farbe: "#0ea5e9" },
  { href: "/products", label: "Artikel", key: "products", icon: "package", farbe: "#14b8a6" },
  { href: "/identities", label: "Zugänge", key: "identities", icon: "shield", farbe: "#64748b" },
];

/** Weitere Bereiche mit kurzer Erklärung – selbsterklärend für neue Nutzer. */
const BEREICHE = [
  { href: "/contracts", label: "Arbeitsverträge", text: "Verträge erstellen, unterschreiben lassen, als PDF ablegen", icon: "file-text" },
  { href: "/documents", label: "Dokumente", text: "Vorlagen und Mitarbeiter-Akten mit allen Unterlagen", icon: "archive" },
  { href: "/scan", label: "Scannen", text: "Am Scanner einlesen und direkt der richtigen Akte zuordnen", icon: "printer" },
  { href: "/betriebsakte", label: "Betriebsakte", text: "Unterlagen je Mandant – Verträge, Nachweise, Bescheide", icon: "folder" },
  { href: "/visitenkarten", label: "Visitenkarten", text: "Visitenkarten für Mitarbeiter gestalten und drucken", icon: "id-card" },
  { href: "/backups", label: "Datensicherung", text: "Sicherungen ansehen und bei Bedarf wiederherstellen", icon: "save" },
];

function gruss() {
  const h = new Date().getHours();
  return h < 11 ? "Guten Morgen" : h < 18 ? "Guten Tag" : "Guten Abend";
}

export default function Dashboard() {
  const [counts, setCounts] = useState<any>(null);
  const [name, setName] = useState("");
  const laden = useCallback(() => {
    api("/api/health").then((d) => setCounts(d.counts)).catch(() => {});
  }, []);
  useEffect(() => { laden(); setName(String(getUser()?.name || "").trim().split(/\s+/)[0] || ""); }, [laden]);

  // Zahlen aktuell halten, sobald irgendwo etwas angelegt oder gelöscht wird
  useLive([], laden);
  return (
    <div className="ds-seite">
      <section className="ds-held">
        <div style={{ minWidth: 0 }}>
          <div className="ds-datum">
            {new Date().toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long" })}
          </div>
          <h1 className="seiten-titel" style={{ fontSize: 30 }}>{gruss()}{name ? `, ${name}` : ""}</h1>
          <p className="seiten-untertitel" style={{ fontSize: 14.5, maxWidth: 560 }}>
            Hier laufen alle Stammdaten zusammen – Änderungen gehen automatisch an kontor, clocker und ProjectEye.
          </p>
        </div>
        <button className="ds-suche" onClick={() => window.dispatchEvent(new Event("open-command-palette"))}>
          <Icon name="search" size={18} />
          <span>Kunden, Kontakte, Mitarbeiter suchen…</span>
          <kbd>⌘K</kbd>
        </button>
      </section>

      <div className="sektion-titel" style={{ margin: "4px 2px 10px" }}><Icon name="home" size={13} /> Bestand</div>
      <div className="ds-kacheln">
        {KACHELN.map((t) => (
          <Link key={t.href} href={t.href} className="ds-kachel" style={{ ["--f" as any]: t.farbe }}>
            <span className="ds-kachel-icon"><Icon name={t.icon} size={20} /></span>
            <div className="ds-zahl">{counts ? counts[t.key] ?? "–" : <span className="lade-zeile" style={{ display: "block", width: 48, height: 26 }} />}</div>
            <div className="ds-label">{t.label}</div>
          </Link>
        ))}
      </div>

      <div className="sektion-titel" style={{ margin: "26px 2px 10px" }}><Icon name="folder" size={13} /> Weitere Bereiche</div>
      <div className="ds-bereiche">
        {BEREICHE.map((b) => (
          <Link key={b.href} href={b.href} className="ds-bereich">
            <span className="ds-bereich-icon"><Icon name={b.icon} size={19} /></span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <b>{b.label}</b>
              <small>{b.text}</small>
            </span>
            <Icon name="chevron-down" size={16} style={{ transform: "rotate(-90deg)", color: "var(--muted)" }} />
          </Link>
        ))}
      </div>
    </div>
  );
}
