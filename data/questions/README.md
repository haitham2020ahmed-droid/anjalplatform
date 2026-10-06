# Question bank

Original items written for this platform, mapped to the school's curriculum skills and the official CCSS ELA standards (Grades 4–6). No publisher items are included.

- `src/qb.py`: authoring helpers (one function per question type)
- `src/grade4.py`, `src/grade5.py`, `src/grade6.py`: passages and items
- `src/extremes.py`: very easy (Levels 1–2) and advanced (Levels 6–7) items
- `build_bank.py`: validates the sources and writes `bank.json` and `bank-review.csv`

**Teacher review:** open `bank-review.csv` in Excel. Mark each row Y or N in "approved (Y/N)" and add notes. Approved items are published from the question editor.

**Adding items:** add a call such as `mc(...)` to the grade file, then run `npm run bank:build`. The build fails and lists the problems if any of these checks fail:

- the standard code exists in the official CCSS text
- the standard belongs to the item's grade
- the skill exists in that grade's curriculum
- the item has exactly one correct answer (at least two for multiple select)
- every wrong option has a rationale

## Expansion 1: every skill now has questions

Original items and passages for the skills that had none (6 per skill, Levels 1–6), in
`src/grade4_more.py`, `src/grade5_more.py` and `src/grade6_more.py`. Grammar items follow the rule
summaries of the school's Wonders 2023 materials (G4, G5); Grade 6 follows the CCSS Language
standards. Imported after the earlier modules, so existing refs are unchanged.

| | Before | After |
|---|---|---|
| Items | 229 | **625** (+396) |
| Original passages | 14 | **33** (+19, including 3 paired-text passages and a drama with an aside) |
| Grade 4 quiz skills with questions | 44 / 69 | **69 / 69** |
| Grade 5 quiz skills with questions | 35 / 66 | **66 / 66** |
| Grade 6 quiz skills with questions | 33 / 43 | **43 / 43** |
| Question types in use | 8 | 9 (`WORD_ORDER` added) |

(Writing skills such as writing-poetry are assessed through writing tasks, not quiz items.)

**Checks:** every item passes `build_bank.py`; no new item shares 60 % or more of its content
with any other item (stem + options + answers); cross-text questions use paired-text passages
so students can see both texts; the original 229 items are byte-for-byte unchanged.
Answer keys of expansion items are balanced per question type (original items keep their
exact option order, because they may already be in a database).

All new items arrive **under review**: approve them in `bank-review.csv` or the question editor.

## Top-up 1 (Grade 4): every Grade 4 quiz skill has at least 6 items

`src/grade4_topup.py` adds 181 items that fill the difficulty levels each thin skill was missing
(806 items in total). A stricter duplicate rule now also treats **the same skill with the same
correct answer** as a duplicate, even when worded differently; it found 10 such items across
grades (e.g. “unhappy”, “audible”, “friend”), all replaced in place so refs stay stable.

## Top-up 2 (Grade 5): every Grade 5 quiz skill has at least 6 items

`src/grade5_topup.py` adds 142 items (948 in total). Questions that compare texts use only the
paired-text passages. The duplicate checks (content overlap and same-skill-same-answer) found 4
more, all replaced in place.

## Top-up 3 (Grade 6): the bank is complete

`src/grade6_topup.py` adds 134 items. **Every Grade 4–6 curriculum quiz skill now has at least
6 items**, spread across Levels 1–7.

| | Start | Now |
|---|---|---|
| Items | 229 | **1,082** |
| Original passages | 14 | **33** |
| Level 7 (hardest) items | 10 | **68** |
| Level 1 (easiest) items | 9 | **52** |
| Skills with no items | 66 | **0** |

**Quality rules, now enforced by `tests/bank-quality.test.ts`** (each caught real problems
during the expansion): at least 6 items per curriculum quiz skill; no two items sharing 60 % or
more of their content; no two items in the same skill family with the same correct answer
(except a short reviewed list of common answers in different sentences); and any question that
names another passage must use a paired-text passage.

All new items (853) arrive **under review**: approve them in `bank-review.csv` or the question
editor before students see them.
