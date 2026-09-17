"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Icon from "@/components/Icon";

// Auswahlfeld mit Suche – ersetzt <select> dort, wo Listen lang werden.
// Desktop: Die Liste hängt am Dokument (Portal) und liegt damit **über** Pop-ups –
// sie wird nicht mehr vom Fensterrand abgeschnitten. Ist unter dem Feld zu wenig
// Platz, klappt sie nach oben auf.
// Handy: Blatt von unten über die volle Breite, mit großer Suchleiste.
// Optional lassen sich neue Einträge direkt hier anlegen (`erlaubeNeu`).

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
  erlaubeNeu = false,
  neuText = "neu anlegen",
  onNeu,
}: {
  value: string;
  options: SuchOption[];
  onChange: (v: string) => void;
  platzhalter?: string;
  suchePlatzhalter?: string;
  leerText?: string;
  disabled?: boolean;
  id?: string;
  /** Erlaubt, einen nicht vorhandenen Eintrag direkt anzulegen. */
  erlaubeNeu?: boolean;
  neuText?: string;
  /** Legt den Eintrag an und liefert dessen Wert zurück (oder nichts bei Fehler). */
  onNeu?: (text: string) => Promise<string | void> | string | void;
}) {
  const [offen, setOffen] = useState(false);
  const [q, setQ] = useState("");
  const [mobil, setMobil] = useState(false);
  const wurzel = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const sucheRef = useRef<HTMLInputElement>(null);
  // Lage der Liste: unter dem Feld – oder darüber, wenn unten zu wenig Platz ist
  const [lage, setLage] = useState<{ top: number; left: number; breite: number; maxHoehe: number }>(
    { top: 0, left: 0, breite: 240, maxHoehe: 320 }
  );
  const [legtAn, setLegtAn] = useState(false);
  // Auf dem Handy schiebt die Tastatur das Fenster zusammen. `visualViewport` liefert die
  // wirklich sichtbare Höhe – daran richtet sich das Vollbild aus, damit Suchfeld und Liste
  // **über** der Tastatur bleiben und nicht dahinter verschwinden.
  const [sichtHoehe, setSichtHoehe] = useState<number | null>(null);

  useEffect(() => {
    if (!offen || !mobil) return;
    const vv = window.visualViewport;
    const messen = () => setSichtHoehe(vv ? vv.height : window.innerHeight);
    messen();
    vv?.addEventListener("resize", messen);
    vv?.addEventListener("scroll", messen);
    window.addEventListener("resize", messen);
    return () => {
      vv?.removeEventListener("resize", messen);
      vv?.removeEventListener("scroll", messen);
      window.removeEventListener("resize", messen);
    };
  }, [offen, mobil]);

  // Hintergrund nicht mitscrollen lassen, solange die Auswahl offen ist
  useEffect(() => {
    if (!offen || !mobil) return;
    const vorher = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = vorher; };
  }, [offen, mobil]);

  useEffect(() => {
    const messen = () => setMobil(window.innerWidth <= 768);
    messen();
    window.addEventListener("resize", messen);
    return () => window.removeEventListener("resize", messen);
  }, []);

  /** Liste am Feld ausrichten – notfalls nach oben, immer innerhalb des Fensters. */
  const messenLage = useCallback(() => {
    const feld = wurzel.current?.getBoundingClientRect();
    if (!feld) return;
    const platzUnten = window.innerHeight - feld.bottom - 12;
    const platzOben = feld.top - 12;
    const nachOben = platzUnten < 240 && platzOben > platzUnten;
    const maxHoehe = Math.max(160, Math.min(360, nachOben ? platzOben : platzUnten));
    const breite = Math.max(feld.width, 240);
    const left = Math.min(Math.max(8, feld.left), Math.max(8, window.innerWidth - breite - 8));
    setLage({
      top: nachOben ? Math.max(8, feld.top - maxHoehe - 6) : feld.bottom + 6,
      left,
      breite,
      maxHoehe,
    });
  }, []);

  useEffect(() => {
    if (!offen || mobil) return;
    messenLage();
    const beiBewegung = () => messenLage();
    window.addEventListener("resize", beiBewegung);
    window.addEventListener("scroll", beiBewegung, true);
    return () => {
      window.removeEventListener("resize", beiBewegung);
      window.removeEventListener("scroll", beiBewegung, true);
    };
  }, [offen, mobil, messenLage]);

  useEffect(() => {
    if (!offen) return;
    const beiKlick = (e: MouseEvent) => {
      const ziel = e.target as Node;
      const imFeld = wurzel.current?.contains(ziel);
      const imPanel = panelRef.current?.contains(ziel);
      if (!mobil && !imFeld && !imPanel) setOffen(false);
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
      <div style={{ position: "relative", marginBottom: 8, flexShrink: 0 }}>
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
      <div style={{ overflowY: "auto", flex: 1, minHeight: 0, maxHeight: mobil ? undefined : 280,
                    display: "grid", gap: 2, alignContent: "start" }}>
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
        {/* Nicht dabei? Dann direkt hier anlegen – der Eintrag steht danach überall zur Verfügung. */}
        {erlaubeNeu && q.trim() && !options.some((o) => o.label.toLowerCase() === q.trim().toLowerCase()) && (
          <button type="button" className="ss-eintrag" disabled={legtAn}
            onClick={async () => {
              if (!onNeu) return;
              setLegtAn(true);
              try {
                const wert = await onNeu(q.trim());
                if (typeof wert === "string" && wert) waehlen(wert);
                else { setOffen(false); setQ(""); }
              } finally { setLegtAn(false); }
            }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <Icon name="plus" size={15} /> „{q.trim()}" {legtAn ? "wird angelegt…" : neuText}
            </span>
          </button>
        )}
        {treffer.length === 0 && !erlaubeNeu && <div className="muted" style={{ padding: "10px 4px", fontSize: 13.5 }}>{leerText}</div>}
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

      {offen && !mobil && typeof document !== "undefined" && createPortal(
        <div ref={panelRef} className="card ss-panel"
          style={{ top: lage.top, left: lage.left, width: lage.breite, maxHeight: lage.maxHoehe }}>
          {liste}
        </div>,
        document.body,
      )}

      {offen && mobil && typeof document !== "undefined" && createPortal(
        <div ref={panelRef} className="ss-vollbild"
             style={sichtHoehe ? { height: sichtHoehe } : undefined}>
          <div className="ss-vollbild-kopf">
            <span style={{ fontWeight: 700, fontSize: 16, flex: 1, minWidth: 0,
                           overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {platzhalter.replace(/^—\s*|\s*—$/g, "") || "Auswählen"}
            </span>
            <button className="btn btn-icon" onClick={() => setOffen(false)} aria-label="Schließen">
              <Icon name="x" />
            </button>
          </div>
          <div className="ss-vollbild-inhalt">{liste}</div>
        </div>,
        document.body,
      )}
    </div>
  );
}
