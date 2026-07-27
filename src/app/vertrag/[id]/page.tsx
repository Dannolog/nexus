"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/clientApi";
import Icon from "@/components/Icon";
import VertragDokument, { vertragsNr, type Contract } from "@/components/VertragDokument";

// ── Druck-/PDF-Ansicht eines Arbeitsvertrags ──
// Bewusst außerhalb der (app)-Route-Group: kein Menü, kein App-Rahmen, keine Zoom-Hülle.
// Auf dem Bildschirm sieht man exakt die A4-Seiten, die auch gedruckt bzw. als PDF
// gespeichert werden – deshalb braucht es hier keinen visibility-Trick im Print-CSS.
export default function VertragDruckSeite() {
  const params = useParams();
  const router = useRouter();
  const id = String(params?.id || "");
  const [contract, setContract] = useState<Contract | null>(null);
  const [fehler, setFehler] = useState("");

  useEffect(() => {
    if (!id) return;
    api(`/api/contracts/${id}`)
      .then((c) => setContract(c))
      .catch((e: any) => setFehler(e.message || "Vertrag konnte nicht geladen werden."));
  }, [id]);

  useEffect(() => {
    if (contract) document.title = `Arbeitsvertrag ${vertragsNr(contract.number) || ""} ${contract.employeeName || ""}`.trim();
  }, [contract]);

  const nr = contract ? vertragsNr(contract.number) : "";

  return (
    <div className="druck-seite">
      <style>{`
        .druck-seite { background: #6b7280; min-height: 100vh; padding: 0 0 40px; }
        .druck-toolbar {
          position: sticky; top: 0; z-index: 10; display: flex; flex-wrap: wrap; gap: 8;
          align-items: center; padding: 10px 14px; background: #1f2430; color: #fff;
          box-shadow: 0 1px 8px rgba(0,0,0,.3);
        }
        .druck-toolbar .dt-btn {
          display: inline-flex; align-items: center; gap: 7px; padding: 8px 14px; border-radius: 8px;
          border: 1px solid rgba(255,255,255,.25); background: rgba(255,255,255,.08); color: #fff;
          font-size: 14px; font-weight: 600; cursor: pointer;
        }
        .druck-toolbar .dt-btn:hover { background: rgba(255,255,255,.16); }
        .druck-toolbar .dt-btn.primary { background: #2563eb; border-color: #2563eb; }
        .druck-toolbar .dt-btn.primary:hover { background: #1d4ed8; }
        .druck-hinweis { font-size: 12.5px; opacity: .8; margin-left: auto; max-width: 380px; line-height: 1.35; }
        .druck-blatt { padding: 24px 12px 0; }
        /* Seiten auf schmalen Displays einpassen, ohne das A4-Layout zu verändern */
        @media (max-width: 830px) {
          .druck-blatt { padding: 14px 0 0; }
          .druck-skalierung { transform: scale(var(--fit, 1)); transform-origin: top center; }
        }
        @media print {
          .druck-seite { background: #fff !important; padding: 0 !important; min-height: 0 !important; }
          .druck-toolbar, .vv-measure { display: none !important; }
          .druck-blatt { padding: 0 !important; }
          .druck-skalierung { transform: none !important; }
          .a4-page {
            box-shadow: none !important; margin: 0 !important; border: 0 !important;
            page-break-after: always; break-after: page; min-height: auto !important;
          }
          .a4-page:last-child { page-break-after: auto; break-after: auto; }
          @page { size: A4; margin: 0; }
        }
      `}</style>

      <div className="druck-toolbar">
        <button type="button" className="dt-btn" onClick={() => router.push("/contracts")}>
          <Icon name="undo" /> Zurück
        </button>
        <button type="button" className="dt-btn primary" onClick={() => window.print()} disabled={!contract}>
          <Icon name="file-text" /> Drucken / als PDF speichern
        </button>
        {nr && <span style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums", letterSpacing: ".03em" }}>{nr}</span>}
        <span className="druck-hinweis">
          Im Druckdialog als Ziel <b>„Als PDF speichern"</b> wählen – dann wird der Vertrag als PDF-Datei gesichert
          statt gedruckt. Ränder: <b>„Keine"</b>, Skalierung <b>100 %</b>.
        </span>
      </div>

      {fehler && (
        <div style={{ margin: "24px auto", maxWidth: 700, background: "#fff", padding: 16, borderRadius: 10, color: "#b91c1c" }}>
          {fehler}
        </div>
      )}

      {!contract && !fehler && (
        <div style={{ margin: "40px auto", textAlign: "center", color: "#fff", fontSize: 15 }}>Vertrag wird geladen…</div>
      )}

      {contract && (
        <div className="druck-blatt">
          <SkalierteSeiten>
            <VertragDokument form={contract} befristet={contract.contractType === "befristet"} />
          </SkalierteSeiten>
        </div>
      )}
    </div>
  );
}

// Auf schmalen Displays (Handy) die A4-Breite einpassen – gedruckt wird trotzdem 1:1.
function SkalierteSeiten({ children }: { children: React.ReactNode }) {
  const [fit, setFit] = useState(1);
  useEffect(() => {
    const messen = () => {
      const w = window.innerWidth;
      setFit(w < 830 ? Math.max(0.3, w / 810) : 1);
    };
    messen();
    window.addEventListener("resize", messen);
    return () => window.removeEventListener("resize", messen);
  }, []);
  return (
    <div className="druck-skalierung" style={{ ["--fit" as any]: fit, width: fit < 1 ? 794 : undefined, margin: "0 auto" }}>
      {children}
    </div>
  );
}
