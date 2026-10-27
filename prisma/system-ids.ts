/**
 * System-ID für alle Mitarbeiter: legt fehlende zentrale Identitäten an bzw. verknüpft
 * passende vorhandene (siehe src/lib/systemId.ts). Läuft im Abgleich (scripts/sync-watch.js)
 * nach jedem clocker-/kontor-Lauf mit, damit auch dort angelegte Mitarbeiter sofort in der
 * Userverwaltung erscheinen. Ausgabe nur Zahlen.
 *   prisma/system-ids.ts [--dry]
 */
import { PrismaClient } from "@prisma/client";
import { systemIdSichern } from "../src/lib/systemId";

const prisma = new PrismaClient();
const TROCKEN = process.argv.includes("--dry");

(async () => {
  const offen = await prisma.employee.findMany({ where: { deletedAt: null, identityId: null } });
  const z = { geprueft: offen.length, angelegt: 0, verknuepft: 0, offen: 0 };
  for (const e of offen) {
    if (TROCKEN) continue;
    const r = await prisma.$transaction((tx) => systemIdSichern(tx, e));
    if (r?.art === "angelegt") z.angelegt++;
    else if (r?.art === "verknuepft") z.verknuepft++;
    else {
      const jetzt = await prisma.employee.findUnique({ where: { id: e.id } });
      if (!jetzt?.identityId) z.offen++;
    }
  }
  console.log(`System-IDs: ${z.geprueft} ohne Identität geprüft · ${z.angelegt} angelegt · ${z.verknuepft} verknüpft · ${z.offen} offen${TROCKEN ? " (Probelauf)" : ""}`);
  await prisma.$disconnect();
})().catch(async (e) => { console.error(e?.message || e); await prisma.$disconnect(); process.exit(1); });
