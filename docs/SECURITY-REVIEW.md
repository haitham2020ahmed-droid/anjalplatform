# Security review (Phase 12)

Scope: the whole application as of Phase 12: authentication, sessions, authorization,
tenant isolation, input and output handling, file uploads, reports, administration,
headers and the data layer. Method: code review of every entry point, automated
contract tests that keep the review true as code changes, a two-school isolation
suite, and mutation checks (each safeguard is broken on purpose; a test must fail).

The platform holds data about children (Grades 4–6), so the standard applied is
"least data, least access, everything audited", in line with Saudi PDPL principles.

## 1. Findings

| # | Severity | Finding | Status |
|---|---|---|---|
| F1 | **High** | **Production-only database failures.** The MySQL repository (`PrismaRepo`) built compound-key names from the *order the keys were written* in each call (`{ studentId, classId }` → `studentId_classId`, which Prisma rejects), and passed non-unique lookups to `findUnique` (rejected by Prisma). The SQLite test repository accepted both, so no test could catch either. A scan found no broken call today, so this was a latent defect. | **Fixed.** `src/server/db/unique-keys.ts`: a key map generated from the schema (`npm run db:keys`); Prisma names are built in schema order whatever the call order; non-unique lookups fail with a clear message. **The SQLite repository now enforces the same contract**, so every test exercises production's rule. A static test scans every `findUnique`/`upsert` in the source (100+ calls). |
| F2 | **High** | **Interactive pages would not work in production.** The production Content-Security-Policy allowed scripts only from `'self'`, but Next.js App Router starts every page with inline scripts. Pages would render, but client components (forms with results, question editor, roster import, upload) would silently do nothing. Development mode allowed inline scripts, so it would not show up before deployment. | **Fixed** with the approach documented by Next.js: middleware creates a 128-bit nonce per request (`src/server/auth/csp.ts`, `src/middleware.ts`); policy `script-src 'self' 'nonce-…' 'strict-dynamic'`, no `unsafe-inline` or `unsafe-eval` in production. The CSP is no longer also sent as a static header (two policies would intersect and block the nonce). **Confirmed by unit test; to be confirmed in a browser** by the end-to-end test "interactive components work under the production Content-Security-Policy". |
| F3 | Medium | `/api/health` was allowed by middleware but never implemented. Container health checks, load balancers, the end-to-end server start and monitoring all depend on it. | **Fixed:** public, reveals only `ok` / `unavailable`, cheap DB check, 503 when the database is down, `no-store`. |
| F4 | Low | Teacher access to a class depended only on the teaching assignment, not also on the school. Not exploitable through the services (they never create cross-school assignments), but one wrong data row would have opened another school's class. | **Fixed** (defence in depth) in `assertClassAccess`; tested by inserting such a row directly. |
| F5 | Info | Test gaps found by mutation checks: the isolation suite first attacked only school B's own records (not "pull B's class into A's records"); no test applied a roster file that still had problems; no runtime test of the repository contract; no test of the F4 check. | **Fixed:** tests added; all 42 mutations across Phases 10–12 are caught. |

No finding was rated critical. No secrets, raw HTML injection, dynamic code, unsafe raw SQL or
process spawning exist in the application code (enforced by `tests/contracts.test.ts`).

## 2. Controls reviewed

| Area | Control | Evidence |
|---|---|---|
| Passwords | scrypt N=2¹⁵, r=8, p=1, 64-byte key, random salt, parameters stored per hash; NFKC normalisation; 10–128 characters; constant-time compare | `src/server/auth/password.ts`, `tests/auth.test.ts` |
| Login | Rate limit per IP and per account+IP; lockout after repeated failures; one generic error message for wrong username or password, with equal timing for unknown usernames (dummy hash) | `src/server/auth/login.ts`; e2e `auth.spec.ts` |
| Sessions | Random token in an HttpOnly, SameSite cookie (`__Host-` prefix in production); only sha256(token) stored; absolute and idle expiry; session version invalidates all sessions on password change, reset or deactivation | `src/server/auth/sessions.ts`, `tests/auth-integration.test.ts`, `tests/admin.test.ts` |
| Temporary passwords | Shown once, stored only hashed, forced change at first sign-in; never written to the audit log (tested) | `src/server/admin/users.ts`, `roster-import.ts` |
| CSRF | Server actions: Next.js origin check; POST routes: `assertSameOrigin`; SameSite cookies; logout is POST-only | `tests/contracts.test.ts` (every state-changing route checks the origin) |
| Authorization | Role permissions (`rbac.ts`) plus row-level checks in every service (student, class, school). Every page, API route and server action checks the session; deliberate exceptions are listed with reasons | `tests/contracts.test.ts` |
| Tenant isolation | 172 cross-school calls by school A's admin, teacher, parent and student against school B's ids, in both directions, all refused; B's data unchanged; B's admin unaffected | `tests/isolation.test.ts` |
| Not found = forbidden | Report and template routes answer 404 for both, so ids cannot be probed | `src/app/api/reports/route.ts` |
| Output encoding | React escaping in pages; reports use an escaping template tag; Excel text written as inline strings (never formulas); CSV formula-injection defence; names stripped of control and bidi-override characters | Phase 10–11 tests |
| Uploads | Size limits (server actions 4 MB, logo 1 MB, roster 3,000 rows, imports per env); real type detection (not the file name); SVG with scripts refused; files are parsed, never served back raw; roster import requires the previewed file (SHA-256) | `src/reports/logo.ts`, `src/server/admin/roster-import.ts` |
| SSRF | The server never fetches user-supplied URLs (remote logo URLs are refused) | `src/reports/logo.ts`, `tests/reports.test.ts` |
| PDF engine | JavaScript disabled, every network request aborted, bounded concurrency with a "busy" answer, render timeout | `src/reports/pdf.ts`, `tests/reports.test.ts` |
| Abuse limits | Report exports rate limited per user; PDF queue bounded | `src/server/reports/service.ts` |
| Headers | CSP with nonce (above), HSTS (production), X-Frame-Options DENY + `frame-ancestors 'none'`, nosniff, Referrer-Policy, Permissions-Policy, COOP | `src/server/auth/http.ts`, `csp.ts` |
| Audit | Sign-ins, password resets, every admin change (before/after), question workflow, report exports (metadata only, never content), imports | `src/server/audit.ts` |
| Privacy | Group averages hidden below 5 students; parents see only linked children; students cannot export; MAP values shown as imported, never converted; demo data labelled and isolated | Phases 8–11 tests |
| Configuration | Environment validated at start-up; `.env` ignored by git; the example file has empty secrets (tested) | `src/lib/env.ts`, `tests/contracts.test.ts` |

## 3. Recommendations (not done in Phase 12)

| # | Priority | Recommendation | Where |
|---|---|---|---|
| R1 | High | Dependency vulnerability scanning on every build. | **Done in Phase 13:** `npm audit --omit=dev --audit-level=high` in CI; Dependabot weekly |
| R2 | High | Run the end-to-end suite against a production build before the first deployment. It confirms F2 in a real browser. | **Automated in Phase 13:** CI `e2e` job on every change (standalone build, MySQL 8.4) |
| R3 | Medium | Two-factor sign-in for school admins (they can see every student). | future |
| R4 | Medium | Encrypted, off-site backups with a tested restore, and an agreed retention period for audit logs and student data (PDPL). | **Backups done in Phase 13** (public-key encrypted, checksums, restore script, monthly restore test in `docs/DEPLOYMENT.md`); off-site copy and retention period are school decisions |
| R5 | Medium | Alerts for repeated denied access, lockouts, bulk exports and new admins. | **Done in Phase 13:** daily security digest + webhook; JSON logs; health and heartbeat monitoring. Central log collection optional |
| R6 | Low | Rate-limit admin-heavy actions (roster import, logo upload). Admin-only, so low risk today. | future |
| R7 | Low | A short privacy notice for parents, in Arabic and English, describing what is stored and why. | school policy |

## 4. Keeping this review true

- `npm test` includes the contract and isolation suites: a new page, route or server action
  without a session check, a non-unique lookup, raw HTML, or a cross-school leak fails the build.
- `npm run test:mutation` re-runs the 42 mutation checks (needs Python 3; on Windows use Git Bash).
- After any schema change: `npm run db:keys` (a test fails until the key map is regenerated).
