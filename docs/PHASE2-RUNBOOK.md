# Phase 2 runbook: create the database on MySQL

This takes about 15 minutes on a machine with internet access. Everything has already been tested offline (`database/verify/REPORT.md`); these steps repeat it on real MySQL.

## 0. What you need

- **Node.js 20.11 or newer**, and **one of these:**
  - Docker, which runs MySQL in a container (easiest), or
  - a MySQL 8 server your IT team manages
- **The project folder** (`alanjal-adaptive-ela`)

## 1. Install and configure

```bash
cd alanjal-adaptive-ela
npm install
cp .env.example .env
```

Edit `.env` and set these values:

- `DATABASE_URL="mysql://ela_migrate:YOUR_PASSWORD@localhost:3306/alanjal_ela"`
- `APP_SECRET=`: paste the output of `openssl rand -base64 32`
- `DEMO_PASSWORD=`: any password for the demo accounts (development only)

## 2. Start MySQL

**Option A: Docker**

```bash
export MYSQL_APP_PASSWORD='choose-one' MYSQL_ROOT_PASSWORD='choose-another'
docker compose up -d mysql
```

**Option B: existing server.** Ask IT to create an empty database `alanjal_ela` (utf8mb4). Then have them run `database/sql/ops/01_app_user.sql` with real passwords; it creates three accounts:

- `ela_migrate`: for releases (can change tables)
- `ela_app`: for the running app (data only)
- `ela_report`: read-only

## 3. Create the tables

```bash
npx prisma validate                    # checks the schema
npx prisma migrate dev --name init     # creates all 63 tables, keys and indexes
```

`prisma/migrations/…/migration.sql` is the official record. `database/ddl/mysql-reference.sql` is a generated copy for review; you don't need to run it.

## 4. Load the school data

```bash
npm run db:seed:curriculum     # Grades 4–6: 18 units, 78 lessons, 191 skills, 254 official standards, 619 IXL references
npm run db:seed:questions      # 229 original questions + 14 passages (all "under review" until a teacher approves them)
npm run db:seed:demo           # optional, development only: a labelled demo school
```

All three are safe to run again; they never duplicate or delete anything.

## 5. Verify

```bash
npm run db:verify:mysql
```

Every line should say `PASS`, ending with `ALL CHECKS PASSED`.

## 6. Production settings

- **Switch the app account.** Change `DATABASE_URL` to the `ela_app` account; the app does not need table-changing rights.
- **Releases.** Run `npx prisma migrate deploy` with the `ela_migrate` account. Never use `migrate dev` in production.
- **Nightly summary tables.** Schedule `npm run jobs:rollups`, for example at 02:15 every day.
- **Encrypted backups.** Schedule `database/sql/ops/backup.sh`, for example at 01:30 every day. It keeps 30 days.
- **Hosting.** Keep the database in Saudi Arabia (PDPL), with backups encrypted.

## If something fails

| Message | Fix |
|---|---|
| `P1001: Can't reach database server` | MySQL isn't running, or the host/port in `DATABASE_URL` is wrong |
| `Access denied` | Check the username and password in `DATABASE_URL` |
| `School ALANJAL not found` (questions seed) | Run `db:seed:curriculum` first |
| `Bank validation failed` | Run `npm run bank:build` to see which question needs fixing |
