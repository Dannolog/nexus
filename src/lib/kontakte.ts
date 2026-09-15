import { prisma } from "./prisma";

/**
 * Zentrales Kontaktregister – gemeinsame Logik für API und Abgleich.
 *
 * Ein Kontakt gehört entweder zu einer Firma (Kunde, Lieferant, Mandant) oder steht frei.
 * Die Zugehörigkeit steht doppelt im Datensatz: generisch als `ownerKind`/`ownerId`
 * (dadurch sind auch Mandanten und freie Kontakte abgedeckt) und – bei Kunden/Lieferanten –
 * zusätzlich als echte Verknüpfung `customerId`/`supplierId`, damit die Listen ihre
 * Ansprechpartner mitladen und die Suche sie findet. Beide werden hier gemeinsam gesetzt.
 *
 * Protokoll für alle Apps: /mnt/devip3/shared/sync/KONTAKTE.md
 */

export type OwnerArt = "customer" | "supplier" | "organization" | "frei";

export const nameKey = (s: string) => String(s || "").toLowerCase().replace(/[^a-z0-9äöüß]+/g, "");

/**
 * Firmenzuordnung in die Felder übersetzen, die gespeichert werden.
 *
 * Bei „frei" gibt es keinen Stammdatensatz – dort zählt der **eingetippte** Name
 * (Shop, Vertretung, sonstige Firma). Deshalb wird `freierName` übernommen statt geleert.
 */
export async function ownerFelder(ownerKind: string, ownerId: string, freierName = "") {
  const art = (["customer", "supplier", "organization", "frei"].includes(ownerKind) ? ownerKind : "frei") as OwnerArt;
  if (art === "frei" || !ownerId) {
    return { ownerKind: "frei", ownerId: "", ownerName: String(freierName || "").trim(), customerId: null, supplierId: null };
  }
  if (art === "customer") {
    const k = await prisma.customer.findFirst({ where: { id: ownerId, deletedAt: null } });
    return {
      ownerKind: art, ownerId, ownerName: k?.companyName || k?.contactName || "",
      customerId: k ? ownerId : null, supplierId: null,
    };
  }
  if (art === "supplier") {
    const l = await prisma.supplier.findFirst({ where: { id: ownerId, deletedAt: null } });
    return { ownerKind: art, ownerId, ownerName: l?.name || "", customerId: null, supplierId: l ? ownerId : null };
  }
  const o = await prisma.organization.findFirst({ where: { id: ownerId, deletedAt: null } });
  return { ownerKind: art, ownerId, ownerName: o?.name || "", customerId: null, supplierId: null };
}

/** Sucht einen bestehenden Kontakt derselben Firma – erst über E-Mail, dann über den Namen. */
export async function findeKontakt(ownerKind: string, ownerId: string, name: string, email: string) {
  const mail = String(email || "").trim().toLowerCase();
  const treffer = await prisma.contact.findMany({
    where: { deletedAt: null, ownerKind, ownerId },
  });
  if (mail) {
    const perMail = treffer.find((c) => c.email.toLowerCase() === mail);
    if (perMail) return perMail;
  }
  const k = nameKey(name);
  return treffer.find((c) => nameKey(c.name) === k) || null;
}

/** Felder, die eine Liste ausliefert (Notizen inklusive – sie gehören zum Kontakt). */
export const KONTAKT_FELDER = {
  id: true, name: true, firstName: true, lastName: true, role: true, email: true, phone: true, mobile: true, notes: true, category: true,
  ownerKind: true, ownerId: true, ownerName: true, source: true, favorite: true,
  kontorId: true, clockerId: true, projecteyeId: true, version: true, createdAt: true, updatedAt: true,
  // Private Angaben – bleiben in Nexus, werden nie in die Fachanwendungen gespiegelt
  privatePhone: true, privateMobile: true, privateEmail: true,
  privateStreet: true, privateZip: true, privateCity: true, birthday: true, privateNotes: true,
} as const;

/**
 * Mehrere Kommunikationswege je Kontakt. Der **erste** Eintrag je Art wird zusätzlich in
 * die Hauptfelder `email`/`phone`/`mobile` geschrieben – nur die gehen in den Abgleich mit
 * kontor, clocker und ProjectEye, die dort je ein Feld je Art führen.
 */
export type Kanal = { kind: string; value: string; label?: string };

export const KANAL_ARTEN = ["email", "phone", "mobile", "fax", "web"] as const;

/** Aus der Kanalliste die Hauptwerte ableiten (erster Eintrag je Art gewinnt). */
export function hauptwerteAusKanaelen(kanaele: Kanal[]) {
  const ersten = (art: string) =>
    kanaele.find((k) => k.kind === art && String(k.value || "").trim())?.value.trim() || "";
  return { email: ersten("email"), phone: ersten("phone"), mobile: ersten("mobile") };
}

/** Name zusammensetzen: „Vorname Nachname", sonst der übergebene Anzeigename. */
export function nameAus(firstName?: string, lastName?: string, fallback?: string) {
  const zusammen = [String(firstName || "").trim(), String(lastName || "").trim()].filter(Boolean).join(" ");
  return zusammen || String(fallback || "").trim();
}

/** Anzeigenamen in Vor- und Nachnamen zerlegen (letzter Bestandteil = Nachname). */
export function zerlegeName(name: string) {
  const teile = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (teile.length === 0) return { firstName: "", lastName: "" };
  if (teile.length === 1) return { firstName: "", lastName: teile[0] };
  return { firstName: teile.slice(0, -1).join(" "), lastName: teile[teile.length - 1] };
}

/** Private Felder eines Kontakts – Schreibweg und Dokumentation an einer Stelle. */
export const PRIVATE_TEXTFELDER = [
  "privatePhone", "privateMobile", "privateEmail",
  "privateStreet", "privateZip", "privateCity", "privateNotes",
] as const;
