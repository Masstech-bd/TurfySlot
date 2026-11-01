#!/bin/sh
set -eu

: "${PGHOST:?PGHOST is required}"
: "${PGUSER:?PGUSER is required}"
: "${PGDATABASE:?PGDATABASE is required}"
: "${PGPASSWORD:?PGPASSWORD is required}"
: "${BACKUP_DIR:=/backups}"
: "${BACKUP_RETENTION_DAYS:=30}"

mkdir -p "$BACKUP_DIR"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
target="$BACKUP_DIR/turfyslot-$stamp.dump"
pg_dump --format=custom --no-owner --host="$PGHOST" --username="$PGUSER" --dbname="$PGDATABASE" --file="$target"
find "$BACKUP_DIR" -type f -name 'turfyslot-*.dump' -mtime "+$BACKUP_RETENTION_DAYS" -delete
