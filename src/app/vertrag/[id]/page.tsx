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
    // Gestaltung in src/app/styles/personal.css (Präfix .per-pdf-)
    <div className="per-pdf-seite">
      <div className="per-pdf-leiste">
        <button type="button" className="per-pdf-knopf" onClick={() => router.push("/contracts")} aria-label="Zurück zu den Arbeitsverträgen">
          <Icon name="undo" /> <span className="per-pdf-text-weg">Zurück</span>
        </button>
        <div className="per-pdf-titel">
          <span className="per-pdf-ic"><Icon name="file-text" size={16} /></span>
          <div style={{ minWidth: 0 }}>
            <div className="per-pdf-nr">{nr || "Arbeitsvertrag"}</div>
            {contract?.employeeName && <div className="per-pdf-name">{contract.employeeName}</div>}
          </div>
        </div>
        <span className={`per-pdf-status${blob ? " fertig" : ""}`}>
          {laedt ? <><span className="per-pdf-dreh" /> PDF wird erzeugt…</> : blob ? <><Icon name="check" size={13} /> PDF fertig</> : ""}
        </span>
        <div className="per-pdf-knoepfe">
          <button type="button" className="per-pdf-knopf" onClick={drucken} disabled={!url}>
            <Icon name="printer" /> Drucken
          </button>
          <button type="button" className="per-pdf-knopf primaer" onClick={speichern} disabled={!blob}>
            <Icon name="download" /> Als PDF speichern
          </button>
        </div>
      </div>

      {fehler && (
        <div className="per-pdf-meldung fehler">
          <span className="per-pdf-meldung-ic"><Icon name="alert" size={24} /></span>
          <div style={{ fontWeight: 650 }}>Vertrag konnte nicht angezeigt werden</div>
          <div style={{ opacity: .85, fontSize: 13.5 }}>{fehler}</div>
          <button type="button" className="per-pdf-knopf" onClick={() => router.push("/contracts")}><Icon name="undo" /> Zu den Arbeitsverträgen</button>
        </div>
      )}
      {!fehler && laedt && (
        <div className="per-pdf-meldung">
          <span className="per-pdf-meldung-ic"><span className="per-pdf-dreh gross" /></span>
          Vertrag wird geladen und als PDF aufbereitet…
        </div>
      )}

      {url && !mobil && (
        <iframe ref={rahmen} className="per-pdf-rahmen" src={url} title="Arbeitsvertrag als PDF" />
      )}

      {url && mobil && (
        <div className="per-pdf-mobil">
          <div className="per-pdf-karte">
            <div className="per-pdf-karte-kopf">
              <span className="per-pdf-ic gross"><Icon name="file-text" size={26} /></span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 17 }}>Arbeitsvertrag {nr}</div>
                {contract?.employeeName && <div className="muted" style={{ fontSize: 14 }}>{contract.employeeName}</div>}
                <span className="abzeichen gruen" style={{ marginTop: 6 }}><Icon name="check" size={11} /> PDF bereit</span>
              </div>
            </div>
            <button type="button" className="per-pdf-gross primaer" onClick={speichern}>
              <Icon name="download" size={18} /> PDF speichern
            </button>
            <button type="button" className="per-pdf-gross"
              onClick={() => window.open(url, "_blank", "noopener")}>
              <Icon name="eye" size={18} /> PDF öffnen
            </button>
            <p className="muted per-pdf-hinweis">
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
