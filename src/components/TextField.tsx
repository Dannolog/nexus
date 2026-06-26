"use client";
import Icon from "@/components/Icon";

/**
 * Einzeiliges Eingabefeld mit:
 * - Clear-Cross (✕) rechts, sobald Inhalt vorhanden
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
}: {
  value: string | number | null | undefined;
  onChange: (v: string) => void;
  type?: "text" | "email" | "password" | "number";
  placeholder?: string;
  disabled?: boolean;
  autoComplete?: string;
  style?: React.CSSProperties;
}) {
  const v = value ?? "";
  const hasValue = String(v).length > 0;
  return (
    <div style={{ position: "relative", ...style }}>
      <input
        className="input"
        type={type}
        value={v}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete={autoComplete}
        style={{ paddingRight: hasValue && !disabled ? 30 : undefined }}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            if (String((e.target as HTMLInputElement).value).length > 0) onChange("");
            else e.currentTarget.blur();
          }
        }}
      />
      {hasValue && !disabled && (
        <button
          type="button"
          tabIndex={-1}
          aria-label="Feld leeren"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onChange("")}
          style={{
            position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)",
            border: 0, background: "transparent", cursor: "pointer", opacity: 0.5, padding: 3, display: "flex", color: "var(--fg)",
          }}
        >
          <Icon name="x" size={14} />
        </button>
      )}
    </div>
  );
}
