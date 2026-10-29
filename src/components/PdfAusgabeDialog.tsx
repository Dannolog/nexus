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
    <div className="kt-huelle per-huelle" onClick={() => !busy && onClose()} style={{ zIndex: 400 }}>
      <div onClick={(e) => e.stopPropagation()} className="card dm-fenster kt-fenster per-ausgabe-fenster">
        <div className="per-fenster-kopf">
          <div className="per-fenster-titelzeile">
            <span className="per-fenster-ic"><Icon name={modus === "drucken" ? "printer" : "download"} size={18} /></span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h2 className="per-ellipse">{modus === "drucken" ? "Drucken" : "Herunterladen"}</h2>
              <div className="muted per-klein per-ellipse">
                {titel ? `${titel} · ` : ""}Alle oder nur bestimmte Seiten ausgeben
              </div>
            </div>
            <button className="btn btn-icon" aria-label="Schließen" disabled={!!busy} onClick={onClose}><Icon name="x" /></button>
          </div>
        </div>

        <div className="per-fenster-inhalt">
          {original ? (
            <div className="per-abschnitt-inhalt" style={{ padding: 0 }}>
              <div className="hinweis-leiste" style={{ marginBottom: 0 }}>
                <Icon name="alert" size={16} />
                <span>Diese Datei ist kein PDF und kein Bild – Seitenauswahl und Drucken sind dafür nicht möglich.</span>
              </div>
              <button className="btn btn-primary" style={{ justifySelf: "start" }}
                onClick={() => { speichereBlob(original, dateiname); onClose(); }}>
                <Icon name="download" /> Original herunterladen
              </button>
            </div>
          ) : !bytes || !anzahl ? (
            ladeFehler ? (
              <div className="kt-fehler"><Icon name="alert" size={14} /> {ladeFehler}</div>
            ) : (
              <div className="leer-zustand" style={{ padding: "32px 16px" }}>
                <span className="leer-icon">{drehen("lädt")}</span>
                Dokument wird geladen …
              </div>
            )
          ) : (
            <>
              <section className="per-block">
                <div className="per-block-titel"><Icon name="file-text" size={14} /> Seiten auswählen</div>
                <div className="per-block-inhalt">
                  <SeitenWahl anzahl={anzahl} vorschau={vorschau} auswahl={auswahl}
                    onChange={(v) => { setAuswahl(v); setFehler(""); }} onFehler={setSeitenFehler} />
                </div>
              </section>

              <section className="per-block">
                <div className="per-block-titel"><Icon name="save" size={14} /> Datei</div>
                <div className="per-block-inhalt">
                  <Feld label="Dateiname" icon="file-text" wert={name} setWert={setName} platzhalter="Dokument" kopierbar={false}
                    hinweis={`Wird gespeichert als „${zielName()}"`} />
                </div>
              </section>

              {fehlerAktion && <div className="kt-fehler"><Icon name="alert" size={14} /> {fehlerAktion}</div>}
              {hinweis && (
                <div className="hinweis-leiste" style={{ marginBottom: 0, fontSize: 13 }}>
                  <Icon name={busy ? "printer" : "alert"} size={15} /> <span>{hinweis}</span>
                </div>
              )}
            </>
          )}
        </div>

        <div className="kt-fuss per-ausgabe-fuss">
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
