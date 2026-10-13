# English NAFS model booklets

One file per text: `NB-001.json`, `NB-002.json`, … (the file name and the booklet `code` must match).
Each booklet mirrors the Ministry of Education NAFS target skills guide (دليل المهارات المستهدفة), Grade 6 reading:
one original English text (informational or literary, 300–480 words) and 35 questions grouped under the 13 standards in
the guide's order — S01×3, S02×3 … S10×3, S11×1, S12×1, S13×3 — with 33 multiple-choice questions (A–D) and 2 short
written answers (one under S03, one under S13).

```json
{
  "code": "NB-001", "title": "…", "kind": "INFORMATIONAL", "genre": "expository", "words": 430,
  "passage": "Paragraph one…\n\nParagraph two…",
  "questions": [
    { "n": 1, "standard": "MOE.S01", "nafs": "NAFS.V.SYNANT", "pirls": "P2", "type": "MCQ",
      "stem": "…", "options": ["…", "…", "…", "…"], "answer": "A", "why": "…" },
    { "n": 9, "standard": "MOE.S03", "nafs": "NAFS.V.CONTEXT", "pirls": "P3", "type": "WRITTEN",
      "stem": "Use the word “…” in a sentence of your own.", "model": "…", "rubric": ["2 = …", "1 = …", "0 = …"], "why": "…" }
  ]
}
```

How they reach the platform (src/server/nafs/booklets.ts):

- Admin → Questions → **Load new questions** → pack **NAFS model booklets** (one file per step), and
- automatically in the background the first time the NAFS section opens when the school's NAFS bank lacks them.

Loading is idempotent by `code` + `n` (a second run adds nothing). An invalid file is skipped as a whole and reported
with its problems. The questions are platform content (published, tagged with the Ministry standard, the NAFS skill,
the PIRLS process and the type); teachers can hide them (never deleted) or edit a school copy.

Check a file before adding it: `python3 /tmp/qs/nafs/booklet_check.py data/nafs/booklets/NB-XXX.json`.
