# Curriculum Map (Grades 4–6)

Grade → Book → Unit → Text Set (G4–5) / Selection (G6) → Shared Read (G4–5) → Genre → Category → Skill → Level

- Source of truth: `data/curriculum-map/source.txt` (the school's text, unchanged). Every name is read from it.
- Table: `CurriculumMapNode` (one row per node; tree via `parentId`; `sortOrder` = order in the source).
  Shared Read and Genre are fields of the Text Set / Selection node; the skill(s) in parentheses are the
  Category's `skills` (Analyze Craft and Structure keeps all its skills in one string).
- Question attachment nodes (`acceptsQuestions = true`): every “1- Concept Vocabulary” category, and the
  Above / On / Below levels of “2- Analyze Craft and Structure” and “3- Respond to Reading” (G4–5 only).
- Stable IDs (`code`), unique per grade: `G4.BOOK`, `G4.U1`, `G4.U1.TS1`, `G4.U1.TS1.CV`, `G4.U1.TS1.ACS`,
  `G4.U1.TS1.ACS.ABOVE|ON|BELOW`, `G4.U1.TS1.RTR.*`, `G6.U1.SEL3.CV`, … (for future Question Bank / import mapping).
- Independent of the adaptive curriculum (Unit / Lesson / Skill), which it does not change. No questions are linked yet.

Commands (in order):
1. `npx tsx scripts/curriculum-map.ts backup` (all curriculum tables → `backups/curriculum-<date>.json`)
2. `npx prisma db push` (adds the new table; nothing else changes)
3. `npx tsx scripts/curriculum-map.ts seed` (every school with Grades 4–6; refuses without today's backup; never deletes)
4. `npx tsx scripts/curriculum-map.ts verify` (node-by-node, field-by-field comparison with the source + summary)

Screen: Admin → 🧭 Curriculum Map, and Teacher → 🧭 Curriculum Map (read only).

## Questions on the map (Import to Curriculum)

- One question record; `QuestionMapLink` places it on ONE attachment node. Every question is in the Question Bank;
  a link also puts it on the map. Bank-only questions have no link (one way: curriculum → bank, never bank → map).
- `QuestionUse`: PLACEMENT and/or MAP_TEST (both allowed) for any bank question.
- Import page has two tabs: 📚 Import to Question Bank (unchanged template + optional “Use” column) and
  🧭 Import to Curriculum (advanced template: every place pre-listed with N ready rows (`?per=1..20`, default 5),
  drop-downs, a Curriculum Map sheet with every ID; empty rows are skipped; up to 5,000 questions per file).
- Curriculum rows: place by Unit / Text Set / Category / Map Level, or by Curriculum Map ID (both must agree when
  both are given). Skill and Standard optional (no skill → the grade's inactive “Unclassified (Curriculum Map)” skill;
  no standard allowed only for curriculum questions). Empty Difficulty → Above 5, On 4, Below 3, Concept Vocabulary 4.
- Editor: “Where does this question go?” (Question Bank only / Curriculum Map) + place picker + Placement / MAP test.
- Curriculum Map page: count per place, link to its questions in the bank, ➕ Add question (opens the editor on that place).
- Question Bank: badges (🧭 place, Placement, MAP test) and filters (On the map / Bank only, Use, one place).
- Deleting a question removes its link and uses; backups and restore include both tables.

## Levels, tests, results (Phase: levels)

- `StudentLevel` (Above / On / Below): set by teachers (🎯 Levels & tests) or by the Placement test (80%+ Above,
  50–79% On, under 50% Below). No level = On Level when assigning.
- ⭐ Assign by level (Curriculum Map → category): one question set per level; empty levels fall back to On Level
  (then any level), with a note. Concept Vocabulary: one set for everyone.
- Placement test / MAP practice test: from questions marked Placement / MAP test (≥ 5 needed), 5–50 questions,
  mixed difficulty and skills. MAP test report groups strengths/needs by MAP goal area.
- 📊 Curriculum results: answers and % correct per place for a class; weakest places listed.
- 🏷️ Classify curriculum questions: give Unclassified questions a real skill of the same grade.
- School logo: stored in the database (`SchoolAsset`), so redeploys no longer lose it.

## MAP Reading RIT (🗺️ MAP RIT)

- RIT scores: imported MAP files (MapResult, overall rows) or entered by staff per class and term (“Fall 2026”).
- National averages: NWEA 2025 MAP Growth Reading norms (mean / SD by grade 4–6 and season), bundled in
  `src/server/map/national-norms.ts`, stored once in BenchmarkReference (scope NATIONAL), editable by admins.
- Ranking (grade or class), difference from the national mean, percentile (NWEA's when imported, else ≈ from mean/SD),
  NWEA bands (Low <21, LoAvg 21–40, Avg 41–60, HiAvg 61–80, High 81+), and Above / At / Below the class average
  (±3 RIT). “Set student levels from the class average” writes StudentLevel (source MAP_RIT).

## MAP scores import, student MAP page, adaptive MAP practice

- 📥 Import MAP scores (MAP RIT page): template pre-filled with the teacher's students (Student Number, Name,
  Fall RIT, Spring Projection, optional Percentile). Saves the Fall Reading RIT and projected growth
  (Spring Projection − Fall RIT). Blank rows skipped; same Fall again replaces; teachers: own classes only.
- MAP RIT table: “Spring projection” column; in Winter/Spring it shows how far each student is from it.
- 🗺️ My MAP (student): RIT, national comparison, Spring goal (met / to go), and MAP practice per goal area
  (weakest first). MAP practice = the adaptive engine on the student's own-grade skills linked to MAP goal areas
  (bank and classified curriculum questions); its first ability estimate comes from the RIT (z-score), so the first
  question matches the student's level, then every answer moves it.

## Adaptive curriculum levels driven by Lexile

- Lexile bands (src/server/curriculum-map/lexile.ts): CCSS Appendix A text-complexity bands (Grades 4–5 740L–1010L,
  6–8 925L–1185L). On Level per grade: G4 740–875L, G5 875–1010L, G6 925–1010L; under = Below, over = Above.
  Admins can change them (Student levels page). `Question.lexile` and `MapResult.lexile` (new nullable columns).
- Adaptive set (Assessment.isAdaptive): the whole pool of a category (Below + On + Above questions); each student
  answers up to N. Start = Lexile level (MAP) → saved level → Below (Placement: On); fixed by the first question
  answered. Promote: 4 of the last 5 correct at the level (min 4 there); demote: ≤1 of the last 4; finish when
  Above is passed, the limit is reached, or no question is left. Next question at a level = Lexile closest to the
  student's (else easiest). On finish the student's level is updated (source ADAPTIVE / PLACEMENT).
- Assign from the map: Adaptive (default) or Fixed by level. Placement test: adaptive over marked questions + every
  curriculum question of the grade (automatic). MAP practice test: marked + classified curriculum questions.
- Imports: “Lexile” column (question; flagged when outside its level's band) and “Fall Lexile” (MAP scores).

## ⭐ ReadMaster (leveled articles, Achieve3000-style)

- Tables: ReadMasterArticle (code, title, topic, grade, skill, DRAFT/PUBLISHED), ReadMasterVersion (BELOW/ON/ABOVE,
  Lexile, text), ReadMasterQuestion (version ↔ Question; questions are regular bank questions carrying the
  version's Lexile and text), StudentReadingLexile, ReadMasterAttempt.
- Student reading Lexile: saved → MAP Lexile → middle of the grade's On band. Version shown = level of that Lexile
  (grade Lexile bands); nearest available version if missing. One attempt per article; 75%+ → +30L, <50% → −30L
  (100–1800L). Crossing a band edge switches the next articles to the next version.
- Staff: /admin/readmaster (list, create, import with ready template incl. Solar System example), article page
  (three versions, add questions one by one, publish, results). Students: /student/readmaster.
- Deleting a question removes its ReadMaster link; question backups/restore include ReadMasterQuestion.
