/**
 * Lieferanten-Abgleich Nexus ⇄ ProjectEye.
 *
 * ProjectEye hält seine Daten in einer JSON-Datei (server/data/projecteye.json).
 * Dieses Skript liest sie **nur** und übernimmt die Lieferanten nach Nexus –
 * idempotent, d. h. mehrfaches Ausführen ändert nichts Zusätzliches:
 *   - Zuordnung über `projecteyeId`, ersatzweise über den normalisierten Firmennamen
 *   - neue Lieferanten werden angelegt (Nexus vergibt die zentrale Nummer)
 *   - vorhandene werden nur dort ergänzt, wo Nexus noch **leere** Felder hat
 *     (Nexus ist ab jetzt führend, nichts wird überschrieben)
 *
 * Aufruf:
 *   TS_NODE_TRANSPILE_ONLY=1 node node_modules/ts-node/dist/bin.js \
 *     --compiler-options '{"module":"CommonJS","moduleResolution":"node"}' \
 *     prisma/sync-projecteye-suppliers.ts [--dry]
 */
import fs from "fs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const QUELLE = process.env.PROJECTEYE_DATA || "/mnt/devip3/ProjectEye/server/data/projecteye.json";
const TROCKEN = process.argv.includes("--dry");

type PeLieferant = {
  id: number;
  firma?: string;
  kuerzel?: string;
  ansprech?: string;
  email?: string;
  tel?: string;
  web?: string;
  kundennr?: string;
  adresse?: string;
};

/** Firmennamen für den Abgleich vereinheitlichen (Groß/Klein, Rechtsform, Zeichen). */
function schluessel(name: string) {
  return String(name || "")
    .toLowerCase()
    .replace(/\b(gmbh|ag|kg|ohg|ug|mbh|co|kgaa|e\.?k\.?|se)\b/g, " ")
    .replace(/[^a-z0-9äöüß]+/g, "")
    .trim();
}

/** Anschrift aus ProjectEye ist unstrukturiert – PLZ/Ort herausziehen, wenn möglich. */
function zerlegeAdresse(frei: string) {
  const text = String(frei || "").replace(/\s+/g, " ").trim();
  if (!text) return { street: "", zip: "", city: "", addressFree: "" };
  const m = text.match(/^(.*?)[,\s]+D?\s*-?\s*(\d{5})\s+(.+)$/);
  if (m) return { street: m[1].trim().replace(/,$/, ""), zip: m[2], city: m[3].trim(), addressFree: text };
  return { street: "", zip: "", city: "", addressFree: text };
}

async function main() {
  if (!fs.existsSync(QUELLE)) {
    console.error(`ProjectEye-Daten nicht gefunden: ${QUELLE}`);
    process.exit(1);
  }
  const daten = JSON.parse(fs.readFileSync(QUELLE, "utf-8"));
  const liste: PeLieferant[] = Array.isArray(daten.suppliers) ? daten.suppliers : [];
  console.log(`ProjectEye: ${liste.length} Lieferanten gefunden${TROCKEN ? " (Probelauf, es wird nichts geschrieben)" : ""}`);

  const vorhandene = await prisma.supplier.findMany({ where: { deletedAt: null } });
  const nachPeId = new Map(vorhandene.filter((s) => s.projecteyeId != null).map((s) => [s.projecteyeId as number, s]));
  const nachName = new Map(vorhandene.map((s) => [schluessel(s.name), s]));

  let neu = 0, ergaenzt = 0, unveraendert = 0;

  for (const l of liste) {
    const name = String(l.firma || "").trim();
    if (!name) continue;
    const adresse = zerlegeAdresse(l.adresse || "");
    const treffer = nachPeId.get(l.id) || nachName.get(schluessel(name));

    if (!treffer) {
      if (!TROCKEN) {
        // Nummer wie in der API vergeben: höchste + 1 (inkl. gelöschter, damit nichts doppelt ist)
        const max = await prisma.supplier.aggregate({ _max: { number: true } });
        await prisma.supplier.create({
          data: {
            number: (max._max.number ?? 0) + 1,
            name,
            shortCode: l.kuerzel || "",
            contactName: l.ansprech || "",
            email: l.email || "",
            phone: l.tel || "",
            web: l.web || "",
            customerNumber: l.kundennr || "",
            street: adresse.street,
            zip: adresse.zip,
            city: adresse.city,
            addressFree: adresse.addressFree,
            projecteyeId: l.id,
          },
        });
      }
      neu++;
      continue;
    }

    // Vorhandenen Datensatz nur dort ergänzen, wo Nexus nichts hat
    const zusatz: Record<string, unknown> = {};
    const ergaenze = (feld: string, wert: string) => {
      if (wert && !(treffer as any)[feld]) zusatz[feld] = wert;
    };
    ergaenze("shortCode", l.kuerzel || "");
    ergaenze("contactName", l.ansprech || "");
    ergaenze("email", l.email || "");
    ergaenze("phone", l.tel || "");
    ergaenze("web", l.web || "");
    ergaenze("customerNumber", l.kundennr || "");
    ergaenze("street", adresse.street);
    ergaenze("zip", adresse.zip);
    ergaenze("city", adresse.city);
    ergaenze("addressFree", adresse.addressFree);
    if (treffer.projecteyeId == null) zusatz.projecteyeId = l.id;

    if (Object.keys(zusatz).length) {
      if (!TROCKEN) await prisma.supplier.update({ where: { id: treffer.id }, data: zusatz });
      ergaenzt++;
    } else {
      unveraendert++;
    }
  }

  const gesamt = await prisma.supplier.count({ where: { deletedAt: null } });
  console.log(`neu angelegt: ${neu} · ergänzt: ${ergaenzt} · unverändert: ${unveraendert}`);
  console.log(`Lieferanten in Nexus insgesamt: ${TROCKEN ? gesamt + " (vor dem Probelauf)" : gesamt}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
