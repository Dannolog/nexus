/**
 * Erzeugung sicherer Anmeldepasswörter (Nexus vergibt die Zugänge zentral für alle Apps).
 *
 * Läuft sowohl im Browser als auch auf dem Server – benutzt nur `globalThis.crypto`.
 * Der erzeugte Wert wird hier nur zurückgegeben; gespeichert wird er als bcrypt-Hash
 * plus AES-256-GCM-Kopie (siehe `src/lib/geheimnis.ts`).
 */

/** Ohne leicht verwechselbare Zeichen: 0/O, 1/l/I entfallen. */
const KLEIN = "abcdefghijkmnpqrstuvwxyz";
const GROSS = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const ZIFFER = "23456789";
/** Zusatzzeichen zwischen den Blöcken – bewusst ohne Zeichen, die in URLs/Shell stören. */
const SONDER = "!#$%&*+-=?@";

const BUCHSTABEN = KLEIN + GROSS + ZIFFER;

/** Gleichverteilte Zufallszahl 0…max-1 (ohne Modulo-Schieflage). */
function zufall(max: number): number {
  const grenze = Math.floor(0x100000000 / max) * max;
  const puffer = new Uint32Array(1);
  let wert = 0;
  do {
    globalThis.crypto.getRandomValues(puffer);
    wert = puffer[0];
  } while (wert >= grenze);
  return wert % max;
}

const waehle = (pool: string) => pool[zufall(pool.length)];

/**
 * Erzeugt ein zufälliges, gut vorlesbares Passwort in Blöcken, getrennt durch
 * Zusatzzeichen – z. B. `hRt7#pQ4m-3Xvb@n8Ka`.
 *
 * Enthält garantiert Klein-, Großbuchstaben, Ziffern und Zusatzzeichen.
 * Voreinstellung: 4 Blöcke à 4 Zeichen = 19 Zeichen.
 */
export function erzeugePasswort(bloecke = 4, laenge = 4): string {
  for (let versuch = 0; versuch < 30; versuch++) {
    const teile: string[] = [];
    for (let b = 0; b < bloecke; b++) {
      let t = "";
      for (let i = 0; i < laenge; i++) t += waehle(BUCHSTABEN);
      teile.push(t);
    }
    // Zwischen je zwei Blöcken ein eigenes Zusatzzeichen
    let pw = teile[0];
    for (let b = 1; b < teile.length; b++) pw += waehle(SONDER) + teile[b];

    const hatAlle =
      [...pw].some((c) => KLEIN.includes(c)) &&
      [...pw].some((c) => GROSS.includes(c)) &&
      [...pw].some((c) => ZIFFER.includes(c)) &&
      [...pw].some((c) => SONDER.includes(c));
    if (hatAlle) return pw;
  }
  // Rückfall (praktisch unerreichbar): feste Mischung erzwingen
  return waehle(GROSS) + waehle(KLEIN) + waehle(ZIFFER) + waehle(SONDER) + waehle(KLEIN) + waehle(ZIFFER);
}
