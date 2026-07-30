/**
 * Stammdaten-Abgleich Nexus ⇄ kontor: **Mandanten (Company) und Kunden (Client)**.
 *
 * Artikel bleiben außen vor: die gleicht kontor bereits selbst über die Nexus-API ab
 * (`src/lib/nexusSync.ts`: pushProduct/pullProducts, aktiv bei NEXUS_SYNC_ENABLED).
 * Ein zweiter Weg über die Datenbank würde sich damit ins Gehege kommen.
 *
 * Regeln (wie beim clocker-Abgleich):
 *  - Zuordnung über normalisierte Namen inkl. Präfix-Regel (Firmenname mit Zusatz).
 *  - Leere Felder werden aus der Gegenseite gefüllt. Sind beide gefüllt und verschieden,
 *    gewinnt die **jüngere** Änderung – kontor führt `updatedAt` bei Client und Company.
 *  - **Anlegen:** kontor → Nexus immer. Nexus → kontor nur mit `--nach-kontor`
 *    (kontor hat bewusst wenige Kunden; ungefragt 16+ Einträge anzulegen wäre ein
 *    massiver Eingriff in eine fremde Fachanwendung).
 *
 * Aufruf:
 *   TS_NODE_TRANSPILE_ONLY=1 node node_modules/ts-node/dist/bin.js \
 *     --compiler-options '{"module":"CommonJS","moduleResolution":"node"}' \
 *     prisma/sync-kontor-stammdaten.ts [--dry] [--nach-kontor]
 */
import { Client as PgClient } from "pg";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const kontor = new PgClient({
  connectionString: process.env.KONTOR_DATABASE_URL || "postgresql://clocker:clocker_pw@localhost:5432/kontor",
});
const TROCKEN = process.argv.includes("--dry");
const NACH_KONTOR = process.argv.includes("--nach-kontor");
const tat = (t: string) => console.log(`${TROCKEN ? "[Probelauf] " : ""}${t}`);

const key = (s: string) =>
  String(s || "").toLowerCase()
    .replace(/\b(gmbh|ag|kg|ohg|ug|mbh|co|kgaa|e\.?k\.?|se|inh\.?)\b/g, " ")
    .replace(/[^a-z0-9äöüß]+/g, "");

function finde<T>(liste: T[], name: string, nameVon: (x: T) => string): T | undefined {
  const k = key(name);
  if (!k) return undefined;
  const exakt = liste.find((x) => key(nameVon(x)) === k);
  if (exakt) return exakt;
  const treffer = liste.filter((x) => {
    const k2 = key(nameVon(x));
    return k2 && (k2.startsWith(k) || k.startsWith(k2)) && Math.min(k.length, k2.length) >= 6;
  });
  return treffer.length === 1 ? treffer[0] : undefined;
}

/** Feldabgleich: leeres Feld füllen, sonst gewinnt die jüngere Änderung. */
function abgleich(
  paare: { nexusFeld: string; kontorSpalte: string; nexusWert: string; kontorWert: string }[],
  nexusJuenger: boolean
) {
  const nexusPatch: Record<string, string> = {};
  const kontorPatch: Record<string, string> = {};
  for (const f of paare) {
    const nw = String(f.nexusWert ?? "").trim();
    const kw = String(f.kontorWert ?? "").trim();
    if (nw === kw) continue;
    if (!nw && kw) nexusPatch[f.nexusFeld] = kw;
    else if (nw && !kw) kontorPatch[f.kontorSpalte] = nw;
    else if (nexusJuenger) kontorPatch[f.kontorSpalte] = nw;
    else nexusPatch[f.nexusFeld] = kw;
  }
  return { nexusPatch, kontorPatch };
}

async function schreibeKontor(tabelle: string, id: string, patch: Record<string, string>) {
  const sp = Object.keys(patch);
  if (!sp.length) return;
  await kontor.query(
    `UPDATE "${tabelle}" SET ${sp.map((s, i) => `"${s}" = $${i + 1}`).join(", ")}, "updatedAt" = now() WHERE id = $${sp.length + 1}`,
    [...sp.map((s) => patch[s]), id]
  );
}

async function main() {
  await kontor.connect();
  console.log(`kontor-Abgleich${TROCKEN ? " (Probelauf – es wird nichts geschrieben)" : ""}${NACH_KONTOR ? " · inkl. Anlegen in kontor" : ""}`);

  // ───────────────────────── Mandanten (Company) ─────────────────────────
  const nOrgs = await prisma.organization.findMany({ where: { deletedAt: null } });
  const kComps = (await kontor.query(
    `SELECT id, name, "nameAddition", street, zip, city, country, "taxNumber", "ustId", "updatedAt" FROM "Company"`
  )).rows;
  let orgNexus = 0, orgKontor = 0, orgNeu = 0;

  for (const k of kComps) {
    const o = finde(nOrgs, k.name, (x) => x.name);
    if (!o) {
      tat(`Mandant neu in Nexus: ${k.name}`);
      if (!TROCKEN) {
        await prisma.organization.create({
          data: {
            name: k.name, nameAddition: k.nameAddition || "", street: k.street || "",
            zip: k.zip || "", city: k.city || "", country: k.country || "Deutschland",
            taxNumber: k.taxNumber || "", ustId: k.ustId || "",
          },
        });
      }
      orgNeu++;
      continue;
    }
    const juenger = new Date(o.updatedAt).getTime() > new Date(k.updatedAt).getTime();
    const { nexusPatch, kontorPatch } = abgleich([
      { nexusFeld: "nameAddition", kontorSpalte: "nameAddition", nexusWert: o.nameAddition, kontorWert: k.nameAddition },
      { nexusFeld: "street", kontorSpalte: "street", nexusWert: o.street, kontorWert: k.street },
      { nexusFeld: "zip", kontorSpalte: "zip", nexusWert: o.zip, kontorWert: k.zip },
      { nexusFeld: "city", kontorSpalte: "city", nexusWert: o.city, kontorWert: k.city },
      { nexusFeld: "taxNumber", kontorSpalte: "taxNumber", nexusWert: o.taxNumber, kontorWert: k.taxNumber },
      { nexusFeld: "ustId", kontorSpalte: "ustId", nexusWert: o.ustId, kontorWert: k.ustId },
    ], juenger);
    if (Object.keys(nexusPatch).length) {
      tat(`Mandant Nexus ← kontor: ${o.name} ${JSON.stringify(nexusPatch)}`);
      if (!TROCKEN) await prisma.organization.update({ where: { id: o.id }, data: nexusPatch });
      orgNexus++;
    }
    if (Object.keys(kontorPatch).length) {
      tat(`Mandant kontor ← Nexus: ${k.name} ${JSON.stringify(kontorPatch)}`);
      if (!TROCKEN) await schreibeKontor("Company", k.id, kontorPatch);
      orgKontor++;
    }
  }
  console.log(`Mandanten: Nexus ${nOrgs.length} · kontor ${kComps.length} · aktualisiert Nexus ${orgNexus} / kontor ${orgKontor} · neu in Nexus ${orgNeu}`);

  // ─────────────────────────── Kunden (Client) ───────────────────────────
  const nKunden = await prisma.customer.findMany({ where: { deletedAt: null } });
  const kKunden = (await kontor.query(
    `SELECT id, name, company, salutation, "shortName", "customerNumber", "distanceKm",
            street, zip, city, country, email, phone, "taxNumber", "ustId", notes, "updatedAt"
       FROM "Client"`
  )).rows;
  let kdNexus = 0, kdKontor = 0, kdNeuNexus = 0, kdNeuKontor = 0;

  for (const k of kKunden) {
    const anzeige = (k.company || k.name || "").trim();
    const c = finde(nKunden, anzeige, (x) => x.companyName || x.contactName);
    if (!c) {
      tat(`Kunde neu in Nexus: ${anzeige}`);
      if (!TROCKEN) {
        await prisma.customer.create({
          data: {
            companyName: k.company || "", contactName: k.name || "", salutation: k.salutation || "",
            shortCode: k.shortName || "", street: k.street || "", zip: k.zip || "", city: k.city || "",
            country: k.country || "Deutschland", email: k.email || "", phone: k.phone || "",
            taxNumber: k.taxNumber || "", ustId: k.ustId || "", distanceKm: Number(k.distanceKm) || 0,
            notes: k.notes || "",
          },
        });
      }
      kdNeuNexus++;
      continue;
    }
    const juenger = new Date(c.updatedAt).getTime() > new Date(k.updatedAt).getTime();
    const { nexusPatch, kontorPatch } = abgleich([
      { nexusFeld: "contactName", kontorSpalte: "name", nexusWert: c.contactName, kontorWert: k.name },
      { nexusFeld: "companyName", kontorSpalte: "company", nexusWert: c.companyName, kontorWert: k.company },
      { nexusFeld: "salutation", kontorSpalte: "salutation", nexusWert: c.salutation, kontorWert: k.salutation },
      { nexusFeld: "shortCode", kontorSpalte: "shortName", nexusWert: c.shortCode, kontorWert: k.shortName },
      { nexusFeld: "street", kontorSpalte: "street", nexusWert: c.street, kontorWert: k.street },
      { nexusFeld: "zip", kontorSpalte: "zip", nexusWert: c.zip, kontorWert: k.zip },
      { nexusFeld: "city", kontorSpalte: "city", nexusWert: c.city, kontorWert: k.city },
      { nexusFeld: "email", kontorSpalte: "email", nexusWert: c.email, kontorWert: k.email },
      { nexusFeld: "phone", kontorSpalte: "phone", nexusWert: c.phone, kontorWert: k.phone },
      { nexusFeld: "taxNumber", kontorSpalte: "taxNumber", nexusWert: c.taxNumber, kontorWert: k.taxNumber },
      { nexusFeld: "ustId", kontorSpalte: "ustId", nexusWert: c.ustId, kontorWert: k.ustId },
      { nexusFeld: "notes", kontorSpalte: "notes", nexusWert: c.notes, kontorWert: k.notes },
    ], juenger);
    if (Object.keys(nexusPatch).length) {
      tat(`Kunde Nexus ← kontor: ${anzeige} ${JSON.stringify(nexusPatch)}`);
      if (!TROCKEN) await prisma.customer.update({ where: { id: c.id }, data: nexusPatch });
      kdNexus++;
    }
    if (Object.keys(kontorPatch).length) {
      tat(`Kunde kontor ← Nexus: ${anzeige} ${JSON.stringify(kontorPatch)}`);
      if (!TROCKEN) await schreibeKontor("Client", k.id, kontorPatch);
      kdKontor++;
    }
  }

  if (NACH_KONTOR) {
    for (const c of nKunden) {
      const anzeige = (c.companyName || c.contactName || "").trim();
      if (!anzeige) continue;
      if (finde(kKunden, anzeige, (x: any) => x.company || x.name)) continue;
      tat(`Kunde neu in kontor: ${anzeige}`);
      if (!TROCKEN) {
        await kontor.query(
          `INSERT INTO "Client" (id, name, company, salutation, "shortName", street, zip, city, country,
                                 email, phone, "taxNumber", "ustId", notes, "distanceKm", "createdAt", "updatedAt")
           VALUES (gen_random_uuid()::text, $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14, now(), now())`,
          [c.contactName || anzeige, c.companyName || "", c.salutation || "", c.shortCode || "",
           c.street || "", c.zip || "", c.city || "", c.country || "Deutschland", c.email || "",
           c.phone || "", c.taxNumber || "", c.ustId || "", c.notes || "", Number(c.distanceKm) || 0]
        );
      }
      kdNeuKontor++;
    }
  }
  console.log(`Kunden: Nexus ${nKunden.length} · kontor ${kKunden.length} · aktualisiert Nexus ${kdNexus} / kontor ${kdKontor} · neu Nexus ${kdNeuNexus} / kontor ${kdNeuKontor}`);
  console.log("Hinweis: Artikel gleicht kontor selbst über die Nexus-API ab – hier bewusst nicht angefasst.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); await kontor.end().catch(() => {}); });
