# How the platform reads MAP Growth (NWEA)

## Files the school can import (Teacher → MAP Data → Import)
| File | What the platform takes |
|---|---|
| NWEA data export (CSV / Excel) | Student ID, term, grade, subject, overall RIT, percentile, Lexile, rapid-guessing %, and each goal area's RIT range (e.g. “181-190”) |
| ASG PDF — *Achievement Status and Growth Projection* | overall RIT (middle of “low-RIT-high”), percentile, **projected RIT** and **projected growth** (Spring goal), term, norms year |
| The platform template / typing (Enter MAP data) | the same, by hand |

Students are matched by the school Student ID. After an import the message lists anyone not found.

## The six goal-area groups (as on the Grade and Family reports)
- Reading: **Literary Text** (structure + key ideas), **Informational Text** (structure + key ideas), **Vocabulary**
- Language Usage: **Grammar & Usage**, **Mechanics**, **Writing** (style, organization, support)

## Words used everywhere
- **Band**: RIT in groups of 10 (181–190, 191–200 …), like the NWEA “10 Point Range”.
- **Descriptor** (by grade and season, NWEA 2025 norms): Low < 21st percentile · LoAvg 21–40 · Avg 41–60 · HiAvg 61–80 · High > 80.
- **Status of an area**: 🎯 Focus (Low/LoAvg or 3+ RIT under the student's own RIT) · ✔ Keep it up · 🚀 Extend (HiAvg/High and 3+ over).
- **Spring goal** = Fall RIT + projected growth. **Now ≈** = estimate from careful answers on the platform (needs 15+ in 45 days).
- **Retest?** = NWEA rapid guessing 30% or more.

## From scores to practice
1. Each student gets a **draft plan**: up to 2 Focus areas, weakest first (no Focus → the weakest area).
2. The teacher edits (areas, skills, number of questions, due date, note) and sends — to one student or the class.
3. Each area becomes one adaptive set with questions of the student's band and the band above (each question's RIT is estimated from its difficulty, then recalibrated from real answers).
4. Small groups = same Focus area + same band. Mid-unit check = 12 questions at the student's band.
5. New scores (Winter / Spring) → new drafts; the history shows Fall → Winter → Spring.

Questions count for MAP only when their skill is linked to a goal area (Admin → Skills → 🔗 Link skills to MAP goal areas).
