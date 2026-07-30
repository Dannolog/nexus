"use client";
import React from "react";

/**
 * Hebt den gefundenen Text hervor – überall dort einsetzbar, wo eine Suche Treffer
 * anzeigt (Listen, Karten, Detailfenster). Sucht ohne Rücksicht auf Groß-/Kleinschreibung
 * und markiert **alle** Vorkommen.
 */
export default function Hervorheben({
  text,
  suche,
}: {
  text: React.ReactNode;
  suche?: string;
}) {
  const s = String(suche || "").trim();
  if (!s || typeof text !== "string" || !text) return <>{text}</>;

  // Sonderzeichen im Suchbegriff entschärfen, damit sie nicht als Regex wirken
  const muster = s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  let teile: string[];
  try {
    teile = text.split(new RegExp(`(${muster})`, "gi"));
  } catch {
    return <>{text}</>;
  }

  return (
    <>
      {teile.map((t, i) =>
        t.toLowerCase() === s.toLowerCase() ? <mark key={i} className="treffer">{t}</mark> : <React.Fragment key={i}>{t}</React.Fragment>
      )}
    </>
  );
}
