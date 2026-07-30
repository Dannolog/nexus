/**
 * Mitarbeiter-Abgleich Nexus ⇄ clocker — **beidseitig**.
 *
 * Zuordnung (in dieser Reihenfolge):
 *   1. E-Mail (in clocker eindeutig)
 *   2. Personalnummer (Nexus `employeeNumber` ↔ clocker `employeeId`)
 *   3. normalisierter Name — nur als letzte Stufe, wird im Protokoll ausdrücklich vermerkt
 *      (bekannte Duplikat-Falle: Mitarbeiter ohne E-Mail UND ohne Personalnummer)
 *
 * Abgeglichene Felder: name, email, Personalnummer, Farbe.
 * Alles Weitere bleibt, wo es hingehört: Rechte/Stundensätze/Lohn in clocker,
 * Adresse/Geburtsdatum/Telefon/Staatsangehörigkeit in Nexus.
 *
 * Konfliktregel: Ist ein Feld auf einer Seite leer, wird der gefüllte Wert übernommen.
 * Sind beide gefüllt und verschieden, gewinnt die Seite mit der **jüngeren** Änderung
 * (`updatedAt`). Geschrieben wird nur bei echter Abweichung → keine Endlosschleife.
 *
 * Neue Datensätze werden in **beide** Richtungen angelegt:
 *   clocker → Nexus: Employee (+ Identity mit dem clocker-Passwort-Hash, App-Zugang clocker)
 *   Nexus → clocker: User (Passwort-Hash aus der Nexus-Identity, sonst Zufallswert →
 *                    Login erst nach einem Zurücksetzen; wird protokolliert)
 *   Ohne E-Mail kann in clocker nicht angelegt werden (dort Pflicht + eindeutig) → übersprungen.
 *
 * Aufruf:
 *   TS_NODE_TRANSPILE_ONLY=1 node node_modules/ts-node/dist/bin.js \
 *     --compiler-options '{"module":"CommonJS","moduleResolution":"node"}' \
 *     prisma/sync-clocker-employees.ts [--dry]
 */
import { Client as PgClient } from "pg";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const CLOCKER_URL = process.env.CLOCKER_DATABASE_URL || "postgresql://clocker:clocker_pw@localhost:5432/clocker";
const clocker = new PgClient({ connectionString: CLOCKER_URL });
const TROCKEN = process.argv.includes("--dry");
const tat = (text: string) => console.log(`${TROCKEN ? "[Probelauf] " : ""}${text}`);

type CUser = {
  id: string; name: string; email: string; employeeId: string; color: string;
  password: string; updatedAt: Date; companyId: string | null;
};

const nameKey = (s: string) =>
  String(s || "").toLowerCase().replace(/[^a-zäöüß]+/g, "");

async function main() {
  await clocker.connect();

  const nexusListe = await prisma.employee.findMany({ where: { deletedAt: null } });
  const clockerListe: CUser[] = (
    await clocker.query(`SELECT id, name, email, "employeeId", color, password, "updatedAt", "companyId" FROM "User"`)
  ).rows;

  console.log(`Nexus: ${nexusListe.length} Mitarbeiter · clocker: ${clockerListe.length} Benutzer${TROCKEN ? "  (Probelauf – es wird nichts geschrieben)" : ""}`);

  const offenClocker = new Set(clockerListe.map((c) => c.id));
  const paare: { n: typeof nexusListe[number]; c: CUser; via: string }[] = [];
  const nurNexus: typeof nexusListe = [];

  for (const n of nexusListe) {
    const mail = (n.email || "").trim().toLowerCase();
    let c =
      (mail && clockerListe.find((x) => (x.email || "").trim().toLowerCase() === mail)) ||
      (n.employeeNumber && clockerListe.find((x) => (x.employeeId || "").trim() === n.employeeNumber.trim())) ||
      null;
    let via = c ? (mail && (c.email || "").toLowerCase() === mail ? "E-Mail" : "Personalnummer") : "";
    if (!c) {
      const treffer = clockerListe.filter((x) => nameKey(x.name) === nameKey(n.name));
      if (treffer.length === 1) { c = treffer[0]; via = "Name (unsicher)"; }
      else if (treffer.length > 1) console.warn(`  ! „${n.name}": mehrere clocker-Benutzer mit gleichem Namen – übersprungen`);
    }
    if (c) { paare.push({ n, c, via }); offenClocker.delete(c.id); }
    else nurNexus.push(n);
  }
  const nurClocker = clockerListe.filter((c) => offenClocker.has(c.id));

  console.log(`Zugeordnet: ${paare.length} · nur in Nexus: ${nurNexus.length} · nur in clocker: ${nurClocker.length}`);
  const unsicher = paare.filter((p) => p.via === "Name (unsicher)");
  if (unsicher.length) {
    console.warn(`  Hinweis: ${unsicher.length} Zuordnung(en) nur über den Namen – bitte in clocker E-Mail/Personalnummer pflegen:`);
    for (const p of unsicher) console.warn(`   · ${p.n.name}`);
  }

  // ---------- 1) Felder abgleichen ----------
  let nachNexus = 0, nachClocker = 0;
  for (const { n, c, via } of paare) {
    const nJuenger = new Date(n.updatedAt).getTime() > new Date(c.updatedAt).getTime();
    const nexusPatch: Record<string, string> = {};
    const clockerPatch: Record<string, string> = {};

    const feld = (nexusFeld: keyof typeof n, clockerWert: string, nexusWert: string, clockerSpalte: string) => {
      const nw = String(nexusWert || "").trim();
      const cw = String(clockerWert || "").trim();
      if (nw === cw) return;
      if (!nw && cw) nexusPatch[nexusFeld as string] = cw;          // Nexus leer → aus clocker füllen
      else if (nw && !cw) clockerPatch[clockerSpalte] = nw;          // clocker leer → aus Nexus füllen
      else if (nJuenger) clockerPatch[clockerSpalte] = nw;           // beide gefüllt → jüngere Änderung gewinnt
      else nexusPatch[nexusFeld as string] = cw;
    };

    feld("name", c.name, n.name, "name");
    feld("email", c.email, n.email, "email");
    feld("employeeNumber", c.employeeId, n.employeeNumber, "employeeId");
    feld("color", c.color, n.color, "color");

    // E-Mail in clocker ist eindeutig – Kollisionen vermeiden
    if (clockerPatch.email) {
      const belegt = clockerListe.some((x) => x.id !== c.id && (x.email || "").toLowerCase() === clockerPatch.email.toLowerCase());
      if (belegt) { console.warn(`  ! E-Mail „${clockerPatch.email}" ist in clocker schon vergeben – nicht übertragen (${n.name})`); delete clockerPatch.email; }
    }

    if (Object.keys(nexusPatch).length) {
      tat(`Nexus ← clocker: ${n.name} [${via}] ${JSON.stringify(nexusPatch)}`);
      if (!TROCKEN) await prisma.employee.update({ where: { id: n.id }, data: nexusPatch });
      nachNexus++;
    }
    if (Object.keys(clockerPatch).length) {
      tat(`clocker ← Nexus: ${n.name} [${via}] ${JSON.stringify(clockerPatch)}`);
      if (!TROCKEN) {
        const spalten = Object.keys(clockerPatch);
        const sets = spalten.map((s, i) => `"${s}" = $${i + 1}`).join(", ");
        await clocker.query(
          `UPDATE "User" SET ${sets}, "updatedAt" = now() WHERE id = $${spalten.length + 1}`,
          [...spalten.map((s) => clockerPatch[s]), c.id]
        );
      }
      nachClocker++;
    }
  }

  // ---------- 2) Nur in clocker → in Nexus anlegen ----------
  let neuInNexus = 0;
  for (const c of nurClocker) {
    tat(`Nexus anlegen: ${c.name} <${c.email || "ohne E-Mail"}>`);
    if (!TROCKEN) {
      const emp = await prisma.employee.create({
        data: {
          name: c.name,
          email: c.email || "",
          employeeNumber: c.employeeId || "",
          color: c.color || "#7c3cc0",
        },
      });
      // Zentraler Login: Identität mit dem clocker-Hash übernehmen (bcrypt), App-Zugang clocker
      if (c.email) {
        const vorhanden = await prisma.identity.findUnique({ where: { email: c.email } });
        if (!vorhanden) {
          const ident = await prisma.identity.create({
            data: { email: c.email, name: c.name, passwordHash: c.password, employeeId: emp.id, origin: "clocker" },
          });
          await prisma.identityAppAccess.create({
            data: { identityId: ident.id, appKey: "clocker", allowed: true, role: "user" },
          });
        }
      }
    }
    neuInNexus++;
  }

  // ---------- 3) Nur in Nexus → in clocker anlegen ----------
  let neuInClocker = 0, ohneMail = 0;
  for (const n of nurNexus) {
    const mail = (n.email || "").trim();
    if (!mail) {
      console.warn(`  ! ${n.name}: keine E-Mail – in clocker nicht anlegbar (dort Pflichtfeld und eindeutig), übersprungen`);
      ohneMail++;
      continue;
    }
    // Passwort: Hash der Nexus-Identität übernehmen, sonst Zufallswert (Login erst nach Reset)
    const ident = await prisma.identity.findUnique({ where: { email: mail } });
    let hash = ident?.passwordHash || "";
    let hinweis = "Passwort aus Nexus übernommen";
    if (!hash) {
      hash = bcrypt.hashSync(`nexus-${Math.random().toString(36).slice(2)}-${Date.now()}`, 10);
      hinweis = "Zufallspasswort – Mitarbeiter muss es in clocker zurücksetzen";
    }
    tat(`clocker anlegen: ${n.name} <${mail}> (${hinweis})`);
    if (!TROCKEN) {
      await clocker.query(
        `INSERT INTO "User" (id, name, email, password, color, role, "employeeId", "createdAt", "updatedAt")
         VALUES (gen_random_uuid()::text, $1, $2, $3, $4, 'employee', $5, now(), now())`,
        [n.name, mail, hash, n.color || "#7c3cc0", n.employeeNumber || ""]
      );
    }
    neuInClocker++;
  }

  console.log("\n— Ergebnis —");
  console.log(`Felder aktualisiert: Nexus ${nachNexus} · clocker ${nachClocker}`);
  console.log(`Neu angelegt: in Nexus ${neuInNexus} · in clocker ${neuInClocker}${ohneMail ? ` (${ohneMail} ohne E-Mail übersprungen)` : ""}`);
  if (!TROCKEN) {
    const n2 = await prisma.employee.count({ where: { deletedAt: null } });
    const c2 = (await clocker.query(`SELECT count(*)::int AS n FROM "User"`)).rows[0].n;
    console.log(`Bestand jetzt: Nexus ${n2} · clocker ${c2}`);
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); await clocker.end().catch(() => {}); });
