"use client";

/**
 * Text in die Zwischenablage legen.
 * `navigator.clipboard` gibt es nur im sicheren Kontext (https) – über
 * `http://192.168.1.10:3050` greift deshalb der Fallback.
 */
export async function kopiere(text: string): Promise<boolean> {
  const s = String(text ?? "");
  if (!s) return false;
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(s);
      return true;
    }
  } catch {
    /* Fallback unten */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = s;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

/**
 * Erzeugt ein zufälliges, gut vorlesbares Passwort.
 * Ohne leicht verwechselbare Zeichen (0/O, 1/l/I) und in Blöcken gruppiert.
 */
export function erzeugePasswort(bloecke = 3, laenge = 4): string {
  const zeichen = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const werte = new Uint32Array(bloecke * laenge);
  crypto.getRandomValues(werte);
  const teile: string[] = [];
  for (let b = 0; b < bloecke; b++) {
    let t = "";
    for (let i = 0; i < laenge; i++) t += zeichen[werte[b * laenge + i] % zeichen.length];
    teile.push(t);
  }
  return teile.join("-");
}
