/**
 * Stammdaten-Abgleich Nexus ⇄ clocker: **Firmen, Kunden, Projekte**.
 * (Mitarbeiter laufen getrennt über `sync-clocker-employees.ts`.)
 *
 * Grundsätze:
 *  - **Nichts überschreiben.** clocker führt bei Kunden und Projekten keinen
 *    Änderungszeitstempel; ein „jüngere Änderung gewinnt" wäre dort geraten.
 *    Deshalb werden ausschließlich **leere Felder** der jeweils anderen Seite gefüllt.
 *  - **Zuordnung über den Namen**, normalisiert (Groß/Klein, Rechtsform, Sonderzeichen).
 *    Zusätzlich greift eine Präfix-Regel: „Baier Maschinen Inh. David Baier" (clocker)
 *    wird „Baier Maschinen" (Nexus) zugeordnet, statt einen dritten Mandanten anzulegen.
 *  - **Anlegen:** clocker → Nexus immer (die Zentrale soll alles kennen).
 *    Nexus → clocker nur mit `--nach-clocker`, weil jedes Projekt dort in der
 *    Stempel-Auswahl auftaucht und die Bedienung sonst unübersichtlich wird.
 *
 * Aufruf:
 *   TS_NODE_TRANSPILE_ONLY=1 node node_modules/ts-node/dist/bin.js \
 *     --compiler-options '{"module":"CommonJS","moduleResolution":"node"}' \
 *     prisma/sync-clocker-stammdaten.ts [--dry] [--nach-clocker]
 */
import { Client as PgClient } from "pg";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const clocker = new PgClient({
  connectionString: process.env.CLOCKER_DATABASE_URL || "postgresql://clocker:clocker_pw@localhost:5432/clocker",
});
const TROCKEN = process.argv.includes("--dry");
const NACH_CLOCKER = process.argv.includes("--nach-clocker");
const tat = (t: string) => console.log(`${TROCKEN ? "[Probelauf] " : ""}${t}`);

/** Name für den Vergleich vereinheitlichen. */
const key = (s: string) =>
  String(s || "").toLowerCase()
    .replace(/\b(gmbh|ag|kg|ohg|ug|mbh|co|kgaa|e\.?k\.?|se|inh\.?)\b/g, " ")
    .replace(/[^a-z0-9äöüß]+/g, "");

/** Zuordnung: exakt, sonst „einer ist Anfang des anderen" (z. B. Firmenname mit Zusatz). */
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

/** Anschrift „Straße, PLZ Ort" zerlegen (clocker speichert sie unstrukturiert). */
function zerlege(frei: string) {
  const t = String(frei || "").replace(/\s+/g, " ").trim();
  if (!t) return { street: "", zip: "", city: "" };
  const m = t.match(/^(.*?)[,\s]+D?\s*-?\s*(\d{5})\s+(.+)$/);
  return m ? { street: m[1].trim().replace(/,$/, ""), zip: m[2], city: m[3].trim() } : { street: "", zip: "", city: "" };
}

async function main() {
  await clocker.connect();
  console.log(`Stammdaten-Abgleich${TROCKEN ? " (Probelauf – es wird nichts geschrieben)" : ""}${NACH_CLOCKER ? " · inkl. Anlegen in clocker" : ""}`);

  // ─────────────────────────── Firmen / Mandanten ───────────────────────────
  const nOrgs = await prisma.organization.findMany({ where: { deletedAt: null } });
  const cComps = (await clocker.query(`SELECT id, name, street, zip, city, phone, email, website FROM "Company"`)).rows;
  let orgErgaenzt = 0, orgNeu = 0;
  const orgZuordnung = new Map<string, string>(); // clocker-Company-ID → Nexus-Org-ID

  for (const c of cComps) {
    const o = finde(nOrgs, c.name, (x) => x.name);
    if (o) {
      orgZuordnung.set(c.id, o.id);
      const patch: Record<string, string> = {};
      if (!o.street && c.street) patch.street = c.street;
      if (!o.zip && c.zip) patch.zip = c.zip;
      if (!o.city && c.city) patch.city = c.city;
      if (Object.keys(patch).length) {
        tat(`Firma ergänzt: ${o.name} ← ${JSON.stringify(patch)}`);
        if (!TROCKEN) await prisma.organization.update({ where: { id: o.id }, data: patch });
        orgErgaenzt++;
      }
    } else {
      tat(`Firma neu in Nexus: ${c.name}`);
      if (!TROCKEN) {
        const neu = await prisma.organization.create({
          data: { name: c.name, street: c.street || "", zip: c.zip || "", city: c.city || "" },
        });
        orgZuordnung.set(c.id, neu.id);
      }
      orgNeu++;
    }
  }
  console.log(`Firmen: ${cComps.length} in clocker · ergänzt ${orgErgaenzt} · neu in Nexus ${orgNeu}`);

  // ─────────────────────────────── Kunden ───────────────────────────────────
  const nKunden = await prisma.customer.findMany({ where: { deletedAt: null } });
  const cKunden = (await clocker.query(`SELECT id, name, "shortCode", color, address, notes FROM "Client"`)).rows;
  let kdErgaenztNexus = 0, kdErgaenztClocker = 0, kdNeuNexus = 0, kdNeuClocker = 0;
  const kundeZuordnung = new Map<string, string>(); // clocker-Client-ID → Nexus-Customer-ID

  for (const c of cKunden) {
    const k = finde(nKunden, c.name, (x) => x.companyName || x.contactName);
    if (k) {
      kundeZuordnung.set(c.id, k.id);
      const patch: Record<string, string> = {};
      if (!k.shortCode && c.shortCode) patch.shortCode = c.shortCode;
      if (!k.notes && c.notes) patch.notes = c.notes;
      if (!k.addressFree && c.address) patch.addressFree = c.address;
      if (!k.street && c.address) {
        const a = zerlege(c.address);
        if (a.street) patch.street = a.street;
        if (a.zip) patch.zip = a.zip;
        if (a.city) patch.city = a.city;
      }
      if (Object.keys(patch).length) {
        tat(`Kunde ergänzt (Nexus): ${k.companyName} ← ${JSON.stringify(patch)}`);
        if (!TROCKEN) await prisma.customer.update({ where: { id: k.id }, data: patch });
        kdErgaenztNexus++;
      }
      // Gegenrichtung: leere Felder in clocker füllen
      const cPatch: Record<string, string> = {};
      if (!c.shortCode && k.shortCode) cPatch.shortCode = k.shortCode;
      if (!c.notes && k.notes) cPatch.notes = k.notes;
      if (!c.address) {
        const adr = [k.street, [k.zip, k.city].filter(Boolean).join(" ")].filter(Boolean).join(", ") || k.addressFree;
        if (adr) cPatch.address = adr;
      }
      if (Object.keys(cPatch).length) {
        tat(`Kunde ergänzt (clocker): ${c.name} ← ${JSON.stringify(cPatch)}`);
        if (!TROCKEN) {
          const sp = Object.keys(cPatch);
          await clocker.query(
            `UPDATE "Client" SET ${sp.map((s, i) => `"${s}" = $${i + 1}`).join(", ")} WHERE id = $${sp.length + 1}`,
            [...sp.map((s) => cPatch[s]), c.id]
          );
        }
        kdErgaenztClocker++;
      }
    } else {
      tat(`Kunde neu in Nexus: ${c.name}`);
      if (!TROCKEN) {
        const a = zerlege(c.address || "");
        const neu = await prisma.customer.create({
          data: {
            companyName: c.name, shortCode: c.shortCode || "", color: c.color || "#3b82f6",
            street: a.street, zip: a.zip, city: a.city, addressFree: c.address || "", notes: c.notes || "",
          },
        });
        kundeZuordnung.set(c.id, neu.id);
      }
      kdNeuNexus++;
    }
  }

  if (NACH_CLOCKER) {
    const cNamen = cKunden.map((c: any) => c.name);
    for (const k of nKunden) {
      const name = (k.companyName || "").trim();
      if (!name) continue;
      if (finde(cKunden, name, (x: any) => x.name)) continue;
      tat(`Kunde neu in clocker: ${name}`);
      if (!TROCKEN) {
        await clocker.query(
          `INSERT INTO "Client" (id, name, "shortCode", color, address, notes, "createdAt")
           VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, now())
           ON CONFLICT (name) DO NOTHING`,
          [name, k.shortCode || "", k.color || "#3b82f6",
           [k.street, [k.zip, k.city].filter(Boolean).join(" ")].filter(Boolean).join(", ") || k.addressFree || "",
           k.notes || ""]
        );
      }
      cNamen.push(name);
      kdNeuClocker++;
    }
  }
  console.log(`Kunden: Nexus ${nKunden.length} · clocker ${cKunden.length} · ergänzt Nexus ${kdErgaenztNexus} / clocker ${kdErgaenztClocker} · neu Nexus ${kdNeuNexus} / clocker ${kdNeuClocker}`);

  // ────────────────────────────── Projekte ──────────────────────────────────
  const nProj = await prisma.project.findMany({ where: { deletedAt: null } });
  const cProj = (await clocker.query(`SELECT id, name, "clientId", color, archived FROM "Project"`)).rows;
  let prErgaenzt = 0, prNeuNexus = 0, prNeuClocker = 0;

  for (const c of cProj) {
    const p = finde(nProj, c.name, (x) => x.name);
    if (p) {
      const patch: Record<string, unknown> = {};
      if (!p.color && c.color) patch.color = c.color;
      // Kundenzuordnung nachtragen, wenn in Nexus noch keine hinterlegt ist
      if (!p.customerId && c.clientId && kundeZuordnung.has(c.clientId)) patch.customerId = kundeZuordnung.get(c.clientId);
      if (Object.keys(patch).length) {
        tat(`Projekt ergänzt: ${p.name} ← ${JSON.stringify(patch)}`);
        if (!TROCKEN) await prisma.project.update({ where: { id: p.id }, data: patch });
        prErgaenzt++;
      }
    } else {
      tat(`Projekt neu in Nexus: ${c.name}`);
      if (!TROCKEN) {
        await prisma.project.create({
          data: {
            name: c.name,
            color: c.color || "#7c3cc0",
            archived: !!c.archived,
            customerId: c.clientId && kundeZuordnung.has(c.clientId) ? kundeZuordnung.get(c.clientId)! : null,
          },
        });
      }
      prNeuNexus++;
    }
  }

  if (NACH_CLOCKER) {
    for (const p of nProj) {
      if (!p.name?.trim()) continue;
      if (finde(cProj, p.name, (x: any) => x.name)) continue;
      tat(`Projekt neu in clocker: ${p.name}`);
      if (!TROCKEN) {
        // Kunde in clocker suchen (nur verknüpfen, nicht neu anlegen)
        let clientId: string | null = null;
        if (p.customerId) {
          const k = nKunden.find((x) => x.id === p.customerId);
          if (k?.companyName) {
            const c = finde(cKunden, k.companyName, (x: any) => x.name);
            clientId = c ? (c as any).id : null;
          }
        }
        await clocker.query(
          `INSERT INTO "Project" (id, name, "clientId", color, archived, "createdAt")
           VALUES (gen_random_uuid()::text, $1, $2, $3, $4, now())`,
          [p.name, clientId, p.color || "#7c3cc0", !!p.archived]
        );
      }
      prNeuClocker++;
    }
  }
  console.log(`Projekte: Nexus ${nProj.length} · clocker ${cProj.length} · ergänzt ${prErgaenzt} · neu Nexus ${prNeuNexus} / clocker ${prNeuClocker}`);

  if (!TROCKEN) {
    const n = {
      org: await prisma.organization.count({ where: { deletedAt: null } }),
      kd: await prisma.customer.count({ where: { deletedAt: null } }),
      pr: await prisma.project.count({ where: { deletedAt: null } }),
    };
    const c = {
      org: (await clocker.query(`SELECT count(*)::int n FROM "Company"`)).rows[0].n,
      kd: (await clocker.query(`SELECT count(*)::int n FROM "Client"`)).rows[0].n,
      pr: (await clocker.query(`SELECT count(*)::int n FROM "Project"`)).rows[0].n,
    };
    console.log(`\nBestand: Firmen ${n.org}/${c.org} · Kunden ${n.kd}/${c.kd} · Projekte ${n.pr}/${c.pr}  (Nexus/clocker)`);
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); await clocker.end().catch(() => {}); });
