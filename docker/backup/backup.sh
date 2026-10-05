#!/bin/sh
# Encrypted nightly backups (Phase 13). Runs as the "backup" service.
#  - database: mysqldump --single-transaction (consistent, no locking of the live site)
#  - files: storage/ (logo, uploads)
#  - encrypted with the PUBLIC key in /keys/backup-public.asc; the private key stays
#    offline with the school (restore.sh runs on a machine that has it)
#  - sha256 checksum next to each file; files older than BACKUP_KEEP_DAYS are deleted
#  - optional heartbeat: BACKUP_HEARTBEAT_URL is pinged after every successful backup
# Environment: MYSQL_HOST, MYSQL_BACKUP_PASSWORD, BACKUP_TIME (HH:MM, Riyadh), BACKUP_KEEP_DAYS
set -eu
DB=alanjal_ela
OUT=/backups
KEEP=${BACKUP_KEEP_DAYS:-30}
AT=${BACKUP_TIME:-01:30}
: "${MYSQL_BACKUP_PASSWORD:?set MYSQL_BACKUP_PASSWORD}"
[ -f /keys/backup-public.asc ] || { echo "missing /keys/backup-public.asc (see docs/DEPLOYMENT.md)" >&2; exit 1; }
export GNUPGHOME=/tmp/gnupg
mkdir -p "$GNUPGHOME" "$OUT" && chmod 700 "$GNUPGHOME"
gpg --batch --quiet --import /keys/backup-public.asc
RECIPIENT=$(gpg --batch --with-colons --list-keys | awk -F: '/^fpr/ {print $10; exit}')

once() {
  stamp=$(TZ=Asia/Riyadh date +%Y-%m-%d_%H%M)
  db="$OUT/$DB-$stamp.sql.gz.gpg"
  files="$OUT/storage-$stamp.tar.gz.gpg"
  MYSQL_PWD="$MYSQL_BACKUP_PASSWORD" mysqldump -h "${MYSQL_HOST:-mysql}" -u ela_backup \
    --single-transaction --routines --triggers --no-tablespaces --set-gtid-purged=OFF --default-character-set=utf8mb4 "$DB" \
    | gzip -9 | gpg --batch --yes --trust-model always --encrypt --recipient "$RECIPIENT" > "$db.part"
  mv "$db.part" "$db"
  tar -czf - -C /storage . | gpg --batch --yes --trust-model always --encrypt --recipient "$RECIPIENT" > "$files.part"
  mv "$files.part" "$files"
  (cd "$OUT" && sha256sum "$(basename "$db")" "$(basename "$files")" > "$stamp.sha256")
  find "$OUT" -type f \( -name "*.gpg" -o -name "*.sha256" \) -mtime +"$KEEP" -delete
  echo "{\"event\":\"backup.done\",\"file\":\"$(basename "$db")\",\"bytes\":$(wc -c < "$db")}"
  [ -z "${BACKUP_HEARTBEAT_URL:-}" ] || wget -q -O /dev/null "$BACKUP_HEARTBEAT_URL" 2>/dev/null || curl -fsS -o /dev/null "$BACKUP_HEARTBEAT_URL" || true
}

if [ "${1:-}" = "--now" ]; then once; exit 0; fi
while true; do
  now=$(TZ=Asia/Riyadh date +%s)
  target=$(TZ=Asia/Riyadh date -d "today $AT" +%s)
  [ "$target" -gt "$now" ] || target=$((target + 86400))
  echo "{\"event\":\"backup.next\",\"in_seconds\":$((target - now))}"
  sleep $((target - now))
  once || echo "{\"event\":\"backup.failed\"}" >&2
done
