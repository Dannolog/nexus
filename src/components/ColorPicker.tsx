"use client";
import { useState, useRef, useEffect } from "react";

const PRESETS = [
  "#3b82f6", "#2c62de", "#6366f1", "#7c3cc0", "#ec4899", "#ef4444",
  "#f59e0b", "#eab308", "#10b981", "#14b8a6", "#0ea5e9", "#64748b",
];

const clamp = (n: number, a = 0, b = 1) => Math.min(b, Math.max(a, n));

function hexToRgb(hex: string): [number, number, number] {
  const m = (hex || "").replace("#", "").match(/.{1,2}/g);
  if (!m || m.length < 3) return [59, 130, 246];
  return [parseInt(m[0], 16), parseInt(m[1], 16), parseInt(m[2], 16)];
}
function rgbToHex(r: number, g: number, b: number) {
  return "#" + [r, g, b].map((x) => clamp(Math.round(x), 0, 255).toString(16).padStart(2, "0")).join("");
}
function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60; if (h < 0) h += 360;
  }
  return [h, max ? d / max : 0, max];
}
function hsvToHex(h: number, s: number, v: number) {
  const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c;
  let r = 0, g = 0, b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return rgbToHex((r + m) * 255, (g + m) * 255, (b + m) * 255);
}

/** Moderner Colorpicker (eigenes SV-Feld + Hue-Slider, kein natives <input type=color>). */
export default function ColorPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const [hsv, setHsv] = useState<[number, number, number]>([217, 0.75, 0.96]);
  const ref = useRef<HTMLDivElement>(null);
  const svRef = useRef<HTMLDivElement>(null);
  const hueRef = useRef<HTMLDivElement>(null);
  const color = value || "#3b82f6";

  // beim Öffnen HSV aus dem aktuellen Wert ableiten
  useEffect(() => {
    if (open) setHsv(rgbToHsv(...hexToRgb(color)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", h);
    document.addEventListener("keydown", k);
    return () => { document.removeEventListener("mousedown", h); document.removeEventListener("keydown", k); };
  }, []);

  function emit(next: [number, number, number]) {
    setHsv(next);
    onChange(hsvToHex(next[0], next[1], next[2]));
  }
  function onSv(e: React.PointerEvent) {
    const r = svRef.current!.getBoundingClientRect();
    const s = clamp((e.clientX - r.left) / r.width);
    const v = 1 - clamp((e.clientY - r.top) / r.height);
    emit([hsv[0], s, v]);
  }
  function onHue(e: React.PointerEvent) {
    const r = hueRef.current!.getBoundingClientRect();
    emit([clamp((e.clientX - r.left) / r.width) * 360, hsv[1], hsv[2]]);
  }

  const [h, s, v] = hsv;
  const hueColor = hsvToHex(h, 1, 1);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button type="button" className="input" onClick={() => setOpen((o) => !o)}
        style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", height: 38 }}>
        <span style={{ width: 20, height: 20, borderRadius: 6, background: color, border: "1px solid var(--border)", flexShrink: 0 }} />
        <span style={{ flex: 1, textAlign: "left", fontVariantNumeric: "tabular-nums" }}>{color.toUpperCase()}</span>
      </button>

      {open && (
        <div className="card" style={{ position: "absolute", zIndex: 40, top: "calc(100% + 6px)", left: 0, padding: 12, width: 232, boxShadow: "0 14px 36px rgba(0,0,0,.32)" }}>
          {/* SV-Feld */}
          <div
            ref={svRef}
            onPointerDown={(e) => { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); onSv(e); }}
            onPointerMove={(e) => { if (e.buttons === 1) onSv(e); }}
            style={{
              position: "relative", height: 132, borderRadius: 8, cursor: "crosshair", touchAction: "none",
              background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, ${hueColor})`,
            }}
          >
            <span style={{ position: "absolute", left: `${s * 100}%`, top: `${(1 - v) * 100}%`, width: 14, height: 14, transform: "translate(-50%,-50%)", borderRadius: "50%", background: color, border: "2px solid #fff", boxShadow: "0 0 0 1px rgba(0,0,0,.35)" }} />
          </div>

          {/* Hue-Slider */}
          <div
            ref={hueRef}
            onPointerDown={(e) => { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); onHue(e); }}
            onPointerMove={(e) => { if (e.buttons === 1) onHue(e); }}
            style={{
              position: "relative", height: 14, borderRadius: 7, margin: "12px 0", cursor: "ew-resize", touchAction: "none",
              background: "linear-gradient(to right,#f00 0%,#ff0 17%,#0f0 33%,#0ff 50%,#00f 67%,#f0f 83%,#f00 100%)",
            }}
          >
            <span style={{ position: "absolute", left: `${(h / 360) * 100}%`, top: "50%", width: 14, height: 14, transform: "translate(-50%,-50%)", borderRadius: "50%", background: hueColor, border: "2px solid #fff", boxShadow: "0 0 0 1px rgba(0,0,0,.35)" }} />
          </div>

          {/* Hex + Vorschau */}
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
            <span style={{ width: 32, height: 32, borderRadius: 7, background: color, border: "1px solid var(--border)", flexShrink: 0 }} />
            <input
              className="input"
              value={color.toUpperCase()}
              onChange={(e) => {
                let val = e.target.value.trim();
                if (!val.startsWith("#")) val = "#" + val;
                onChange(val);
                if (/^#[0-9a-fA-F]{6}$/.test(val)) setHsv(rgbToHsv(...hexToRgb(val)));
              }}
              style={{ flex: 1, fontVariantNumeric: "tabular-nums" }}
            />
          </div>

          {/* Presets */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 7 }}>
            {PRESETS.map((c) => (
              <button key={c} type="button" aria-label={c}
                onClick={() => { onChange(c); setHsv(rgbToHsv(...hexToRgb(c))); }}
                style={{ width: 26, height: 26, borderRadius: 7, background: c, cursor: "pointer",
                  border: c.toLowerCase() === color.toLowerCase() ? "2px solid var(--fg)" : "1px solid var(--border)" }} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
