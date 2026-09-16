# Nexus — Session-Log (durchgängiger Bau-Fortschritt)

> Zweck: Jeder Schritt wird hier mitgeloggt, damit eine neue Session nahtlos weiterarbeiten kann.
> Konzept: `/mnt/devip3/shared/nexus/KONZEPT.md` · Integration: `INTEGRATION_HANDOFF.md`
> Memory-Index: `~/.claude/projects/-mnt-devip3-nexus/memory/MEMORY.md`

## Geklärte Entscheidungen (§7, 2026-06-25, mit Daniel)
1. Port **3050**, nginx-Block analog kontor, Launcher-Kachel.
2. Login: **live gegen Zentrale + Hash-Cache-Fallback** (offline-fähig).
3. Lieferanten (ProjectEye): **später (Phase 5)** — nicht in Phase 0.
4. Mitarbeiter-Lohndaten: **in clocker belassen** — nur HR-Kern zentral.

## Phasen-Checkliste (§8)
- [x] 1. Konzept gelesen + §7 geklärt
- [ ] 2. Repo/Verzeichnis `/mnt/devip3/nexus` + Git-Setup
- [x] 3. DB `nexus` anlegen (CREATE DATABASE nexus OWNER clocker) ✓
- [x] 4. Prisma-Schema (§3.3) + db push + Seed (Demo-Mandant + Admin) ✓
- [x] 5. REST-API (§4) + Audit/Revision (§3.4) + Locking (§3.5) — Undo/Redo getestet ✓
- [x] 6. UI (Listen/Formulare/Verlauf) ✓
- [~] 7. Phase 1: kontor+clocker-Import (dedupliziert) ✓ — **Anbindung der Apps noch offen** (bewusst: erst Daten übernehmen)
- [ ] 8. „Stammdaten-Zugriff"-Abschnitt in angebundene Apps
- [ ] 9. apps.json + Launcher-Kachel

**PHASE 0 ABGESCHLOSSEN ✓** — Dienst läuft produktiv (PM2 `nexus`, :3050 / extern :3052 nach nginx-Install). Teil-A-Liefergegenstände (ENDPOINTS.md, API.md, FEEDBACK.md) erstellt. Apps NOCH NICHT angebunden (erst nach Phase 1).

---

## Log

### 2026-06-25
- Beide Doku-Dateien (KONZEPT.md, INTEGRATION_HANDOFF.md) vollständig gelesen.
- 4 offene Punkte aus §7 mit Daniel geklärt (siehe oben).
- Umgebung geprüft: Node v20, npm 9, kein pnpm. Postgres `clocker`-Rolle (PW `clocker_pw`) hat CREATEDB.
- **DB `nexus` angelegt** (Owner clocker) ✓.
- Memory-Infrastruktur angelegt: nexus-project, nexus-open-tasks, nexus-environment, nexus-logging-rule + MEMORY.md.
- Session-Log (diese Datei) angelegt.
- **Nächster Schritt:** Next.js-14-Projekt scaffolden + Prisma-Schema (§3.3) umsetzen.

### 2026-06-25 (Fortsetzung — Dienst gebaut)
- Projekt scaffolded: Next.js 14 + Prisma 5 + Tailwind 4. **Wichtig:** Mount `/mnt/devip3` kann keine Symlinks → `.npmrc` mit `bin-links=false`; CLIs via `node node_modules/<pkg>/.../entry.js` aufrufen (nicht `npx`/`.bin`).
- Prisma-Schema (§3.3) umgesetzt (10 Modelle), `db push` ✓, Seed (Mandant „Ingenieurbüro Baier", Admin `admin@nexus.local`/`admin`, Demo-Kunde+Projekt) ✓.
- lib: prisma, http, jwt(jose), auth(X-App-Key + Bearer), entities-Registry, revision (CRUD+Undo/Redo, optimistic lock), locking (weicher EditLock 5min TTL).
- REST-API gebaut: /api/auth/{login,me}, /api/{customers,projects,employees,organizations} (+[id]), /api/contacts, /api/identities (+[id], /access, Upsert-Push §3.7), /api/revisions (+[txId]/undo|redo), /api/locks, /api/changes (Delta-Sync), /api/health.
- App-Keys + JWT-Secret in `.env` generiert (kontor/clocker/cnc/schaltplan/projecteye/vision).
- **Dev-Server läuft auf :3050.** End-to-End getestet & bestanden:
  - Login → JWT ✓; Create/Patch ✓; Versionskonflikt → **HTTP 409** ✓.
  - **UPDATE-Undo** (Bonn→Köln) + **Redo** (→Bonn) ✓.
  - **CREATE-Undo** (Anlage verschwindet) + Redo ✓; **DELETE-Undo** (Restore) ✓.
  - **Lock** setzen + `_lock`-Hinweis bei GET ✓.
- **Nächster Schritt:** UI (Login, Listen/Formulare je Entität, Verlauf mit Undo/Redo-Buttons, Userverwaltung). Danach PM2 + nginx + ENDPOINTS.md/API.md/FEEDBACK.md (Teil A), dann Git-Setup. Apps NICHT vor Phase 1 anbinden.

### 2026-06-25 (Fortsetzung — UI + Produktivbetrieb, Phase 0 fertig)
- UI gebaut (Next App Router, client components): Login, App-Shell mit Nav + Theme-Toggle + Auth-Guard, Dashboard, generische ResourceView (Liste/Suche/Anlegen/Bearbeiten mit expectedVersion-Konfliktschutz/Löschen/Lock-Hinweis) für customers/projects/employees/organizations, Verlauf-Seite (Undo/Redo pro txId), Userverwaltung (Identitäten + App-Zulassung/Rollen).
- **Production-Build erfolgreich** (TypeScript app-weit sauber, ESLint im Build ignoriert).
- Alle 8 UI-Routen liefern 200, keine Compile-Fehler.
- **PM2:** `ecosystem.config.js` (next start :3050), Dev-Server gestoppt, `pm2 start` + `pm2 save` → Prozess `nexus` (id 15) online, persistiert über Reboot.
- nginx-Block vorbereitet: `deploy/nexus-https` (:3052 ssl → 127.0.0.1:3050). **Installation braucht sudo** (Befehle in ENDPOINTS.md) — noch offen.
- Teil-A-Dateien angelegt: `shared/nexus/ENDPOINTS.md` (URLs + App-Keys, lokal/secret), `API.md` (Referenz + Node/Python/JS-Snippets), `FEEDBACK.md` (Vorlage).
- App-Key-Auth gegen Produktiv-Server getestet: kontor-Key→200, falscher Key→401, Schreiben ohne Bearer→401, Lesen mit Key→200, Delta-Sync ok.
- **OFFEN / nächste Schritte:**
  1. nginx-Block installieren (sudo) — siehe ENDPOINTS.md.
  2. Admin-Passwort (`admin`) produktiv ändern.
  3. Git-Sicherung: Repo `nexus` auf github.com/Dannolog anlegen lassen, dann `/home/claudeco/git-setup-app.sh /mnt/devip3/nexus nexus`. (Lokaler git init + commit bereits gemacht.)
  4. **Phase 1:** kontor+clocker Import-Skript (dedupliziert per Firmenname+shortCode / email) + Anbindung. Dann Trigger aus INTEGRATION_HANDOFF Teil B an kontor/clocker.
  5. `apps.json` (`nexus` → tracked) + Launcher-Kachel.

### 2026-06-26 (Absicherung umgesetzt + Backup/Auto-Push)
- **GitHub:** Repo `Dannolog/nexus` angelegt, Branch `main` gepusht. Secrets ausgeschlossen.
- **Backup:** statt 30-Min-git-save jetzt **tägliches DB-Backup** (`scripts/backup-db.sh`, pg_dump -Fc → `backups/`, Rotation 14, DB-URL aus .env). Cron: `15 3 * * *`. Getestet ✓.
- **Auto-Push bei jeder Änderung:** `scripts/watch-push.js` als PM2-Prozess `nexus-watcher` (Debounce 30s → `git-save.sh`). `backups/` gitignored.
- **nginx:** nach `sudo systemctl restart nginx` aktiv — **HTTPS läuft auf `https://192.168.1.10:3052` ✓** (Port gebunden IPv4+IPv6, Health ok). reload allein hatte das neue Socket nicht gebunden; restart hat es gelöst.
- Admin-PW: auf Nutzerwunsch übersprungen.
- **ABSICHERUNG VOLLSTÄNDIG ✓** — GitHub-Push + Auto-Push-Watcher + tägliches DB-Backup + HTTPS aktiv.

### 2026-06-26 (Absicherung — vorbereitet, wartet auf Nutzer-Aktionen)
- Geprüft: keine Secrets versioniert (.env/ENDPOINTS.md gitignored ✓), nginx-Zertifikate vorhanden, Port 3052 frei.
- Git: Branch auf `main`, `git-save.sh` erstellt, Remote `git@github.com:Dannolog/nexus.git` gesetzt. **Push schlägt fehl bis Repo existiert** ("Repository not found" — SSH-Auth ok).
- `scripts/set-admin-password.ts` erstellt (Nutzer setzt PW selbst).
- **OFFEN — braucht Nutzer:**
  1. **nginx** (sudo): `sudo cp /mnt/devip3/nexus/deploy/nexus-https /etc/nginx/sites-available/ && sudo ln -sf /etc/nginx/sites-available/nexus-https /etc/nginx/sites-enabled/ && sudo nginx -t && sudo systemctl reload nginx`
  2. **GitHub-Repo** `nexus` (leer) auf github.com/Dannolog anlegen → dann `git push -u origin main` (ich) + Cronjob (30-Min-Auto-Save).
  3. **Admin-PW** ändern: in UI (Userverwaltung → Administrator) ODER `scripts/set-admin-password.ts '<pw>'`.

### 2026-06-28 (Zentrale Aufgaben + App-Einbindung vorbereitet)
- **App-Anbindung vorbereitet (nicht ausgeführt):** `shared/nexus/TRIGGERS.md` mit fertigem Copy-Paste-Einbindungs-Trigger pro App (kontor, clocker, ProjectEye, CNC, Schaltplan, Vision) — echte Basis-URL (http://127.0.0.1:3050 bzw. https://192.168.1.10:3052 für CNC) + App-Key + §5/§3.7-Verweis. Reihenfolge kontor→clocker→ProjectEye→CNC→Schaltplan→Vision. Apps werden NICHT von hier angebunden (machen die App-Sessions).
- **Zentrale Aufgaben (Task) gebaut** (Wunsch: vorbereiten, nicht verbinden): neues `Task`-Model (title, description, status offen|laeuft|erledigt, priority, projectId, assigneeId, dueDate, done, appKey, versioniert/soft-delete). db push ✓. Registry + API `/api/tasks` (+[id]) über generische CRUD → Undo/Redo + 409-Locking automatisch. Delta-Sync + Health um tasks erweitert. UI: uiSchema-Resource (Prefix AU-), Nav „Aufgaben", Seite /tasks, Date-Feldtyp (nativer date-input + Listen-Datumsformat), Command-Palette-Quelle, Dashboard-Kachel. End-to-end getestet, Testdaten entfernt.
- Doku ergänzt: API.md (tasks-Entität + Felder), TRIGGERS.md (ProjectEye → zentrale Tasks).
- P3 (Launcher-Kachel) weiter zurückgestellt.

### 2026-06-26 (ColorPicker, TextField, Index-Spalte)
- **Moderner ColorPicker** (`components/ColorPicker.tsx`): Swatch-Button + Popover mit Preset-Palette, nativem Picker und Hex-Eingabe; ersetzt natives `<input type=color>`.
- **TextField** (`components/TextField.tsx`): Clear-Cross (✕) an jedem Feld, ESC bei gefülltem Feld → leeren, 2. ESC (leeres Feld) → Fokus aufheben (blur). Eingebaut in ResourceView-Formular (text/email/number), Userverwaltung (E-Mail/Name/Passwort/Rolle), Login (E-Mail/Passwort). Textarea: gleiches ESC-Verhalten inline.
- **Index-Spalte „Nr."** mit Seiten-Kürzel in allen Tabellen: Kunden KU-, Projekte PR-, Mitarbeiter MA-, Mandanten MD- (aus uiSchema-`prefix`), Userverwaltung US-, Verlauf VL-.

### 2026-06-26 (Mobil-konform + Überschriften-Icons)
- **Icons in allen Seitenüberschriften** (Dashboard/Listen/Verlauf/Userverwaltung); Listen-Icon aus neuem `icon`-Feld in uiSchema-Resource.
- **Responsive/Mobil:** Media-Queries in globals.css (Breakpoint 768px). Desktop: feste Sidebar. Mobil: fixe **Topbar mit Logo + Hamburger**, Sidebar wird Off-Canvas-Drawer (translateX) mit Overlay + Schließen-Button; schließt bei Seitenwechsel. App-Shell/Sidebar/Main als CSS-Klassen (`.app-shell/.sidebar/.topbar/.main`). Header-Leisten `flex-wrap`, Such-Feld flexibel; Modals `maxWidth:92vw` + Formular-Grid `repeat(auto-fit,minmax(190px,1fr))` → 1-spaltig auf schmalen Screens. Menü-Icon ergänzt.

### 2026-06-26 (SVG-Icons + ⌘K-Suche)
- **Alle Emoji → moderne SVG-Icons:** neue `components/Icon.tsx` (Lucide-Stil, stroke=currentColor → erbt Button-Farbe). Set: home/users/folder/user/building/shield/history/login/logout/moon/plus/pencil/trash/x/save/check/undo/redo/image/alert/search/command. Ersetzt in Nav, Login, ResourceView, ConfirmDialog, SearchInput, History, Identities, Dashboard-Kacheln. `.btn` → inline-flex+gap für Icon+Text-Ausrichtung.
- **⌘K-Suche (Command-Palette):** neue `components/CommandPalette.tsx` — global per ⌘K/Strg+K (oder Sidebar-Button „Suchen… ⌘K"). Leeres Feld → Schnellnavigation; Eingabe → Live-Suche (debounced 180ms) über Kunden/Projekte/Mitarbeiter; Pfeiltasten + Enter, ESC schließt. Treffer öffnen die Listen-Seite mit `?q=`; ResourceView liest `?q=` als Anfangssuche.
- Production-Build ✓, PM2 neu, Routen 200.

### 2026-06-26 (UI-Verbesserungen)
- **Button-Symbole** überall: Login 🔑, Nav (🏠👥📁🧑‍💼🏢🔐🕘), 🌓 Theme, 🚪 Abmelden, ➕ Neu, ✏️ Bearbeiten, 🕘 Verlauf, 🗑️ Löschen, ✖ Abbrechen, 💾 Speichern, ↶ Rückgängig, ↷ Wiederherstellen.
- **Lösch-Sicherheitsabfrage modernisiert:** neue `components/ConfirmDialog.tsx` (Modal mit ⚠️-Icon, ESC=Abbrechen/Enter=Bestätigen) ersetzt `window.confirm`. Eingebunden in ResourceView (alle Löschvorgänge).
- **Suchfeld** `components/SearchInput.tsx`: 🔍 Lupe, ✕ Clear-Cross, ESC bei gefülltem Feld → leeren, ESC bei leerem Feld → blur (Autofokus off).
- **Checkboxen modernisiert:** `components/Toggle.tsx` (Switch) ersetzt native Checkboxen (archived in ResourceView, App-Zulassung in Userverwaltung).
- **Menü links volle Browserhöhe:** Sidebar `height:100vh` + eigenes Scrolling, Container `overflow:hidden`, nur Hauptbereich scrollt.
- **Firmen-Logos:** Schema `Customer.logo` + `Organization.logo` (@db.Text base64) → `db push`. Upload im Bearbeiten-Modal (File→base64), Thumbnail-Spalte in Liste.
- **Logo-Laden asynchron ausgelagert:** Liste sendet KEIN logo (crudRoute löscht es), separater Endpoint `GET /api/{customers,organizations}/:id/logo`; UI lädt Logos nach Listen-Render nach. Getestet ✓.
- **App-Symbol:** Nexus-Netzwerk-Logo `src/app/icon.svg` (Favicon, automatisch) + `components/AppLogo.tsx` in Sidebar + Login.
- Production-Build ✓ (prisma-Skripte aus tsconfig-typecheck ausgeschlossen), PM2 neu gestartet.

### 2026-06-26 (Phase 1 — Bestandsdaten-Import)
- **Wunsch Daniel:** Langzeit soll Nexus die Daten ALLER Apps zentral halten; jetzt erstmal nur übernehmen (Apps noch nicht umhängen). → Memory `nexus-langzeit-ziel`.
- Import-Skript `prisma/import-phase1.ts` gebaut: liest kontor- + clocker-DBs direkt (pg), schreibt nach Nexus (prisma), **idempotent**, keine Revisionen (System-Import). Ausführen: `TS_NODE_TRANSPILE_ONLY=1 node node_modules/ts-node/dist/bin.js --compiler-options '{"module":"CommonJS","moduleResolution":"node"}' prisma/import-phase1.ts`.
- Mapping: Kunden=kontor.Client (führend) + Merge clocker.Client (Farbe/Adresse/Notizen/Kürzel ergänzt, neue hinzugefügt); Mandanten=kontor.Company (id übernommen); Kundennummern=kontor.ClientCompanyNumber; Kontakte=beide (dedupe); Mitarbeiter=clocker.User→Employee; Identitäten=clocker+kontor User dedupe per email (bcrypt-Hash `$2b$` direkt übernommen → bestehende Logins funktionieren); Projekte=clocker.Project (clientId→customer, teamLeaderId→employee).
- **Idempotenz getestet** (2. Lauf → identische Zähler).
- Test-/Demo-Artefakte (Test AG, Wegwerf, Mustermann-Seed, Demo-Projekt, seed-org) entfernt.
- **Endstand (echte Daten):** Customer 21 · Organization 2 · Project 38 · Employee 25 · Identity 27. Über API verifiziert; Merge-Beispiel „Baier Maschinen (bm)" ok.
- **Apps NICHT angebunden** (bewusst). Nächste mögliche Schritte: nginx/PW/Git (s.o.), dann Anbindung via INTEGRATION_HANDOFF Teil B (Trigger an kontor → clocker), oder weitere App-Daten zentralisieren (Langzeit-Ziel).

### 2026-07-27 (Arbeitsverträge: Vertragsnummer + Arbeitszeit/Urlaub-Klauseln)
- **Fortlaufende Vertragsnummer:** `EmploymentContract.number Int @unique` (Schema) + `entities.ts`: `autoNumberField: "number"`, `number` in `protectedFields` → Nexus vergibt zentral (max+1, P2002-Retry, Client-Wert wird ignoriert). Anzeige-Format `AV-0001` (`vertragsNr()` in `contracts/page.tsx`).
- **Klick auf Nummer = Zwischenablage:** Badge in der Vertragsliste + Button in der Kopfzeile; `copyText()` nutzt `navigator.clipboard` (nur https/secure context) mit `execCommand`-Fallback für den Zugriff über `http://192.168.1.10:3050`. Rückmeldung „kopiert ✓" + Statuszeile. Neues Icon `copy` in `components/Icon.tsx`.
- **Nummer im Dokument:** Titelblock Seite 1 („Vertragsnummer AV-0001"), laufende Kopfzeile ab Seite 2, Fußzeilen-`docRef`.
- **Flexarbeitszeit 32–42 Std./Woche:** Default `weekHoursMin` 35 → **32** (Schema + Formular-Default `LEER`).
- **Arbeitszeitkonto + Regelarbeitszeit:** neue Felder `timeAccount Boolean @default(true)`, `coreTimeFrom @default("07:00")`, `coreTimeTo @default("17:00")`; Formularfelder (2× time-Input + Checkbox). § „Arbeitszeit" heißt jetzt **„Arbeitszeit und Arbeitszeitkonto"**: Rahmen 07:00–17:00 Uhr „nach Absprache" (abweichend bei Montage/Service/Auswärts), Zeiterfassungspflicht, Plus-/Minusstunden, Freizeitausgleich, Abrechnung bei Vertragsende. Checkbox aus → Arbeitszeitkonto-Absätze entfallen.
- **Urlaub:** max. `vacationDays` (30) bei Vollzeit/5-Tage-Woche; tatsächlicher Anspruch **nach erbrachter Wochenarbeitsleistung** (Formel: 30 × Ø Arbeitstage/Woche ÷ 5, Aufrundung auf halbe Tage, gesetzlicher Mindesturlaub unberührt). Feld-Label „Urlaubstage / Jahr (max. 30)", `max={30}`.
- `db push --accept-data-loss` (Tabelle war leer → kein Datenverlust), `generate`, Build ✓, `pm2 restart nexus`.
- **Verifiziert:** POST /api/contracts → `number` 1 und 2 fortlaufend, mitgeschickte `number: 999` ignoriert, neue Defaults gesetzt (32 / 07:00–17:00 / timeAccount true); Testverträge wieder entfernt (DB wieder 0 Verträge → nächster echter Vertrag = AV-0001). `GET /contracts` 200. `git-save.sh` gepusht.
- **Klauseln entfernt (auf Wunsch Daniel, 2026-07-27):** (a) im § Wettbewerbsverbot der Absatz „Während des Arbeitsverhältnisses … untersagt, … selbstständig zu machen" → § heißt jetzt **„Kunden- und Mitarbeiterschutz"**, Vertragsstrafen-Verweis von „Ziffer 1 oder Ziffer 2" auf „Ziffer 1" angepasst. (b) die **früheren §§ 17–24** komplett: Vertragsstrafe, Ausschlussfrist, Abtretung und Verpfändung, Datenschutzrechtlicher Hinweis, Bild- und Nutzungsrechte, Vollständigkeit der Angaben/Anfechtung, Anwendbares Recht und Gerichtsstand, Nebenabreden und Schriftform. Der Vertrag endet damit nach „Beendigung des Arbeitsverhältnisses" (vollständige Vorlage: 16 §§).
- Damit das Formularfeld „Zusätzliche Vereinbarungen" nicht wirkungslos wird (es wurde nur im entfernten § Nebenabreden gerendert), erscheint es jetzt als eigener § **„Zusätzliche Vereinbarungen"** – nur wenn Text eingetragen ist. Build ✓, `pm2 restart nexus`, `/contracts` 200.
- **Korrektur:** § „Nebenabreden und Schriftform" auf Wunsch wieder aufgenommen (jetzt § 17, letzter § der vollständigen Vorlage) – inkl. Schriftform- und Salvatorischer Klausel sowie der Einbindung der freien `additionalTerms`. Der zwischenzeitliche Ersatz-§ „Zusätzliche Vereinbarungen" ist damit entfallen. Entfernt bleiben die früheren §§ 17–23 (Vertragsstrafe, Ausschlussfrist, Abtretung/Verpfändung, Datenschutzhinweis, Bild-/Nutzungsrechte, Anfechtung, Gerichtsstand).

### 2026-07-27 (Arbeitsverträge: saubere Druck-/PDF-Ansicht)
- **Problem:** Der bisherige „Drucken / PDF"-Button rief `window.print()` auf der Editor-Seite auf; das Print-CSS blendete per `visibility:hidden` die App aus → unsaubere Ausgabe (leere Bereiche, verrutschte Seiten).
- **Umbau:** Vertragsdokument aus `contracts/page.tsx` nach **`src/components/VertragDokument.tsx`** extrahiert (A4-Konstanten, `buildSections`, Briefkopf/LaufKopf/Fuss/Kasten/Absatz/A4Seite, Umbruchmessung; Exporte: `VertragDokument` (default), `A4_W`, `vertragsNr`, `fmtDate/fmtMoney/txt`, `ARBEITGEBER`, Typ `Contract`). Editor nutzt sie in der Zoom-Vorschau, die Druckseite unverändert dasselbe Layout.
- **Neue Seite `/vertrag/[id]`** (`src/app/vertrag/[id]/page.tsx`, bewusst **außerhalb** der Route-Group `(app)` → kein Menü/App-Rahmen): lädt den Vertrag per API, zeigt die A4-Seiten auf grauem Grund, sticky Toolbar („Zurück", „Drucken / als PDF speichern", Vertragsnummer, Hinweis „Ziel: Als PDF speichern, Ränder: Keine, 100 %"). Print-CSS ohne visibility-Trick: `@page A4 margin 0`, `page-break-after` je Seite. Auf Displays < 830 px werden die Seiten für die Bildschirmansicht skaliert, gedruckt wird 1:1.
- **Editor:** Button heißt jetzt „PDF-Vorschau / Drucken" und öffnet `/vertrag/<id>` im neuen Tab; ohne gespeicherten Vertrag Hinweis „bitte zuerst speichern" (die Seite lädt aus der DB). Der alte visibility-Print-Hack wurde durch einen kurzen Druckhinweis ersetzt.
- **Echtes Server-PDF (Puppeteer) nicht möglich:** Chrome/Chromium ist zwar unter `~/.cache/ms-playwright/chromium-1223` vorhanden, dem Binary fehlen aber 6 Systembibliotheken (libatk-1.0, libatk-bridge-2.0, libxkbcommon, libpango-1.0, libXdamage, libatspi) → Installation braucht `sudo` (Daniel angeboten). Danach wäre eine Route `/api/contracts/[id]/pdf` mit Direkt-Download möglich.
- Build ✓, `pm2 restart nexus`, `/vertrag/<id>` liefert 200 mit Toolbar. Testvertrag (AV-0002 „PDF-Test") inkl. Revision wieder entfernt; Bestand: **AV-0001 „Arbeitsvertrag – Andreas Schäfer"** (von Daniel angelegt, unangetastet).

### 2026-07-28 (Arbeitsverträge: echtes PDF mit jsPDF)
- **Hinweis Daniel:** kontor und Schaltplan-Editor geben bereits PDFs aus → gleiches Verfahren übernehmen statt Browser-Druckdialog. kontor nutzt **jsPDF** (`src/lib/pdf-document.ts`, clientseitig, Vektor-PDF), schaltplan ebenfalls (+ svg2pdf).
- **Server-Chrome verworfen:** Puppeteer-Weg scheitert an fehlenden Systembibliotheken (libatk usw., `sudo` nötig) → clientseitige Erzeugung ist ohnehin der von den anderen Apps erprobte Weg. `npm i jspdf`.
- **Klauseltexte in ein Datenmodell überführt** (`src/components/VertragDokument.tsx`): statt JSX-Fragmenten jetzt `Seg[]` (Textsegmente mit Fett-Flag) über den Template-Tag `` b`… ${fett} …` `` (`plain(x)` = nicht fett), Typen `Seg`/`Absatz`/`Abschnitt`, `buildSections` exportiert. **Grund:** HTML-Vorschau und PDF speisen sich aus derselben Quelle – sonst driften die Vertragstexte auseinander. HTML-Renderer `<Segmente>` + erweiterte `Absatz`-Komponente (inkl. Aufzählung § 616).
- **Neu `src/lib/vertragPdf.ts`:** `generateVertragPdf(form) → Blob` (A4, Helvetica, 9,3 pt). Eigener Zeilenumbruch mit **Inline-Fett** (Wörter können über Segmentgrenzen hinweg gemischt fett/normal sein – sonst entstünde ein Leerzeichen vor Satzzeichen, z. B. „01.08.2026 ."), **Blocksatz** mit begrenzter Streckung, Seitenumbruch mit Witwenschutz (Überschrift + 1. Absatz zusammen), Briefkopf mit Logo, Titel + Vertragsnummer, Parteienblock, §§, Unterschriftenzeilen, Fußzeile „Arbeitsvertrag AV-XXXX · Name" / „Seite x von y" auf allen Seiten. Dazu `vertragDateiname()` und `downloadBlob()`.
- **Logo:** `public/baier-logo.png` (aus dem SVG via cairosvg, 520 px) – SVG→Canvas rastert nicht in jedem Browser zuverlässig; SVG bleibt Fallback.
- **Seite `/vertrag/[id]` umgebaut:** erzeugt das PDF im Browser und zeigt es im PDF-Viewer (iframe, Blob-URL). Buttons: „Zurück", „**Als PDF speichern**" (echter Datei-Download), „**Drucken**" (druckt das PDF, nicht die HTML-Seite).
- **Verifiziert:** Module mit tsc kompiliert und in Node ausgeführt → PDF erzeugt (vollständige Vorlage 4 Seiten/158 KB, Standard+befristet 3 Seiten); `pdftotext` zeigt korrekte Umlaute/Sonderzeichen (§, „", –, ×, ÷) und Klauseltexte; `pdftoppm`-Rendering von Seite 1+2 kontrolliert (Briefkopf, Vertragsnummer, Parteien, Blocksatz, laufende Kopfzeile, Fußzeile mit Seitenzahl). Build ✓, `pm2 restart nexus`, `/vertrag/<id>` 200, `/baier-logo.png` 200.
- **Fußzeile + Briefkopf ergänzt (28.07.):** In jeder Fußzeile mittig das **Nexus-Signet** (`public/nexus-mark.svg` + `.png`, aus dem App-Icon abgeleitet, ohne Kachel, Nexus-Blau #3b82f6) und der Hinweis „erstellt mit **Nexus App**" – in HTML-Vorschau (`Fuss`) und PDF (`vertragPdf.ts`). E-Mail im Briefkopf geändert: `technik@baier-maschinen.de` → **`d.baier@baier-maschinen.de`** (`ARBEITGEBER` in `VertragDokument.tsx`).
- Verifiziert per Node-Testlauf mit echten Logo-PNGs (Image/Canvas gestubbt): 4 Seiten, 4 eingebettete Bilder, `pdftotext` zeigt „erstellt mit Nexus App" auf allen 4 Seiten und die neue E-Mail; Fußzeile + Briefkopf per `pdftoppm`-Ausschnitt visuell kontrolliert.

### 2026-07-28 (Hinweis auf neue App-Version)
- **Wunsch Daniel:** wie in kontor/ProjectEye anzeigen, wenn eine neue Version ausgerollt wurde, mit Klick zum Laden.
- **Verfahren von kontor übernommen** (`src/components/ClientLayout.tsx` + `/api/version`): Endpunkt `GET /api/version` (neu: `src/app/api/version/route.ts`, `force-dynamic`, ohne Auth) liefert die Next-Build-Kennung aus `.next/BUILD_ID`. Die UI merkt sich die Kennung beim ersten Aufruf und vergleicht sie alle **30 s** sowie **bei jedem Fensterfokus**; weicht sie ab, erscheint die Hinweisleiste.
- **UI:** `src/app/(app)/layout.tsx` (Polling + `updateVerfuegbar`), Leiste unten mittig eingeblendet („Neue Version von Nexus verfügbar" + Button „Jetzt laden" → `location.reload()`), Stil `.update-leiste` in `globals.css` (fixed, überlagert kein Layout, safe-area-tauglich, Einblend-Animation).
- **Verifiziert:** `/api/version` liefert ohne Anmeldung `{"buildId":"…"}` passend zu `.next/BUILD_ID`; nach erneutem Build ändert sich die Kennung (Kw5hhFJoz… → Um4QVjSkwRBSTgbK4BBLQ) → Auslöser für die Leiste ist bestätigt.
- **Zwischenfall:** Beim Test-Rebuild lief `next build` gegen das `.next` des laufenden Servers; nach dem Neustart fehlte `.next/server/pages/_error.js` → nexus crashte in einer Neustartschleife (App ~2 Min nicht erreichbar). Behoben durch vollständigen Neubau + Neustart; danach `/api/version`, `/contracts`, `/vertrag/<id>` alle 200. **Lehre:** Build immer vollständig durchlaufen lassen und erst danach `pm2 restart`.
- **Korrektur Briefkopf/Fußzeile (28.07., nach Rückmeldung Daniel):** Firmenlogo im PDF war zu groß (26 mm breit) → jetzt über die **Höhe** definiert (12,7 mm, entspricht den 48 px der Bildschirm-Vorschau), Breite folgt dem Seitenverhältnis. Fußzeilen-Signet ersetzt durch das **App-Symbol mit blauer Kachel und weißem Zeichen** (`public/nexus-badge.png/.svg`, aus `src/app/icon.svg`), deutlich größer (6,4 mm) und zweizeilig beschriftet: „erstellt mit" / „**Nexus**" (blau, fett; „App" entfällt). Fußzeilen-Trennlinie auf `FOOT_Y-6`, `BODY_BOTTOM` auf `FOOT_Y-11` angepasst, damit das Symbol Platz hat. HTML-Vorschau analog (18 px Kachel, zweizeilig). Alte Dateien `nexus-mark.*` entfernt.
- Verifiziert: PDF neu erzeugt (4 Seiten, 4 Bilder), Kopf- und Fußbereich per `pdftoppm` visuell kontrolliert; Build ✓, Neustart ✓, `/contracts`, `/vertrag/<id>`, `/nexus-badge.*`, `/api/version` alle 200.
- **Lesbarkeit/Umbruch verbessert (28.07., Wunsch Daniel):** (a) mehr Luft — Abstand zwischen Absätzen `GAP` 2,6 → **4,2 mm**, neuer Abstand **4,5 mm vor jeder §-Überschrift**, Abstand unter der Überschrift 5,6 → 6,4 mm; HTML-Vorschau analog (`ITEM_GAP` 9 → 13 px, `Kasten` paddingTop 9 → 14 px). (b) **Absätze werden nie mitten durchgeschnitten**: neue Funktion `absatzMessen()` berechnet Zeilen + Höhe vorab; passt ein Absatz nicht mehr vollständig auf die Seite, wandert er komplett auf die nächste (nur Absätze, die länger als eine ganze Seite sind, dürfen brechen). Damit rutschen auch kurze Absätze am Seitenende automatisch auf die Folgeseite. (c) §-Überschrift + **kompletter** erster Absatz müssen zusammen passen, sonst beginnt der § auf einer neuen Seite.
- Verifiziert: PDF neu erzeugt (jetzt 5 statt 4 Seiten durch die größeren Abstände), alle Seiten per `pdftoppm` durchgesehen — §§ klar abgesetzt, kein Absatz über den Seitenrand geschnitten, Unterschriftenblock sitzt sauber am Ende. Build ✓, Neustart ✓, alle Seiten 200.

### 2026-07-29 (Arbeitsvertrags-Seite mobiltauglich)
- **Feld-Raster:** die inline-Grids im Formular durch Klassen `.feld-zeile-2/-3` ersetzt (`globals.css`). ≤768 px: dreispaltige Reihen werden **zweispaltig** (letztes Feld einer ungeraden Reihe über die volle Breite), ≤430 px alles **einspaltig** – vorher waren Probezeit/Flexzeit bzw. Regelarbeitszeit auf dem Handy dreigeteilt und unbedienbar.
- **Kopfbereich:** `.vertrag-kopf` (kleinere Überschrift) und `.vertrag-aktionen` (volle Breite, Buttons dehnen sich, Icon-Buttons bleiben schmal). Button-Text „PDF-Vorschau / Drucken" wird auf dem Handy zu „PDF" (`.nur-desktop` / `.nur-handy`).
- **A4-Vorschau:** startet auf ≤768 px **eingeklappt** (dort auf ~45 % skaliert und kaum lesbar); Umschalter „Vorschau anzeigen/ausblenden" nur auf dem Handy, dazu ein Hinweis, dass zum Lesen die PDF-Ansicht gedacht ist. Eingeklappt wird die Vorschau nicht gerendert → spart auf Handys auch die Umbruchmessung.
- **Vertragsnummer-Badge** in der Liste: größeres Antippfeld (`.nr-badge`, 5×9 px Innenabstand, 12,5 px).
- **PDF-Seite `/vertrag/[id]`:** auf ≤768 px **kein iframe** mehr (Handy-Browser, vor allem iOS, zeigen eingebettete Blob-PDFs oft nicht an), stattdessen Karte mit „PDF speichern" / „PDF öffnen" (öffnet den System-PDF-Betrachter) samt Erklärung; Leiste kompakter, Safe-Area oben berücksichtigt.
- Build ✓, Neustart ✓, `/contracts` und `/vertrag/<id>` 200, neue Regeln im ausgelieferten Stylesheet geprüft. **Offen:** visuelle Kontrolle auf einem echten Gerät (headless kein Browser verfügbar) – Daniel testet am Handy.

### 2026-07-29 (Dokumentenablage je Mitarbeiter)
- **Anforderung Daniel:** Personalfragebogen (Minijob, 5 Seiten, AcroForm) für jeden Mitarbeiter ablegen, für neue Mitarbeiter herunterladen, **vorausgefüllt**, speichern/drucken; Dateiname immer mit **Firma, Mitarbeiter-Kennung, Datum und Version**.
- **Schema:** `Employee` um Stammdaten erweitert (`phone`, `street`, `zip`, `city`, `birthDate`, `nationality`) — im Mitarbeiter-Editor pflegbar (uiSchema). Neu `DocumentTemplate` (key/name/data Bytes/version/formFields/fieldMap) und `EmployeeDocument` (employeeId, orgId+orgName, templateKey, fileName, data, size, version, filled). `db push` ✓.
- **`src/lib/documents.ts`:** `bauDateiname()` → `Firma_Mitarbeiter_Dokument_JJJJ-MM-TT_hhmm_vN.pdf`, `leseFormularfelder()`, `fuelleFormular()` (pdf-lib, Formular bleibt **ausfüllbar**, nicht flach gedrückt), `STANDARD_FELDZUORDNUNG` für den Minijob-Fragebogen, `filtereAufVorhandene()`, `werteAusMitarbeiter()`.
- **API:** `/api/doc-templates` (GET Liste, POST Anlegen **oder Ersetzen → Version +1**), `/api/doc-templates/[id]` (GET/PATCH/DELETE), `/api/doc-templates/[id]/file?employeeId=&orgId=` (leer oder vorausgefüllt), `/api/employee-documents` (GET je Mitarbeiter, POST aus Vorlage **oder** Datei-Upload; Version = höchste je Mitarbeiter+Vorlage + 1), `/api/employee-documents/[id]` (PATCH/DELETE) und `/[id]/file`. Datei-Routen liefern rohe `Response` (deshalb eigener try/catch statt `handle()`), Abruf per fetch mit Bearer-Token, Dateiname im Header `X-Dateiname`.
- **UI `/documents`** (Nav „Dokumente", neues Icon `archive`): links Vorlagen (hochladen, ersetzen=neue Version, leer/vorausgefüllt herunterladen, entfernen; zeigt erkannte Formularfelder und wie viele automatisch befüllt werden), rechts Mitarbeiter- und Firmenwahl, Hinweis auf fehlende Stammdaten, Buttons „Vorausgefüllt ablegen" / „Leer ablegen" / „Datei hochladen" sowie die versionierte Ablage mit Öffnen/Speichern/Entfernen.
- **Verifiziert (echter Durchlauf):** Vorlage hochgeladen → **29 Formularfelder** erkannt, 10 automatisch zugeordnet; vorausgefülltes PDF geladen (135 KB) mit Dateiname `IngPro-Baier-Automatisierungstechnik_MA-TEST_personalfragebogen-minijob_2026-07-29_1542_v1.pdf`; zweimal abgelegt → v1 und v2; Felder im PDF geprüft (Vorname, Nachname, Geburtsdatum, Straße, PLZ, Ort, E-Mail, Telefon, Staatsangehörigkeit, Arbeitgeber) und **Formular bleibt ausfüllbar**. Testmitarbeiter + Testdokumente wieder entfernt, die Vorlage bleibt.
- **Bekannte Grenze:** Die Felder „Name/Vorname des Arbeitnehmers" (S. 2) und „Name des Arbeitgebers" (S. 3) sind im Original-PDF **nicht am Formular angemeldet** und daher technisch nicht befüllbar (weder pdf-lib noch andere Werkzeuge sehen sie); die Zuordnung filtert sie aus. Datumsformat auf zweistellig korrigiert (17.04.1995 statt 17.4.1995).
- **PDF-Viewer aus ProjectEye übernommen (29.07., Wunsch Daniel):** `app/src/PdfDocViewer.jsx` (705 Zeilen) + `RailInsert.jsx` nach `src/components/` kopiert. Anpassungen für Next.js: `"use client"`, Vite-Import `pdf.worker.min.mjs?url` → Worker-Kopie unter `public/pdf.worker.min.mjs` (Auslieferung geprüft: 200, `application/javascript`), `LivePeers` als Stub (ProjectEyes Live-Kanal gibt es in Nexus nicht → `usePeers` liefert leere Liste), Typdeklaration `PdfDocViewer.d.ts` (alle Zusatz-Props optional). Neue Abhängigkeiten: `pdfjs-dist@4`, `lucide-react`.
- **Einbindung:** `src/components/PdfViewerModal.tsx` (Vollbild-Overlay, ESC schließt, Farbschema an Nexus/Dark-Mode angepasst, Viewer per `next/dynamic` **ohne SSR**). In `/documents`: „Ansehen" bei Vorlagen (leer bzw. mit den Daten des gewählten Mitarbeiters) und „Öffnen" bei abgelegten Dokumenten öffnen jetzt den Viewer statt eines neuen Tabs.
- **Funktionsumfang** (aus ProjectEye): Miniaturen-Leiste, Volltextsuche über alle Seiten, Zoom (Strg+Rad, Pinch, ±, 100 %), Breite/Höhe einpassen, Seite drehen, Blättern, Anzeigemodi Einzelseite/fortlaufend vertikal/horizontal, mobile Bedienung (Suchlupe, Überlaufmenü) sowie **Seiten bearbeiten**: umsortieren per Ziehen, duplizieren, entfernen, Leerseiten einfügen.
- **Speichern:** Seitenänderungen werden über `onSavePdf` als **neue Version** in der Mitarbeiter-Ablage gespeichert (Notiz „Seiten bearbeitet aus Version N"), die bisherige Fassung bleibt erhalten. Bei Vorlagen ist der Viewer reine Ansicht.
- Build ✓, Neustart ✓, `/documents` 200, pdf.js-Chunks im Build vorhanden. **Nicht headless prüfbar:** das tatsächliche Rendern im Browser – Daniel testet.

### 2026-07-29 (Anträge im Viewer ausfüllen + mobile Bedienung)
- **Text ins PDF schreiben (Viewer):** neuer Schalter „Text" (Type-Symbol). Ist er aktiv, setzt ein Tippen auf die Seite ein Textfeld (verschiebbar/löschbar, mehrzeilig); beim Speichern werden die Texte mit pdf-lib fest auf die jeweilige **Originalseite** gezeichnet (Bildschirm- → PDF-Koordinaten, Zeilenabstand 1,25).
- **Formularfelder ausfüllen (Viewer):** beim Laden werden die AcroForm-Textfelder ausgelesen; neuer Schalter mit Feldzähler öffnet eine Leiste, in der **alle Felder direkt beschreibbar** sind (zweispaltig am Desktop, einspaltig mobil). Beim Speichern via `form.getTextField().setText()` + `updateFieldAppearances()`.
- **Wichtige Korrektur nach Test:** `copyPages` in ein neues Dokument **verliert die ausfüllbaren Formularfelder** (Inhalte bleiben nur sichtbar). Deshalb wird jetzt **ohne Seitenänderung direkt gespeichert** (`src.save()`), das Formular bleibt erhalten (Test: 29 Felder erhalten, Wert lesbar). Nur beim Umsortieren/Einfügen von Seiten läuft der Kopierweg – dafür erscheint im Viewer eine **Warnleiste**.
- Speichern legt weiterhin eine **neue Version** in der Mitarbeiter-Ablage an; `edited` berücksichtigt jetzt auch Text- und Formularänderungen, damit die Schaltfläche erscheint.
- **Neue Komponente `SuchSelect`** (`src/components/SuchSelect.tsx`): Auswahlfeld mit Suchleiste statt `<select>` – Desktop als Panel, **Handy als Blatt von unten** (große Suchleiste, 16 px Schrift gegen iOS-Zoom, fingerfreundliche Einträge, Häkchen bei der Auswahl, Treffer nach Name/Nummer/E-Mail). Eingesetzt bei Mitarbeiter und Firma in `/documents` sowie Mitarbeiter in `/contracts`. Neues Icon `chevron-down`.
- **Bestätigungsabfrage mobil** (`ConfirmDialog` + `.cd-*` in globals.css): auf ≤768 px sitzt das Fenster unten über die **volle Breite** (abgerundete Oberkante, Safe-Area), Schaltflächen untereinander und in voller Breite; lange Dateinamen brechen um (`overflow-wrap: anywhere`).
- Build ✓, Neustart ✓, `/documents`, `/contracts`, `/vertrag/<id>`, `/api/version` alle 200; neue CSS-Regeln im ausgelieferten Stylesheet geprüft. Speicher-Pipeline (Formularfeld + Text + Seitenumbau) in Node getestet.

### 2026-07-30 (Lieferanten + Abgleich mit ProjectEye)
- **Neues Model `Supplier`** (zentraler Lieferantenstamm, Superset der ProjectEye-Felder): `number` (zentrale fortlaufende Nummer, server-vergeben wie bei Artikeln), `name`, `shortCode`, `contactName`, `email`, `phone`, `web`, `customerNumber`, `street/zip/city/country`, `addressFree`, `taxNumber`, `ustId`, `category`, `notes`, `projecteyeId`, `archived`. `db push` ✓.
- **entities.ts**: `Supplier` mit `autoNumberField: "number"` und `number` in `protectedFields`; **uiSchema**: Ressource `suppliers` (Liste + Bearbeiten-Felder); **API** `/api/suppliers` + `/api/suppliers/[id]` über die CRUD-Factories; **UI** `/suppliers` (ResourceView) und Menüpunkt „Lieferanten" mit neuem Icon `truck`.
- **Abgleich mit ProjectEye:** ProjectEye speichert in `server/data/projecteye.json` (Feld `suppliers`). Neues Skript `prisma/sync-projecteye-suppliers.ts` liest die Datei **nur** (der laufende ProjectEye-Server hält seinen Stand im Speicher — Fremdschreiben würde überschrieben) und übernimmt die Lieferanten **idempotent**: Zuordnung über `projecteyeId`, ersatzweise über normalisierten Firmennamen (Rechtsform/Sonderzeichen ignoriert); vorhandene Nexus-Datensätze werden nur in **leeren** Feldern ergänzt. Unstrukturierte Anschriften werden per Muster in Straße/PLZ/Ort zerlegt (Rest bleibt in `addressFree`). Option `--dry`.
- **Verifiziert:** Probelauf → 14 erkannt; echter Lauf → **14 neu angelegt** (Nr. 1–14, mit Kürzel/Kundennr./Adressen, z. B. heco 75196 Remchingen-Nöttingen, LUTENA 28357 Bremen); zweiter Lauf → 0 neu, 14 unverändert (**idempotent**). API getestet: `GET /api/suppliers` liefert 14, Suche (`?search=`) trifft Name/Kürzel/Kundennummer (edel→Edelstahl24, WUR→Würth, 61639→heco), `POST` vergibt die Nummer zentral (mitgeschickte 999 ignoriert), Testlieferant wieder entfernt. Build ✓, Neustart ✓, `/suppliers` 200.
- **Übergabe an die ProjectEye-Session:** `/mnt/devip3/shared/nexus/LIEFERANTEN_HANDOFF.md` — Endpunkte, Verknüpfung über `projecteyeId`, Hinweis zur Artikel-Zuordnung (`articles.supplierId` zeigt auf die lokale ID) und die Regel, dass Nexus nicht in die ProjectEye-JSON schreibt.
- **Ansprechpartner je Lieferant (30.07.):** neues Model `SupplierContact` (name, role, email, phone, mobile, notes; `onDelete: Cascade`) + Relation `Supplier.contacts`. API `/api/supplier-contacts` (GET nach `supplierId` **oder** `search` über alle Lieferanten – dann mit Lieferant im Ergebnis, POST) und `/api/supplier-contacts/[id]` (PATCH/DELETE).
- **Suche findet jetzt auch Ansprechpartner:** `EntityDef` um `searchRelations` und `includeRelations` erweitert, `makeList` bildet daraus eine `some`-Bedingung. Bei Lieferanten sucht die Liste über Firma, Kürzel, E-Mail, Kundennummer, Telefon, Web, Ort, Notizen **und** über Ansprechpartner (Name, Funktion, E-Mail, Telefon, Mobil); die Kontakte kommen mit der Liste mit.
- **Trefferanzeige:** In Tabelle und Handy-Karten steht unter dem Firmennamen, **welcher** Ansprechpartner den Treffer ausgelöst hat (mit Personensymbol).
- **Gefundener Text wird markiert:** neue Komponente `Hervorheben` (regex-sicher, alle Vorkommen, Groß-/Kleinschreibung egal) + Stil `mark.treffer` (gelb, auch im Dunkelmodus). Eingesetzt in Tabellenzellen, Handy-Karten, Detailfenster (Titel und alle Werte) und in der Ansprechpartner-Liste.
- **Detailfenster für Lieferanten:** Klick auf einen Lieferanten öffnet die Vorschau (`detail: true`), darin die neue Komponente `AnsprechpartnerListe` – anlegen/bearbeiten/entfernen, **eigene Suchleiste** (Esc leert, zweites Esc gibt den Fokus frei – `SearchInput`), Treffer hervorgehoben, E-Mail/Telefon als Verknüpfungen. Der Suchbegriff aus der Liste wird ins Fenster übernommen. Fenster auf ≤768 px bildschirmfüllend (`.dm-fenster`). Neue Icons `phone`, `smartphone`.
- **Verifiziert:** Zwei Kontakte bei Würth angelegt → Lieferantensuche findet sie über Vorname („Sabine"), Funktion („Anwendungstechnik") und E-Mail-Teil („t.technik"); Kontaktsuche über alle Lieferanten liefert „Tobias Technik @ Würth"; PATCH und DELETE geprüft; Testkontakte wieder entfernt (0 verbleibend). Build ✓, Neustart ✓, `/suppliers` 200, `mark.treffer` im Stylesheet vorhanden.

### 2026-07-30 (Mitarbeiter-Abgleich Nexus ⇄ clocker, beidseitig)
- **Neues Skript `prisma/sync-clocker-employees.ts`** (clocker-DB direkt per `pg`, Zugang `CLOCKER_DATABASE_URL`, Standard `postgresql://clocker:clocker_pw@localhost:5432/clocker`).
- **Zuordnung** in drei Stufen: E-Mail (in clocker eindeutig) → Personalnummer (`employeeNumber` ↔ `employeeId`) → normalisierter Name (nur als letzte Stufe, wird als „unsicher" protokolliert; bei mehreren Namensgleichen wird übersprungen statt geraten — die bekannte Duplikat-Falle).
- **Abgeglichene Felder:** name, email, Personalnummer, Farbe. Rechte/Stundensätze/Lohn bleiben in clocker, Adresse/Geburtsdatum/Telefon/Staatsangehörigkeit in Nexus.
- **Konfliktregel:** leeres Feld wird aus der anderen Seite gefüllt; sind beide gefüllt und verschieden, gewinnt die **jüngere** Änderung (`updatedAt`). Geschrieben wird nur bei echter Abweichung → kein Ping-Pong. E-Mail-Kollisionen in clocker werden erkannt und nicht übertragen.
- **Anlegen in beide Richtungen:** clocker→Nexus als `Employee` + `Identity` mit dem clocker-bcrypt-Hash + `IdentityAppAccess` (clocker); Nexus→clocker als `User` mit dem Hash der Nexus-Identität, sonst Zufallspasswort (Hinweis im Protokoll, Login erst nach Zurücksetzen). Ohne E-Mail ist ein Anlegen in clocker nicht möglich (dort Pflicht + eindeutig) → wird übersprungen und protokolliert.
- **Verifiziert:** Probelauf (`--dry`) → 28 Paare, 0 Feldkonflikte, 1 neuer clocker-Benutzer; echter Lauf → „Philipp Blech" in Nexus angelegt (29/29). Gegenrichtung getestet: Testmitarbeiter nur in Nexus angelegt **und** Farbe eines bestehenden Paars in Nexus geändert → beides landete in clocker (neuer User mit Personalnummer, Farbe `#abcdef`). Testdaten in beiden Systemen entfernt, Farbe zurückgesetzt (29/29).
- **Automatik:** `scripts/sync-clocker.sh` + **Cron alle 15 Minuten**, Protokoll `/var/log/nexus-clocker-sync.log`.
- Die neuen Sync-Skripte sind in `tsconfig.json` von der App-Typprüfung ausgenommen (laufen über ts-node, `pg` hat keine Typen im Projekt).

- **Personalfragebogen in der App ausfüllen (Wunsch Daniel):** Bisher war der Betrachter bei **Vorlagen** reine Ansicht – Ausfüllen ging nur bei bereits abgelegten Dokumenten. Jetzt gilt: Mitarbeiter wählen → bei der Vorlage auf **Ansehen** (öffnet vorausgefüllt) → im Betrachter Formularfelder ausfüllen bzw. Text einsetzen → **Speichern legt das ausgefüllte Formular direkt beim Mitarbeiter ab** (Version 1, Notiz „in der App ausgefüllt"). Bei einem bereits abgelegten Dokument entsteht wie bisher eine neue Version („in der App bearbeitet (aus Version N)"). Hinweistext dazu steht jetzt auf der Seite.
- **Formularfelder direkt im Dokument ausfüllbar (30.07., Nachbesserung):** Statt nur der Feldliste liegen jetzt **echte Eingabefelder an ihrer Position über dem PDF**. Umsetzung: beim Rendern der Seite `page.getAnnotations()` auslesen, Widgets mit `viewport.convertToViewportRectangle()` einmessen (berücksichtigt Zoom und Drehung) und als `input`/`textarea` bzw. Kästchen/Auswahlknopf einblenden (dezent blau hinterlegt, gefüllte Felder heller). `onMouseDown/onTouchStart` stoppen die Weitergabe, damit das Tippen nicht als Verschieben gilt.
- **Kästchen-Gruppen wie Anrede/Versicherungsart:** Im Fragebogen sind das laut pdf-lib **CheckBox-Felder mit mehreren Widgets** (eigene „An"-Zustände /0 /1 /2 /3), keine Radio-Gruppen. `check()` wäre falsch. Deshalb wird beim Speichern `/V` auf den gewünschten Zustand gesetzt und `/AS` je Widget nachgezogen → **genau eine Markierung**. Getestet: Anrede „Frau" (/1) und Versicherungsart (/0) gesetzt, Rendering kontrolliert (nur ein Punkt markiert), 29 Felder erhalten, Texte lesbar.
- **Ansichtsmodus:** Bei ausfüllbaren Dokumenten schaltet der Betrachter automatisch auf **Einzelseite** (nur dort liegen die Felder passend über dem Dokument); im Fortlauf-Modus erscheint stattdessen ein Hinweis mit Schaltfläche „Jetzt ausfüllen".
- Build ✓, Neustart ✓, `/documents` 200.
- **Fehlerbehebung nach Rückmeldung (Screenshot: „keine Eingabe möglich und Text im Hintergrund"):**
  1. **Ursache Text im Hintergrund:** ProjectEye definiert die pdf.js-Textebene in seiner `index.html` (`.pe-textlayer span { color: transparent; position: absolute }`). Diese globalen Styles fehlten in Nexus → der komplette Dokumenttext wurde sichtbar im Seitenfluss gerendert und schob das Layout auseinander. Behoben: `.pe-textlayer`, `.pe-scrollbar` und die Keyframes (`pe-spin`, `pe-indet`, `pe-fade`, `pe-slideup`) nach `globals.css` übernommen (Container-Position bewusst **nicht** überschrieben, die setzt der Viewer inline).
  2. **Ursache keine Eingabe:** Die Ansicht stand im **Fortlauf-Modus** (dort rendert `FlowPage`, und die Eingabefelder gibt es nur in der Einzelseiten-Ansicht). Jetzt schaltet ein Dokument mit Formularfeldern **immer** auf Einzelseite (vorher nur, wenn Speichern erlaubt war – bei einer Vorlage ohne gewählten Mitarbeiter also nie). Zusätzlich erscheint im Fortlauf-Modus ein Hinweisband mit „Jetzt ausfüllen".
  3. Eingabefelder werden jetzt unabhängig von `onSavePdf` angezeigt (Ausfüllen immer möglich), und das Speichern ist im Betrachter immer verfügbar – fehlt der Mitarbeiter, kommt ein klarer Hinweis statt einer stummen Sperre.
  4. Das Hinweisband war fehlplatziert (innerhalb des `!flowMode`-Zweigs, dadurch nie sichtbar) → korrekt vor den Fortlauf-Bereich gesetzt.
- Build ✓, Neustart ✓, `/documents` 200, `.pe-textlayer span { color: transparent; position: absolute }` im ausgelieferten Stylesheet bestätigt.
- **Nachbesserung „lässt sich immer noch nicht ausfüllen":** Ursache waren die **Gesten-Handler** des übernommenen Viewers. `touchstart/touchmove` hingen am Scrollbereich (`{ passive: false }`) und der Bereich hatte `touchAction: "none"`, dazu `userSelect: none` und ein `onMouseDown`, das jeden Klick als Verschieben des Dokuments deutete → eine Berührung/ein Klick erreichte das Eingabefeld nie. Behoben: Berührungen und Klicks auf `input, textarea, select, button, [data-eingabe]` werden von Pan/Pinch **ausgenommen**, `touchAction` auf `pan-x pan-y`, `userSelect: none` am Dokumentcontainer entfernt, Felder mit `data-eingabe` gekennzeichnet und auf `zIndex: 8` gehoben.
- Zur Kontrolle vorher geprüft, dass pdf.js die Felder überhaupt liefert: `getAnnotations()` meldet auf Seite 1 **35 Widgets** mit Namen, Rechtecken und Zuständen (u. a. „Anrede" mit buttonValue 0–3) – die Erkennung war also in Ordnung, nur die Bedienung blockiert.

### 2026-07-30 (Automatischer Stammdaten-Abgleich Nexus ⇄ clocker: Firmen, Kunden, Projekte)
- **Ausgangslage geprüft:** Mitarbeiter 29/29 (liefen bereits automatisch), Firmen 2/3, Kunden 22/18, Projekte 57/39 — alles außer den Mitarbeitern stammte noch aus dem Einmal-Import und driftete auseinander.
- **Neues Skript `prisma/sync-clocker-stammdaten.ts`** (Optionen `--dry`, `--nach-clocker`):
  - **Nichts überschreiben:** clocker führt bei `Client` und `Project` **kein `updatedAt`** — „jüngere Änderung gewinnt" wäre dort geraten. Deshalb werden nur **leere Felder** der Gegenseite gefüllt (in beide Richtungen).
  - **Zuordnung über normalisierte Namen** plus **Präfix-Regel**: „Baier Maschinen Inh. David Baier" (clocker) trifft „Baier Maschinen" (Nexus), „IngPro Baier" trifft „IngPro Baier - Automatisierungstechnik". Dadurch wurden die 3 clocker-Firmen korrekt den 2 Nexus-Mandanten zugeordnet, **ohne** ein drittes Duplikat anzulegen (das war die offene Frage — so entschieden, weil Anlegen die Doppelung zementiert hätte).
  - **Anlegen:** clocker → Nexus immer; Nexus → clocker nur mit `--nach-clocker`. Begründung: Die 19 Projekte, die es nur in Nexus gibt, würden in clocker in der Stempel-Auswahl auftauchen und die Bedienung dort verschlechtern.
  - Kundenzuordnung von Projekten wird nachgetragen (clocker `clientId` → Nexus `customerId` über die Kunden-Zuordnung).
- **Verifiziert:** Probelauf → 0 neue Firmen (Zuordnung greift), 1 Adressergänzung, 1 neues Projekt. Echter Lauf → „Trogförderer" in Nexus angelegt, Kundenzuordnung bei „Drehaufträge" ergänzt, Adresse von „OM-Stuhr" nach clocker. Zweiter Lauf füllte nur noch das Gegenstück (`addressFree` in Nexus), **dritter Lauf ohne jede Änderung** → stabil, kein Ping-Pong.
- **Automatik erweitert:** `scripts/sync-clocker.sh` führt jetzt **beide** Abgleiche aus (Mitarbeiter + Stammdaten), Cron unverändert alle 15 Minuten, Protokoll `/var/log/nexus-clocker-sync.log`.
- Stand danach: Mitarbeiter 29/29 · Firmen 2/3 (zugeordnet) · Kunden 22/18 · Projekte 58/39.

### 2026-07-30 (Sofort-Abgleich: Sync startet bei jeder Änderung)
- **Wunsch Daniel:** Abgleich soll **sofort bei einer Änderung** laufen, nicht im Zeittakt.
- **Umsetzung ohne Eingriff in fremde App-Logik:** Postgres-Funktion `nexus_sync_notify()` + Trigger `nexus_sync_trg` (AFTER INSERT/UPDATE/DELETE, **FOR EACH STATEMENT**) in der **clocker**-DB (User, Client, Project, Company) und der **Nexus**-DB (Employee, Customer, Project, Organization, Supplier). Die Trigger ändern keine Daten, sie senden nur `pg_notify('nexus_sync', <Tabelle>)`.
- **Neuer Dienst `scripts/sync-watch.js`** (PM2 `nexus-sync`): horcht per `LISTEN` auf beide Datenbanken und beobachtet zusätzlich die ProjectEye-Datei (`server/data/projecteye.json`) für den Lieferanten-Abgleich. Sammelfenster 4 s (mehrere Änderungen ⇒ ein Lauf), Mindestabstand 15 s zwischen zwei Läufen, Nachlauf-Merker (während eines Laufs eintreffende Signale gehen nicht verloren), automatische Neuverbindung bei DB-Abbruch.
- **Keine Endlosschleife:** Der Abgleich selbst löst Signale aus, schreibt aber nur bei echten Abweichungen. Nachgewiesen: Projekt in clocker angelegt → nach ~20 s in Nexus; ein Folgelauf durch das eigene Schreiben; danach meldeten die Läufe „0 Änderungen" und das System kam zur Ruhe. Test wieder entfernt (58/39).
- **Cron bleibt als Sicherheitsnetz**, aber nur noch **alle 2 Stunden** (`0 */2 * * *`) – falls der Dienst einmal steht. `pm2 save` ausgeführt, damit `nexus-sync` einen Serverneustart übersteht.
- **Offen (ehrlich benannt):** Für **kontor** gibt es bisher **kein** Abgleichs-Skript – kontor ist über seine eigene App-Anbindung (Artikelstamm, zentraler Login) verbunden. Ein Kunden-/Artikelabgleich analog zu clocker wäre der nächste Schritt.
- **Mandanten: Namenszusatz ergänzt (Wunsch Daniel):** neues Feld `Organization.nameAddition` (z. B. „Inh. David Baier"), `db push` ✓, im uiSchema als Bearbeiten-Feld **und** als Listenspalte „Zusatz". Bei „Baier Maschinen" gleich befüllt. (Stolperstein: Das typografische Anführungszeichen im Feld-Label beendete den String → Label ohne Zitat geschrieben.)
- **Doppelklick öffnet die Bearbeitung – in allen Listen** (`ResourceView`): Doppelklick auf eine Tabellenzeile öffnet immer das Bearbeiten-Fenster; ein einfacher Klick zeigt weiterhin die Vorschau, wo es sie gibt (Artikel, Lieferanten). Damit sich beides nicht ins Gehege kommt, wartet der Einzelklick 220 ms und wird bei einem Doppelklick verworfen. Zeilen zeigen den Hinweis „Doppelklick zum Bearbeiten".
- Build ✓, Neustart ✓, `/organizations`, `/customers`, `/suppliers` 200.

### 2026-07-30 (kontor angebunden – wie clocker)
- **Ausgangslage:** kontor gleicht **Artikel und Logins bereits selbst** über die Nexus-API ab (`kontor/src/lib/nexusSync.ts`, aktiv bei `NEXUS_SYNC_ENABLED`). Offen waren **Kunden (Client)** und **Mandanten (Company)**. Bestand: kontor 6 Kunden / 2 Firmen / 2 Artikel — Nexus 22 / 2 / 73.
- **Neues Skript `prisma/sync-kontor-stammdaten.ts`** (`--dry`, `--nach-kontor`): Mandanten und Kunden, Zuordnung über normalisierte Namen inkl. Präfix-Regel. kontor führt bei `Client` und `Company` ein `updatedAt` → **Konfliktregel wie beim Mitarbeiter-Abgleich**: leeres Feld füllen, sonst gewinnt die jüngere Änderung. Feldabbildung u. a. `Client.company` ↔ `companyName`, `Client.name` ↔ `contactName`, `shortName` ↔ `shortCode`, plus Adresse, E-Mail, Telefon, Steuernummern, Notizen, Entfernung. **Artikel bewusst ausgespart**, sonst kollidiert der Datenbankweg mit kontors eigenem API-Abgleich.
- **Anlegen:** kontor → Nexus immer; Nexus → kontor **nur mit `--nach-kontor`** (kontor hat bewusst wenige Kunden – 16 ungefragt anzulegen wäre ein massiver Eingriff in die Fachanwendung).
- **Sofort-Abgleich erweitert:** Signal-Funktion + Trigger `nexus_sync_trg` jetzt auch in der **kontor**-DB (Client, Company). `scripts/sync-watch.js` horcht auf kontor; Änderungen in **Nexus** lösen jetzt **beide** Abgleiche aus (clocker **und** kontor). Cron-Sicherheitsnetz (alle 2 h) führt den kontor-Abgleich ebenfalls aus.
- **Verifiziert:** Probelauf → 1 Mandantenfeld je Richtung, 1 Kundenergänzung; echter Lauf identisch, zweiter Lauf ohne Änderungen (idempotent). Sofort-Test: Kunde in kontor angelegt → **nach ~15 s in Nexus** (mit Kürzel und Ort); Test in beiden Systemen entfernt, danach Ruhe (Nexus 22 / kontor 6).
- **Übernommen aus kontor:** Mandant „IngPro Baier – Automatisierungstechnik" hat jetzt den Namenszusatz „Inh. David Baier" (stand so in kontor) – bitte prüfen, ob das dort richtig gepflegt ist.

### 2026-07-31 (Personalfragebogen: Ausfüllen wie in einem normalen PDF-Betrachter)
- **Rückmeldung Daniel:** Ausfüllen klappt weiterhin nicht – in einem gewöhnlichen PDF-Betrachter kann er in jedes Feld schreiben.
- **Kurswechsel:** Die selbstgebauten Eingabefelder (eigenes Einmessen der Widgets) **komplett ersetzt** durch die **Formular-Ebene von pdf.js** (`AnnotationLayer` mit `renderForms: true`). Genau diese Technik nutzt ein normaler PDF-Betrachter: pdf.js erzeugt die Eingabefelder selbst, kümmert sich um Position, Zoom, Drehung, Feldtypen (Text, mehrzeilig, Kästchen, Auswahl) und legt die Eingaben in `doc.annotationStorage` ab.
- **Speichern:** `doc.saveDocument()` von pdf.js schreibt die Eingaben ins PDF (wie „Speichern" im Betrachter); darauf setzen dann wie bisher freie Texte (pdf-lib) und die Seitenbearbeitung auf. In Node verifiziert: 3 Werte gesetzt → gespeichertes PDF enthält **Vorname „Klaus", Nachname „Beispiel", Anrede „Frau" markiert**, alle **29 Formularfelder bleiben erhalten** (Rendering kontrolliert).
- **Zweiter, entscheidender Fehler gefunden:** Die Speichern-Schaltfläche war an `editMode && edited` gebunden – sie erschien also **nur im Seiten-Bearbeiten-Modus**. Wer nur Felder ausfüllte, konnte gar nicht speichern. Jetzt: `onSavePdf && edited`. Zusätzlich meldet `annotationStorage.onSetModified` jede Eingabe an die Oberfläche (Zähler `formularTick`), damit die Schaltfläche sofort erscheint; nach dem Speichern wird zurückgesetzt.
- **Styles:** `pdfjs-dist/web/pdf_viewer.css` im Root-Layout eingebunden (bestätigt: `annotationLayer section` wird ausgeliefert), dazu eigene dezente Kennzeichnung der ausfüllbaren Felder (blauer Rahmen, heller Hintergrund, deutlicher Fokusrahmen) in `globals.css`.
- Build ✓, Neustart ✓, `/documents` 200.

### 2026-08-14 (Vorbereitet: einheitliche E-Mail-Domäne @bgroup.de)
- **Datenschutz-Regel erweitert** (Vorgabe Daniel): keine privaten Inhalte ungefragt öffnen **und keine Dateien/Links mit privaten Inhalten versenden** – alles bleibt lokal auf dem Server, Ergebnisse nur als lokale Datei mit Pfadangabe.
- **Neues Skript `prisma/setze-mail-domain.ts`**: vergibt allen Benutzern `vorname.nachname@<Domäne>` (Standard `bgroup.de`), Umlaute umgeschrieben, Namensdopplungen mit Zahl. Schreibt in **Nexus** (Identity + Employee), **clocker** (User) und **kontor** (User). Dienstkonten (`*@nexus.local`) bleiben unberührt.
- **Standard ist Vorschau** – geschrieben wird nur mit `--anwenden`; `--zurueck <datei> --anwenden` setzt alles zurück. Die vollständige Zuordnung alt → neu landet als Nachweis/Rückbau in `data/mail-domain-<Zeitstempel>.json` (lokal; `data/` ist jetzt in `.gitignore`, damit keine Personendaten ins Repo wandern). Die Konsole gibt nur Zahlen aus, keine Namen.
- **Vorschau-Ergebnis:** 34 Personen betroffen (33 mit zentralem Login, 30 in clocker, 2 in kontor), 2 unverändert.
- **Noch nicht ausgeführt** – die E-Mail ist in allen drei Apps der Anmelde-Schlüssel; Freigabe von Daniel abgewartet.
- **Umstellung ausgeführt (Freigabe Daniel):** Schema `vorname.nachname@bgroup.de`. Ablauf: Abgleich-Dienst `nexus-sync` **vorher angehalten** (sonst hätte er Zwischenstände gesehen und womöglich Duplikate angelegt), dann Umstellung, dann Kontrolle, dann Dienst wieder gestartet.
- **Ergebnis:** Nexus-Logins 33 · Nexus-Mitarbeiter 31 · clocker 31 · kontor 2 – alle auf `@bgroup.de`. Unberührt blieben die 2 technischen Dienstkonten (`*@nexus.local`). Ein clocker-Benutzer ohne Nexus-Gegenstück fiel im ersten Lauf durch → Skript um den Fall „App-Benutzer ohne Nexus-Gegenstück" erweitert und nachgezogen.
- **Nebeneffekt (positiv):** Der Mitarbeiter-Abgleich ordnet jetzt **alle 31 eindeutig zu** (vorher 1 unsicherer Namenstreffer, 1 ohne Zuordnung) – die einheitliche Domäne hat die alte Duplikat-Falle beseitigt. Kontrolllauf: 0 Neuanlagen, Nexus 31 = clocker 31.
- **ProjectEye** braucht nichts: es hält keine eigenen Benutzer (`userPerms` leer) und meldet sich über die zentralen Nexus-Logins an.
- **Damit es nicht wieder auseinanderläuft:** `createEntity` (src/lib/revision.ts) vergibt neuen `Employee`/`Identity`-Datensätzen ohne E-Mail automatisch `vorname.nachname@<MAIL_DOMAIN>` (Standard `bgroup.de`, per Umgebungsvariable änderbar), inkl. Zahl bei Namensgleichheit. Über die API geprüft (Testdatensatz danach entfernt).
- **Rückbau** jederzeit möglich über die lokalen Nachweisdateien in `data/` (`--zurueck <datei> --anwenden`).
- **Offen:** Die Postfächer bei bgroup.de existieren noch nicht (Daniel: „kommt aber"). Die **Anmeldung funktioniert unabhängig davon**; nur App-Benachrichtigungen an diese Adressen kämen derzeit nicht an.

### 2026-08-14 (Userverwaltung: mobiltauglich + Kopieren von E-Mail und Passwort)
- **Mobil:** Tabelle bekommt `only-desktop`; für Handys neue **Karten** (`only-mobile`) mit Name, US-Nummer, E-Mail (mit Kopier-Schaltfläche), Rolle, Herkunft, App-Zugriffen und „Bearbeiten". Kopfbereich umbruchfähig (`vertrag-kopf`), Bearbeiten-Fenster auf ≤768 px bildschirmfüllend (`dm-fenster`), App-Freigaben brechen unter 560 px um (`.app-freigabe`: Umschalter und Rollenauswahl untereinander).
- **Kopieren:** neue gemeinsame Helfer `src/lib/kopieren.ts` – `kopiere()` (mit `execCommand`-Fallback, weil `navigator.clipboard` nur über https läuft) und `erzeugePasswort()` (kryptografisch zufällig, ohne verwechselbare Zeichen wie 0/O oder 1/l, in Blöcken `xxxx-xxxx-xxxx`).
- **E-Mail kopieren:** in der Tabelle, in der Handy-Karte und im Bearbeiten-Fenster – jeweils mit Häkchen-Rückmeldung.
- **Passwort:** Feld mit vier Bedienelementen – **anzeigen/verbergen**, **kopieren**, **erzeugen** (setzt ein sicheres Passwort ein und macht es sichtbar). Klarer Hinweis darunter: Gespeicherte Passwörter lassen sich **nicht** anzeigen (liegen nur als Hash vor); kopierbar ist nur der Wert, der gerade im Feld steht – erzeugen, kopieren, an den Mitarbeiter geben. Beim Öffnen eines Users ist das Feld leer und verborgen (leer = unverändert).
- Build ✓, Neustart ✓, `/identities` 200, neue CSS-Regeln im ausgelieferten Stylesheet bestätigt.
- **Suchleiste in der Userverwaltung:** `SearchInput` im Kopfbereich (Esc leert, zweites Esc gibt den Fokus frei), filtert über Name, E-Mail, globale Rolle, Herkunft und freigeschaltete Apps; Treffer werden hervorgehoben (`Hervorheben`), bei 0 Treffern erscheint ein Hinweis. Wirkt auf Tabelle **und** Handy-Karten.
- **Passwort kopieren (auf ausdrücklichen Wunsch):** Bisher unmöglich, weil nur der bcrypt-Hash existiert. Jetzt legt Nexus das **über Nexus vergebene** Passwort zusätzlich **verschlüsselt** ab: neues Feld `Identity.passwordEnc`, AES-256-GCM (`src/lib/geheimnis.ts`, Schlüssel aus `IDENTITY_SECRET_KEY`, ersatzweise aus `JWT_SECRET` abgeleitet – der Schlüssel wird nirgends ausgegeben). Die Anmeldung prüft weiterhin **nur** gegen den bcrypt-Hash.
- **Eng gefasster Zugriff:** neue Route `GET /api/identities/[id]/password` – **nur globale Admins**, immer nur ein Datensatz, nie in Listen; jeder Abruf wird als `PASSWORD_READ` im Verlauf vermerkt (ohne den Wert). `passwordEnc` wird aus allen anderen Antworten herausgefiltert.
- **Bedienung:** Kopier-Schaltfläche in der Tabelle, in der Handy-Karte und im Bearbeiten-Fenster („Hinterlegtes kopieren"), dazu weiterhin Erzeugen/Anzeigen/Kopieren des gerade eingegebenen Werts. Für Altkonten ohne hinterlegtes Passwort kommt ein klarer Hinweis (neues erzeugen).
- **Verifiziert mit erfundenem Testkonto:** Anlegen → Antwort enthält **keine** Passwortfelder; Abruf als Admin liefert den korrekten Wert; Abruf als normaler Benutzer **403**; Liste enthält keine Passwortfelder; Testkonto samt Verlaufseinträgen wieder entfernt.
- Build ✓, Neustart ✓, `/identities` 200.

### 2026-08-14 (Diagnose: kontor-Login nach der E-Mail-Umstellung)
- **Nexus-Seite geprüft – in Ordnung:** zentraler Login (`POST /api/auth/login` mit App-Key) liefert Token, Identität und die kontor-Rolle (mit erfundenem Testkonto getestet, danach entfernt); falsches Passwort → 401. Beide kontor-Benutzer existieren als zentrale Identität und haben die **App-Freigabe kontor** (admin bzw. user). Die E-Mails in kontor stimmen mit den zentralen Identitäten überein (2 von 2).
- **kontor-Seite:** `src/lib/auth.ts` sucht den lokalen Benutzer **über die eingegebene E-Mail** (`findUnique({ where: { email } })`) – schlägt das fehl, gibt es keinen Login. Passwortprüfung: zentral über Nexus **nur wenn `NEXUS_LOGIN_ENABLED=true`** (plus `NEXUS_APP_KEY`, `NEXUS_URL`), sonst lokal per bcrypt; bei Nexus-Fehler greift der lokale Fallback.
- **Wahrscheinlichste Ursache:** Anmeldung mit der **alten** Adresse (die E-Mail ist seit der Umstellung `vorname.nachname@bgroup.de`) – oder Erwartung, dass das Nexus-Passwort gilt, obwohl kontor lokal prüft.
- **Eigener Testfehler dokumentiert:** Mein Skript-Login gegen kontors NextAuth lieferte zweimal 401 – auch mit korrektem lokalem Passwort. Ursache ist der CSRF-Schutz (mein Aufruf hatte kein gültiges Cookie), **kein** Befund über den echten Login. In kontors Protokoll stehen keine Anmeldefehler, nur unabhängige Fehler beim Mail-Posteingang (`inboxItem`, doppelte Anhänge).
- **Nicht angefasst:** kontors `.env` (Regel: keine Geheimnisse lesen/ändern). Für „ein Passwort für alle Apps" muss Daniel dort `NEXUS_LOGIN_ENABLED=true` samt `NEXUS_URL` und `NEXUS_APP_KEY` setzen und kontor neu starten.

### 2026-08-15 (Ursache gefunden: kontor-Login trotz Freigabe unmöglich)
- **Befund:** In Nexus waren **6 Benutzer** für kontor freigegeben, aber nur **2** existierten dort lokal. kontors `authorize()` sucht **zuerst den lokalen Benutzer** über die E-Mail und bricht ohne Treffer sofort ab (`if (!user) return null`) – die Freigabe in Nexus allein reicht also nicht, es fehlte der lokale Datensatz.
- **Neues Skript `prisma/sync-kontor-benutzer.ts`:** legt für jede Identität mit kontor-Freigabe (oder globalem Admin) einen lokalen kontor-Benutzer an. Übernommen wird auch der **bcrypt-Hash** aus Nexus → dasselbe Passwort gilt in beiden Anwendungen, ohne dass es je im Klartext bewegt wird. Rolle aus der Freigabe (`admin`/`user`), Standard-Firma als Zuordnung. Bestehende Benutzer werden nur bei abweichender Rolle angepasst.
- **Bewusst kein Löschen:** Wird eine Freigabe entzogen, bleibt der lokale kontor-Benutzer bestehen (dort hängen Belege und Protokolle). Das Skript meldet solche Fälle nur; gesperrt werden muss in kontor selbst.
- **Ausgeführt:** 4 fehlende Benutzer angelegt (jetzt 6 von 6), zweiter Lauf ohne Änderungen (idempotent).
- **In die Automatik aufgenommen:** Auslöser `nexus_sync_trg` jetzt auch auf **Identity** und **IdentityAppAccess** – eine Freigabe in der Userverwaltung stößt den Abgleich sofort an. `sync-watch.js` und das Cron-Sicherheitsnetz führen das Skript mit aus.
- **End-to-End geprüft:** Testbenutzer mit kontor-Freigabe angelegt → **nach rund 10 Sekunden automatisch in kontor vorhanden**; Testkonto in beiden Systemen wieder entfernt.

### 2026-08-19 (Login: Tab springt direkt ins Passwortfeld)
- **Wunsch Daniel:** Nach der Eingabe des Benutzernamens soll Tab direkt ins Passwortfeld springen.
- Zwischen den Feldern lag nichts Fokussierbares (die Hilfssymbole im Eingabefeld haben bereits `tabIndex={-1}`) – in der Praxis schluckt aber die Vorschlags-/Autofill-Liste des Browsers gern den ersten Tab. Deshalb ist der Sprung jetzt **ausdrücklich** umgesetzt.
- **`TextField` erweitert** um `inputRef`, eigenes `onKeyDown` (läuft zusätzlich zur Esc-Logik), `enterKeyHint`, `autoFocus`, `name`, `id`.
- **Login-Seite:** E-Mail-Feld bekommt den Fokus beim Öffnen; **Tab** und **Enter** springen von dort direkt ins Passwortfeld. Auf Handy-Tastaturen zeigt die Bestätigungstaste im E-Mail-Feld „Weiter" (`enterKeyHint="next"`) und im Passwortfeld „Los" (`go`).
- **Zwischenfall:** Nach dem ersten Build antwortete `/login` nicht mehr (`Cannot find module .next/server/pages/_error.js` – unvollständiger Build-Ordner, weil zu früh neu gestartet wurde). Behoben durch vollständigen Neubau + Neustart; danach `/login`, `/documents`, `/identities`, `/contracts` alle 200. (Gleiche Ursache wie am 27.07. – Build immer vollständig durchlaufen lassen.)

## 01.09.2026 — Zentrale Passwortvergabe (Generator + Einsehen/Ändern)
- `src/lib/passwort.ts` (neu): sicherer Generator, 19 Zeichen, 4er-Blöcke mit Zusatzzeichen
  (`!#$%&*+-=?@`) dazwischen, ohne verwechselbare Zeichen, alle Zeichenklassen garantiert.
  `src/lib/kopieren.ts` reicht `erzeugePasswort` nur noch weiter.
- `GET /api/identities`: neues Flag `hatPasswort` (nur ja/nein, nie der Wert).
- `POST /api/identities/passwords` (neu, nur globale Admins): Sammelvergabe
  (`modus: "fehlende" | "alle"` oder `ids`), setzt bcrypt-Hash + AES-Kopie, Revision `PASSWORD_SET`,
  liefert die neuen Werte einmalig zurück.
- Userverwaltung: Spalte „Passwort: hinterlegt/fehlt", Schild-Symbol öffnet Anzeige-Dialog
  (statt nur Kopieren), Kopfbutton „Passwörter erzeugen (n offen)" mit Auswahl fehlende/alle
  und Ergebnisliste zum Kopieren (einzeln oder ganze Liste).
- Wirkt für alle Apps, da kontor & Co. sich über Nexus anmelden. tsc sauber, Build + `pm2 restart nexus` erledigt.

## 09.09.2026 — E-Mail-Änderung schlägt überall durch + Sprung Mitarbeiter → Userverwaltung
- **Anlass Daniel:** „Wenn ich bei einem Mitarbeiter die E-Mail ändere, muss das direkt in
  allen Funktionen und Logins geändert werden. Von jedem Mitarbeiter direkt zur
  Userverwaltung kommen. Suche links über den Tabellen platzieren."
- **`src/lib/mailKaskade.ts` (neu):** zieht eine geänderte Adresse zwischen **Employee** und
  **Identity** (Login für alle Apps) nach – Zuordnung über `identityId`/`employeeId`, ersatzweise
  über die alte Adresse; verfestigt dabei beide Rückbezüge. Ist die neue Adresse auf der
  Gegenseite vergeben → Fehler 409 mit Klartext statt stiller Doppelvergabe.
- **`updateEntity` (`src/lib/revision.ts`):** ruft die Kaskade bei jeder E-Mail-Änderung an
  Employee/Identity auf und schreibt die Mit-Änderung mit **derselben txId** in den Verlauf
  (Undo greift für beide Sätze zusammen).
- **`PATCH /api/identities/:id`:** schrieb `email` bisher **gar nicht** – eine Änderung in der
  Userverwaltung war wirkungslos. Jetzt: Eindeutigkeitsprüfung, Übernahme, Kaskade zum
  Mitarbeiter, Revision.
- **`prisma/sync-kontor-benutzer.ts`:** Zuordnung zuerst über die gemerkte
  `IdentityAppAccess.localUserId` (überlebt E-Mail-Wechsel), sonst über die Adresse; die
  lokale ID wird beim Anlegen/Zuordnen zurückgeschrieben. Geänderte Adresse wird im
  kontor-Benutzer **umbenannt** statt einen zweiten Benutzer anzulegen.
- **`prisma/sync-clocker-employees.ts`:** neue Zuordnungsstufe 0 über `localUserId`
  (vor E-Mail/Personalnummer/Name), ID wird gemerkt; übernimmt clocker eine Adresse nach
  Nexus, zieht die zentrale Identität mit (`identitaetMailSetzen`).
- **Userverwaltung erreichbar aus der Mitarbeiterliste:** Schild-Symbol je Zeile/Karte →
  `/identities?q=<E-Mail>&open=1`; dort wird die Suche aus der URL vorbelegt und ein
  eindeutiger Treffer gleich zum Bearbeiten geöffnet (kein Treffer → Hinweis „noch kein Zugang").
- **Suche links über der Liste:** in `ResourceView` und in der Userverwaltung steht das
  Suchfeld jetzt linksbündig in einer eigenen Zeile über der Tabelle statt rechts im Kopf.
- tsc sauber, Probeläufe beider Sync-Skripte mit `--dry` fehlerfrei, Build + `pm2 restart nexus`,
  `/login` HTTP 200.
- **Nachtrag (Wunsch Daniel):** Der Klick beim Mitarbeiter öffnet die **Zugangseinstellungen
  direkt** – ohne Zwischenschritt über die Liste. Reihenfolge: exakte E-Mail → einziger
  Suchtreffer → sonst öffnet sich der Anlegen-Dialog mit **E-Mail und Name vorausgefüllt**
  (Link trägt `mail`/`name` mit). Bei mehreren passenden Zugängen bleibt die gefilterte Liste
  mit Hinweis stehen.

## 11.09.2026 — Mitarbeiterakte: Rubriken, Dokumente, Notizen
- **Wunsch Daniel:** „Bei den Mitarbeitern muss ich Dokumente ablegen können, Gruppen erstellen
  wie Krankenversicherung, dann Dokumente ablegen und View wie bei ProjectEye, auch Notizen
  ablegen können."
- **Datenmodell (`prisma db push`):** neu `DocumentGroup` (Rubrik: Name, Sortierung, Farbe) und
  `EmployeeNote` (Notiz je Mitarbeiter, optional in einer Rubrik, mit Urheber-Anzeigename);
  `EmployeeDocument.groupId` ergänzt (+ Index).
- **Rubriken gelten für alle Mitarbeiter gleich** – einmal anlegen, überall nutzbar. Beim ersten
  Aufruf legt `GET /api/doc-groups` die üblichen an: Arbeitsvertrag, Krankenversicherung,
  Sozialversicherung & Steuer, Zeugnisse & Nachweise, Schriftverkehr, Sonstiges.
- **Neue Routen:** `/api/doc-groups` (GET/POST) und `/api/doc-groups/[id]` (PATCH/DELETE –
  Löschen räumt Dokumente/Notizen nach „Ohne Zuordnung", nichts geht verloren);
  `/api/employee-notes` (GET/POST) und `/api/employee-notes/[id]` (PATCH/DELETE, weich).
  `employee-documents` kennt jetzt `groupId` (anlegen, ausliefern, umsortieren).
- **`src/components/MitarbeiterAkte.tsx` (neu):** Akte je Mitarbeiter, nach Rubriken gegliedert
  und aufklappbar. Je Rubrik: Datei hochladen, Notiz ablegen, umbenennen, entfernen. Je Dokument:
  Öffnen (Betrachter), Speichern, Notiz am Dokument, Rubrik wechseln, Entfernen. Notizen mit
  Überschrift, Text, Urheber und Zeitpunkt, bearbeit- und löschbar.
- **Betrachter:** PDFs weiter im ProjectEye-Viewer (`PdfViewerModal`, Seiten sortieren/löschen,
  Formulare ausfüllen, Speichern = neue Version). Hochgeladene **Bilder** (Fotos/Scans von
  Nachweisen) bekommen eine eigene Bildansicht – dafür leitet die API den echten Dateityp aus
  der Endung ab statt alles als `octet-stream` abzulegen; andere Dateitypen werden geladen.
- **Sprung aus der Mitarbeiterliste:** Ordner-Symbol je Zeile/Karte → `/documents?employee=<id>`
  öffnet direkt die Akte dieses Mitarbeiters (neben dem Schild-Symbol zur Userverwaltung).
- tsc sauber, Build + `pm2 restart nexus`, `/documents`, `/employees`, `/identities` HTTP 200,
  `/api/doc-groups` ohne Token 401.

## 13.09.2026 — Zentrales Kontaktregister + Abgleich mit kontor und ProjectEye
- **Wunsch Daniel:** Alle Kontaktdaten und Ansprechpartner in Nexus, mit Suche und
  Schnellauswahl, beidseitig synchron mit ProjectEye und kontor („egal wo Kontakte angelegt
  oder geändert werden"), Bearbeiten immer im Pop-up, dazu eine Ansicht des Kontakts/der Firma.
  Außerdem eine **Kommunikationsdatei** in kontor und ProjectEye, damit alle Sessions
  zusammenarbeiten und neue Anweisungen mitbekommen.
- **Kommunikation der Sessions:** neuer Ordner `/mnt/devip3/shared/sync/` mit
  `KONTAKTE.md` (verbindliches Protokoll: wer führt was, Felder, Konfliktregel, Löschregel,
  Skripte, Stand) und `nachrichten.md` (Postfach mit festem Eintragsformat).
  In `kontor/CLAUDE.md` und `ProjectEye/CLAUDE.md` steht jetzt oben der Hinweis, **vor**
  Arbeiten an Kontakten/Kunden/Lieferanten/Benutzern beides zu lesen und Änderungen einzutragen.
  Eintrag im Funktions-Register (`shared/registry/features.json`: `daten.kontakte-zentral`).
- **Datenmodell:** neues `Contact` (Name, Funktion, E-Mail, Telefon, Mobil, Notiz, Schnellauswahl,
  `ownerKind`/`ownerId`/`ownerName` = Kunde/Lieferant/Mandant/frei, dazu echte Verknüpfungen
  `customerId`/`supplierId`, Herkunft `source` sowie `kontorId`/`projecteyeId` als **stabile**
  Zuordnung). `Customer.contacts` und `Supplier.contacts` zeigen jetzt auf das Register, der
  Altbestand bleibt als `legacyContacts` erhalten (`prisma/kontakte-uebernehmen.ts` hat ihn
  übernommen, nichts gelöscht).
- **API:** `/api/contacts` (Register mit Volltextsuche, Filter, Favoriten) und
  `/api/contacts/[id]` (inkl. `expectedVersion`/409, weiches Löschen).
  `/api/supplier-contacts` bleibt als Adapter bestehen und schreibt ins Register –
  ProjectEye nutzt diese Routen bereits direkt (`server/nexus.js`), nichts musste dort umgebaut werden.
  Kunden- und Lieferantensuche finden Ansprechpartner weiterhin (gelöschte bleiben ausgeblendet).
- **Abgleich beidseitig:**
  `prisma/sync-kontor-kontakte.ts` (Nexus `Contact` ⇄ kontor `ClientContact`; Firmen über
  Namensschlüssel, Personen über `kontorId` → E-Mail → Name; Nexus gewinnt bei echtem Konflikt,
  weil `ClientContact` kein `updatedAt` hat) und
  `prisma/sync-projecteye-kontakte.ts` (Lieferanten-Ansprechpartner beidseitig; Schreiben nach
  ProjectEye **nur über dessen HTTP-API**, nie in die JSON-Datei; Adressbuch `savedEmails`
  einseitig nach Nexus).
- **Sofort-Sync:** Trigger `nexus_sync_trg` neu auf Nexus `Contact` und kontor `ClientContact`;
  `scripts/sync-watch.js` startet die neuen Skripte (Nexus-Änderungen lösen jetzt auch den
  ProjectEye-Abgleich aus), `scripts/sync-clocker.sh` (Cron, alle 2 h) führt sie ebenfalls aus.
- **Oberfläche:** neue Seite `/contacts` – Suche über Name/Firma/E-Mail/Telefon/Funktion,
  Filter nach Kunde/Lieferant/Mandant/frei, **Schnellauswahl** (Stern), Tabelle (Desktop) bzw.
  Karten (Handy), **Ansicht** eines Kontakts mit Firma und deren weiteren Ansprechpartnern
  (inkl. „Ansprechpartner bei dieser Firma" anlegen), **Bearbeiten ausschließlich im Pop-up**.
  Navigation und Befehlspalette ergänzt.
- **Bestand nach dem ersten Lauf:** 443 Kontakte (436 freie aus dem ProjectEye-Adressbuch,
  5 Lieferanten-Ansprechpartner, 2 Kunden-Ansprechpartner).
- tsc sauber, Probeläufe beider Skripte mit `--dry`, Build + `pm2 restart nexus`,
  `/contacts`, `/customers`, `/suppliers` HTTP 200; Sofort-Abgleich nach einer Teständerung
  im Log nachgewiesen.
- **Nachtrag 13.09.2026 (clocker + Dashboard + Suche):**
  - **clocker angebunden:** `prisma/sync-kontor-kontakte.ts` ist zu `prisma/sync-app-kontakte.ts`
    verallgemeinert (`--app=kontor|clocker`) – beide halten ihre Ansprechpartner in einer gleich
    aufgebauten `ClientContact`-Tabelle. Neues Merkfeld `Contact.clockerId`, Trigger auf clocker
    `ClientContact`, Watcher (`scripts/sync-watch.js` versteht jetzt Skript-Argumente) und
    Cron-Netz erweitert. clocker pflegt Ansprechpartner bereits unter `/admin/clients` – dort war
    nichts zu bauen. Erster Lauf: 18 von 22 Kunden zugeordnet, 2 Kontakte verknüpft.
  - **Dashboard:** Kacheln jetzt für Kunden, **Kontakte**, Lieferanten, Projekte, Aufgaben,
    Mitarbeiter, Artikel und Zugänge; `/api/health` zählt nur den lebenden Bestand
    (`deletedAt: null`). Stand: 22 Kunden · 443 Kontakte · 27 Lieferanten · 88 Projekte ·
    34 Mitarbeiter · 150 Artikel · 39 Zugänge.
  - **Suche überall verbessert:** neues `src/lib/suche.ts` – **Mehrfachsuche**, bei der alle
    Begriffe zutreffen müssen (`maier einkauf`), `"…"` hält eine Wortgruppe zusammen. Gilt für
    alle Listen (`crudRoute`), das Kontaktregister und – clientseitig – die Userverwaltung.
    `Hervorheben` markiert jeden Begriff einzeln, das Suchfeld hat Lupe und Kreuz zum Leeren und
    nimmt auf dem Handy die **volle Breite** ein (`.suchfeld`).
  - Geprüft: tsc sauber, Probeläufe `--app=kontor` und `--app=clocker`, Build + Neustart,
    `/`, `/contacts`, `/customers`, `/suppliers` HTTP 200, Mehrfachsuche gegen die Datenbank
    getestet (1 Begriff 440 Treffer → 2 Begriffe 438 → Wortgruppe 3 → Unsinn 0).
- **Nachtrag: Kontakte ohne Kunde (Vertreter, Shops).** Freie Kontakte gab es zwar schon, sie
  konnten aber weder einen Firmennamen noch eine Einordnung tragen. Jetzt:
  - `Contact.category` (frei wählbar, z. B. Vertreter, Shop, Handwerker, Behörde, Dienstleister,
    Privat – Vorschlagsliste im Feld, eigene Begriffe erlaubt) und `Contact.ownerName` ist bei
    „frei" ein **selbst eingetippter** Firmen-/Shopname (kein Kundenstammsatz nötig).
  - Pop-up zeigt bei „frei" statt der Firmenauswahl das freie Namensfeld plus „Art des Kontakts".
  - Kontaktliste: zweite Filterleiste mit allen vergebenen Arten; Art wird in Tabelle und
    Ansicht angezeigt und ist durchsuchbar (auch in der Mehrfachsuche).
  - `GET /api/contacts?category=…` filtert serverseitig.
  - Klarstellung in der Oberfläche: Kontakte einer Kundenfirma laufen nach kontor/clocker,
    Lieferanten-Ansprechpartner nach ProjectEye, **freie Kontakte bleiben nur in Nexus**.
- **Nachtrag: private Angaben am Kontakt + Symbole in den Tabellenköpfen.**
  - `Contact` um `privatePhone`, `privateMobile`, `privateEmail`, `privateStreet`, `privateZip`,
    `privateCity`, `birthday`, `privateNotes` erweitert. Sie bleiben **ausschließlich in Nexus** –
    der Abgleich überträgt weiterhin nur die geschäftlichen Felder.
  - Oberfläche: im Pop-up ein zugeklappter Bereich „Private Angaben hinterlegen", in der
    Kontaktansicht eine zugeklappte Rubrik mit Schloss-Symbol (erst auf Klick sichtbar, damit
    nichts beiläufig mitgelesen wird) – mit Hinweis, dass die Daten nicht synchronisiert werden.
  - Suche: private Rufnummern/E-Mail/Ort sind **mit**durchsuchbar (Rückwärtssuche „wer ruft da an?"),
    angezeigt werden sie aber nur in der aufgeklappten Rubrik.
  - **Tabellenköpfe mit Symbolen:** neues `src/lib/spaltenIcons.ts` ordnet jeder Spalte anhand von
    Feldname bzw. Beschriftung ein Symbol zu (E-Mail, Telefon, Firma, Datum, Nummer, Rolle …).
    Wirkt in allen Listen (`ResourceView`), im Kontaktregister und in der Userverwaltung.
    Neue Icons: `mail`, `tag`, `lock`, `calendar`.

## 14.09.2026 — Scannen mit Posteingang (Tagesverlauf) und Duplikat-Warnung
- **Wunsch Daniel:** Scanfunktion wie in ProjectEye, Scans einem Mitarbeiter zuordnen **oder
  erst liegen lassen** und später zuordnen, Verlauf pro Tag für die Übersicht, Namen ändern
  können, und **warnen bei gleichen Namen oder gleichen Dokumenten**.
- **Scanner-Anbindung:** `src/lib/scanner.ts` – treiberloses eSCL/AirScan über HTTPS, aus
  ProjectEye (`server/scanner.js`) nach TypeScript übernommen: Fähigkeiten (Modell, Quellen,
  Auflösungen, Duplex), Scan-Auftrag, Seiten abholen, Abbrechen. Neu ergänzt: die gescannten
  JPEG-Seiten werden mit pdf-lib zu **einem PDF** zusammengefasst.
- **Datenmodell:** `Scanner` (Name, IP, Modell, zuletzt benutzt) und `ScanDocument`
  (Posteingang: Titel, Dateiname, PDF, Seiten, Größe, **sha256**, Scanner, Zeitpunkt, Status
  offen/zugeordnet, Mitarbeiter, Rubrik, erzeugtes Dokument, Notiz). `EmployeeDocument` hat
  jetzt ebenfalls `sha256` – dadurch erkennt der Posteingang bereits abgelegte Dokumente.
- **API:** `/api/scanners` (Liste, Einrichten mit Erreichbarkeitsprüfung),
  `/api/scanners/[id]` (umbenennen/entfernen), `/api/scanners/[id]/capabilities`,
  `/api/scanners/[id]/scan` (Scan → Posteingang), `/api/scan-inbox` (Liste mit Warnungen,
  Datei-Upload ohne Scanner), `/api/scan-inbox/[id]` (Name/Notiz ändern, verwerfen),
  `/api/scan-inbox/[id]/file`, `/api/scan-inbox/[id]/assign` (in die Mitarbeiterakte legen).
- **Seite `/scan`:** Gerät + Vorlage (Flachbett/Einzug), Farbe, Auflösung, Duplex – die Auswahl
  richtet sich nach den gemeldeten Fähigkeiten. Posteingang **nach Tagen gegliedert**
  („Heute", „Gestern", sonst Datum mit Wochentag) samt Anzahl Dokumente und Seiten je Tag.
  Je Scan: Name direkt bearbeiten, Öffnen im PDF-Betrachter, Speichern, **Mitarbeiter zuordnen**
  (mit Rubrik), Verwerfen. Suche mit Mehrfachbegriffen, Filter „nur offene".
- **Warnungen** je Eintrag: inhaltsgleicher Scan im Posteingang (doppelt gescannt),
  inhaltsgleiches Dokument **liegt schon in einer Akte**, oder gleicher Name wie ein anderer Scan.
- **Gerät übernommen:** der in ProjectEye eingerichtete „HP Color LaserJet Pro MFP 4302 – Büro"
  (192.168.10.54) steht in Nexus bereit; Fähigkeiten-Abfrage geprüft (HTTP 200).
  Ein echter Scan wurde bewusst **nicht** ausgelöst – das ist eine Aktion am Gerät.
- tsc sauber, Build + `pm2 restart nexus`, `/scan`, `/documents`, `/contacts` HTTP 200,
  `/api/scanners` ohne Token 401.

## 15.09.2026 — Lexware-Personalfragebogen als Vorlage + mehrere Anmelde-Adressen
- **Vorlage eingespielt:** `.share/lexware_personalfragebogen_mustervorlage.pdf` liegt jetzt unter
  **Dokumente** als „Personalfragebogen (Lexware)" (37 Formularfelder). **10 Felder werden aus den
  Mitarbeiter-Stammdaten vorausgefüllt**: Vorname, Nachname, Geburtsdatum, Straße, PLZ, Ort,
  Telefon, E-Mail, Staatsangehörigkeit sowie „Ort, Datum" (mit heutigem Datum – dafür gibt es den
  neuen Platzhalter `{heute}`). **Bewusst nicht** befüllt: IBAN/Kontoinhaber/Kreditinstitut,
  Steuer-ID, Sozial-/Rentenversicherungsnummer – die trägt der Mitarbeiter selbst ein.
  Das PDF bleibt ausfüllbar; Ablegen, Zwischenspeichern (neue Version) und Herunterladen laufen
  wie beim Minijob-Bogen. `STANDARD_FELDZUORDNUNG` deckt jetzt beide Formulare ab, und beim
  Hochladen jeder Vorlage wird die passende Zuordnung automatisch gesetzt (gefiltert auf
  tatsächlich befüllbare Felder).
- **Mehrere Anmelde-Adressen je Zugang:** neues `IdentityEmail` (Adresse eindeutig, freie
  Bezeichnung wie „privat"). Anmeldung klappt mit der **Hauptadresse und jeder weiteren** –
  gleiches Passwort. Nur die Hauptadresse wandert in den Mitarbeiterstammsatz und nach
  kontor/clocker/ProjectEye.
  - `POST /api/auth/login` sucht jetzt auch über die Zweitadressen.
  - Neu: `/api/identities/[id]/emails` (Liste, Hinzufügen) und `…/emails/[mailId]`
    (Bezeichnung ändern, **zur Hauptadresse machen** – dabei tauschen die Adressen die Plätze und
    die Kaskade zieht Mitarbeiter und Apps nach –, entfernen).
  - Userverwaltung: Abschnitt „Weitere Anmelde-Adressen" mit Liste, Kopieren, „Haupt", Entfernen
    und Feld zum Hinzufügen. Das E-Mail-Feld bestehender Zugänge ist **nicht mehr gesperrt** –
    seit der Kaskade schlägt eine Änderung überall durch.
  - Geprüft mit einem temporären Prüfkonto: Login über Haupt- **und** Zweitadresse HTTP 200,
    falsches Passwort 401, Konto danach wieder entfernt.
- **Nachtrag: Visitenkarten beidseitig drucken.** Neuer Knopf „Beidseitig drucken" (Hauptleiste
  und Großansicht) öffnet die Druckeinstellungen: **10 Karten je Bogen (2 × 5)** oder **1 Karte
  mittig**, dazu die **Wendekante** des Druckers (lange Kante = Standard, oder kurze Kante).
  - Es entstehen genau zwei Seiten: Blatt 1 Vorderseiten, Blatt 2 Rückseiten. Die Rückseiten
    werden passend umsortiert (`rueckseitenFolge`) – lange Kante spiegelt die Spalten, kurze
    Kante die Zeilen –, damit nach dem Wenden jede Rückseite auf ihrer Vorderseite liegt.
  - Druck-CSS (`visitenkarte.css`): fester Millimeterraster `repeat(2, 85mm)` × `55mm` auf
    210 × 297 mm mit 20 mm Seiten- und 11 mm Kopfrand, `break-after:page` zwischen den Bögen,
    helle gestrichelte Schnitthilfen; der bisherige einseitige Druck bleibt unverändert.
  - Hinweis im Dialog: im Druckdialog beidseitig einschalten, Skalierung 100 %, Ränder „keine" –
    die Ränder bringt das Layout selbst mit.

## 15.09.2026 (2) — Kontakte: Vor-/Nachname, mehrere Kontaktwege, Bedienung; Schutz vor Datenverlust bei Auto-Logout
- **Wunsch Daniel:** Beim automatischen Abmelden anzeigen, was los ist (damit ein angelegter Kontakt
  nicht verloren geht); im Kontakt Symbole an den Beschriftungen, überall Kreuz zum Leeren und
  Kopier-Knöpfe (auch in der Übersicht), das Formular besser aufteilen, mehrere E-Mails und
  Telefonnummern per **+** hinzufügen, Vor- und Nachname getrennt.
- **Kein stiller Rauswurf mehr:** `api()` leitet bei 401 nicht mehr sofort zur Anmeldung um, sondern
  meldet `SitzungAbgelaufenError` und löst ein Ereignis aus. Neuer `SitzungsWaechter` im Layout zeigt
  (1) eine **Vorwarnung** 5 Minuten vor Ablauf des Tokens und (2) bei Ablauf ein Fenster mit Erklärung –
  die Seite bleibt stehen, damit man noch etwas herauskopieren kann. Nach dem Anmelden geht es über
  `?weiter=` zurück auf die Seite, auf der gearbeitet wurde.
- **Entwurfsschutz:** neues `src/lib/entwurf.ts` (localStorage, 72 h). Der Kontaktdialog sichert
  Eingaben laufend; beim Öffnen wird ein gefundener Entwurf angeboten („vor 5 Minuten begonnen") –
  weiterbearbeiten oder verwerfen. Schließen ohne Speichern sichert ebenfalls und sagt es.
  Nach erfolgreichem Speichern wird der Entwurf gelöscht.
- **Datenmodell:** `Contact.firstName` / `lastName` (der Anzeigename `name` wird daraus gebildet und
  bleibt Grundlage des Abgleichs) und neues `ContactChannel` – **beliebig viele** E-Mails, Telefon-,
  Mobil-, Faxnummern und Webseiten je Kontakt, mit Bezeichnung („Zentrale", „privat"). Der **erste**
  Eintrag je Art füllt weiterhin `email`/`phone`/`mobile` – nur diese Hauptwerte gehen nach
  kontor, clocker und ProjectEye. Bestand umgestellt: 452 Namen aufgeteilt, 459 Wege übernommen.
- **Oberfläche:** neue `KontaktFeld`-Bausteine (`Feld` mit Symbol, Kreuz zum Leeren, Kopier-Knopf;
  `KopierKnopf` für Listen). Der Dialog ist jetzt in **Person · Firma · Erreichbarkeit · Notiz ·
  Private Angaben** gegliedert; unter „Erreichbarkeit" fügen +-Knöpfe je Art neue Zeilen hinzu.
  In der Übersicht haben E-Mail und Telefon einen Kopier-Knopf und zeigen „+n" für weitere Einträge;
  die Kontaktansicht listet alle Wege mit Symbol, Bezeichnung und Kopier-Knopf.
- tsc sauber, Build + `pm2 restart nexus`, `/contacts`, `/identities`, `/` HTTP 200; Mehrfach-Kanäle
  mit einem Testkontakt geprüft (4 Wege, davon 2 E-Mails; Hauptwerte korrekt gesetzt; danach entfernt).
- **Nachtrag Visitenkarten (Rückmeldungen Daniel):**
  - **Rückseite lag 1 mm zu weit rechts und 1 mm zu hoch:** Die Karten sitzen jetzt in einem
    inneren Raster (`.vk-raster`), das sich als Ganzes verschieben lässt. Voreingestellt
    −1 mm / +1 mm; im Dialog „Beidseitig drucken" ist der **Feinabgleich in mm** (0,5er-Schritte,
    waagerecht/senkrecht, „ohne Versatz") einstellbar und wird im Browser gemerkt.
  - **Firmenangaben pflegbar:** Neuer Knopf „Firmenangaben" – Bezeichnung, Zusatz, **Webadresse**
    und Standard-E-Mail je Firma (IngPro, Maschinen, Handel, Group) sowie **Anschrift**
    (Straße, PLZ/Ort) und Schlusszeile der Rückseite. Vorher standen diese Angaben fest im Code.
    Gespeichert im Browser, „Zurücksetzen" stellt die Ausgangswerte wieder her.
  - **Vorderseite:** Fußzeile hat jetzt eine breitere linke Spalte (Telefon, E-Mail);
    Webadresse und Ort rücken nach rechts – damit passt die E-Mail in eine Zeile. Ist sie doch
    zu lang, bricht sie **am @** um (`<wbr>` vor dem @, kein Bruch mitten im Namen).
- **Nachtrag: Webadresse ändern.** Rückmeldung „ich kann die URL nicht ändern" – der Knopf
  „Firmenangaben" war zwar gebaut und ausgeliefert (Bundle geprüft), im Browser lief aber noch die
  alte Seite. Zusätzlich gibt es jetzt im Personen-Formular das Feld **„Webadresse auf dieser Karte"**:
  leer = Adresse der gewählten Firma, gefüllt = gilt nur für diese Karte (`Person.web`).
  Damit lässt sich die Adresse sowohl **je Firma** (Knopf „Firmenangaben") als auch **je Karte** setzen.
- **Nachtrag Scan-Seite (Wunsch Daniel):** Die Einstellungen stehen nicht mehr offen auf der Seite –
  oben ist nur noch das **Gerät** zu sehen (Auswahl + Zustandszeile „Modell bereit · Flachbett,
  Farbe, 200 dpi"). Zwei Pop-ups dahinter:
  - **Scan-Einstellungen** (Vorlage Flachbett/Einzug, Farbe, Auflösung, beidseitig) – die Auswahl
    richtet sich weiterhin nach den gemeldeten Fähigkeiten des Geräts.
  - **Scanner verwalten**: Liste aller Geräte mit **Bearbeiten** (Name, IP-Adresse, Notiz – direkt
    in der Zeile aufklappend) und Entfernen (mit Rückfrage; gescannte Dokumente bleiben erhalten),
    darunter **Neuen Scanner einrichten** mit IP und frei wählbarem Namen. Das Gerät wird beim
    Anlegen sofort angesprochen; antwortet es nicht, wird nichts gespeichert.
- **Nachtrag: QR-Code folgt der Webadresse.** Bisher waren die QR-Codes feste SVG-Dateien – eine
  geänderte Adresse führte ins Leere. Jetzt wird der Code **zur Laufzeit aus der tatsächlich
  eingetragenen Adresse erzeugt** (`qrcode`, neu als Abhängigkeit): erst die Adresse der Person
  („Webadresse auf dieser Karte"), sonst die der gewählten Firma; fehlt `https://`, wird es ergänzt.
  Darstellung wie bisher – weiße Module auf durchsichtigem Grund, als CSS-Variable der jeweiligen
  Firma. Der **Bildexport** (PNG/SVG) nutzt denselben erzeugten Code; die mitgelieferten
  QR-Grafiken bleiben nur noch Rückfallebene, falls keine Adresse hinterlegt ist.

## 16.09.2026 — Live-Aktualisierung, Auswahllisten über den Fenstern, Scan-Bedienung
- **Alle offenen Seiten aktualisieren sich selbst (Wunsch Daniel):** Neue Postgres-Funktion
  `nexus_live_notify()` + Trigger `nexus_live_trg` auf **19 Tabellen** (Kontakte, Kunden,
  Mitarbeiter, Dokumente, Notizen, Rubriken, Scans, Scanner, Zugänge, Projekte, Artikel …).
  Bewusst ein **eigener Kanal** neben `nexus_sync`, damit der Abgleich-Dienst nicht bei jeder
  Dokumentänderung anläuft. Neue Route `GET /api/events` liefert die Meldungen als
  Server-Sent Events (eine gemeinsame DB-Verbindung für alle Browser, Lebenszeichen alle 25 s,
  Token als Query-Parameter, da `EventSource` keine Kopfzeilen kann).
  Client: `src/lib/live.ts` mit `useLive(tabellen, neuLaden)` – gebündelt (400 ms), automatische
  Neuverbindung mit wachsendem Abstand. Eingehängt in Kontakte, Dokumente/Akte, Scan-Posteingang,
  Userverwaltung, alle Listen (`ResourceView`) und das Dashboard. Geprüft: Änderung an `Contact`
  kam als `event: aenderung {"tabelle":"Contact"}` im Strom an.
- **Auswahllisten öffnen jetzt über den Fenstern:** `SuchSelect` rendert die Liste per Portal am
  Dokument (`position:fixed`, z-index 200) statt im Feld – dadurch wird sie in Pop-ups nicht mehr
  abgeschnitten. Ist unter dem Feld zu wenig Platz, klappt sie **nach oben**; Breite und Höhe
  richten sich nach Feld und Fenster, bei Scrollen/Größenänderung wird neu ausgerichtet.
- **Rubriken direkt in der Auswahl anlegen:** `SuchSelect` kennt `erlaubeNeu`/`onNeu` – einfach den
  Namen eintippen und „als neue Rubrik anlegen". Gilt beim **Scan zuordnen**, beim Einsortieren
  eines Dokuments, bei Notizen und in der Ablage. Im Zuordnen-Dialog lässt sich die gewählte
  Rubrik zusätzlich **umbenennen**; neue Rubriken stehen sofort überall zur Verfügung.
- **Scan-Einstellungen wieder sichtbar** (Rückmeldung Daniel), aber kompakt: Schiebeschalter
  **Flachbett ⇄ Einzug** und **Graustufen ⇄ Farbe**, Schieberegler für die **Auflösung** über die
  Stufen, die das Gerät meldet (mit Hinweis „schnell / guter Mittelweg / fein, größere Datei"),
  Schalter für Vorder- und Rückseite beim Einzug. Das Einstellungs-Pop-up entfällt; „Scanner
  verwalten" (anlegen, bearbeiten, entfernen) bleibt im Pop-up.
- **Anzeige während des Scans:** neue `ScanAnimation` – ein Blatt, über das ein Lichtbalken wandert,
  dazu „Läuft im Hintergrund – du kannst hier weiterarbeiten". Der Scan blockiert die Oberfläche
  nicht; das Ergebnis erscheint dank Live-Aktualisierung von selbst im Posteingang.
  Rücksicht auf `prefers-reduced-motion`.
- tsc sauber, Build + `pm2 restart nexus`, `/scan`, `/documents`, `/contacts`, `/` HTTP 200.

## 16.09.2026 (2) — Zweiter Arbeitsvertrag angelegt
- **Auftrag:** zweiter Vertrag, aufgebaut wie AV-0001, Tätigkeit **Konstrukteur/Programmierer**.
- **Vorgabe Daniel:** „Alles privat halten, wir arbeiten mit IDs wegen Datenschutz — Mitarbeiter,
  Verträge ebenfalls." Deshalb stehen in diesem Protokoll **keine Namen**.
- **Angelegt: AV-0002** (Status *entwurf*) mit den Konditionen aus AV-0001: unbefristet,
  6 Monate Probezeit, Vorlage „vollständig", 40 h/Woche (flexibel 32–42 h), Arbeitszeitkonto
  07:00–17:00, 30 Urlaubstage, gesetzliche Kündigungsfristen (§ 622 BGB), Arbeitsort und
  Unterschriftsort Cloppenburg.
- **Bewusst offen gelassen** (trägt Daniel im Formular ein): **Mitarbeiter** (keine Zuordnung durch
  mich – Datenschutz), **Stundenlohn** (0,00 als Platzhalter) und Unterschriftsdatum.
- **Gesetzt:** Beginn **01.11.2026**, Tätigkeit **Konstrukteur/Programmierer**.
- **Nachtrag Dokumente (Wunsch Daniel): mobiltauglich, Bilder, Vorlagen ins Untermenü.**
  - **Vorlagen liegen jetzt im Untermenü:** Knopf „Vorlagen (n)" im Seitenkopf öffnet ein Pop-up mit
    der kompletten Vorlagenverwaltung (Ansehen, Leer/Vorausgefüllt herunterladen, Ersetzen,
    Entfernen, Hochladen). Die Seite selbst ist dadurch **einspaltig** (`.dok-raster`) – die
    Mitarbeiterakte bekommt die volle Breite, auf dem Handy wie am Rechner.
  - **Bilder hochladen:** je Rubrik in der Akte ein eigener Knopf „Foto/Bild" und zusätzlich im
    Ablage-Bereich. `accept="image/*" capture="environment"` – auf dem Handy öffnet sich direkt die
    Kamera. Abgelegte Bilder öffnen in der Bildansicht (der PDF-Betrachter kann nur PDFs);
    der Dateityp kommt aus der Endung. Mit einem Prüfbild getestet (image/jpeg, danach entfernt).
  - **Mobil im Vollbild:** Pop-ups füllen auf dem Handy den Bildschirm (`.dm-fenster`), Kopf- und
    Fußleiste bleiben dabei stehen, nur der Inhalt scrollt; Bildansicht und PDF-Betrachter randlos
    über die ganze Fläche; Knöpfe mit fingerfreundlicher Höhe, Rubrik-Köpfe brechen sauber um.

## 16.09.2026 (3) — Arbeitsverträge: Flexzeit oder Festzeit
- Neues Feld `EmploymentContract.workTimeModel` (`flex` | `fest`, Vorgabe `flex`).
- **Im Formular** eine Auswahl „Flexzeit (Bandbreite)" / „Festzeit (feste Stunden)". Sie steuert,
  welche Felder erscheinen:
  - **Flexzeit:** Bandbreite von/bis (Vorgabe 32–42 h), Regelarbeitszeit von/bis, Arbeitszeitkonto.
  - **Festzeit:** feste Wochenstunden (Vorgabe 40 h) und feste tägliche Arbeitszeit von/bis
    (Vorgabe 07:00–16:00); Bandbreite und Arbeitszeitkonto entfallen.
- **Im Vertragstext** (`buildSections`) erscheint je nach Modell eine andere Klausel: bei Festzeit
  „Die regelmäßige wöchentliche Arbeitszeit beträgt X Stunden … Die tägliche Arbeitszeit ist auf
  HH:MM bis HH:MM Uhr festgelegt", bei Flexzeit wie bisher die Bandbreite mit Absprache-Regel.
  Der Abschnitt heißt bei Festzeit „Arbeitszeit", bei Flexzeit „Arbeitszeit und Arbeitszeitkonto";
  die Absätze zum Arbeitszeitkonto entfallen bei Festzeit vollständig.
- Bestehende Verträge bleiben unverändert auf Flexzeit. tsc sauber, Build + Neustart, `/contracts` 200.
- **Nachtrag: Gleitzeitrahmen.** Neue Felder `flexTimeFrom` / `flexTimeTo` – im Formular unter den
  Arbeitszeiten das Paar **„Gleitzeit von / bis"** (Vorgabe 06:00–19:00 bei neuen Verträgen).
  Sind beide gefüllt, erscheint im Vertrag die Klausel: „Es gilt **Gleitzeit**: Innerhalb des
  Gleitzeitrahmens von HH:MM bis HH:MM Uhr kann der Arbeitnehmer Beginn und Ende der täglichen
  Arbeitszeit selbst bestimmen, soweit betriebliche Belange … nicht entgegenstehen."
  Leer lassen = keine Gleitzeitklausel. Gilt für beide Modelle (bei Festzeit bezieht sich der Satz
  auf die festgelegte Arbeitszeit). Klauseltext für beide Fälle geprüft.
- **Nachtrag: Gleitzeit an-/abwählbar.** Neues Feld `flexTime` (Boolean). Im Formular ein Haken
  „Gleitzeit vereinbaren"; erst wenn er gesetzt ist, erscheinen die Felder „Gleitzeit von / bis"
  (Vorgabe 06:00–19:00) und die Klausel im Vertrag. Ohne Haken entfällt beides vollständig.
  Bestehende Verträge sind damit unverändert ohne Gleitzeit (Vorgabe `false`); neue Verträge
  starten mit gesetztem Haken. Beide Fälle im erzeugten Vertragstext geprüft.

## 16.09.2026 (4) — Minijob-Vorlage und ruhigere Typografie auf Seite 1
- **Minijob-Vertrag (Wunsch Daniel, „§ 11 Punkt 1 muss drin sein"):** neue Vorlage `minijob` in der
  Vorlagenauswahl. Umfang wie „Standard", **plus** dem Abschnitt *Arbeitsergebnisse, Schutzrechte und
  Arbeitnehmererfindungen* (steht dort wieder als **§ 11**), plus neuem **§ 3 Geringfügige
  Beschäftigung (Minijob)** mit sechs Punkten: Einordnung nach § 8 Abs. 1 Nr. 1 SGB IV und Einhaltung
  der Geringfügigkeitsgrenze, gelegentliches Überschreiten, Anzeigepflicht weiterer Minijobs
  (Zusammenrechnung), Rentenversicherungspflicht mit Befreiung nach § 6 Abs. 1b SGB VI,
  Arbeitszeitaufzeichnung nach § 17 MiLoG, Gleichstellung bei Urlaub und Entgeltfortzahlung.
  Bewusst **keine feste Euro-Grenze** im Text – es gilt jeweils die aktuelle Geringfügigkeitsgrenze.
- **Angelegt: AV-0005** (Entwurf, Vorlage Minijob): Festzeit 10 h/Woche, 08:00–12:00, keine Gleitzeit,
  kein Arbeitszeitkonto, 6 Monate Probezeit, 30 Urlaubstage (anteilig). Offen: Person, Tätigkeit,
  Beginn, Stundenlohn.
- **Typografie Seite 1 (Rückmeldung „schöner, ohne Anführungsstriche"):** Die kursiven Zeilen sind weg.
  Die Parteibezeichnungen stehen jetzt als **gesperrte Kapitälchen in Grau** („NACHFOLGEND
  ARBEITGEBER" / „NACHFOLGEND ARBEITNEHMER") ohne Gedankenstriche und ohne Anführungszeichen;
  der Gleichbehandlungshinweis unter dem Titel ist eine kleine graue Zeile in Normalschrift,
  ebenfalls ohne Anführungszeichen. Vorschau und PDF gleich angepasst.

## 16.09.2026 (5) — Datensicherung mit Zeitplan, Vorschau und Wiederherstellung
- **Wunsch Daniel:** Backup-Funktion wie in ProjectEye – regelmäßig, mit Wiederherstellung und Vorschau.
- **`src/lib/backup.ts` (neu):** Sicherung der **ganzen Datenbank** per `pg_dump` (Custom-Format) –
  damit sind Dokumente, Scans, Vorlagen und Logos enthalten. Zu jeder Sicherung entsteht eine
  Begleitdatei (`.json`) mit Zeitpunkt, Art und **Zeilenzahlen je Tabelle**; sie ist die Grundlage
  der Vorschau. Arten: `auto`, `manuell`, `sicherheitskopie`.
- **Aufbewahrung Großvater–Vater–Sohn** (wie ProjectEye): Vorgabe 7 Tage täglich · 8 Wochen ·
  12 Monate · 5 Jahre; manuelle Sicherungen und Sicherheitskopien werden **nie** automatisch
  entfernt. Logik geprüft: aus 371 Sicherungen bleiben 31, die jüngsten 7 Tage vollständig.
- **Vorschau ohne Einspielen:** zeigt je Tabelle „in der Sicherung / jetzt / Unterschied"
  („3 neuer" = diese Datensätze gingen beim Einspielen verloren) und prüft über
  `pg_restore -l`, ob die Datei lesbar und vollständig ist.
- **Wiederherstellung:** legt **immer zuerst eine Sicherheitskopie** des aktuellen Standes an,
  spielt dann mit `pg_restore --clean --if-exists` ein. In der Oberfläche muss zusätzlich das Wort
  WIEDERHERSTELLEN eingetippt werden. Der Weg wurde gegen eine **Testdatenbank** geprüft
  (0 Fehlerzeilen, Bestand vollständig), die Live-Datenbank blieb dabei unberührt.
- **API:** `/api/backups` (Liste + Zeitplan + Bestand, POST = jetzt sichern, PATCH = Zeitplan),
  `/api/backups/[name]` (GET Vorschau, `?datei=1` Download, POST Wiederherstellen, DELETE).
- **Seite `/backups`:** Sicherungen als Tabelle (Desktop) bzw. Karten (Handy), „Jetzt sichern",
  Zeitplan mit Schalter und Uhrzeit, Aufbewahrungsregeln, Vorschau-Dialog, Herunterladen,
  Entfernen. In Navigation und Befehlspalette eingetragen.
- **Zeitplan:** `scripts/backup-auto.js` (stündlich per Cron, `/var/log/nexus-backup.log`) sichert,
  sobald die eingestellte Uhrzeit erreicht ist und an diesem Tag noch nichts gesichert wurde;
  danach wird ausgedünnt. Das Skript lädt die Datenbank-Adresse selbst aus der `.env` und legt den
  Ablageort fest – geprüft mit einem Lauf aus fremdem Verzeichnis und leerer Umgebung.
- Erste Sicherung: 3,7 MB, 1303 Datensätze. `backups/` ist in `.gitignore` (Personendaten).
- **Nachtrag Minijob-Vertrag:** In § 3 (Geringfügige Beschäftigung) ist Punkt 6 entfernt – der Satz
  zur Gleichstellung mit Vollzeitbeschäftigten (anteiliger Urlaub, Entgeltfortzahlung). Der
  Abschnitt hat jetzt 5 Punkte: Einordnung und Entgeltgrenze, gelegentliches Überschreiten,
  Anzeigepflicht weiterer Minijobs, Rentenversicherung mit Befreiungsmöglichkeit,
  Arbeitszeitaufzeichnung nach § 17 MiLoG.
- **Nachtrag Minijob-Vertrag:** Die Abschnitte **Urlaub** und **Bezahlte Freistellung (§ 616 BGB)**
  sind aus der Minijob-Vorlage entfernt (vorher § 5 und § 7). Der Vertrag hat jetzt 12 Paragrafen;
  „Arbeitsergebnisse, Schutzrechte und Arbeitnehmererfindungen" steht dadurch als **§ 9**.
  Gilt nur für die Vorlage „Minijob" – Standard und Vollständig bleiben unverändert.
  **Hinweis an Daniel gegeben:** Der gesetzliche Urlaubsanspruch besteht unabhängig davon weiter;
  nach § 2 NachwG gehört er zu den nachzuweisenden Vertragsbedingungen.
- **Rücknahme (Entscheidung Daniel):** § 5 Urlaub und § 7 Bezahlte Freistellung (§ 616 BGB) bleiben
  im Minijob-Vertrag doch enthalten – Grund: Der Urlaub gehört nach § 2 NachwG in die Niederschrift,
  und ohne den § 616-Abschnitt würde die Entgeltfortzahlung bei kurzer Verhinderung wieder greifen.
  Der Minijob-Vertrag hat damit wieder 14 Paragrafen; § 11 ist „Arbeitsergebnisse, Schutzrechte und
  Arbeitnehmererfindungen". Einzige inhaltliche Änderung gegenüber dem ersten Stand bleibt der
  entfernte Punkt 6 in § 3.
- **Minijob: Arbeitszeit auf Abruf statt fester Regelung.** § 2 ist in der Minijob-Vorlage ersetzt
  durch **„Arbeitszeit – Arbeit auf Abruf"** (§ 12 TzBfG): Stunden fallen nach Bedarf an, dazu die
  gesetzlich nötigen Angaben – vereinbarte Wochenstundenzahl (aus `weeklyHours`, Vorgabe 10 h),
  Abruf bis 25 % mehr / 20 % weniger (§ 12 Abs. 2), Ankündigung mindestens vier Tage im Voraus
  (§ 12 Abs. 3), Mindesteinsatz drei zusammenhängende Stunden (§ 12 Abs. 1 S. 4), Pausen und
  Zeiterfassung. Flexzeit, Festzeit und Arbeitszeitkonto entfallen in dieser Vorlage.
  **Grund für die Wochenstundenangabe:** Ohne sie gelten nach § 12 Abs. 1 S. 3 TzBfG **20 Stunden
  je Woche** als vereinbart – damit wäre die Geringfügigkeitsgrenze gerissen.
- **Minijob § 2:** Punkt 3 entfernt (Bandbreite 25 % mehr / 20 % weniger nach § 12 Abs. 2 TzBfG und
  Vergütung der vereinbarten Zeit). Der Abschnitt hat jetzt 5 Punkte. Hinweis an Daniel: Die
  Bandbreite gilt kraft Gesetzes weiter, sie steht nur nicht mehr im Vertragstext.

## 16.09.2026 (6) — Verträge in der Mitarbeiterakte ablegen (mit Ständen)
- **Wunsch Daniel:** Erstellte Verträge sollen beim Mitarbeiter unter Dokumenten liegen – mehrere
  möglich, mit Versionen/Ständen, wenn im Laufe der Zeit Änderungen kommen.
- **Neuer Knopf im Vertragsformular:** „In die Akte ablegen" bzw. „In die Akte (Version N)".
  Er erzeugt das PDF des aktuellen Standes und legt es als `EmployeeDocument` in der Akte des
  zugeordneten Mitarbeiters ab – in der Rubrik **Arbeitsvertrag**, sofern vorhanden.
- **Versionen je Vertrag:** Der Dokumentschlüssel ist `vertrag-<Vertragsnummer>`. Dadurch zählt
  jeder Vertrag seine **eigene** Versionsreihe hoch (v1, v2, …); ältere Stände bleiben vollständig
  erhalten, mehrere Verträge desselben Mitarbeiters kommen sich nicht ins Gehege. Die Notiz am
  Dokument hält Zeitpunkt und Vertragsstatus fest.
- **Im Formular sichtbar:** Abschnitt „In der Akte abgelegte Stände" listet alle Versionen mit
  Zeitpunkt und Notiz, dazu ein Knopf „Akte öffnen" (`/documents?employee=…`).
- Versionszählung mit zwei Prüfablagen getestet (v1, v2 – danach entfernt). Build + Neustart, 200.
