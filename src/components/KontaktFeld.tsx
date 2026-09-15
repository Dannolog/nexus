"use client";
import React from "react";
import Icon from "@/components/Icon";
import { kopiere } from "@/lib/kopieren";

/**
 * Eingabefeld mit Beschriftung, **Symbol**, Kreuz zum Leeren und Kopier-Knopf.
 *
 * Überall dort einsetzbar, wo einzelne Angaben erfasst werden – die drei Bedienelemente
 * sitzen immer an derselben Stelle, damit man sie nicht suchen muss.
 */
export function Feld({
  label, icon, wert, setWert, typ = "text", platzhalter, kopierbar = true, hinweis, autoFocus, breit,
}: {
  label: string;
  icon?: string;
  wert: string;
  setWert: (v: string) => void;
  typ?: string;
  platzhalter?: string;
  kopierbar?: boolean;
  hinweis?: string;
  autoFocus?: boolean;
  breit?: boolean;
}) {
  const [kopiert, setKopiert] = React.useState(false);

  async function inZwischenablage() {
    if (!wert) return;
    const ok = await kopiere(wert);
    if (ok) { setKopiert(true); setTimeout(() => setKopiert(false), 1200); }
  }

  return (
    <label style={{ fontSize: 13, display: "grid", gap: 4, ...(breit ? { gridColumn: "1 / -1" } : {}) }}>
      <span className="muted" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
        {icon && <Icon name={icon} size={14} />} {label}
      </span>
      <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 6 }}>
        <div style={{ position: "relative", flex: 1, minWidth: 0 }}>
          <input
            className="input"
            style={{ width: "100%", paddingRight: wert ? 30 : undefined }}
            type={typ}
            value={wert}
            placeholder={platzhalter}
            autoFocus={autoFocus}
            onChange={(e) => setWert(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Escape" && wert) { e.preventDefault(); e.stopPropagation(); setWert(""); } }}
          />
          {wert && (
            <button type="button" aria-label={`${label} leeren`} title="Leeren"
              onClick={() => setWert("")}
              style={{
                position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)",
                border: 0, background: "transparent", cursor: "pointer", opacity: .55,
                padding: 4, color: "var(--fg)", display: "flex", lineHeight: 1,
              }}>
              <Icon name="x" size={14} />
            </button>
          )}
        </div>
        {kopierbar && (
          <button type="button" className="btn btn-icon" title={`${label} kopieren`} aria-label={`${label} kopieren`}
            disabled={!wert} onClick={inZwischenablage}>
            <Icon name={kopiert ? "check" : "copy"} size={14} />
          </button>
        )}
      </div>
      {hinweis && <span className="muted" style={{ fontSize: 12 }}>{hinweis}</span>}
    </label>
  );
}

/** Kleiner Kopier-Knopf für Listen und Übersichten (ohne Eingabefeld). */
export function KopierKnopf({ wert, was = "Wert", klein }: { wert?: string | null; was?: string; klein?: boolean }) {
  const [kopiert, setKopiert] = React.useState(false);
  if (!wert) return null;
  return (
    <button
      type="button"
      className="btn btn-icon"
      title={`${was} kopieren`}
      aria-label={`${was} kopieren`}
      onClick={async (e) => {
        e.stopPropagation();
        if (await kopiere(wert)) { setKopiert(true); setTimeout(() => setKopiert(false), 1200); }
      }}
    >
      <Icon name={kopiert ? "check" : "copy"} size={klein ? 13 : 14} />
    </button>
  );
}
