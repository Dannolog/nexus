// nexus-watcher: pusht bei jeder Änderung automatisch nach GitHub (debounced).
// Läuft als PM2-Prozess. Ruft git-save.sh auf, das nur bei echten Änderungen committet+pusht.
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = "/mnt/devip3/nexus";
const WATCH_DIRS = ["src", "prisma", "public", "deploy", "scripts"];
const IGNORE_ROOT = new Set(["node_modules", ".next", ".git", "backups"]);
const DEBOUNCE_MS = 30000; // 30s nach der letzten Änderung sammeln, dann pushen

let timer = null;
let running = false;

function save() {
  if (running) { trigger(); return; } // läuft noch → später erneut
  running = true;
  const p = spawn("bash", [path.join(ROOT, "git-save.sh"), "Auto-Save (watch)"], { cwd: ROOT });
  p.stdout.on("data", (d) => process.stdout.write(d));
  p.stderr.on("data", (d) => process.stderr.write(d));
  p.on("close", () => { running = false; });
}

function trigger() {
  if (timer) clearTimeout(timer);
  timer = setTimeout(save, DEBOUNCE_MS);
}

for (const d of WATCH_DIRS) {
  const full = path.join(ROOT, d);
  if (!fs.existsSync(full)) continue;
  try { fs.watch(full, { recursive: true }, () => trigger()); } catch (e) { console.error("watch", d, e.message); }
}
// Root-Ebene (package.json, configs) ohne node_modules/.next/.git/backups
fs.watch(ROOT, {}, (_e, f) => { if (f && !IGNORE_ROOT.has(f)) trigger(); });

console.log("nexus-watcher läuft — Auto-Push bei Änderung (Debounce 30s).");
