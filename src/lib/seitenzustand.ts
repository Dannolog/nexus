"use client";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Zustand einer Seite (Suchbegriff, Filter, Ansicht) festhalten.
 *
 * Wer etwas sucht, dann einen Datensatz öffnet und zurückkommt, soll die Liste **so
 * wiederfinden, wie er sie verlassen hat**. Dafür wandert der Zustand an zwei Stellen:
 *
 * 1. in die **Adresszeile** (`?q=…&art=…`) – dadurch bringt der Zurück-Knopf des Browsers
 *    ihn von selbst mit, und die Ansicht lässt sich weitergeben;
 * 2. in den **Sitzungsspeicher** – dadurch steht er auch beim Wechsel über das Menü wieder da.
 *
 * Geschrieben wird mit `replaceState`, damit der Verlauf nicht mit Zwischenständen volläuft.
 */
export function useSeitenZustand<T extends Record<string, string | boolean>>(
  schluessel: string,
  start: T
): [T, (teil: Partial<T>) => void] {
  const merkerSchluessel = `nexus-seite:${schluessel}`;

  const [zustand, setZustand] = useState<T>(() => {
    if (typeof window === "undefined") return start;
    const werte: Record<string, any> = { ...start };

    // Zuerst der gemerkte Stand …
    try {
      const roh = sessionStorage.getItem(merkerSchluessel);
      if (roh) Object.assign(werte, JSON.parse(roh));
    } catch { /* beschädigter Eintrag – dann gilt die Vorgabe */ }

    // … dann die Adresszeile, sie hat Vorrang (geteilter Link, Zurück-Knopf)
    const p = new URLSearchParams(window.location.search);
    for (const feld of Object.keys(start)) {
      const wert = p.get(feld);
      if (wert == null) continue;
      werte[feld] = typeof start[feld] === "boolean" ? wert === "1" : wert;
    }
    return werte as T;
  });

  const ersterLauf = useRef(true);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try { sessionStorage.setItem(merkerSchluessel, JSON.stringify(zustand)); } catch { /* voller Speicher */ }

    // Adresszeile nachführen – nur Werte, die von der Vorgabe abweichen
    const p = new URLSearchParams(window.location.search);
    for (const [feld, vorgabe] of Object.entries(start)) {
      const wert = (zustand as any)[feld];
      const leer = wert === "" || wert === vorgabe || wert === false;
      if (leer) p.delete(feld);
      else p.set(feld, typeof wert === "boolean" ? "1" : String(wert));
    }
    const neu = `${window.location.pathname}${p.toString() ? `?${p}` : ""}`;
    if (neu !== window.location.pathname + window.location.search) {
      window.history.replaceState(window.history.state, "", neu);
    }
    ersterLauf.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zustand]);

  const setzen = useCallback((teil: Partial<T>) => setZustand((z) => ({ ...z, ...teil })), []);
  return [zustand, setzen];
}
