#!/usr/bin/env bash
# Postgres logical backup for EmailJachai-Pro.
# Usage:
#   DATABASE_URL='postgres://user:pass@host:5432/ejp?sslmode=require' ./scripts/backup-postgres.sh
# Optional:
#   BACKUP_DIR=./backups RETENTION_DAYS=14 ./scripts/backup-postgres.sh

set -euo pipefail

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "ERROR: DATABASE_URL is required" >&2
  exit 1
fi

BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$BACKUP_DIR"

OUT="${BACKUP_DIR}/ejp_${STAMP}.sql.gz"
echo "Writing ${OUT} ..."
pg_dump "$DATABASE_URL" --no-owner --no-acl | gzip -c > "$OUT"
echo "Backup complete: ${OUT} ($(du -h "$OUT" | awk '{print $1}'))"

if command -v find >/dev/null 2>&1; then
  find "$BACKUP_DIR" -name 'ejp_*.sql.gz' -type f -mtime "+${RETENTION_DAYS}" -print -delete || true
fi

echo "Restore drill (staging):"
echo "  gunzip -c ${OUT} | psql \"\$DATABASE_URL\""
