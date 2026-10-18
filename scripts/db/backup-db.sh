#!/bin/sh
# Logical database backup (r?? — Server status / Automatic backups).
#
# Takes one `mysqldump` of DATABASE_URL into a timestamped, gzip-compressed file. This is an
# EXTRA safety copy on top of Aiven's own automated backups (daily snapshots + point-in-time
# recovery on most plans — see docs/BACKUP-AND-RESTORE.md section 1–4, which is the primary
# restore path). This script covers the case Aiven does not: keeping a copy outside Aiven, and
# an off-the-shelf format any MySQL client can restore from.
#
# What this script does NOT do by itself: upload the dump anywhere off this machine/container.
# A Render Cron Job's disk is thrown away when the job finishes, so without a storage destination
# configured (see "Where the dump goes" below) the dump is made and then discarded — the run still
# proves the database is dumpable (see "What success means" below), but keeps nothing. Wire up
# BACKUP_UPLOAD_CMD (or run this somewhere with a persistent/mounted disk) before relying on it.
#
#   sh scripts/db/backup-db.sh
#
# Reads the connection from DATABASE_URL (same format as the app's .env: see .env.example and
# prisma/schema.prisma's datasource), e.g.:
#   mysql://ela_app:secret@your-service.aivencloud.com:12345/alanjal_ela?ssl-mode=REQUIRED
#
# Env vars:
#   DATABASE_URL       required — the database to dump (never commit a real one)
#   BACKUP_DIR         where the dump file is written (default: ./backups)
#   BACKUP_RETAIN_DAYS how many days of LOCAL dumps to keep in BACKUP_DIR before older ones are
#                      deleted (default: 7; set 0 to keep every dump this script ever makes here)
#   BACKUP_UPLOAD_CMD  optional shell command to copy the finished dump off this machine, e.g. to
#                      a storage bucket you set up yourself. The dump's path is appended as the
#                      command's last argument. Nothing is invented here: leave it unset and the
#                      dump simply stays in BACKUP_DIR (fine for a persistent disk; lost otherwise).
#                      Example once you have a bucket and its CLI configured:
#                        BACKUP_UPLOAD_CMD='aws s3 cp --storage-class STANDARD_IA'
#                        BACKUP_UPLOAD_CMD='gsutil cp'
set -eu

: "${DATABASE_URL:?DATABASE_URL is not set (copy it from the app's environment / .env)}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
BACKUP_RETAIN_DAYS="${BACKUP_RETAIN_DAYS:-7}"

command -v mysqldump >/dev/null 2>&1 || {
  echo "mysqldump was not found on this machine/image. Install a MySQL/MariaDB client" >&2
  echo "(Debian/Ubuntu: apt-get install -y default-mysql-client) and run again." >&2
  exit 1
}

# ---- parse DATABASE_URL (mysql://user:pass@host:port/db?query) without any extra dependency ----
url="$DATABASE_URL"
rest="${url#mysql://}"
userinfo="${rest%%@*}"
after_at="${rest#*@}"
hostport_db="${after_at%%\?*}"
user="${userinfo%%:*}"
pass="${userinfo#*:}"
hostport="${hostport_db%%/*}"
db="${hostport_db#*/}"
host="${hostport%%:*}"
port="${hostport#*:}"
[ "$port" = "$hostport" ] && port=3306
[ -z "$db" ] && { echo "Could not find a database name in DATABASE_URL." >&2; exit 1; }

mkdir -p "$BACKUP_DIR"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
out="$BACKUP_DIR/${db}-${stamp}.sql.gz"
tmp="${out}.part"

echo "Dumping '$db' from $host:$port to $out ..."
MYSQL_PWD="$pass" mysqldump \
  --single-transaction --routines --triggers --set-gtid-purged=OFF --default-character-set=utf8mb4 \
  --host="$host" --port="$port" --user="$user" --ssl-mode=REQUIRED "$db" \
  | gzip -9 > "$tmp"
mv "$tmp" "$out"

size="$(wc -c < "$out" | tr -d ' ')"
if [ "$size" -lt 200 ]; then
  echo "The dump is suspiciously small ($size bytes) — treating this as a FAILED backup." >&2
  rm -f "$out"
  exit 1
fi
echo "Wrote $out ($size bytes)."

if [ -n "${BACKUP_UPLOAD_CMD:-}" ]; then
  echo "Uploading with: $BACKUP_UPLOAD_CMD $out"
  # shellcheck disable=SC2086
  if $BACKUP_UPLOAD_CMD "$out"; then
    echo "Upload succeeded."
  else
    echo "Upload FAILED (dump kept locally at $out) — check BACKUP_UPLOAD_CMD and its credentials." >&2
    exit 1
  fi
else
  echo "BACKUP_UPLOAD_CMD is not set: the dump stays in $BACKUP_DIR on this machine/container only."
  echo "On Render, a Cron Job's disk does not persist after the run — set BACKUP_UPLOAD_CMD (or mount a"
  echo "persistent disk at BACKUP_DIR) or this dump is thrown away as soon as the job ends."
fi

if [ "$BACKUP_RETAIN_DAYS" != "0" ]; then
  find "$BACKUP_DIR" -maxdepth 1 -name "${db}-*.sql.gz" -mtime "+${BACKUP_RETAIN_DAYS}" -print -delete 2>/dev/null || true
fi

echo "Done."
