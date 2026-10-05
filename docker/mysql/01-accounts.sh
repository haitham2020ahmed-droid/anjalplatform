#!/bin/sh
# Runs once, when the MySQL data volume is first created (docker-entrypoint-initdb.d).
# Least-privilege accounts, passwords from the environment (never stored in files):
#   ela_migrate  schema changes, used only by the one-off "migrate" service
#   ela_app      data access only (no DDL, no DROP), used by the website and jobs
#   ela_backup   read + lock rights for consistent dumps
set -eu
: "${MYSQL_MIGRATE_PASSWORD:?}" "${MYSQL_APP_PASSWORD:?}" "${MYSQL_BACKUP_PASSWORD:?}"
mysql -uroot -p"$MYSQL_ROOT_PASSWORD" <<SQL
CREATE DATABASE IF NOT EXISTS alanjal_ela CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE USER IF NOT EXISTS 'ela_migrate'@'%' IDENTIFIED BY '${MYSQL_MIGRATE_PASSWORD}';
GRANT ALL PRIVILEGES ON alanjal_ela.* TO 'ela_migrate'@'%';
CREATE USER IF NOT EXISTS 'ela_app'@'%' IDENTIFIED BY '${MYSQL_APP_PASSWORD}';
GRANT SELECT, INSERT, UPDATE, DELETE ON alanjal_ela.* TO 'ela_app'@'%';
CREATE USER IF NOT EXISTS 'ela_backup'@'%' IDENTIFIED BY '${MYSQL_BACKUP_PASSWORD}';
GRANT SELECT, LOCK TABLES, SHOW VIEW, TRIGGER, EVENT, PROCESS ON *.* TO 'ela_backup'@'%';
FLUSH PRIVILEGES;
SQL
echo "accounts created"
