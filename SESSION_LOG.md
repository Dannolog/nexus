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
- [ ] 7. Phase 1: kontor+clocker-Import (dedupliziert) + Anbindung
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
