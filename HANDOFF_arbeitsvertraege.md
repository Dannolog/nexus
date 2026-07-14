# Handoff: Modul „Arbeitsverträge" — Erweiterungen

**Von:** Remote-Control-Session `baier_group` · **An:** Nexus-Session · **Datum:** 2026-07-14

Ich (baier_group-Session) habe in Nexus ein neues Modul **Arbeitsverträge** gebaut und
getestet (Build grün, POST/DELETE per JWT verifiziert). Es läuft bereits produktiv
(Port 3050, `/contracts`). Der Nutzer möchte nun zwei Erweiterungen, die Nexus-Kernmodelle
betreffen (Employee, Organization) — deshalb die Übergabe an dich. Bitte umsetzen,
bauen, neu starten und **am Ende `./git-save.sh` ausführen**.

---

## Was bereits existiert (nicht neu bauen, nur erweitern)

| Datei | Inhalt |
|---|---|
| `prisma/schema.prisma` | Model `EmploymentContract` (am Dateiende) |
| `src/lib/entities.ts` | `EntityName` + `ENTITIES`-Eintrag `EmploymentContract` (delegate `employmentContract`) |
| `src/app/api/contracts/route.ts` | GET/POST (CRUD-Factories) |
| `src/app/api/contracts/[id]/route.ts` | GET/PATCH/DELETE |
| `src/app/(app)/contracts/page.tsx` | **Eigene UI**: Formular + Mitarbeiter-Dropdown + Live-Vorschau + „Drucken/PDF" (window.print) |
| `src/components/Icon.tsx` | neues Icon `file-text` |
| `src/app/(app)/layout.tsx` | NAV-Eintrag „Arbeitsverträge" |
| `public/baier-logo.svg` | Briefkopf-Logo (Baier Maschinen, Zahnrad) |

**Wichtig:** Die Arbeitgeber-Daten sind in `page.tsx` aktuell als Konstante `ARBEITGEBER`
**hartkodiert** (Baier Maschinen). Das löst Aufgabe 2 auf.

Das `EmploymentContract`-Model friert Mitarbeiterdaten bewusst denormalisiert ein
(`employeeName`, `employeeAddress`, `employeeBirth`), damit der Vertrag ein eigenständiges
Dokument bleibt. Bitte dieses Muster beibehalten.

---

## Aufgabe 1 — Adresse & Geburtsdatum bei Mitarbeitern einbauen

**Ziel:** Mitarbeiter-Stammdaten um Anschrift + Geburtsdatum erweitern, damit das
Mitarbeiter-Dropdown im Vertrag diese Felder automatisch füllt.

1. `prisma/schema.prisma`, `model Employee`: ergänzen (konsistent mit Customer/Organization):
   ```prisma
   street    String   @default("")
   zip       String   @default("")
   city      String   @default("")
   birthDate DateTime?
   ```
2. Schema pushen: `node node_modules/prisma/build/index.js db push`
3. `src/lib/uiSchema.ts`, Eintrag `employees`: die neuen Felder in `fields` aufnehmen
   (street/zip/city als text, birthDate als `type: "date"`), optional 1–2 in `columns`.
   → dann sind sie im bestehenden Mitarbeiter-Editor (ResourceView) pflegbar.
4. `src/app/(app)/contracts/page.tsx`, Funktion `onEmployee(id)`: beim Wählen eines
   Mitarbeiters zusätzlich befüllen:
   - `employeeAddress` = `` `${emp.street}\n${emp.zip} ${emp.city}`.trim() ``
   - `employeeBirth`  = `emp.birthDate` → nach `de-DE` formatiert (z. B. `01.01.1990`)
   (nur setzen, wenn im Employee vorhanden; sonst manuelles Feld nicht überschreiben.)

---

## Aufgabe 2 — Verträge leicht auf andere Mandanten umstellbar

**Ziel:** Der Arbeitgeber (Briefkopf + Vertragsparteien) soll pro Vertrag aus den
**Mandanten** (`Organization`) wählbar sein, statt fest „Baier Maschinen".

Nexus hat bereits `model Organization` (name, shortCode, street, zip, city, country,
taxNumber, ustId, **logo** als base64-data-URL). Die Logo-Route existiert:
`GET /api/organizations/[id]/logo` (Logo ist bewusst nicht in der Listen-Antwort).

1. `prisma/schema.prisma`, `model EmploymentContract`: Arbeitgeber ergänzen + einfrieren
   (denormalisiert, gleiches Muster wie Arbeitnehmer):
   ```prisma
   orgId            String @default("")   // gewählter Mandant
   employerName     String @default("")
   employerAddress  String @default("")   // mehrzeilig: Straße \n PLZ Ort
   employerExtra    String @default("")   // z. B. „Inh. David Baier", USt-IdNr.
   ```
   (Logo wird über `orgId` live via Logo-Route geladen — nicht im Contract speichern,
   sonst blähen die Datensätze auf. Für den Druck reicht das, da im DOM vorhanden.)
   → `db push`
2. `src/app/(app)/contracts/page.tsx`:
   - Mandanten laden: `api("/api/organizations")` → **Mandanten-Dropdown** oben im Formular.
   - Beim Wählen: `employerName/employerAddress/employerExtra` aus der Organization füllen
     (einfrieren) und `orgId` setzen; Logo async via `/api/organizations/${orgId}/logo`
     in einen State laden.
   - `VertragVorschau`: den festen `ARBEITGEBER`-Block durch die Vertragsfelder ersetzen
     (Briefkopf-Name/Adresse/Logo aus dem gewählten Mandanten). Logo: `<img src={orgLogoDataUrl || "/baier-logo.svg"}>`.
   - Fallback, wenn kein Mandant gewählt: weiterhin Baier Maschinen (public/baier-logo.svg).
3. **Baier Maschinen als Mandant sicherstellen:** prüfen, ob eine `Organization`
   „Baier Maschinen" existiert; falls nicht, anlegen (Name „Baier Maschinen",
   street „Philipp-Reis-Straße 3", zip „49661", city „Cloppenburg"; Logo optional aus
   `public/baier-logo.svg` als base64 in `logo`). So ist der bisherige Default sauber
   als wählbarer Mandant hinterlegt.

---

## Technische Hinweise (dieser Umgebung)

- **Prisma-CLI fehlt in `.bin`** (CIFS-Mount, keine Symlinks) → immer
  `node node_modules/prisma/build/index.js <cmd>`.
- **Build:** `node node_modules/next/dist/bin/next build` (prüft TypeScript).
- **Neustart:** `pm2 restart nexus` (läuft als Production `next start`, Port 3050).
- **DB-Push ist additiv/sicher** (neue optionale Felder).
- **Verifikation (Schreibpfad):** JWT selbst signieren — `.env` manuell parsen
  (kein `dotenv` installiert), `jose` ist vorhanden, Identity aus `prisma.identity.findFirst`,
  Token `HS256` mit `JWT_SECRET`, dann `POST /api/contracts` mit `Authorization: Bearer`.
- Nutzer-Zugriff später über `http://192.168.1.10:3050/contracts`.

## Abschluss
Nach Umsetzung + grünem Build + Neustart: kurzer Rauchtest (`/contracts` HTTP 200,
`/api/organizations` liefert Mandanten) und **`./git-save.sh "Arbeitsverträge: Mitarbeiter-Adresse/Geburtsdatum + Mandantenwahl"`**.
