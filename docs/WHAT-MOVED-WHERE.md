# What moved where

The menus were shortened for every role. **No page was deleted. Every old address still opens.**
Pages that left a menu are reachable from the place listed below. Rare pages are under **More**, which starts folded.
Admins also find every admin page in **All Admin Tools** (`/admin/all`, searchable).

Source of truth: `src/components/nav-items.ts` (teacher and student menus) and `src/components/admin-tools.ts` (admin).
Checked by `tests/menus.test.ts`.

## Student

| Old menu entry / route | New place |
| --- | --- |
| Home `/student` | **My Work** `/student` (first entry) |
| My Plans `/student/plans` | Removed from the menu. Reachable from **My Reports** `/student/reports`; plan work appears in My Work. |
| Progress Report `/student/insights` | Removed from the menu. Reachable from **My Reports** `/student/reports`. |
| My Skills `/student/skills` | Removed from the menu. Reachable from **My Reports**. |
| Family Report `/student/family` | Removed from the menu. Reachable from **My Reports**. |
| MAP results `/student/map` | **Programs → MAP** |
| Curriculum Map `/student/curriculum` | **Programs → Curriculum Map** |
| RTI Program `/student/rti` | **Programs → RTI** (only for students in Tier 2/3) |
| (new) `/student/nafs` | **Programs → NAFS** (only when the student has NAFS; built by agent I) |
| ReadMaster, ReadRise, Fluency Coach | **Reading** |
| My Tests `/student/tests`, Badges `/student/badges` | **Achievements** |
| (new) My Certificates `/student/certificates` | **Achievements** (page built by agent I) |
| My Reports `/student/reports` | **My Reports** (top level) |
| My Lessons, Review, My Words, Respond to Reading, Writing, Word Sounds Check, My Reading Strategies, Help | **More** (folded) |
| Join Live `/play` | Removed from the menu. The **Join Live** button on the student home page. |

## Teacher

| Old menu entry / route | New place |
| --- | --- |
| My Students `/teacher/classes` | **My Students** `/teacher/students`. `/teacher/classes` redirects there. Each class keeps its class page, dashboard and levels links. |
| Find a Student `/admin/student-file` | Merged into **My Students** (ready list grouped by class + instant search). `/admin/student-file` redirects there; `/admin/student-file?id=X` opens the file. |
| MAP Scores `/teacher/map-rit` | Inside the **MAP** page `/teacher/map-center` (agent C). Address still opens. |
| MAP Plans `/teacher/map-plans` | Inside the **MAP** page (agent C). Address still opens. |
| MAP `/teacher/map-center` | **Programs → MAP** |
| Curriculum Map `/admin/curriculum-map` | **Programs → Curriculum Map** (agent D owns the page) |
| RTI Program `/teacher/rti-plan` | **Programs → RTI** (agent C owns the page) |
| Plans `/teacher/plans` | **Programs → Plans** (agent C owns the page) |
| Assignments `/teacher/assignments` | Inside **Plans** ("All plans sent"). Address still opens. |
| Student Progress `/teacher/progress` | **Reports → Class → Students dashboard**, and the **Dashboard** link of each class in My Students. |
| Who Needs Help `/teacher/intervention` | Button at the top of **My Students**; the "Need help" number on the Teacher Home. |
| Alerts `/teacher/alerts` | Button at the top of **My Students**. |
| Class Insights `/teacher/ai` | Button at the top of **My Students**. |
| Family Reports `/teacher/family-reports` | **Reports → Class → Progress report for parents** (preview, then Send to parents). Address still opens. |
| Reports `/teacher/reports` | **Reports**: a 3-step wizard (pick a report → class / student / group + period → preview → Download PDF or Send to parents). All old report pages still open. |
| My Week `/teacher/week` | **My Week** (top level): plan per day, due this week, not started, Live Challenges. Class goal, rhythm and exit ticket under "More for this week". |
| Assessments, Live Challenge, Messages | Top level |
| Support Tiers, Support Groups (now "Groups"), Data Meeting, Diagnostic Test, Progress Checks, Decoding Screener, Reading Fluency, ReadRise, Worksheets, Intervention Lessons, Writing & Reading Aloud, Respond to Reading, Dictionary, Grammar, ReadMaster, Calendar, Word Journals, Help | **More** (folded) |
| Levels `/teacher/levels` | **Levels** link of each class in My Students |
| Intervention Groups `/teacher/intervention/groups`, Strategy Groups `/teacher/strategy-groups` | From **More → Groups** and Who Needs Help. Addresses still open. |
| Teach · Check · Reteach `/teacher/learning-loop`, Skill Connections `/teacher/knowledge-graph` | Removed from the teacher menu. Addresses still open (admin: More). |
| Search `/teacher/search` | The search box in the top bar. Address still opens. |
| Class actions on the old home (Add Student, Upload Roster, Download Accounts, Upload MAP Scores) | Teacher Home → "Class accounts and scores" (folded) |

## Admin

The admin menu is now **Home · All Admin Tools · School · Content · Assessments & Programs · Reports · Settings · More**.
The Admin Home shows the same five sections.

| Old group / entry | New place |
| --- | --- |
| People & Classes | **School**: School Overview `/admin/school` (agent E), Users, Find a Student, Teacher Follow-Up. Students & MAP Setup, Class Visit and the rest → **More** |
| Teaching Content | **Content**: Question Bank, **Sort Questions** `/admin/skill-links` (was "Skill Links to Review", hidden), ReadRise Library, ReadMaster, Curriculum Map, Grammar, Dictionary |
| Programs & Data | **Assessments & Programs**: Tests by Teacher `/admin/tests`, MAP, Bank ↔ NAFS `/admin/nafs-links`, Below / On / Above `/admin/levels`, Support Tiers `/admin/tiers`, RTI Weekly Plan |
| ReadRise Library `/admin/readrise` | moved from Programs to **Content** |
| Teach · Check · Reteach | **More** |
| Reports | **Reports**: Analytics, End-of-Term Report, Reports to Approve, Reports hub, Department Week |
| Settings & System | **Settings**: Settings, AI Tools `/admin/ai-tools` (was under Content), Backup, Data Health, **Data Cleanup** `/admin/data-cleanup` (agent E), **Feedback** `/admin/feedback` (agent E). Connections, Errors, Search, Help → **More** |
| "More tools" (folded) | **More** (folded) — same pages |

## Other agents' planned moves (listed here so the table is complete)

| Agent | Page | Change |
| --- | --- | --- |
| C | `/teacher/map-center` | MAP Scores and MAP Plans live inside the MAP page |
| C | `/teacher/plans` | "All plans sent" replaces the old Assignments list |
| C | `/teacher/rti-plan` | RTI page (menu label "RTI") |
| D | `/admin/curriculum-map` | Curriculum Map page |
| E | `/admin/school`, `/admin/users`, `/admin/skill-links`, `/admin/data-cleanup`, `/admin/feedback` | School page, users, Sort Questions, Data Cleanup, Feedback inbox; the Feedback button in the top bar (`src/components/feedback/feedback-button.tsx`) |
| I | student pages, `/student/nafs`, `/student/certificates`, `src/server/student/menu-flags.ts` | NAFS page and the `studentMenuFlags` helper (the shell uses `"/student/nafs" in counts` until it lands) |

## Role guides

`/guide` shows a one-page Arabic guide for the signed-in role (admins can open all three with `?role=TEACHER` / `?role=STUDENT`).
