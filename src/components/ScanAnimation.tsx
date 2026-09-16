"use client";

/**
 * Anzeige während eines laufenden Scans: ein Blatt, über das ein Lichtbalken wandert.
 *
 * Der Scan selbst läuft nebenher – die Seite bleibt bedienbar, es lässt sich weiter
 * suchen, blättern und zuordnen. Die Animation zeigt nur, dass das Gerät arbeitet.
 */
export default function ScanAnimation({ text = "Scannt…", untertext }: { text?: string; untertext?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
      <div className="scan-blatt" aria-hidden="true">
        <span className="scan-zeile" />
        <span className="scan-zeile" />
        <span className="scan-zeile kurz" />
        <span className="scan-zeile" />
        <span className="scan-zeile kurz" />
        <div className="scan-licht" />
      </div>
      <div style={{ display: "grid", gap: 4 }}>
        <span style={{ fontWeight: 600, fontSize: 14 }}>
          {text}<span className="scan-punkte" aria-hidden="true" />
        </span>
        {untertext && <span className="muted" style={{ fontSize: 12.5 }}>{untertext}</span>}
      </div>
    </div>
  );
}
