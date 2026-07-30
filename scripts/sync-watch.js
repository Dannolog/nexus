/**
 * Sofort-Abgleich: startet die Sync-Skripte, sobald sich irgendwo etwas ändert.
 *
 * Quellen:
 *   - Postgres-Signal „nexus_sync" aus der **clocker**-Datenbank (Trigger auf
 *     User/Client/Project/Company)
 *   - Postgres-Signal „nexus_sync" aus der **Nexus**-Datenbank (Employee/Customer/
 *     Project/Organization/Supplier) → schiebt Änderungen in die Gegenrichtung
 *   - Dateiänderung an **ProjectEye** (server/data/projecteye.json) → Lieferanten
 *
 * Die Trigger senden nur ein Signal, sie ändern keine Daten.
 *
 * Sammelfenster: Nach dem ersten Signal wird kurz gewartet (SAMMELZEIT), damit eine
 * Folge von Änderungen zu einem Lauf zusammengefasst wird. Während ein Abgleich läuft,
 * eintreffende Signale merken sich einen Nachlauf – so geht keine Änderung verloren.
 */
const { Client } = require("pg");
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const NEXUS = "/mnt/devip3/nexus";
const CLOCKER_URL = process.env.CLOCKER_DATABASE_URL || "postgresql://clocker:clocker_pw@localhost:5432/clocker";
const NEXUS_URL = process.env.NEXUS_DATABASE_URL || "postgresql://clocker:clocker_pw@localhost:5432/nexus";
const PE_DATEI = process.env.PROJECTEYE_DATA || "/mnt/devip3/ProjectEye/server/data/projecteye.json";
const SAMMELZEIT = Number(process.env.SYNC_SAMMELZEIT_MS || 4000);
const RUHE = Number(process.env.SYNC_MIN_ABSTAND_MS || 15000); // Mindestabstand zwischen zwei Läufen derselben Art

const log = (...a) => console.log(new Date().toLocaleString("de-DE"), "·", ...a);

const SKRIPTE = {
  clocker: ["prisma/sync-clocker-employees.ts", "prisma/sync-clocker-stammdaten.ts"],
  projecteye: ["prisma/sync-projecteye-suppliers.ts"],
};

const zustand = {
  clocker: { timer: null, laeuft: false, nachlauf: false, zuletzt: 0 },
  projecteye: { timer: null, laeuft: false, nachlauf: false, zuletzt: 0 },
};

function fuehreAus(art) {
  const z = zustand[art];
  if (z.laeuft) { z.nachlauf = true; return; }
  const wartezeit = Math.max(0, RUHE - (Date.now() - z.zuletzt));
  if (wartezeit > 0) { planen(art, wartezeit); return; }

  z.laeuft = true;
  const skripte = [...SKRIPTE[art]];
  const naechstes = () => {
    const s = skripte.shift();
    if (!s) {
      z.laeuft = false;
      z.zuletzt = Date.now();
      if (z.nachlauf) { z.nachlauf = false; planen(art, SAMMELZEIT); }
      return;
    }
    log(`▶ ${art}: ${path.basename(s)}`);
    const p = spawn("node", [
      "node_modules/ts-node/dist/bin.js",
      "--compiler-options", '{"module":"CommonJS","moduleResolution":"node"}',
      s,
    ], { cwd: NEXUS, env: { ...process.env, TS_NODE_TRANSPILE_ONLY: "1" } });
    let letzte = "";
    p.stdout.on("data", (d) => { letzte += d.toString(); });
    p.stderr.on("data", (d) => process.stderr.write(d));
    p.on("close", (code) => {
      // nur die Ergebniszeilen protokollieren, nicht jede Ausgabe
      letzte.split("\n").filter((l) => /neu|ergänzt|Bestand|Felder aktualisiert|angelegt/i.test(l)).forEach((l) => log("   " + l.trim()));
      if (code !== 0) log(`   ! ${path.basename(s)} endete mit Code ${code}`);
      naechstes();
    });
  };
  naechstes();
}

function planen(art, ms = SAMMELZEIT) {
  const z = zustand[art];
  if (z.timer) clearTimeout(z.timer);
  z.timer = setTimeout(() => { z.timer = null; fuehreAus(art); }, ms);
}

/** Auf Postgres-Signale hören; bei Verbindungsverlust automatisch neu verbinden. */
function hoeren(name, url, art) {
  let c;
  const verbinden = () => {
    c = new Client({ connectionString: url });
    c.on("notification", (n) => {
      log(`Signal aus ${name}: ${n.payload || "(ohne Angabe)"} → Abgleich geplant`);
      planen(art);
    });
    c.on("error", (e) => { log(`! Verbindung ${name}: ${e.message} – neuer Versuch in 10 s`); try { c.end(); } catch {} setTimeout(verbinden, 10000); });
    c.connect()
      .then(() => c.query("LISTEN nexus_sync"))
      .then(() => log(`horcht auf ${name}`))
      .catch((e) => { log(`! ${name} nicht erreichbar: ${e.message} – neuer Versuch in 10 s`); setTimeout(verbinden, 10000); });
  };
  verbinden();
}

// clocker-Änderungen → clocker-Abgleiche; Nexus-Änderungen → ebenfalls (Gegenrichtung)
hoeren("clocker", CLOCKER_URL, "clocker");
hoeren("nexus", NEXUS_URL, "clocker");

// ProjectEye speichert in einer JSON-Datei → Dateiänderung beobachten
try {
  fs.watch(path.dirname(PE_DATEI), (_ereignis, datei) => {
    if (datei && datei.startsWith(path.basename(PE_DATEI))) {
      log("ProjectEye-Daten geändert → Lieferanten-Abgleich geplant");
      planen("projecteye");
    }
  });
  log("beobachtet ProjectEye:", PE_DATEI);
} catch (e) {
  log("! ProjectEye-Datei nicht beobachtbar:", e.message);
}

log("Sofort-Abgleich aktiv (Sammelfenster", SAMMELZEIT + " ms, Mindestabstand", RUHE + " ms)");
process.on("SIGTERM", () => { log("beendet"); process.exit(0); });
