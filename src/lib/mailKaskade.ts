import { ApiError } from "./http";

/**
 * E-Mail-Kaskade zwischen **Mitarbeiter** (Employee) und **Login** (Identity).
 *
 * Die Adresse ist in Nexus die Kennung, mit der sich ein Mensch in allen Apps anmeldet
 * (kontor, clocker, …). Wird sie an einer Stelle geändert, muss sie überall mitziehen –
 * sonst meldet sich der Mitarbeiter weiter mit der alten Adresse an, und der Abgleich
 * legt in den Apps einen zweiten Datensatz an.
 *
 * Diese Funktion zieht deshalb bei jeder E-Mail-Änderung die Gegenseite nach und
 * verfestigt dabei die Verknüpfung (`Employee.identityId` ⇄ `Identity.employeeId`).
 * Die Weitergabe in die Apps übernehmen anschließend die Abgleich-Skripte
 * (`prisma/sync-clocker-employees.ts`, `prisma/sync-kontor-benutzer.ts`), die über den
 * DB-Trigger `nexus_sync_trg` sofort anlaufen.
 *
 * `tx` ist ein Prisma-Client oder eine laufende Transaktion – dadurch nutzbar aus den
 * API-Routen wie aus den Abgleich-Skripten.
 */
type Tx = any;

const gleich = (a?: string | null, b?: string | null) =>
  String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();

/** Sucht die zum Mitarbeiter gehörende Identität: Verknüpfung zuerst, alte Adresse zuletzt. */
export async function identitaetZuMitarbeiter(tx: Tx, emp: { id: string; identityId?: string | null }, alteMail?: string) {
  if (emp.identityId) {
    const i = await tx.identity.findFirst({ where: { id: emp.identityId, deletedAt: null } });
    if (i) return i;
  }
  const ueberRueckbezug = await tx.identity.findFirst({ where: { employeeId: emp.id, deletedAt: null } });
  if (ueberRueckbezug) return ueberRueckbezug;
  const mail = String(alteMail || "").trim();
  if (!mail) return null;
  return tx.identity.findFirst({ where: { email: mail, deletedAt: null } });
}

/** Sucht den zur Identität gehörenden Mitarbeiter: Verknüpfung zuerst, alte Adresse zuletzt. */
export async function mitarbeiterZuIdentitaet(tx: Tx, ident: { id: string; employeeId?: string | null }, alteMail?: string) {
  if (ident.employeeId) {
    const e = await tx.employee.findFirst({ where: { id: ident.employeeId, deletedAt: null } });
    if (e) return e;
  }
  const ueberRueckbezug = await tx.employee.findFirst({ where: { identityId: ident.id, deletedAt: null } });
  if (ueberRueckbezug) return ueberRueckbezug;
  const mail = String(alteMail || "").trim();
  if (!mail) return null;
  return tx.employee.findFirst({ where: { email: mail, deletedAt: null } });
}

export type KaskadeErgebnis = {
  entity: "Employee" | "Identity";
  id: string;
  before: any;
  after: any;
} | null;

/**
 * Zieht eine geänderte E-Mail auf die Gegenseite nach.
 *
 * @param quelle  Wo wurde geändert – beim Mitarbeiter oder beim Login?
 * @returns Der mitgeänderte Datensatz (für den Verlauf) oder `null`, wenn es keine
 *          Gegenseite gibt bzw. dort schon dieselbe Adresse steht.
 * @throws  ApiError 409, wenn die neue Adresse auf der Gegenseite schon vergeben ist.
 */
export async function mailKaskade(
  tx: Tx,
  quelle: "Employee" | "Identity",
  satz: { id: string; identityId?: string | null; employeeId?: string | null },
  alteMail: string,
  neueMail: string,
  name?: string
): Promise<KaskadeErgebnis> {
  const neu = String(neueMail || "").trim();
  if (!neu || gleich(alteMail, neu)) return null;

  if (quelle === "Employee") {
    const ident = await identitaetZuMitarbeiter(tx, satz, alteMail);
    if (!ident) return null;

    const fremd = await tx.identity.findFirst({ where: { email: neu, deletedAt: null, NOT: { id: ident.id } } });
    if (fremd) {
      throw new ApiError(`Die E-Mail „${neu}" gehört bereits zum Zugang „${fremd.name || fremd.email}" – bitte dort zuerst ändern.`, 409);
    }

    if (gleich(ident.email, neu)) {
      // Adresse passt bereits – nur die Verknüpfung festziehen
      await verknuepfe(tx, satz.id, ident.id);
      return null;
    }

    const after = await tx.identity.update({
      where: { id: ident.id },
      data: {
        email: neu,
        ...(name && !ident.name ? { name } : {}),
        employeeId: satz.id,
        version: (ident.version ?? 1) + 1,
      },
    });
    await verknuepfe(tx, satz.id, ident.id);
    return { entity: "Identity", id: ident.id, before: ident, after };
  }

  const emp = await mitarbeiterZuIdentitaet(tx, satz, alteMail);
  if (!emp) return null;

  const fremd = await tx.employee.findFirst({ where: { email: neu, deletedAt: null, NOT: { id: emp.id } } });
  if (fremd) {
    throw new ApiError(`Die E-Mail „${neu}" ist bereits beim Mitarbeiter „${fremd.name}" hinterlegt – bitte dort zuerst ändern.`, 409);
  }

  if (gleich(emp.email, neu)) {
    await verknuepfe(tx, emp.id, satz.id);
    return null;
  }

  const after = await tx.employee.update({
    where: { id: emp.id },
    data: { email: neu, identityId: satz.id, version: (emp.version ?? 1) + 1 },
  });
  await verknuepfe(tx, emp.id, satz.id);
  return { entity: "Employee", id: emp.id, before: emp, after };
}

/** Setzt beide Rückbezüge, damit die Zuordnung auch ohne E-Mail hält. */
async function verknuepfe(tx: Tx, employeeId: string, identityId: string) {
  await tx.employee.updateMany({
    where: { id: employeeId, OR: [{ identityId: null }, { identityId: { not: identityId } }] },
    data: { identityId },
  });
  await tx.identity.updateMany({
    where: { id: identityId, OR: [{ employeeId: null }, { employeeId: { not: employeeId } }] },
    data: { employeeId },
  });
}
