# Al-Anjal Adaptive ELA Platform

An adaptive English learning platform for Grades 4–6 (Wonders G4/G5, StudySync G6), designed so that Grades 1–12 can be added later as data, not code.

- **Architecture, ERD, permissions, algorithms, roadmap and risks:** [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- **Data model:** [`prisma/schema.prisma`](prisma/schema.prisma)
- **School curriculum (normalized):** [`data/curriculum/`](data/curriculum/) (see `PROVENANCE.md`)

## Status: All 13 phases complete · 227 tests · deploy with `docs/DEPLOYMENT.md` (Vercel: see its section 10) · Phase 2 verified offline (MySQL run: `docs/PHASE2-RUNBOOK.md`)

| Piece | Location | Verified |
|---|---|---|
| Adaptive engine (2PL/Rasch/3PL, EAP ability, step-limited selection, prerequisite routing, decision log) | `src/adaptive/` | tests + strict typecheck |
| Mastery algorithm (weighted, evidence-gated, decay) | `src/mastery/` | tests + strict typecheck |
| Platform Reading Level (internal, not Lexile) | `src/reading/` | tests |
| Explainable recommendations | `src/recommendations/` | tests |
| RBAC + row-level scope | `src/server/auth/rbac.ts` | tests |
| Password hashing (scrypt) | `src/server/auth/password.ts` | tests |
| Curriculum normalization + import planner | `scripts/normalize/`, `src/imports/curriculum/` | tests on the real data (0 errors) |
| Official CCSS text (254 Grade 4–6 standards) parsed from the school's standards PDF | `data/curriculum/ccss-standards.json` | every code validated |
| Original question bank: 229 items, 14 passages, all 7 levels, 8 types | `data/questions/` | build validator + tests |
| Question validator and scoring rules | `src/imports/questions/` | tests |
| Shared seeders (Prisma + SQLite adapters), idempotent | `src/server/seeding/`, `prisma/seed/` | full offline database verification |
| Analytics summary tables, nightly rollups, 9 dashboard queries | `src/analytics/`, `database/sql/analytics/` | benchmarked at 310k answers |
| Offline database verification (15 checks) | `scripts/db/verify.ts` → `database/verify/REPORT.md` | all pass |
| Authentication, sessions, roles, password reset, audit, CSRF, security headers | `src/server/auth/`, `src/app/` | 28 security tests on a real DB + mutation check |
| Student flow (grade → book → units → skill cards) and curriculum editor | `src/server/queries/`, `src/server/curriculum-admin.ts`, `src/components/curriculum/`, `src/app/` | 12 tests + mutation check; rendered preview |
| Adaptive practice: sessions, server-side scoring and timing, feedback, 8 question types | `src/server/practice/`, `src/components/practice/`, `src/app/practice/` | 17 tests + mutation check; rendered preview |
| Placement check, item statistics and flags, calibration job | `src/adaptive/diagnostic.ts`, `src/server/assessment/`, `src/analytics/item-analysis.ts`, `src/server/jobs/` | 12 tests incl. simulation studies + mutation check |
| Teacher dashboard: classes, KPIs, groups, heat map, assignments, intervention alerts, student audit trail | `src/server/teacher/`, `src/components/teacher/`, `src/app/teacher/` | 13 tests + mutation check; rendered preview |
| Analytics: growth, comparisons (privacy-suppressed), benchmark rule, standards report, student metrics | `src/analytics/`, `src/server/analytics/`, `src/components/analytics/`, `src/components/charts/` | 11 tests + mutation check; rendered preview |
| MAP / external results import (CSV/XLSX) with review and error report; MAP-vs-platform comparison | `src/imports/`, `src/server/imports/`, `src/app/admin/imports/`, `src/app/api/imports/` | 13 tests + mutation check |
| Deployment: Docker images (web, jobs, backup), production compose with HTTPS, CI (tests, audit, MySQL migrations, browser tests, Docker builds), Dependabot, encrypted backups + restore, scheduler, health checks, security digest, first-admin command | `Dockerfile`, `docker-compose.prod.yml`, `docker/`, `.github/`, `scripts/jobs/`, `src/server/monitoring/`, `docs/DEPLOYMENT.md` | 12 tests + 14-point mutation check |
| Testing and security: contract tests (session checks everywhere, DB key contract), two-school isolation suite, nonce-based CSP, health check, 19 browser tests, load benchmark, security review | `tests/contracts.test.ts`, `tests/isolation.test.ts`, `tests/e2e/`, `scripts/load/`, `docs/SECURITY-REVIEW.md`, `docs/TESTING.md` | 210 tests; 42/42 mutations caught |
| Administration: users, bulk user import (CSV/XLSX), calendar, classes, report branding, engine settings, question editor and review workflow | `src/server/admin/`, `src/app/admin/` | 22 tests + 16-point mutation check |
| Downloadable reports (student, class, standards, school) in English or Arabic (RTL) as PDF, Excel and CSV, with school logo; parent report page | `src/reports/`, `src/server/reports/`, `src/app/api/reports/`, `src/components/reports/`, `src/app/parent/` | 25 tests + mutation check; PDFs inspected visually; XLSX verified with openpyxl |
| MySQL verification, ops SQL, backups | `scripts/db/verify-mysql.ts`, `database/sql/ops/` | run on the server |

## Getting started (developer machine)

```bash
# 1. Requirements: Node 20.11+, Docker (or a MySQL 8 server)
npm install

# 2. Configure secrets
cp .env.example .env            # fill in DATABASE_URL, APP_SECRET, DEMO_PASSWORD
export MYSQL_APP_PASSWORD=... MYSQL_ROOT_PASSWORD=...
docker compose up -d mysql

# 3. Database
npx prisma validate
npm run db:migrate -- --name init
npm run db:seed:curriculum      # real school curriculum (idempotent)
npm run db:seed:questions       # original question bank (imports as UNDER_REVIEW)
npm run db:seed:demo            # optional, development only — [DEMO]-labelled

# 4. Reports (PDF needs Chromium once per machine / image)
npm run reports:browser         # installs Playwright's Chromium for PDF reports
npm run reports:preview         # optional: sample reports from demo data → ./report-preview

# 5. Checks
npm test                        # domain tests (node:test via tsx)
npm run db:verify:mysql         # database checks against your MySQL
npm run typecheck               # full project (needs node_modules)
```

## Testing approach

Domain tests use Node's built-in `node:test` runner through `tsx`, which keeps them at zero extra dependencies and fast enough to run on every commit. Database integration tests (Phase 2) and Playwright end-to-end tests (Phase 12) are added as their phases land.

## Data rules

- Internal metrics (mastery, theta, PRL) are never labelled as MAP, IXL or Lexile values.
- Official MAP, Lexile and IXL values only come from imported, authorised files.
- Publisher passages and test items are not imported. The question bank comes from school-owned booklets and teacher-reviewed items.
- Reports show internal measures and imported MAP values side by side, labelled, never converted.
- Arabic reports translate the report's own words; skill names and standards stay in English, as in the curriculum.
- Demo content is isolated under a demo school, uses `DEMO` codes and `[DEMO]` stems, and is refused in production.
