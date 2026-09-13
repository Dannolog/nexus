"use client";
import React from "react";

/**
 * Hebt den gefundenen Text hervor – überall dort einsetzbar, wo eine Suche Treffer
 * anzeigt (Listen, Karten, Detailfenster). Sucht ohne Rücksicht auf Groß-/Kleinschreibung
 * und markiert **alle** Vorkommen.
 *
 * Mehrere durch Leerzeichen getrennte Begriffe werden **einzeln** markiert – passend zur
 * Mehrfachsuche, bei der ein Treffer alle Begriffe enthalten muss („maier einkauf").
 * In Anführungszeichen gesetzte Wortgruppen bleiben zusammen ("hans maier").
 */

/** Zerlegt die Eingabe in Begriffe; "…" hält eine Wortgruppe zusammen. */
export function sucheBegriffe(suche?: string): string[] {
  const roh = String(suche || "").trim();
  if (!roh) return [];
  const treffer = roh.match(/"[^"]+"|\S+/g) || [];
  return treffer.map((t) => t.replace(/^"|"$/g, "").trim()).filter(Boolean);
}
export default function Hervorheben({
  text,
  suche,
}: {
  text: React.ReactNode;
  suche?: string;
}) {
  const begriffe = sucheBegriffe(suche);
  if (begriffe.length === 0 || typeof text !== "string" || !text) return <>{text}</>;

  // Sonderzeichen entschärfen, damit sie nicht als Regex wirken; längste Begriffe zuerst,
  // damit bei Überschneidungen der vollständigere Treffer markiert wird.
  const muster = begriffe
    .slice()
    .sort((a, b) => b.length - a.length)
    .map((b) => b.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");
  let teile: string[];
  try {
    teile = text.split(new RegExp(`(${muster})`, "gi"));
  } catch {
    return <>{text}</>;
  }

  const klein = begriffe.map((b) => b.toLowerCase());
  return (
    <>
      {teile.map((t, i) =>
        klein.includes(t.toLowerCase()) ? <mark key={i} className="treffer">{t}</mark> : <React.Fragment key={i}>{t}</React.Fragment>
      )}
    </>
  );
}
