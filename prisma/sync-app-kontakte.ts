/**
 * Kontakt-Abgleich Nexus ⇄ Fachanwendung — **beidseitig**, für **kontor und clocker**.
 *
 * Beide halten ihre Ansprechpartner in einer gleich aufgebauten Tabelle `ClientContact`
 * (clientId, name, role, email, phone, mobile) – deshalb ein gemeinsames Skript statt zweier
 * fast identischer. Nexus führt das zentrale Register (`Contact`).
 * Protokoll für alle Apps: /mnt/devip3/shared/sync/KONTAKTE.md
 *
 * Zuordnung:
 *   Firma:   Nexus `Customer` ⇄ `Client` über den normalisierten Namen
 *            (gleiche Regel wie im Stammdaten-Abgleich, inkl. Präfix-Treffer).
 *   Person:  1. gemerkte ID (`Contact.kontorId` bzw. `Contact.clockerId`) ⇄ `ClientContact.id`
 *               – stabil, überlebt Umbenennungen und E-Mail-Wechsel
 *            2. E-Mail innerhalb derselben Firma
 *            3. normalisierter Name innerhalb derselben Firma
 *
 * Konfliktregel: Leere Felder werden von der Gegenseite gefüllt. Sind beide gefüllt und
 * verschieden, gewinnt **Nexus** – dort wird der Bestand geführt (`ClientContact` hat kein
 * `updatedAt`, eine „jüngere Änderung gewinnt"-Regel ist dort nicht entscheidbar).
 * Geschrieben wird nur bei echter Abweichung → keine Endlosschleife.
 *
 * Löschen: In Nexus weich gelöschte Kontakte werden in der App entfernt, sofern sie über die
 * gemerkte ID eindeutig zugeordnet sind. Verschwindet umgekehrt eine zugeordnete Zeile in der
 * App, wird der Nexus-Kontakt weich gelöscht (bleibt also wiederherstellbar).
 *
 * Aufruf:
 *   TS_NODE_TRANSPILE_ONLY=1 node node_modules/ts-node/dist/bin.js \
 *     --compiler-options '{"module":"CommonJS","moduleResolution":"node"}' \
 *     prisma/sync-app-kontakte.ts --app=kontor|clocker [--dry]
 */
import { Client as PgClient } from "pg";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const TROCKEN = process.argv.includes("--dry");

/** Welche Fachanwendung? Beide sind gleich aufgebaut, nur Verbindung und Merkfeld unterscheiden sich. */
const APP = (process.argv.find((a) => a.startsWith("--app="))?.slice(6) || "kontor") as "kontor" | "clocker";
if (APP !== "kontor" && APP !== "clocker") {
  console.error(`Unbekannte App „${APP}" – erlaubt sind --app=kontor und --app=clocker`);
  process.exit(1);
}
const KONFIG = {
  kontor: {
    url: process.env.KONTOR_DATABASE_URL || "postgresql://clocker:clocker_pw@localhost:5432/kontor",
    merker: "kontorId" as const,
    // kontor führt den Firmennamen in „company", der Anzeigename steht in „name"
    firmenSpalte: `coalesce(nullif(company,''), name)`,
  },
  clocker: {
    url: process.env.CLOCKER_DATABASE_URL || "postgresql://clocker:clocker_pw@localhost:5432/clocker",
    merker: "clockerId" as const,
    firmenSpalte: `name`,
  },
}[APP];

const app = new PgClient({ connectionString: KONFIG.url });
const tat = (t: string) => console.log(`${TROCKEN ? "[Probelauf] " : ""}${t}`);

type AppKontakt = { id: string; clientId: string; name: string; role: string; email: string; phone: string; mobile: string };

/** Firmennamen vereinheitlichen (Rechtsform und Sonderzeichen raus). */
const firmaKey = (s: string) =>
  String(s || "").toLowerCase()
    .replace(/\b(gmbh|ag|kg|ohg|ug|mbh|co|kgaa|e\.?k\.?|se|inh\.?)\b/g, " ")
    .replace(/[^a-z0-9äöüß]+/g, "");

const nameKey = (s: string) => String(s || "").toLowerCase().replace(/[^a-z0-9äöüß]+/g, "");

/** Firmenzuordnung wie im Stammdaten-Abgleich: exakter Schlüssel, sonst eindeutiger Präfix. */
function findeFirma<T>(liste: T[], name: string, nameVon: (x: T) => string): T | undefined {
  const k = firmaKey(name);
  if (!k) return undefined;
  const exakt = liste.find((x) => firmaKey(nameVon(x)) === k);
  if (exakt) return exakt;
  const treffer = liste.filter((x) => {
    const k2 = firmaKey(nameVon(x));
    return k2 && (k2.startsWith(k) || k.startsWith(k2)) && Math.min(k.length, k2.length) >= 6;
  });
  return treffer.length === 1 ? treffer[0] : undefined;
}

async function main() {
  await app.connect();

  const kunden = await prisma.customer.findMany({ where: { deletedAt: null } });
  const clients: { id: string; firma: string }[] = (
    await app.query(`SELECT id, ${KONFIG.firmenSpalte} AS firma FROM "Client"`)
  ).rows;
  const kKontakte: AppKontakt[] = (
    await app.query(
      `SELECT id, "clientId", name, coalesce(role,'') AS role, coalesce(email,'') AS email,
              coalesce(phone,'') AS phone, coalesce(mobile,'') AS mobile FROM "ClientContact"`
    )
  ).rows;
  const nexusKontakte = await prisma.contact.findMany({ where: { ownerKind: "customer" } });
  const merkerVon = (c: { kontorId: string; clockerId: string }) => c[KONFIG.merker];

  console.log(
    `Nexus: ${nexusKontakte.filter((c) => !c.deletedAt).length} Kunden-Kontakte · ${APP}: ${kKontakte.length}` +
      `${TROCKEN ? "  (Probelauf – es wird nichts geschrieben)" : ""}`
  );

  // ---------- Firmenpaare bilden ----------
  const paare: { kunde: (typeof kunden)[number]; clientId: string }[] = [];
  for (const k of kunden) {
    const c = findeFirma(clients, k.companyName || k.contactName, (x) => x.firma);
    if (c) paare.push({ kunde: k, clientId: c.id });
  }
  const clientZuKunde = new Map(paare.map((p) => [p.clientId, p.kunde]));
  console.log(`Firmen zugeordnet: ${paare.length} von ${kunden.length} Kunden`);

  let nachNexus = 0, nachKontor = 0, neuInNexus = 0, neuInKontor = 0, entferntKontor = 0, entferntNexus = 0;

  // ---------- 1) kontor → Nexus: zuordnen, ergänzen, anlegen ----------
  for (const kk of kKontakte) {
    const kunde = clientZuKunde.get(kk.clientId);
    if (!kunde) continue; // Firma (noch) nicht zugeordnet – der Stammdaten-Abgleich klärt das zuerst

    const mail = (kk.email || "").trim().toLowerCase();
    const eigene = nexusKontakte.filter((c) => c.ownerId === kunde.id && !c.deletedAt);
    let n =
      nexusKontakte.find((c) => merkerVon(c) === kk.id) ||
      (mail && eigene.find((c) => c.email.toLowerCase() === mail)) ||
      eigene.find((c) => nameKey(c.name) === nameKey(kk.name)) ||
      null;

    if (!n) {
      tat(`Nexus anlegen: Kontakt aus ${APP} bei „${kunde.companyName || kunde.contactName}"`);
      if (!TROCKEN) {
        const neu = await prisma.contact.create({
          data: {
            name: kk.name, role: kk.role, email: kk.email, phone: kk.phone, mobile: kk.mobile,
            ownerKind: "customer", ownerId: kunde.id, ownerName: kunde.companyName || kunde.contactName || "",
            customerId: kunde.id, source: APP, [KONFIG.merker]: kk.id,
          },
        });
        nexusKontakte.push(neu);
      }
      neuInNexus++;
      continue;
    }

    if (n.deletedAt) {
      // In Nexus bewusst entfernt → in kontor nachziehen
      tat(`${APP} entfernen: Kontakt zu „${kunde.companyName || kunde.contactName}" (in Nexus gelöscht)`);
      if (!TROCKEN) await app.query(`DELETE FROM "ClientContact" WHERE id = $1`, [kk.id]);
      entferntKontor++;
      continue;
    }

    const patchNexus: Record<string, string> = {};
    const patchKontor: Record<string, string> = {};
    const feld = (f: "name" | "role" | "email" | "phone" | "mobile") => {
      const nw = String((n as any)[f] || "").trim();
      const kw = String((kk as any)[f] || "").trim();
      if (nw === kw) return;
      if (!nw && kw) patchNexus[f] = kw;        // Nexus leer → aus kontor füllen
      else if (nw) patchKontor[f] = nw;          // sonst gewinnt Nexus (führt den Bestand)
    };
    (["name", "role", "email", "phone", "mobile"] as const).forEach(feld);

    if (Object.keys(patchNexus).length) {
      tat(`Nexus ← ${APP}: ${Object.keys(patchNexus).join(", ")}`);
      if (!TROCKEN) await prisma.contact.update({ where: { id: n.id }, data: { ...patchNexus, version: n.version + 1 } });
      nachNexus++;
    }
    if (Object.keys(patchKontor).length) {
      tat(`${APP} ← Nexus: ${Object.keys(patchKontor).join(", ")}`);
      if (!TROCKEN) {
        const spalten = Object.keys(patchKontor);
        const sets = spalten.map((s, i) => `"${s}" = $${i + 1}`).join(", ");
        await app.query(`UPDATE "ClientContact" SET ${sets} WHERE id = $${spalten.length + 1}`,
          [...spalten.map((s) => patchKontor[s]), kk.id]);
      }
      nachKontor++;
    }
    // Verknüpfung festziehen, damit die Zuordnung künftig ohne Namensvergleich hält
    if (!TROCKEN && merkerVon(n) !== kk.id) {
      await prisma.contact.update({ where: { id: n.id }, data: { [KONFIG.merker]: kk.id } });
    }
  }

  // ---------- 2) Nexus → kontor: fehlende Kontakte anlegen ----------
  const appIds = new Set(kKontakte.map((k) => k.id));
  for (const p of paare) {
    const eigene = nexusKontakte.filter((c) => c.ownerId === p.kunde.id && !c.deletedAt);
    for (const n of eigene) {
      if (merkerVon(n) && appIds.has(merkerVon(n))) continue;                       // schon drüben
      const schonDa = kKontakte.some(
        (k) => k.clientId === p.clientId &&
          ((n.email && k.email.toLowerCase() === n.email.toLowerCase()) || nameKey(k.name) === nameKey(n.name))
      );
      if (schonDa) continue;

      if (merkerVon(n) && !appIds.has(merkerVon(n))) {
        // War drüben verknüpft und ist dort verschwunden → in Nexus weich löschen
        tat(`Nexus entfernen: Kontakt war in ${APP} gelöscht`);
        if (!TROCKEN) await prisma.contact.update({ where: { id: n.id }, data: { deletedAt: new Date(), version: n.version + 1 } });
        entferntNexus++;
        continue;
      }

      tat(`${APP} anlegen: Kontakt bei „${p.kunde.companyName || p.kunde.contactName}"`);
      if (!TROCKEN) {
        const r = await app.query(
          `INSERT INTO "ClientContact" (id, "clientId", name, role, email, phone, mobile, "createdAt")
           VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, now())
           RETURNING id`,
          [p.clientId, n.name, n.role, n.email, n.phone, n.mobile]
        );
        if (r.rows[0]?.id) await prisma.contact.update({ where: { id: n.id }, data: { [KONFIG.merker]: r.rows[0].id } });
      }
      neuInKontor++;
    }
  }

  console.log("\n— Ergebnis —");
  console.log(`Felder aktualisiert: Nexus ${nachNexus} · ${APP} ${nachKontor}`);
  console.log(`Neu angelegt: Nexus ${neuInNexus} · ${APP} ${neuInKontor}`);
  console.log(`Entfernt: ${APP} ${entferntKontor} · Nexus ${entferntNexus}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); await app.end().catch(() => {}); });
