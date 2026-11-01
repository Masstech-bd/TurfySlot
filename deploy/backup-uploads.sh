#!/bin/sh
set -eu

source_dir=${UPLOADS_SOURCE:-/source}
backup_dir=${UPLOADS_BACKUP:-/backup}
mkdir -p "$backup_dir"
stamp=$(date -u +%Y%m%dT%H%M%SZ)
tar -czf "$backup_dir/uploads-$stamp.tar.gz" -C "$source_dir" private public
find "$backup_dir" -type f -name 'uploads-*.tar.gz' -mtime +30 -delete
