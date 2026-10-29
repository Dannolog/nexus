"use client";
import { useRef, useState } from "react";

/**
 * A–Z-Register am rechten Rand – wie im Telefonbuch des Handys.
 * Tippen oder mit dem Finger über die Leiste fahren springt zum ersten Eintrag des Buchstabens.
 * Ziel sind Elemente mit `data-buchstabe="B"`; es zählt das gerade sichtbare (Tabelle am Rechner,
 * Karten am Handy). Buchstaben ohne Einträge sind blass und springen zum nächsten vorhandenen.
 */
export const ALLE_BUCHSTABEN = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ", "#"];

/** Anfangsbuchstabe eines Textes: Umlaute zählen zum Grundbuchstaben, Ziffern/Zeichen unter „#“. */
export function anfangsBuchstabe(text: unknown): string {
  const z = String(text ?? "").trim().normalize("NFD").replace(/[̀-ͯ]/g, "").charAt(0).toUpperCase();
  return z >= "A" && z <= "Z" ? z : "#";
}

/** Sortiert alphabetisch (deutsch, ohne Groß/Klein), Einträge unter „#“ ans Ende. */
export function vergleicheAZ(a: unknown, b: unknown) {
  const ba = anfangsBuchstabe(a), bb = anfangsBuchstabe(b);
  if ((ba === "#") !== (bb === "#")) return ba === "#" ? 1 : -1;
  return String(a ?? "").trim().localeCompare(String(b ?? "").trim(), "de", { sensitivity: "base", numeric: true });
}

/** Springt zum sichtbaren Abschnitt des Buchstabens – unter den mitlaufenden Seitenkopf. */
export function springeZu(b: string) {
  const ziel = Array.from(document.querySelectorAll<HTMLElement>(`[data-buchstabe="${b}"]`)).find((e) => e.offsetParent !== null);
  if (!ziel) return;
  const kopf = document.querySelector(".rv-sticky-header")?.getBoundingClientRect().bottom ?? 0;
  const leiste = document.querySelector(".topbar")?.getBoundingClientRect().bottom ?? 0;
  ziel.style.scrollMarginTop = `${Math.max(kopf, leiste) + 8}px`;
  ziel.scrollIntoView({ block: "start" });
}

export default function BuchstabenLeiste({ vorhanden }: { vorhanden: string[] }) {
  const [aktiv, setAktiv] = useState<string | null>(null);
  const zuletzt = useRef<string | null>(null);
  const da = new Set(vorhanden);

  const waehle = (b: string | null) => {
    if (!b || b === zuletzt.current) return;
    zuletzt.current = b;
    // Ohne Einträge: zum nächsten vorhandenen Buchstaben weiter
    const ab = ALLE_BUCHSTABEN.indexOf(b);
    const ziel = ALLE_BUCHSTABEN.slice(ab).find((x) => da.has(x)) ?? [...ALLE_BUCHSTABEN.slice(0, ab)].reverse().find((x) => da.has(x));
    if (!ziel) return;
    setAktiv(b);
    springeZu(ziel);
    try { navigator.vibrate?.(4); } catch { /* egal */ }
  };
  const unterFinger = (x: number, y: number) => (document.elementFromPoint(x, y) as HTMLElement | null)?.closest<HTMLElement>("[data-register]")?.dataset.register ?? null;

  if (vorhanden.length < 2) return null;
  return (
    <>
      <nav className="az-leiste" aria-label="Zum Buchstaben springen"
        onPointerDown={(e) => { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); zuletzt.current = null; waehle(unterFinger(e.clientX, e.clientY)); }}
        onPointerMove={(e) => { if (e.buttons || e.pointerType === "touch") waehle(unterFinger(e.clientX, e.clientY)); }}
        onPointerUp={() => { zuletzt.current = null; setTimeout(() => setAktiv(null), 350); }}
        onPointerCancel={() => { zuletzt.current = null; setAktiv(null); }}>
        {ALLE_BUCHSTABEN.map((b) => (
          <span key={b} data-register={b} className={da.has(b) ? "da" : undefined}>{b}</span>
        ))}
      </nav>
      {aktiv && <div className="az-blase" aria-hidden>{aktiv}</div>}
    </>
  );
}
