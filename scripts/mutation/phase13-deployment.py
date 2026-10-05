import subprocess, shutil, os, tempfile
BAK = os.path.join(tempfile.gettempdir(), "ela-mutation.bak")
muts = [
 ("web image runs as root", "Dockerfile", "USER node\nEXPOSE 3000", "EXPOSE 3000"),
 ("MySQL port published", "docker-compose.prod.yml", "    # no \"ports\": the database is reachable only from the other services", "    ports: [\"3306:3306\"]"),
 ("undocumented compose variable", "docker-compose.prod.yml", "  LOG_LEVEL: ${LOG_LEVEL:-info}", "  LOG_LEVEL: ${LOG_LEVEL:-info}\n  SMTP_PASSWORD: ${SMTP_PASSWORD}"),
 ("secret becomes optional", "docker-compose.prod.yml", "APP_SECRET: ${APP_SECRET:?set APP_SECRET}", "APP_SECRET: ${APP_SECRET:-changeme}"),
 ("web skips migrations", "docker-compose.prod.yml", "      migrate: { condition: service_completed_successfully }\n\n  migrate:", "\n  migrate:"),
 ("app connects as root", "docker-compose.prod.yml", "DATABASE_URL: mysql://ela_app:${MYSQL_APP_PASSWORD:?set MYSQL_APP_PASSWORD}@mysql", "DATABASE_URL: mysql://root:${MYSQL_ROOT_PASSWORD:?set MYSQL_ROOT_PASSWORD}@mysql"),
 ("undocumented app setting", "src/lib/env.ts", "  REPORT_FONT_DIR: z.string()", "  SMTP_HOST: z.string().optional(),\n  REPORT_FONT_DIR: z.string()"),
 ("CI calls missing script", ".github/workflows/ci.yml", "      - run: npm run e2e\n", "      - run: npm run e2e:all\n"),
 ("production env file committed", ".gitignore", ".env.*\n", ""),
 ("schedule ignores Riyadh time", "scripts/jobs/schedule.ts", "const RIYADH_OFFSET_MS = 3 * 3_600_000;", "const RIYADH_OFFSET_MS = 0;"),
 ("digest groups all IPs together", "src/server/monitoring/security-digest.ts", 'failuresByIp.set(r.ip ?? "unknown", (failuresByIp.get(r.ip ?? "unknown") ?? 0) + 1);', 'failuresByIp.set("all", (failuresByIp.get("all") ?? 0) + 1);'),
 ("logs keep secrets", "src/server/monitoring/log.ts", 'REDACT.test(k) ? "[redacted]" : ', ""),
 ("restore may overwrite live DB", "docker/backup/restore.sh", 'if [ "$target" = "alanjal_ela" ] && [ "${3:-}" != "--replace-production" ]; then', 'if false; then'),
 ("restore accepts any DB name", "docker/backup/restore.sh", 'case "$target" in *[!A-Za-z0-9_]*) echo "invalid database name" >&2; exit 2;; esac', ''),
]
for name, f, a, b in muts:
    src = open(f).read(); assert a in src, (name, a[:60])
    shutil.copy(f, BAK); open(f, "w").write(src.replace(a, b, 1))
    r = subprocess.run(["npx", "tsx", "--test", "tests/deployment.test.ts"], capture_output=True, text=True)
    shutil.copy(BAK, f)
    fails = [l for l in r.stdout.splitlines() if l.strip().startswith("# fail")]
    print(("CAUGHT " if fails and fails[-1].split()[-1] != "0" else "MISSED ") + name)
