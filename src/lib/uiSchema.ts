// Feld-/Spalten-Definitionen je Entität (client-safe, keine Server-Imports).
export type Field = {
  key: string;
  label: string;
  type?: "text" | "number" | "color" | "checkbox" | "textarea" | "select" | "email" | "date";
  options?: string[];
  group?: string; // optionale Abschnitts-Überschrift im Bearbeiten-Dialog
  span?: number; // Feldbreite in 12er-Rastern (1–12); Standard 6 (halbe Breite)
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
  tasks: {
    key: "tasks",
    entity: "Task",
    title: "Aufgaben",
    icon: "tasks",
    prefix: "AU",
    titleField: "title",
    columns: [
      { key: "title", label: "Titel" },
      { key: "status", label: "Status" },
      { key: "priority", label: "Priorität" },
      { key: "dueDate", label: "Fällig" },
      { key: "done", label: "Erledigt" },
    ],
    fields: [
      { key: "title", label: "Titel" },
      { key: "status", label: "Status", type: "select", options: ["offen", "laeuft", "erledigt"] },
      { key: "priority", label: "Priorität", type: "select", options: ["niedrig", "normal", "hoch"] },
      { key: "projectId", label: "Projekt-ID" },
      { key: "assigneeId", label: "Zuständiger (Mitarbeiter-ID)" },
      { key: "dueDate", label: "Fällig am", type: "date" },
      { key: "done", label: "Erledigt", type: "checkbox" },
      { key: "description", label: "Beschreibung", type: "textarea" },
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
      { key: "name", label: "Name", group: "Stammdaten", span: 8 },
      { key: "shortCode", label: "Kürzel", group: "Stammdaten", span: 4 },
      { key: "street", label: "Straße", group: "Adresse", span: 8 },
      { key: "zip", label: "PLZ", group: "Adresse", span: 4 },
      { key: "city", label: "Ort", group: "Adresse", span: 8 },
      { key: "country", label: "Land", group: "Adresse", span: 4 },
      { key: "taxNumber", label: "Steuernummer", group: "Steuer", span: 6 },
      { key: "ustId", label: "USt-IdNr.", group: "Steuer", span: 6 },
    ],
  },
  products: {
    key: "products",
    entity: "Product",
    title: "Artikel",
    icon: "package",
    prefix: "ART",
    titleField: "name",
    columns: [
      { key: "number", label: "Stammnr." },
      { key: "name", label: "Bezeichnung" },
      { key: "unit", label: "Einheit" },
      { key: "category", label: "Kategorie" },
      { key: "active", label: "Aktiv" },
    ],
    // number ist server-verwaltet (zentrale Stammnummer) → NICHT editierbar, nur als Spalte sichtbar.
    fields: [
      { key: "name", label: "Bezeichnung", group: "Artikel", span: 8 },
      { key: "unit", label: "Einheit", group: "Artikel", span: 4 },
      { key: "category", label: "Kategorie", group: "Artikel", span: 8 },
      { key: "active", label: "Aktiv", type: "checkbox", group: "Artikel", span: 4 },
      { key: "description", label: "Beschreibung", type: "textarea", group: "Artikel" },
    ],
  },
};
