# Update 35 — full platform audit and fixes (2026-10)

Five independent audits (security, scalability, architecture/connections, learning logic, question bank/curriculum),
then fixes, then a second full verification. Everything was tested on a local copy with the fake Test School only.

## Verification after the fixes
- Unit/integration tests: 680/680 pass (was 646; 34 new tests in `tests/audit-*.test.ts`).
- 150-student school day (`scripts/load/full-150.mts`): 248/248 checks, 0 errors.
- 300-student path simulation (`docs/sim-300-path-result.json`): personalized gain 0.056 vs generic 0.043; 3% vs 26% of sessions on strong skills; 248 distinct paths; level agreement 78% vs 50%; diagnosis recall 67% vs 47%.
- 500-student prediction simulation (`docs/sim-500-predict-result.json`): AUC 0.736, Brier 0.208, top-20% precision 82%, predicted vs actual by fifth 88/82 · 70/71 · 55/63 · 37/49 · 19/24; tutor names the mistake in 83% of wrong answers, 0 answer leaks; copilot foundation groups 72% correct.

## Critical
| Problem | Fix | Files |
|---|---|---|
| `.env.local` with the live database password tracked in git (public repo) | untracked; owner rotates the Aiven password and APP_SECRET, makes the repo private | `.env.local` (removed from git) |
| Demo seed could run against a remote database | refuses unless the host is local or `ALLOW_REMOTE_SEED=1` | `prisma/seed/demo.ts` |
| Import: blank answer became option A / True | no key is invented; the question stays DRAFT and cannot be published without an answer | `src/imports/questions/template.ts`, `src/server/admin/question-import.ts` |
| Import: generic stems ("Which word is spelled correctly?") marked as duplicates and skipped | stem-only match needs ≥50% option overlap; inverted index (10k rows < 1 s) | `template.ts` |
| MAP goal chance always 50% | Spring prediction from Fall + Winter + Weekly Check pace and practice; P(Spring ≥ target) | `src/server/insights/student-profile.ts` |
| Weekly Check RIT ran to 120/300 | posterior estimate with a prior on the latest MAP RIT; risk feature clamped | `src/server/map/map-plan.ts`, `src/server/predict/risk.ts` |
| Prerequisite bounce after one wrong answer | streak counted per session; a prerequisite visited in the last 24 h is not routed to again | `src/adaptive/engine.ts`, `selector.ts`, `src/server/practice/session.ts` |
| Risk model training: unbounded, leaked students across train/test, wrong labels | one example per student and Spring outcome, split by student, weekly | `risk.ts`, `src/server/insights/daily.ts` |
| Item-quality page loaded every answer ever | 180 days, minimal columns | `src/server/admin/item-quality.ts` |

## Security
Client IP from CF-Connecting-IP / True-Client-IP (Render is behind Cloudflare), else the right-most X-Forwarded-For (`TRUSTED_PROXY_HOPS`); per-IP login limit 300 per 15 min (a school shares one address) plus a per-username failed-login limit; school checks on metadata confirm, comment/note delete, skill page, question images; ReadMaster publishing needs `questions:publish`; shared standards/families editable only by a super admin once a second real school exists; upload without Content-Length refused (411).

## Scale
`rawSignals` grouped by student (no O(n·m)); daily-job claim can be re-taken after 2 h; platform-wide steps once a day; `pathContext` shares grade loads across students; `learnActionWeights` reads evaluated rows only; recommendation evaluation loops within a time budget; bounded reads in streak, AI tools, tag review, teacher student page, roster clean, question delete, progress trend; index `AdaptiveDecisionLog(attemptId)`; `global-error.tsx`.

## Learning logic
Diagnostic Test writes DOMAIN abilities (practice starts at the right level); teacher sets / Weekly Check / Diagnostic write decision logs (pre-answer θ for calibration, growth counts all work); calibration uses the engine's 2PL model and never current θ; knowledge graph reads the last 10 answers of each skill; copilot focus skill scoped to the class curriculum; summarize ⇄ central-idea cycle removed and cycle check added; decay setting validated as a fraction; resume resets answer timing; Riyadh days for practice and risk; growth per week uses the real number of days; strict foundation rule for class groups, wider rule for a student's own path; tutor leak check by whole words.

## One source of truth
Parent report and Students board use the engine mastery (`isMastered`); parent home and admin student file use `StudentProfile.level`; parent MAP goal = Fall RIT + Fall projected growth; class dashboard groups use recent skill θ.

## Import validation
Multi Select needs a wrong option, MC/Dropdown ≥2 options, duplicate refs reported, standard not linked to the skill → DRAFT for review, author misconceptions kept on seed, post-processing errors recorded on the import job, limit 10,000 rows.

## Known limitations (not changed)
- Daily job still starts from a page visit; a Render Cron Job / Background Worker running `npm run jobs:learning` is recommended.
- No archiving of growing tables (attempts, decision logs, snapshots, notifications).
- Two at-risk rules remain (`statusOf` on the Students board, `riskScore` in Class AI).
- Dead models: OfficialReadingMeasure, ReadingLevelBand, StudentReadingRange; write-only: Subskill, ExternalSkillRef, ExternalAssessmentResult.
- Sample bank: Grade 6 lessons have no skills; 87% of questions give every wrong option the same misconception; the correct answer is the longest option in 61% of MC items; 73% of True/False answers are True. The live bank (~8,000 questions) should be checked with Question Intelligence.
- Mastery does not lock progression (prerequisites redirect instead) — a design choice.
- `CurriculumMapNode.skills` is free text (no link to Skill/Unit).
