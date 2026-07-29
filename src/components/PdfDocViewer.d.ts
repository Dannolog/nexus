import * as React from "react";

// Typbeschreibung für den aus ProjectEye übernommenen Viewer (dort reines JSX).
// Alle Zusatzfunktionen (Regionsauswahl, Tabellen-/OCR-Bereiche, Markierungen) sind
// optional – Nexus nutzt bisher nur Anzeige und Seitenbearbeitung.
export interface PdfDocViewerProps {
  /** Quelle des PDFs (Blob-URL oder Pfad) */
  url: string;
  /** Farbschema: bg, card, ink, inkSoft, line, accent, track */
  T: Record<string, string>;
  armed?: boolean;
  armedLabel?: string;
  armedKey?: string;
  onRegionText?: (text: string, extra?: any) => void;
  marks?: any[];
  onMarksChange?: (marks: any[]) => void;
  onMarkActivate?: (mark: any) => void;
  tableMode?: boolean;
  onTableRegion?: (region: any) => void;
  onOcrRegion?: (region: any) => void;
  /** Ohne diese Funktion blendet der Viewer „Seiten bearbeiten/Speichern" aus. */
  onSavePdf?: (blob: Blob, opts: { replace?: boolean }) => void | Promise<void>;
}

declare const PdfDocViewer: React.FC<PdfDocViewerProps>;
export default PdfDocViewer;
