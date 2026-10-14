/**
 * r68 (LIVE incident, 150 students at once): the practice players are never stuck.
 *
 * The cause found: (1) the players sent answers with Server Actions, which a page runs ONE AFTER ANOTHER — one answer
 * hanging on a busy / restarting server held every later click; (2) the question-set player never reset its "pending"
 * state when the request failed (no try/finally), so "Checking…" / "Next ▶" stayed faded until the student left and
 * pressed Continue again; (3) NAFS practice waited for a page refresh INSIDE a transition before its "Next question"
 * button came back; (4) a failed request inside a transition went to the full-page "Something went wrong".
 * Now: a plain fetch with a time limit and automatic retries (each answer is applied once: a repeat gets its saved
 * result), a small "Try again" inside the player, the buttons always released, and an error boundary around the player.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ANSWER_URL, BUSY_MESSAGE, OFFLINE_MESSAGE, SIGNED_OUT_MESSAGE, callAction, refreshOrReload, sendAnswer } from "../src/lib/answer-send";
import { admitted, admissionStats, BusyError } from "../src/server/lib/admission";
import { PrismaRepo, retryTransient, isTransientDbError } from "../src/server/db/prisma-repo";
import { startPractice, submitAnswer } from "../src/server/practice/session";
import { loadSkillItems } from "../src/server/practice/items";
import { afterResponseSettled } from "../src/server/lib/after-response";
import { ROOT } from "./helpers/db";
import { answerFor, rushSchool } from "./helpers/rush";
import { UI_STRINGS } from "../src/i18n/en";
import { ar } from "../src/i18n/ar";

const read = (f: string) => readFileSync(join(ROOT, f), "utf8");
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const noSleep = async () => undefined;

describe("r68: sending an answer never leaves the player stuck", () => {
  test("a network error, then a busy server (503), then the answer: sent again by itself", async () => {
    const calls: string[] = [];
    let n = 0;
    const fetchImpl = (async (url: string, init: RequestInit) => {
      calls.push(`${url} ${String(init.method)}`);
      n++;
      if (n === 1) throw new TypeError("Failed to fetch");
      if (n === 2) return json({ error: "busy", retry: true }, 503);
      return json({ feedback: { correct: true }, view: { question: null } });
    }) as unknown as typeof fetch;
    const retries: number[] = [];
    const r = await sendAnswer({ kind: "practice", sessionId: "s", questionId: "q", response: "A" }, null, { fetchImpl, sleep: noSleep, onRetry: (i) => retries.push(i) });
    assert.equal(r.ok, true);
    assert.deepEqual(retries, [1, 2]);
    assert.equal(calls.length, 3);
    assert.ok(calls.every((c) => c === `${ANSWER_URL} POST`));
  });

  test("a request that hangs is aborted after its time limit and sent again", async () => {
    let n = 0;
    const fetchImpl = ((_u: string, init: RequestInit) => {
      n++;
      if (n === 1) return new Promise((_ok, fail) => init.signal?.addEventListener("abort", () => fail(new DOMException("aborted", "AbortError"))));
      return Promise.resolve(json({ feedback: {}, view: {} }));
    }) as unknown as typeof fetch;
    const t0 = Date.now();
    const r = await sendAnswer({ kind: "quiz" }, null, { fetchImpl, sleep: noSleep, timeoutMs: 50 });
    assert.equal(r.ok, true);
    assert.equal(n, 2);
    assert.ok(Date.now() - t0 < 2000, "never waits for ever");
  });

  test("after every try failed: { ok: false } with the message for the small 'Try again' — it never throws", async () => {
    const down = (async () => { throw new TypeError("offline"); }) as unknown as typeof fetch;
    const r1 = await sendAnswer({}, null, { fetchImpl: down, sleep: noSleep });
    assert.deepEqual(r1, { ok: false, reason: "offline", message: OFFLINE_MESSAGE });
    const busy = (async () => json({}, 502)) as unknown as typeof fetch;
    const r2 = await sendAnswer({}, null, { fetchImpl: busy, sleep: noSleep });
    assert.deepEqual(r2, { ok: false, reason: "busy", message: BUSY_MESSAGE });
    const out = (async () => json({}, 401)) as unknown as typeof fetch;
    assert.deepEqual(await sendAnswer({}, null, { fetchImpl: out, sleep: noSleep }), { ok: false, reason: "signedOut", message: SIGNED_OUT_MESSAGE });
    for (const m of [OFFLINE_MESSAGE, BUSY_MESSAGE, SIGNED_OUT_MESSAGE, "Trying again…", "This part of the page did not load. Your answers are saved."]) {
      assert.ok((UI_STRINGS as readonly string[]).includes(m), m);
      assert.ok((ar as Record<string, string>)[m], `Arabic for ${m}`);
    }
  });

  test("the route missing (an older server during a deploy): the Server Action is used instead", async () => {
    const missing = (async () => json({}, 404)) as unknown as typeof fetch;
    let used = 0;
    const r = await sendAnswer<{ feedback?: unknown; error?: string }>({}, async () => { used++; return { feedback: { correct: true } }; }, { fetchImpl: missing, sleep: noSleep });
    assert.equal(r.ok, true);
    assert.equal(used, 1);
  });

  test("Server Actions (NAFS practice, Learn sets): time limit + retries, never a thrown error", async () => {
    let n = 0;
    const r = await callAction(async () => { n++; if (n < 3) throw new Error("An unexpected response was received from the server."); return { ok: 1 }; }, { sleep: noSleep });
    assert.deepEqual(r, { ok: true, data: { ok: 1 } });
    const never = await callAction(() => new Promise<number>(() => undefined), { sleep: noSleep, timeoutMs: 20, tries: 2 });
    assert.equal(never.ok, false);
  });

  test("'Next question' after a refresh that never comes: the page loads again in full (never a faded button)", async () => {
    let reloads = 0, refreshes = 0;
    refreshOrReload(() => { refreshes++; }, 20, () => { reloads++; });
    await new Promise((r) => setTimeout(r, 40));
    assert.deepEqual([refreshes, reloads], [1, 1]);
    const cancel = refreshOrReload(() => { refreshes++; }, 20, () => { reloads++; });
    cancel(); // the new question came: the player was replaced
    await new Promise((r) => setTimeout(r, 40));
    assert.equal(reloads, 1);
  });
});

describe("r68: the server applies each answer once (a repeat gets its saved result)", () => {
  test("the same practice answer sent twice (a retry after a lost reply): one attempt, the second is a replay", async () => {
    const school = await rushSchool({ classesPerGrade: 1, studentsPerClass: 2 });
    const a = school.students[0];
    const skill = school.skillOf.get(a.studentId!)!;
    const items = new Map((await loadSkillItems(school.repo, skill, { wholePool: true })).map((i) => [i.questionId, i]));
    let clock = Date.now();
    const view = await startPractice(school.repo, a, skill, new Date(clock));
    const it = items.get(view.question!.questionId)!;
    const input = { sessionId: view.sessionId, questionId: it.questionId, response: answerFor(it, true) };
    const [r1, r2] = await Promise.all([submitAnswer(school.repo, a, input, new Date((clock += 40_000))), submitAnswer(school.repo, a, input, new Date(clock + 1000))]);
    assert.equal(r1.feedback.correct, true);
    assert.equal(r2.feedback.replayed, true, "the second copy: the saved result, nothing written");
    assert.equal(r2.feedback.correct, true);
    assert.equal(r2.view.question?.questionId, r1.view.question?.questionId, "the same next question: the student keeps their place");
    assert.equal(await school.repo.count("QuestionAttempt", { sessionId: view.sessionId }), 1);
    await afterResponseSettled();
  });
});

describe("r68: the request path under a rush", () => {
  test("admission: at most N answers worked on at once, in arrival order; too long a wait → Busy (the player retries)", async () => {
    let running = 0, most = 0;
    const order: number[] = [];
    const work = (i: number) => admitted("test.lane", async () => { running++; most = Math.max(most, running); await new Promise((r) => setTimeout(r, 5)); order.push(i); running--; return i; }, 3);
    const out = await Promise.all(Array.from({ length: 12 }, (_, i) => work(i)));
    assert.deepEqual(out, Array.from({ length: 12 }, (_, i) => i));
    assert.equal(most, 3);
    assert.deepEqual(order.slice(0, 3).sort(), [0, 1, 2]);
    assert.equal(admissionStats("test.lane").running, 0);
    const slow = admitted("test.busy", () => new Promise((r) => setTimeout(r, 80)), 1);
    await assert.rejects(admitted("test.busy", async () => 1, 1, 20), BusyError);
    await slow;
    assert.equal(admissionStats("test.busy").rejected, 1);
  });

  test("a busy database (pool timeout, dropped connection, deadlock) is retried once on the server; other errors are not", async () => {
    let n = 0;
    assert.equal(await retryTransient(async () => { n++; if (n === 1) throw Object.assign(new Error("Timed out fetching a new connection from the connection pool."), { code: "P2024" }); return "ok"; }, false, 1), "ok");
    assert.equal(n, 2);
    await assert.rejects(retryTransient(async () => { throw Object.assign(new Error("Unique constraint failed"), { code: "P2002" }); }, false, 1), /Unique/);
    assert.equal(isTransientDbError({ code: "P2034" }, true), true, "a deadlock rolled the transaction back: safe to run again");
    assert.equal(isTransientDbError({ code: "P1017" }, true), false, "a dropped connection during a transaction might have committed: not replayed");
  });

  test("two upserts of the same row at the same moment: the loser updates instead of failing (SchoolSetting unique race)", async () => {
    const rows: Record<string, unknown>[] = [{ id: "x", schoolId: "s1", key: "k", value: 1 }];
    const fake = { schoolSetting: {
      upsert: async () => { throw Object.assign(new Error("Unique constraint failed on the constraint: `SchoolSetting_schoolId_key_key`"), { code: "P2002" }); },
      updateMany: async (a: { data: Record<string, unknown> }) => { Object.assign(rows[0], a.data); return { count: 1 }; },
      findUnique: async () => rows[0],
    } };
    const repo = new PrismaRepo(fake as never);
    const row = await repo.upsert("SchoolSetting", { schoolId: "s1", key: "k" }, { value: 2 }, { value: 2 });
    assert.equal(row.value, 2);
  });
});

describe("r68: the players' code", () => {
  test("practice + question sets send through the time-limited fetch; buttons always released; 'Try again' inside the player", () => {
    const pp = read("src/components/practice/practice-player.tsx");
    assert.match(pp, /sendAnswer</);
    assert.match(pp, /if \(sending\.current \|\| pending\) return;/);
    assert.match(read("src/components/practice/practice-frame.tsx"), /data-testid="answer-try-again"/);
    const qp = read("src/app/quiz/[assignmentId]/quiz-player.tsx");
    assert.match(qp, /sendAnswer\(\{ kind: "quiz"/);
    assert.match(qp, /finally \{ setPending\(false\); setRetrying\(false\); \}/, "pending is released whatever happens");
    assert.match(qp, /data-testid="answer-try-again"/);
    const route = read("src/app/api/practice/answer/route.ts");
    assert.match(route, /status: 503/);
    assert.match(route, /submitQuizAnswer/);
  });

  test("NAFS practice: 'Next question' never waits on a transition; errors stay inside the player", () => {
    const np = read("src/components/nafs/practice-player.tsx");
    assert.match(np, /disabled=\{moving\}/);
    assert.doesNotMatch(np, /start\(\(\) => \{ router\.refresh\(\); \}\)/);
    assert.match(np, /callAction\(/);
    for (const f of ["src/components/second-chance/player.tsx", "src/components/learn/question-set.tsx"]) assert.match(read(f), /finally \{ setBusy\(false\); \}/, f);
  });

  test("an error boundary around each player recovers in place (never the full-page error)", () => {
    for (const f of ["src/app/practice/[skillId]/page.tsx", "src/app/quiz/[assignmentId]/page.tsx", "src/app/student/nafs/practice/[id]/page.tsx"]) assert.match(read(f), /<PlayerBoundary where=/, f);
    assert.match(read("src/components/practice/player-boundary.tsx"), /\/api\/client-error/, "the real error goes to Admin → Errors");
  });
});
