-- Least-privilege accounts (run once as an administrator; replace the passwords).
-- The application never connects as root.

-- Used by `prisma migrate deploy` during releases only (DDL rights).
CREATE USER IF NOT EXISTS 'ela_migrate'@'%' IDENTIFIED BY 'CHANGE_ME_MIGRATE';
GRANT ALL PRIVILEGES ON alanjal_ela.* TO 'ela_migrate'@'%';

-- Used by the running application: data access only, no DDL, no DROP.
CREATE USER IF NOT EXISTS 'ela_app'@'%' IDENTIFIED BY 'CHANGE_ME_APP';
GRANT SELECT, INSERT, UPDATE, DELETE ON alanjal_ela.* TO 'ela_app'@'%';

-- Read-only account for reporting tools.
CREATE USER IF NOT EXISTS 'ela_report'@'%' IDENTIFIED BY 'CHANGE_ME_REPORT';
GRANT SELECT ON alanjal_ela.* TO 'ela_report'@'%';

FLUSH PRIVILEGES;
