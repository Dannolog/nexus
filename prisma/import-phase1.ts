/**
 * Phase 1 — Bestandsdaten-Import (übernehmen, einseitige Kopie nach Nexus).
 * Quelle der Wahrheit: Kunden = kontor (Merge fehlender Felder aus clocker),
 * Projekte + Mitarbeiter = clocker. User/Identitäten dedupliziert per email.
 * Idempotent: matcht bestehende Nexus-Datensätze (Name/email) und aktualisiert sie.
 * KEINE Revisionen (System-Import, keine Benutzeraktion). Direkte Prisma-Writes.
 */
import { PrismaClient } from "@prisma/client";
import { Client as PgClient } from "pg";

const prisma = new PrismaClient();
const PW = "clocker_pw";
const kontor = new PgClient({ connectionString: `postgresql://clocker:${PW}@localhost:5432/kontor` });
const clocker = new PgClient({ connectionString: `postgresql://clocker:${PW}@localhost:5432/clocker` });

const norm = (s: string) => (s || "").toLowerCase().trim().replace(/\s+/g, " ");

async function main() {
  await kontor.connect();
  await clocker.connect();
  const stats: Record<string, number> = {};

  // ---------- 1) Organisationen (Mandanten) aus kontor.Company ----------
  const kCompanies = (await kontor.query(
    `SELECT id,name,"shortCode",street,zip,city,country,"taxNumber","ustId" FROM "Company"`
  )).rows;
  const orgIdMap = new Map<string, string>(); // kontorCompanyId -> nexusOrgId
  for (const c of kCompanies) {
    const org = await prisma.organization.upsert({
      where: { id: c.id }, // kontor-Company-id als Nexus-Org-id übernehmen (stabile Zuordnung)
      update: { name: c.name, shortCode: c.shortCode ?? "", street: c.street ?? "", zip: c.zip ?? "", city: c.city ?? "", country: c.country || "Deutschland", taxNumber: c.taxNumber ?? "", ustId: c.ustId ?? "" },
      create: { id: c.id, name: c.name, shortCode: c.shortCode ?? "", street: c.street ?? "", zip: c.zip ?? "", city: c.city ?? "", country: c.country || "Deutschland", taxNumber: c.taxNumber ?? "", ustId: c.ustId ?? "" },
    });
    orgIdMap.set(c.id, org.id);
  }
  stats.organizations = kCompanies.length;

  // ---------- 2) Kunden: kontor (führend) ----------
  const kClients = (await kontor.query(
    `SELECT id,name,salutation,company,"shortName","distanceKm",street,zip,city,country,email,phone,"taxNumber","ustId",notes FROM "Client"`
  )).rows;
  const nameToCustomerId = new Map<string, string>(); // norm(companyName) -> customerId
  const shortToCustomerId = new Map<string, string>();
  const kontorClientToCustomer = new Map<string, string>();

  async function upsertCustomerByName(companyName: string, data: any, sourceKeyMaps?: { kClientId?: string; cClientId?: string }) {
    const key = norm(companyName);
    let id = key ? nameToCustomerId.get(key) : undefined;
    if (!id && data.shortCode) id = shortToCustomerId.get(norm(data.shortCode));
    if (!id) {
      // bestehenden Nexus-Kunden per companyName finden (Idempotenz)
      const existing = key ? await prisma.customer.findFirst({ where: { companyName: { equals: companyName, mode: "insensitive" }, deletedAt: null } }) : null;
      if (existing) id = existing.id;
    }
    let customer;
    if (id) {
      customer = await prisma.customer.update({ where: { id }, data });
    } else {
      customer = await prisma.customer.create({ data: { companyName, ...data } });
    }
    if (key) nameToCustomerId.set(key, customer.id);
    if (data.shortCode) shortToCustomerId.set(norm(data.shortCode), customer.id);
    if (sourceKeyMaps?.kClientId) kontorClientToCustomer.set(sourceKeyMaps.kClientId, customer.id);
    return customer;
  }

  for (const c of kClients) {
    const companyName = c.company || c.name || "(ohne Namen)";
    await upsertCustomerByName(companyName, {
      contactName: c.name ?? "", salutation: c.salutation ?? "", shortCode: c.shortName ?? "",
      street: c.street ?? "", zip: c.zip ?? "", city: c.city ?? "", country: c.country || "Deutschland",
      email: c.email ?? "", phone: c.phone ?? "", taxNumber: c.taxNumber ?? "", ustId: c.ustId ?? "",
      distanceKm: c.distanceKm ?? 0, notes: c.notes ?? "",
    }, { kClientId: c.id });
  }
  stats.customers_kontor = kClients.length;

  // ---------- 2b) Kunden-Merge: clocker ergänzt fehlende Felder / fügt neue hinzu ----------
  const cClients = (await clocker.query(
    `SELECT id,name,"shortCode",color,address,notes FROM "Client"`
  )).rows;
  const clockerClientToCustomer = new Map<string, string>();
  let mergedCount = 0, newFromClocker = 0;
  for (const c of cClients) {
    const key = norm(c.name);
    const existingId = nameToCustomerId.get(key) || shortToCustomerId.get(norm(c.shortCode));
    if (existingId) {
      // Merge: nur leere Felder ergänzen (color, addressFree, notes, shortCode)
      const cur = await prisma.customer.findUnique({ where: { id: existingId } });
      await prisma.customer.update({
        where: { id: existingId },
        data: {
          color: cur && cur.color === "#3b82f6" && c.color ? c.color : cur?.color,
          addressFree: cur && !cur.addressFree && c.address ? c.address : cur?.addressFree,
          notes: cur && !cur.notes && c.notes ? c.notes : cur?.notes,
          shortCode: cur && !cur.shortCode && c.shortCode ? c.shortCode : cur?.shortCode,
        },
      });
      clockerClientToCustomer.set(c.id, existingId);
      mergedCount++;
    } else {
      const created = await upsertCustomerByName(c.name, {
        shortCode: c.shortCode ?? "", color: c.color || "#3b82f6", addressFree: c.address ?? "", notes: c.notes ?? "",
      });
      clockerClientToCustomer.set(c.id, created.id);
      newFromClocker++;
    }
  }
  stats.customers_merged = mergedCount;
  stats.customers_new_from_clocker = newFromClocker;

  // ---------- 3) Kundennummern (kontor.ClientCompanyNumber) ----------
  const kNumbers = (await kontor.query(`SELECT "clientId","companyId",number FROM "ClientCompanyNumber"`)).rows;
  let numCount = 0;
  for (const n of kNumbers) {
    const customerId = kontorClientToCustomer.get(n.clientId);
    const orgId = orgIdMap.get(n.companyId);
    if (!customerId || !orgId) continue;
    await prisma.customerNumber.upsert({
      where: { customerId_orgId: { customerId, orgId } },
      update: { number: n.number },
      create: { customerId, orgId, number: n.number },
    });
    numCount++;
  }
  stats.customerNumbers = numCount;

  // ---------- 4) Kontakte (kontor + clocker), dedupe per (customer,name,email) ----------
  async function importContacts(rows: any[], mapTo: Map<string, string>) {
    let n = 0;
    for (const ct of rows) {
      const customerId = mapTo.get(ct.clientId);
      if (!customerId) continue;
      const exists = await prisma.customerContact.findFirst({
        where: { customerId, name: ct.name, email: ct.email ?? "" },
      });
      if (exists) continue;
      await prisma.customerContact.create({
        data: { customerId, name: ct.name, role: ct.role ?? "", email: ct.email ?? "", phone: ct.phone ?? "", mobile: ct.mobile ?? "" },
      });
      n++;
    }
    return n;
  }
  const kContacts = (await kontor.query(`SELECT "clientId",name,role,email,phone,mobile FROM "ClientContact"`)).rows;
  const cContacts = (await clocker.query(`SELECT "clientId",name,role,email,phone,mobile FROM "ClientContact"`)).rows;
  stats.contacts = (await importContacts(kContacts, kontorClientToCustomer)) + (await importContacts(cContacts, clockerClientToCustomer));

  // ---------- 5) Mitarbeiter + Identitäten aus clocker.User (Mitarbeiter führend) ----------
  const cUsers = (await clocker.query(
    `SELECT id,name,email,password,role,color,"employeeId" FROM "User"`
  )).rows;
  const clockerUserToEmployee = new Map<string, string>(); // für Project.teamLeader
  for (const u of cUsers) {
    const email = norm(u.email);
    // Employee (HR-Kern)
    let employee = await prisma.employee.findFirst({ where: { OR: [{ email: u.email }, { employeeNumber: u.employeeId || "___none___" }], deletedAt: null } });
    if (employee) {
      employee = await prisma.employee.update({ where: { id: employee.id }, data: { name: u.name, email: u.email, employeeNumber: u.employeeId ?? "", color: u.color || "#7c3cc0" } });
    } else {
      employee = await prisma.employee.create({ data: { name: u.name, email: u.email, employeeNumber: u.employeeId ?? "", color: u.color || "#7c3cc0" } });
    }
    clockerUserToEmployee.set(u.id, employee.id);

    // Identity (Login) — upsert per email
    if (email) {
      const identity = await prisma.identity.upsert({
        where: { email },
        update: { name: u.name, employeeId: employee.id },
        create: { email, name: u.name, passwordHash: u.password, globalRole: u.role === "admin" ? "admin" : "user", origin: "clocker", employeeId: employee.id },
      });
      await prisma.identityAppAccess.upsert({
        where: { identityId_appKey: { identityId: identity.id, appKey: "clocker" } },
        update: { allowed: true, role: u.role || "employee", localUserId: u.id, syncedAt: new Date() },
        create: { identityId: identity.id, appKey: "clocker", allowed: true, role: u.role || "employee", localUserId: u.id, syncedAt: new Date() },
      });
      await prisma.employee.update({ where: { id: employee.id }, data: { identityId: identity.id } });
    }
  }
  stats.employees = cUsers.length;

  // ---------- 5b) Identitäten aus kontor.User (dedupe per email) ----------
  const kUsers = (await kontor.query(`SELECT id,name,email,password,role FROM "User"`)).rows;
  for (const u of kUsers) {
    const email = norm(u.email);
    if (!email) continue;
    const existing = await prisma.identity.findUnique({ where: { email } });
    const identity = existing
      ? await prisma.identity.update({ where: { email }, data: { globalRole: u.role === "admin" ? "admin" : existing.globalRole } })
      : await prisma.identity.create({ data: { email, name: u.name, passwordHash: u.password, globalRole: u.role === "admin" ? "admin" : "user", origin: "kontor" } });
    await prisma.identityAppAccess.upsert({
      where: { identityId_appKey: { identityId: identity.id, appKey: "kontor" } },
      update: { allowed: true, role: u.role || "user", localUserId: u.id, syncedAt: new Date() },
      create: { identityId: identity.id, appKey: "kontor", allowed: true, role: u.role || "user", localUserId: u.id, syncedAt: new Date() },
    });
  }
  stats.identities_total = await prisma.identity.count();

  // ---------- 6) Projekte aus clocker (führend) ----------
  const cProjects = (await clocker.query(
    `SELECT id,name,"clientId",color,archived,"teamLeaderId" FROM "Project"`
  )).rows;
  let projCount = 0;
  for (const p of cProjects) {
    const customerId = p.clientId ? clockerClientToCustomer.get(p.clientId) ?? null : null;
    const teamLeaderId = p.teamLeaderId ? clockerUserToEmployee.get(p.teamLeaderId) ?? null : null;
    // dedupe per (name, customerId)
    const existing = await prisma.project.findFirst({ where: { name: p.name, customerId, deletedAt: null } });
    if (existing) {
      await prisma.project.update({ where: { id: existing.id }, data: { color: p.color || "#7c3cc0", archived: !!p.archived, teamLeaderId } });
    } else {
      await prisma.project.create({ data: { name: p.name, customerId, color: p.color || "#7c3cc0", archived: !!p.archived, teamLeaderId, status: "offen" } });
    }
    projCount++;
  }
  stats.projects = projCount;

  console.log("\n=== Phase-1-Import fertig ===");
  console.table(stats);
}

main()
  .then(async () => { await kontor.end(); await clocker.end(); await prisma.$disconnect(); })
  .catch(async (e) => { console.error(e); await kontor.end().catch(() => {}); await clocker.end().catch(() => {}); await prisma.$disconnect(); process.exit(1); });
