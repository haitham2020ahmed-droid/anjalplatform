# SKILLS AUDIT (Update 16)

## The master list
`src/server/skills/master.ts → masterSkills()` = every **active** skill of the school's grades (not deleted, not switched off, not the hidden "Unclassified" holder), with grade, kind (Reading / Language / Vocabulary / Grammar), MAP goal area, standards, published questions, and whether it is in a unit. Admin page: **Admin → 🧩 Skills**.

## Every place that lists skills — before → after
| Place | Before | After |
|---|---|---|
| Teacher → Curriculum (by unit and by MAP goal area) | Only skills linked to a **unit** (UnitSkill). Grammar skills and skills created by question imports (e.g. the Skills bank: 111 skill names, ~81 not in the book's units) were **missing**, also from the MAP-area view. | Same units + a **"More skills (Grammar and other skills not in a unit)"** group; MAP areas now include them. |
| Teacher → Assignments → New | All active skills of the grade (incl. the hidden "Unclassified"). | `masterSkills(grade)`. |
| Teacher → Games | All skills incl. **switched-off** ones. | `masterSkills()` (active only), Grammar included. |
| ReadMaster (article skill) | Active skills. | `masterSkills(grade)`. |
| Grammar page | Grammar skills (`G{n}.grammar.*`) of the teacher's grades only. | Every grade (Update 15); same skills as the master list. |
| Question Bank (filters, editor) | Active skills; the editor must still show a question's current skill even if it is the hidden holder, so it keeps its own query (same rules otherwise). | unchanged (documented). |
| MAP recommendations / plans | Active skills with questions, by goal area. | unchanged — same rules as the master list. |
| Skill assign / preview (Update 15) | Any skill of the school. | unchanged. |

## Duplicates found
Detected by meaning (same grade; lower case; punctuation, filler words like "text/skill/identify" and plural endings ignored). Examples expected in the school's data, from the Skills bank file compared with the book's skills:
- **Author’s Perspective** (curly apostrophe, from the Skills bank) = **Author's Perspective** (book) — Grades 4, 5, 6.
- **Compare and Contrast** (Skills bank) = **Compare and Contrast Texts** (book) — Grades 4, 5, 6.

The test data (the book's curriculum only, 191 skills) has **no** duplicates.

## What was changed
- Nothing is merged automatically. **Admin → 🧩 Skills** lists the possible duplicates; the admin presses **Merge** for each real pair. A merge moves the questions, assignments, unit / lesson / standard links to the kept skill and **switches the other one off** (never deleted). **↩ Undo** puts everything back. Practice history stays where it was recorded.
