import crypto from "crypto";

/**
 * Ver-/Entschlüsselung für Werte, die zurückgelesen werden müssen (AES-256-GCM).
 *
 * Verwendung in Nexus: das vom Admin vergebene Anmeldepasswort einer Identität, damit es
 * an den Mitarbeiter weitergegeben werden kann. Die Anmeldung selbst prüft weiterhin
 * ausschließlich gegen den bcrypt-Hash – dieser Wert ist nur die Weitergabe-Kopie.
 *
 * Schlüssel: `IDENTITY_SECRET_KEY` aus der Umgebung; fehlt er, wird er aus `JWT_SECRET`
 * abgeleitet (scrypt). Der Schlüssel selbst wird nirgends ausgegeben oder protokolliert.
 */
function schluessel(): Buffer {
  const roh = process.env.IDENTITY_SECRET_KEY || process.env.JWT_SECRET || "";
  if (!roh) throw new Error("Kein Schlüssel gesetzt (IDENTITY_SECRET_KEY oder JWT_SECRET)");
  return crypto.scryptSync(roh, "nexus-identity-v1", 32);
}

/** Klartext → "v1:<iv>:<tag>:<daten>" (alles base64). Leerer Text → leeres Ergebnis. */
export function verschluessle(klartext: string): string {
  const text = String(klartext ?? "");
  if (!text) return "";
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", schluessel(), iv);
  const daten = Buffer.concat([c.update(text, "utf8"), c.final()]);
  return ["v1", iv.toString("base64"), c.getAuthTag().toString("base64"), daten.toString("base64")].join(":");
}

/** Gegenstück zu `verschluessle`. Gibt bei ungültigen Daten einen leeren Text zurück. */
export function entschluessle(gespeichert: string): string {
  const wert = String(gespeichert ?? "");
  if (!wert.startsWith("v1:")) return "";
  try {
    const [, ivB, tagB, datenB] = wert.split(":");
    const d = crypto.createDecipheriv("aes-256-gcm", schluessel(), Buffer.from(ivB, "base64"));
    d.setAuthTag(Buffer.from(tagB, "base64"));
    return Buffer.concat([d.update(Buffer.from(datenB, "base64")), d.final()]).toString("utf8");
  } catch {
    return "";
  }
}
