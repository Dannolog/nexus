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
  const rahmen = useRef<HTMLIFrameElement>(null);

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

      {url && (
        <iframe ref={rahmen} className="pdf-rahmen" src={url} title="Arbeitsvertrag als PDF" />
      )}
    </div>
  );
}
