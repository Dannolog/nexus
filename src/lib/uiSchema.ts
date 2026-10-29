// Feld-/Spalten-Definitionen je Entität (client-safe, keine Server-Imports).
export type Field = {
  key: string;
  label: string;
  type?: "text" | "number" | "color" | "checkbox" | "textarea" | "select" | "email" | "date" | "phones";
  options?: string[];
  group?: string; // optionale Abschnitts-Überschrift im Bearbeiten-Dialog
  span?: number; // Feldbreite in 12er-Rastern (1–12); Standard 6 (halbe Breite)
};
export type Resource = {
  key: string; // URL-Segment + API
  entity: string; // Revision-Entity-Name
  title: string;
  einzahl?: string; // Bezeichnung eines einzelnen Eintrags („Kunde"), für Fenstertitel und Knöpfe
  beschreibung?: string; // ein Satz unter dem Seitentitel – was man hier tut
  icon: string; // Icon-Name (siehe components/Icon)
  prefix: string; // Kürzel für Index-Spalte (z.B. KU-1)
  titleField: string;
  columns: { key: string; label: string }[];
  fields: Field[];
  detail?: boolean; // true → Klick auf eine Zeile öffnet eine Detail-Vorschau
  thumbField?: string; // Feld mit Bild-URL → als Thumbnail in Liste/Karten anzeigen
  thumbAfter?: string; // Spalten-Key, HINTER dem das Thumbnail steht (sonst führend)
};

export const RESOURCES: Record<string, Resource> = {
  customers: {
    key: "customers",
    einzahl: "Kunde",
    beschreibung: "Firmenkunden mit Anschrift, Ansprechpartnern und Logo – abgeglichen mit kontor.",
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
      { key: "companyName", label: "Firmenname", group: "Firma", span: 8 },
      { key: "contactName", label: "Ansprechpartner", group: "Firma", span: 8 },
      { key: "salutation", label: "Anrede", group: "Firma", span: 4 },
      { key: "shortCode", label: "Kürzel", group: "Firma", span: 4 },
      { key: "color", label: "Farbe", type: "color", group: "Firma", span: 12 },
      { key: "street", label: "Straße", group: "Anschrift", span: 12 },
      { key: "zip", label: "PLZ", group: "Anschrift", span: 4 },
      { key: "city", label: "Ort", group: "Anschrift", span: 8 },
      { key: "country", label: "Land", group: "Anschrift", span: 6 },
      { key: "email", label: "E-Mail", type: "email", group: "Kontakt", span: 6 },
      { key: "phone", label: "Telefon", group: "Kontakt", span: 6 },
      { key: "website", label: "Webseite", group: "Kontakt", span: 12 },
      { key: "invoiceEmail", label: "E-Mail Rechnungen", type: "email", group: "Kontakt", span: 6 },
      { key: "orderEmail", label: "E-Mail Bestellungen", type: "email", group: "Kontakt", span: 6 },
      { key: "taxNumber", label: "Steuernr.", group: "Steuer", span: 6 },
      { key: "ustId", label: "USt-IdNr.", group: "Steuer", span: 6 },
      { key: "distanceKm", label: "Entfernung (km)", type: "number", group: "Anschrift", span: 6 },
      { key: "notes", label: "Notizen", type: "textarea", group: "Notizen" },
    ],
  },
  projects: {
    key: "projects",
    einzahl: "Projekt",
    beschreibung: "Projekte mit Status und Stundensatz – Grundlage für Zeiterfassung und Abrechnung.",
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
      { key: "name", label: "Name", group: "Projekt", span: 8 },
      { key: "customerId", label: "Kunde-ID", group: "Projekt", span: 6 },
      { key: "color", label: "Farbe", type: "color", group: "Darstellung", span: 6 },
      { key: "hourlyRate", label: "Stundensatz", type: "number", group: "Abrechnung", span: 6 },
      { key: "status", label: "Status", type: "select", options: ["offen", "laeuft", "fertig"], group: "Projekt", span: 4 },
      { key: "teamLeaderId", label: "Teamleiter-ID", group: "Projekt", span: 6 },
      { key: "archived", label: "Archiviert", type: "checkbox", group: "Darstellung", span: 6 },
    ],
  },
  tasks: {
    key: "tasks",
    einzahl: "Aufgabe",
    beschreibung: "Offene und erledigte Aufgaben mit Fälligkeit und Priorität.",
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
      { key: "title", label: "Titel", group: "Aufgabe", span: 12 },
      { key: "status", label: "Status", type: "select", options: ["offen", "laeuft", "erledigt"], group: "Aufgabe", span: 4 },
      { key: "priority", label: "Priorität", type: "select", options: ["niedrig", "normal", "hoch"], group: "Aufgabe", span: 4 },
      { key: "projectId", label: "Projekt-ID", group: "Termin und Zuständigkeit", span: 4 },
      { key: "assigneeId", label: "Zuständiger (Mitarbeiter-ID)", group: "Termin und Zuständigkeit", span: 4 },
      { key: "dueDate", label: "Fällig am", type: "date", group: "Termin und Zuständigkeit", span: 4 },
      { key: "done", label: "Erledigt", type: "checkbox", group: "Aufgabe", span: 4 },
      { key: "description", label: "Beschreibung", type: "textarea", group: "Beschreibung" },
    ],
  },
  suppliers: {
    key: "suppliers",
    einzahl: "Lieferant",
    beschreibung: "Lieferanten mit Kundennummer, Bestell-E-Mail und allen Ansprechpartnern.",
    entity: "Supplier",
    title: "Lieferanten",
    icon: "truck",
    prefix: "LI",
    titleField: "name",
    detail: true,
    columns: [
      { key: "number", label: "Nr." },
      { key: "name", label: "Firma" },
      { key: "shortCode", label: "Kürzel" },
      { key: "customerNumber", label: "Kundennr." },
      { key: "email", label: "E-Mail" },
      { key: "archived", label: "Archiviert" },
    ],
    fields: [
      { key: "name", label: "Firma", group: "Firma", span: 8 },
      { key: "shortCode", label: "Kürzel", group: "Firma", span: 4 },
      { key: "contactName", label: "Ansprechpartner", group: "Kontakt", span: 6 },
      { key: "email", label: "E-Mail", type: "email", group: "Kontakt", span: 6 },
      { key: "phone", label: "Telefon", group: "Kontakt", span: 6 },
      { key: "web", label: "Webseite", group: "Kontakt", span: 6 },
      { key: "customerNumber", label: "Unsere Kundennummer", group: "Firma", span: 6 },
      { key: "street", label: "Straße", group: "Anschrift", span: 12 },
      { key: "zip", label: "PLZ", group: "Anschrift", span: 4 },
      { key: "city", label: "Ort", group: "Anschrift", span: 8 },
      { key: "country", label: "Land", group: "Anschrift", span: 12 },
      { key: "addressFree", label: "Anschrift (frei)", type: "textarea", group: "Anschrift" },
      { key: "category", label: "Warengruppe", group: "Firma", span: 6 },
      { key: "taxNumber", label: "Steuernummer", group: "Steuer", span: 6 },
      { key: "ustId", label: "USt-IdNr.", group: "Steuer", span: 6 },
      { key: "notes", label: "Notizen", type: "textarea", group: "Notizen" },
      { key: "archived", label: "Archiviert", type: "checkbox", group: "Notizen", span: 12 },
    ],
  },
  employees: {
    key: "employees",
    einzahl: "Mitarbeiter",
    beschreibung: "Alle Mitarbeiter mit Stammdaten für Personalunterlagen – Zugang, Akte und Verlauf je Person.",
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
      // Vor- und Nachname werden getrennt erfasst; der Anzeigename entsteht daraus serverseitig.
      { key: "firstName", label: "Vorname", group: "Person", span: 6 },
      { key: "lastName", label: "Nachname", group: "Person", span: 6 },
      { key: "email", label: "E-Mail (Firma)", type: "email", group: "Kontakt", span: 6 },
      { key: "privateEmail", label: "E-Mail privat", type: "email", group: "Kontakt", span: 6 },
      { key: "employeeNumber", label: "Personalnummer", group: "Zugang und Darstellung", span: 6 },
      // Beliebig viele Nummern (Firma, Privat, Mobil …); die Hauptnummer für Formulare leitet der Server ab
      { key: "phones", label: "Telefonnummern", type: "phones", group: "Kontakt" },
      // Stammdaten für Personalunterlagen (werden in Formulare übernommen)
      { key: "street", label: "Straße und Hausnummer", group: "Anschrift", span: 12 },
      { key: "zip", label: "PLZ", group: "Anschrift", span: 4 },
      { key: "city", label: "Ort", group: "Anschrift", span: 8 },
      { key: "birthDate", label: "Geburtsdatum", type: "date", group: "Person", span: 6 },
      { key: "nationality", label: "Staatsangehörigkeit", group: "Person", span: 6 },
      { key: "color", label: "Farbe", type: "color", group: "Zugang und Darstellung", span: 6 },
      { key: "identityId", label: "Identität-ID (SSO)", group: "Zugang und Darstellung", span: 6 },
      { key: "archived", label: "Archiviert", type: "checkbox", group: "Zugang und Darstellung", span: 6 },
    ],
  },
  organizations: {
    key: "organizations",
    einzahl: "Mandant",
    beschreibung: "Eigene Firmen (Mandanten) mit Anschrift und Steuerdaten – erscheinen auf Verträgen und Dokumenten.",
    entity: "Organization",
    title: "Mandanten",
    icon: "building",
    prefix: "MD",
    titleField: "name",
    columns: [
      { key: "name", label: "Name" },
      { key: "nameAddition", label: "Zusatz" },
      { key: "shortCode", label: "Kürzel" },
      { key: "city", label: "Ort" },
    ],
    fields: [
      { key: "name", label: "Name", group: "Stammdaten", span: 8 },
      { key: "shortCode", label: "Kürzel", group: "Stammdaten", span: 4 },
      { key: "nameAddition", label: "Namenszusatz (z. B. Inh. David Baier)", group: "Stammdaten", span: 12 },
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
    einzahl: "Artikel",
    beschreibung: "Zentraler Artikelstamm mit Preisen, Bildern und Links – für alle Apps.",
    entity: "Product",
    title: "Artikel",
    icon: "package",
    prefix: "ART",
    titleField: "name",
    detail: true,
    thumbField: "imageUrl",
    thumbAfter: "number",
    columns: [
      { key: "number", label: "Stammnr." },
      { key: "name", label: "Bezeichnung" },
      { key: "unit", label: "Einheit" },
      { key: "category", label: "Kategorie" },
      { key: "price", label: "EK-Preis" },
      { key: "active", label: "Aktiv" },
    ],
    // number ist server-verwaltet (zentrale Stammnummer) → NICHT editierbar, nur als Spalte sichtbar.
    fields: [
      { key: "name", label: "Bezeichnung", group: "Artikel", span: 8 },
      { key: "unit", label: "Einheit", group: "Artikel", span: 4 },
      { key: "category", label: "Kategorie", group: "Artikel", span: 8 },
      { key: "active", label: "Aktiv", type: "checkbox", group: "Artikel", span: 4 },
      { key: "description", label: "Beschreibung", type: "textarea", group: "Artikel" },
      { key: "price", label: "Einkaufspreis (€)", type: "number", group: "Einkauf", span: 4 },
      { key: "imageUrl", label: "Bild-URL", group: "Medien", span: 12 },
      { key: "links", label: "Links (je Zeile eine URL)", type: "textarea", group: "Medien" },
    ],
  },
};
