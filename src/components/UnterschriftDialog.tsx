"use client";
import { useEffect, useRef, useState } from "react";
import Icon from "./Icon";
import { Feld } from "./KontaktFeld";

/**
 * Unterschreiben per Finger, Stift oder Maus – angelehnt an das SignaturePad aus kontor,
 * hier mit Pointer-Events (ein Code für Maus/Touch/Stift), scharfer Darstellung auf
 * hochauflösenden Displays und dunkler Tinte auf weißem „Papier", damit die Unterschrift
 * im Dunkelmodus wie im PDF gleich aussieht. Auf dem Handy bildschirmfüllend (`dm-fenster`).
 *
 * Ergebnis: PNG (data-URL) mit transparentem Hintergrund, auf die Striche zugeschnitten.
 */
export default function UnterschriftDialog({
  titel, untertitel, rolle, nameVorschlag, bestaetigung, onPdf, onSpeichern, onClose,
}: {
  titel: string;
  untertitel?: string;
  /** z. B. „Arbeitgeber" – erscheint als Beschriftung unter der Linie */
  rolle: string;
  nameVorschlag?: string;
  /** Text der Bestätigung, die vor dem Unterschreiben angehakt werden muss */
  bestaetigung?: string;
  /** Vertrag vor dem Unterschreiben ansehen */
  onPdf?: () => void;
  onSpeichern: (bild: string, name: string) => Promise<void>;
  onClose: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const zeichnet = useRef(false);
  const letzter = useRef<{ x: number; y: number } | null>(null);
  const [leer, setLeerState] = useState(true);
  const leerRef = useRef(true);
  const setLeer = (v: boolean) => { leerRef.current = v; setLeerState(v); };
  const [name, setName] = useState(nameVorschlag || "");
  const [ok, setOk] = useState(!bestaetigung);
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState("");
  const bildInput = useRef<HTMLInputElement>(null);

  // Canvas an die Anzeigegröße anpassen (devicePixelRatio → scharfe Linien)
  useEffect(() => {
    const anpassen = () => {
      const c = canvasRef.current, box = boxRef.current;
      if (!c || !box) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      const w = box.clientWidth, h = box.clientHeight;
      // Inhalt beim Drehen/Größenwechsel erhalten
      const alt = !leerRef.current && c.width ? c.toDataURL() : "";
      c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
      c.style.width = `${w}px`; c.style.height = `${h}px`;
      const ctx = c.getContext("2d")!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (alt) { const img = new Image(); img.onload = () => ctx.drawImage(img, 0, 0, w, h); img.src = alt; }
      if (!w || !h) return;
    };
    anpassen();
    const ro = new ResizeObserver(anpassen);
    if (boxRef.current) ro.observe(boxRef.current);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const bei = (e: KeyboardEvent) => { if (e.key === "Escape" && !busy) { e.stopPropagation(); onClose(); } };
    window.addEventListener("keydown", bei, true);
    return () => window.removeEventListener("keydown", bei, true);
  }, [onClose, busy]);

  const pos = (e: React.PointerEvent) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const stift = (ctx: CanvasRenderingContext2D, druck: number) => {
    ctx.strokeStyle = "#14213d"; ctx.fillStyle = "#14213d";
    ctx.lineWidth = 1.6 + 1.6 * (druck || 0.5); ctx.lineCap = "round"; ctx.lineJoin = "round";
  };
  function start(e: React.PointerEvent<HTMLCanvasElement>) {
    e.preventDefault();
    canvasRef.current!.setPointerCapture(e.pointerId);
    zeichnet.current = true;
    const p = pos(e); letzter.current = p;
    const ctx = canvasRef.current!.getContext("2d")!;
    stift(ctx, e.pressure);
    ctx.beginPath(); ctx.arc(p.x, p.y, ctx.lineWidth / 2, 0, Math.PI * 2); ctx.fill();
    setLeer(false);
  }
  function bewegen(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!zeichnet.current || !letzter.current) return;
    e.preventDefault();
    const ctx = canvasRef.current!.getContext("2d")!;
    // Zwischenpunkte (coalesced) für glatte Linien bei schnellem Schreiben
    const punkte = (e.nativeEvent as any).getCoalescedEvents?.() || [e.nativeEvent];
    for (const pe of punkte) {
      const r = canvasRef.current!.getBoundingClientRect();
      const p = { x: pe.clientX - r.left, y: pe.clientY - r.top };
      stift(ctx, pe.pressure);
      ctx.beginPath(); ctx.moveTo(letzter.current!.x, letzter.current!.y); ctx.lineTo(p.x, p.y); ctx.stroke();
      letzter.current = p;
    }
  }
  function ende() { zeichnet.current = false; letzter.current = null; }

  function leeren() {
    const c = canvasRef.current!; const ctx = c.getContext("2d")!;
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, c.width, c.height); ctx.restore();
    setLeer(true);
  }

  // Unterschrift aus Foto/Bild: dunkle Schrift freistellen, Rest transparent
  function ausBild(f: File) {
    const img = new Image();
    img.onload = () => {
      const c = canvasRef.current!; const ctx = c.getContext("2d")!;
      leeren();
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
      const s = Math.min(c.width / img.width, c.height / img.height) * 0.9;
      const w = img.width * s, h = img.height * s;
      ctx.drawImage(img, (c.width - w) / 2, (c.height - h) / 2, w, h);
      const d = ctx.getImageData(0, 0, c.width, c.height);
      for (let i = 0; i < d.data.length; i += 4) {
        const hell = 0.299 * d.data[i] + 0.587 * d.data[i + 1] + 0.114 * d.data[i + 2];
        if (d.data[i + 3] > 10 && hell < 145) { d.data[i] = 20; d.data[i + 1] = 33; d.data[i + 2] = 61; d.data[i + 3] = 255; }
        else d.data[i + 3] = 0;
      }
      ctx.putImageData(d, 0, 0);
      ctx.restore();
      URL.revokeObjectURL(img.src);
      setLeer(false);
    };
    img.src = URL.createObjectURL(f);
  }

  /** Auf die Striche zuschneiden (mit etwas Rand) und als PNG liefern. */
  function zugeschnitten(): string | null {
    const c = canvasRef.current!; const ctx = c.getContext("2d")!;
    const { data, width, height } = ctx.getImageData(0, 0, c.width, c.height);
    let x0 = width, y0 = height, x1 = -1, y1 = -1;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > 20) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
    if (x1 < 0) return null;
    const rand = 12;
    x0 = Math.max(0, x0 - rand); y0 = Math.max(0, y0 - rand);
    x1 = Math.min(width - 1, x1 + rand); y1 = Math.min(height - 1, y1 + rand);
    // Seitenverhältnis 3:1 wie das Unterschriftsfeld im Vertrag, damit nichts verzerrt
    let w = x1 - x0 + 1, h = y1 - y0 + 1;
    if (w / h < 3) { const nw = h * 3; x0 = Math.max(0, x0 - (nw - w) / 2); w = nw; } else { const nh = w / 3; y0 = Math.max(0, y0 - (nh - h) / 2); h = nh; }
    const ziel = document.createElement("canvas");
    const maxW = 900;
    const f = Math.min(1, maxW / w);
    ziel.width = Math.round(w * f); ziel.height = Math.round(h * f);
    ziel.getContext("2d")!.drawImage(c, x0, y0, w, h, 0, 0, ziel.width, ziel.height);
    return ziel.toDataURL("image/png");
  }

  async function speichern() {
    setFehler("");
    if (!name.trim()) { setFehler("Bitte den Namen der unterschreibenden Person eintragen."); return; }
    if (!ok) { setFehler("Bitte zuerst bestätigen."); return; }
    const bild = zugeschnitten();
    if (!bild) { setFehler("Bitte im Feld unterschreiben."); return; }
    setBusy(true);
    try { await onSpeichern(bild, name.trim()); }
    catch (e: any) { setFehler(e?.message || String(e)); }
    finally { setBusy(false); }
  }

  return (
    <div className="kt-huelle per-huelle" onClick={() => !busy && onClose()} style={{ zIndex: 250 }}>
      <div onClick={(e) => e.stopPropagation()} className="card dm-fenster kt-fenster per-sign-fenster" data-swipe-lock>
        <div className="per-fenster-kopf">
          <div className="per-fenster-titelzeile">
            <span className="per-fenster-ic"><Icon name="pencil" size={18} /></span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h2 className="per-ellipse">{titel}</h2>
              {untertitel && <div className="muted per-klein per-ellipse">{untertitel}</div>}
            </div>
            <button className="btn btn-icon" aria-label="Schließen" disabled={busy} onClick={onClose}><Icon name="x" /></button>
          </div>
        </div>

        <div className="per-fenster-inhalt">
          {onPdf && (
            <button type="button" className="per-pdf-zeile" onClick={onPdf}>
              <span className="per-abschnitt-ic"><Icon name="eye" size={16} /></span>
              <span style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
                <b>Vertrag vorher ansehen</b>
                <span className="muted per-klein" style={{ display: "block" }}>Öffnet das PDF – danach hier unterschreiben.</span>
              </span>
              <Icon name="file-text" size={16} />
            </button>
          )}

          <div className="per-sign-flaeche-kopf">
            <span className="sektion-titel"><Icon name="pencil" size={14} /> Unterschrift</span>
            <div className="per-knopfreihe">
              <button type="button" className="btn btn-flach" onClick={leeren} disabled={leer || busy}><Icon name="undo" /> Neu zeichnen</button>
              <button type="button" className="btn btn-flach" onClick={() => bildInput.current?.click()} disabled={busy}
                title="Eine Unterschrift auf Papier fotografieren – die Schrift wird freigestellt">
                <Icon name="image" /> Aus Foto / Bild
              </button>
            </div>
            <input ref={bildInput} type="file" accept="image/*" capture="environment" style={{ display: "none" }}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) ausBild(f); e.target.value = ""; }} />
          </div>

          {/* Schreibfläche: weißes Papier, Linie wie im Vertrag */}
          <div ref={boxRef} className={`per-sign-flaeche${leer ? "" : " beschrieben"}`}>
            <div style={{ position: "absolute", left: "6%", right: "6%", bottom: "24%", borderTop: "1.5px dashed #b8c0cc", pointerEvents: "none" }} />
            <span style={{ position: "absolute", left: "6%", bottom: "10%", fontSize: 12, color: "#8a94a3", pointerEvents: "none" }}>
              {rolle}{name ? ` · ${name}` : ""}
            </span>
            {leer && (
              <span className="per-sign-platzhalter">
                <Icon name="pencil" size={22} />
                Hier mit Finger, Stift oder Maus unterschreiben
              </span>
            )}
            <canvas ref={canvasRef}
              onPointerDown={start} onPointerMove={bewegen} onPointerUp={ende} onPointerCancel={ende}
              style={{ position: "absolute", inset: 0, touchAction: "none", cursor: "crosshair" }} />
          </div>

          <Feld label="Name der unterschreibenden Person" icon="user" wert={name} setWert={setName} kopierbar={false} />

          {bestaetigung && (
            <label className={`per-bestaetigung${ok ? " an" : ""}`}>
              <input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} />
              <span>{bestaetigung}</span>
            </label>
          )}

          {fehler && (
            <div className="kt-fehler">
              <Icon name="alert" size={14} /> {fehler}
            </div>
          )}
        </div>

        <div className="kt-fuss">
          <button className="btn" disabled={busy} onClick={onClose} style={{ marginRight: "auto" }}><Icon name="x" /> Abbrechen</button>
          <button className="btn btn-primary" disabled={busy || leer || !ok} onClick={speichern}>
            {busy ? <><span className="speichern-dreh" /> Speichert…</> : <><Icon name="check" /> Unterschreiben</>}
          </button>
        </div>
      </div>
    </div>
  );
}
