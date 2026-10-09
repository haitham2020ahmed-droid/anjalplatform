# Performance & audit — Update 20

## The 100-student simulation
`npx tsx scripts/load/school-sim.ts 100 20` — the Test School (fake data), 100 students using the platform **at the same
time** through the real services (adaptive practice, MAP practice test, home pages), then teachers and the admin opening
the heavy pages. Measured: time (CPU, in-memory database) **and the number of database queries** — on the real MySQL each
query also costs the network round trip to Aiven (≈ 2–10 ms), so the query count decides the real speed.

| What | Result |
|---|---|
| 100 students practising at once | 810 answers in 1.5 s (≈ 550 answers/s on one server process); one answer = 4–5 queries |
| 100 students in the MAP practice test at once | 1,000 answers in 1.9 s; p50 1.3 ms per answer |
| 100 students open My work + My MAP at the same instant | all served in 0.2 s (was 2.9 s before the fixes) |
| Student home page (everything on it) | 59 queries, run in parallel |
| Teacher · MAP matrix of a class | **19 queries (was 612)** |
| Student · My MAP | **22 queries (was 67)** |
| Numbers on the icons (every page) | 5–8 queries, kept 10 s per person |
| Admin · department week | 128 queries (one page a week) |

## Problems found and fixed
1. **Crash under load**: 100 students opening My MAP at the same second could insert the national norms twice and fail
   (“UNIQUE constraint”). Now inserted once per server process, safely.
2. **MAP matrix too slow**: the RIT estimate rebuilt the question pools for every student (612 queries per class).
   Pools are now kept in memory per school and grade (refreshed when questions change) and estimates are computed for
   the whole class at once.
3. **Dates sorted as text** in two lists (comments, recent work) → newest-first order could be wrong. Fixed.
4. **Privacy**: a teacher could see practice-test accuracy rows of students of other classes. Now only their own students.
5. **Unclear-question flag** accepted a question id of another school. Now only the student's own school.
6. **Microphone blocked** by the security header (needed for reading aloud) and audio blocked by the content policy.
   Now the microphone is allowed for this site only, audio from the platform and the dictionary only.
7. Double-clicks sent forms twice. Every form now shows a spinner and ignores a second press.

## Speed recommendations (outside the code)
- **Render paid plan (≈ $7/month)**: the free plan sleeps; the first visit after a pause takes 30–50 s. This is the
  biggest cause of slowness and cannot be fixed in code.
- Keep the Render service and the Aiven database **in the same region**.
- Aiven: turn on daily backups (and download the Excel backup weekly: Admin → 💾 Backup).
