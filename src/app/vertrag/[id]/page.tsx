"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/clientApi";
import Icon from "@/components/Icon";
import { vertragsNr, type Contract } from "@/components/VertragDokument";
import { generateVertragPdf, vertragDateiname, downloadBlob } from "@/lib/vertragPdf";

// ── PDF-Vorschau eines Arbeitsvertrags ──
// Bewusst außerhalb der Route-Group (app): kein Menü, kein App-Rahmen. Das PDF wird
// clientseitig mit jsPDF erzeugt (wie in kontor) und im PDF-Viewer des Browsers angezeigt.
// Von dort: herunterladen oder drucken – beides ohne Umweg über den Seiten-Druckdialog.
export default function VertragPdfSeite() {
  const params = useParams();
  const router = useRouter();
  const id = String(params?.id || "");
  const [contract, setContract] = useState<Contract | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [url, setUrl] = useState("");
  const [fehler, setFehler] = useState("");
  const [laedt, setLaedt] = useState(true);
  const [mobil, setMobil] = useState(false);
  const rahmen = useRef<HTMLIFrameElement>(null);

  // Handys (besonders iOS) zeigen ein eingebettetes PDF im iframe oft gar nicht an –
  // dort deshalb keine Einbettung, sondern große Schaltflächen zum Öffnen/Speichern.
  useEffect(() => {
    const messen = () => setMobil(window.innerWidth <= 768);
    messen();
    window.addEventListener("resize", messen);
    return () => window.removeEventListener("resize", messen);
  }, []);

  useEffect(() => {
    if (!id) return;
    let abgebrochen = false;
    (async () => {
      try {
        const c = await api(`/api/contracts/${id}`);
        if (abgebrochen) return;
        setContract(c);
        const b = await generateVertragPdf(c);
        if (abgebrochen) return;
        setBlob(b);
        setUrl(URL.createObjectURL(b));
      } catch (e: any) {
        if (!abgebrochen) setFehler(e.message || "Vertrag konnte nicht geladen werden.");
      } finally {
        if (!abgebrochen) setLaedt(false);
      }
    })();
    return () => { abgebrochen = true; };
  }, [id]);

  // Object-URL freigeben, wenn die Seite verlassen wird
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);

  useEffect(() => {
    if (contract) document.title = vertragDateiname(contract).replace(/\.pdf$/, "");
  }, [contract]);

  const speichern = useCallback(() => {
    if (blob && contract) downloadBlob(blob, vertragDateiname(contract));
  }, [blob, contract]);

  const drucken = useCallback(() => {
    // Direkt aus dem eingebetteten PDF drucken – der Browser druckt dann das PDF,
    // nicht die HTML-Seite. Klappt nicht in jedem mobilen Browser, dann bleibt der
    // Weg über den Viewer bzw. "Speichern".
    try {
      const w = rahmen.current?.contentWindow;
      if (w) { w.focus(); w.print(); return; }
    } catch { /* Fallback unten */ }
    if (url) window.open(url, "_blank", "noopener");
  }, [url]);

  const nr = contract ? vertragsNr(contract.number) : "";

  return (
    <div className="pdf-seite">
      <style>{`
        .pdf-seite { display: flex; flex-direction: column; height: 100vh; background: #4b5563; }
        .pdf-leiste {
          display: flex; flex-wrap: wrap; gap: 8px; align-items: center;
          padding: 10px 14px; background: #1f2430; color: #fff; box-shadow: 0 1px 8px rgba(0,0,0,.3);
        }
        .pdf-leiste .pb {
          display: inline-flex; align-items: center; gap: 7px; padding: 8px 14px; border-radius: 8px;
          border: 1px solid rgba(255,255,255,.25); background: rgba(255,255,255,.08); color: #fff;
          font-size: 14px; font-weight: 600; cursor: pointer;
        }
        .pdf-leiste .pb:hover { background: rgba(255,255,255,.16); }
        .pdf-leiste .pb:disabled { opacity: .5; cursor: default; }
        .pdf-leiste .pb.primary { background: #2563eb; border-color: #2563eb; }
        .pdf-leiste .pb.primary:hover { background: #1d4ed8; }
        .pdf-nr { font-weight: 700; font-variant-numeric: tabular-nums; letter-spacing: .03em; }
        .pdf-info { margin-left: auto; font-size: 12.5px; opacity: .8; }
        .pdf-rahmen { flex: 1; width: 100%; border: 0; background: #4b5563; }
        .pdf-meldung { margin: 40px auto; text-align: center; color: #fff; font-size: 15px; }
        .pdf-mobil { flex: 1; display: flex; align-items: flex-start; justify-content: center; padding: 22px 14px; }
        .pdf-karte {
          width: 100%; max-width: 420px; background: var(--card, #fff); color: var(--fg, #111);
          border-radius: 14px; padding: 18px; box-shadow: 0 6px 24px rgba(0,0,0,.25);
        }
        .pdf-karte .pb { border-color: rgba(0,0,0,.15); background: rgba(0,0,0,.06); color: inherit; padding: 12px 14px; font-size: 15px; }
        .pdf-karte .pb.primary { background: #2563eb; border-color: #2563eb; color: #fff; }
        @media (max-width: 768px) {
          .pdf-leiste { padding: calc(10px + env(safe-area-inset-top)) 12px 10px; }
          .pdf-leiste .pb { padding: 9px 12px; font-size: 13.5px; }
          .pdf-info { display: none; }
        }
      `}</style>

      <div className="pdf-leiste">
        <button type="button" className="pb" onClick={() => router.push("/contracts")}>
          <Icon name="undo" /> Zurück
        </button>
        <button type="button" className="pb primary" onClick={speichern} disabled={!blob}>
          <Icon name="save" /> Als PDF speichern
        </button>
        <button type="button" className="pb" onClick={drucken} disabled={!url}>
          <Icon name="file-text" /> Drucken
        </button>
        {nr && <span className="pdf-nr">{nr}</span>}
        {contract?.employeeName && <span style={{ opacity: .85, fontSize: 13.5 }}>{contract.employeeName}</span>}
        <span className="pdf-info">{laedt ? "PDF wird erzeugt…" : blob ? "PDF fertig" : ""}</span>
      </div>

      {fehler && <div className="pdf-meldung" style={{ color: "#fecaca" }}>{fehler}</div>}
      {!fehler && laedt && <div className="pdf-meldung">Vertrag wird geladen und als PDF aufbereitet…</div>}

      {url && !mobil && (
        <iframe ref={rahmen} className="pdf-rahmen" src={url} title="Arbeitsvertrag als PDF" />
      )}

      {url && mobil && (
        <div className="pdf-mobil">
          <div className="pdf-karte">
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>
              Arbeitsvertrag {nr}
            </div>
            {contract?.employeeName && <div className="muted" style={{ marginBottom: 14 }}>{contract.employeeName}</div>}
            <button type="button" className="pb primary" style={{ width: "100%", justifyContent: "center", marginBottom: 10 }} onClick={speichern}>
              <Icon name="save" /> PDF speichern
            </button>
            <button type="button" className="pb" style={{ width: "100%", justifyContent: "center" }}
              onClick={() => window.open(url, "_blank", "noopener")}>
              <Icon name="file-text" /> PDF öffnen
            </button>
            <p className="muted" style={{ fontSize: 12.5, lineHeight: 1.5, marginTop: 14 }}>
              Handy-Browser können PDFs nicht zuverlässig direkt in der Seite anzeigen.
              „PDF öffnen" zeigt den Vertrag im PDF-Betrachter des Geräts – von dort lässt er sich
              auch teilen oder drucken.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
