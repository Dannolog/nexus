/**
 * Einheitliche E-Mail-Domäne für alle Benutzer – in Nexus, clocker und kontor.
 *
 * Erzeugt je Person eine Adresse `vorname.nachname@<Domäne>` (Standard: bgroup.de),
 * Umlaute umgeschrieben, Namensdopplungen mit angehängter Zahl.
 *
 * WICHTIG: Die E-Mail ist in allen drei Apps der **Anmelde-Schlüssel**. Nach der
 * Umstellung melden sich die Mitarbeiter mit der neuen Adresse an (Passwörter bleiben).
 * Deshalb läuft das Skript standardmäßig nur als **Vorschau**; geschrieben wird erst
 * mit `--anwenden`.
 *
 * Technische Konten (Dienst-Logins, z. B. *@nexus.local) bleiben unangetastet.
 *
 * Die vollständige Zuordnung alt → neu wird in eine lokale Datei geschrieben
 * (`data/mail-domain-<Zeitstempel>.json`) – als Nachweis und für den Rückbau.
 * In der Konsole erscheinen nur Zahlen, keine Namen oder Adressen.
 *
 * Aufruf:
 *   TS_NODE_TRANSPILE_ONLY=1 node node_modules/ts-node/dist/bin.js \
 *     --compiler-options '{"module":"CommonJS","moduleResolution":"node"}' \
 *     prisma/setze-mail-domain.ts [--domain bgroup.de] [--anwenden] [--zurueck <datei>]
 */
import fs from "fs";
import path from "path";
import { Client as PgClient } from "pg";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const clocker = new PgClient({ connectionString: process.env.CLOCKER_DATABASE_URL || "postgresql://clocker:clocker_pw@localhost:5432/clocker" });
const kontor = new PgClient({ connectionString: process.env.KONTOR_DATABASE_URL || "postgresql://clocker:clocker_pw@localhost:5432/kontor" });

const arg = (name: string, standard = "") => {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : standard;
};
const DOMAENE = (arg("--domain", "bgroup.de") || "bgroup.de").replace(/^@/, "");
const ANWENDEN = process.argv.includes("--anwenden");
const ZURUECK = arg("--zurueck");
/** Dienst-/Systemkonten bleiben unberührt. */
const AUSNAHMEN = /@(nexus\.local)$/i;

function mailTeil(s: string) {
  return String(s || "")
    .toLowerCase()
    .replace(/[äÄ]/g, "ae").replace(/[öÖ]/g, "oe").replace(/[üÜ]/g, "ue").replace(/[ß]/g, "ss")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, ".");
}

/** „Max Mustermann" → max.mustermann */
function adresseAus(name: string, vergeben: Set<string>) {
  const basis = mailTeil(name) || "benutzer";
  let kandidat = `${basis}@${DOMAENE}`;
  let n = 2;
  while (vergeben.has(kandidat.toLowerCase())) kandidat = `${basis}${n++}@${DOMAENE}`;
  vergeben.add(kandidat.toLowerCase());
  return kandidat;
}

async function main() {
  await clocker.connect();
  await kontor.connect();

  // ── Rückbau ──────────────────────────────────────────────────────────────
  if (ZURUECK) {
    const daten = JSON.parse(fs.readFileSync(ZURUECK, "utf-8"));
    console.log(`Rückbau aus ${path.basename(ZURUECK)}: ${daten.eintraege.length} Personen`);
    if (!ANWENDEN) { console.log("Nur Vorschau – mit --anwenden wird zurückgesetzt."); return; }
    for (const e of daten.eintraege) {
      if (e.nexusIdentityId) await prisma.identity.update({ where: { id: e.nexusIdentityId }, data: { email: e.alt } }).catch(() => {});
      if (e.nexusEmployeeId) await prisma.employee.update({ where: { id: e.nexusEmployeeId }, data: { email: e.altEmployee ?? e.alt } }).catch(() => {});
      if (e.clockerId) await clocker.query(`UPDATE "User" SET email=$1, "updatedAt"=now() WHERE id=$2`, [e.alt, e.clockerId]).catch(() => {});
      if (e.kontorId) await kontor.query(`UPDATE "User" SET email=$1, "updatedAt"=now() WHERE id=$2`, [e.alt, e.kontorId]).catch(() => {});
    }
    console.log("Rückbau abgeschlossen.");
    return;
  }

  // ── Bestand einlesen ─────────────────────────────────────────────────────
  const identitaeten = await prisma.identity.findMany({ where: { deletedAt: null } });
  const mitarbeiter = await prisma.employee.findMany({ where: { deletedAt: null } });
  const cUser = (await clocker.query(`SELECT id, name, email FROM "User"`)).rows;
  const kUser = (await kontor.query(`SELECT id, name, email FROM "User"`)).rows;

  const vergeben = new Set<string>();
  const eintraege: any[] = [];
  let uebersprungen = 0;

  const norm = (s: string) => String(s || "").trim().toLowerCase();

  // Grundlage sind die Identitäten (zentrale Logins); Mitarbeiter ohne Identität kommen danach
  for (const i of identitaeten) {
    if (AUSNAHMEN.test(i.email)) { uebersprungen++; continue; }
    if (norm(i.email).endsWith("@" + DOMAENE)) { uebersprungen++; continue; }
    const neu = adresseAus(i.name, vergeben);
    const emp = mitarbeiter.find((e) => e.id === i.employeeId) || mitarbeiter.find((e) => norm(e.email) === norm(i.email));
    const c = cUser.find((x: any) => norm(x.email) === norm(i.email));
    const k = kUser.find((x: any) => norm(x.email) === norm(i.email));
    eintraege.push({
      person: i.name, alt: i.email, neu,
      nexusIdentityId: i.id,
      nexusEmployeeId: emp?.id || null, altEmployee: emp?.email ?? null,
      clockerId: c?.id || null, kontorId: k?.id || null,
    });
  }

  // Mitarbeiter ohne zentrale Identität (haben nur einen App-Login oder gar keinen)
  for (const e of mitarbeiter) {
    if (eintraege.some((x) => x.nexusEmployeeId === e.id)) continue;
    if (e.email && norm(e.email).endsWith("@" + DOMAENE)) { uebersprungen++; continue; }
    const neu = adresseAus(e.name, vergeben);
    const c = e.email ? cUser.find((x: any) => norm(x.email) === norm(e.email)) : cUser.find((x: any) => norm(x.name) === norm(e.name));
    const k = e.email ? kUser.find((x: any) => norm(x.email) === norm(e.email)) : null;
    eintraege.push({
      person: e.name, alt: e.email || "(ohne)", neu,
      nexusIdentityId: null, nexusEmployeeId: e.id, altEmployee: e.email ?? null,
      clockerId: c?.id || null, kontorId: k?.id || null,
    });
  }

  // App-Benutzer ohne Gegenstück in Nexus (nur in clocker bzw. kontor vorhanden)
  for (const [liste, feld] of [[cUser, "clockerId"], [kUser, "kontorId"]] as [any[], string][]) {
    for (const u of liste) {
      const mail = norm(u.email);
      if (mail.endsWith("@" + DOMAENE)) { continue; }
      if (AUSNAHMEN.test(u.email || "")) { uebersprungen++; continue; }
      if (eintraege.some((e) => e[feld] === u.id)) continue;          // schon über Nexus erfasst
      // Über den Namen einem bereits geplanten Eintrag zuordnen, sonst eigenständig umstellen
      const treffer = eintraege.find((e) => norm(e.person) === norm(u.name));
      if (treffer) { treffer[feld] = u.id; continue; }
      const neuAdresse = adresseAus(u.name, vergeben);
      eintraege.push({
        person: u.name, alt: u.email || "(ohne)", neu: neuAdresse,
        nexusIdentityId: null, nexusEmployeeId: null, altEmployee: null,
        clockerId: feld === "clockerId" ? u.id : null,
        kontorId: feld === "kontorId" ? u.id : null,
      });
    }
  }

  // Nachweis-/Rückbaudatei (lokal, enthält Namen → bleibt auf dem Server)
  const ordner = path.join(process.cwd(), "data");
  fs.mkdirSync(ordner, { recursive: true });
  const stempel = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 16);
  const datei = path.join(ordner, `mail-domain-${stempel}.json`);
  fs.writeFileSync(datei, JSON.stringify({ domaene: DOMAENE, erzeugt: new Date().toISOString(), angewendet: ANWENDEN, eintraege }, null, 2));

  const mitClocker = eintraege.filter((e) => e.clockerId).length;
  const mitKontor = eintraege.filter((e) => e.kontorId).length;
  const mitIdentitaet = eintraege.filter((e) => e.nexusIdentityId).length;

  console.log(`Domäne: @${DOMAENE}${ANWENDEN ? "" : "   (VORSCHAU – es wird nichts geschrieben)"}`);
  console.log(`Betroffen: ${eintraege.length} Personen · davon mit zentralem Login ${mitIdentitaet} · in clocker ${mitClocker} · in kontor ${mitKontor}`);
  console.log(`Unverändert (schon richtig oder Dienstkonto): ${uebersprungen}`);
  console.log(`Zuordnung alt → neu liegt lokal in: ${datei}`);

  if (!ANWENDEN) {
    console.log("\nZum Ausführen dasselbe Kommando mit --anwenden aufrufen.");
    return;
  }

  // ── Anwenden ─────────────────────────────────────────────────────────────
  let n = 0, c = 0, k = 0, e2 = 0;
  for (const e of eintraege) {
    if (e.nexusIdentityId) { await prisma.identity.update({ where: { id: e.nexusIdentityId }, data: { email: e.neu } }); n++; }
    if (e.nexusEmployeeId) { await prisma.employee.update({ where: { id: e.nexusEmployeeId }, data: { email: e.neu } }); e2++; }
    if (e.clockerId) { await clocker.query(`UPDATE "User" SET email=$1, "updatedAt"=now() WHERE id=$2`, [e.neu, e.clockerId]); c++; }
    if (e.kontorId) { await kontor.query(`UPDATE "User" SET email=$1, "updatedAt"=now() WHERE id=$2`, [e.neu, e.kontorId]); k++; }
  }
  console.log(`Geschrieben – Nexus-Logins ${n} · Nexus-Mitarbeiter ${e2} · clocker ${c} · kontor ${k}`);
  console.log(`Rückbau möglich mit: --zurueck ${datei} --anwenden`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); await clocker.end().catch(() => {}); await kontor.end().catch(() => {}); });
