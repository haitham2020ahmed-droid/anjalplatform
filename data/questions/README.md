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
