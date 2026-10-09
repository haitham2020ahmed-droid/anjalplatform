# DECISIONS (Update 15)

| # | Decision | Why | Reversible? |
|---|---|---|---|
| 1 | **No new question store.** Tags are *derived* (map place → grade/unit/text set/section/level; skill → standard, MAP subject, goal area; difficulty → estimated RIT band). | Every question is already in one `Question` table; copying tags would drift out of sync. | — |
| 2 | **No AI auto-tagging**; derived tags are marked **Suggested** until an admin verifies them (10% random sample per skill, or the whole batch). | Derivation is exact for the map/skill/standard tags; AI would only guess what is already known. | Yes (undo button). |
| 3 | Review status and calibrated RIT are kept in `Question.tags` (JSON). | No schema change. | Yes. |
| 4 | RIT estimate = grade Fall mean ± 1 SD across difficulty 1–7; **recalibrated** from ≥15 careful answers of students with a MAP score: mean RIT + 10 × ln(wrong/right). | RIT is 10 points per logit. | Re-run any time. |
| 5 | Students with no data start at **On Level**; boards and assign results say how many. | The prompt. | Settings. |
| 6 | Ladder rules editable in Settings (defaults = the old behaviour: 80 % of 5 up, ≤25 % of 4 down; mastered = 80 % over 10+ answers). | The prompt. | "Restore defaults". |
| 7 | **Grade coordinator** = a teacher ticked in Settings → Grade coordinators (school setting), not a new role. They READ every class of their grades; they assign only to their own classes. | A new enum value touches every role switch; a setting is reversible. | Untick. |
| 8 | Automatic placement order: their level in this section → platform accuracy (last 30 days, ≥10 answers) → Placement test → MAP Lexile → MAP percentile → On Level. | Most direct and recent evidence first. | — |
| 9 | Respond to Reading upload: Excel, CSV, **Word (.docx)** and **text**; a PDF must be saved as Word first. | PDF text extraction is unreliable for lists. | — |
| 10 | **Photo upload deferred.** "I finished my answer in my book" + teacher tracking (score 0–4, comment) now. | Render wipes the disk on each deploy; photos need external storage (e.g. Cloudflare R2). | — |
| 11 | MAP goal-area descriptors (Low…High) are stored as the RIT at the middle of that percentile range for the grade & season. | Plans and charts already work on RIT. | Re-enter. |
| 12 | Status "on track / at risk": MAP mid-year vs half the projected growth; otherwise platform accuracy (<50 % = at risk); otherwise Fall percentile <21. | Uses the best evidence available. | — |
| 13 | Alerts are computed live on the teacher home (at risk · dropped twice · not started by due date). | Nothing to clear or go stale. | — |
| 14 | Duplicate-skill merging (Update 16) waits for the school's approval of a list. | Moving questions between skills is hard to undo. | — |

# DECISIONS (Update 16)

| # | Decision | Why | Reversible? |
|---|---|---|---|
| 15 | One master skills list (`masterSkills`) = active skills of the school's grades, without the hidden “Unclassified” holder. Lists switched to it: teacher Curriculum (+ “More skills”), Assignments → New, Games, ReadMaster. | One definition; new skills appear everywhere. | — |
| 16 | Duplicates are **detected** (meaning key), **merged only when the admin presses Merge**, moving questions / assignments / links and switching the other skill off; **Undo** restores it. Practice history stays where it was recorded. | Merging is a real product decision and hard to undo by hand. | Undo. |
| 17 | **Skill games** = a game screen over the adaptive practice engine (10-question rounds, timer, points, streak). Every answer counts toward mastery and points; the student plays at their own level. Live (Kahoot-style) games stay as whole-class fun with their podium. | Reuses the tested engine; nothing new to calibrate. | — |
| 18 | Students may practise / play any skill of their own grade (“My skills”), not only assigned ones. | The prompt (free practice). | — |
| 19 | QR joins are recorded in the audit log (`game.join`, via QR or link). | No schema change. | — |
| 20 | Badges are computed from real records on each visit and saved the first time (StudentBadge); bonus points: +10 Respond answer, +50 level up. No leaderboards for students. | Cannot be gamed from the browser. | — |
| 21 | Parent report sharing = a school setting per student; the parent is notified; “Stop sharing” hides it again. | No schema change. | Yes. |
| 22 | Teacher follow-up: “checks results” = opening the Students pages (logged); “responds to alerts” = an at-risk student got new work within N days. Rules editable on the page. | Measurable from existing data. | Settings. |
| 23 | Section status on the teacher Curriculum page: Not assigned · x/y done · Finished · Needs help (someone late). | Simple and actionable. | — |
| 24 | Load test against the live site is not run from here (no access); queries of the new pages read a fixed number of tables per page (no per-student loops except the small per-class report list). | — | — |

# DECISIONS (Update 17 — AI tools)

| # | Decision | Why |
|---|---|---|
| 25 | Duplicate Finder and Gap Report are code, not AI. | Exact, free, instant; no rate limits. |
| 26 | Quality Check also runs code checks (no correct option, several correct, identical options) before the AI. | Catches the clearest problems for free. |
| 27 | Approve applies only safe changes: tags, a single corrected key, reading level, archiving a duplicate copy. Other problems are fixed by the admin in the editor. | The AI never rewrites questions by itself. |
| 28 | The weekly check of new questions starts when an admin opens AI tools and a week has passed (plus “Run now”). | Render's free plan has no scheduler; it runs while the page is open, in small batches. |
| 29 | “New” = added after the AI tools were first opened and not yet checked + tagged. | Avoids re-checking the whole bank every week. |
| 30 | Wizard priority: work assigned with an upcoming due date → earlier units → lowest student accuracy. | “Upcoming lessons first, then weakest.” |
| 31 | Default limits 4 requests / minute, 200 / day, 5 questions per request; editable. | Safe for the free tier; AI Studio shows the real numbers. |

# DECISIONS (Update 18 — MAP, Update 19 — follow-up & classroom)

| # | Decision | Why |
|---|---|---|
| 32 | MAP is shown in the **six goal-area groups of the NWEA reports** (Literary, Informational, Vocabulary · Grammar & Usage, Mechanics, Writing); the platform's 10 finer areas map onto them. | Teachers read the same words as on the Grade / Family reports. |
| 33 | **RIT bands of 10** (as the NWEA “10 Point Range”), from 150 to 250, editable by the admin. Descriptors Low < 21, LoAvg 21–40, Avg 41–60, HiAvg 61–80, High > 80 by grade and season (2025 norms). | Copied from the NWEA reports. |
| 34 | Status per area: FOCUS (Low/LoAvg or 3+ RIT under the student's own RIT) · EXTEND (HiAvg/High and 3+ over) · MAINTAIN. | Simple and explainable. |
| 35 | Plans are **drafts** until the teacher sends them; each area = one adaptive MAP set of questions of the student's band + the band above (widened if fewer than 8). Sent plans are kept; new MAP scores (Winter) make a new draft. | “The teacher checks and edits before sending.” |
| 36 | Area order for the student: by MAP goal RIT once scores exist (latest term; equal → weaker platform accuracy), before that by platform accuracy. | The user's rule. |
| 37 | Goal counter: target = Fall RIT + NWEA projected growth; “now” = latest MAP RIT, or the platform estimate when higher (Rasch, 10 RIT per logit, careful answers of 45 days, 15+). | Motivating but honest (“about”). |
| 38 | MAP work moves to My MAP; My work shows a banner. Numbers on icons: blue = to do, red = late or due today. | The user's request. |
| 39 | ASG PDF: read with pdfjs (text positions → rows by student ID); only scores + projections, no other personal data. Unmatched students are listed after the import. | The CSV export has no projection. |
| 40 | Bank ↔ MAP linking is per skill family, suggested from the CCSS code, applied only when the admin presses Apply / Save. | The admin stays in control. |
| 41 | Alerts are **stored** (StudentAlert) once per student + reason + week, scanned at most every 3 hours when a teacher/admin home or the alerts page opens (Render has no scheduler); one notification per person per scan. | Follow-up needs a record of what was done. |
| 42 | Dictionary: dictionaryapi.dev (free, no key); only the word is sent; results cached per school; teachers/admins can override (“SCHOOL”). Not found → retried after 7 days. | Free, private, fast. |
| 43 | Review of mistakes: 1 → 3 → 7 days; 3 right after the last mistake = learned; review answers are saved as practice (they count). | Spaced repetition, simple to explain. |
| 44 | Student tour remembered in the browser (localStorage), not in the database. | A convenience only. |
| 45 | Not done (later): promoting students at year end (needs a roster decision), a full privacy policy text (a short Privacy page exists). | Need the school's decisions. |

# DECISIONS (Update 20)

| # | Decision | Why |
|---|---|---|
| 46 | MAP practice test = Rasch, 10 RIT per logit, prior ±15 RIT around the latest MAP RIT; next item = one of the 4 closest to the estimate; even blueprint per goal-area group; items from the grade below/above too; rapid guesses (< 3 s, < 6 s with a passage) not scored. | As close to MAP Growth as a school bank allows; varied items between classmates. |
| 47 | Result = RIT ± 1 SE (as NWEA shows a range); “expected now” = Fall + 55% (Winter) / 100% (Spring) of the projected growth; on track = within 2 RIT. | Simple and honest. |
| 48 | After the real MAP: accuracy (mean difference, % within 5 RIT) and item RIT correction b = MLE from real scores, mixed with the old value by n/(n+10). | The estimate improves each season. |
| 49 | Print box lives in the browser (localStorage, max 40); 3 levels = the same skills at Below / On / Above (difficulty 1–3 / 4 / 5–7), nearest level when missing; students see only ● ●● ●●●. | Fast, no schema; level names stay hidden. |
| 50 | Navigation: staff menus grouped (Teach · Students · MAP / Content · Follow-up · MAP · School); students keep one flat bar. | 20+ items no longer fit one line. |
| 51 | Reading-aloud audio stored in the database (≤ 2 MB, MEDIUMBLOB), listened through an authenticated route. | No extra storage service. |
| 52 | Error log keeps only the message, page and reference (no student data), at most 50 per minute. | Useful for the developer, safe. |
| 53 | Platform and parent pages are English only (the user's request). The PDF report engine keeps its Arabic option internally but it is no longer offered. | Request: “no Arabic at all”. |
| 54 | Class challenge compares classes (answers per student), never individual students. | Motivation without shaming. |

55. MAP Skill Plan by RIT range (Update 22): six ranges per grade around the NWEA 2025 Fall norm (cuts at mean + sd × −0.65, −0.24, 0.12, 0.35, 0.59 — Grade 6 Reading gives the published < 198 · 198–204 · 205–210 · 211–214 · 215–218 · 219+). Only the platform's own skills are listed (no third-party skill lists or codes). A range without questions of its RIT shows and assigns the nearest range's skills.
56. A school admin may assign work to a class; it is recorded as from the class's teacher (the first one). A class without a teacher cannot receive work.
57. MAP reports (Update 23). The Learning Continuum is imported by the school (LearningStatement, global; never shipped in the repo). Study plans: Reinforce = statements of the band below no longer listed in the student's band, Develop = their band, Introduce = new in the band above; the short version keeps 18 / 6 / 6 statements, grade-level (±1) and not-yet-mastered first, taken in turn from every sub-topic. Statements link to skills by CCSS code, then parent code, then the same anchor in the student's grade; within a level skills sharing words with the statement come first.
58. Family Report: national averages use the grade the student was in at each term (Reading Grades 4–6 from the database; other grades and Language Usage approximations, marked ≈). Growth = latest test − the latest Fall before it; expected growth = the NWEA projection (Fall → Spring) or the norm difference; growth percentile estimated with SD 8 (within a year) / 9 (Fall → Fall) and always labelled estimated.
59. Parents see the MAP Family Report and the Study Plan only once the teacher has shared the child's report; students always see their own.
60. Design system (Update 24): Lexend (a typeface made for easier reading) for the whole interface, self-hosted with next/font; the role's whole map in a navy side bar (groups fold, the choice remembered per browser; a drawer on phones); one search (Ctrl/⌘ K) for pages, and for staff students, classes and skills. Colour carries meaning everywhere: teal = action/progress, violet = MAP data, gold = achievement, red/amber = needs attention.
61. Everything links to its hub: a student → their full file, a skill → the Skill Hub (/skill/[id]: curriculum, standards, questions by level, MAP goal area and RIT of its questions, Curriculum Map places, Learning Continuum statements, learning order, students), a class → its page; the Connections page (/admin/connections) checks every link of the learning thread on live data and lists the gaps with where to fix them.
