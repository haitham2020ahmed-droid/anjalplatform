# PROGRESS — Update 15

Tests: `tests/update15.test.ts` (11 tests, fake Test School data) + the whole existing suite.

## Phase 2 — Assignment + adaptive
- **Level names hidden from students** everywhere (titles, notifications, ReadMaster, Respond, plans).
- **Student levels board** (Teacher → Levels): three columns Below / On / Above, drag & drop or ◀ ▶; **🤖 Place automatically** fills it from each student's data with the reason; nothing changes until *Save levels*. Students without data → On Level (shown).
- **Assign** (Curriculum Map, Grammar, any skill): 🤖 Automatic (default) or ✋ Manual by level; optional due date; 👀 **Preview** each level (printable / PDF).
- **Level rules** in Settings: move up / down %, window, "mastered" threshold.
- **Respond to Reading**: admin fills all 3 levels on one screen, or uploads Excel / Word / text (templates to download). Teacher → Respond: choose a Text Set, levels pre-filled automatically, change any student, send. Students see only their version (no level name), can **Read aloud** (with speed), print, and press **✅ I finished my answer in my book** (+10 points once). Teacher tracking: level received, finished / not, score 0–4, comment.

## Phase 3 — MAP data
- **✏️ Enter MAP data** (Teacher → MAP data): one table for the class; Reading or Language Usage; Fall / Winter / Spring; RIT, percentile, Spring projection, Lexile, goal areas (RIT or Low/LoAvg/Avg/HiAvg/High). Matched by Student ID. File upload (template / NWEA export) unchanged.
- MAP feeds automatic placement and the plans.

## Phase 4 — Plans + dashboards
- **📈 Students** (teacher & admin): every student — status (on track / at risk), level, answers & accuracy, mastered / need work, time (week, month, total), tasks done / pending / late, last active, MAP Fall → now → target, plan intensity; filters, sorting, Excel, PDF.
- **Student page**: MAP chart, levels + history, automatic plan (weakest goal areas → skills, starting level, intensity) with ⭐ Assign.
- **Teacher home**: summary cards, alerts list (at risk · dropped twice · not started by due date), quick actions.
- **Grade coordinators** (Settings) and **🏫 Grade summary** (admin + coordinators).

## Phase 1 — Tags & review
- **🏷️ Tags & review** (admin): per skill (batch), derived tags with "missing" warnings, a random ~10% sample, verify ticked / whole batch / undo, **📐 Recalibrate RIT** from real answers.

## Grammar
- Every teacher can open the Grammar of Grades 4, 5 and 6; Preview any skill; Assign to their class of that grade (Automatic / Manual).

## How to try it (step by step)
1. Admin → Settings: check *Level movement & mastery*; tick a teacher as coordinator of a grade.
2. Admin → Curriculum Map → ✍️ Respond to Reading → a Text Set → *Edit all 3 levels* (or upload a filled template).
3. Teacher → Levels → 🤖 Place automatically → move a student → Save levels.
4. Teacher → Respond → choose the Text Set → Send. Student → Home → ✍️ banner → open → ✅ I finished. Teacher → Respond → the task → see "finished", give a score.
5. Teacher → Grammar → Grade 4 → 👀 Preview (switch levels, Print/PDF) → ⭐ Assign (Automatic or Manual, due date).
6. Teacher → MAP → ✏️ Enter MAP data → type a few RITs and goal areas → Save.
7. Teacher → Students → sort "Needs help first" → open a student → assign the plan.
8. Admin → Tags & review → a skill → Verify ticked / whole batch → Recalibrate RIT.

---

# PROGRESS — Update 16

Tests: `tests/update16.test.ts` (7 tests, fake Test School data) + the full suite.

- **🧩 Skills (admin)**: the master list of every skill (kind, MAP area, standards, questions, in a unit or not) and **possible duplicates** with Merge / Undo. All skill lists now read it; the teacher Curriculum shows skills outside units (Grammar, imported banks) under “More skills”. See SKILLS_AUDIT.md.
- **🎮 Skill games for every skill**: students play any skill of their grade at their own level (10-question rounds, timer, points, streak, read aloud); answers count toward progress. Teachers print **QR cards** (one or many skills) and see who joined by QR.
- **🧩 My skills (student)**: assigned skills first (with due dates), then every other skill to practise or play — no level names.
- **Simple teacher Curriculum page**: only Assign, Preview and a status per section; details behind “Details”. See CURRICULUM_PAGE.md.
- **🏅 Badges and points** for skills mastered, tasks finished, levels moved up, reading, writing and daily practice; new-badge banner on the student home. Only the student's own.
- **👪 Parent report**: plain English + Arabic, PDF; the teacher shares it (one or many students) and the parent is notified; parents see it on their page only after sharing.
- **📄 Reports (teacher)**: parent reports + Excel / PDF exports.
- **🧑‍🏫 Teacher follow-up (admin)**: sign-ins, assignments, results checked, at-risk students helped, % active, % on track; warnings with editable rules and context.
- **Menus** reorganised (NAVIGATION_AUDIT.md); “👥 My Classes” page; plain words instead of technical ones.

## How to try it
1. Admin → 🧩 Skills → Grade 4: check the list; if a duplicate pair is shown and really the same, press Merge (Undo is below).
2. Teacher → Curriculum: each section shows Assign / Preview / status; open “Details”.
3. Teacher → Games → 📱 Skill games with QR codes → tick 3 skills → Make QR cards → Print. Scan one with a phone as a student → sign in → play. Back on the page: “Who joined”.
4. Student → My skills → 🎮 Play a skill; then 🏅 Badges.
5. Teacher → Students → a student → 👪 Parent report → Share. Parent account → My children → 📄 Report from the teacher.
6. Admin → 🧑‍🏫 Teacher follow-up → open “Warning rules”, change the days, Save.

---

# PROGRESS — Update 17 (AI tools)

Tests: `tests/ai-tools.test.ts` (7 tests, fake provider) + `tests/ai-bank.test.ts` updated.
- **Admin → 🤖 AI tools**: 🪄 Prepare a Skill (6 guided steps) · 🧰 Tools (Gap Report, Quality Check, Duplicate Finder, Auto-Tag, Reading Level, Run now for new questions) · ✅ Review (Approve / Edit / Reject, approve all) · 🔍 Suspicious questions · 📜 Log (error rate) · ⚙️ Settings (provider, limits) · 📘 Guide.
- Reliable AI calls: JSON validated with the allowed values, automatic retries, “Failed” with a reason, rate limits respected, a queue that resumes, every request logged, student data never sent.
- The question generator: 10 per request, retry, logged, correct answers in random positions.
- See AI_AUDIT.md and AI_GUIDE.md.

---

# PROGRESS — Update 18 (MAP) and Update 19 (follow-up & classroom)

Tests: `tests/update18.test.ts` (10 tests) and `tests/update19.test.ts` (12 tests), fake Test School data, + the whole suite.

## Update 18 — MAP that follows the NWEA reports
- **Import** the NWEA CSV export **and** the **ASG PDF** (Achievement Status & Growth: Spring projection); students not found are listed.
- **📋 MAP plans** (Teacher → MAP plans): 📊 class matrix (RIT, band of 10, descriptor, Focus / Keep / Extend per area, Fall → goal, “now ≈”, ⚠ retest when rapid guessing ≥ 30%), Excel / PDF; 📏 mid-unit check; **draft plan per student** → edit areas, skills, number of questions, due date, note → send to one or all; 👀 preview / PDF; 👥 small groups (same area + band) → send a set or print a worksheet. Admin: RIT band settings.
- **Student → My MAP**: Fall results, “X RIT points to my goal” with a progress bar, scores history, goal areas in the right order with Practise, my plan (PDF), my MAP work. MAP work left My work (banner).
- **Numbers on icons** (My work, My MAP, Respond, Badges, My words; Alerts for staff), red when late / due today; notifications “Your MAP results are in” / “Your MAP plan is ready”.
- **🔗 Bank ↔ MAP goal areas** (Admin → Skills): unlinked skills first, suggestion from the CCSS standard, apply all or one by one.
- MAP plan in the **parent report**.

## Update 19 — follow-up, words, worksheets, routines
- **🚨 Alerts** for teachers and the head of department: no practice 7 days, weak skill, dropped a level twice, late work, MAP risk, rapid guessing → write what you did → handled; admin sees what is not handled; Excel.
- **🏫 Department week** (admin): classes side by side, hardest skills per grade, alerts; PDF + Excel.
- **🖨 Worksheets**: pick questions → name/class/date header, passage once, key on its own page, reorder, versions A/B, print/PDF, save & share with colleagues; small-group worksheet.
- **📖 Double-click a word** (practice, quizzes, ReadMaster, review): meaning, part of speech, pronunciation, synonyms, antonyms, example; **📒 My words** + weekly quiz; **Admin/Teacher → Dictionary** to write the school's definitions (unit vocabulary ⭐).
- **🔁 Review my mistakes** (1 → 3 → 7 days). **💬 Teacher comments** (student + parent). **🚩 Unclear question** button → Admin → Flagged questions.
- **📅 My week** (teacher): suggestions per class + ⚡ Plan next week, class goal, weekly rhythm (student reminder), 🎫 exit tickets with live results. Students: my weekly goal, class goal, practice days.
- **✅ First-week checklist** for teachers; **❔ tour** for students; 🔒 Privacy page.

---

# PROGRESS — Update 20

Tests: `tests/update20.test.ts` (19 tests) + `scripts/load/school-sim.ts` (100 students at once) + the whole suite. See PERFORMANCE.md.

- **🧭 MAP practice test** (Teacher → MAP ▾): the admin opens a window (grade, before Winter/Spring, Reading/Language, 50 questions each); bank readiness check; students take an adaptive MAP-like test (one question per screen, no going back, no right/wrong, pause & resume, rapid-guess warning, 5-question warm-up); results with a range, per goal area, on track for the Spring goal; plan drafts from the results; school view; accuracy vs the real MAP and question RIT correction.
- **🖨 Print box**: 🖨 + next to any question (Question Bank, Preview, Worksheets) → box at the top → print as is or **in 3 levels** with keys.
- **New look**: sign-in page, grouped menus with numbers, admin home with live tiles and 🔎 tool search, spinners on every button, comfortable-reading mode (Aa) for students, app on the home screen (PWA) with an offline page.
- **Teachers**: ✍️ writing with a 4-point rubric and 🎙 reading aloud (recordings), 🔒 private notes, quick comments, 📋 copy an assignment to another class, 🗓️ calendar, 📈 MAP growth report, share all parent reports, ❔ guide.
- **Students**: ☀️ question of the day, 🏁 class challenge, new badges (Growing, Band Up, Word Collector, Test Ready), growth message in My MAP.
- **Head of department**: 👀 class visit (read only), 🧾 end-of-term report, 🔑 sign-ins, 💾 Excel backup, 🩺 error log, bank readiness tile.
- Parent pages in English only.
- **🔎 Find a student / full file** (admin: the whole school; teachers: their classes): everything about one student on one page, and 👁 “See it as the student does” (view only).
- **Respond to Reading: Model Answer** column (teachers only, never shown to students) in the Excel / Word import and the editor.

## Update 22
- ⚡ Students & MAP Setup (/admin/quick-students): paste a class's names → accounts (username from the name, AJ26-### numbers when the school has none, temporary passwords) + printable sign-in cards; links to the roster and MAP templates and manual MAP entry.
- MAP scores (template, NWEA file, ASG PDF or typed) → individual plan drafts for both subjects at once; class teachers are notified when an admin imports. Untouched drafts are rebuilt from new scores; drafts the teacher edited (MapPlan.editedAt) are kept.
- Plans from overall RIT only (no goal-area scores): every area of the subject at the student's band, status from the descriptor.
- 🖨 Print all individual plans of a class (/teacher/map-plans/print), one per page; 3-Level Group Plan (Personalized plan) linked from MAP plans and the MAP menu.
- The questions import recognises Respond to Reading, ReadMaster, MAP and roster files and says where they go.
- Headings, page titles and menu labels in Title Case.
- Schema: MapPlan.editedAt (run `npx prisma db push`).
