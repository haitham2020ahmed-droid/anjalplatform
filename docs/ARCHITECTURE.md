# Al-Anjal Adaptive ELA Platform — Architecture (Phase 1)

Status: **Phase 1 complete**: architecture, data model, domain core, curriculum import and tests.
Each major decision is followed by *Why*. Where I chose differently from the brief, the trade-off is stated.

---

## 0. What already existed (inspection results)

There was **no existing code project**. The "existing data" is the 33 documents the school uploaded. I inspected all of them and normalized what can legally be reused into `data/curriculum/`:

| Source (uploaded) | Used for | Imported as |
|---|---|---|
| Wonders Reading/Writing Companion G4 (files 90–92), G5 (93–95) | Units, text sets, genres, comprehension skills, strategies, text features, vocabulary strategies, author's craft, writing projects | `Unit`, `Lesson` (= text set), `Skill`, `LessonSkill` |
| Wonders Practice Books G4 (57), G5 (59) | 180 grammar/mechanics topics with rule summaries; 60 weekly spelling lists (20 core + 3 review + 2 challenge) | `Subskill.content.rules`, `Subskill.content.wordList` |
| Progress Monitoring G4 (88), G5 (87) | Which skills each text-set test assesses (focus labels only) | `Lesson.metadata.assessedFocus` |
| IXL alignment PDFs (Wonders G4/G5, StudySync G6) | 619 external skill names/codes mapped to platform skills | `ExternalSkillRef`, used only to match imported IXL reports. No IXL content is copied. |
| MAP skills documents (Reading/Language, Terms 1–2) | Goal-area names, CCSS codes, continuum statements | `MapGoalArea`, `Standard` |
| G6 StudySync booklets, G6 Grammar booklet, Glencoe G6 TE | Grade 6 unit/selection structure, grammar sequence | Grade 6 `Unit`, `Lesson`, `UnitSkill` |
| **CCSS ELA standards document** (ADA-compliant PDF) | Official wording of 254 Grade 4–6 standards (RL, RI, RF, W, SL, L); validates every code used by skills and questions | `Standard.description` via `data/curriculum/ccss-standards.json` |
| Placement & Diagnostic (10_2) | Hasbrouck–Tindal oral reading fluency norms (published research, cited) | `BenchmarkReference` candidate (fluency) |
| School-made booklets (Literature G4/G5/G6, MAP practice G4/G5, Reading Skills G6) | **Content the school owns**: the first real question bank, once keys are written and reviewed | `Question` with `origin = SCHOOL_BOOKLET` (Phase 5) |

**Result:**

- 3 curricula, 18 units, 78 lessons
- 76 cross-grade skill families, 113 CCSS codes (all verified against the official text), 10 MAP goal areas
- an original question bank of 229 items and 14 passages (see §M)
- a prerequisite graph covering both within-grade and cross-grade links
- 619 IXL references, 0 unmapped

The tests validate all of it with **0 errors**.

> ✓ Edition **confirmed: Wonders 2023** (Grades 4–5). `Book.edition` = "2023".

> ⚠ Copyright: McGraw Hill passages and test items (Companions, Progress Monitoring, Benchmark) are **not** imported as questions. Only structure and metadata are imported. The question bank is built from school-owned booklets plus teacher-authored items.

---

## A. System architecture

```
┌──────────────────────────── Next.js (App Router, TypeScript) ────────────────────────────┐
│  UI: React Server + Client Components, Tailwind, shadcn/ui, Recharts                      │
│   /student  /teacher  /admin  /parent  /practice/[skillId]                                │
│                                                                                            │
│  Server layer: Server Actions (mutations) · Route Handlers /api/* (imports, exports)      │
│     every entry point: requireActor() → assertCan() → assertStudentAccess() → zod parse  │
│                                                                                            │
│  Domain core (framework-free, unit-tested):                                               │
│     adaptive/ (IRT, EAP, selector, engine) · mastery/ · reading/ · recommendations/       │
│     imports/ · analytics/ · reports/                                                      │
│                                                                                            │
│  Data access: Prisma Client (parameterised queries) ─────────────► MySQL 8 (utf8mb4)      │
└────────────────────────────────────────────────────────────────────────────────────────────┘
   Background worker (same codebase): imports, item statistics, nightly ability snapshots,
   report generation, intervention scans. Job queue = status tables (no Redis needed yet).
```

**Why a modular monolith:**

- **One deployable.** A school IT team runs a single application.
- **One transaction boundary.** An answer updates the attempt, theta, mastery and log atomically.
- **Room to split later.** Domains are separated by folder and pure interfaces, so the adaptive engine, for example, can be extracted into its own service without a rewrite.

**Why the domain core is framework-free:** the engine and mastery rules are the heart of the product. Keeping them pure has three benefits:

- they are tested without a database
- the background worker can reuse them for re-scoring
- they can be audited line by line

**Why database-backed jobs instead of Redis/BullMQ:** at hundreds to low thousands of students, job volume is modest. A status table with `SELECT … FOR UPDATE SKIP LOCKED` (MySQL 8) is enough and removes an operational dependency. Switch to BullMQ if volume demands it.

## B. ERD (core)

```mermaid
erDiagram
  School ||--o{ Grade : has
  School ||--o{ AcademicYear : has
  AcademicYear ||--o{ Term : has
  Grade ||--o{ Curriculum : uses
  Book ||--o{ Curriculum : "instance of"
  Curriculum ||--o{ Unit : contains
  Unit ||--o{ Lesson : contains
  Curriculum ||--o{ Skill : defines
  SkillFamily ||--o{ Skill : "grade instance"
  Skill ||--o{ Subskill : has
  Lesson }o--o{ Skill : LessonSkill
  Unit }o--o{ Skill : UnitSkill
  Skill }o--o{ Standard : SkillStandard
  Skill }o--o{ Skill : SkillPrerequisite
  SkillFamily }o--|| MapGoalArea : "maps to"
  Skill ||--o{ Question : "question bank"
  Question }o--|| QuestionType : is
  Question }o--o| ReadingPassage : uses
  Question ||--o{ QuestionOption : has
  Question ||--o{ QuestionExplanation : has
  Student ||--o{ PracticeSession : runs
  PracticeSession ||--o{ QuestionAttempt : records
  Student ||--o{ StudentSkillMastery : "internal mastery"
  Student ||--o{ StudentAbility : "internal theta"
  Student ||--o{ AdaptiveDecisionLog : audited
  Student ||--o{ MapResult : "imported official"
  Student ||--o{ ExternalAssessmentResult : imported
  Class ||--o{ ClassMembership : has
  Class }o--o{ Teacher : ClassTeacher
  Class ||--o{ Assignment : has
  Parent }o--o{ Student : ParentStudent
```

## C. Data model

The full schema is in `prisma/schema.prisma`: 61 models and 16 enums, with every relation statically checked for its back-relation. Key choices:

- **A Skill is grade-specific; a SkillFamily is the cross-grade concept.**
  - Mastery is tracked per student × skill.
  - The family links Grade 4 Theme → Grade 5 Theme → Grade 6 Theme (the learning continuum) and maps the concept to a MAP goal area.
  - *Why:* Wonders teaches Theme in Units 2, 4 and 6. Tracking it as one skill avoids three disconnected mastery scores.
- **A Lesson is a Wonders text set or a StudySync selection.** It links to skills through the many-to-many `LessonSkill`, whose role is one of: comprehension skill, strategy/feature, vocabulary strategy, author's craft, grammar or spelling.
- **Question types are rows (`QuestionType`), not an enum.** Type-specific data lives in `Question.content`, validated per type by zod. *Why:* adding a new format needs no migration.
- **Every item carries IRT parameters:** `irtA`, `irtB`, `irtC` and `calibrated`. The authoring level (1–7) seeds `b` from −2.25 to +2.25, and a calibration job later re-estimates it from response data.
- **Internal and official data never share a column.**
  - Internal: `StudentSkillMastery`, `StudentAbility`, `ReadingPassage.platformReadingLevel`.
  - Imported only: `MapResult`, `OfficialReadingMeasure`, `ExternalAssessmentResult`, `BenchmarkReference`.
- **Ids:**
  - Entities use cuid strings, which are safe in URLs and easy to merge during imports.
  - High-volume event tables (`QuestionAttempt`, `AdaptiveDecisionLog`, `AuditLog`, `XpEvent`, `AbilitySnapshot`) use `BigInt` autoincrement, for compact clustered indexes and fast time-range scans.
- **Analytics indexes match the dashboard queries**, for example `(studentId, skillId, createdAt)`, `(questionId, createdAt)`, `(skillId, band)` and `(classId, dueAt)`.
- **Soft delete** (`deletedAt`) applies to editable content, never to logs.
- **Sessions** use the platform's own `Session` table; see §E.

## D. Pages and routes

| Area | Routes |
|---|---|
| Public | `/login`, `/logout`, `/forgot` (admin-mediated reset for students) |
| Student | `/student` (dashboard), `/student/grade/[grade]`, `/student/unit/[unitId]` (skill cards), `/practice/[skillId]` (focused practice), `/student/progress`, `/student/badges`, `/student/assessments/[id]` |
| Teacher | `/teacher`, `/teacher/classes/[classId]`, `/teacher/students/[studentId]`, `/teacher/assignments` (+ `/new`), `/teacher/reports`, `/teacher/interventions`, `/teacher/skills/[skillId]`, `/teacher/questions` (bank and item analysis), `/teacher/adaptive-log/[studentId]` |
| Admin | `/admin`, `/admin/schools`, `/admin/years`, `/admin/classes`, `/admin/users`, `/admin/curriculum` (books → units → lessons → skills, prerequisites), `/admin/standards`, `/admin/questions` (editor: draft, preview, publish, archive, duplicate), `/admin/imports` (+ `/[jobId]` preview and errors), `/admin/settings/engine`, `/admin/audit` |
| Parent | `/parent`, `/parent/child/[studentId]` |
| API (route handlers) | `/api/imports/*` (upload, validate, confirm), `/api/reports/[type]?format=pdf\|xlsx\|csv`, `/api/practice/*` (answer, next; usable by a mobile app later), `/api/search` |

Mutations use **Server Actions**, which include same-origin CSRF protection. File uploads and downloads use **Route Handlers**.

## E. Roles and permissions

Permissions are enforced in `src/server/auth/rbac.ts`. This table is generated from that code:

| Permission | SUPER_ADMIN | SCHOOL_ADMIN | TEACHER | STUDENT | PARENT |
|---|:-:|:-:|:-:|:-:|:-:|
| `curriculum:read` | ✓ | ✓ | ✓ | ✓ | — |
| `curriculum:edit` | ✓ | ✓ | — | — | — |
| `questions:read` | ✓ | ✓ | ✓ | — | — |
| `questions:edit` | ✓ | ✓ | ✓ | — | — |
| `questions:publish` | ✓ | ✓ | — | — | — |
| `practice:take` | ✓ | ✓ | — | ✓ | — |
| `students:read` | ✓ | ✓ | ✓ | — | — |
| `students:manage` | ✓ | ✓ | — | — | — |
| `teachers:manage` | ✓ | ✓ | — | — | — |
| `classes:manage` | ✓ | ✓ | — | — | — |
| `assignments:create` | ✓ | ✓ | ✓ | — | — |
| `assignments:read` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `reports:read` | ✓ | ✓ | ✓ | — | ✓ |
| `reports:export` | ✓ | ✓ | ✓ | — | — |
| `analytics:class` | ✓ | ✓ | ✓ | — | — |
| `analytics:school` | ✓ | ✓ | — | — | — |
| `imports:run` | ✓ | ✓ | — | — | — |
| `settings:engine` | ✓ | ✓ | — | — | — |
| `adaptive:audit` | ✓ | ✓ | ✓ | — | — |
| `schools:manage` | ✓ | — | — | — | — |
| `audit:read` | ✓ | ✓ | — | — | — |

Row-level scope (`canAccessStudent`):

- **Students:** their own records only.
- **Parents:** their linked children only.
- **Teachers:** students in the classes they teach, within their school.
- **School admins:** their own school.
- **Super admin:** everything.

These rules are covered by tests in `tests/core.test.ts`.

**Auth decision (a deviation from "use a modern auth library"):** the platform uses its own database-backed sessions.

- **Session cookie:** a random 256-bit token in an `HttpOnly; Secure; SameSite=Lax` cookie. Only its SHA-256 hash is stored, so a database leak cannot be replayed as live sessions.
- **Expiry:** both an idle timeout and an absolute timeout.
- **"Log out everywhere":** bumping `sessionVersion` revokes all of a user's sessions.
- **Passwords:** hashed with scrypt, which is built into Node and needs no native dependencies.
- **Brute-force protection:** login rate-limiting and account lockout.

*Why:* as far as I know, Auth.js v5 is still pre-release, and its credentials provider forces JWT sessions, which can't be revoked server-side. A school needs instant revocation, for example for a lost device or a student who moves.

*Trade-off:* no OAuth out of the box. Google or Microsoft single sign-on can be added later on the same session table.

## F. Adaptive algorithm (`src/adaptive/`)

1. **Item model.** The default is 2PL: `P = c + (1−c)/(1+e^(−a(θ−b)))`. Each school can switch to Rasch or 3PL. The authoring level seeds `b = (level−4) × 0.75`.
2. **Ability estimate.** After every answer, θ for the student × skill is re-estimated by **EAP** over the full skill history. It uses a 0.05 grid in [−3, 3] with a normal prior. The prior starts at grade level (0), or at the student's domain θ once that is known.
   - *Why EAP:* maximum likelihood gives an infinite estimate for an all-correct record, which is the common case for new learners. EAP stays stable and also provides a standard error, used as confidence.
3. **Evidence weighting.**
   - A rapid guess counts 0.2. A rapid guess is an answer faster than max(2.5 s, 12% of the item's expected time).
   - A hinted answer counts 0.5.
   - Slow answers are not penalised; slowness is surfaced to teachers instead.
4. **Smoothness.** θ may move at most 0.6 per response, and the *target difficulty* at most 0.4 between consecutive items. This prevents sudden jumps.
5. **Selection.**
   - Practice targets **about 72% success**, using `b = θ − logit(0.72)/a`.
   - Diagnostics target 50% success, where an item gives the most information.
   - Items are not repeated within 25 questions.
   - The next item is picked at random from the top 3 candidates (exposure control).
6. **Prerequisite routing.** After 3 consecutive errors, if a prerequisite skill is below its `minimumMastery`, the engine routes the student to the most important weak prerequisite.
7. **Traceability.** Every step returns an `AdaptiveDecisionLog` record containing:
   - previous and new θ, and the standard error
   - item b, correctness and response time
   - mastery before and after
   - the next item and its target b
   - a human-readable reason, a reason code and the engine version
8. **Calibration (Phase 6).** Once an item has 200 or more responses, a nightly Rasch/2PL calibration updates `b` (and `a`), shrinking toward the authored level, and sets `calibrated = true`.

Tests verify that:

- a correct streak raises difficulty gradually
- errors lower it gradually
- every step stays within the caps
- every decision carries an explanation

## G. Mastery (`src/mastery/mastery.ts`)

```
raw      = 0.8·Ability + 0.15·RecentAccuracy + 0.05·Consistency
evidence = 1 − exp(−effectiveN / 4)
score    = 100 · raw · evidence · decay      → then evidence gates
```

**Components:**

- **Ability:** the confidence-adjusted ability θ − SE, mapped to 0–1 so that θ − SE = +1.0 → 0.90 (Mastered) and +0.3 → 0.78 (Proficient). Ability dominates because adaptive practice holds every student near 72% success, so raw accuracy alone cannot separate strong from weak students (see Phase 2 simulation).
- **RecentAccuracy:** weighted for recency (half-life of 6 answers) and difficulty. A wrong answer on a hard item costs less than one on an easy item.
- **Consistency:** penalises streaky right/wrong patterns.
- **effectiveN:** counts only independent evidence; rapid guesses count 0.2 and hinted answers 0.5.

**Gates (configurable):**

- **Proficient** requires at least 8 independent answers.
- **Mastered** requires at least 15 independent answers, a correct answer at level 5 or higher, and at least 60% accuracy on the last 10 (80% was unreachable under adaptive targeting).

**Decay:** after 30 idle days the score drops 2% per week, down to a floor of 85% of the earned score, so the skill resurfaces as "needs review".

**Bands:**

| Score | Band |
|---|---|
| 0–39 | Beginning |
| 40–59 | Developing |
| 60–74 | Approaching |
| 75–89 | Proficient |
| 90–100 | Mastered |

All thresholds live in `SchoolSetting["mastery.thresholds"]` and are validated by `resolveEngineConfig`.

Tests confirm that:

- 2 easy correct answers → Beginning
- 25 easy correct answers → not Mastered
- rapid clicking → below 75
- sustained correct work up to levels 6–7 → Mastered
- a streaky record scores lower than a steady one

*Calibration note:* the first evidence scale (7) left an 18-answer flawless record at Proficient (86). The scale was tuned to 4 and re-tested.

## H. Analytics architecture

- **Write path.** Each answer writes a `QuestionAttempt` and an `AdaptiveDecisionLog`, and upserts `StudentAbility` and `StudentSkillMastery`, all in one transaction.
- **Read path.** Dashboards read pre-aggregated tables. Heavy aggregates (class, grade, school, standards, item analysis) are built by nightly and on-demand jobs into summary tables (`QuestionStats`, `AbilitySnapshot`, and later `ClassSkillDaily`).
- **Growth.** A daily `AbilitySnapshot` stores θ and mastery per scope. Monthly, term and yearly deltas come from these, using date-range filters on the indexed `takenOn` column.
- **Benchmarks.** Class, grade and school averages are computed internally. District and national values are shown **only** from `BenchmarkReference` rows with a cited source. Otherwise the UI shows "National benchmark data not available."
- **Item analysis.** The job computes p-value, point-biserial, distractor counts and average time, then flags:
  - too easy (p > 0.95)
  - too hard (p < 0.2)
  - a distractor never chosen after 50 attempts
  - negative discrimination
- **Intervention scan.** Rules raise an `InterventionAlert` with evidence when they detect:
  - accuracy below 60%
  - repeated errors
  - declining mastery
  - slow responses
  - 3 or more failed sessions
  - prerequisite gaps

## I. Existing-data migration and import strategy

1. **Normalize (done).** `scripts/normalize/build_curriculum.py` turns the extracted documents into canonical JSON: deterministic keys, keyword-based skill-family mapping, the prerequisite graph, and IXL and MAP references. It can be re-run.
2. **Validate (done and tested).** `src/imports/curriculum/plan.ts` builds an upsert plan, de-duplicates skills per curriculum and reports unknown codes. It finds 0 errors on the real data.
3. **Load.** `npm run db:seed:curriculum` upserts everything by natural key. It is idempotent, never deletes, and is safe to re-run after teachers have made edits.
4. **Question bank.** Phase 5 imports the school-owned booklet items through the same bulk-import pipeline as teacher CSVs:
   - validate rows
   - preview
   - detect duplicates
   - confirm
   - produce an error report

   Teachers review keys and explanations before an item becomes `PUBLISHED`.
5. **MAP and IXL data.** These are imported only from authorised CSV/XLSX exports into `MapResult` and `ExternalAssessmentResult`. They are matched to platform skills through `MapGoalArea` and `ExternalSkillRef`.

## J. Development roadmap

| Phase | Scope | Status |
|---|---|---|
| 1 Architecture | Architecture, schema, domain core (adaptive, mastery, PRL, recommendations, RBAC, passwords), curriculum normalization and import, tests | **Done** |
| 2 Database | Schema finalized (63 models), seeders, summary tables, rollups, dashboard SQL, offline verification on a real SQL engine, MySQL runbook | **Done offline**; final run on MySQL: `docs/PHASE2-RUNBOOK.md` |
| 3 Auth & roles | Sessions, login/logout, rate limit, lockout, password change/reset, actor scopes, audit, CSRF, security headers, Next.js wiring | **Done** (core tested on a real DB; Next.js pages need the framework installed) |
| 4 Curriculum UI | Grade → book → unit → skill cards (student); curriculum admin editor | **Done** (queries and editor tested on a real DB; components rendered with React for the preview) |
| 5 Practice system | Practice sessions wired to the adaptive engine, 8 question-type renderers, feedback panel | **Done** (service tested on a real DB; UI rendered for the preview) |
| 6 Adaptive engine | Placement check, item statistics and quality flags, calibration job (engine wired in Phase 5) | **Done** (algorithms validated by simulation; services tested on a real DB) |
| 7 Teacher dashboard | Classes, KPIs, groups, heat map, assignments, intervention alerts, student profile with adaptive audit trail | **Done** (services tested on a real DB; screens rendered for the preview) |
| 8 Analytics | Growth (monthly/term/semester/year/custom), comparisons with privacy suppression, benchmark rule, standards report, student analytics (§11) | **Done** (tested on a real DB; screens rendered for the preview) |
| 9 External data | MAP Growth and other results import (CSV/XLSX): validate → preview → confirm, duplicates, error report; MAP-vs-platform comparison | **Done** (tested on a real DB with independent Excel fixtures) |
| 10 Reports | Student, class, standards and school reports in English or Arabic (RTL) as PDF, XLSX and CSV, with the school logo; permissions, audit, rate limit; parent page | **Done** (tested on a real DB; PDFs rendered with Chromium and checked visually; XLSX verified with openpyxl) |
| 11 Admin | Users, bulk import, settings, question editor workflow | **Done** (tested on a real DB; 16-point mutation check) |
| 12 Testing & security | Database integration tests, Playwright end-to-end tests, security review, load test | **Done** (210 tests, 42/42 mutations; e2e and HTTP load written, to run on a real deployment) |
| 13 Deployment | Docker image, CI, backups, monitoring | **Done** (configuration validated and tested; Docker build and first deploy to run on the school's server) |

## K. Folder structure

```
alanjal-adaptive-ela/
├─ docs/ARCHITECTURE.md
├─ assets/fonts/              report fonts (DejaVu Sans, bundled; licence included)
├─ data/curriculum/           normalized school curriculum (seed input) + PROVENANCE.md
├─ prisma/schema.prisma       full data model
├─ prisma/seed/               curriculum.ts (real data), demo.ts (DEMO only)
├─ scripts/normalize/         curriculum normalization pipeline
├─ scripts/                   print-permission-matrix.ts (docs generator)
├─ src/
│  ├─ app/                    Next.js routes (Phase 3+)
│  ├─ components/             shared UI (shadcn/ui based)
│  ├─ features/               feature modules: practice, dashboards, imports UI
│  ├─ config/engine.ts        engine + mastery defaults, school overrides
│  ├─ types/                  domain types
│  ├─ adaptive/               irt, evidence, selector, engine
│  ├─ mastery/                mastery algorithm
│  ├─ reading/                Platform Reading Level
│  ├─ recommendations/        explainable recommendations
│  ├─ analytics/              Phase 8
│  ├─ reports/                Phase 10: report model, i18n (en/ar), HTML/PDF, XLSX, CSV renderers
│  ├─ server/admin/           Phase 11: users, roster import, settings, question workflow
│  ├─ imports/                curriculum planner; CSV/XLSX importers (Phase 9)
│  ├─ server/auth/            rbac, password, sessions (Phase 3)
│  └─ lib/                    env validation, db client
└─ tests/                     node:test suites
```

## L. Risks and technical issues

1. **Question bank volume is the biggest risk.**
   - A useful adaptive pool needs roughly 30–50 items per skill, spread across levels.
   - With about 70 skills per grade, that is about 2,500–3,500 items per grade.
   - The original bank now has 229 reviewed-ready items; the school booklets add a few hundred more.
   - Plan: import the booklets, add teacher-authored items, and draft more with AI under the `AI_GENERATED → UNDER_REVIEW → APPROVED` workflow.
2. **Copyright.** Publisher passages and test items cannot be bulk-imported. This is handled by importing metadata only and recording an `origin` on every item.
3. **Cold-start calibration.** Item `b` values start from the authored levels, so levels must be authored consistently until items are calibrated. The question editor should include a levelling rubric.
4. **Edition.** Resolved: Wonders 2023.
5. **Data protection.** Student data falls under Saudi PDPL.
   - Prefer in-Kingdom hosting.
   - Keep PII minimal; no national IDs are stored.
   - Use encrypted backups and a defined retention policy.
6. **Build environment for this phase.** There was no network access.
   - The domain core was strictly typechecked and tested.
   - Next.js and Prisma could not be installed, so `prisma validate` and the first migration are the first steps of Phase 2.
7. **Mixed placement signals.** The internal PRL and θ measure different things from an imported MAP RIT score. The UI must show them side by side and never convert one into the other.

## M. Original question bank (added after Phase 1)

Location: `data/questions/` — sources in `src/` (one file per grade + an extreme-levels file), built by `build_bank.py` into `bank.json` and `bank-review.csv` (teacher review sheet), imported by `npm run db:seed:questions`.

| | Grade 4 | Grade 5 | Grade 6 | Total |
|---|---|---|---|---|
| Items | 87 | 72 | 70 | **229** |
| Original passages | 5 | 5 | 4 | **14** |
| Distinct CCSS standards assessed | 35 | 33 | 32 | — |
| Skills with at least one item | 47 / 73 | 39 / 71 | 37 / 47 | — |

- **Types:** multiple choice (192), error correction, sentence ordering, true/false, multiple select, dropdown, matching, fill-in.
- **Levels:** all seven levels in every grade (L1: 9, L2: 18, L3: 36, L4: 64, L5: 57, L6: 35, L7: 10). IRT `b` is seeded from the level; true/false items get `c = 0.25` to model guessing.
- **Feedback:** every item has a "why correct" explanation and a tip, and every distractor has its own rationale (shown when a student picks it).
- **Answer keys** rotate evenly across A–D (48/49/49/46).
- **Status:** every item imports as `UNDER_REVIEW`; a teacher approves it in the question editor before students see it.
- **Validation (build + tests):** official standard exists and matches the item's grade; skill exists in that grade's curriculum; exactly one key for single-answer types; ≥ 2 keys for multi-select; no duplicate options; passages exist.
- **Scoring rules** (`src/imports/questions/validate.ts`): multi-select gives partial credit but zero if any wrong option is chosen (selecting everything earns nothing); fill-in ignores case/spacing; ordering must be exact; matching gives per-pair credit.
- **Reading level:** PRL computed for prose passages only; poetry and drama get no PRL (a prose formula is not valid for them).

Problems the bank-building process caught and fixed in the platform itself:
1. Five taxonomy standard codes did not exist (e.g. Grade 4 spelling is `L.4.2.d`, not `L.4.2.e`; RF ends at Grade 5). Codes are now resolved per grade and validated against the official text.
2. Pronoun and adverb lessons were being filed under Nouns/Verbs ("pronoun" contains "noun"). Fixed with word-boundary matching + regression test.
3. Grade 5 vocabulary strategies taught only in the Practice Book (e.g. Synonyms and Antonyms, U4 W4) were missing; the normalizer now reads Practice Book vocabulary pages too. Grade 6 Unit 2 now includes spelling (StudySync Edit and Publish).
4. Section headings inflated reading levels (no full stop → merged sentences); line breaks are now sentence boundaries.
5. Questions now link directly to the standard they assess (`Question.standardId`), as required by the brief.

## N. Phase 2 — database (results)

Verified offline on SQLite with the schema generated from `prisma/schema.prisma` (same tables, keys, unique constraints and foreign keys). Full report: `database/verify/REPORT.md`. The final MySQL run is a 15-minute checklist: `docs/PHASE2-RUNBOOK.md`.

**What was built**

- **One seeding code path.** The seeders (`src/server/seeding/`) run against a small `Repo` interface, with a Prisma adapter for MySQL and a SQLite adapter for verification. The checks therefore exercise the exact production code.
- **Analytics summary tables.** `StudentDailyActivity` and `ClassSkillDaily` are filled by idempotent nightly rollups (`src/analytics/rollups.ts`, with MySQL and SQLite variants).
- **Nine dashboard queries** in portable SQL (`database/sql/analytics/`), covering:
  - class overview and mastery distribution
  - intervention candidates
  - item analysis and distractor counts
  - growth
  - the adaptive audit trail
  - weak standards
  - school KPIs
- **Operations:** least-privilege MySQL accounts, encrypted backups, a post-setup verification script (`npm run db:verify:mysql`) and a schedulable rollup job.

**Results (all 15 checks pass)**

- **Curriculum:** 18 units, 78 lessons, 191 skills, 439 lesson-skill links, 210 prerequisite links, 254 official standards and 619 IXL references.
- **Question bank:** 229 questions and 14 passages.
- **Re-running every seeder changes nothing**, so all seeds are idempotent.
- **Two schools seeded side by side stay fully isolated.**
- **Simulated term:** 300 demo students practised over 14 weeks (4,400 sessions, about 10,000 answers). Every answer has an explained adaptive decision, 350 rapid guesses were detected and down-weighted, and 815 prerequisite routes were triggered for struggling students.
- **Query speed:** at 310,000 answer rows, every dashboard query uses an index (none full-scans `QuestionAttempt`). All run under 10 ms except item analysis (~160 ms), which belongs in the nightly `QuestionStats` job.
- **Integrity:** 0 foreign-key violations and a clean integrity check.

**Problems found and fixed in Phase 2**

1. **Questions cited standards the database didn't hold.** Questions cite precise sub-standards (e.g. `L.4.1.f`) that were not in the database, because only skill-linked standards were seeded. The database now holds the complete official list (254).
2. **Keys blocked a second school.** `Lesson.code` and `Question.externalRef` were globally unique. They are now scoped per unit and per skill.
3. **The demo school lost its demo flag** if the curriculum seed created it first. Fixed.
4. **Mastery redesign.** Adaptive practice keeps every student near 72% success, so the accuracy-heavy formula left students well above grade level stuck around 68, and the 80% gate made Mastered unreachable.
   - Mastery is now driven by confidence-adjusted ability (θ − SE).
   - The Mastered gate is now 60% recent accuracy.
   - Result: strong students average 86 after 20 answers and weak students 28.
   - All Phase 1 guarantees still hold.

**Engine quality study** (`tests/simulation.test.ts`)

| Item pool | Correlation with true ability | Error (RMSE) |
|---|---|---|
| Full: 60 items per skill, 20 answers | r = 0.91 | 0.42 |
| Today's bank: 3–10 items per skill | r = 0.59 | — |

The algorithm is sound; the bank size is the constraint. Adaptive decisions in the simulation:

- 54% "no item at the target difficulty"
- 17% "pool exhausted"

**Priority:** grow the question bank to about 30–50 items per skill, spread across Levels 1–7.

## O. Phase 3 — authentication, roles and security

The core is framework-free and tested against a real database built from the schema (`tests/auth-integration.test.ts`, 28 tests). Next.js files are thin wrappers around it.

**Files**

| File | Contents |
|---|---|
| `src/server/auth/sessions.ts` | Server-side sessions: hashed tokens, idle and absolute expiry, per-device logout, "log out everywhere" via `sessionVersion` |
| `src/server/auth/login.ts` | Login: generic errors, timing equalization, rate limits, lockout, transparent re-hashing, audit |
| `src/server/auth/passwords-admin.ts` | Password change (verifies the current one, logs out other devices) and scoped staff reset (temporary password, forced change) |
| `src/server/auth/actor.ts` | Builds each request's role and row-level scope from the database |
| `src/server/auth/http.ts` | Cookie settings, same-origin check, security headers |
| `src/server/audit.ts` | Audit log with automatic secret redaction |
| `src/server/auth/next.ts` | `requireActor()` for pages and actions |
| `src/middleware.ts` | Fast redirect when there is no session cookie |
| `src/app/login`, `src/app/change-password`, `src/app/logout` | The sign-in, password-change and sign-out flows |
| `src/app/{student,teacher,admin,parent}` | Guarded role homes (placeholders until Phase 4) |

**Password reset policy**

- **Super admin:** anyone.
- **School admin:** non-super users in their own school.
- **Teacher:** students currently in their own classes only. Grade 4–6 students forget passwords often, so this keeps resets in the classroom.

Every reset issues a readable temporary password (e.g. `Brave-Falcon-4821`), forces a change at next login, logs the user out everywhere and is audited. Denied attempts are audited too.

**Security checklist (brief §31)**

| Requirement | Implementation |
|---|---|
| RBAC | Permission matrix plus row-level scope (`rbac.ts`, `actor.ts`), enforced server-side in every entry point |
| Input validation | zod on every action; length caps before hashing; usernames normalized |
| CSRF | Server Actions (Next.js origin check); POST-only logout with a same-origin check; `SameSite=Lax` cookie |
| XSS | React escaping; strict CSP (`object-src 'none'`, `frame-ancestors 'none'`, no inline scripts in production) |
| SQL injection | Prisma parameterized queries only; raw analytics SQL uses `?` placeholders |
| Rate limiting | Database-backed, per account+IP (8 per 15 min) and per IP (60 per 15 min) |
| Secure cookies | `__Host-` prefix, `HttpOnly`, `Secure`, `SameSite=Lax`; only a SHA-256 of the token is stored server-side |
| Session expiration | 60-minute idle timeout (shared classroom devices), 12-hour absolute limit, instant revocation |
| Password security | scrypt (N=2^15) with per-password salt; ≥10 characters with letters and digits; lockout after 5 failures for 15 minutes; re-hash on login if parameters are weak |
| Audit logging | Logins (success, failure, lockout, rate-limited), password changes, resets, denied resets; secrets redacted |
| Students see only their own records | Tested; teachers limited to current class enrollments (moving a student removes access, tested); parents see only linked children (tested) |

**Verification:** all three deliberate breaks were caught — removing the teacher scope, the session-version check, and the lockout check each made tests fail. The first run exposed that the version check had no direct test; one was added.

## P. Phase 4 — curriculum structure and student flow

**Student flow** (`src/server/queries/student-curriculum.ts`, `src/components/curriculum/`, `src/app/student/`)

- **Grade overview** (`/student`): the book and edition, then six units in order. Each unit shows the stories read, progress (skills at Proficient or above, number mastered), and a "You are here" marker on the current unit.
- **Unit page** (`/student/unit/[unitId]`): skills grouped by kind (Literature, Informational text, Comprehension, Vocabulary, Word study, Grammar, Punctuation & capitals, Spelling, Writing). Each skill card shows:
  - the skill name and the lessons that teach it
  - a five-step mastery meter (Beginning → Mastered, gold when mastered)
  - the score, questions answered and accuracy
  - a Recommended badge with a plain-language reason
  - a Start / Keep practising button, or "Questions coming soon" when the skill has no published questions yet
- **"Up next for you"** pins the top three recommendations.
- **Batched queries:** one round trip per table, with mastery, attempts and accuracy read from `StudentSkillMastery` (no scans of raw answers).
- **Scope:** a unit outside the student's own curriculum is refused.

**Curriculum editor** (`src/server/curriculum-admin.ts`, `src/app/admin/curriculum/`)

- Rename and describe units, add lessons, link and unlink skills to lessons (unit skill lists stay in sync), and edit skill names and descriptions.
- Link standards by official code; the official wording is shown and unknown codes are refused.
- Add and remove prerequisites, with **loop detection**: a skill can never, directly or indirectly, require itself.
- Every edit checks the `curriculum:edit` permission and school scope, and is audited. Nothing is hard-deleted.

**Design**

- **Colours:** the school's palette (navy, teal, gold, purple) on a cool paper background.
- **Typeface:** Lexend, designed to improve reading fluency.
- **One memorable element:** the five-step mastery meter. Everything else stays quiet.
- **Copy:** plain, student-facing language ("It will help with other skills you are practising").

**Tests:** 12 new tests (84 total). Mutation check: disabling the loop guard or the school guard each fails a test.

**Preview:** `scripts/preview/render-student.tsx` renders the real components with a simulated Grade 4 student (demo data). The preview lets demo practice reuse questions, because today's bank has only 3–10 items per skill.

## Q. Phase 5 — student practice

**Service** (`src/server/practice/`)

- **`startPractice`** opens or resumes a session; resuming within 2 hours shows the same question.
- **`submitAnswer`** runs as ONE transaction:
  1. checks ownership
  2. accepts the answer only for the question currently served (replays and double-submits are refused)
  3. validates the response shape for its type
  4. times it on the **server clock**
  5. scores it
  6. runs the adaptive engine
  7. persists the attempt, the decision log (linked by `attemptId`), ability, mastery and XP
  8. picks the next question
- **`endPractice`** closes the session.
- **Session endings:**
  - 20 questions completed
  - every question of the skill answered
  - pool exhausted
  - routed to a weak prerequisite (with a "Practise …" button)
  - the student leaves
- **The browser payload never contains keys, rationales, explanations, accepted answers or ordering keys.** A test checks every published question of every type.

**Feedback.** "✓ Correct!" with a short reinforcement, or "✗ Not quite." showing:

- your answer
- the correct answer
- why it is correct
- why your answer doesn't fit (the option's own rationale)
- a tip

It also shows the mastery change and any XP. A gentle note appears after rapid guesses.

**UI** (`src/components/practice/`)

- **Layout:** skill, progress and mastery meter on top; the question in the centre; the answer area below; the Check / Next button at the bottom. Reading passages sit beside the question on wide screens and above it on phones.
- **Inputs per type:**
  - multiple choice: large radio rows
  - multiple select: checkboxes
  - true/false: two buttons
  - dropdown: inside the sentence
  - fill-in: a typed box inside the sentence
  - ordering: move up/down buttons (keyboard-accessible, not drag-only)
  - error correction: tap the wrong part
  - matching: one menu per item
- Every control has a large tap target, a visible label and keyboard support.

**Changes made while building**

1. **The no-repeat window is now capped at 60% of the pool.** Small pools (3–10 items) kept refusing practice after one question. As a side effect, engine accuracy on the real bank in the Phase 2 simulation rose from r = 0.59 to 0.74.
2. **Fairness rule: a wrong answer never raises mastery.** Extra evidence could lift the score mathematically, and the preview showed 14 → 18 after a mistake.
3. **Displayed mastery continues from the score the student last saw**, so numbers never jump between screens.

**Tests:** 17 new practice/engine tests (101 total). Mutation check: disabling the replay guard, the ownership check or response validation, or leaking the answer key, each fails a test. The leak test was strengthened after it initially missed a multiple-choice leak.

## R. Phase 6 — placement, item quality and calibration

**Placement check** (`src/adaptive/diagnostic.ts`, `src/server/assessment/diagnostic.ts`, `/student/placement`)

- **Measures one ability per area:** Reading, Vocabulary, Grammar, Punctuation & capitals, Writing, and Spelling once there are enough questions.
- **Item choice:** questions are picked for maximum information (≈50% success). Areas rotate, least-measured first; within an area, the least-sampled skill is used. The difficulty step limit still applies.
- **Stopping:** when every area has ≥ 4 questions and SE ≤ 0.5, or at 24 questions. Areas with fewer than 4 approved questions are reported as "not measured yet".
- **Behaves like a test:** no right/wrong marks during the check and no mastery changes. It keeps every practice protection: ownership, current question only, server timing, validation, and no answer data in the browser.
- **Results** (`DiagnosticResult`, an internal estimate, never presented as MAP/RIT):
  - an overall level and a level per area (Below / Approaching / At / Above grade level)
  - strengths and areas to grow
  - "Start with these skills" (current-unit skills in the weakest areas)
  - support skills (building-block prerequisites in areas well below grade level)
- **Practice starts from placement.** Area abilities are stored in `StudentAbility` (`DOMAIN:*`, `GLOBAL`), and a skill with no practice yet begins from its area's placement level. Tested: a weaker student's first practice question is easier.

**Item statistics and flags** (`src/analytics/item-analysis.ts`, nightly `npm run jobs:items`)

- **Statistics per question:** p-value, point-biserial discrimination (against the student's ability *before* answering), average time, distractor counts and rapid-guess rate.
- **Flags:** TOO_EASY, TOO_HARD, LOW / NEGATIVE_DISCRIMINATION, DISTRACTOR_NEVER_CHOSEN, POSSIBLE_KEY_ERROR (strong students prefer a distractor to the key), SLOW, HIGH_RAPID_GUESSING. Each needs a minimum number of answers before it can fire.

**Calibration**

- **Method:** a MAP estimate of difficulty b (and discrimination a), with abilities fixed at their pre-answer values and a prior centred on the authored level.
- **Safeguards:** needs ≥ 200 non-rapid answers, b moves at most 0.5 per run, and every change is audited as `question.calibrate` (old → new, number of answers, reason).

**Validation by simulation**

| Check | Result |
|---|---|
| Placement, 200 simulated students, 4 areas, ≤ 24 questions | per-area r = 0.79–0.82; overall r = 0.91 |
| Calibration: an item authored one level too hard (true b = −0.25) | 0.75 → 0.25 → −0.17 over two runs |
| Wrong answer key planted | flagged as POSSIBLE_KEY_ERROR and NEGATIVE_DISCRIMINATION |

**Fixes made while building**

- **The placement log originally stored each answer's ability *after* the answer.** That would bias calibration, so it now stores the ability before the answer.
- **One mutation test first reported "not caught".** My `sed` pattern hadn't applied; once the mutation was applied correctly, the test caught it.

**Tests:** 12 new (113 total). Mutation check: placement ownership, the calibration step cap and the key-error flag are each caught.

**Scaling note:** the item job currently loads all answers in one pass. That is fine for a school's volume; at district scale, process per question batch.

## S. Phase 7 — teacher dashboard

**Services** (`src/server/teacher/`). Every function checks access first: a teacher reaches only classes they teach and students currently enrolled; an admin reaches their school.

- **`teacherClasses`** lists classes with student counts and open alerts.
- **`classOverview`** returns:
  - **KPIs:** students, active students, questions answered, accuracy, average mastery, practice time, skills mastered, students needing support.
  - **Automatic groups:** Intervention / Developing / On level / Advanced, from the placement check, or average mastery if a student hasn't taken it.
  - **Skills:** skills to reteach (class average below 60) and class strengths (60+); the two lists never overlap.
  - **The class's hardest questions.**
  - **Open alerts.**
- **`masteryGrid`** builds the students × skills heat map for one unit.
- **`studentDetail`** returns placement, practised skills, the last 20 answers (question, answer, result, time, rapid flag) and the last 30 adaptive decisions with their reasons. This is the audit trail required by §35.
- **`createAssignment` / `classAssignments`** assign chosen skills or a whole unit, with a due date and target mastery.
  - Every enrolled student gets an `AssignmentStudent` row and a notification.
  - Status (not started / in progress / completed / overdue) is computed from real mastery.
  - Assigned skills feed the student's recommendations ("Your teacher assigned this. It is due in 5 days").
- **`scanInterventions` / `resolveAlert`:**
  - The rule engine runs nightly and whenever a teacher opens the class page.
  - There is at most one open alert per student × skill, with all reasons merged into one sentence plus a recommended next step.
  - Resolving is restricted to the student's teachers and is audited.

**Alert rules**

| Rule | Fires when |
|---|---|
| Low accuracy | ≥ 8 answers in 14 days, < 60% correct **and** mastery < 40 |
| Repeated errors | ≥ 4 wrong in the last 6 answers **and** mastery < 60 |
| Declining mastery | ≥ 15 points below the 30-day peak |
| Slow responses | > 2× the expected time over ≥ 8 answers |
| Failed sessions | ≥ 3 sessions in 30 days each below 50% correct |
| Prerequisite gap | ≥ 2 prerequisite reroutes in 14 days |

Rapid guesses never count toward accuracy rules.

**Changes found by the simulated class preview**

1. **Alert fatigue.** A 14-student class produced 20 alerts on 12 students. Accuracy rules now also require low mastery (adaptive practice deliberately serves challenging items), alerts are merged per student × skill, and one prerequisite reroute no longer alerts. Result: 7 alerts on 6 students.
2. **Overlapping skill lists.** With only three skills practised, "weakest" and "strongest" showed the same skills. They are now split at 60 and never overlap.

**UI** (`src/components/teacher/`, `src/app/teacher/`)

- My classes, class overview (unit picker for the heat map), student profile (with a reset-password button), and a new-assignment form.
- The heat map is the one bold element: one colour per mastery stage, gold when mastered, numbers in every cell and a key below.

**Tests:** 13 new (126 total). Mutation check: class access, the rapid-guess exclusion, alert resolution access and alert de-duplication are each caught.

## T. Phase 8 — analytics

**Growth** (`src/server/analytics/growth.ts`, `snapshots.ts`)

- **Daily snapshots** (`AbilitySnapshot`, scope GLOBAL) are **rebuilt from the decision log**, so growth history exists from the first day of practice. The nightly job re-runs it for recent days, idempotently. Only practice decisions count; placement checks never change mastery.
- **Trend:** average mastery and θ at each month end, carried forward between sessions because mastery persists.
- **Overall growth:** start, current, amount and percentage.
- **Paired skill growth:** each skill compared with its own baseline. The baseline is the mastery at the period start, or the skill's first measurement if it was first practised during the period. At least two measurements are required.
  - *Why:* the overall average falls whenever a student starts a new skill. In the simulated class it dipped from 38 to 35 in October while paired growth was positive.
- **Area (domain) growth** and **group growth** (class/grade/school: each student counted once; mean and median).
- **Periods:** last 7 days, last 30 days, the current term (from the school's own `Term` table), semester, school year, or a custom range.

**Reports** (`src/server/analytics/reports.ts`)

- **`studentAnalytics`** covers every §11 metric:
  - questions, correct / incorrect, accuracy, learning time, time per question
  - sessions and longest session
  - skills attempted / mastered / developing / needing intervention
  - ability θ and Platform Reading Range (once placed)
  - longest and current correct/incorrect streaks, highest level answered correctly
  - unit and curriculum progress, recent activity, growth
  - **imported MAP results, shown separately and labelled official**
- **`classComparison`** compares class vs grade vs school.
  - **Aggregates only, hidden below 5 students with data** (privacy).
  - **District/national appear only from imported `BenchmarkReference` rows, with their source**; otherwise "National benchmark data not available."
  - Also returns the mastery spread by band and mean/median/quartiles.
- **`standardsReport`** gives accuracy by CCSS standard (≥ 5 answers, lowest first, with official wording) and counts standards not yet assessed. Class scope is for teachers of that class; school scope is admin-only (`analytics:school`).

**UI**

- Class "Progress and growth" page with a period picker and a link from the class overview.
- Analytics on the student profile.
- A school analytics page for admins.
- Charts are small server-rendered SVG components with screen-reader tables (`src/components/charts/`). *Why not Recharts:* no client JavaScript, no dependency, works offline, and the charts are accessible.

**Changes found while building**

1. **Growth baseline.** A skill first practised during the period was counted from 0, claiming 60 points of growth that were never measured. It now starts from its first measurement and needs ≥ 2 measurements. In today's bank, Central Idea (Grade 4) has one question, so no growth is claimed for it.
2. **A flaky test.** The setup depended on the random top-3 question pick. `startPractice` now accepts an injectable random-number generator, and all practice-based tests use a seeded one. Six consecutive runs are identical.
3. **Preview data.** The simulated term originally ran past the report date.

**Tests:** 11 new (137 total). Mutation check: small-group suppression, the no-invented-national-figure rule and the school-standards permission are each caught.

## U. Phase 9 — MAP and external results import

**Readers** (`src/imports/`)

- **CSV** (RFC 4180): quotes, embedded commas and line breaks, BOM, CRLF.
- **Excel `.xlsx`:** a small built-in reader (ZIP + XML via `node:zlib`) with ZIP-bomb limits (50 MB per part, 100,000 rows). *Why not a spreadsheet library:* reading one sheet is ~150 lines, and a full library adds a large dependency and attack surface.
- **CSV export neutralises spreadsheet formula injection:** cells starting with `= + - @` get an apostrophe, but plain negative numbers are kept.
- **Testing:** fixtures are created with openpyxl, an independent library.

**Pipeline** (`src/server/imports/pipeline.ts`; requires `imports:run`, i.e. school admins)

1. **Stage:**
   - fingerprint the file (SHA-256) and read it
   - map headers, accepting **NWEA's export names** (StudentID, TermName, TestStartDate, TestRITScore, TestStandardError, TestPercentile, Goal1Name/Goal1RitScore…) and the school templates
   - validate each row: student number within **the admin's own school only**, dates in a chosen order (NWEA month/day/year by default, or day/month/year), RIT 100–350, percentile 1–99, and so on
   - detect duplicates inside the file and against stored results, warn if the same file was imported before, and save a preview

   **Nothing is written to results yet.**
2. **Confirm:** one transaction; duplicates are skipped by default or replaced on request; the staged rows are cleared afterwards.
3. **Cancel**, and **error report** (formula-safe CSV of every problem by row, column and value).

Every step is audited. Non-English MAP subjects (e.g. Mathematics) are skipped with a note. Goal names are kept exactly as NWEA wrote them and matched to the platform's MAP goal areas; unmatched names are stored with a note.

**Official values are never calculated, converted or "corrected"**: out-of-range values are rejected, not adjusted.

**MAP vs platform** (`src/server/analytics/map-compare.ts`)

- **Side by side:** the latest test's overall RIT and each goal's RIT, next to the platform mastery of the skills mapped to that goal area. The two are never converted into each other.
- **"Relative weakness":** a goal RIT below the student's own overall RIT by more than the goal's standard error (or 3 RIT). This is a within-student comparison and uses no national norms.
- **"Additional practice recommended"** appears when there is a relative weakness, or when platform mastery is below 60.
- **Recommendations:** a MAP weakness feeds the student's recommendations ("Your test results suggest extra practice here"). It ranks above "New in this unit" and below teacher assignments.

**UI**

- `/admin/imports`: upload, with type, date order and templates.
- `/admin/imports/[jobId]`: totals, problems by row, preview, Import / Cancel, error report download.
- `POST /api/imports`: same-origin check, size limit, permission.
- The MAP comparison panel appears on student profiles.

**Fix found while building:** on a unit page, recommendation reasons said "New in the unit you are studying now" even for units the student wasn't currently studying. They now say "New in this unit".

**Tests:** 13 new (150 total). Mutation check: school scoping of student numbers, "nothing written before confirmation", database duplicate detection and formula neutralisation are each caught.

## V. Phase 10 — downloadable reports (English and Arabic)

**Reports** (`src/server/reports/builders.ts`)

| Report | Who | Contents | CSV holds |
|---|---|---|---|
| Student progress | teachers (own students), school admins, parents (own children) | key figures, progress by unit, skills with mastery level, growth this period, level by area, imported MAP results (official, unchanged), notes | skills |
| Class progress | the class's teachers, school admins | key figures, student list, class / grade / school comparison (privacy suppression), external benchmarks, mastery distribution, skills to reteach, strongest skills, standards | students |
| Standards | class: its teachers and admins; whole school: admins | accuracy by CCSS standard | standards |
| School summary | school admins | key figures, every class, mastery distribution, standards | classes |

Builders add **no new calculations or access rules**. Every number comes from the same Phase 7–9 services the dashboards use, and those services enforce row-level access, so a report always matches the screen. One exception was made deliberately: the student report's headline "Mastery growth" card uses the mean **paired** skill growth (each skill against itself), consistent with the growth table below it. The overall-average change falls whenever a new skill is started; it showed −16.8 beside gains of +76 and +40 in testing.

**One model, three formats** (`src/reports/`)

- `model.ts` is a format-neutral `ReportDoc`. Builders produce it once, and `html.ts` (→ PDF), `xlsx.ts` and `csv.ts` render it, so the formats cannot disagree.
- **PDF:** HTML is printed by headless Chromium (`playwright-core`, `pdf.ts`). *Why a browser engine:* Arabic needs contextual shaping (joined letters, lam-alef), the Unicode bidirectional algorithm for mixed Arabic/English lines, and right-to-left tables. Chromium (HarfBuzz + ICU) does all three correctly; libraries that draw text themselves (pdf-lib, pdfkit, `@react-pdf/renderer`) do not shape Arabic fully. `@react-pdf/renderer` and `exceljs` (listed in Phase 1, never used) were removed.
- **XLSX:** a small SpreadsheetML writer (`xlsx.ts`, `zip.ts`), the counterpart of the Phase 9 reader. Sheet 1 is a summary (logo, title, details, key figures, notes); each table gets its own sheet with a frozen, filterable header. Numbers, percentages (fractions with a `0%` format) and dates (serial numbers) are real Excel values.
- **CSV:** the primary table only, through the Phase 9 formula-safe writer (UTF-8 BOM so Excel shows Arabic correctly).

**Arabic and right-to-left** (`i18n.ts`)

- Every report label exists in English and Arabic (checked by a test). Bands, groups, placement levels, areas, grade names (الصف الرابع) and period names are translated. School term and year names are school data and are kept.
- **Curriculum content stays in English** (skill names, CCSS text), as in the curriculum; the Arabic report says so in its notes.
- The HTML uses `dir="rtl" lang="ar"` and only logical CSS properties, so one stylesheet lays out both languages. English content inside Arabic lines (skill names, CCSS codes, class names such as 4A, student numbers) is isolated with `<bdi dir="ltr">`; names, which may be in either script, use `<bdi>`.
- Excel: Arabic reports use right-to-left sheets with Arabic sheet names and headers.
- **Dates are always Gregorian.** Depending on the ICU version, `ar-SA` can default to the Umm al-Qura calendar, so the calendar is forced. **Digits are Western** by default in both languages (matching RIT scores, student numbers and spreadsheets); Arabic-Indic digits are a formatter option.
- Fonts are embedded as data URIs so a PDF looks the same on every server. DejaVu Sans (free licence, full Arabic coverage) is bundled in `assets/fonts/`. Adding `NotoNaskhArabic-Regular.ttf` / `-Bold.ttf` (SIL OFL) to that folder switches Arabic text to Noto Naskh automatically.

**School branding**

- English name: `School.name`. Optional Arabic name: `SchoolSetting` key `reports.branding` → `{ "nameAr": "…" }`. The header shows the report language's name first and the other below.
- Logo: `School.logoUrl` holds **a file name in `REPORT_BRANDING_DIR`** or a `data:image/…` URI. Remote URLs are never fetched (a changed setting must not make the server request internal addresses), paths cannot leave the folder, the real file type is checked (PNG, JPEG, SVG), the size limit is 1 MB, and SVGs with scripts or external content are refused. Without a valid logo the header shows a clean text badge; the report never fails because of a logo. (Logo upload belongs to the Phase 11 admin settings.)

**Security**

| Control | Where |
|---|---|
| Student report: `reports:read` + access to that student; group reports: `reports:export` + class access; school-wide: `analytics:school` | `service.ts`, plus the services' own row-level checks |
| Forbidden and not-found give the same 404, so links cannot be used to probe for students or classes | `api/reports/route.ts` |
| Request values are strictly validated (kind, format, language, period, ids, dates); nothing is guessed | `parseReportRequest` |
| Rate limit: 30 exports per user per 10 minutes (429 with Retry-After) | `REPORT_RATE` |
| Every export audited as `report.export` with metadata only (kind, format, language, period, target, size), never content | `service.ts` |
| Chromium: JavaScript disabled, **every network request aborted**, one shared browser, `REPORT_PDF_CONCURRENCY` pages at a time, a queue that answers "busy" (503) after 30 s, a 20 s render timeout | `pdf.ts` |
| All values HTML-escaped by construction (`h` template tag); Excel text written as inline strings (never formulas); CSV formula injection neutralised; invalid XML characters stripped | `html.ts`, `xlsx.ts`, `csv.ts` |
| ASCII-only file names; `Cache-Control: no-store, private`; `nosniff` | `route.ts` |

**UI**

- Download links (English row and Arabic row; PDF, Excel, CSV) on the student profile, class analytics (following the selected period, including custom ranges) and school analytics pages.
- **Parent home** (`/parent`), previously a placeholder: each linked child with their term progress report as an Arabic or English PDF. The list comes only from the parent's own links (`src/server/queries/parent.ts`).

**Configuration** (`.env.example`): `REPORT_FONT_DIR`, `REPORT_BRANDING_DIR`, `REPORT_CHROMIUM_PATH` (empty = Playwright's Chromium, installed with `npm run reports:browser`), `REPORT_PDF_CONCURRENCY`, `REPORT_CHROMIUM_NO_SANDBOX` (only for containers that cannot sandbox). The Phase 13 Docker image must include Chromium and its system libraries.

**Preview:** `npm run reports:preview` renders all four reports in both languages and all formats from demo data (one demo student has an Arabic name and the demo school an Arabic name, to exercise mixed-direction text).

**Checks during the build**

- Every PDF was rendered and inspected as page images, including print-resolution crops of Arabic headers and tables. This led to: the paired-growth headline card; compact wide tables with no-wrap student numbers, codes and dates; English headers that overflowed into neighbouring columns; charts and summary cards kept on one page.
- All workbooks open in **openpyxl** (an independent library) with warnings treated as errors. This caught one real defect: `rightToLeft` had been written on the *workbook* view, where it is not valid (Excel would have offered to "repair" the file). It is now set per sheet only.
- Text extracted from the Arabic PDF (poppler) is in logical reading order and the PDFs are tagged.

**Tests:** 25 new (175 total), including the PDF engine. Mutation check, 11 of 11 caught: network block removed, JavaScript enabled, HTML escaping bypassed, formula text written as a formula, parent sees all students, rate limit removed, audit removed, growth card reverted to the overall average, student report without permission, logo type not checked, right-to-left sheets off.

**Resolved after Phase 13 (decision: use paired growth):** the class / grade / school "mean growth" (Phase 8 `groupGrowth`, shown on the class analytics screen and in the class report) now averages each student's mean **paired** skill growth (`pairedGrowth` in `src/server/analytics/growth.ts`), the same rule as the student report's headline card. Previously it averaged the change in overall mastery, which falls whenever a new skill is started (the demo class showed −13.9 while every student improved). See section Z.

## W. Phase 11 — administration

**Services** (`src/server/admin/`): permission, school scope, validation and audit live here; the pages and server actions (`src/app/admin/actions.ts`) only parse forms.

**Users** (`users.ts`)
- Create, edit, deactivate/reactivate; teacher ↔ classes; student class moves; parent ↔ child links; searchable list.
- Students and parents need `students:manage`; teachers and admins need `teachers:manage`; class changes need `classes:manage`. Everything is limited to the admin's own school. SUPER_ADMIN accounts never appear and cannot be changed here.
- New accounts get a readable temporary password (the Phase 3 generator), shown **once** and stored only as a hash; the user must change it at first sign-in. Passwords never reach the audit log.
- Deactivation signs the user out everywhere (session version + session rows). Nobody can deactivate themself. No hard deletes: a student's answers, mastery and MAP results must survive.
- Class moves close the old membership (`leftAt`) instead of deleting it, so class history and reports for past periods stay correct. Moving into another grade's class changes the student's grade (year-end promotion).
- Names: control and bidi-override characters (U+202E and similar, which can disguise text) are removed, spaces collapsed.

**Bulk user import** (`roster-import.ts`, `/admin/roster`)
- CSV or XLSX with columns `role, username, display_name, student_number, grade, class, email, title, parent_of, relationship` (template downloadable).
- **Check → review → import**, like the Phase 9 results import. The check validates every row against the file and the database (duplicates within the file, taken usernames and student numbers, grades, a class's grade, a parent's children, role changes) and reports line and column. Nothing is written.
- Import requires the **same file** (SHA-256 compared) and **zero problems**, and runs in **one transaction**: all rows or none.
- Existing usernames are updated (name, email, class) and keep their passwords. Classes named for students that do not exist yet are created in the current year and listed in the preview.
- Temporary passwords for new users are returned once as a CSV generated in the browser; they are not stored or logged.
- Up to 3,000 rows per file. Passwords are hashed before the transaction opens, so it stays short.

**Settings** (`settings.ts`, `/admin/settings`)
- **Adaptive engine** (`settings:engine`): every value has a safe range (`ADAPTIVE_LIMITS`); out-of-range values are refused, never clamped. Mastery bands must be strictly increasing and weights must sum to 1 (`resolveEngineConfig`). Only real overrides are stored; "restore defaults" removes them.
- **Report branding** (`settings:school`, new permission): Arabic school name and logo. Logos are checked (real PNG/JPEG/SVG, ≤ 1 MB, no SVG scripts) and stored under a content-hash file name in `REPORT_BRANDING_DIR`; `School.logoUrl` holds the file name, exactly what the Phase 10 reports read.
- **Calendar** (`settings:school`): academic years and terms; terms must be inside their year and must not overlap; exactly one current year. Dashboard and report periods ("this term") follow it.
- **Classes** (`classes:manage`): create, rename (unique per year), archive only when empty.

**Question workflow** (`questions.ts`, `/admin/questions`)

```
DRAFT ──send for review──▶ UNDER_REVIEW ──approve──▶ PUBLISHED ──archive──▶ ARCHIVED
  ▲                             │
  └───────send back (note)──────┘   author notified
```

- Authors (`questions:edit`; teachers have it) write drafts in an editor for all ten auto-scored types. Every save goes through the **Phase 1 bank validator**: exactly one correct option for multiple choice, feedback for every wrong option, 3+ items for ordering and matching, a valid error position, an explanation. A missing standard defaults to the skill's standard.
- Teachers edit only their own drafts; reviewers may fix any unpublished item. An author's edit to an item under review sends it back to draft.
- Publishing needs `questions:publish` (school admins; teachers by explicit grant, e.g. a lead teacher). **Four-eyes rule:** a teacher cannot approve their own question; school admins may (small schools), and the audit records it.
- Sending back requires a note; the author gets a `TEACHER_FEEDBACK` notification.
- **Published questions are never edited in place**, because their answers and statistics belong to that exact wording. "Make a new version" creates a draft (version + 1, `tags.revisionOf`); approving it archives the original in the same transaction, so the practice pool never has a gap.
- AI-drafted items are marked (`origin AI_GENERATED`, `aiStatus`) and pass the same review.
- Only `PUBLISHED` items reach students (the practice engine reads `PUBLISHED` only, verified by test).
- Each question page shows its history (from the audit log) with review notes.

**UI**: admin home (one card per area the admin may use), users list and detail, import users, settings, questions list / new / detail. Teachers reach "My questions" from their home page. Server actions are limited to 4 MB (`next.config.ts`) for logo and roster uploads.

**Tests:** 22 new (197 total) on a real database. Mutation check, 16 of 16 caught: self-approval, editing others' drafts, editing published items, revision not archiving the original, rejection without a note, deactivation keeping sessions, self-deactivation, SUPER_ADMIN reachable, bidi characters kept, class move deleting history, engine ranges unchecked, overlapping terms, unvalidated logo, roster file hash unchecked, roster applied with problems, wrong-grade class accepted. (The check first found that no test applied a file that still had problems; that test was added.)

**Page check:** Next.js is not installed in the build sandbox, so every Phase 10–11 page, form and server action was type-checked against minimal stub declarations for React, Next.js and zod: all service calls, props and return shapes are consistent. A full `next build` and browser tests are part of Phase 12.

**Phase 10 open item:** resolved after Phase 13 (section Z).

## X. Phase 12 — testing and security

Full write-ups: **`docs/SECURITY-REVIEW.md`** (findings, controls, recommendations) and **`docs/TESTING.md`** (how to run each layer, results).

**Findings fixed**

| # | Severity | Issue | Fix |
|---|---|---|---|
| F1 | High | `PrismaRepo` built compound-key names from the order keys were written in each call, and passed non-unique lookups to `findUnique`; both fail only on MySQL, never in SQLite tests | Unique-key map generated from the schema (`src/server/db/unique-keys*.ts`, `npm run db:keys`); order-independent; **both repositories enforce the same contract**; static scan of all 100+ lookups |
| F2 | High | Production CSP (`script-src 'self'`) blocks Next.js's inline bootstrap scripts, so interactive pages would not work in production | Per-request nonce in middleware (`src/server/auth/csp.ts`), `'strict-dynamic'`, no `unsafe-*`; CSP removed from static headers; browser test added |
| F3 | Medium | `/api/health` allowed by middleware but missing | Added (public, `ok`/503, no data) |
| F4 | Low | Teacher class access did not also check the school | Added (defence in depth), tested with a deliberately wrong data row |

**New automated checks** (`npm test`)
- `tests/contracts.test.ts`: every page, API route and server action checks the session (explicit allowlist with reasons: login, change-password page, logout, health); state-changing routes check the origin; DB unique-key contract (generated map in sync with schema, runtime enforcement, static scan); no raw HTML, dynamic code, `Math.random`, unsafe raw SQL or process spawning in `src/`; no committed secrets.
- `tests/isolation.test.ts`: a second school is seeded with the real seeders and Phase 11 services; 172 calls by school A's admin, teacher, parent and student against school B's ids, both directions (B's records, and B's class pulled into A's records), all refused; B unchanged; B's own admin unaffected.

**End-to-end** (`playwright.config.ts`, `tests/e2e/`, `npm run e2e`): 19 browser tests including the production CSP / hydration check, practice on a tablet profile, Arabic PDF download, four-eyes question review across two sessions, and parent and teacher access limits. Written against the real page markup, type-checked against Playwright 1.56 and loaded by the real runner; they need a running app with MySQL and demo data, which the build sandbox does not have.

**Load**: `scripts/load/engine-bench.ts` (run: ~2–3 ms of work per answer, ~400 answers/s per process, 120 simultaneous answers all served within 0.2 s); `scripts/load/http-load.ts` for a staging deployment, with targets in `docs/TESTING.md`.

**Mutation checks** kept in `scripts/mutation/` (`npm run test:mutation`): 42 of 42 caught across Phases 10–12. The Phase 12 run found three gaps (no runtime test of the repository contract; no test of F4; one mutation that was not actually a violation because the schema already makes that key unique), all resolved.

**Note for Phase 13:** there is no committed `prisma/migrations` yet (the runbook generates it with `prisma migrate dev --name init`). Production deploys need a committed initial migration so `prisma migrate deploy` has something to apply. *(Resolved in Phase 13: `npm run db:baseline`.)*

## Y. Phase 13 — deployment

Full guide: **`docs/DEPLOYMENT.md`** (server, first deployment, updates and rollback, backups and restore, monitoring, routine tasks, incidents).

**Images** (`Dockerfile`, multi-stage): `web` = Next.js standalone server (`output: "standalone"`), Prisma engine, `playwright-core` with Chromium headless shell and its libraries, bundled report fonts; non-root `node` user, `tini`, health check on `/api/health`, no credentials baked in. `jobs` = full toolchain for migrations, the scheduler and one-off scripts. `docker/backup` = MySQL client + GPG.

**Stack** (`docker-compose.prod.yml`): `caddy` (automatic HTTPS, JSON access log) → `web`; `mysql` 8.4 with no published port; `migrate` runs `prisma migrate deploy` as the `ela_migrate` account and must succeed before `web` and `jobs` start; `jobs` runs the scheduler; `backup` runs nightly. The app connects as `ela_app` (data only, no DDL). Accounts are created on first start by `docker/mysql/01-accounts.sh` from environment passwords. All services: `no-new-privileges`, rotated logs; `web` and `jobs` drop all Linux capabilities. Every secret is required (`${VAR:?}`), and every variable is documented in `.env.production.example` (tested).

**First admin:** `npm run admin:create` (server shell only; one-time password; audited as `user.bootstrap`; flagged by the security digest). Before this, a fresh install had no way to create its first admin.

**Migrations:** `npm run db:baseline` creates `prisma/migrations/0001_init` with Prisma's own `migrate diff --from-empty` (no database needed). CI fails until it is committed, applies it to an empty MySQL 8.4, and checks there is no drift between migrations and schema.

**CI** (`.github/workflows/ci.yml`): types, 222 tests, `npm audit --omit=dev --audit-level=high`, migration check; MySQL job (migrate, drift check, curriculum seed, Phase 2 verification); browser end-to-end job against the standalone build; Docker builds with a non-root check. Dependabot weekly (npm) and monthly (actions, Docker).

**Scheduled jobs** (`scripts/jobs/schedule.ts`, Riyadh time): rollups daily 02:15; security digest daily 06:30; item analysis weekly Friday 03:00. Each runs as its own process; heartbeat URL after success; webhook on failure.

**Monitoring:** `/api/health` (DB check, 503 when down) for uptime checks and Docker; JSON logs with secret redaction (`src/server/monitoring/log.ts`); daily security digest from the audit log (`src/server/monitoring/security-digest.ts`): failed sign-ins per IP, lockouts, rate limiting, repeated refusals, bulk report downloads, new school admins.

**Backups:** nightly `mysqldump --single-transaction` + storage archive, encrypted to the school's GPG public key (the server cannot decrypt), checksums, retention; `restore.sh` verifies, restores into a named database and refuses the live one unless forced; monthly restore test procedure.

**Found and fixed during Phase 13:** `.env.production` was not ignored by git (only `.env` and `.env.*.local`), so production passwords could have been committed; no first-admin path; no lockfile (now a documented one-time step, enforced by the Docker build and CI); `next start` does not serve standalone builds (end-to-end now runs the standalone server like production).

**Tests:** `tests/deployment.test.ts` (12): Riyadh schedule maths, digest rules on synthetic and real audit data, log redaction, image non-root/health/no secrets, compose variables documented and secrets required, MySQL not exposed, migrations before app, least-privilege accounts, env schema documented, CI scripts exist, secrets files ignored, shell syntax, restore guards, first-admin bootstrap. Mutation check: 14 of 14 caught (two assertions were tightened after the first run). **Total: 222 tests; 56 of 56 mutations caught across Phases 10–13.**

**Not run in the build sandbox (no Docker, MySQL or internet):** the Docker builds, `npm install` (lockfile), `prisma migrate diff` (baseline), the CI pipeline and the browser tests. Their configuration is validated (YAML parsed, shell syntax checked, cross-file consistency tested); the first CI run executes all of them.

## Project status

All 13 phases are complete. Before the first production deployment: (1) `npm install` and commit `package-lock.json`; (2) `npm run db:baseline` and commit `prisma/migrations`; (3) push and confirm CI is green, which runs the browser tests for the first time and confirms Phase 12 finding F2 (CSP) in a real browser; (4) follow `docs/DEPLOYMENT.md`. The class "mean growth" decision from Phase 10 has been applied (section Z).

## Z. After Phase 13 — class growth decision and first production build

**Class growth (decision: paired growth).** `groupGrowth` now uses `pairedGrowth(student)` = mean growth of the skills that have two measurements in the period; mean and median of those per student give the class figure. The student report's headline card uses the same helper, so screen, class report and student report cannot disagree. The class report's notes now include the growth explanation. Test: `tests/growth-summary.test.ts` reproduces the demo case (students improve on every skill, overall average falls) and checks the class figure equals the mean of the students' paired growth, is positive, and is what the comparison table shows. Mutation check: 2 of 2 caught (`scripts/mutation/phase14-class-growth.py`).

**First production build (Vercel) failed on two type errors**, both the same cause: in zod 3, `z.unknown()` infers an *optional* property (`response?: unknown`), while the practice and placement services require `response`.
- Fix: `src/server/practice/answer-input.ts` parses answer submissions (two valid ids and an answer that is present), returns an exactly typed object, and refuses a missing answer with a clear message instead of passing `undefined` to the scorer. Both actions use it; the practice action now parses inside its `try`, so bad input returns a message instead of a server error. Tests: `tests/answer-input.test.ts`.
- Why it was missed: the page checks in Phases 10–12 replaced zod with a loose stand-in, and covered only the new pages. The check was rebuilt with the **real zod 3.23.8 types**, faithful `NextResponse`/JSX event typings, strict mode, and **everything `next build` type-checks** (`src`, `tests`, `prisma`, with the main `tsconfig.json` library settings): 0 errors after the fix. Only these two real errors existed.

**Builds no longer need production secrets.** `next build` imports every page while collecting page data; `src/lib/env.ts` validated settings at import time, so a build without `DATABASE_URL`, `APP_SECRET` etc. would have failed right after type-checking. Settings are now validated on first use (same `env.X` API), and `src/instrumentation.ts` validates them when the server starts, so a misconfigured server still refuses to start. `authConfig` became `getAuthConfig()` and `isProd` reads `NODE_ENV` directly. Test: `tests/env.test.ts` (real zod).

**Prevention:** CI's first job now runs `npm run build` (real Next.js type check and compile, no secrets). `tsconfig.json` already includes `.next/types/**/*.ts` (Next.js adds it on first build).

**Totals:** 227 tests; 58 of 58 mutations caught. `npm run build` itself cannot run in the build sandbox (no internet to install Next.js); the first CI run or Vercel build is the confirmation.

## AA. AI-assisted question bank

Added to the existing platform: same database (no schema change), same adaptive engine.

**Flow.** Admins choose Grade → Book → Unit → Lesson → Skill → Standard → number of questions (`/admin/question-bank/generate`). The server builds a prompt from curriculum records only, calls the AI provider (Anthropic Messages API, `ANTHROPIC_API_KEY`, `AI_MODEL`), validates every returned question, and saves valid ones as **DRAFT** (`origin AI_GENERATED`, `aiStatus AI_GENERATED`) with grade/unit (via the lesson), `lessonId`, `skillId`, `standardId`, `difficultyLevel` and the cognitive level (Bloom's, in `tags.cognitiveLevel`), plus question text, four choices, the correct answer, a rationale for each wrong choice, an explanation and a tip.

**Automatic validation** (`src/server/admin/ai-bank.ts`): question text and exactly 4 distinct choices with exactly one correct answer and a rationale for every wrong one; explanation present; known cognitive level; the stated skill and standard must be the ones requested and the standard must be linked to the skill (the lesson must teach the skill); each question's level must match its planned slot; duplicates against every existing question of the skill and within the batch. Invalid questions are not saved; reasons are shown. The batch is reported against the planned easy / medium / hard split. The full bank validator then checks each item again before it is saved.

**Review.** Teachers and admins (new permission `questions:review`; teachers have it) can review, edit, **approve** (→ `PUBLISHED`, `aiStatus APPROVED`, re-validated) or **reject** with a reason (→ `ARCHIVED`, `aiStatus REJECTED`). Only admins may generate (`questions:generate`). A teacher cannot approve a batch they requested; admins may.

**Only approved questions reach students:** practice, placement and skill cards read `status = PUBLISHED` only (unchanged; verified by test).

**Coverage** (`/admin/question-bank`): per skill, approved questions, approved easy (levels 1–2) / medium (3–5) / hard (6–7) against the target (12 = 3/6/3), drafts awaiting review, and what is still needed. **Generate Missing** asks for exactly the shortfall per difficulty band, counting drafts awaiting review so nothing is generated twice (at most 20 per request; the next click continues).

**Privacy.** `src/server/ai/question-generator.ts` imports nothing (no database access); the prompt contains only curriculum data and existing question stems. A test seeds a school and checks that no student number, username or name appears in the prompt.

**Tests:** `tests/ai-bank.test.ts` (10, with a fake provider; no network). Mutation check `scripts/mutation/phase15-ai-bank.py`: 13 of 13 caught. Totals: 244 tests; 71 of 71 mutations caught.

