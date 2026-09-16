/**
 * Automatische Datensicherung von Nexus (für den Zeitplan des Servers).
 *
 * Läuft z. B. stündlich per Cron und legt eine Sicherung an, **wenn** die eingestellte
 * Uhrzeit erreicht ist und an diesem Tag noch keine automatische Sicherung existiert.
 * Danach wird nach Großvater–Vater–Sohn ausgedünnt (siehe src/lib/backup.ts).
 *
 * Aufruf:  node scripts/backup-auto.js [--jetzt]
 *   --jetzt  ignoriert Uhrzeit und Tagesprüfung (z. B. für einen Testlauf)
 */
const path = require("path");
const { execFileSync } = require("child_process");

const NEXUS = path.resolve(__dirname, "..");

// Der Zeitplan startet in einem beliebigen Verzeichnis – der Ablageort der Sicherungen
// hängt sonst am Arbeitsverzeichnis (siehe BACKUP_DIR in src/lib/backup.ts).
process.env.NEXUS_BACKUP_DIR = process.env.NEXUS_BACKUP_DIR || path.join(NEXUS, "backups");

// Im Zeitplan des Servers ist die .env nicht geladen – die Datenbank-Adresse hier
// nachziehen (der Wert wird nur gesetzt, nie ausgegeben).
if (!process.env.DATABASE_URL) {
  try {
    const zeile = require("fs").readFileSync(path.join(NEXUS, ".env"), "utf8")
      .split("\n").find((z) => z.startsWith("DATABASE_URL="));
    if (zeile) process.env.DATABASE_URL = zeile.slice("DATABASE_URL=".length).trim().replace(/^["']|["']$/g, "");
  } catch { /* ohne .env greift die Umgebung */ }
}
const OPT = '{"module":"CommonJS","moduleResolution":"node"}';

// Die Backup-Logik liegt in TypeScript – über ts-node aufrufen, damit es nur eine Fassung gibt.
const skript = `
const { konfigLesen, sicherungenListe, sicherungErstellen, ausduennen } = require("${NEXUS}/src/lib/backup.ts");
(async () => {
  const cfg = konfigLesen();
  const jetzt = new Date();
  const erzwingen = process.argv.includes("--jetzt");
  if (!cfg.aktiv && !erzwingen) { console.log("Automatische Sicherung ist ausgeschaltet."); return; }

  const [h, m] = String(cfg.uhrzeit || "03:00").split(":").map(Number);
  const faellig = jetzt.getHours() > h || (jetzt.getHours() === h && jetzt.getMinutes() >= m);
  const heute = jetzt.toISOString().slice(0, 10);
  const schonHeute = sicherungenListe().some((b) => b.art === "auto" && b.zeit.slice(0, 10) === heute);

  if (!erzwingen && (!faellig || schonHeute)) {
    console.log(schonHeute ? "Heute bereits gesichert." : "Noch nicht fällig.");
    return;
  }
  const info = await sicherungErstellen("auto");
  const weg = ausduennen(cfg.aufbewahrung);
  console.log(\`Sicherung \${info.name} angelegt (\${Math.round(info.groesse / 1024)} KB, \${info.gesamt} Datensätze)\`);
  if (weg.length) console.log(\`Ausgedünnt: \${weg.length} ältere Sicherung(en)\`);
})().catch((e) => { console.error("Fehler:", e.message); process.exit(1); });
`;

const datei = path.join(NEXUS, "scripts", ".backup-lauf.ts");
require("fs").writeFileSync(datei, skript);
try {
  execFileSync("node", [
    path.join(NEXUS, "node_modules/ts-node/dist/bin.js"),
    "--compiler-options", OPT, datei, ...process.argv.slice(2),
  ], { cwd: NEXUS, stdio: "inherit", env: { ...process.env, TS_NODE_TRANSPILE_ONLY: "1" } });
} finally {
  require("fs").rmSync(datei, { force: true });
}
