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
