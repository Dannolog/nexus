"use client";
import { useState } from "react";
import Icon from "@/components/Icon";

/**
 * Einzeiliges Eingabefeld mit:
 * - Clear-Cross (✕) rechts, sobald Inhalt vorhanden
 * - Passwort-Auge (👁) bei type="password" zum Ein-/Ausblenden
 * - ESC bei gefülltem Feld → leert das Feld
 * - ESC bei leerem Feld → hebt den Fokus auf (blur)
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
}: {
  value: string | number | null | undefined;
  onChange: (v: string) => void;
  type?: "text" | "email" | "password" | "number";
  placeholder?: string;
  disabled?: boolean;
  autoComplete?: string;
  style?: React.CSSProperties;
  inputStyle?: React.CSSProperties;
}) {
  const [showPw, setShowPw] = useState(false);
  const v = value ?? "";
  const hasValue = String(v).length > 0;
  const isPw = type === "password";
  const effType = isPw && showPw ? "text" : type;
  const showClear = hasValue && !disabled;
  const controls = (isPw ? 1 : 0) + (showClear ? 1 : 0);

  const iconBtn: React.CSSProperties = {
    border: 0, background: "transparent", cursor: "pointer", opacity: 0.5,
    padding: 3, display: "flex", color: "var(--fg)",
  };

  return (
    <div style={{ position: "relative", ...style }}>
      <input
        className="input"
        type={effType}
        value={v}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete={autoComplete}
        style={{ paddingRight: controls ? 8 + controls * 26 : undefined, ...inputStyle }}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            if (String((e.target as HTMLInputElement).value).length > 0) onChange("");
            else e.currentTarget.blur();
          }
        }}
      />
      {controls > 0 && (
        <div style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", display: "flex", gap: 2, alignItems: "center" }}>
          {showClear && (
            <button type="button" tabIndex={-1} aria-label="Feld leeren" onMouseDown={(e) => e.preventDefault()} onClick={() => onChange("")} style={iconBtn}>
              <Icon name="x" size={14} />
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
