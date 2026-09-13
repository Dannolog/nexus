/**
 * Kontakt-Abgleich Nexus ⇄ ProjectEye — **beidseitig** (Lieferanten-Ansprechpartner)
 * und **einseitig** für das ProjectEye-Adressbuch (`savedEmails` → Nexus).
 *
 * Protokoll für alle Apps: /mnt/devip3/shared/sync/KONTAKTE.md
 *
 * ProjectEye hält seine Daten in einer JSON-Datei, die der laufende Server im Speicher führt.
 * **Gelesen** wird die Datei direkt, **geschrieben** ausschließlich über die HTTP-API
 * (`PATCH /api/suppliers/:id`) – sonst überschreibt der Server unsere Änderung beim
 * nächsten eigenen Speichern.
 *
 * Zuordnung:
 *   Lieferant: Nexus `Supplier.projecteyeId` ⇄ ProjectEye `suppliers[].id`
 *   Person:    `Contact.projecteyeId` = `sup:<peId>` (der im Lieferanten hinterlegte
 *              Ansprechpartner) bzw. `mail:<adresse>` (Adressbuch-Eintrag)
 *
 * Konfliktregel: Leere Felder werden von der Gegenseite gefüllt; sind beide gefüllt und
 * verschieden, gewinnt **Nexus** (führt den Kontaktbestand). Geschrieben wird nur bei
 * echter Abweichung. Gelöscht wird nichts automatisch.
 *
 * Aufruf:
 *   TS_NODE_TRANSPILE_ONLY=1 node node_modules/ts-node/dist/bin.js \
 *     --compiler-options '{"module":"CommonJS","moduleResolution":"node"}' \
 *     prisma/sync-projecteye-kontakte.ts [--dry]
 */
import fs from "fs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const QUELLE = process.env.PROJECTEYE_DATA || "/mnt/devip3/ProjectEye/server/data/projecteye.json";
const PE_API = process.env.PROJECTEYE_API || "http://localhost:3040";
const TROCKEN = process.argv.includes("--dry");
const tat = (t: string) => console.log(`${TROCKEN ? "[Probelauf] " : ""}${t}`);

type PeLieferant = { id: number; firma?: string; ansprech?: string; email?: string; tel?: string };
type PeMail = { email: string; name?: string; lastUsedAt?: string };

const nameKey = (s: string) => String(s || "").toLowerCase().replace(/[^a-z0-9äöüß]+/g, "");

/** Änderung an ProjectEye übergeben – niemals direkt in die Datei schreiben. */
async function peSchreiben(id: number, felder: Record<string, string>) {
  const res = await fetch(`${PE_API}/api/suppliers/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(felder),
  });
  if (!res.ok) throw new Error(`ProjectEye antwortet ${res.status}`);
}

async function main() {
  if (!fs.existsSync(QUELLE)) {
    console.error(`ProjectEye-Daten nicht gefunden: ${QUELLE}`);
    process.exit(1);
  }
  const daten = JSON.parse(fs.readFileSync(QUELLE, "utf-8"));
  const peLieferanten: PeLieferant[] = Array.isArray(daten.suppliers) ? daten.suppliers : [];
  const peMails: PeMail[] = Array.isArray(daten.savedEmails) ? daten.savedEmails : [];

  const lieferanten = await prisma.supplier.findMany({ where: { deletedAt: null } });
  const nachPeId = new Map(lieferanten.filter((s) => s.projecteyeId != null).map((s) => [Number(s.projecteyeId), s]));
  const kontakte = await prisma.contact.findMany({ where: { deletedAt: null } });

  console.log(
    `ProjectEye: ${peLieferanten.length} Lieferanten · ${peMails.length} Adressbuch-Einträge` +
      `${TROCKEN ? "  (Probelauf – es wird nichts geschrieben)" : ""}`
  );

  let neuInNexus = 0, nachNexus = 0, nachPe = 0, ohneLieferant = 0, mailsNeu = 0;

  // ---------- 1) Ansprechpartner der Lieferanten ----------
  for (const pl of peLieferanten) {
    const name = String(pl.ansprech || "").trim();
    const email = String(pl.email || "").trim();
    const tel = String(pl.tel || "").trim();
    if (!name && !email && !tel) continue;

    const lieferant = nachPeId.get(Number(pl.id));
    if (!lieferant) { ohneLieferant++; continue; }  // Lieferanten-Abgleich läuft zuerst

    const merker = `sup:${pl.id}`;
    const eigene = kontakte.filter((c) => c.ownerKind === "supplier" && c.ownerId === lieferant.id);
    let n =
      kontakte.find((c) => c.projecteyeId === merker) ||
      (email && eigene.find((c) => c.email.toLowerCase() === email.toLowerCase())) ||
      (name && eigene.find((c) => nameKey(c.name) === nameKey(name))) ||
      null;

    if (!n) {
      tat(`Nexus anlegen: Ansprechpartner von „${lieferant.name}"`);
      if (!TROCKEN) {
        const neu = await prisma.contact.create({
          data: {
            name: name || lieferant.name, role: "", email, phone: tel, mobile: "",
            ownerKind: "supplier", ownerId: lieferant.id, ownerName: lieferant.name,
            supplierId: lieferant.id, source: "projecteye", projecteyeId: merker,
          },
        });
        kontakte.push(neu);
      }
      neuInNexus++;
      continue;
    }

    const patchNexus: Record<string, string> = {};
    const patchPe: Record<string, string> = {};
    const feld = (nexusFeld: "name" | "email" | "phone", peWert: string, peFeld: "ansprech" | "email" | "tel") => {
      const nw = String((n as any)[nexusFeld] || "").trim();
      const pw = String(peWert || "").trim();
      if (nw === pw) return;
      if (!nw && pw) patchNexus[nexusFeld] = pw;   // Nexus leer → aus ProjectEye füllen
      else if (nw) patchPe[peFeld] = nw;           // sonst gewinnt Nexus
    };
    feld("name", name, "ansprech");
    feld("email", email, "email");
    feld("phone", tel, "tel");

    if (Object.keys(patchNexus).length) {
      tat(`Nexus ← ProjectEye: ${Object.keys(patchNexus).join(", ")} (${lieferant.name})`);
      if (!TROCKEN) await prisma.contact.update({ where: { id: n.id }, data: { ...patchNexus, version: n.version + 1 } });
      nachNexus++;
    }
    if (Object.keys(patchPe).length) {
      tat(`ProjectEye ← Nexus: ${Object.keys(patchPe).join(", ")} (${lieferant.name})`);
      if (!TROCKEN) {
        try { await peSchreiben(pl.id, patchPe); }
        catch (e: any) { console.warn(`  ! ProjectEye nicht erreichbar (${e.message}) – Änderung bleibt offen`); }
      }
      nachPe++;
    }
    if (!TROCKEN && n.projecteyeId !== merker) {
      await prisma.contact.update({ where: { id: n.id }, data: { projecteyeId: merker } });
    }
  }

  // ---------- 2) Adressbuch (savedEmails) → freie Kontakte in Nexus ----------
  const bekannteMails = new Set(kontakte.map((c) => c.email.trim().toLowerCase()).filter(Boolean));
  for (const m of peMails) {
    const mail = String(m.email || "").trim().toLowerCase();
    if (!mail || !mail.includes("@")) continue;
    if (bekannteMails.has(mail)) continue;
    if (!TROCKEN) {
      await prisma.contact.create({
        data: {
          name: String(m.name || "").trim() || mail.split("@")[0],
          email: mail, ownerKind: "frei", source: "projecteye", projecteyeId: `mail:${mail}`,
          notes: "aus dem ProjectEye-Adressbuch übernommen",
        },
      });
    }
    bekannteMails.add(mail);
    mailsNeu++;
  }

  console.log("\n— Ergebnis —");
  console.log(`Ansprechpartner: neu in Nexus ${neuInNexus} · Nexus aktualisiert ${nachNexus} · ProjectEye aktualisiert ${nachPe}`);
  if (ohneLieferant) console.log(`${ohneLieferant} ProjectEye-Lieferanten sind noch keinem Nexus-Lieferanten zugeordnet (erst den Lieferanten-Abgleich laufen lassen).`);
  console.log(`Adressbuch: ${mailsNeu} neue freie Kontakte übernommen`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
