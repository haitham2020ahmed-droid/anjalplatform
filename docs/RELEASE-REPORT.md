# Release report: assignments, curriculum management, question management

Phases 2–12 of the improvement plan. 75 files changed (+4,330 / −153 lines), 42 files added.
Nothing was rebuilt: every feature extends the existing models, permission system and adaptive engine.

## 1. Features

| Area | What exists now |
|---|---|
| Curriculum management (admin) | Create / edit / reorder / activate / deactivate / delete-when-safe for grades, units, skills, standards. Duplicate warnings (“create anyway”). No grade is ever created automatically. New items appear at once in the question editor, bank filters, import template and teacher pages. |
| ⭐ Assign (teacher) | Grade → Unit → Skill → Standard view of the teacher's own classes; assign one skill to the whole class, selected students or one student, with optional start date, due date and note, confirmed in a dialog. |
| Student home | ONLY assigned skills: summary (assigned / completed / in progress / not started / overdue), standard, dates, note, progress, Start / Continue / View report / Practise again. Unassigned practice is refused on the server. Placement test only when the school requires it (Settings). |
| Notifications | Bell with unread count on every page, list, open = mark read + go to the skill or report, mark all read; “new skill”, “due soon”, “overdue” (each once). In-platform only. |
| Reports | Student completion report (score, mastery level, accuracy, answers, correct, time, completion date, strengths, needs practice, next step; rule-based from real answers). Teacher: weekly assignments, per-assignment results per student, the same student report. |
| Statuses | Not Started → In Progress (first answer) → Completed (10+ answers for the assignment AND target mastery, default 75%) · Overdue after the due date. Only practice done for the assignment counts. |
| Question editing | Full editor incl. optional Passage/Text (separate from the question; shared when identical; changing one never changes another) and cognitive level. Published questions editable directly while no student has answered them; afterwards “Revise” (new version). |
| Delete / archive | Single and bulk delete (admins; answered questions are kept and reported), bulk archive, selection checkboxes with count. |
| Missing passage | “Possible missing passage” warning (badge, filter, live editor note, import row warning). 0 false alarms on the 618 passage-less questions of the original bank. |
| Filters | Grade, unit, skill, standard, type, status, has/no/possibly-missing passage, has/no image, search, real pagination (100 per page). “Publish All” follows the same filters. |
| Images | Optional question image: upload / replace / remove, alt text, resized in the browser, PNG/JPEG/WebP/GIF checked from the bytes (no SVG), ≤ 1 MB, stored in the database, shown in practice. |
| One-time cleanup | `scripts/cleanup-questions.ts`: report (+ JSON and Excel backup) → execute with confirmation code → verification → restore. Not run yet: waits for approval. |
| Test environment | `scripts/seed-test-env.ts`: separate Test School, 1 admin, 6 teachers, 200 students, 6 classes, 30 real assignments, real practice, every status; safe reset. |

## 2. Database changes (all additive; `npx prisma db push`)

`Grade.isActive`, `Unit.isActive`, `Standard.isActive`, `Assignment.skillId` (+ index), `Assignment.startAt`,
`Assignment.note`, `Question.imageId`, index `PracticeSession.assignmentId`, new table `QuestionImage`.
No column was removed or renamed; the previous code runs unchanged on the new schema.

## 3. Test accounts

`scripts/seed-test-env.ts seed` creates **1 admin** (`test.admin`), **6 teachers** (`test.teacher.1–6`) and
**200 students** (`test.student.001–200`) in the Test School. The password is chosen at seed time
(TEST_ACCOUNT_PASSWORD) and is not stored in the code. `reset` removes everything; `seed` recreates it.

## 4. Tests

- 38 test files, 330 tests: **329 pass**. The 1 failure (“importing settings never throws”) is a
  sandbox-only `zod` module issue that existed before this work and passes on the developer's Mac.
- New: curriculum management, assignments, student view + notifications + report, question editing,
  passages, delete/archive, filters, images, cleanup rehearsal, test environment, permission matrix,
  static page-access check, end-to-end admin → teacher → student → teacher.
- Equivalence: 121/121 existing page results identical to before (after approved, additive changes).
- Type checks: 0 new errors (core config; full config compared with the code before the work).
  `npm run build` must be run on a machine with all type packages installed (see section 8).

## 5. Bugs found and fixed during the work

1. Save schema silently dropped the new passage field (would have lost passages) and had always dropped the cognitive level.
2. DDL generator did not know binary columns (test schema and reference SQL lacked `QuestionImage.bytes`; production unaffected).
3. Grade deletion counted already-removed units; wrong column name in its clean-up.
4. New server actions bypassed the “check the session in the action's own body” rule.
5. Assigning without a skill produced a database error instead of a message.
6. Class views and assignment results returned empty data to students instead of refusing.
7. Curriculum operations looked items up before checking permission (revealed whether an item exists).
8. “Publish All” ignored the new filters (would publish hidden questions).
9. Seed scripts used long interactive transactions (would time out against the remote database).
10. Parallel-counter race in the test seed.
11. N+1 status refresh on weekly views, student home and the class page (see section 6).

## 6. Performance (Test School, 200 students, 200 ms per database call)

| Page | Before the fixes | Now |
|---|---|---|
| Admin › Weekly assignments (6 classes) | 76 calls, 10.3 s | 7 calls, 1.0 s |
| Teacher › Weekly assignments | 2.6 s | 1.4 s |
| Student › Home | 2.8 s | 1.4 s |
| Student › Each answer | +1.0 s for the assignment | +0.2 s (3.2 s vs 3.0 s without an assignment) |
| Student › Start practice | +0.2 s | +0 s |
| Teacher › Curriculum / Assignment results / Report | | 1.6 s / 1.8 s / 2.0 s |
| Bell / Notifications list | | 0.2 s / 0.2 s |
| Questions list / Curriculum management | | 0.8 s / 1.0 s |

Moving the web service next to the database (Singapore) divides every time above by about ten.

## 7. Known issues and notes

- The original bank has 5–7 questions per skill. With a 75% target, completing an assignment then
  takes about 35 correct answers with repeats. A bank of 50 per skill removes this.
- The school logo (existing feature) is saved to the server disk, which Render's free plan wipes on
  each deploy. Question images use the database and are not affected.
- Standards are shared by all schools (existing design): editing one changes it everywhere.
- Browser-level testing (clicking through the pages) was not possible in the development sandbox;
  every page's server logic is covered by the tests above. See the manual checklist in section 8.

## 8. Deployment

1. `npx prisma db push` (adds the columns/table) BEFORE the new code goes live.
2. `npm test` (expect only the known `zod`/openpyxl item to fail) and `npm run build`.
3. `git push`, then Render → Manual Deploy.
4. Manual checklist: admin → Curriculum (add/delete a unit), Questions (edit + passage + image, delete one,
   bulk select); teacher → ⭐ Curriculum → Assign → Weekly assignments; student → home, bell, Start, report.

## 9. Rollback

- Code: Render → Rollback to the previous deploy (the database changes are additive, so old code works).
- Questions after the cleanup: `npx tsx scripts/cleanup-questions.ts restore backups/question-backup-….json`,
  or the Aiven backup taken before the cleanup.
- Test data: `npx tsx scripts/seed-test-env.ts reset`.

## 10. Speed update (after user feedback: slow clicks, login and answers)

Measured with 200 ms per database call (web service in Virginia, database in Hong Kong):

| Action | Before | After |
|---|---|---|
| Identity check on each click (teacher, repeat clicks) | 5 calls, 1.0 s | 2 calls, 0.2 s |
| Each practice answer | 15–17 sequential calls, 3.0–3.2 s | 11 calls, 2.0–2.2 s |
| Notification bell | blocked the page by one call | loads alongside the page |

How: session and user are fetched together; permissions/scope are kept in memory and cleared on any
change to users, roles, classes or memberships (max 60 s); engine settings, prerequisites and skill rows
are kept in memory and cleared on any write to those tables; the next practice screen is built from the
answer transaction's own results; the assignment status is updated after replying (pages refresh it too).
Every security check still runs on fresh database rows on every request.

The remaining time is distance: each call crosses from Virginia to Hong Kong. Putting the web service and
the database in the same region reduces each call from ~200 ms to a few ms, which makes every page and
answer roughly 10× faster. On Render's free plan the service also sleeps after 15 idle minutes (first
visit afterwards waits 30–60 s) and has 0.1 CPU (login password hashing alone takes about half a second).
