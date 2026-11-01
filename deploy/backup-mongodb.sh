#!/bin/sh
set -eu

: "${MONGODB_URI:?MONGODB_URI is required}"
: "${BACKUP_DIR:=/backups}"
: "${BACKUP_RETENTION_DAYS:=30}"

mkdir -p "$BACKUP_DIR"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
target="$BACKUP_DIR/turfyslot-$stamp.archive.gz"
mongodump --uri="$MONGODB_URI" --gzip --archive="$target"
find "$BACKUP_DIR" -type f -name 'turfyslot-*.archive.gz' -mtime "+$BACKUP_RETENTION_DAYS" -delete
