"use client";
import Icon from "@/components/Icon";

/**
 * Suchfeld mit Lupe, Clear-Cross und ESC-Verhalten:
 * - ESC bei gefülltem Feld → leert das Feld
 * - ESC bei leerem Feld → entfernt den Fokus (Autofokus off)
 * - Cross (✕) rechts leert das Feld
 */
export default function SearchInput({
  value,
  onChange,
  placeholder = "Suche…",
  style,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div style={{ position: "relative", display: "inline-block", ...style }}>
      <span style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", opacity: 0.5, pointerEvents: "none", display: "flex" }}>
        <Icon name="search" size={16} />
      </span>
      <input
        className="input"
        style={{ paddingLeft: 32, paddingRight: 30 }}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            if (value !== "") onChange("");
            else e.currentTarget.blur();
          }
        }}
      />
      {value && (
        <button
          type="button"
          aria-label="Suche leeren"
          onClick={() => onChange("")}
          style={{
            position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)",
            border: 0, background: "transparent", cursor: "pointer", opacity: 0.55, lineHeight: 1, padding: 4, color: "var(--fg)", display: "flex",
          }}
        >
          <Icon name="x" size={15} />
        </button>
      )}
    </div>
  );
}
