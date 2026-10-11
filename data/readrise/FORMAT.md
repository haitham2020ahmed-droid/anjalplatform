# ReadRise content format

One JSON file per article in `data/readrise/articles/<code>.json` (the platform library; loaded by the seed).
All content is ORIGINAL (written for Al-Anjal), nonfiction, suitable for Grades 4–6 in Saudi Arabia.

```json
{
  "code": "RR-001",
  "title": "Article title (Title Case)",
  "topic": "Science | Animals | Space | Earth | Health | Technology | History | People | Environment | Sports",
  "summary": "One sentence that tells what the article is about.",
  "poll": "A statement students can agree or disagree with, before and after reading.",
  "versions": [
    { "level": 300, "title": "Title for this level", "text": "Paragraphs separated by a blank line (\n\n)." }
    // … one per level: 300, 400, 500, 600, 700, 800, 900, 1000, 1100, 1200, 1300, 1400
  ],
  "bands": {
    "LOW":  { "keyWords": [ /* 5 */ ], "questions": [ /* 8 */ ], "prompt": "Short written-answer prompt", "checklist": ["…", "…", "…"] },
    "MID":  { "questions": [ /* 8 */ ], "prompt": "…", "checklist": ["…"] },
    "HIGH": { "questions": [ /* 8 */ ], "prompt": "…", "checklist": ["…"] }
  }
}
```

A key word (taught BEFORE reading, 5 per band, words that appear in every version of that band):
`{ "word": "colony", "partOfSpeech": "noun", "definition": "kid-friendly meaning in simple English", "example": "a NEW sentence using the word (not copied from the article)" }`

A question: `{ "stem": "…", "options": ["…","…","…","…"], "answer": "A"|"B"|"C"|"D", "skill": "central-idea|detail|inference|vocabulary|text-structure|author-purpose|cause-effect|sequence|compare", "why": "why the answer is right", "wrong": { "B": "why B is wrong", … } }`

Bands: LOW questions are answerable from versions 300–600, MID from 700–1000, HIGH from 1100–1400. Every version
of an article teaches the same core facts, so each band's questions work for all its versions.

Each band: 8 questions mixing skills (at least: 1 central idea, 2 details, 2 inference, 1 vocabulary in context,
1 text structure or author's purpose, 1 cause–effect/sequence/compare). Answers spread over A–D; distractors plausible;
the right answer must not be the longest option every time.

Check a file: `npx tsx scripts/readrise/check.mts data/readrise/articles/RR-001.json`
Every version must be within ±100 of its level (estimated), levels must rise with the version, and word counts must
be in range.
