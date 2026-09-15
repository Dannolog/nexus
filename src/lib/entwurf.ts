"use client";

/**
 * Entwürfe offener Formulare – damit nichts verloren geht, wenn die Sitzung abläuft,
 * der Browser zufällt oder versehentlich weggeklickt wird.
 *
 * Die Daten liegen lokal im Browser (localStorage), nie auf dem Server. Sie werden
 * gelöscht, sobald der Datensatz gespeichert oder der Entwurf verworfen wurde.
 */

const PRAEFIX = "nexus-entwurf:";

export function entwurfSpeichern(schluessel: string, daten: unknown) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(PRAEFIX + schluessel, JSON.stringify({ zeit: Date.now(), daten }));
  } catch {
    /* voller Speicher o. Ä. – ein fehlender Entwurf darf die Arbeit nicht stören */
  }
}

/** Entwurf lesen; `maxAlterStunden` verwirft alte Reste automatisch. */
export function entwurfLesen<T = any>(schluessel: string, maxAlterStunden = 72): { daten: T; zeit: number } | null {
  if (typeof window === "undefined") return null;
  try {
    const roh = localStorage.getItem(PRAEFIX + schluessel);
    if (!roh) return null;
    const eintrag = JSON.parse(roh);
    if (!eintrag?.zeit || Date.now() - eintrag.zeit > maxAlterStunden * 3600_000) {
      localStorage.removeItem(PRAEFIX + schluessel);
      return null;
    }
    return eintrag;
  } catch {
    return null;
  }
}

export function entwurfLoeschen(schluessel: string) {
  if (typeof window === "undefined") return;
  try { localStorage.removeItem(PRAEFIX + schluessel); } catch { /* egal */ }
}

/** Wie lange ist das her? Für den Hinweis „vor 5 Minuten begonnen". */
export function seitdem(zeit: number) {
  const min = Math.round((Date.now() - zeit) / 60000);
  if (min < 1) return "gerade eben";
  if (min < 60) return `vor ${min} Minute${min === 1 ? "" : "n"}`;
  const std = Math.round(min / 60);
  if (std < 24) return `vor ${std} Stunde${std === 1 ? "" : "n"}`;
  const tage = Math.round(std / 24);
  return `vor ${tage} Tag${tage === 1 ? "" : "en"}`;
}
