# AUDIT — Al-Anjal Adaptive ELA (before Update 15)

Fake test data only (the "Test School"). No real student data was used.

## What already existed
| Area | Where | State |
|---|---|---|
| One question bank | `Question` table (+ options, answers, explanations) | **Already unified**: Curriculum Map items, Skills, Grammar, Concept Vocabulary (G4–G6) and ReadMaster questions are all `Question` rows. ReadMaster links its rows through `ReadMasterQuestion`; the Curriculum Map through `QuestionMapLink`. No second store to merge. |
| Curriculum Map | `CurriculumMapNode` (Grade → Unit → Text Set/Selection → Section → Level) | Content structure; questions attach to Section/Level nodes. Levels shown Below → On → Above. |
| Respond to Reading | `RespondActivity` (Update 14), pages `/admin/curriculum-map/respond/*`, `/student/respond/*` | Three level pages per Text Set; content uploaded by the school (Excel). Student page **showed the level name** (fixed). |
| Grammar | `src/server/grammar`, `/admin/grammar` | Skills `G{n}.grammar.*`; teacher view limited to the grades they teach (looked "empty" for teachers of a grade not yet loaded). |
| Levels | `StudentLevel` (working level), `StudentCategoryLevel` (CV/ACS/RTR), history in `AuditLog` (`level.change`) | Teacher / Placement / MAP / adaptive. Ladder rules **hard-coded** (4 of 5 up, ≤1 of 4 down). Students without data started adaptive sets at **Below**. |
| Adaptive assign | `assignFromMap` (ADAPTIVE / BY_LEVEL), `assignQuestions`, `assignSkill` | Worked; titles carried the level name into student screens and notifications. |
| MAP | `MapResult` (overall + goal areas), file import (template + NWEA export), RIT-only manual entry, `personal-plan`, `recommend`, `intervention` | No full manual table (percentile, projection, goal areas, Winter/Spring). |
| Roles | SUPER_ADMIN, SCHOOL_ADMIN, TEACHER, STUDENT, PARENT | No coordinator. |
| Dashboards | analytics, performance, intervention board | No per-student dashboard with MAP Fall → now → target, no grade summary. |

## What I learned from the MAP reports
- Two subjects, stored separately: **Reading** and **Language Usage**.
- Reading goal areas: Literary Text (structure/theme), Informational Text (structure/central idea), Vocabulary. Language Usage: Grammar & Usage, Mechanics, Writing (style/organization/support).
- Reports show a RIT per goal area **or** a descriptor: Low (<21st), LoAvg (21–40), Avg (41–60), HiAvg (61–80), High (>80).
- Fall reports give a **Spring projection**; Projection − Fall RIT = expected growth (the "gap").
- NWEA's export has one row per student per course, goal areas as RIT ranges (e.g. 151–160) — already supported by the import.

## Inconsistencies and risks found
1. Level names visible to students (ReadMaster, Respond, assignment titles, notifications, plan labels). → hidden everywhere (`hideLevels`).
2. No-data students started at Below (prompt: On, and tell the teacher). → On Level + notices on the boards and assign results.
3. Ladder thresholds not editable. → admin Settings.
4. Teachers could not browse Grammar of other grades. → every grade visible; assign needs a class of that grade.
5. Respond to Reading had no "assign by level", no completion tracking. → class work with "I finished my answer in my book" + tracking.
6. Photo upload needs external file storage (the server disk is wiped on every deploy). → deferred (see DECISIONS.md).
7. Duplicate skills across lists (Update 16 item): needs the school's approval before any merge — moving questions is hard to undo.

## What changed (Update 15) — see PROGRESS.md
