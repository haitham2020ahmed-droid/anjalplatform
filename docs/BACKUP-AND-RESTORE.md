# Backup and restore (Render + Aiven MySQL)

This page is for the platform owner and the school's IT contact. It covers the hosted setup
(web app on Render, database on Aiven for MySQL). The self-hosted Docker setup has its own
encrypted nightly backup service (see `docs/DEPLOYMENT.md`, section 6).

## 1. What must be backed up

| Data | Where it lives | Backed up by |
|---|---|---|
| Everything the platform knows: accounts, classes, answers, mastery, levels, tiers, MAP scores, writing, ReadRise, reports, audit log | The MySQL database on Aiven | **Aiven** (daily backups + point-in-time recovery) |
| School logo, uploaded files, read-aloud recordings | The `UPLOAD_DIR` folder (a Render disk, if one is attached) | **Nobody, unless you set it up.** Copy the disk regularly (see 5) |
| Secrets (`DATABASE_URL`, `APP_SECRET`, SMTP and AI keys) | Render environment settings | Keep a copy in the school's password manager |

**The in-app “Backup” (Admin → Backup, an Excel file) is NOT a full backup.** It is a readable
copy of six sheets (students, classes, results …) for people. It cannot be restored into the
platform. The roster backup (Admin → Roster → Clean → “Download backup (JSON)”) is only a safety
copy of the students being deleted; it leaves out rows the platform rebuilds from the answers.

## 2. Check that Aiven backs up the database (once, then every term)

1. Sign in to the Aiven console → your MySQL service → **Backups**.
2. Check that backups are listed for every day, and note the **retention** (how many days are
   kept). It depends on the Aiven plan (for example, Startup plans keep a few days, Business plans
   longer). For a school, at least **14 days** is recommended; upgrade the plan if it is shorter.
3. Check that **point-in-time recovery (PITR)** is available on the plan. PITR lets you restore
   the database as it was at any minute inside the retention period (for example, just before a
   wrong import).
4. Write the retention and the date you checked into the school's IT log.

## 3. Restore (when something went wrong)

Aiven always restores into a **new** service (a fork). The broken service stays untouched until
you switch, so a restore can be tried safely.

1. Aiven console → the MySQL service → **Backups** → **Fork & restore** (or “Create fork”).
2. Choose the point in time: the newest backup, or a time just before the problem (PITR).
   Give the new service a clear name, e.g. `alanjal-ela-restore-2026-11-03`.
3. Wait until the new service is **Running**. Copy its **Service URI**.
4. Check the restored data before switching: connect with any MySQL client and compare a few
   counts with what you expect, for example:
   ```sql
   SELECT COUNT(*) FROM `User`; SELECT COUNT(*) FROM `Student`;
   SELECT COUNT(*) FROM `QuestionAttempt`; SELECT MAX(createdAt) FROM `QuestionAttempt`;
   ```
5. Render → the web service → **Environment** → set `DATABASE_URL` to the new Service URI
   (keep `?ssl-mode=REQUIRED` / the CA settings exactly as in the old value). Do the same for
   any Render cron job / worker that has its own `DATABASE_URL`.
6. **Manual deploy → Deploy latest commit** (or restart) so the app reads the new value.
7. Sign in as an admin and open a class, a student and the Alerts page. Check that the most
   recent answers you expect are there.
8. Keep the old service for a few days (powered off) in case something is missing, then delete
   it. Tell teachers which time the data was restored to: work done after that time must be
   redone.

## 4. Monthly restore test (do not skip)

A backup that has never been restored is not a backup. Once a month:

1. Fork the database from the newest backup (steps 3.1–3.3), named `…-restore-test`.
2. Run the count queries from 3.4 on the fork and on the live database; the fork's numbers must
   be the live numbers of the backup time (equal or a little lower).
3. Optional, stronger: point a **staging** Render service (not the live one) at the fork and sign in.
4. Delete the fork. Write the date, the counts and “OK” into the IT log.

## 5. Files (logo, uploads, recordings)

If the Render service has a disk attached for `UPLOAD_DIR`, Render takes daily snapshots of the
disk (see Render → Disks). Check the snapshot list there, and restore a snapshot from the same
page. Without a disk, uploads are lost at every deploy: attach a disk, or keep the logo in the
database settings.

## 6. Extra safety copy (recommended)

Once a week (and before every big change such as a roster import at the start of the year),
take a logical dump from a machine with the MySQL client, encrypt it, and keep it off Aiven:

```sh
mysqldump --single-transaction --routines --triggers --set-gtid-purged=OFF --default-character-set=utf8mb4 \
  -h <aiven-host> -P <port> -u <user> -p --ssl-mode=REQUIRED <database> | gzip -9 > alanjal-$(date +%F).sql.gz
gpg --encrypt --recipient "Al-Anjal ELA backups" alanjal-$(date +%F).sql.gz   # the key from DEPLOYMENT.md section 6
```

To restore such a dump: create an empty Aiven service (or database), run
`gunzip -c file.sql.gz | mysql -h … -u … -p <database>`, then follow steps 3.4–3.8.

### 6a. Doing this automatically (`scripts/db/backup-db.sh` + a Render Cron Job)

The command above is now also a script, so it can be run on a schedule instead of by hand:

```sh
DATABASE_URL="mysql://user:pass@host:port/db?ssl-mode=REQUIRED" npm run db:backup
```

It `mysqldump`s the database named in `DATABASE_URL`, gzips it to a timestamped file in `BACKUP_DIR`
(default `./backups`), refuses to call a near-empty dump a success, and prunes local dumps older than
`BACKUP_RETAIN_DAYS` (default 7). See the comments at the top of the script for every setting.

**What it adds on top of Aiven's own backups (section 1–4):** a copy in the plain `mysqldump` / `.sql.gz`
format, kept wherever you point it — useful if you ever want a dump outside Aiven entirely, or a quick
local copy before a risky change, without opening the Aiven console.

**What it does NOT do by itself: keep the dump anywhere durable.** On Render, a Cron Job's disk is thrown
away as soon as the job finishes — without `BACKUP_UPLOAD_CMD` set to a real upload command (to storage
*you* set up: an S3-compatible bucket, Backblaze B2, anything with a CLI), the job proves the database is
dumpable and then discards the file. This repo does not wire up or invent a storage account — choose one,
install its CLI in the job's image if it needs one, and set:

```
BACKUP_UPLOAD_CMD = aws s3 cp --storage-class STANDARD_IA     # example once a bucket + credentials exist
```

**`render.yaml`** (repo root) defines this as a Cron Job named `backup-db`, daily at 02:00 UTC, running
the same Docker image as the scheduled-jobs worker with its command replaced by this script (that image
now also installs the MySQL client, for `mysqldump`). The file is a convenience, not a requirement — the
web service and the jobs worker keep working exactly as before whether or not it is used. To turn the
backup job on:

1. In the Render dashboard, either sync this blueprint (`render.yaml`) or create the Cron Job by hand
   ("New +" → "Cron Job", same repo, Docker, build arg `APP_TARGET=jobs`, command
   `sh scripts/db/backup-db.sh`, schedule `0 2 * * *`).
2. Set `DATABASE_URL` on the job to the same value as the web service's (Render never reads secrets out
   of `render.yaml` — this is always a manual step, by design).
3. Decide where dumps go (see above) and set `BACKUP_UPLOAD_CMD`, or mount a persistent disk at
   `BACKUP_DIR` — otherwise step 1–2 alone only prove the backup runs, they do not keep anything.
4. After the first run, Render → the job → **Logs** shows "Wrote …" and the dump's size, or the exact
   reason it failed (missing `mysqldump`, a bad `DATABASE_URL`, an upload failure).

Until step 3 is done, treat Aiven's own backups (section 1–4) as the only real backup — which, for most
schools, they already are.

## 7. Admin password recovery

There is no “forgot password” e-mail for admins (the platform has no reset-link flow).
If an admin forgets their password:

1. **Another school admin** opens Admin → Users → the admin → **Reset password**. A temporary
   password is shown once; the admin must change it at the next sign-in.
2. If there is **no other admin** who can sign in, someone with access to the database runs
   (from a machine with the project and `DATABASE_URL` set to the live database):
   ```sh
   npm run admin:create -- --school=ALANJAL --username=<new.admin> --name="<Full name>" --email=<email>
   ```
   It creates a new school admin and prints a temporary password once. Sign in with it, then reset
   the old admin's password from Admin → Users (or deactivate that account).
3. Keep **at least two** active school admin accounts, so step 1 is always possible.
