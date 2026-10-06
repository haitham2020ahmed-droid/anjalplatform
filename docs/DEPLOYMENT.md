# Deployment guide

For the school's IT team or whoever runs the server. Every command is meant to be
copied as written; replace only the values in `<angle brackets>`.

## 1. What runs

```
Internet ──HTTPS──▶ caddy ──▶ web (Next.js, PDF engine)  ──┐
                                                          ├──▶ mysql (private, no public port)
                    migrate (once per release) ───────────┤
                    jobs (nightly analytics, security digest, weekly question analysis)
                    backup (nightly, encrypted with the school's public key) ──▶ ./backups
```

All six services are defined in `docker-compose.prod.yml`. Images are built from `Dockerfile`
(targets `web`, `jobs`) and `docker/backup/Dockerfile`.

## 2. Server

| Item | Recommendation |
|---|---|
| Machine | Linux VM, 4 vCPU, 8 GB RAM, 80 GB SSD (Ubuntu 24.04 LTS or similar) |
| Software | Docker Engine 24+ with the Compose plugin; git |
| Network | A domain name (e.g. `ela.<school-domain>`) pointing at the server; ports 80 and 443 open; everything else closed |
| Location | The platform stores data about children. Saudi PDPL limits transfers of personal data outside the Kingdom, so host in a data centre **inside Saudi Arabia** unless the school's legal adviser approves otherwise. (This is guidance, not legal advice.) |
| Access | SSH with keys only; only named administrators; `.env.production` readable only by them |

## 3. One-time preparation (on a developer machine, before the first deployment)

Two files must be created once and committed. Neither can be generated without internet access,
which is why they are not in the delivered ZIP.

```bash
npm install                 # creates package-lock.json (reproducible builds; required by CI and Docker)
npm run db:baseline         # creates prisma/migrations/0001_init (Prisma's own SQL; needs no database)
git add package-lock.json prisma/migrations && git commit -m "Lockfile and initial migration"
```

Review `prisma/migrations/0001_init/migration.sql` (63 tables). A database that was already
created earlier with `prisma migrate dev` or `db push` is marked as up to date once with
`npx prisma migrate resolve --applied 0001_init`.

Push to GitHub: the CI pipeline (`.github/workflows/ci.yml`) then runs types, all tests, the
dependency audit, the migrations on a real MySQL 8.4, the browser end-to-end tests and the
Docker builds on every change. **Deploy only commits whose CI run is green.**

## 4. First deployment

```bash
# 1. code
git clone <repository-url> /opt/alanjal-ela && cd /opt/alanjal-ela

# 2. settings: fill in EVERY value (instructions inside the file)
cp .env.production.example .env.production
chmod 600 .env.production
nano .env.production

# 3. backup key (see section 6): put the PUBLIC key here
cp <path-to>/backup-public.asc docker/backup/backup-public.asc

# 4. start everything (builds the images; first start takes several minutes)
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build

# 5. curriculum and question bank for Al-Anjal (idempotent: safe to run again)
docker compose -f docker-compose.prod.yml --env-file .env.production run --rm jobs npm run db:seed:curriculum -- --school=ALANJAL
docker compose -f docker-compose.prod.yml --env-file .env.production run --rm jobs npm run db:seed:questions -- --school=ALANJAL

# 6. the first school admin (prints a one-time password; change it at first sign-in)
docker compose -f docker-compose.prod.yml --env-file .env.production run --rm jobs \
  npm run admin:create -- --school=ALANJAL --username=<username> --name="<Full name>" --email=<email>
```

Then sign in at `https://<APP_DOMAIN>` and, in **Administration**:
1. **Settings → School calendar**: the academic year and its terms.
2. **Settings → Report branding**: the Arabic school name and the school logo.
3. **Import users**: download the template, fill in students, teachers and parents, check, import;
   download the temporary passwords file and share it securely.
4. **Questions**: review and publish the question bank (it arrives "under review").

Never run `db:seed:demo` on the production server.

Check: `curl -fsS https://<APP_DOMAIN>/api/health` → `{"status":"ok","db":"ok",…}`.

## 5. Updates and rollback

```bash
cd /opt/alanjal-ela
git fetch && git checkout <release-tag>          # a commit with a green CI run
# set APP_VERSION in .env.production to the same tag, then:
docker compose -f docker-compose.prod.yml --env-file .env.production run --rm backup --now   # backup first
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```

`migrate` applies new migrations before `web` and `jobs` start; if it fails, the old containers
keep running and nothing is half-updated.

**Rollback:** check out the previous tag and run the same `up -d --build`. This works when
migrations are backward compatible, so make that a rule for every schema change: add columns
and tables in one release, remove old ones only in a later release. If a release did change
data in a way the old version cannot read, restore the backup taken just before the update
(section 6).

## 6. Backups

**How it works.** Every night at `BACKUP_TIME` (Riyadh) the `backup` service writes to
`BACKUP_DIR`:
- `alanjal_ela-<date>.sql.gz.gpg`: the whole database (consistent snapshot, the site stays up)
- `storage-<date>.tar.gz.gpg`: logo and uploaded files
- `<date>.sha256`: checksums

Files are encrypted with the school's **public** key. The server can create backups but
**cannot read them**; only the private key, kept offline, can. Files older than
`BACKUP_KEEP_DAYS` are deleted.

**Create the key pair once** (on a trusted computer, not the server):

```bash
gpg --quick-generate-key "Al-Anjal ELA backups <it@school.example>" rsa4096 encrypt never
gpg --armor --export "Al-Anjal ELA backups" > backup-public.asc       # goes to the server
gpg --armor --export-secret-keys "Al-Anjal ELA backups" > backup-PRIVATE.asc
```

Store `backup-PRIVATE.asc` and its passphrase in **two** safe places (e.g. the principal's
safe and an encrypted USB key held by IT). Without it, backups cannot be restored.

**Off-site copy (required).** A backup on the same server does not survive the loss of that
server. Copy `BACKUP_DIR` daily to a second location inside the Kingdom (another server, the
school's NAS, or Saudi-region object storage), e.g. with `rsync` or `rclone` from cron.
The files are already encrypted.

**Restore** (on a machine with the private key and a MySQL client):

```bash
gpg --import backup-PRIVATE.asc
MYSQL_HOST=<host> MYSQL_RESTORE_USER=<user> MYSQL_RESTORE_PASSWORD=<pw> \
  docker/backup/restore.sh backups/alanjal_ela-<date>.sql.gz.gpg alanjal_ela_restore_test
```

The script verifies the checksum, restores, and prints counts (schools, students, answers, newest
audit entry). It refuses to overwrite the live database unless `--replace-production` is given.

**Monthly restore test (do not skip).** Restore the newest backup into `alanjal_ela_restore_test`,
compare the printed counts with the live site, then drop the test database. A backup that has
never been restored is not a backup.

## 7. Monitoring

| What | How | Set up |
|---|---|---|
| Site up | External uptime check on `https://<APP_DOMAIN>/api/health` every 1–5 minutes (e.g. UptimeRobot, Better Stack, Healthchecks.io) | Alert by email/SMS when it fails twice |
| Containers healthy | Docker health checks (web, mysql); `restart: unless-stopped` | `docker compose ps` shows `healthy` |
| Jobs actually run | Each job pings its heartbeat URL after success; the service alerts if a ping is late ("dead man's switch") | Create checks for `rollups` (daily), `security-digest` (daily), `item-analysis` (weekly), backup (daily); put the URLs in `HEARTBEAT_URL_*` / `BACKUP_HEARTBEAT_URL` |
| Job failures | Posted to `ALERT_WEBHOOK_URL` (Slack, Microsoft Teams or similar) | Optional but recommended |
| Security | Daily digest at 06:30: repeated failed sign-ins from one address, many lockouts, repeated refused actions by one user, bulk report downloads, any new school admin. Sent to `ALERT_WEBHOOK_URL` and logged | Thresholds: `src/server/monitoring/security-digest.ts` |
| Logs | All services log to Docker (JSON, rotated: 5 × 20 MB per container). `docker compose logs -f web jobs` | Optionally ship to a central log service |
| Disk | Watch free space on the database and backup volumes | Alert at 80 % |

## 8. Routine tasks

| When | Task |
|---|---|
| Daily (automatic) | Backups, analytics rollups, session clean-up, security digest |
| Weekly | Read the security digest; apply Dependabot pull requests once CI is green |
| Monthly | Restore test (section 6); check disk space; review admin accounts |
| Each term | Update the calendar; import new students; archive empty classes |
| Each year | New academic year and terms; promote students (move to next grade's class); rotate `APP_SECRET` only if it may have leaked (rotating signs everyone out) |

## 9. Incidents

| Symptom | First steps |
|---|---|
| Site down | `docker compose ps`; `docker compose logs --tail=200 web caddy`; `/api/health` → `db: unavailable` means MySQL: `docker compose logs mysql` |
| PDF reports fail / "busy" | `docker compose logs web | grep -i chromium`; raise `REPORT_PDF_CONCURRENCY` only if the server has spare CPU and memory |
| Suspected account misuse | Deactivate the user in Administration (signs them out everywhere); check the audit log for the user; reset passwords |
| Suspected data breach | Preserve logs and the audit table (take a backup first); inform the principal; follow the school's PDPL breach procedure (the regulator expects prompt notification) |
| Lost admin access | `npm run admin:create` (section 4, step 6) with a new username |

## 10. Hosting on Vercel

The app **builds** on Vercel (no secrets needed at build time; set the variables from `.env.example`
in the Vercel project for runtime). Several parts of this design, however, assume a server you control
(sections 1–9). On Vercel they need changes before real use:

| Part | On a server (this guide) | On Vercel |
|---|---|---|
| PDF reports | Chromium installed in the image | Not available in Vercel Functions as configured. Needs a serverless Chromium build or a separate small PDF service. Excel and CSV reports work. |
| Logo and uploads | Folder `storage/` on a volume | Vercel's file system is temporary: files disappear. Needs object storage (or the logo as a `data:` URI). |
| Scheduled jobs | `jobs` container | Vercel Cron calling protected endpoints, or a small separate server for the jobs |
| Database and backups | MySQL and `backup` in the same stack | An external MySQL 8 service and its own backups |
| Data location | A Saudi data centre (section 2) | To my knowledge Vercel has no region inside Saudi Arabia (check its current region list). Student data would then be processed abroad: check PDPL with the school before using real student data. |

Recommendation: use Vercel for previews and demos with demo data; run the school's production on a
server in Saudi Arabia with `docker-compose.prod.yml`. If Vercel must be used in production, adapt the
PDF engine, file storage and jobs first.

