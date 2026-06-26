/**
 * Setzt das Passwort einer Identität (Standard: admin@nexus.local).
 * Nutzung:
 *   TS_NODE_TRANSPILE_ONLY=1 node node_modules/ts-node/dist/bin.js \
 *     --compiler-options '{"module":"CommonJS","moduleResolution":"node"}' \
 *     scripts/set-admin-password.ts '<neues-passwort>' [email]
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const pw = process.argv[2];
  const email = (process.argv[3] || "admin@nexus.local").toLowerCase();
  if (!pw || pw.length < 6) {
    console.error("Bitte ein Passwort (min. 6 Zeichen) angeben: set-admin-password.ts <passwort> [email]");
    process.exit(1);
  }
  const passwordHash = await bcrypt.hash(pw, 10);
  const r = await prisma.identity.update({
    where: { email },
    data: { passwordHash, version: { increment: 1 } },
  });
  console.log("✓ Passwort gesetzt für", r.email);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => { console.error(e.message); await prisma.$disconnect(); process.exit(1); });
