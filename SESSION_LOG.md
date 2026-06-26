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
