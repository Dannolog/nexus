// Feld-/Spalten-Definitionen je Entität (client-safe, keine Server-Imports).
export type Field = {
  key: string;
  label: string;
  type?: "text" | "number" | "color" | "checkbox" | "textarea" | "select" | "email";
  options?: string[];
};
export type Resource = {
  key: string; // URL-Segment + API
  entity: string; // Revision-Entity-Name
  title: string;
  icon: string; // Icon-Name (siehe components/Icon)
  prefix: string; // Kürzel für Index-Spalte (z.B. KU-1)
  titleField: string;
  columns: { key: string; label: string }[];
  fields: Field[];
};

export const RESOURCES: Record<string, Resource> = {
  customers: {
    key: "customers",
    entity: "Customer",
    title: "Kunden",
    icon: "users",
    prefix: "KU",
    titleField: "companyName",
    columns: [
      { key: "companyName", label: "Firma" },
      { key: "contactName", label: "Ansprechpartner" },
      { key: "shortCode", label: "Kürzel" },
      { key: "city", label: "Ort" },
      { key: "email", label: "E-Mail" },
    ],
    fields: [
      { key: "companyName", label: "Firmenname" },
      { key: "contactName", label: "Ansprechpartner" },
      { key: "salutation", label: "Anrede" },
      { key: "shortCode", label: "Kürzel" },
      { key: "color", label: "Farbe", type: "color" },
      { key: "street", label: "Straße" },
      { key: "zip", label: "PLZ" },
      { key: "city", label: "Ort" },
      { key: "country", label: "Land" },
      { key: "email", label: "E-Mail", type: "email" },
      { key: "phone", label: "Telefon" },
      { key: "taxNumber", label: "Steuernr." },
      { key: "ustId", label: "USt-IdNr." },
      { key: "distanceKm", label: "Entfernung (km)", type: "number" },
      { key: "notes", label: "Notizen", type: "textarea" },
    ],
  },
  projects: {
    key: "projects",
    entity: "Project",
    title: "Projekte",
    icon: "folder",
    prefix: "PR",
    titleField: "name",
    columns: [
      { key: "name", label: "Name" },
      { key: "status", label: "Status" },
      { key: "hourlyRate", label: "Std.-Satz" },
      { key: "archived", label: "Archiviert" },
    ],
    fields: [
      { key: "name", label: "Name" },
      { key: "customerId", label: "Kunde-ID" },
      { key: "color", label: "Farbe", type: "color" },
      { key: "hourlyRate", label: "Stundensatz", type: "number" },
      { key: "status", label: "Status", type: "select", options: ["offen", "laeuft", "fertig"] },
      { key: "teamLeaderId", label: "Teamleiter-ID" },
      { key: "archived", label: "Archiviert", type: "checkbox" },
    ],
  },
  employees: {
    key: "employees",
    entity: "Employee",
    title: "Mitarbeiter",
    icon: "user",
    prefix: "MA",
    titleField: "name",
    columns: [
      { key: "name", label: "Name" },
      { key: "email", label: "E-Mail" },
      { key: "employeeNumber", label: "Personalnr." },
      { key: "archived", label: "Archiviert" },
    ],
    fields: [
      { key: "name", label: "Name" },
      { key: "email", label: "E-Mail", type: "email" },
      { key: "employeeNumber", label: "Personalnummer" },
      { key: "color", label: "Farbe", type: "color" },
      { key: "identityId", label: "Identität-ID (SSO)" },
      { key: "archived", label: "Archiviert", type: "checkbox" },
    ],
  },
  organizations: {
    key: "organizations",
    entity: "Organization",
    title: "Mandanten",
    icon: "building",
    prefix: "MD",
    titleField: "name",
    columns: [
      { key: "name", label: "Name" },
      { key: "shortCode", label: "Kürzel" },
      { key: "city", label: "Ort" },
    ],
    fields: [
      { key: "name", label: "Name" },
      { key: "shortCode", label: "Kürzel" },
      { key: "street", label: "Straße" },
      { key: "zip", label: "PLZ" },
      { key: "city", label: "Ort" },
      { key: "country", label: "Land" },
      { key: "taxNumber", label: "Steuernr." },
      { key: "ustId", label: "USt-IdNr." },
    ],
  },
};
