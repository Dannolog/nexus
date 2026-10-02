import crypto from "crypto";

/**
 * Digitale Unterschrift von Arbeitsverträgen (Arbeitgeber + Arbeitnehmer).
 *
 * Sobald eine Unterschrift vorliegt, ist der **Vertragsinhalt gesperrt** – sonst könnte
 * nachträglich etwas anderes im Vertrag stehen als das, was unterschrieben wurde.
 * Änderbar bleiben nur Verwaltungsfelder (Status, Archiv, Vertragsname). Wer den Inhalt
 * ändern will, setzt die Unterschriften zurück und lässt neu unterschreiben.
 */

/** Felder, die auch nach dem Unterschreiben geändert werden dürfen. */
export const NACH_UNTERSCHRIFT_FREI = new Set(["status", "archived", "title"]);

/** Felder, die nicht zum Vertragsinhalt zählen. */
const KEIN_INHALT = new Set([
  "id", "number", "version", "createdAt", "updatedAt", "deletedAt",
  "signEmployerImage", "signEmployerName", "signEmployerAt",
  "signEmployeeImage", "signEmployeeName", "signEmployeeAt", "signHash",
  ...NACH_UNTERSCHRIFT_FREI,
]);

const norm = (v: unknown) => (v instanceof Date ? v.toISOString() : v ?? null);

export function istUnterschrieben(c: any) {
  return !!(c?.signEmployerImage || c?.signEmployeeImage);
}

/** Prüfsumme über den Vertragsinhalt – belegt, welcher Stand unterschrieben wurde. */
export function inhaltsHash(c: Record<string, unknown>) {
  const teile = Object.keys(c).filter((k) => !KEIN_INHALT.has(k)).sort().map((k) => [k, norm(c[k])]);
  return crypto.createHash("sha256").update(JSON.stringify(teile)).digest("hex");
}

/** Welche Inhaltsfelder würde diese Änderung tatsächlich verändern? */
export function geaenderteInhaltsfelder(current: Record<string, unknown>, neu: Record<string, unknown>) {
  return Object.keys(neu).filter((k) => {
    if (KEIN_INHALT.has(k) || !(k in current)) return false;
    let a: unknown = norm(current[k]);
    let b: unknown = neu[k] ?? null;
    if (current[k] instanceof Date && b) b = new Date(String(b)).toISOString();
    return JSON.stringify(a) !== JSON.stringify(b);
  });
}
