import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  // Demo-Mandant
  const org = await prisma.organization.upsert({
    where: { id: "seed-org" },
    update: {},
    create: {
      id: "seed-org",
      name: "Ingenieurbüro Baier",
      shortCode: "IPB",
      city: "Musterstadt",
      country: "Deutschland",
    },
  });

  // Zentraler Admin (globalRole=admin), Zugriff auf alle Apps
  const passwordHash = await bcrypt.hash("admin", 10);
  const admin = await prisma.identity.upsert({
    where: { email: "admin@nexus.local" },
    update: {},
    create: {
      email: "admin@nexus.local",
      passwordHash,
      name: "Administrator",
      globalRole: "admin",
      origin: "central",
      appAccess: {
        create: ["kontor", "clocker", "cnc", "schaltplan", "projecteye", "vision"].map((appKey) => ({
          appKey,
          allowed: true,
          role: "admin",
        })),
      },
    },
  });

  // Demo-Kunde + Projekt
  const customer = await prisma.customer.upsert({
    where: { id: "seed-customer" },
    update: {},
    create: {
      id: "seed-customer",
      companyName: "Mustermann GmbH",
      contactName: "Max Mustermann",
      shortCode: "MUST",
      city: "Beispielheim",
      email: "info@mustermann.de",
    },
  });

  await prisma.project.upsert({
    where: { id: "seed-project" },
    update: {},
    create: {
      id: "seed-project",
      name: "Demo-Projekt",
      customerId: customer.id,
      status: "offen",
    },
  });

  console.log("Seed fertig:", { org: org.name, admin: admin.email, customer: customer.companyName });
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
