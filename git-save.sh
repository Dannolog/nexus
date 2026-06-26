#!/bin/bash
APP_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$APP_DIR" || exit 1

if ! git diff --quiet HEAD 2>/dev/null || [ -n "$(git ls-files --others --exclude-standard)" ]; then
  TS=$(date +"%Y-%m-%d %H:%M:%S")
  MSG="${1:-Auto-Save $TS}"
  git add -A
  git -c user.name="Dannolog" -c user.email="claude@ingpro-baier.de" commit -m "$MSG"
  git push origin main
  echo "[$TS] Gesichert: $MSG"
else
  echo "[$(date +"%Y-%m-%d %H:%M:%S")] Keine Änderungen."
fi
