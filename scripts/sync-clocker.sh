#!/bin/bash
# Regelmäßiger Mitarbeiter-Abgleich Nexus ⇄ clocker (beidseitig).
# Wird per Cron aufgerufen; Ausgabe landet in /var/log/nexus-clocker-sync.log
cd /mnt/devip3/nexus || exit 1
echo "── $(date '+%Y-%m-%d %H:%M:%S') ──"
TS_NODE_TRANSPILE_ONLY=1 node node_modules/ts-node/dist/bin.js \
  --compiler-options '{"module":"CommonJS","moduleResolution":"node"}' \
  prisma/sync-clocker-employees.ts
