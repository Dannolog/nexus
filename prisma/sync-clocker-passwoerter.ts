/**
 * Passwort-Abgleich Nexus → clocker.
 *
 * Hintergrund: clocker prüft die Anmeldung **ausschließlich gegen seinen lokalen Benutzer**
 * (`src/lib/auth.ts`: `prisma.user.findUnique({ email })` + `bcrypt.compare`). Wird ein Passwort
 * in Nexus geändert, bleibt in clocker der alte Hash stehen – die Anmeldung scheitert.
 * Dieses Skript überträgt den bcrypt-Hash der zentralen Identität in den clocker-Benutzer.
 *
 * Geschrieben wird nur, wenn die Nexus-Identität **jünger** ist als der clocker-Benutzer –
 * so überschreibt der Abgleich keine Änderung, die gerade in clocker selbst vorgenommen wurde.
 *
 * Zuordnung wie beim Mitarbeiter-Abgleich:
 *   1. gemerkte Verknüpfung (`IdentityAppAccess.localUserId` für „clocker")
 *   2. E-Mail
 *
 * Der Klartext eines Passworts wird dabei nie bewegt – nur der bereits vorhandene Hash.
 * Die Ausgabe enthält ausschließlich Zähler, keine Kennungen.
 *
 * Aufruf:
 *   TS_NODE_TRANSPILE_ONLY=1 node node_modules/ts-node/dist/bin.js \
 *     --compiler-options '{"module":"CommonJS","moduleResolution":"node"}' \
 *     prisma/sync-clocker-passwoerter.ts [--dry] [--entsperren]
 *
 *   --entsperren  hebt zusätzlich Kontosperren auf, die durch Fehlversuche entstanden sind
 */
import { Client as PgClient } from "pg";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const clocker = new PgClient({
  connectionString: process.env.CLOCKER_DATABASE_URL || "postgresql://clocker:clocker_pw@localhost:5432/clocker",
});
const TROCKEN = process.argv.includes("--dry");
const ENTSPERREN = process.argv.includes("--entsperren");

async function main() {
  await clocker.connect();

  const identitaeten = await prisma.identity.findMany({
    where: { deletedAt: null },
    include: { appAccess: true },
  });
  const lokale: { id: string; email: string; password: string; updatedAt: Date; active: boolean | null; lockedUntil: Date | null }[] = (
    await clocker.query(
      `SELECT id, lower(email) AS email, password, "updatedAt",
              coalesce(active, true) AS active, "lockedUntil"
         FROM "User"`
    )
  ).rows;

  const nachId = new Map(lokale.map((u) => [u.id, u]));
  const nachMail = new Map(lokale.map((u) => [u.email, u]));

  let geprueft = 0, aktualisiert = 0, nurClockerNeuer = 0, ohneGegenstueck = 0, entsperrt = 0, deaktiviert = 0;

  for (const i of identitaeten) {
    const zugriff = i.appAccess.find((a) => a.appKey === "clocker");
    const lokal = (zugriff?.localUserId ? nachId.get(zugriff.localUserId) : undefined)
      ?? nachMail.get(i.email.toLowerCase());
    if (!lokal) { ohneGegenstueck++; continue; }
    geprueft++;

    // Verknüpfung festziehen, damit die Zuordnung künftig ohne E-Mail hält
    if (!TROCKEN && zugriff && zugriff.localUserId !== lokal.id) {
      await prisma.identityAppAccess.update({
        where: { id: zugriff.id },
        data: { localUserId: lokal.id, syncedAt: new Date() },
      });
    }

    if (lokal.active === false) deaktiviert++;

    if (ENTSPERREN && lokal.lockedUntil && lokal.lockedUntil > new Date()) {
      if (!TROCKEN) await clocker.query(`UPDATE "User" SET "lockedUntil" = NULL WHERE id = $1`, [lokal.id]);
      entsperrt++;
    }

    if (!i.passwordHash || i.passwordHash === lokal.password) continue;

    // Nur übertragen, wenn die zentrale Fassung die jüngere ist
    if (new Date(i.updatedAt).getTime() <= new Date(lokal.updatedAt).getTime()) { nurClockerNeuer++; continue; }

    if (!TROCKEN) {
      await clocker.query(`UPDATE "User" SET password = $1, "updatedAt" = now() WHERE id = $2`, [i.passwordHash, lokal.id]);
    }
    aktualisiert++;
  }

  console.log(`${TROCKEN ? "[Probelauf] " : ""}Zugänge geprüft: ${geprueft} · Passwort angeglichen: ${aktualisiert}`);
  if (nurClockerNeuer) console.log(`${nurClockerNeuer} Konto(en) sind in clocker jünger – dort zuletzt geändert, nichts überschrieben.`);
  if (ohneGegenstueck) console.log(`${ohneGegenstueck} zentrale Zugänge haben keinen clocker-Benutzer (kein Zugriff nötig oder noch nicht angelegt).`);
  if (deaktiviert) console.log(`Hinweis: ${deaktiviert} zugeordnete clocker-Konten sind dort **deaktiviert** – sie kommen trotz richtigem Passwort nicht hinein.`);
  if (entsperrt) console.log(`Kontosperren nach Fehlversuchen aufgehoben: ${entsperrt}`);
  else if (!ENTSPERREN) {
    const gesperrt = lokale.filter((u) => u.lockedUntil && u.lockedUntil > new Date()).length;
    if (gesperrt) console.log(`Hinweis: ${gesperrt} clocker-Konto(en) sind wegen Fehlversuchen gesperrt – mit --entsperren aufheben.`);
  }
}

main()
  .catch((e) => { console.error("Fehler:", e.message); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); await clocker.end().catch(() => {}); });
