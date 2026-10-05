#!/usr/bin/env bash
# Nightly encrypted backup with 30-day retention.
# Requires: MYSQL_BACKUP_USER/MYSQL_BACKUP_PASSWORD in the environment, and an age/gpg recipient.
# cron: 30 1 * * *  /opt/ela/database/sql/ops/backup.sh
set -euo pipefail
DB=alanjal_ela
DIR=${BACKUP_DIR:-/var/backups/ela}
STAMP=$(date +%Y-%m-%d_%H%M)
mkdir -p "$DIR"
mysqldump --single-transaction --routines --triggers --set-gtid-purged=OFF \
  -u"$MYSQL_BACKUP_USER" -p"$MYSQL_BACKUP_PASSWORD" "$DB" \
  | gzip | gpg --batch --yes --encrypt --recipient "${BACKUP_GPG_RECIPIENT:?set BACKUP_GPG_RECIPIENT}" \
  > "$DIR/$DB-$STAMP.sql.gz.gpg"
find "$DIR" -name "$DB-*.sql.gz.gpg" -mtime +30 -delete
echo "backup ok: $DIR/$DB-$STAMP.sql.gz.gpg"
