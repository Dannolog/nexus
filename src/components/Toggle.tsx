"use client";

/** Moderne Checkbox als Schiebeschalter (Switch). Ersetzt native <input type=checkbox>. */
export default function Toggle({
  checked,
  onChange,
  label,
  disabled = false,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      style={{
        display: "inline-flex", alignItems: "center", gap: 8, border: 0, background: "transparent",
        cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.45 : 1, padding: 0,
      }}
    >
      <span
        style={{
          width: 40, height: 22, borderRadius: 11, flexShrink: 0,
          background: checked ? "var(--accent)" : "var(--border)",
          position: "relative", transition: "background .15s",
        }}
      >
        <span
          style={{
            position: "absolute", top: 2, left: checked ? 20 : 2, width: 18, height: 18, borderRadius: "50%",
            background: "#fff", transition: "left .15s", boxShadow: "0 1px 3px rgba(0,0,0,.35)",
          }}
        />
      </span>
      {label != null && <span style={{ fontSize: 14 }}>{label}</span>}
    </button>
  );
}
