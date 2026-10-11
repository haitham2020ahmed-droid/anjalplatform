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
