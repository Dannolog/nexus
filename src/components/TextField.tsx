"use client";
import { useState } from "react";
import type { KeyboardEvent, RefObject } from "react";
import Icon from "@/components/Icon";
import { kopiere } from "@/lib/kopieren";

/**
 * Einzeiliges Eingabefeld mit:
 * - Clear-Cross (✕) rechts, sobald Inhalt vorhanden
 * - Passwort-Auge (👁) bei type="password" zum Ein-/Ausblenden
 * - ESC bei gefülltem Feld → leert das Feld
 * - ESC bei leerem Feld → hebt den Fokus auf (blur)
 * - optional Kopier-Knopf (`kopieren`), sobald Inhalt vorhanden
 */
export default function TextField({
  value,
  onChange,
  type = "text",
  placeholder,
  disabled,
  autoComplete,
  style,
  inputStyle,
  inputRef,
  onKeyDown,
  enterKeyHint,
  autoFocus,
  name,
  id,
  kopieren,
  icon,
}: {
  value: string | number | null | undefined;
  onChange: (v: string) => void;
  type?: "text" | "email" | "password" | "number" | "tel";
  placeholder?: string;
  disabled?: boolean;
  autoComplete?: string;
  style?: React.CSSProperties;
  inputStyle?: React.CSSProperties;
  /** Zugriff auf das Eingabefeld – z. B. um den Fokus gezielt zu setzen. */
  inputRef?: RefObject<HTMLInputElement>;
  /** Eigene Tastenbehandlung; läuft zusätzlich zur eingebauten Esc-Logik. */
  onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void;
  /** Beschriftung der Bestätigungstaste auf Handy-Tastaturen ("next", "go", …). */
  enterKeyHint?: "enter" | "done" | "go" | "next" | "previous" | "search" | "send";
  autoFocus?: boolean;
  name?: string;
  id?: string;
  /** Kopier-Knopf neben dem Kreuz anzeigen (nie bei Passwörtern). */
  kopieren?: boolean;
  /** Symbol vorn im Feld (z. B. "user", "lock"). */
  icon?: string;
}) {
  const [showPw, setShowPw] = useState(false);
  const [kopiert, setKopiert] = useState(false);
  const v = value ?? "";
  const hasValue = String(v).length > 0;
  const isPw = type === "password";
  const effType = isPw && showPw ? "text" : type;
  const showClear = hasValue && !disabled;
  const showCopy = !!kopieren && hasValue && !isPw;
  const controls = (isPw ? 1 : 0) + (showClear ? 1 : 0) + (showCopy ? 1 : 0);

  const iconBtn: React.CSSProperties = {
    border: 0, background: "transparent", cursor: "pointer", opacity: 0.5,
    padding: 3, display: "flex", color: "var(--fg)",
  };

  return (
    <div style={{ position: "relative", ...style }}>
      {icon && (
        <span className="textfeld-icon" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", display: "flex", pointerEvents: "none", color: "var(--accent)", opacity: 0.85 }}>
          <Icon name={icon} size={16} />
        </span>
      )}
      <input
        ref={inputRef}
        className="input"
        type={effType}
        value={v}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete={autoComplete}
        enterKeyHint={enterKeyHint}
        autoFocus={autoFocus}
        name={name}
        id={id}
        style={{ paddingRight: controls ? 8 + controls * 26 : undefined, paddingLeft: icon ? 38 : undefined, ...inputStyle }}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            if (String((e.target as HTMLInputElement).value).length > 0) onChange("");
            else e.currentTarget.blur();
            return;
          }
          onKeyDown?.(e);
        }}
      />
      {controls > 0 && (
        <div style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", display: "flex", gap: 2, alignItems: "center" }}>
          {showClear && (
            <button type="button" tabIndex={-1} aria-label="Feld leeren" onMouseDown={(e) => e.preventDefault()} onClick={() => onChange("")} style={iconBtn}>
              <Icon name="x" size={14} />
            </button>
          )}
          {showCopy && (
            <button type="button" tabIndex={-1} aria-label="Inhalt kopieren" title="Kopieren" onMouseDown={(e) => e.preventDefault()}
              onClick={async () => { if (await kopiere(String(v))) { setKopiert(true); setTimeout(() => setKopiert(false), 1200); } }}
              style={{ ...iconBtn, opacity: kopiert ? 1 : 0.5, color: kopiert ? "var(--accent)" : "var(--fg)" }}>
              <Icon name={kopiert ? "check" : "copy"} size={14} />
            </button>
          )}
          {isPw && (
            <button type="button" tabIndex={-1} aria-label={showPw ? "Passwort verbergen" : "Passwort anzeigen"} onMouseDown={(e) => e.preventDefault()} onClick={() => setShowPw((s) => !s)} style={iconBtn}>
              <Icon name={showPw ? "eye-off" : "eye"} size={16} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
