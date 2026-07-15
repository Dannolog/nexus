// Zentrale Registry der versionierten Entitäten.
// delegate = Name des Prisma-Model-Delegates (prisma[delegate]).
export type EntityName =
  | "Customer"
  | "Project"
  | "Task"
  | "Employee"
  | "Organization"
  | "Identity"
  | "EmploymentContract"
  | "Product";

export type EntityDef = {
  delegate: string;
  searchable: string[];
  // Felder, die NICHT vom Client geschrieben werden dürfen (Server-verwaltet).
  protectedFields: string[];
  // Optional: Feld, das Nexus beim Anlegen fortlaufend zentral vergibt (höchste + 1).
  autoNumberField?: string;
};

const PROTECTED = ["id", "version", "createdAt", "updatedAt", "deletedAt"];

export const ENTITIES: Record<EntityName, EntityDef> = {
  Customer: {
    delegate: "customer",
    searchable: ["companyName", "contactName", "shortCode", "email", "city"],
    protectedFields: PROTECTED,
  },
  Project: {
    delegate: "project",
    searchable: ["name", "status"],
    protectedFields: PROTECTED,
  },
  Task: {
    delegate: "task",
    searchable: ["title", "status", "priority"],
    protectedFields: PROTECTED,
  },
  Employee: {
    delegate: "employee",
    searchable: ["name", "email", "employeeNumber"],
    protectedFields: PROTECTED,
  },
  Organization: {
    delegate: "organization",
    searchable: ["name", "shortCode", "city"],
    protectedFields: PROTECTED,
  },
  Identity: {
    delegate: "identity",
    searchable: ["email", "name"],
    protectedFields: [...PROTECTED, "passwordHash"],
  },
  EmploymentContract: {
    delegate: "employmentContract",
    searchable: ["title", "employeeName", "jobTitle", "status"],
    protectedFields: PROTECTED,
  },
  Product: {
    delegate: "product",
    searchable: ["name", "description", "category"],
    // number ist server-verwaltet (zentrale Stammnummer) → nie vom Client setzbar.
    protectedFields: [...PROTECTED, "number"],
    autoNumberField: "number",
  },
};

export function getEntity(name: string): EntityDef & { name: EntityName } {
  const def = ENTITIES[name as EntityName];
  if (!def) throw new Error(`Unbekannte Entität: ${name}`);
  return { ...def, name: name as EntityName };
}
