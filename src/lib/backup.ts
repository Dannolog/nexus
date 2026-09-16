import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import { prisma } from "./prisma";

/**
 * Datensicherung für Nexus – nach demselben Muster wie in ProjectEye und kontor.
 *
 * - Gesichert wird die **ganze Datenbank** mit `pg_dump` (Custom-Format). Damit sind auch
 *   die großen Felder dabei: abgelegte Dokumente, Scans, Vorlagen und Logos.
 * - Zu jeder Sicherung entsteht eine kleine **Begleitdatei** (`.json`) mit Zeitpunkt, Art und
 *   Zeilenzahlen je Tabelle. Sie ist die Grundlage der **Vorschau**: Man sieht vor dem
 *   Wiederherstellen, was in der Sicherung steckt und wie sie sich zum jetzigen Stand verhält –
 *   ohne die Sicherung einzuspielen.
 * - **Aufbewahrung nach Großvater–Vater–Sohn:** die letzten Tage täglich, davor je Woche,
 *   je Monat und je Jahr eine. Von Hand angestoßene Sicherungen bleiben unangetastet.
 * - Vor jeder Wiederherstellung wird automatisch eine **Sicherheitskopie** angelegt.
 */

const ausfuehren = promisify(execFile);

export const BACKUP_DIR = process.env.NEXUS_BACKUP_DIR || path.join(process.cwd(), "backups");
const KONFIG_DATEI = path.join(BACKUP_DIR, "_konfiguration.json");

export type BackupArt = "auto" | "manuell" | "sicherheitskopie";

export type Aufbewahrung = { tage: number; wochen: number; monate: number; jahre: number };
export type BackupKonfig = {
  aktiv: boolean;
  uhrzeit: string;          // "HH:MM" – Zeitpunkt der täglichen Sicherung
  aufbewahrung: Aufbewahrung;
};

export const STANDARD_KONFIG: BackupKonfig = {
  aktiv: true,
  uhrzeit: "03:00",
  aufbewahrung: { tage: 7, wochen: 8, monate: 12, jahre: 5 },
};

export type BackupInfo = {
  name: string;             // Dateiname ohne Endung
  datei: string;            // Dump-Datei
  art: BackupArt;
  zeit: string;             // ISO
  groesse: number;
  zeilen?: Record<string, number>;
  gesamt?: number;
  notiz?: string;
};

/** Tabellen, die in der Übersicht gezählt werden (Reihenfolge = Anzeige). */
const TABELLEN: [string, string][] = [
  ["customer", "Kunden"],
  ["contact", "Kontakte"],
  ["supplier", "Lieferanten"],
  ["organization", "Mandanten"],
  ["employee", "Mitarbeiter"],
  ["identity", "Zugänge"],
  ["project", "Projekte"],
  ["task", "Aufgaben"],
  ["product", "Artikel"],
  ["employmentContract", "Arbeitsverträge"],
  ["employeeDocument", "Dokumente"],
  ["employeeNote", "Notizen"],
  ["documentTemplate", "Vorlagen"],
  ["scanDocument", "Scans"],
  ["revision", "Verlauf"],
];

export const TABELLEN_NAMEN = Object.fromEntries(TABELLEN) as Record<string, string>;

function dbUrl() {
  const url = process.env.DATABASE_URL || process.env.NEXUS_DATABASE_URL;
  if (!url) throw new Error("Keine Datenbank-Adresse konfiguriert (DATABASE_URL).");
  return url;
}

export function ordnerAnlegen() {
  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

export function konfigLesen(): BackupKonfig {
  ordnerAnlegen();
  try {
    const roh = JSON.parse(fs.readFileSync(KONFIG_DATEI, "utf8"));
    return { ...STANDARD_KONFIG, ...roh, aufbewahrung: { ...STANDARD_KONFIG.aufbewahrung, ...(roh.aufbewahrung || {}) } };
  } catch {
    return { ...STANDARD_KONFIG };
  }
}

export function konfigSchreiben(teil: Partial<BackupKonfig>): BackupKonfig {
  const neu = { ...konfigLesen(), ...teil };
  ordnerAnlegen();
  fs.writeFileSync(KONFIG_DATEI, JSON.stringify(neu, null, 2));
  return neu;
}

/** Zeilenzahlen je Tabelle – Grundlage für Vorschau und Vergleich. */
export async function zaehleBestand(): Promise<{ zeilen: Record<string, number>; gesamt: number }> {
  const zeilen: Record<string, number> = {};
  let gesamt = 0;
  for (const [modell] of TABELLEN) {
    try {
      const n = await (prisma as any)[modell].count();
      zeilen[modell] = n;
      gesamt += n;
    } catch {
      /* Tabelle (noch) nicht vorhanden – dann fehlt sie in der Übersicht */
    }
  }
  return { zeilen, gesamt };
}

const zeitstempel = (d = new Date()) =>
  d.toISOString().replace(/[-:]/g, "").replace("T", "_").slice(0, 15);

/** Neue Sicherung anlegen. */
export async function sicherungErstellen(art: BackupArt = "manuell", notiz = ""): Promise<BackupInfo> {
  ordnerAnlegen();
  const name = `${art}_${zeitstempel()}`;
  const datei = path.join(BACKUP_DIR, `${name}.dump`);

  await ausfuehren("pg_dump", [dbUrl(), "-Fc", "-f", datei], { maxBuffer: 1024 * 1024 * 32 });

  const { zeilen, gesamt } = await zaehleBestand();
  const info: BackupInfo = {
    name,
    datei: path.basename(datei),
    art,
    zeit: new Date().toISOString(),
    groesse: fs.statSync(datei).size,
    zeilen,
    gesamt,
    notiz,
  };
  fs.writeFileSync(path.join(BACKUP_DIR, `${name}.json`), JSON.stringify(info, null, 2));
  return info;
}

/** Alle vorhandenen Sicherungen, neueste zuerst. */
export function sicherungenListe(): BackupInfo[] {
  ordnerAnlegen();
  return fs
    .readdirSync(BACKUP_DIR)
    .filter((f) => f.endsWith(".dump"))
    .map((f) => {
      const name = f.replace(/\.dump$/, "");
      const begleit = path.join(BACKUP_DIR, `${name}.json`);
      const stat = fs.statSync(path.join(BACKUP_DIR, f));
      let info: Partial<BackupInfo> = {};
      try { info = JSON.parse(fs.readFileSync(begleit, "utf8")); } catch { /* ältere Sicherung ohne Begleitdatei */ }
      const art = (info.art as BackupArt) || (name.startsWith("manuell") ? "manuell"
        : name.startsWith("sicherheitskopie") ? "sicherheitskopie" : "auto");
      return {
        name,
        datei: f,
        art,
        zeit: info.zeit || stat.mtime.toISOString(),
        groesse: stat.size,
        zeilen: info.zeilen,
        gesamt: info.gesamt,
        notiz: info.notiz || "",
      } as BackupInfo;
    })
    .sort((a, b) => b.zeit.localeCompare(a.zeit));
}

/**
 * Vorschau: Was steckt in der Sicherung, und wie verhält sie sich zum jetzigen Stand?
 * Liest ausschließlich die Begleitdatei und das Inhaltsverzeichnis des Dumps – die
 * Sicherung wird dabei **nicht** eingespielt.
 */
export async function sicherungVorschau(name: string) {
  const info = sicherungenListe().find((b) => b.name === name);
  if (!info) throw new Error("Sicherung nicht gefunden");

  const jetzt = await zaehleBestand();
  const tabellen = TABELLEN.map(([modell, anzeige]) => {
    const inSicherung = info.zeilen?.[modell];
    const heute = jetzt.zeilen[modell] ?? 0;
    return {
      modell,
      name: anzeige,
      inSicherung: inSicherung ?? null,
      jetzt: heute,
      unterschied: inSicherung == null ? null : heute - inSicherung,
    };
  });

  // Inhaltsverzeichnis des Dumps – belegt, dass die Datei lesbar und vollständig ist
  let eintraege = 0;
  let lesbar = true;
  try {
    const { stdout } = await ausfuehren("pg_restore", ["-l", path.join(BACKUP_DIR, info.datei)], { maxBuffer: 1024 * 1024 * 16 });
    eintraege = stdout.split("\n").filter((z) => z && !z.startsWith(";")).length;
  } catch {
    lesbar = false;
  }

  return {
    ...info,
    lesbar,
    eintraege,
    tabellen,
    gesamtJetzt: jetzt.gesamt,
  };
}

/**
 * Wiederherstellen. Legt vorher **immer** eine Sicherheitskopie an und spielt die Sicherung
 * dann vollständig ein (vorhandene Tabellen werden ersetzt).
 */
export async function sicherungWiederherstellen(name: string) {
  const info = sicherungenListe().find((b) => b.name === name);
  if (!info) throw new Error("Sicherung nicht gefunden");

  const vorher = await sicherungErstellen("sicherheitskopie", `automatisch vor dem Einspielen von ${name}`);

  await ausfuehren(
    "pg_restore",
    ["--clean", "--if-exists", "--no-owner", "--no-privileges", "-d", dbUrl(), path.join(BACKUP_DIR, info.datei)],
    { maxBuffer: 1024 * 1024 * 64 }
  ).catch((e: any) => {
    // pg_restore meldet auch bei harmlosen Hinweisen einen Fehlercode – nur echte
    // Abbrüche weiterreichen, alles andere protokollieren.
    const text = String(e?.stderr || e?.message || "");
    if (/FATAL|could not connect|does not exist: database/i.test(text)) throw new Error(`Wiederherstellung fehlgeschlagen: ${text.slice(0, 300)}`);
    console.warn("[backup] Hinweise beim Einspielen:", text.slice(0, 500));
  });

  const danach = await zaehleBestand();
  return { eingespielt: info, sicherheitskopie: vorher, bestand: danach };
}

export function sicherungLoeschen(name: string) {
  const info = sicherungenListe().find((b) => b.name === name);
  if (!info) throw new Error("Sicherung nicht gefunden");
  fs.rmSync(path.join(BACKUP_DIR, info.datei), { force: true });
  fs.rmSync(path.join(BACKUP_DIR, `${name}.json`), { force: true });
  return { ok: true };
}

/**
 * Aufbewahrung nach Großvater–Vater–Sohn: die letzten Tage täglich, davor je Woche,
 * je Monat und je Jahr eine Sicherung. Von Hand angestoßene Sicherungen und
 * Sicherheitskopien bleiben immer erhalten.
 */
export function behaltenswert(liste: BackupInfo[], regel: Aufbewahrung): Set<string> {
  const behalten = new Set<string>();
  const auto = liste.filter((b) => b.art === "auto").sort((a, b) => b.zeit.localeCompare(a.zeit));
  const heute = new Date();

  const schluessel = {
    tag: (d: Date) => d.toISOString().slice(0, 10),
    woche: (d: Date) => {
      const t = new Date(d);
      t.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 6) % 7));   // Montag der Woche
      return t.toISOString().slice(0, 10);
    },
    monat: (d: Date) => d.toISOString().slice(0, 7),
    jahr: (d: Date) => d.toISOString().slice(0, 4),
  };

  const gesehen = { tag: new Set<string>(), woche: new Set<string>(), monat: new Set<string>(), jahr: new Set<string>() };
  const grenze = (n: number, einheit: "tage" | "wochen" | "monate" | "jahre", d: Date) => {
    const alter = (heute.getTime() - d.getTime()) / 86400000;
    const faktor = { tage: 1, wochen: 7, monate: 31, jahre: 366 }[einheit];
    return alter <= n * faktor;
  };

  for (const b of auto) {
    const d = new Date(b.zeit);
    if (grenze(regel.tage, "tage", d) && !gesehen.tag.has(schluessel.tag(d))) {
      gesehen.tag.add(schluessel.tag(d)); behalten.add(b.name); continue;
    }
    if (grenze(regel.wochen, "wochen", d) && !gesehen.woche.has(schluessel.woche(d))) {
      gesehen.woche.add(schluessel.woche(d)); behalten.add(b.name); continue;
    }
    if (grenze(regel.monate, "monate", d) && !gesehen.monat.has(schluessel.monat(d))) {
      gesehen.monat.add(schluessel.monat(d)); behalten.add(b.name); continue;
    }
    if (grenze(regel.jahre, "jahre", d) && !gesehen.jahr.has(schluessel.jahr(d))) {
      gesehen.jahr.add(schluessel.jahr(d)); behalten.add(b.name); continue;
    }
  }
  // Manuelle Sicherungen und Sicherheitskopien nie automatisch entfernen
  for (const b of liste) if (b.art !== "auto") behalten.add(b.name);
  return behalten;
}

/** Ausdünnen nach der Aufbewahrungsregel. Gibt die entfernten Sicherungen zurück. */
export function ausduennen(regel = konfigLesen().aufbewahrung): string[] {
  const liste = sicherungenListe();
  const behalten = behaltenswert(liste, regel);
  const weg = liste.filter((b) => !behalten.has(b.name));
  for (const b of weg) sicherungLoeschen(b.name);
  return weg.map((b) => b.name);
}
