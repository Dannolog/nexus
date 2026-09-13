/**
 * Einmalige Übernahme: bestehende Ansprechpartner (CustomerContact, SupplierContact)
 * wandern ins zentrale Kontaktregister (`Contact`). Der Altbestand bleibt unangetastet
 * liegen (Archiv) – es wird nichts gelöscht.
 *
 * Idempotent: Ein Kontakt gilt als vorhanden, wenn es zur selben Firma bereits einen
 * Eintrag mit gleicher E-Mail oder gleichem normalisierten Namen gibt.
 *
 * Aufruf:
 *   TS_NODE_TRANSPILE_ONLY=1 node node_modules/ts-node/dist/bin.js \
 *     --compiler-options '{"module":"CommonJS","moduleResolution":"node"}' \
 *     prisma/kontakte-uebernehmen.ts [--dry]
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const TROCKEN = process.argv.includes("--dry");

const nameKey = (s: string) => String(s || "").toLowerCase().replace(/[^a-z0-9äöüß]+/g, "");

async function main() {
  const kunden = await prisma.customer.findMany({
    where: { deletedAt: null },
    include: { legacyContacts: true, contacts: { where: { deletedAt: null } } },
  });
  const lieferanten = await prisma.supplier.findMany({
    where: { deletedAt: null },
    include: { legacyContacts: true, contacts: { where: { deletedAt: null } } },
  });

  let neu = 0, schon = 0;

  const uebernehmen = async (
    alt: { name: string; role: string; email: string; phone: string; mobile: string; notes?: string },
    vorhanden: { name: string; email: string }[],
    ownerKind: "customer" | "supplier",
    ownerId: string,
    ownerName: string
  ) => {
    const mail = (alt.email || "").trim().toLowerCase();
    const doppelt = vorhanden.some(
      (c) => (mail && (c.email || "").toLowerCase() === mail) || nameKey(c.name) === nameKey(alt.name)
    );
    if (doppelt) { schon++; return; }
    if (!TROCKEN) {
      await prisma.contact.create({
        data: {
          name: alt.name, role: alt.role || "", email: alt.email || "",
          phone: alt.phone || "", mobile: alt.mobile || "", notes: (alt as any).notes || "",
          ownerKind, ownerId, ownerName,
          ...(ownerKind === "customer" ? { customerId: ownerId } : { supplierId: ownerId }),
          source: "nexus",
        },
      });
    }
    neu++;
  };

  for (const k of kunden) {
    for (const a of k.legacyContacts) {
      await uebernehmen(a as any, k.contacts, "customer", k.id, k.companyName || k.contactName || "");
    }
  }
  for (const l of lieferanten) {
    for (const a of l.legacyContacts) {
      await uebernehmen(a as any, l.contacts, "supplier", l.id, l.name);
    }
  }

  console.log(`${TROCKEN ? "[Probelauf] " : ""}Übernommen: ${neu} · bereits vorhanden: ${schon}`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
