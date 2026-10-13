# English NAFS practice sets

One file per set: `NP-001.json`, `NP-002.json`, … (the file name and the set `code` must match).
Each set is one original English passage at Grade 6 international (American curriculum) level (150–260 words,
paragraphs separated by a blank line) and **10 multiple-choice questions (A–D)**, each tagged with its Ministry of
Education NAFS standard, NAFS skill, PIRLS process and a **difficulty** — the adaptive practice in the NAFS center
steps between them (start Medium; right → harder, wrong → easier).

```json
{
  "code": "NP-001", "title": "…", "kind": "LITERARY", "genre": "narrative story",
  "passage": "Paragraph one…\n\nParagraph two…",
  "questions": [
    { "n": 1, "standard": "MOE.S02", "nafs": "NAFS.V.FORMS", "pirls": "P1", "difficulty": 1,
      "stem": "…", "options": ["…", "…", "…", "…"], "answer": "C", "why": "…" }
  ]
}
```

- `kind`: `INFORMATIONAL` or `LITERARY`; `genre`: expository · narrative story · dialogue story · personal narrative ·
  letter · biography · poem.
- `difficulty`: 1 = Easy · 2 = Medium · 3 = Hard (within Grade 6 rigor). Spread per set: three 1s, four 2s, three 3s.
- The 10 questions use exactly these standards, one each: MOE.S02, S03, S05, S06, S08, S09, S10, S11, S12, S13.
- Answers spread over A–D; options plausible; "All of the above" / "A and B" / "None of the above" at most once.

How they reach the platform (src/server/nafs/practice-sets.ts):

- Admin → Questions → **Load new questions** → pack **NAFS practice sets** (one file per step), and
- automatically in the background when the NAFS center opens and the school's center lacks them.

Loading is idempotent by `code` + `n` (a second run adds nothing). An invalid file is skipped as a whole and reported
with its problems. The questions are platform content of the NAFS center only (published, on an inactive holding
skill, so they never appear in the platform's own practice or levels), tagged with the standard, the NAFS skill, the
PIRLS process and the difficulty; teachers can hide them (never deleted) or edit a school copy.

Check a file before adding it: `python3 /tmp/qs/nafs/practice_check.py data/nafs/practice/NP-XXX.json`.
