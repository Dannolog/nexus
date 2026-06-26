#!/bin/bash
# Tägliches DB-Backup der nexus-Datenbank (pg_dump, custom-Format).
# DB-URL wird aus .env gelesen (kein Secret im Repo). Behält die letzten 14 Dumps.
set -e
ROOT=/mnt/devip3/nexus
DIR="$ROOT/backups"
mkdir -p "$DIR"
DB_URL=$(grep -E '^DATABASE_URL=' "$ROOT/.env" | head -1 | cut -d'"' -f2)
TS=$(date +%Y%m%d_%H%M%S)
OUT="$DIR/nexus_${TS}.dump"
pg_dump "$DB_URL" -Fc -f "$OUT"
# Rotation: nur die letzten 14 Dumps behalten
ls -1t "$DIR"/nexus_*.dump 2>/dev/null | tail -n +15 | xargs -r rm -f
echo "[$(date '+%F %T')] Backup $OUT ($(du -h "$OUT" | cut -f1))"
