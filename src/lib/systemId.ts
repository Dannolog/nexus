import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";

/**
 * System-ID für jeden Mitarbeiter: Jeder Mitarbeiter hat genau eine zentrale Identität
 * (`Identity`) – nur darüber ist er in der Userverwaltung sichtbar und bearbeitbar.
 *
 * Fehlt sie, wird zuerst eine passende vorhandene Identität verknüpft (Haupt- oder weitere
 * Anmelde-Adresse), sonst eine neue angelegt: ohne App-Freigaben und mit unbrauchbarem
 * Zufalls-Passwort – Anmelden geht erst, wenn ein Admin Passwort und Apps freigibt.
 *
 * `tx` ist ein Prisma-Client oder eine laufende Transaktion (API-Routen wie Skripte).
 * Rückgabe: die neu angelegte/verknüpfte Identität (für den Verlauf) oder `null`.
 */
type Tx = any;

export type SystemIdErgebnis = { art: "angelegt" | "verknuepft"; identity: any; before: any } | null;

export async function systemIdSichern(
  tx: Tx,
  emp: { id: string; name: string; email?: string | null; identityId?: string | null; deletedAt?: Date | null }
): Promise<SystemIdErgebnis> {
  if (emp.deletedAt) return null;
  if (emp.identityId) {
    const i = await tx.identity.findFirst({ where: { id: emp.identityId, deletedAt: null } });
    if (i) {
      if (i.employeeId !== emp.id) await tx.identity.update({ where: { id: i.id }, data: { employeeId: emp.id } });
      return null;
    }
  }
  const rueck = await tx.identity.findFirst({ where: { employeeId: emp.id, deletedAt: null } });
  if (rueck) {
    await tx.employee.update({ where: { id: emp.id }, data: { identityId: rueck.id } });
    return null;
  }

  const mail = String(emp.email || "").trim().toLowerCase();
  if (mail) {
    const weitere = await tx.identityEmail.findFirst({ where: { email: mail } });
    const passend = await tx.identity.findFirst({
      where: { deletedAt: null, OR: [{ email: mail }, ...(weitere ? [{ id: weitere.identityId }] : [])] },
    });
    if (passend) {
      // gehört schon einem anderen Mitarbeiter → nicht umhängen (Admin entscheidet)
      if (passend.employeeId && passend.employeeId !== emp.id) {
        const anderer = await tx.employee.findFirst({ where: { id: passend.employeeId, deletedAt: null } });
        if (anderer) return null;
      }
      const after = await tx.identity.update({
        where: { id: passend.id },
        data: { employeeId: emp.id, version: (passend.version ?? 1) + 1 },
      });
      await tx.employee.update({ where: { id: emp.id }, data: { identityId: passend.id } });
      return { art: "verknuepft", identity: after, before: passend };
    }
  }

  // Ohne Adresse keine Identität möglich (E-Mail ist die Anmeldekennung)
  if (!mail) return null;
  const identity = await tx.identity.create({
    data: {
      email: mail,
      name: emp.name || mail,
      passwordHash: await bcrypt.hash(randomBytes(24).toString("base64url"), 10),
      globalRole: "user",
      origin: "central",
      employeeId: emp.id,
    },
  });
  await tx.employee.update({ where: { id: emp.id }, data: { identityId: identity.id } });
  return { art: "angelegt", identity, before: null };
}
