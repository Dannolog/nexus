"use client";
import { useEffect, useState } from "react";
import Icon from "./Icon";
import { Feld } from "./KontaktFeld";
import { SeitenWahl, usePdfSeiten } from "./SeitenWahl";
import { seitenAuswaehlen, nameMitSeiten, speichereBlob, speichernUnter, druckeSeiten } from "@/lib/pdfAusgabe";

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
  const { bytes, anzahl, vorschau, fehler: ladeFehler, original } = usePdfSeiten(quelle);
  const [auswahl, setAuswahl] = useState<number[]>([]);
  const [seitenFehler, setSeitenFehler] = useState("");
  const [name, setName] = useState(dateiname.replace(/\.pdf$/i, ""));
  const [fehlerAktion, setFehler] = useState("");
  const [hinweis, setHinweis] = useState("");
  const [busy, setBusy] = useState("");
  const fehler = ladeFehler || seitenFehler || fehlerAktion;

  // Sobald die Seitenzahl bekannt ist: alle Seiten vorwählen
  useEffect(() => { if (anzahl) setAuswahl(Array.from({ length: anzahl }, (_, i) => i)); }, [anzahl]);

  useEffect(() => {
    const bei = (e: KeyboardEvent) => { if (e.key === "Escape" && !busy) { e.stopPropagation(); onClose(); } };
    window.addEventListener("keydown", bei, true);
    return () => window.removeEventListener("keydown", bei, true);
  }, [onClose, busy]);

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
              {!ladeFehler && drehen("lädt")} {ladeFehler || "Dokument wird geladen …"}
            </div>
          ) : (
            <>
              <SeitenWahl anzahl={anzahl} vorschau={vorschau} auswahl={auswahl}
                onChange={(v) => { setAuswahl(v); setFehler(""); }} onFehler={setSeitenFehler} />

              <Feld label="Dateiname" icon="file-text" wert={name} setWert={setName} platzhalter="Dokument" kopierbar={false}
                hinweis={`Wird gespeichert als „${zielName()}"`} />

              {fehlerAktion && <div style={{ color: "var(--danger, #dc2626)", fontSize: 13, display: "flex", gap: 6, alignItems: "center" }}><Icon name="alert" size={14} /> {fehlerAktion}</div>}
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
