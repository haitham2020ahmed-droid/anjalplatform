/**
 * Round 4 · Fluency Coach fixes (FAKE data only — the Test School; the AI scorer is a fake, offline):
 *   1 an early Stop is practice (≥ 55 s or the whole passage for an official check; the duration from the WAV itself)
 *   2 coachSummary.latest = the newest OFFICIAL check (teacher checks too) + latestPractice; the strands agree
 *   3 the audio memory budget is by bytes
 *   4 a retry with the same recording id is never scored twice; two checks at the same moment → one official check
 *   5 the 1-minute check only on passages ≥ MINUTE_MIN_WORDS
 *   6 spring → next grade's fall goal (Grade 6: its own spring 50th)
 *   7/8 seasons in Riyadh time (Sep–Nov · Dec–Mar · Apr–Aug), an old check judged by its own season
 *   9 one boundary rule: BELOW = wcpm < p25
 *  10 punctuation-only tokens are not words; a mispronounced name is one error for the passage
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import type { Actor } from "../src/server/auth/rbac";
import { seedTestEnvironment } from "../src/server/seeding/test-env";
import { addVersionQuestion, saveArticle, saveVersion, setArticleStatus } from "../src/server/readmaster/service";
import { teacherRoster } from "../src/server/teacher/assign";
import { setAiSettings } from "../src/server/ai/engine";
import { saveFluency } from "../src/server/teacher/support";
import {
  coachHome, coachSession, coachSummary, onePerName, passageWords, readingSeconds, reserveFluencyBytes, scoreReading, silentWav, wavSeconds,
  FLUENCY_MAX_INFLIGHT_BYTES, MINUTE_MIN_WORDS, SHORT_MINUTE_NOTICE, type AudioScorer, type ReadingMarks,
} from "../src/server/fluency/coach";
import { bandEdges, fluencyBand, fluencySeason, normView, norm50, seasonOf, weeklyGoal } from "../src/server/fluency/norms";
import { fluencyLevel, wcpmBenchmark } from "../src/server/diagnostic/standards";
import { languageStrands } from "../src/server/insights/language-strands";
import { startComprehension } from "../src/server/fluency/comprehension";
import type { Repo } from "../src/server/seeding/repo";
import { demoDatabase } from "./helpers/db";

const SHORT = "The river was low that summer. The farmers watched the sky every morning, hoping for rain. When the clouds finally came, the whole village ran outside to dance in the first heavy drops of water. Children laughed and splashed in the puddles while their parents smiled.";
const LONG = Array.from({ length: 24 }, (_, i) => `Sentence number ${i + 1} tells the class about a long and happy day.`).join(" ");
const ENV = { GEMINI_API_KEY: "AIzaTEST" };
const fixed = (m: Partial<ReadingMarks> & { lastWordIndex: number }): AudioScorer => async () => ({ errors: [], expression: 3, patterns: [], ...m });

describe("round 4 · Fluency Coach", () => {
  let repo: SqliteRepo; let teacher: Actor; let classId: string; let students: Actor[]; let shortKey = ""; let longKey = ""; let longWords = 0;
  before(async () => {
    ({ repo } = await demoDatabase());
    await seedTestEnvironment(repo, { root: process.cwd(), passwordHash: "x".repeat(60), practice: "none" });
    const a = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);
    const [admin, t1] = await Promise.all(["test.admin", "test.teacher.1"].map(a));
    teacher = t1;
    await setAiSettings(repo, admin, { perMinute: 60, perDay: 10000 });
    const r = await teacherRoster(repo, teacher); classId = r[0].id;
    students = [];
    for (const st of r[0].students.slice(0, 9)) students.push(await resolveActor(repo, (await repo.findUnique("User", { id: (await repo.findUnique("Student", { id: st.id }))!.userId }))!));
    const grade = Number((await repo.findUnique("Grade", { id: (await repo.findUnique("Student", { id: students[0].studentId }))!.gradeId }))!.level);
    for (const [code, title, body] of [["R4-SHORT", "Short Rain", SHORT], ["R4-LONG", "Long Day", LONG]] as const) {
      const art = await saveArticle(repo, admin, { code, title, grade });
      const v = await saveVersion(repo, admin, art, "ON", { lexile: 700, body });
      await addVersionQuestion(repo, admin, v, { stem: "What is this text about?", whyCorrect: "The text.", options: [{ label: "A", text: "A day", correct: true }, { label: "B", text: "A car", correct: false, rationale: "No." }] });
      await setArticleStatus(repo, admin, art, "PUBLISHED");
    }
    const home = await coachHome(repo, students[0], ENV);
    shortKey = home.passages.find((p) => p.title.startsWith("Short Rain"))!.key;
    longKey = home.passages.find((p) => p.title.startsWith("Long Day"))!.key;
    longWords = passageWords(LONG, "MINUTE").length;
    assert.ok(longWords >= MINUTE_MIN_WORDS);
  });

  test("1 · the WAV's own length is measured; an early Stop is practice; reading the whole passage is official", async () => {
    assert.equal(wavSeconds(silentWav(30)), 30);
    assert.equal(wavSeconds(new Uint8Array(3000).fill(5)), null, "not a WAV");
    assert.deepEqual(readingSeconds(silentWav(30), 60), { seconds: 30, measured: true }, "the browser said 60: the audio wins");
    assert.deepEqual(readingSeconds(silentWav(62), 60), { seconds: 60, measured: true }, "the smaller of the two");
    const st = students[0];
    // the browser claims 60 s, the recording is 30 s: practice, with the notice; no FluencyCheck; not a minute reading
    const r = await scoreReading(repo, st, { key: longKey, mode: "MINUTE", seconds: 60, audio: silentWav(30), mime: "audio/wav" }, ENV, { scorer: fixed({ lastWordIndex: 79 }) });
    assert.ok(r.status === "OK");
    if (r.status !== "OK") return;
    assert.deepEqual([r.result.official, r.result.seconds, r.result.wcpm, r.result.notice], [false, 30, 160, SHORT_MINUTE_NOTICE]);
    assert.equal((await repo.findMany("FluencyCheck", { studentId: st.studentId })).length, 0);
    const row = (await repo.findMany("FluencyPractice", { studentId: st.studentId }))[0];
    assert.deepEqual([String(row.mode), String(row.practiceKind), row.level ?? null], ["PASSAGE", "MINUTE", null], "kept as practice");
    // the whole passage read in 50 s: official (prorated)
    const r2 = await scoreReading(repo, st, { key: longKey, mode: "MINUTE", seconds: 50, audio: silentWav(50), mime: "audio/wav" }, ENV, { scorer: fixed({ lastWordIndex: longWords - 1 }) });
    assert.ok(r2.status === "OK" && r2.result.official && !r2.result.notice);
    assert.equal((await repo.findMany("FluencyCheck", { studentId: st.studentId })).length, 1);
    // not a WAV and an impossible time: the WCPM is capped at a plausible rate (300)
    const r3 = await scoreReading(repo, st, { key: longKey, mode: "PASSAGE", seconds: 10, audio: new Uint8Array(3000).fill(5), mime: "audio/wav" }, ENV, { scorer: fixed({ lastWordIndex: 199 }) });
    assert.ok(r3.status === "OK" && r3.result.wcpm <= 300, "200 words in a claimed 10 s is not 1200 WCPM");
  });

  test("2 · coachSummary.latest = the newest official check (teacher too); the last practice apart; the strands agree", async () => {
    const st = students[1];
    await scoreReading(repo, st, { key: longKey, mode: "PASSAGE", seconds: 60, audio: new Uint8Array(3000).fill(5), mime: "audio/wav" }, ENV, { scorer: fixed({ lastWordIndex: 49 }) });
    await saveFluency(repo, teacher, classId, [{ studentId: st.studentId!, wcpm: 133 }]);
    const sum = await coachSummary(repo, st.studentId!);
    assert.equal(sum.latest!.wcpm, 133, "the teacher's official check");
    assert.equal(sum.latestPractice!.wcpm, 50, "the newest practice reading, shown apart");
    const flu = (await languageStrands(repo, st.studentId!)).find((x) => x.key === "FLU")!;
    assert.equal(flu.wcpm, 133, "the student file shows the same number");
    assert.equal(flu.level, sum.latest!.level);
  });

  test("3 · the audio in memory is limited by bytes", () => {
    const a = reserveFluencyBytes(FLUENCY_MAX_INFLIGHT_BYTES - 1_000);
    assert.ok(a);
    assert.equal(reserveFluencyBytes(2_000), null, "full: the next one waits");
    const b = reserveFluencyBytes(500);
    assert.ok(b, "a small one still fits");
    a!.release(); a!.release();   // releasing twice is harmless
    const c = reserveFluencyBytes(10 * 1024 * 1024);
    assert.ok(c);
    b!.release(); c!.release();
  });

  test("4 · a retry with the same recording id returns the stored result: no new scoring, trial or daily attempt", async () => {
    const st = students[2];
    let calls = 0;
    const scorer: AudioScorer = async () => { calls++; return { lastWordIndex: 39, errors: [], expression: 3, patterns: [] }; };
    const input = { key: shortKey, mode: "PASSAGE" as const, kind: "REPEATED" as const, seconds: 60, audio: new Uint8Array(3000).fill(5), mime: "audio/wav", requestId: "0b7c6f0e-1111-4222-8333-944455556666" };
    const r1 = await scoreReading(repo, st, input, ENV, { scorer });
    const r2 = await scoreReading(repo, st, input, ENV, { scorer });
    assert.ok(r1.status === "OK" && r2.status === "OK");
    if (r1.status !== "OK" || r2.status !== "OK") return;
    assert.equal(calls, 1, "scored once");
    assert.equal(r2.result.id, r1.result.id);
    assert.equal(r2.result.trial, 1);
    assert.equal((await repo.findMany("FluencyPractice", { studentId: st.studentId })).length, 1, "one reading");
    assert.equal(Number((await repo.findUnique("RateLimitBucket", { key: `fluency:${st.userId}` }))!.count), 1, "one daily attempt");
    // a new recording (new id) is a new trial
    const r3 = await scoreReading(repo, st, { ...input, requestId: "0b7c6f0e-2222-4222-8333-944455556666" }, ENV, { scorer });
    assert.ok(r3.status === "OK" && r3.result.trial === 2);
    // the same official check retried: averaged once only
    const s2 = students[3];
    const m = { key: longKey, mode: "MINUTE" as const, seconds: 60, audio: silentWav(60), mime: "audio/wav" };
    await scoreReading(repo, s2, { ...m, requestId: "aaaaaaaa-0000-4000-8000-000000000001" }, ENV, { scorer: fixed({ lastWordIndex: 59 }) });
    await scoreReading(repo, s2, { ...m, requestId: "aaaaaaaa-0000-4000-8000-000000000002" }, ENV, { scorer: fixed({ lastWordIndex: 79 }) });
    const again = await scoreReading(repo, s2, { ...m, requestId: "aaaaaaaa-0000-4000-8000-000000000002" }, ENV, { scorer: fixed({ lastWordIndex: 99 }) });
    assert.ok(again.status === "OK" && again.result.wcpm === 80, "the stored result, not a new score");
    const checks = await repo.findMany("FluencyCheck", { studentId: s2.studentId });
    assert.deepEqual([checks.length, Number(checks[0].wcpm)], [1, 70], "averaged once: (60 + 80) / 2");
  });

  test("4 · two official checks at the same moment: one check for the day (the second is averaged, never a duplicate)", async () => {
    const st = students[4];
    const m = { key: longKey, mode: "MINUTE" as const, seconds: 60, audio: silentWav(60), mime: "audio/wav" };
    const now = new Date();
    // (the student's daily-limit row exists first: consumeRateLimit's own first-insert race is outside this fix)
    await scoreReading(repo, st, { key: shortKey, mode: "PASSAGE", seconds: 30, audio: new Uint8Array(3000).fill(5), mime: "audio/wav" }, ENV, { scorer: fixed({ lastWordIndex: 20 }) });
    await Promise.all([
      scoreReading(repo, st, m, ENV, { scorer: fixed({ lastWordIndex: 59 }) }, now),
      scoreReading(repo, st, m, ENV, { scorer: fixed({ lastWordIndex: 79 }) }, now),
    ]);
    const checks = await repo.findMany("FluencyCheck", { studentId: st.studentId });
    assert.equal(checks.length, 1, "never two official checks for one Riyadh day");
    assert.equal(Number(checks[0].wcpm), 70);
    assert.match(String(checks[0].note), /average of 2/);
  });

  test("5 · the 1-minute check is offered only on long passages", async () => {
    const st = students[5];
    const home = await coachHome(repo, st, ENV);
    const rm = home.passages.find((p) => p.key === home.recommendedMinute);
    assert.ok(rm && rm.words >= MINUTE_MIN_WORDS);
    const s1 = await coachSession(repo, st, shortKey, "MINUTE");
    assert.equal(s1.offered, false);
    assert.match(s1.reason!, /too short/);
    assert.equal((await coachSession(repo, st, longKey, "MINUTE")).offered, true);
    // the plan's "next 1-minute check" never points to a short passage
    const r = await scoreReading(repo, st, { key: shortKey, mode: "PASSAGE", seconds: 30, audio: new Uint8Array(3000).fill(5), mime: "audio/wav" }, ENV, { scorer: fixed({ lastWordIndex: 20 }) });
    assert.ok(r.status === "OK");
    if (r.status !== "OK") return;
    const minuteStep = r.result.plan.steps.find((x) => /next 1-minute check/.test(x.text))!;
    assert.ok(!minuteStep.href!.includes(encodeURIComponent(shortKey)));
  });

  test("6 · spring goal: the next grade's fall 50th percentile; Grade 6 keeps its spring 50th", () => {
    const may = new Date("2026-05-01T08:00:00Z");
    const g4 = weeklyGoal(4, 100, may)!;
    assert.deepEqual([g4.target, g4.season], [norm50(5, "FALL"), "FALL"]);
    const g6 = weeklyGoal(6, 120, may)!;
    assert.deepEqual([g6.target, g6.season], [norm50(6, "SPRING"), "SPRING"]);
    assert.equal(weeklyGoal(4, 80, new Date("2026-10-10T00:00:00Z"))!.target, norm50(4, "WINTER"), "fall → winter, same grade");
  });

  test("7/8 · seasons in Riyadh time (Sep–Nov · Dec–Mar · Apr–Aug); an old check is judged by its own season", () => {
    assert.equal(fluencySeason(new Date("2026-02-28T22:00:00Z")), "WINTER", "1 March in Riyadh is still winter");
    assert.equal(fluencySeason(new Date("2026-03-31T20:00:00Z")), "WINTER", "23:00 on 31 March in Riyadh");
    assert.equal(fluencySeason(new Date("2026-03-31T21:30:00Z")), "SPRING", "00:30 on 1 April in Riyadh");
    assert.equal(fluencySeason(new Date("2026-08-31T21:30:00Z")), "FALL", "1 September in Riyadh");
    assert.equal(fluencySeason(new Date("2026-08-15T12:00:00Z")), "SPRING");
    assert.equal(fluencySeason(new Date("2026-11-30T21:30:00Z")), "WINTER", "1 December in Riyadh");
    assert.equal(seasonOf(new Date("2026-10-01T00:00:00Z")), "FALL");
    assert.equal(seasonOf(new Date("2026-10-01T00:00:00Z"), "WINTER"), "WINTER", "a stored season wins");
    assert.equal(wcpmBenchmark(5, seasonOf(new Date("2026-10-01T00:00:00Z"))), norm50(5, "FALL"));
  });

  test("9 · one boundary rule everywhere: BELOW = wcpm < p25", () => {
    const p25 = bandEdges(5, "WINTER")!.below;
    for (const [w, lv] of [[p25 - 1, "BELOW"], [p25, "ON"]] as const) {
      assert.equal(fluencyBand(5, w, "WINTER"), lv);
      assert.equal(normView(5, w, "WINTER").band, lv);
      assert.equal(fluencyLevel(w, 5, "WINTER"), lv);
    }
  });

  test("10 · punctuation-only tokens are not words; a mispronounced name is ONE error for the passage", () => {
    assert.deepEqual(passageWords("Salt — and pepper & more … “ fine.", "PASSAGE"), ["Salt", "and", "pepper", "more", "fine."]);
    const words = "Yesterday Khalid ran home. Then Khalid ate, and Khalid slept. Dogs bark.".split(" ");
    const errs = [{ i: 1, kind: "MISPRONOUNCED" as const, heard: "kaled" }, { i: 5, kind: "MISPRONOUNCED" as const, heard: "kaled" }, { i: 8, kind: "SUBSTITUTED" as const, heard: "karl" }, { i: 0, kind: "MISPRONOUNCED" as const, heard: "x" }, { i: 10, kind: "MISPRONOUNCED" as const, heard: "dog" }];
    assert.deepEqual(onePerName(words, errs).map((e) => e.i), [1, 0, 10], "the name counts once; other words as before");
  });

  test("review 1 · a left-over day slot (failed write, deleted check) is taken again; a failed write releases its slot", async () => {
    const st = students[6];
    const today = new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 10);
    const m = { key: longKey, mode: "MINUTE" as const, seconds: 60, audio: silentWav(60), mime: "audio/wav" };
    // a claim with no check behind it (e.g. the server stopped after claiming)
    await repo.create("RateLimitBucket", { key: `fluency-check:${st.studentId}:${today}:1`, count: 0, windowStart: new Date() });
    const r1 = await scoreReading(repo, st, m, ENV, { scorer: fixed({ lastWordIndex: 59 }) });
    assert.ok(r1.status === "OK" && r1.result.official);
    assert.equal((await repo.findMany("FluencyCheck", { studentId: st.studentId })).length, 1, "the check is written");
    // the teacher deletes that check: the next official reading writes a new one
    await repo.deleteMany("FluencyCheck", { studentId: st.studentId });
    await scoreReading(repo, st, m, ENV, { scorer: fixed({ lastWordIndex: 69 }) });
    const after = await repo.findMany("FluencyCheck", { studentId: st.studentId });
    assert.deepEqual([after.length, Number(after[0]?.wcpm)], [1, 70]);
    // the write fails: the slot is released, so the next reading writes the check
    const s2 = students[7];
    let fail = true;
    const flaky = new Proxy(repo, { get(t, k, rcv) {
      if (k === "create") return async (model: string, data: Record<string, unknown>) => { if (model === "FluencyCheck" && fail) { fail = false; throw new Error("db down"); } return t.create(model, data); };
      const v = Reflect.get(t, k, rcv); return typeof v === "function" ? v.bind(t) : v;
    } }) as unknown as Repo;
    await assert.rejects(scoreReading(flaky, s2, m, ENV, { scorer: fixed({ lastWordIndex: 59 }) }), /db down/);
    assert.equal(await repo.findUnique("RateLimitBucket", { key: `fluency-check:${s2.studentId}:${today}:1` }), null, "slot released");
    const r3 = await scoreReading(repo, s2, m, ENV, { scorer: fixed({ lastWordIndex: 64 }) });
    assert.ok(r3.status === "OK" && r3.result.official);
    assert.equal((await repo.findMany("FluencyCheck", { studentId: s2.studentId })).length, 1);
  });

  test("review 2 · a request id left 'in progress' by a restart is scored at once (no 'still being scored' loop)", async () => {
    const st = students[8];
    const id = "dead0000-0000-4000-8000-000000000001";
    await repo.create("RateLimitBucket", { key: `fluency-req:${st.studentId}:${id}`, count: 0, windowStart: new Date() });
    const r = await scoreReading(repo, st, { key: shortKey, mode: "PASSAGE", seconds: 30, audio: new Uint8Array(3000).fill(5), mime: "audio/wav", requestId: id }, ENV, { scorer: fixed({ lastWordIndex: 20 }) });
    assert.equal(r.status, "OK");
    assert.equal(Number((await repo.findUnique("RateLimitBucket", { key: `fluency-req:${st.studentId}:${id}` }))!.count), 1, "now marked as scored");
  });

  test("review 3 · the quiz of an early-stopped 1-minute check is made from the minute text", async () => {
    const st = students[8];
    const r = await scoreReading(repo, st, { key: longKey, mode: "MINUTE", seconds: 30, audio: silentWav(30), mime: "audio/wav" }, ENV, { scorer: fixed({ lastWordIndex: 79 }) });
    assert.ok(r.status === "OK" && !r.result.official);
    if (r.status !== "OK") return;
    await repo.updateMany("FluencyPractice", { id: r.result.id }, { wordsRead: 0 });   // no count: the whole text read is used
    let sent = "";
    const make = { gemini: (() => ({ complete: async (_sys: string, user: string) => { sent = user; return JSON.stringify({ questions: [{ stem: "What is the text about?", options: ["A day", "A car", "A ship"], answer: 0 }, { stem: "Was it happy?", options: ["Yes", "No", "Maybe"], answer: 0 }] }); } })) as never };
    await startComprehension(repo, st, r.result.id, ENV, { make });
    const minute = passageWords(LONG, "MINUTE");
    assert.ok(minute.length < passageWords(LONG, "PASSAGE").length, "the fixture's minute text is shorter than the whole text");
    assert.ok(sent.includes(minute[minute.length - 1]) && sent.includes(minute.slice(-6).join(" ")), "the minute text was sent");
    assert.ok(!sent.includes(passageWords(LONG, "PASSAGE").slice(minute.length, minute.length + 8).join(" ")), "not the words after the minute text");
  });
});
