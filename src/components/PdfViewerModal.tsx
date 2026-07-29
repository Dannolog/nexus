"use client";
import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Icon from "./Icon";

// Der PDF-Viewer stammt aus ProjectEye (pdf.js + pdf-lib) und wird nur im Browser geladen –
// pdf.js braucht window/Worker und darf nicht serverseitig gerendert werden.
const PdfDocViewer = dynamic(() => import("./PdfDocViewer"), {
  ssr: false,
  loading: () => <div style={{ padding: 24, color: "#fff" }}>Viewer wird geladen…</div>,
});

/** Farbschema, das der Viewer erwartet – hier auf die Nexus-Oberfläche abgestimmt. */
function themeFuerViewer(dunkel: boolean) {
  return dunkel
    ? { bg: "#11151c", card: "#1a2029", ink: "#e7ecf3", inkSoft: "#9aa6b6", line: "#2b3440", accent: "#3b82f6", track: "#0d1117" }
    : { bg: "#eef1f5", card: "#ffffff", ink: "#1a2029", inkSoft: "#5b6879", line: "#d8dee7", accent: "#3b82f6", track: "#e3e8ef" };
}

export default function PdfViewerModal({
  url,
  titel,
  onClose,
  onSavePdf,
}: {
  url: string;
  titel?: string;
  onClose: () => void;
  onSavePdf?: (blob: Blob, opts: { replace?: boolean }) => Promise<void> | void;
}) {
  const [dunkel, setDunkel] = useState(false);

  useEffect(() => {
    setDunkel(document.documentElement.classList.contains("dark"));
    const bei = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", bei);
    // Hintergrund nicht mitscrollen lassen
    const vorher = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", bei);
      document.body.style.overflow = vorher;
    };
  }, [onClose]);

  const T = useMemo(() => themeFuerViewer(dunkel), [dunkel]);

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 300, background: T.bg, display: "flex", flexDirection: "column" }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
        background: T.card, borderBottom: `1px solid ${T.line}`, color: T.ink,
        paddingTop: "calc(10px + env(safe-area-inset-top))",
      }}>
        <Icon name="file-text" size={18} />
        <span style={{ fontWeight: 600, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {titel || "Dokument"}
        </span>
        <button onClick={onClose} title="Schließen (Esc)"
          style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 6, border: `1px solid ${T.line}`, background: "transparent", color: T.ink, borderRadius: 8, padding: "7px 12px", cursor: "pointer", fontSize: 14 }}>
          <Icon name="x" size={16} /> Schließen
        </button>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        {url ? <PdfDocViewer url={url} T={T} onSavePdf={onSavePdf} /> : null}
      </div>
    </div>
  );
}
