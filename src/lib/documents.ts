import { PDFDocument } from "pdf-lib";

// ── Dokumentenablage: Helfer für Vorlagen und abgelegte Dokumente ──

/** Aus einem Namen einen dateinamentauglichen Baustein machen. */
export function slug(s: string, fallback = "Dokument") {
  const out = String(s || "")
    .replace(/[äÄöÖüÜß]/g, (c) => ({ ä: "ae", Ä: "Ae", ö: "oe", Ö: "Oe", ü: "ue", Ü: "Ue", ß: "ss" }[c] || c))
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return out || fallback;
}

/**
 * Dateiname nach Vorgabe: Firma, Mitarbeiter-Kennung, Dokument, Zeitstempel und Version.
 * Beispiel: BaierMaschinen_MA-0007_Personalfragebogen-Minijob_2026-07-29_0940_v2.pdf
 */
export function bauDateiname(opts: {
  orgName: string;
  employeeKey: string;   // Personalnummer, sonst Kurz-ID
  docKey: string;
  version: number;
  when?: Date;
  ext?: string;
}) {
  const d = opts.when ?? new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  const stempel = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
  const teile = [slug(opts.orgName, "Firma"), slug(opts.employeeKey, "Mitarbeiter"), slug(opts.docKey), stempel, `v${opts.version}`];
  return teile.join("_") + (opts.ext ?? ".pdf");
}

/** Liest die Formularfeldnamen einer PDF-Vorlage aus (für die Zuordnung in der UI). */
export async function leseFormularfelder(pdf: Buffer | Uint8Array) {
  try {
    const doc = await PDFDocument.load(pdf, { ignoreEncryption: true });
    const form = doc.getForm();
    return form.getFields().map((f) => ({ name: f.getName(), type: f.constructor.name }));
  } catch {
    return [];
  }
}

export type FuellDaten = Record<string, string>;

/**
 * Füllt die Textfelder einer PDF-Vorlage. Felder, die es im PDF nicht gibt, werden
 * übersprungen; das Formular bleibt danach weiter ausfüllbar (nicht „flach gedrückt"),
 * damit der Mitarbeiter den Rest am Rechner oder handschriftlich ergänzen kann.
 */
export async function fuelleFormular(pdf: Buffer | Uint8Array, daten: FuellDaten) {
  const doc = await PDFDocument.load(pdf, { ignoreEncryption: true });
  const form = doc.getForm();
  let gefuellt = 0;
  for (const [feld, wert] of Object.entries(daten)) {
    if (!wert) continue;
    try {
      const f = form.getTextField(feld);
      f.setText(String(wert));
      gefuellt++;
    } catch {
      /* Feld fehlt oder ist kein Textfeld → überspringen */
    }
  }
  try {
    form.updateFieldAppearances();
  } catch { /* Aussehen bleibt wie in der Vorlage */ }
  const bytes = await doc.save({ updateFieldAppearances: false });
  return { bytes: Buffer.from(bytes), gefuellt };
}

/**
 * Standard-Zuordnung für den Personalfragebogen (Minijob). Schlüssel = PDF-Feldname,
 * Wert = Platzhalter, der aus den Nexus-Daten ersetzt wird.
 * Bewusst NUR Stammdaten – Bankverbindung, Steuer-ID und Sozialversicherungsnummer
 * trägt der Mitarbeiter selbst ein, die hält Nexus nicht vor.
 */
export const STANDARD_FELDZUORDNUNG: Record<string, string> = {
  "Vorname (Minijob)": "{vorname}",
  "Nachname (Minijob)": "{nachname}",
  "Geburtsdatum (Minijob)": "{geburtsdatum}",
  "Straße und Hausnummer (Minijob)": "{strasse}",
  "Postleitzahl (Minijob)": "{plz}",
  "Ort (Minijob)": "{ort}",
  "E-Mail-Adresse (Minijob)": "{email}",
  "Telefonnummer (Minijob)": "{telefon}",
  "Staatsangehrigkeit (Minijob)": "{staatsangehoerigkeit}",
  "Name des Arbeitnehmers": "{nachname}",
  "Vorname des Arbeitnehmers": "{vorname}",
  "Name des Arbeitgebers": "{firma}",
  "Arbeitgeber 1 (Minijob)": "{firma}",
};

/** Ersetzt die Platzhalter einer Zuordnung durch die konkreten Werte. */
export function loesePlatzhalter(zuordnung: Record<string, string>, werte: Record<string, string>): FuellDaten {
  const out: FuellDaten = {};
  for (const [feld, muster] of Object.entries(zuordnung)) {
    const wert = String(muster).replace(/\{(\w+)\}/g, (_, k) => werte[k] ?? "");
    if (wert.trim()) out[feld] = wert;
  }
  return out;
}

/** Zerlegt „Max Mustermann" in Vor- und Nachname (letzter Bestandteil = Nachname). */
export function teileName(name: string) {
  const teile = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (teile.length === 0) return { vorname: "", nachname: "" };
  if (teile.length === 1) return { vorname: "", nachname: teile[0] };
  return { vorname: teile.slice(0, -1).join(" "), nachname: teile[teile.length - 1] };
}

/** Baut die Werte für die Platzhalter aus Mitarbeiter + Mandant. */
export function werteAusMitarbeiter(emp: any, org: any | null): Record<string, string> {
  const { vorname, nachname } = teileName(emp?.name);
  const geb = emp?.birthDate ? new Date(emp.birthDate) : null;
  return {
    vorname,
    nachname,
    name: emp?.name || "",
    personalnummer: emp?.employeeNumber || "",
    email: emp?.email || "",
    telefon: emp?.phone || "",
    strasse: emp?.street || "",
    plz: emp?.zip || "",
    ort: emp?.city || "",
    staatsangehoerigkeit: emp?.nationality || "",
    geburtsdatum: geb && !isNaN(geb.getTime())
      ? geb.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })
      : "",
    firma: org?.name || "",
    firmaStrasse: org?.street || "",
    firmaOrt: [org?.zip, org?.city].filter(Boolean).join(" "),
  };
}
