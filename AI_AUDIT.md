# AI AUDIT — Gemini on the platform (Update 17)

## Where the platform used AI (before)
| Place | What it did | Model / key | Prompt & reply handling |
|---|---|---|---|
| Admin → Question Bank → 🤖 Generate (`src/server/admin/ai-bank.ts`, `src/server/ai/question-generator.ts`) | Writes new multiple-choice questions for one skill (up to **20 per request**), saved as drafts for review. | Gemini when `GEMINI_API_KEY` is set (model `GEMINI_MODEL`, default **gemini-3.5-flash**), else Claude (`ANTHROPIC_API_KEY`). Keys live in the server environment only (`src/lib/env.ts`); the browser never sees them. | One long prompt; JSON mode on Gemini; reply parsed once; any parse problem = the whole request fails; no retry; no rate limiting; no log. |

Nothing else called the AI. No student data was ever sent (the generator receives curriculum content only — checked by `tests/ai-bank.test.ts`).

## Model, tier and limits
- Model: `gemini-3.5-flash` by default (changeable with `GEMINI_MODEL`). Google now lists it as its **legacy** Flash model; newer stable Flash models exist (e.g. `gemini-3.8-flash`, `gemini-3.5-flash-lite`). Check which ones your key can use.
- Tier: an AI Studio key without billing = the **free tier**.
- Limits: Google no longer publishes fixed free-tier numbers; they are **per project** and shown in **AI Studio → Rate limits** (aistudio.google.com/rate-limit). Free tiers have been as low as about **5 requests per minute and a few dozen to a few hundred per day**. The AI tools default to **4 per minute and 200 per day** — set them to your project's numbers in AI tools → Settings.

## Why it often failed
1. **Rate limits (429)** — several requests in a row (e.g. “Generate Missing” on many skills) hit the free per-minute / per-day limit. There was no waiting or queue.
2. **Cut-off replies** — 20 questions per request + the model's “thinking” used up the output budget → “reply was cut off” / unreadable JSON.
3. **No retry** — one bad reply (extra text, a missing field) failed the whole request.
4. **Timeouts** — long requests (up to 120 s) on a slow free tier.
5. **Wrong / old model name or key** — a key pasted with spaces, or a model name the key cannot use (404).
6. **Answer position** — generated questions always had the correct answer as option A (not an error message, but a quality problem).

## What changed
- New AI layer `src/server/ai/engine.ts`: provider chosen in settings (Automatic · Gemini · Claude · Off) — switching needs no code change; a missing key or “Off” only pauses the AI tools.
- Every request asks for JSON, is **validated** against the exact allowed values (master skill list, CCSS codes of the grade, MAP goal areas, Below/On/Above, difficulty 1–7) and **retried** (up to 2 more times, telling the model what was wrong). After 3 tries an item is marked **Failed** with the reason — nothing crashes.
- **Rate limits respected**: per-minute and per-day counters from the request log; small batches (default 5 questions per request); after a 429 the queue waits a minute; at the daily limit it continues tomorrow.
- **Queue that resumes** (`AiJob` / `AiJobItem`): each item keeps its status, so closing the page only pauses the work.
- **Every request is logged** (`AiRequestLog`: tool, provider, model, ok / error, time) — AI tools → Log shows the error rate.
- **Privacy guard**: payloads are built from question and passage content only, and `assertNoStudentData` refuses any student field before sending.
- The question generator: at most **10 per request**, one retry, every call logged, and **correct answers in random positions**.

## Test (fake provider — no real API calls from the test machine)
“Prepare a Skill” was run end-to-end on one skill with **60 questions** and a provider that returns broken JSON on every 4th reply: 15 requests, 12 OK, 3 invalid replies retried automatically, **0 items failed**. Rate limits and outages were also simulated (the queue stops and waits). The real error rate on your server is shown in AI tools → Log after the first runs.
