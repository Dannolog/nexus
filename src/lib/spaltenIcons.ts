/**
 * Symbol für einen Tabellenkopf. Die Zuordnung geht nach Feldname und – ersatzweise –
 * nach Beschriftung, damit alle Listen ohne zusätzliche Pflege im Schema Symbole bekommen.
 * Ist nichts passend, bleibt der Kopf ohne Symbol (lieber keins als ein irreführendes).
 */
const NACH_FELD: Record<string, string> = {
  name: "user", companyName: "building", contactName: "user", title: "tag",
  email: "mail", phone: "phone", mobile: "smartphone", web: "command",
  city: "home", zip: "home", street: "home", country: "home",
  role: "tag", category: "tag", status: "check", priority: "alert",
  number: "tag", employeeNumber: "id-card", customerNumber: "id-card", shortCode: "tag",
  archived: "archive", price: "package", unit: "package", stock: "package",
  color: "image", notes: "file-text", description: "file-text",
  createdAt: "calendar", updatedAt: "calendar", birthDate: "calendar", startDate: "calendar",
  supplier: "truck", customer: "users", project: "folder", employeeName: "user",
  jobTitle: "tag", globalRole: "shield", origin: "archive",
};

const NACH_TEXT: [RegExp, string][] = [
  [/e-?mail/i, "mail"],
  [/mobil|handy/i, "smartphone"],
  [/telefon|tel\./i, "phone"],
  [/firma|kunde|mandant/i, "building"],
  [/lieferant/i, "truck"],
  [/datum|geburt|erstellt|geändert/i, "calendar"],
  [/nummer|nr\./i, "id-card"],
  [/name|ansprech/i, "user"],
  [/status|rolle|funktion|art|kategorie/i, "tag"],
  [/notiz|beschreib|bemerk/i, "file-text"],
  [/ort|stra(ss|ß)e|plz|anschrift/i, "home"],
  [/passwort|zugriff|recht/i, "shield"],
  [/archiv|herkunft/i, "archive"],
];

export function spaltenIcon(feld?: string, beschriftung?: string): string | null {
  if (feld && NACH_FELD[feld]) return NACH_FELD[feld];
  const text = String(beschriftung || feld || "");
  for (const [muster, icon] of NACH_TEXT) if (muster.test(text)) return icon;
  return null;
}
