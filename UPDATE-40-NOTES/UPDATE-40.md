# Update 40 — intervention lessons for every focus skill + fast Data Health

Branch `update-20`, base 145399c. Tests 966 → **981 pass**, `tc.sh` clean, `full-150` load 248/248 checks, 0 errors.

## Task 1 — Intervention lessons

### What was missing
Lesson content was TypeScript (built-in, `src/server/lessons/content.ts`, no review/publish status), one lesson per
**skill family**; only the 44 reading + vocabulary families had one. On the sim DB, the assignable focus skills (active
skills of each grade's active curriculum, the `computeTiers` filter) were 200, of which **90 had no lesson, in 34 families**:
every grammar (20), language/mechanics (5), spelling (1) and writing (6) family, plus the 🔤 Grammar bank's general families
(`gr.grammar-usage`, `gr.mechanics`, `gr.writing-revision`; ~235 workbook skills such as "Irregular Verbs: Past Tense").
All vocabulary / word-study families already had lessons (context clues, prefixes, suffixes, roots, multiple-meaning,
synonyms/antonyms, idioms, figurative language, connotation/shades of meaning, academic vocabulary …).

### Added: 35 original lessons (same format: definition, 3–5 steps, signal words, 70–170-word model text with clue
sentences, worked example, think-aloud, organizer, 2 sentence frames, 2 re-teach approaches, warm-up). Grades 4–6 share a
family lesson (the existing convention); grade is the skill's grade (G4–G6, except capitalization / possessive nouns /
apostrophes / combining / verbs / SVA / negatives / prepositions / titles / comparatives = G4–5 and writing-poetry G4–5,
writing-research G5–6, as in the curriculum). Arabic-L1 errors are taught explicitly (missing *is/are*, adjective after
the noun / plural adjectives, a/an, plural after numbers, in/on/at, he/she for things, SVA with words in between, double
negatives, capitals, *the jacket of the boy* → *the boy's jacket*, adverb word order). No Respond-to-Reading lesson
(not a family; G6 RTR skipped as asked). English only, no publisher text.

| family | lesson | model text | organizer |
|---|---|---|---|
| `sentences` | Sentences and Sentence Types | The Class Garden | RULE_EXAMPLES |
| `subjects-predicates` | Subjects and Predicates | The Busy Market | RULE_EXAMPLES |
| `fragments-run-ons` | Fragments and Run-On Sentences | Omar's Draft: A Trip to the Desert (with two mistakes) | SENTENCE_FIX |
| `compound-sentences` | Compound Sentences and Conjunctions | The Science Fair | RULE_EXAMPLES |
| `clauses-complex` | Clauses and Complex Sentences | The Lost Library Book | RULE_EXAMPLES |
| `combining-sentences` | Combining Sentences | Sara Revises Her Kite Story | SENTENCE_FIX |
| `nouns` | Nouns: Common, Proper, Concrete, Abstract, Collective | A Visit to the City Museum | RULE_EXAMPLES |
| `plural-nouns` | Singular, Plural and Irregular Plural Nouns | The Farm Trip | RULE_EXAMPLES |
| `possessive-nouns` | Possessive Nouns | Lost and Found Day | RULE_EXAMPLES |
| `verbs` | Action, Main, Helping and Linking Verbs | The Night Before the Race | RULE_EXAMPLES |
| `verb-tenses` | Verb Tenses (Simple, Progressive, Perfect) | Our Town Then and Now | RULE_EXAMPLES |
| `irregular-verbs` | Irregular Verbs | The Day I Forgot My Lines | RULE_EXAMPLES |
| `subject-verb-agreement` | Subject-Verb Agreement | The Robot Club | RULE_EXAMPLES |
| `pronouns` | Pronouns and Antecedents | Baking With Grandmother | RULE_EXAMPLES |
| `pronoun-homophones` | Pronouns, Contractions and Homophones | The Class Pet | RULE_EXAMPLES |
| `adjectives` | Adjectives, Articles and Order of Adjectives | The Market Stall | RULE_EXAMPLES |
| `comparatives` | Comparing with Adjectives and Adverbs | Three Paper Planes | COMPARE |
| `adverbs` | Adverbs and Relative Adverbs | Early Morning at the Beach | RULE_EXAMPLES |
| `negatives` | Negatives and Double Negatives | The Quiet Library | SENTENCE_FIX |
| `prepositions` | Prepositions and Prepositional Phrases | Where Is Pepper? | RULE_EXAMPLES |
| `capitalization` | Capitalization | My Pen Pal | RULE_EXAMPLES |
| `commas` | Punctuation and Commas | Packing for Camp | RULE_EXAMPLES |
| `quotations-dialogue` | Quotation Marks and Dialogue | The Broken Vase | SENTENCE_FIX |
| `titles-abbreviations` | Titles, Abbreviations and Letter Format | A Thank-You Letter | RULE_EXAMPLES |
| `apostrophes-contractions` | Apostrophes and Contractions | Getting Ready for the Picnic | RULE_EXAMPLES |
| `spelling` | Spelling Patterns | The Spelling Detective | RULE_EXAMPLES |
| `writing-argument` | Argumentative / Opinion Writing | Every Class Needs a Reading Corner | CLAIM_EVIDENCE |
| `writing-informative` | Informative / Expository Writing | How Camels Live in the Desert | CENTRAL_IDEA_DETAILS |
| `writing-narrative` | Narrative Writing | The Missing Key | PLOT_MAP |
| `writing-poetry` | Poetry Writing | Morning in the Courtyard | NONE |
| `writing-research` | Research and Sources | How Faris Researched Sea Turtles | CLAIM_EVIDENCE |
| `precise-language` | Precise Language, Style and Tone | Nasser Revises His Report | SENTENCE_FIX |
| `gr.grammar-usage` | Grammar and Usage: Editing Sentences | Ahmad's Draft: My Best Friend (with three mistakes) | SENTENCE_FIX |
| `gr.mechanics` | Capitals and Punctuation: Editing | Dana's Draft: Our School Trip (with three mistakes) | SENTENCE_FIX |
| `gr.writing-revision` | Revising a Draft | Lama's Draft: The New Park (before revising) | SENTENCE_FIX |

Two new generic organizers: `RULE_EXAMPLES` (rule in my words + examples) and `SENTENCE_FIX` (sentence · what I changed · new sentence).

### Grammar-bank skills
`lessonForSkill()` (content.ts) is now the one lookup used by student lessons, teacher lessons/script cards and the RTI
weekly plan: family lesson → for a Grammar-bank skill (`gr.*` family or `.grammar.` code) the lesson its **name** points
to (alias table `GRAMMAR_NAME_LESSONS`; all 194 distinct skill names of the Grammar workbooks (G4–G6) map to a specific lesson,
only "Revising and Editing a Draft" uses the general revision lesson) → the kind's general lesson.

### Practice items
Lessons keep using the skill's own published bank questions (guided 3 / independent 3 / check 5) — no new questions created.

### Validation
- `tests/update40-lessons.test.ts` (9 tests): every family (all domains) has a lesson; every assignable skill resolves to
  one; each new lesson structurally complete; no Arabic script / "Lexile" / publisher names; **answer keys consistent**
  (each clue is exactly one choosable sentence, a sentence quoted in the answer is a clue, ≥5 wrong choices); new
  organizers; 23 Grammar-bank names → expected lessons; teacher list + script card; a student runs a grammar lesson
  (worked example → guided items of that skill); RTI weekly plan with SVA / commas / roots focus → lesson, no fallback.
- Render: real `openLesson` views on a sim copy rendered with the real `LessonPlayer` (G4 SVA model, G5 adjectives
  answered + organizer, G5 titles letter, G4 fragments guided + SENTENCE_FIX organizer, G6 Grammar-bank guided) at 390 and
  1366: **no horizontal overflow** (`/tmp/claude-0/-home-claude/a9f79ad9-d909-5f59-8f2e-44fdec5f3db7/scratchpad/u40/shots/*.png`, `overflow.json`). The render found a pre-existing phone overflow
  (484 px) in the MODEL step when the organizer is opened (grid item min-width) — fixed with `min-w-0` in lesson-player.
- RTI on the sim (`/tmp/claude-0/-home-claude/a9f79ad9-d909-5f59-8f2e-44fdec5f3db7/scratchpad/u40/rti-plan.json`): weekly plans of all 8 classes — 65 focus groups; with the old lessons **22
  groups (29 students) fell back → now 0**. Sim history: **47 of 112 teacher interventions** were on focus skills without a
  lesson (= readiness P-10 "47") → now 0. Candidate focus skills (≥5 answers, <60 %) of Tier 2/3 students: 99 of 318
  without a lesson → 0. Remaining fallbacks: only "no focus skill yet" groups (by design).

## Task 2 — Data Health

Cause: `dataHealth` → `levelConflicts` → `sourcesOf` built the whole Level Story for every student: `levelThetas` ran
~12 EAP estimates per student (decline windows, 3 weekly trends, per-skill offsets) although a conflict needs only the
level; answers, MAP, Diagnostic and practice were each read twice. Not an N+1 (32 queries) — CPU + double reads.

Fix (results identical):
- `conflictSources`: only PLATFORM / DIAGNOSTIC / MAP levels in sourcesOf's order; θ only where a Diagnostic/MAP extreme
  makes it matter; `levelThetas(…, { rows, only: "theta" })`; one answers read shared with `activityStats` (the 3 practice
  numbers Data Health uses, exactly as practiceStats); MAP/Diagnostic/names/grades read once and passed in.
- `estimateAbilityEAP`: per-item grid logs computed once (shared cache per `levelThetas` call), no object per grid point,
  the ×0 term skipped — **bit-for-bit** the old values (test vs a copy of the old function, 120 random cases).
- SqliteRepo (tests/sim only): faster row copy and per-model conversion lists.

| (sim, 200 students, test.admin, no fake clock) | before | after |
|---|---|---|
| Data Health time (warm) | 7.4–7.7 s | **0.86–0.99 s** (first call ~1.2 s) |
| DB queries | 38 first / 32 warm | **17 / 11** (constant, not per student) |
| answer rows read | 201,542 | 90,628 |
| under the sim fake clock | 7.2–7.9 s | 0.84–1.1 s |
| `levelThetas` full, 200 students | 6.7 s | 1.85 s (identical output) |
| `levelConflicts` one class | 0.89 s / 21 q | 0.15 s / 14 q |

Output identical: JSON of `dataHealth` before (HEAD worktree) and after compared equal on the sim (fake clock and real
clock); `tests/update40-health.test.ts` (6 tests) compares the fast conflicts with the full Level Story for every student
of a varied seeded world (MAP/Diagnostic/platform conflicts both ways, rapid-guess-invalid and expired Diagnostics,
hints, partial credit, game/review answers), Data Health rows with a plain recomputation, activityStats with
practiceStats, levelThetas preloaded/θ-only with the plain call, and that the query count does not grow with students.

Also faster (same helpers): teacher Support Groups (levelConflicts), the daily level evaluation and level pages
(levelThetas / EAP). MAP family reports / study plans (Stage 4: 2,650 / 2,297 calls, 1,389 QuestionAttempt reads) now
measure ~0.1 s and ~600 / ~510 calls on the sim — the QuestionAttempt reads are already gone; the rest is per-student
lookups in `familyReport`/`studyPlan` (reportStudent access checks, norms, profiles), a different helper — left as is.

## Files
- new: `src/server/lessons/content-language.ts`, `src/server/lessons/content-writing.ts`, `tests/update40-lessons.test.ts`, `tests/update40-health.test.ts`
- changed: `src/server/lessons/content.ts` (imports, organizers, `GRAMMAR_NAME_LESSONS`, `lessonForSkill`), `run.ts`, `teacher.ts`,
  `src/server/tiers/weekly-plan.ts`, `src/components/lessons/lesson-player.tsx` (min-w-0), `src/server/insights/level-story.ts`,
  `src/server/insights/student-data.ts` (`activityStats`, preloaded rows for practiceStats/mapSummaries),
  `src/server/curriculum-map/level-evidence.ts`, `src/adaptive/irt.ts`, `scripts/db/sqlite-repo.ts`. No schema change.

## Scratch
Scripts `/tmp/claude-0/-home-claude/a9f79ad9-d909-5f59-8f2e-44fdec5f3db7/scratchpad/u40/scripts` (rti, dh, phases, map, lt), render harness `/tmp/claude-0/-home-claude/a9f79ad9-d909-5f59-8f2e-44fdec5f3db7/scratchpad/u40/render`, results `dh-*.json`, `rti-plan.json`;
working DB copies in `/tmp/claude-0/-home-claude/a9f79ad9-d909-5f59-8f2e-44fdec5f3db7/scratchpad/u40/db` deleted.
