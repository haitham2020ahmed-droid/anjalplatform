# AI tools — user guide (Admin → 🤖 AI tools)

The AI tools help you clean and complete the question bank. The AI reads **questions and passages only** — never students' names, IDs, scores, MAP data or answers. **Nothing changes until you approve it.**

## 🪄 Prepare a Skill (start here)
1. Open **Prepare a Skill**. The most urgent skills are at the top (work coming up soon, early units, where students are weakest).
2. Click a skill and follow the 6 steps in order. Each step has **Start**, its results, and **Next step**.
   1. **Gap Report** — how many questions the skill has at Below / On / Above and what is missing (targets: 20 per level; Grammar 10 per level; Concept Vocabulary 25 per selection).
   2. **Quality Check** — fix the red problems first: **wrong answer key** and **more than one correct answer**. ✓ approves the AI's corrected key (when it names one answer); otherwise open ✏️ Edit, correct the question, then ✓ to close it. ✗ if the AI is wrong. Auto-Tag stays locked until this step is done.
   3. **Duplicate Finder** — ✓ archives the copy (the older question stays); ✗ keeps both.
   4. **Auto-Tag** — check the 10 random examples; if they look right press **Approve all**.
   5. **Reading Level Estimate** — only when the skill has passages. Shown as “Estimated reading level” (formula + AI). It is **not** a Lexile.
   6. **Gap Report again** — shows what is still missing. The skill is now **Ready**.

## 🗓️ Weekly routine (about 10 minutes)
1. Open AI tools. If a week has passed, the check of **new questions** (Quality Check, then Auto-Tag) starts by itself — or press **Run now** in Tools.
2. Open **Review** and approve, fix or reject.
3. Open **Suspicious questions** and look at the top of the list.

## 🔍 Suspicious questions
Worked out from real student answers (no AI): questions where most students are wrong — strong students too — or where one wrong option is chosen more often than the correct one. Usually the answer key or the wording is wrong: open ✏️ Edit and check.

## If something goes wrong
- **“Limit reached”** — the free plan allows only a few requests a minute and a limited number a day. The tool waits and continues by itself (or tomorrow, from where it stopped). Keep the page open while it runs.
- **“Not set up” / “key not valid”** — `GEMINI_API_KEY` in Render → Environment is missing or wrong. The rest of the platform keeps working.
- **Failed** items got no valid answer after 3 tries; the reason is in **Log**. Run the tool again for that skill later.
- **Settings** — choose the provider (Gemini now, Claude later), and set requests per minute / per day to what AI Studio shows for your project.
