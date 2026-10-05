#!/bin/sh
# Restore a backup (Phase 13). Run on a machine that holds the PRIVATE key.
#   restore.sh <file.sql.gz.gpg> <target-database> [--replace-production]
# Verifies the checksum, decrypts, and loads into <target-database>. Refuses to
# overwrite the live database (alanjal_ela) unless --replace-production is given.
# Monthly restore test: restore the newest backup into a scratch database
# (e.g. alanjal_ela_restore_test) and run the checks printed at the end.
set -eu
file=${1:?usage: restore.sh <file.sql.gz.gpg> <target-database> [--replace-production]}
target=${2:?target database name}
if [ "$target" = "alanjal_ela" ] && [ "${3:-}" != "--replace-production" ]; then
  echo "Refusing to overwrite the live database. Restore into a test database first, or pass --replace-production." >&2
  exit 2
fi
case "$target" in *[!A-Za-z0-9_]*) echo "invalid database name" >&2; exit 2;; esac
sums="$(dirname "$file")/$(basename "$file" | sed -E 's/^alanjal_ela-(.*)\.sql\.gz\.gpg$/\1/').sha256"
if [ -f "$sums" ]; then (cd "$(dirname "$file")" && grep "$(basename "$file")" "$(basename "$sums")" | sha256sum -c -); else echo "warning: no checksum file found" >&2; fi
: "${MYSQL_RESTORE_USER:?}" "${MYSQL_RESTORE_PASSWORD:?}"
MYSQL_PWD="$MYSQL_RESTORE_PASSWORD" mysql -h "${MYSQL_HOST:-127.0.0.1}" -u "$MYSQL_RESTORE_USER" -e "CREATE DATABASE IF NOT EXISTS \`$target\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci"
gpg --batch --decrypt "$file" | gunzip | MYSQL_PWD="$MYSQL_RESTORE_PASSWORD" mysql -h "${MYSQL_HOST:-127.0.0.1}" -u "$MYSQL_RESTORE_USER" --default-character-set=utf8mb4 "$target"
echo "restored into $target. Checks:"
MYSQL_PWD="$MYSQL_RESTORE_PASSWORD" mysql -h "${MYSQL_HOST:-127.0.0.1}" -u "$MYSQL_RESTORE_USER" "$target" -e "
  SELECT (SELECT COUNT(*) FROM School) schools, (SELECT COUNT(*) FROM Student) students, (SELECT COUNT(*) FROM QuestionAttempt) attempts,
         (SELECT MAX(createdAt) FROM AuditLog) newest_audit_entry;"
