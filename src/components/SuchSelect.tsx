"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Icon from "@/components/Icon";

// Auswahlfeld mit Suche – ersetzt <select> dort, wo Listen lang werden.
// Desktop: Panel unter dem Feld. Handy: Blatt von unten über die volle Breite,
// mit großer Suchleiste und fingerfreundlichen Einträgen.

export type SuchOption = { value: string; label: string; hint?: string };

export default function SuchSelect({
  value,
  options,
  onChange,
  platzhalter = "— wählen —",
  suchePlatzhalter = "Suchen…",
  leerText = "Kein Treffer",
  disabled,
  id,
}: {
  value: string;
  options: SuchOption[];
  onChange: (v: string) => void;
  platzhalter?: string;
  suchePlatzhalter?: string;
  leerText?: string;
  disabled?: boolean;
  id?: string;
}) {
  const [offen, setOffen] = useState(false);
  const [q, setQ] = useState("");
  const [mobil, setMobil] = useState(false);
  const wurzel = useRef<HTMLDivElement>(null);
  const sucheRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const messen = () => setMobil(window.innerWidth <= 768);
    messen();
    window.addEventListener("resize", messen);
    return () => window.removeEventListener("resize", messen);
  }, []);

  useEffect(() => {
    if (!offen) return;
    const beiKlick = (e: MouseEvent) => {
      if (!mobil && wurzel.current && !wurzel.current.contains(e.target as Node)) setOffen(false);
    };
    const beiTaste = (e: KeyboardEvent) => { if (e.key === "Escape") setOffen(false); };
    document.addEventListener("mousedown", beiKlick);
    window.addEventListener("keydown", beiTaste);
    const t = setTimeout(() => sucheRef.current?.focus(), 30);
    return () => {
      document.removeEventListener("mousedown", beiKlick);
      window.removeEventListener("keydown", beiTaste);
      clearTimeout(t);
    };
  }, [offen, mobil]);

  const gewaehlt = options.find((o) => o.value === value);
  const treffer = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return options;
    return options.filter((o) => (o.label + " " + (o.hint || "")).toLowerCase().includes(s));
  }, [q, options]);

  function waehlen(v: string) {
    onChange(v);
    setOffen(false);
    setQ("");
  }

  const liste = (
    <>
      <div style={{ position: "relative", marginBottom: 8 }}>
        <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", opacity: .6, pointerEvents: "none", display: "flex" }}>
          <Icon name="search" size={16} />
        </span>
        <input
          ref={sucheRef}
          className="input"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={suchePlatzhalter}
          style={{ paddingLeft: 34, fontSize: 16 }}
        />
        {q && (
          <button onClick={() => { setQ(""); sucheRef.current?.focus(); }} aria-label="Suche leeren"
            style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", border: 0, background: "transparent", color: "var(--muted)", cursor: "pointer", display: "flex", padding: 4 }}>
            <Icon name="x" size={15} />
          </button>
        )}
      </div>
      <div style={{ overflowY: "auto", maxHeight: mobil ? "52vh" : 280, display: "grid", gap: 2 }}>
        <button type="button" className="ss-eintrag" onClick={() => waehlen("")}
          style={{ opacity: .75, fontStyle: value ? "normal" : "italic" }}>
          {platzhalter}
        </button>
        {treffer.map((o) => (
          <button key={o.value} type="button" className={"ss-eintrag" + (o.value === value ? " ss-aktiv" : "")}
            onClick={() => waehlen(o.value)}>
            <span style={{ display: "grid", minWidth: 0 }}>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.label}</span>
              {o.hint && <span className="muted" style={{ fontSize: 12 }}>{o.hint}</span>}
            </span>
            {o.value === value && <Icon name="check" size={16} />}
          </button>
        ))}
        {treffer.length === 0 && <div className="muted" style={{ padding: "10px 4px", fontSize: 13.5 }}>{leerText}</div>}
      </div>
    </>
  );

  return (
    <div ref={wurzel} style={{ position: "relative" }} id={id}>
      <button type="button" className="input ss-feld" disabled={disabled} onClick={() => setOffen((o) => !o)}>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: gewaehlt ? "inherit" : "var(--muted)" }}>
          {gewaehlt ? gewaehlt.label : platzhalter}
        </span>
        <Icon name="chevron-down" size={16} />
      </button>

      {offen && !mobil && (
        <div className="card ss-panel">{liste}</div>
      )}

      {offen && mobil && (
        <>
          <div className="ss-schatten" onClick={() => setOffen(false)} />
          <div className="card ss-blatt">
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <span style={{ fontWeight: 700, fontSize: 15 }}>Auswählen</span>
              <button className="btn btn-icon" style={{ marginLeft: "auto" }} onClick={() => setOffen(false)} aria-label="Schließen">
                <Icon name="x" />
              </button>
            </div>
            {liste}
          </div>
        </>
      )}
    </div>
  );
}
