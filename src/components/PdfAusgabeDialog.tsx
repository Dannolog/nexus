"use client";
import { useEffect, useRef, useState } from "react";
import Icon from "./Icon";
import { Feld } from "./KontaktFeld";
import {
  ladePdfJs, parseSeiten, seitenText, seitenAuswaehlen, nameMitSeiten,
  speichereBlob, speichernUnter, druckeSeiten, alsPdfBytes,
} from "@/lib/pdfAusgabe";

/**
 * Herunterladen, „Speichern unter" und Drucken – wahlweise alle oder nur bestimmte Seiten.
 * Seiten wählt man per Klick auf die Vorschaubilder oder als Text („1-3, 5").
 * Wird von der Scan-Seite und aus dem PDF-Betrachter heraus geöffnet.
 */
export default function PdfAusgabeDialog({
  quelle,
  dateiname,
  titel,
  modus = "speichern",
  onClose,
}: {
  /** Das PDF selbst oder eine Funktion, die es lädt */
  quelle: Blob | (() => Promise<Blob>);
  dateiname: string;
  titel?: string;
  /** Welche Aktion unten rechts als Hauptknopf steht */
  modus?: "speichern" | "drucken";
  onClose: () => void;
}) {
  const [bytes, setBytes] = useState<ArrayBuffer | null>(null);
  const [anzahl, setAnzahl] = useState(0);
  const [vorschau, setVorschau] = useState<string[]>([]);
  const [auswahl, setAuswahl] = useState<number[]>([]);
  const [seitenEingabe, setSeitenEingabe] = useState("");
  const [name, setName] = useState(dateiname.replace(/\.pdf$/i, ""));
  const [fehler, setFehler] = useState("");
  const [hinweis, setHinweis] = useState("");
  const [busy, setBusy] = useState("");
  const [original, setOriginal] = useState<Blob | null>(null);
  const vorschauUrls = useRef<string[]>([]);
  // Quelle nur einmal beim Öffnen laden – eine neue Funktions-Instanz beim Neuzeichnen soll nicht neu laden
  const quelleRef = useRef(quelle);

  // PDF laden, Seiten zählen, kleine Vorschaubilder rendern
  useEffect(() => {
    let abbruch = false;
    (async () => {
      try {
        const q = quelleRef.current;
        const blob = typeof q === "function" ? await q() : q;
        const buf = await alsPdfBytes(blob);
        if (abbruch) return;
        if (!buf) {
          // Weder PDF noch Bild – dann gibt es nur das Original zum Herunterladen
          setOriginal(blob);
          return;
        }
        setBytes(buf);
        const pdfjs = await ladePdfJs();
        const doc = await pdfjs.getDocument({ data: buf.slice(0) }).promise;
        if (abbruch) { doc.destroy?.(); return; }
        const n = doc.numPages;
        setAnzahl(n);
        const alle = Array.from({ length: n }, (_, i) => i);
        setAuswahl(alle);
        setSeitenEingabe(n > 1 ? seitenText(alle) : "1");
        for (let i = 0; i < n && !abbruch; i++) {
          const page = await doc.getPage(i + 1);
          const b = page.getViewport({ scale: 1 });
          const vp = page.getViewport({ scale: 220 / Math.max(b.width, b.height) });
          const c = document.createElement("canvas");
          c.width = Math.floor(vp.width); c.height = Math.floor(vp.height);
          const ctx = c.getContext("2d")!;
          ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
          await page.render({ canvasContext: ctx, viewport: vp }).promise;
          const url: string = await new Promise((res) => c.toBlob((bl) => res(bl ? URL.createObjectURL(bl) : ""), "image/jpeg", 0.8));
          vorschauUrls.current.push(url);
          if (!abbruch) setVorschau((v) => { const k = [...v]; k[i] = url; return k; });
        }
        doc.destroy?.();
      } catch (e: any) {
        if (!abbruch) setFehler("PDF konnte nicht geladen werden: " + (e?.message || e));
      }
    })();
    return () => {
      abbruch = true;
      vorschauUrls.current.forEach((u) => u && URL.revokeObjectURL(u));
      vorschauUrls.current = [];
    };
  }, []);

  useEffect(() => {
    const bei = (e: KeyboardEvent) => { if (e.key === "Escape" && !busy) { e.stopPropagation(); onClose(); } };
    window.addEventListener("keydown", bei, true);
    return () => window.removeEventListener("keydown", bei, true);
  }, [onClose, busy]);

  function setzeAuswahl(neu: number[]) {
    const s = Array.from(new Set(neu)).sort((a, b) => a - b);
    setAuswahl(s);
    setSeitenEingabe(seitenText(s));
    setFehler("");
  }

  function eingabeAendern(v: string) {
    setSeitenEingabe(v);
    const p = parseSeiten(v, anzahl);
    if (p === null) setFehler(`Ungültige Seitenangabe – erlaubt sind Seiten 1 bis ${anzahl}, z. B. „1-3, 5".`);
    else { setFehler(""); setAuswahl(p); }
  }

  const umschalten = (i: number) =>
    setzeAuswahl(auswahl.includes(i) ? auswahl.filter((x) => x !== i) : [...auswahl, i]);

  const alleGewaehlt = anzahl > 0 && auswahl.length === anzahl;
  const bereit = !!bytes && anzahl > 0 && auswahl.length > 0 && !fehler;

  async function ergebnis(): Promise<Blob> {
    if (!bytes) throw new Error("PDF noch nicht geladen");
    if (alleGewaehlt) return new Blob([bytes], { type: "application/pdf" });
    return seitenAuswaehlen(bytes, auswahl);
  }

  const zielName = () => nameMitSeiten((name.trim() || "Dokument").replace(/[\\/:*?"<>|]+/g, "_"), auswahl, anzahl);

  async function herunterladen() {
    setBusy("laden"); setHinweis("");
    try {
      speichereBlob(await ergebnis(), zielName());
      onClose();
    } catch (e: any) { setFehler("Fehler: " + (e?.message || e)); }
    finally { setBusy(""); }
  }

  async function unter() {
    setBusy("unter"); setHinweis("");
    try {
      const r = await speichernUnter(await ergebnis(), zielName());
      if (r === "dialog") onClose();
      else if (r === "download")
        setHinweis("Dieser Browser bietet keinen eigenen Speichern-Dialog – die Datei wurde unter dem gewählten Namen heruntergeladen. Nach dem Speicherort fragt er, wenn das in den Browser-Einstellungen („Vor dem Download Speicherort erfragen\") eingeschaltet ist.");
    } catch (e: any) { setFehler("Fehler: " + (e?.message || e)); }
    finally { setBusy(""); }
  }

  async function drucken() {
    if (!bytes) return;
    setBusy("druck"); setHinweis("");
    try {
      await druckeSeiten(bytes, auswahl, (n, von) => setHinweis(von > 1 ? `Druck wird vorbereitet … Seite ${Math.min(n + 1, von)} von ${von}` : "Druck wird vorbereitet …"));
      setHinweis("");
    } catch (e: any) { setFehler("Drucken fehlgeschlagen: " + (e?.message || e)); setHinweis(""); }
    finally { setBusy(""); }
  }

  const drehen = (b: string) => (
    <span style={{ width: 14, height: 14, border: "2px solid currentColor", borderTopColor: "transparent", borderRadius: "50%", display: "inline-block", animation: "pe-spin .8s linear infinite" }} aria-label={b} />
  );

  const knopfDruck = (
    <button key="druck" className={modus === "drucken" ? "btn btn-primary" : "btn"} disabled={!bereit || !!busy} onClick={drucken}>
      {busy === "druck" ? drehen("druckt") : <Icon name="printer" />} Drucken
    </button>
  );
  const knopfLaden = (
    <button key="laden" className={modus === "speichern" ? "btn btn-primary" : "btn"} disabled={!bereit || !!busy} onClick={herunterladen}>
      {busy === "laden" ? drehen("lädt") : <Icon name="download" />} Herunterladen
    </button>
  );

  return (
    <div onClick={() => !busy && onClose()}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", display: "grid", placeItems: "center", padding: 16, zIndex: 400 }}>
      <div onClick={(e) => e.stopPropagation()} className="card dm-fenster"
        style={{ width: 640, maxWidth: "94vw", maxHeight: "92vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 10 }}>
          <Icon name={modus === "drucken" ? "printer" : "download"} size={18} />
          <h2 style={{ fontSize: 17, fontWeight: 700, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {modus === "drucken" ? "Drucken" : "Herunterladen"}{titel ? ` – ${titel}` : ""}
          </h2>
          <button className="btn btn-icon" aria-label="Schließen" disabled={!!busy} onClick={onClose}><Icon name="x" /></button>
        </div>

        <div style={{ padding: 18, display: "grid", gap: 14, overflowY: "auto", flex: 1, minHeight: 0 }}>
          {original ? (
            <div style={{ display: "grid", gap: 10 }}>
              <div className="muted" style={{ fontSize: 13 }}>
                Diese Datei ist kein PDF und kein Bild – Seitenauswahl und Drucken sind dafür nicht möglich.
              </div>
              <button className="btn btn-primary" style={{ justifySelf: "start" }}
                onClick={() => { speichereBlob(original, dateiname); onClose(); }}>
                <Icon name="download" /> Original herunterladen
              </button>
            </div>
          ) : !bytes || !anzahl ? (
            <div className="muted" style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {!fehler && drehen("lädt")} {fehler || "Dokument wird geladen …"}
            </div>
          ) : (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span className="muted" style={{ fontSize: 13, display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <Icon name="file-text" size={14} /> Seiten: {auswahl.length} von {anzahl} gewählt
                </span>
                {anzahl > 1 && (
                  <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                    <button className="btn" disabled={alleGewaehlt} onClick={() => setzeAuswahl(Array.from({ length: anzahl }, (_, i) => i))}>
                      <Icon name="check" size={14} /> Alle
                    </button>
                    <button className="btn" disabled={!auswahl.length} onClick={() => setzeAuswahl([])}>
                      <Icon name="x" size={14} /> Keine
                    </button>
                  </span>
                )}
              </div>

              {anzahl > 1 && (
                <Feld label="Seitenauswahl (z. B. 1-3, 5)" icon="file-text" wert={seitenEingabe}
                  setWert={eingabeAendern} platzhalter={`1-${anzahl}`} kopierbar={false} />
              )}

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))", gap: 10 }}>
                {Array.from({ length: anzahl }, (_, i) => {
                  const an = auswahl.includes(i);
                  return (
                    <button key={i} type="button" onClick={() => anzahl > 1 && umschalten(i)} title={`Seite ${i + 1}`}
                      style={{
                        all: "unset", cursor: anzahl > 1 ? "pointer" : "default", position: "relative", display: "grid", gap: 4,
                        justifyItems: "center", padding: 6, borderRadius: 10,
                        border: `2px solid ${an ? "var(--accent, #3b82f6)" : "var(--border)"}`,
                        opacity: an ? 1 : 0.45, background: an ? "rgba(59,130,246,.08)" : "transparent",
                      }}>
                      <div style={{ width: "100%", aspectRatio: "0.72", display: "grid", placeItems: "center", background: "#fff", borderRadius: 4, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,.2)" }}>
                        {vorschau[i]
                          ? <img src={vorschau[i]} alt={`Seite ${i + 1}`} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
                          : <span style={{ color: "#999" }}>{drehen("lädt")}</span>}
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

              <Feld label="Dateiname" icon="file-text" wert={name} setWert={setName} platzhalter="Dokument" kopierbar={false}
                hinweis={`Wird gespeichert als „${zielName()}"`} />

              {fehler && <div style={{ color: "var(--danger, #dc2626)", fontSize: 13, display: "flex", gap: 6, alignItems: "center" }}><Icon name="alert" size={14} /> {fehler}</div>}
              {hinweis && <div className="muted" style={{ fontSize: 13 }}>{hinweis}</div>}
            </>
          )}
        </div>

        <div style={{ padding: "12px 18px", borderTop: "1px solid var(--border)", display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <button className="btn" disabled={!!busy} onClick={onClose} style={{ marginRight: "auto" }}>
            <Icon name="x" /> Abbrechen
          </button>
          <button className="btn" disabled={!bereit || !!busy} onClick={unter} title="Ordner und Namen selbst wählen">
            {busy === "unter" ? drehen("speichert") : <Icon name="save" />} Speichern unter …
          </button>
          {modus === "drucken" ? [knopfLaden, knopfDruck] : [knopfDruck, knopfLaden]}
        </div>
      </div>
    </div>
  );
}
