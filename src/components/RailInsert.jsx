"use client";
// Einfügepunkt zwischen zwei Seiten-Miniaturen: beim Hovern erscheint eine Linie mit „+".
// Genutzt in PdfDocViewer (Seiten bearbeiten), DocAnnotator (bemalen) und Notizen.
import React, { useState } from "react";
import { Plus } from "lucide-react";

export default function RailInsert({ T, onClick, title = "Leerseite hier einfügen" }) {
  const [h, setH] = useState(false);
  return (
    <div onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)} onClick={onClick} title={title}
      style={{ position: "relative", height: h ? 16 : 9, margin: "-3px 0", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ position: "absolute", left: 2, right: 2, height: 2, borderRadius: 2, background: h ? T.accent : "transparent", transition: "background .1s" }} />
      <span style={{ position: "relative", width: 18, height: 18, borderRadius: 99, background: T.accent, color: "#fff", display: h ? "grid" : "none", placeItems: "center", boxShadow: "0 1px 5px rgba(0,0,0,.4)" }}>
        <Plus size={12} />
      </span>
    </div>
  );
}
