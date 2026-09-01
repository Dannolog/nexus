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
 * Passwort-Erzeugung liegt in `@/lib/passwort` (dort auch serverseitig nutzbar);
 * hier nur weitergereicht, damit bestehende Importe weiter funktionieren.
 */
export { erzeugePasswort } from "@/lib/passwort";
