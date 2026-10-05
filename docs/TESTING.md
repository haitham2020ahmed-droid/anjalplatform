# Testing guide

Since Phase 13, CI (`.github/workflows/ci.yml`) runs the unit/integration suite, a full `npm run build`, the dependency audit, migrations on MySQL 8.4, the browser end-to-end tests and the Docker builds on every change.

| Layer | Command | Needs | What it proves | Status at Phase 12 |
|---|---|---|---|---|
| Unit + integration | `npm test` | Node 22 only (in-memory SQLite built from the Prisma schema) | 227 tests (incl. deployment checks): engine, mastery, services, reports, admin, imports, auth, contracts, isolation | **Run: 227 / 227 pass** |
| Contracts + isolation | `npm run test:contracts` | Node | Every page/route/action checks the session; DB unique-key contract; no dangerous patterns; 172 cross-school attacks refused | **Run: pass** (part of `npm test`) |
| Mutation check | `npm run test:mutation` | Node + Python 3 (Git Bash on Windows) | Each of 58 safeguards is protected by a test | **Run: 58 / 58 caught** |
| Type check | `npx tsc -p tsconfig.core.json --noEmit` | Node | Strict types for all framework-free code and tests | **Run: 0 errors** |
| MySQL verification | `npm run db:verify:mysql` | MySQL 8 + `DATABASE_URL` | Schema, indexes and rollup SQL on real MySQL (`docs/PHASE2-RUNBOOK.md`) | Written in Phase 2; **run on your MySQL** |
| End-to-end (browser) | `npm run e2e` | MySQL with demo data, `DEMO_PASSWORD`, `npx playwright install chromium` | 19 browser tests: sign-in and session security, CSP + working interactive pages, student practice (also on a tablet), teacher reports incl. Arabic PDF, admin user creation, question review (four-eyes), roster import, parent access limits | Written and type-checked against Playwright; loaded by the real runner (19 tests). **Needs a run with the app** |
| Engine load | `npm run load:engine` | Node | Per-answer cost and throughput of the real practice services | **Run** (results below) |
| HTTP load | `npm run load:http` | A **staging** deployment with demo data | Page, report and health latency under realistic traffic | **Needs a staging run** |

## End-to-end tests, step by step

```bash
# 1. a fresh database with demo data (never the production database)
npx prisma db push              # creates the tables on this test database (no migration history needed)
npm run db:seed:curriculum
DEMO_PASSWORD='choose-a-demo-password' npm run db:seed:demo

# 2. browsers (once per machine)
npx playwright install chromium

# 3. run: builds the app, starts it, runs the tests, writes e2e-report/
DEMO_PASSWORD='choose-a-demo-password' npm run e2e

# against an existing staging server instead:
E2E_BASE_URL=https://staging.example DEMO_PASSWORD='…' npm run e2e:remote
```

The tests change demo data (they create a student, a question and save the Arabic school
name), so use a demo database. Re-seed for a clean run. Failures keep a trace and a screenshot
in `test-results/`; open `e2e-report/index.html` for the full report.

**Most important on first run:** `auth.spec.ts › interactive components work under the
production Content-Security-Policy`. It confirms security finding F2 (nonce-based CSP) in a
real browser on a production build.

## Load results (engine benchmark, one Node process, in-memory SQLite)

| Students practising at once | Answers | Steady-state per answer (p50 / p95 / p99) | Burst: all first answers at the same instant | Throughput |
|---|---|---|---|---|
| 40 | 344 | 2.2 / 5.7 / 8.3 ms | 56–64 ms | ~370 answers/s |
| 120 | 1,049 | 2.1 / 4.6 / 6.3 ms | 177–188 ms | ~410 answers/s |

Reading the numbers: the application's own work is about **2–3 ms per answer**. The "burst"
row is the worst case where a whole grade presses "Check answer" in the same instant: the last
student waits under 0.2 s on a single process. A school of Al-Anjal's size (Grades 4–6) is far
below this capacity; two app processes behind a load balancer double it.

Not included: network and MySQL latency, page rendering. Measure those on staging with
`npm run load:http` and compare with these targets:

| Request | p95 target | Error rate |
|---|---|---|
| Pages (student, teacher, admin) | < 800 ms | < 1 % |
| PDF report | < 3 s | < 1 % |
| `/api/health` | < 100 ms | 0 % |

## After schema changes

`npm run db:keys` regenerates the unique-key map used by both database layers; a test fails
until it matches `prisma/schema.prisma`.
