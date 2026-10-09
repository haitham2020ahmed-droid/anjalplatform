/**
 * 🤖 AI tools (FAKE test data, FAKE AI provider — no real API is called): privacy guard, provider choice,
 * rate limits, validated JSON with retries, the queue, review, and the full “Prepare a Skill” wizard on one skill,
 * with an error rate report.
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import { ForbiddenError, type Actor } from "../src/server/auth/rbac";
import { seedTestEnvironment } from "../src/server/seeding/test-env";
import { aiSettings, assertNoStudentData, callJson, pickProvider, rateState, setAiSettings, type Picked } from "../src/server/ai/engine";
import { aiLogSummary, createJob, newQuestionIds, reviewMany, runWeekly, suggestions, tick } from "../src/server/ai/jobs";
import { findDuplicates, formulaLevel, gapReport, questionContent, suspiciousQuestions } from "../src/server/ai/tools";
import { finishStep, startStep, wizard, wizardList } from "../src/server/ai/wizard";
import { masterSkills } from "../src/server/skills/master";
import type { AiProvider } from "../src/server/ai/question-generator";
import { demoDatabase } from "./helpers/db";

/** A fake provider that answers like an AI would — and sometimes badly. */
function fakeAi(opts: { invalidEvery?: number; wrongKeyFor?: Set<string> } = {}): { provider: AiProvider; calls: { system: string; user: string }[] } {
  const calls: { system: string; user: string }[] = [];
  let n = 0;
  return {
    calls,
    provider: {
      async complete(system, user) {
        calls.push({ system, user }); n++;
        if (opts.invalidEvery && n % opts.invalidEvery === 0) return "Sure! Here are the results: {results: [oops";
        const u = JSON.parse(user) as Record<string, unknown>;
        if (u.task === "Quality check") return JSON.stringify({ results: (u.questions as { id: string; keyedCorrect: string[]; options: { label: string }[] }[]).map((q) => opts.wrongKeyFor?.has(q.id) ? { id: q.id, keyIsCorrect: false, correctLabels: [q.options.find((o) => !q.keyedCorrect.includes(o.label))!.label], issues: [] } : { id: q.id, keyIsCorrect: true, correctLabels: q.keyedCorrect, issues: q.id.endsWith("a") ? [{ type: "SPELLING", detail: "Check the comma.", suggestion: null }] : [] }) });
        if (u.task === "Tag questions") { const a = u.allowed as { skills: { code: string }[]; standards: { code: string }[]; goalAreas: string[] }; return JSON.stringify({ results: (u.questions as { id: string; currentSkill: string; currentStandard: string | null }[]).map((q) => ({ id: q.id, skillCode: q.currentSkill || a.skills[0].code, standard: q.currentStandard && a.standards.some((x) => x.code === q.currentStandard) ? q.currentStandard : a.standards[0].code, goalArea: a.goalAreas[0], level: "ON", difficulty: 4, confidence: 0.9 })) }); }
        if (u.task === "Estimate reading level") return JSON.stringify({ results: (u.passages as { id: string }[]).map((p) => ({ id: p.id, gradeLevel: 4.5, band: "ON", reason: "Short sentences." })) });
        return "{}";
      },
    },
  };
}

describe("🤖 AI tools", () => {
  let repo: SqliteRepo; let admin: Actor; let teacher: Actor;
  const actorFor = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);
  const pick = (p: AiProvider): Picked => ({ ok: true, provider: p, name: "gemini", model: "fake-model" });

  before(async () => {
    ({ repo } = await demoDatabase());
    await seedTestEnvironment(repo, { root: process.cwd(), passwordHash: "x".repeat(60), practice: "none" });
    [admin, teacher] = await Promise.all(["test.admin", "test.teacher.1"].map(actorFor));
    await setAiSettings(repo, admin, { perMinute: 60, perDay: 10000, batch: 10 });
  });

  test("privacy: student data can never be sent; only question content goes out", async () => {
    assert.throws(() => assertNoStudentData({ questions: [{ id: "q", stem: "x", studentId: "s1" }] }), /Privacy guard/);
    assert.throws(() => assertNoStudentData({ list: [{ score: 80 }] }), /Privacy guard/);
    assert.doesNotThrow(() => assertNoStudentData({ task: "Quality check", questions: [{ id: "q", stem: "Which word…", options: [{ label: "A", text: "x" }], keyedCorrect: ["A"], passage: { title: "T", text: "…" } }] }));
  });

  test("provider: from the server environment; off / missing key → the AI tools pause with a clear message", () => {
    assert.equal(pickProvider({}, { provider: "auto", perMinute: 4, perDay: 200, batch: 5 }).ok, false);
    assert.match((pickProvider({ GEMINI_API_KEY: "AIzaX" }, { provider: "off", perMinute: 4, perDay: 200, batch: 5 }) as { reason: string }).reason, /switched off/);
    const g = pickProvider({ GEMINI_API_KEY: "AIzaX" }, { provider: "auto", perMinute: 4, perDay: 200, batch: 5 });
    assert.ok(g.ok && g.name === "gemini");
    const c = pickProvider({ GEMINI_API_KEY: "AIzaX", ANTHROPIC_API_KEY: "sk-ant-x" }, { provider: "anthropic", perMinute: 4, perDay: 200, batch: 5 });
    assert.ok(c.ok && c.name === "anthropic", "switchable from settings");
  });

  test("validated JSON: an invalid reply is retried with the reason; then it fails cleanly", async () => {
    let n = 0;
    const flaky: AiProvider = { async complete() { n++; return n === 1 ? "not json" : JSON.stringify({ results: [{ ok: 1 }] }); } };
    const r = await callJson(repo, { schoolId: admin.schoolId!, tool: "QUALITY", picked: pick(flaky) as Extract<Picked, { ok: true }>, items: 1 }, "sys", { task: "x" }, (d) => (Array.isArray((d as { results?: unknown }).results) ? { ok: true, value: 1 } : { ok: false, error: "no results" }));
    assert.deepEqual([r.ok, n], [true, 2]);
    const bad: AiProvider = { async complete() { return "{\"results\": 5}"; } };
    const r2 = await callJson(repo, { schoolId: admin.schoolId!, tool: "QUALITY", picked: pick(bad) as Extract<Picked, { ok: true }>, items: 1 }, "sys", { task: "x" }, (d) => (Array.isArray((d as { results?: unknown }).results) ? { ok: true, value: 1 } : { ok: false, error: "no results list" }));
    assert.equal(r2.ok, false);
    const limited: AiProvider = { async complete() { throw new Error("Gemini's free usage limit was reached (per minute or per day). Wait a minute, or try again tomorrow."); } };
    const r3 = await callJson(repo, { schoolId: admin.schoolId!, tool: "TAG", picked: pick(limited) as Extract<Picked, { ok: true }>, items: 1 }, "sys", { task: "x" }, () => ({ ok: true, value: 1 }));
    assert.ok(!r3.ok && r3.stop, "a rate limit stops the batch");
    const rs = await rateState(repo, admin.schoolId!, await aiSettings(repo, admin.schoolId));
    assert.ok(rs.waitMs > 0 && /slow down/.test(String(rs.reason)), "and the queue waits a minute");
    await repo.deleteMany("AiRequestLog", {});
  });

  test("teachers cannot use the AI tools", async () => {
    await assert.rejects(createJob(repo, teacher, "QUALITY", { grade: 4 }), ForbiddenError);
  });

  test("Prepare a Skill on one skill (~60 questions): every step, error rate reported", async () => {
    const skills = await masterSkills(repo, admin.schoolId!, { grade: 4, withQuestionsOnly: true });
    const skill = [...skills].sort((a, b) => b.questions - a.questions)[0];
    // the test bank has a few questions per skill: add fake ones up to ~60 (different wording each)
    const base = await repo.findMany("Question", { skillId: skill.id, deletedAt: null });
    const animals = ["otter", "falcon", "beetle", "salmon", "gecko", "heron", "badger", "lizard", "walrus", "parrot"], places = ["river", "desert", "forest", "harbor", "meadow", "canyon"];
    for (let i = 0; base.length + i < 60; i++) {
      const q = base[i % base.length];
      const copy = await repo.create("Question", { ...q, id: undefined, externalRef: null, stem: `In the ${places[i % 6]} story about the ${animals[i % 10]} number ${i}, ${String(q.stem).toLowerCase()}`, createdAt: new Date(Date.now() - 86_400_000) });
      for (const o of await repo.findMany("QuestionOption", { questionId: q.id })) await repo.create("QuestionOption", { ...o, id: undefined, questionId: copy.id });
    }
    assert.ok((await repo.count("Question", { skillId: skill.id, deletedAt: null })) >= 60);
    const list = await wizardList(repo, admin, 4);
    assert.ok(list.length && list.every((x) => x.status === "NOT_STARTED"));
    const qs = await questionContent(repo, (await repo.findMany("Question", { skillId: skill.id, deletedAt: null }, { select: ["id"] })).map((q) => String(q.id)));
    const wrong = new Set([qs.find((q) => q.type === "MULTIPLE_CHOICE")!.id]);
    const ai = fakeAi({ invalidEvery: 4, wrongKeyFor: wrong });
    const run = async (jobId: string) => { for (let i = 0; i < 100; i++) { const r = await tick(repo, admin, {}, { jobId, picked: pick(ai.provider) }); if (r.job?.status === "DONE") return r.job; } throw new Error("did not finish"); };
    // 1 gap
    await assert.rejects(startStep(repo, admin, skill.id, "quality"), /Gap Report/);
    await finishStep(repo, admin, skill.id, "gap1");
    // auto-tag is locked until the quality check is done
    assert.match(String((await wizard(repo, admin, skill.id)).steps.find((x) => x.key === "tag")!.blocked), /Quality Check/);
    // 2 quality
    const qJob = await startStep(repo, admin, skill.id, "quality");
    const done = await run(qJob!);
    assert.equal(done.done + done.failed, done.total);
    const serious = (await suggestions(repo, admin, { tool: "QUALITY", skillId: skill.id })).filter((x) => x.severity === 1);
    assert.ok(serious.some((x) => x.kind === "KEY_ERROR" && wrong.has(String(x.questionId))), "the wrong key is found and listed first");
    await assert.rejects(finishStep(repo, admin, skill.id, "quality"), /serious/);
    await reviewMany(repo, admin, serious.map((x) => x.id), "APPROVE");   // approve = apply the corrected key
    const fixed = (await questionContent(repo, [...wrong]))[0];
    assert.notDeepEqual(fixed.options.filter((o) => o.correct).map((o) => o.label), qs.find((q) => wrong.has(q.id))!.options.filter((o) => o.correct).map((o) => o.label));
    await finishStep(repo, admin, skill.id, "quality");
    // 3 duplicates
    await startStep(repo, admin, skill.id, "duplicates");
    await finishStep(repo, admin, skill.id, "duplicates");
    // 4 tag: sample + approve all
    const tJob = await startStep(repo, admin, skill.id, "tag");
    await run(tJob!);
    const tags = await suggestions(repo, admin, { tool: "TAG", skillId: skill.id });
    assert.ok(tags.length >= qs.length - 3);
    await reviewMany(repo, admin, tags.map((x) => x.id), "APPROVE");
    await finishStep(repo, admin, skill.id, "tag");
    const w5 = await wizard(repo, admin, skill.id);
    if (!w5.steps.find((x) => x.key === "reading")!.skipped) { const rJob = await startStep(repo, admin, skill.id, "reading"); await run(rJob!); await finishStep(repo, admin, skill.id, "reading"); }
    await finishStep(repo, admin, skill.id, "gap2");
    const end = await wizard(repo, admin, skill.id);
    assert.equal(end.status, "READY");
    // every payload carried question content only
    for (const c of ai.calls) assert.doesNotThrow(() => assertNoStudentData(JSON.parse(c.user)));
    const log = await aiLogSummary(repo, admin, 1);
    assert.ok(log.requests > 0 && log.invalid > 0, "invalid replies were retried and logged");
    console.log(`  ↳ wizard on “${skill.name}” (${qs.length} questions): ${log.requests} requests, ${log.ok} ok, ${log.invalid} invalid (retried), error rate ${log.errorPct}% — final failed items: ${done.failed}`);
  });

  test("duplicates, gap report, reading formula, suspicious questions (code, no AI)", async () => {
    const skill = (await masterSkills(repo, admin.schoolId!, { grade: 4, withQuestionsOnly: true }))[1];
    const ids = (await repo.findMany("Question", { skillId: skill.id, deletedAt: null }, { select: ["id"] })).map((q) => String(q.id));
    const q = await repo.findUnique("Question", { id: ids[0] });
    const copy = await repo.create("Question", { ...q, id: undefined, externalRef: null, createdAt: new Date() });
    for (const o of await repo.findMany("QuestionOption", { questionId: q!.id })) await repo.create("QuestionOption", { ...o, id: undefined, questionId: copy.id });
    const pairs = await findDuplicates(repo, [...ids, String(copy.id)]);
    assert.ok(pairs.some((p) => [p.a, p.b].includes(String(copy.id)) && p.score >= 0.99));
    const gap = await gapReport(repo, admin.schoolId!, 4, skill.id);
    assert.equal(gap[0].target, gap[0].perLevel! * 3);
    const f = formulaLevel("The cat sat on the mat. It was warm. The sun was out.", 4);
    assert.equal(f.band, "BELOW");
    // most students choose B while the key is A
    const mc = (await questionContent(repo, ids)).find((x) => x.type === "MULTIPLE_CHOICE" && x.options.length >= 2)!;
    const key = mc.options.find((o) => o.correct)!.label, other = mc.options.find((o) => !o.correct)!.label;
    const studs = (await repo.findMany("Student", { schoolId: admin.schoolId })).slice(0, 12);
    for (const [i, st] of studs.entries()) {
      const sess = await repo.create("PracticeSession", { studentId: st.id, mode: "ADAPTIVE_PRACTICE", skillId: skill.id, startedAt: new Date() });
      await repo.create("QuestionAttempt", { sessionId: sess.id, studentId: st.id, questionId: mc.id, skillId: skill.id, isCorrect: i < 2, response: { value: i < 2 ? key : other }, responseMs: 20000, rapidGuess: false, difficultyB: 0, createdAt: new Date() });
    }
    const sus = await suspiciousQuestions(repo, admin.schoolId!, { grade: 4 });
    const hit = sus.find((x) => x.id === mc.id)!;
    assert.ok(hit, "flagged");
    assert.equal(hit.topWrong?.label, other);
    assert.ok(hit.reasons.some((r) => /chosen more often/.test(r)));
  });

  test("new questions: marked New, queued weekly (Quality Check then Auto-Tag)", async () => {
    const before = await newQuestionIds(repo, admin.schoolId!);
    const skill = (await masterSkills(repo, admin.schoolId!, { grade: 5, withQuestionsOnly: true }))[0];
    const q = (await repo.findMany("Question", { skillId: skill.id }))[0];
    const fresh = await repo.create("Question", { ...q, id: undefined, externalRef: null, stem: `${q.stem} (new copy)`, tags: null, createdAt: new Date(Date.now() + 1000) });
    const after = await newQuestionIds(repo, admin.schoolId!);
    assert.ok(after.includes(String(fresh.id)) && after.length === before.length + 1);
    const r = await runWeekly(repo, admin);
    assert.ok(r.queued >= 1);
    const jobs = (await repo.findMany("AiJob", { schoolId: admin.schoolId })).filter((j) => (j.scope as { new?: boolean }).new);
    assert.deepEqual(jobs.map((j) => j.tool).sort(), ["QUALITY", "TAG"]);
  });
});
