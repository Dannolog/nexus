/**
 * Benutzer-Abgleich Nexus → kontor.
 *
 * Hintergrund: kontor sucht beim Anmelden **zuerst den lokalen Benutzer** über die
 * E-Mail (`src/lib/auth.ts`). Wer in Nexus für kontor freigegeben ist, aber dort keinen
 * lokalen Datensatz hat, kann sich schlicht nicht anmelden – unabhängig von der Freigabe.
 * Dieses Skript legt genau diese Benutzer in kontor an.
 *
 * Übernommen wird auch der **bcrypt-Hash** aus Nexus. Dadurch gilt dasselbe Passwort in
 * beiden Anwendungen, ohne dass es je im Klartext bewegt wird.
 *
 * Freigegeben heißt: `IdentityAppAccess` für „kontor" mit `allowed = true`, oder globale
 * Admins (die haben laut Auth-Regel Zugriff auf alle Apps).
 *
 * **Kein Löschen:** Ein Entzug der Freigabe entfernt den lokalen kontor-Benutzer nicht
 * (dort hängen Rechnungen, Belege und Protokolle daran). Der Zugang muss in kontor
 * selbst gesperrt werden – siehe Hinweis am Ende der Ausgabe.
 *
 * Aufruf:
 *   TS_NODE_TRANSPILE_ONLY=1 node node_modules/ts-node/dist/bin.js \
 *     --compiler-options '{"module":"CommonJS","moduleResolution":"node"}' \
 *     prisma/sync-kontor-benutzer.ts [--dry]
 */
import { Client as PgClient } from "pg";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const kontor = new PgClient({
  connectionString: process.env.KONTOR_DATABASE_URL || "postgresql://clocker:clocker_pw@localhost:5432/kontor",
});
const TROCKEN = process.argv.includes("--dry");
const tat = (t: string) => console.log(`${TROCKEN ? "[Probelauf] " : ""}${t}`);

async function main() {
  await kontor.connect();

  const identitaeten = await prisma.identity.findMany({
    where: { deletedAt: null },
    include: { appAccess: true },
  });

  // Für kontor freigegeben: eigene Freigabe ODER globaler Admin
  const berechtigt = identitaeten.filter((i) => {
    const a = i.appAccess.find((x) => x.appKey === "kontor");
    return i.globalRole === "admin" || (a && a.allowed);
  });

  const lokale = (await kontor.query(`SELECT id, lower(email) AS email, role FROM "User"`)).rows;
  const nachMail = new Map(lokale.map((u: any) => [u.email, u]));
  // Stabile Zuordnung über die gemerkte lokale ID – sie überlebt eine E-Mail-Änderung,
  // die reine Suche über die Adresse dagegen nicht (dort entstünde ein zweiter Benutzer).
  const nachId = new Map(lokale.map((u: any) => [u.id, u]));
  const standardFirma = (await kontor.query(`SELECT id FROM "Company" ORDER BY "createdAt" LIMIT 1`)).rows[0]?.id ?? null;

  let neu = 0, rolleGeaendert = 0, mailGeaendert = 0, unveraendert = 0;

  /** Merkt sich zu einer App-Freigabe den lokalen Benutzer, damit spätere Änderungen ihn wiederfinden. */
  const merkeLokal = async (zugriffId: string | undefined, lokalId: string, bisher?: string | null) => {
    if (!zugriffId || bisher === lokalId || TROCKEN) return;
    await prisma.identityAppAccess.update({ where: { id: zugriffId }, data: { localUserId: lokalId, syncedAt: new Date() } });
  };

  for (const i of berechtigt) {
    const mail = i.email.toLowerCase();
    const zugriff = i.appAccess.find((x) => x.appKey === "kontor");
    const rolle = i.globalRole === "admin" ? "admin" : zugriff?.role === "admin" ? "admin" : "user";
    const vorhanden = (zugriff?.localUserId ? nachId.get(zugriff.localUserId) : undefined) || nachMail.get(mail);

    if (!vorhanden) {
      tat(`kontor-Benutzer anlegen (Rolle ${rolle})`);
      if (!TROCKEN) {
        const angelegt = await kontor.query(
          `INSERT INTO "User" (id, name, email, password, role, "companyId", "createdAt", "updatedAt")
           VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, now(), now())
           ON CONFLICT (email) DO NOTHING
           RETURNING id`,
          [i.name || mail, i.email, i.passwordHash, rolle, standardFirma]
        );
        const neueId = angelegt.rows[0]?.id;
        if (neueId) await merkeLokal(zugriff?.id, neueId, zugriff?.localUserId);
      }
      neu++;
      continue;
    }

    await merkeLokal(zugriff?.id, vorhanden.id, zugriff?.localUserId);

    // Anmeldekennung angleichen: In Nexus geänderte E-Mail auf den lokalen Benutzer übertragen.
    if (vorhanden.email !== mail) {
      const belegt = lokale.find((u: any) => u.id !== vorhanden.id && u.email === mail);
      if (belegt) {
        console.warn(`  ! E-Mail „${mail}" ist in kontor schon einem anderen Benutzer zugeordnet – nicht übertragen`);
      } else {
        tat(`kontor-E-Mail angleichen: ${vorhanden.email} → ${mail}`);
        if (!TROCKEN) {
          await kontor.query(`UPDATE "User" SET email = $1, "updatedAt" = now() WHERE id = $2`, [i.email, vorhanden.id]);
        }
        vorhanden.email = mail;
        mailGeaendert++;
      }
    }

    if (vorhanden.role !== rolle) {
      tat(`Rolle angleichen: ${vorhanden.role} → ${rolle}`);
      if (!TROCKEN) {
        await kontor.query(`UPDATE "User" SET role = $1, "updatedAt" = now() WHERE id = $2`, [rolle, vorhanden.id]);
      }
      rolleGeaendert++;
    } else {
      unveraendert++;
    }
  }

  // Wer lokal existiert, in Nexus aber keine Freigabe (mehr) hat – nur melden, nicht anfassen
  const berechtigteMails = new Set(berechtigt.map((i) => i.email.toLowerCase()));
  const ohneFreigabe = lokale.filter((u: any) => u.email && !berechtigteMails.has(u.email));

  console.log(`Für kontor freigegeben: ${berechtigt.length} · lokal vorhanden: ${lokale.length}`);
  console.log(`Neu angelegt: ${neu} · Rolle angeglichen: ${rolleGeaendert} · E-Mail angeglichen: ${mailGeaendert} · unverändert: ${unveraendert}`);
  if (ohneFreigabe.length) {
    console.log(`Hinweis: ${ohneFreigabe.length} lokale kontor-Benutzer haben in Nexus keine Freigabe. Sie werden NICHT gelöscht (daran hängen Belege/Protokolle) – bei Bedarf in kontor selbst sperren.`);
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); await kontor.end().catch(() => {}); });
