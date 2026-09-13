#!/bin/bash
# Regelmäßiger Abgleich Nexus ⇄ clocker und ⇄ kontor (Sicherheitsnetz zum Sofort-Abgleich).
#   1. Mitarbeiter (beidseitig, inkl. Anlegen in beide Richtungen)
#   2. Stammdaten: Firmen, Kunden, Projekte (leere Felder füllen; Anlegen clocker → Nexus)
#   3. Kontakte/Ansprechpartner: Nexus ⇄ kontor, ⇄ clocker, ⇄ ProjectEye (Protokoll:
#      /mnt/devip3/shared/sync/KONTAKTE.md)
# Aufruf per Cron; Ausgabe in /var/log/nexus-clocker-sync.log
cd /mnt/devip3/nexus || exit 1
TS="TS_NODE_TRANSPILE_ONLY=1"
OPT='{"module":"CommonJS","moduleResolution":"node"}'
echo "── $(date '+%Y-%m-%d %H:%M:%S') ──"
TS_NODE_TRANSPILE_ONLY=1 node node_modules/ts-node/dist/bin.js --compiler-options "$OPT" prisma/sync-clocker-employees.ts
TS_NODE_TRANSPILE_ONLY=1 node node_modules/ts-node/dist/bin.js --compiler-options "$OPT" prisma/sync-clocker-stammdaten.ts
TS_NODE_TRANSPILE_ONLY=1 node node_modules/ts-node/dist/bin.js --compiler-options "$OPT" prisma/sync-kontor-stammdaten.ts
TS_NODE_TRANSPILE_ONLY=1 node node_modules/ts-node/dist/bin.js --compiler-options "$OPT" prisma/sync-kontor-benutzer.ts
TS_NODE_TRANSPILE_ONLY=1 node node_modules/ts-node/dist/bin.js --compiler-options "$OPT" prisma/sync-app-kontakte.ts --app=kontor
TS_NODE_TRANSPILE_ONLY=1 node node_modules/ts-node/dist/bin.js --compiler-options "$OPT" prisma/sync-app-kontakte.ts --app=clocker
TS_NODE_TRANSPILE_ONLY=1 node node_modules/ts-node/dist/bin.js --compiler-options "$OPT" prisma/sync-projecteye-suppliers.ts
TS_NODE_TRANSPILE_ONLY=1 node node_modules/ts-node/dist/bin.js --compiler-options "$OPT" prisma/sync-projecteye-kontakte.ts
