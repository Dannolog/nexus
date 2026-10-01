"use client";
import { useEffect, useRef, useState } from "react";
import Icon from "./Icon";
import { Feld } from "./KontaktFeld";
import { ladePdfJs, parseSeiten, seitenText, alsPdfBytes } from "@/lib/pdfAusgabe";

/**
 * Seitenauswahl für PDFs – gemeinsam genutzt von Herunterladen/Drucken und vom Zuordnen
 * eines Scans. `usePdfSeiten` lädt das Dokument und rendert kleine Vorschaubilder,
 * `SeitenWahl` zeigt sie zum An-/Abwählen samt Texteingabe („1-3, 5").
 */
export function usePdfSeiten(quelle: Blob | (() => Promise<Blob>)) {
  const [bytes, setBytes] = useState<ArrayBuffer | null>(null);
  const [anzahl, setAnzahl] = useState(0);
  const [vorschau, setVorschau] = useState<string[]>([]);
  const [fehler, setFehler] = useState("");
  // Weder PDF noch Bild – dann gibt es nur das Original
  const [original, setOriginal] = useState<Blob | null>(null);
  const urls = useRef<string[]>([]);
  // Nur einmal beim Öffnen laden – eine neue Funktions-Instanz beim Neuzeichnen soll nicht neu laden
  const quelleRef = useRef(quelle);

  useEffect(() => {
    let abbruch = false;
    (async () => {
      try {
        const q = quelleRef.current;
        const blob = typeof q === "function" ? await q() : q;
        const buf = await alsPdfBytes(blob);
        if (abbruch) return;
        if (!buf) { setOriginal(blob); return; }
        setBytes(buf);
        const pdfjs = await ladePdfJs();
        const doc = await pdfjs.getDocument({ data: buf.slice(0) }).promise;
        if (abbruch) { doc.destroy?.(); return; }
        setAnzahl(doc.numPages);
        for (let i = 0; i < doc.numPages && !abbruch; i++) {
          const page = await doc.getPage(i + 1);
          const b = page.getViewport({ scale: 1 });
          const vp = page.getViewport({ scale: 220 / Math.max(b.width, b.height) });
          const c = document.createElement("canvas");
          c.width = Math.floor(vp.width); c.height = Math.floor(vp.height);
          const ctx = c.getContext("2d")!;
          ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
          await page.render({ canvasContext: ctx, viewport: vp }).promise;
          const url: string = await new Promise((res) => c.toBlob((bl) => res(bl ? URL.createObjectURL(bl) : ""), "image/jpeg", 0.8));
          urls.current.push(url);
          if (!abbruch) setVorschau((v) => { const k = [...v]; k[i] = url; return k; });
        }
        doc.destroy?.();
      } catch (e: any) {
        if (!abbruch) setFehler("PDF konnte nicht geladen werden: " + (e?.message || e));
      }
    })();
    return () => {
      abbruch = true;
      urls.current.forEach((u) => u && URL.revokeObjectURL(u));
      urls.current = [];
    };
  }, []);

  return { bytes, anzahl, vorschau, fehler, original };
}

/** Vorschaubild einer Seite als kleine data-URL (für die Liste im Posteingang). */
export async function vorschauDataUrl(bytes: ArrayBuffer, seite: number): Promise<string> {
  const pdfjs = await ladePdfJs();
  const doc = await pdfjs.getDocument({ data: bytes.slice(0) }).promise;
  try {
    const page = await doc.getPage(seite + 1);
    const b = page.getViewport({ scale: 1 });
    const vp = page.getViewport({ scale: 240 / Math.max(b.width, b.height) });
    const c = document.createElement("canvas");
    c.width = Math.floor(vp.width); c.height = Math.floor(vp.height);
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    return c.toDataURL("image/jpeg", 0.7);
  } finally { doc.destroy?.(); }
}

const kreisel = (
  <span style={{ width: 14, height: 14, border: "2px solid currentColor", borderTopColor: "transparent", borderRadius: "50%", display: "inline-block", animation: "pe-spin .8s linear infinite" }} />
);

export function SeitenWahl({
  anzahl, vorschau, auswahl, onChange, onFehler,
}: {
  anzahl: number;
  vorschau: string[];
  auswahl: number[];
  onChange: (seiten: number[]) => void;
  /** Meldet eine ungültige Texteingabe (leer = gültig) */
  onFehler?: (text: string) => void;
}) {
  const [eingabe, setEingabe] = useState(seitenText(auswahl));
  const [fehler, setFehler] = useState("");
  const eigeneAenderung = useRef(false);

  // Auswahl von außen (Klick, Alle/Keine) → Textfeld nachziehen
  useEffect(() => {
    if (eigeneAenderung.current) { eigeneAenderung.current = false; return; }
    setEingabe(seitenText(auswahl));
    setFehler(""); onFehler?.("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auswahl]);

  function setze(neu: number[]) {
    onChange(Array.from(new Set(neu)).sort((a, b) => a - b));
  }

  function tippen(v: string) {
    setEingabe(v);
    const p = parseSeiten(v, anzahl);
    if (p === null) {
      const t = `Ungültige Seitenangabe – erlaubt sind Seiten 1 bis ${anzahl}, z. B. „1-3, 5".`;
      setFehler(t); onFehler?.(t);
    } else {
      setFehler(""); onFehler?.("");
      eigeneAenderung.current = true;
      onChange(p);
    }
  }

  const alle = anzahl > 0 && auswahl.length === anzahl;

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span className="muted" style={{ fontSize: 13, display: "inline-flex", alignItems: "center", gap: 6 }}>
          <Icon name="file-text" size={14} /> Seiten: {auswahl.length} von {anzahl} gewählt
        </span>
        {anzahl > 1 && (
          <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
            <button type="button" className="btn" disabled={alle} onClick={() => setze(Array.from({ length: anzahl }, (_, i) => i))}>
              <Icon name="check" size={14} /> Alle
            </button>
            <button type="button" className="btn" disabled={!auswahl.length} onClick={() => setze([])}>
              <Icon name="x" size={14} /> Keine
            </button>
          </span>
        )}
      </div>

      {anzahl > 1 && (
        <Feld label="Seitenauswahl (z. B. 1-3, 5)" icon="file-text" wert={eingabe}
          setWert={tippen} platzhalter={`1-${anzahl}`} kopierbar={false} />
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))", gap: 10 }}>
        {Array.from({ length: anzahl }, (_, i) => {
          const an = auswahl.includes(i);
          return (
            <button key={i} type="button" title={`Seite ${i + 1}`}
              onClick={() => anzahl > 1 && setze(an ? auswahl.filter((x) => x !== i) : [...auswahl, i])}
              style={{
                all: "unset", cursor: anzahl > 1 ? "pointer" : "default", position: "relative", display: "grid", gap: 4,
                justifyItems: "center", padding: 6, borderRadius: 10,
                border: `2px solid ${an ? "var(--accent, #3b82f6)" : "var(--border)"}`,
                opacity: an ? 1 : 0.45, background: an ? "rgba(59,130,246,.08)" : "transparent",
              }}>
              <div style={{ width: "100%", aspectRatio: "0.72", display: "grid", placeItems: "center", background: "#fff", borderRadius: 4, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,.2)" }}>
                {vorschau[i]
                  ? <img src={vorschau[i]} alt={`Seite ${i + 1}`} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
                  : <span style={{ color: "#999" }}>{kreisel}</span>}
              </div>
              <span style={{ fontSize: 12, fontWeight: 600 }}>Seite {i + 1}</span>
              {an && (
                <span style={{ position: "absolute", top: 2, right: 2, width: 20, height: 20, borderRadius: "50%", background: "var(--accent, #3b82f6)", color: "#fff", display: "grid", placeItems: "center" }}>
                  <Icon name="check" size={12} />
                </span>
              )}
            </button>
          );
        })}
      </div>

      {fehler && (
        <div style={{ color: "var(--danger, #dc2626)", fontSize: 13, display: "flex", gap: 6, alignItems: "center" }}>
          <Icon name="alert" size={14} /> {fehler}
        </div>
      )}
    </div>
  );
}
