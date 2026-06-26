"use client";
import { useState, useRef, useEffect } from "react";

const PRESETS = [
  "#3b82f6", "#2c62de", "#6366f1", "#7c3cc0", "#ec4899", "#ef4444",
  "#f59e0b", "#eab308", "#10b981", "#14b8a6", "#0ea5e9", "#64748b",
];

/** Moderner Colorpicker: Swatch-Button + Popover mit Presets, nativem Picker und Hex-Eingabe. */
export default function ColorPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const color = value || "#3b82f6";

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", h);
    document.addEventListener("keydown", k);
    return () => { document.removeEventListener("mousedown", h); document.removeEventListener("keydown", k); };
  }, []);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button type="button" className="input" onClick={() => setOpen((o) => !o)}
        style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", height: 38 }}>
        <span style={{ width: 20, height: 20, borderRadius: 6, background: color, border: "1px solid var(--border)", flexShrink: 0 }} />
        <span style={{ flex: 1, textAlign: "left", fontVariantNumeric: "tabular-nums" }}>{color.toUpperCase()}</span>
      </button>
      {open && (
        <div className="card" style={{ position: "absolute", zIndex: 30, top: "calc(100% + 6px)", left: 0, padding: 12, width: 226, boxShadow: "0 12px 32px rgba(0,0,0,.3)" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 8, marginBottom: 12 }}>
            {PRESETS.map((c) => (
              <button key={c} type="button" onClick={() => onChange(c)} aria-label={c}
                style={{ width: 26, height: 26, borderRadius: 7, background: c, cursor: "pointer",
                  border: c.toLowerCase() === color.toLowerCase() ? "2px solid var(--fg)" : "1px solid var(--border)" }} />
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input type="color" value={color} onChange={(e) => onChange(e.target.value)}
              style={{ width: 38, height: 34, padding: 2, border: "1px solid var(--border)", borderRadius: 8, background: "none", cursor: "pointer" }} />
            <input className="input" value={color} onChange={(e) => onChange(e.target.value)}
              style={{ flex: 1, fontVariantNumeric: "tabular-nums" }} />
          </div>
        </div>
      )}
    </div>
  );
}
