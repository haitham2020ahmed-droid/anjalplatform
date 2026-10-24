/**
 * Audit fixes · adaptive engine (FAKE data only — the demo school and the Test School):
 *   1. the prerequisite-routing streak is counted inside the current session; a prerequisite already routed to is
 *      not routed to again; an untested prerequisite is a "check it" (routed to once)
 *   2. the Diagnostic Test writes StudentAbility DOMAIN:<domain> rows (the practice prior) on the practice θ scale;
 *      its answers write decision logs (θ before the answer) and a resumed test is timed from the resume
 *   7. no prerequisite cycles: the taxonomy and the family list agree, and inserting checks for cycles
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { DEFAULT_ADAPTIVE, DEFAULT_MASTERY } from "../src/config/engine";
import { processAnswer, type SkillState } from "../src/adaptive/engine";
import { selectNextItem, type PrerequisiteStatus } from "../src/adaptive/selector";
import type { CandidateItem, ResponseEvidence } from "../src/types/domain";
import { resolveActor } from "../src/server/auth/actor";
import type { Actor } from "../src/server/auth/rbac";
import { loadQuestionItems, loadSkillItems, type ClientQuestion, type PracticeItem } from "../src/server/practice/items";
import { startPractice, startQuiz, submitAnswer, submitQuizAnswer } from "../src/server/practice/session";
import { afterResponseSettled } from "../src/server/lib/after-response";
import { DEMO_SCHOOL_CODE } from "../src/server/seeding/demo";
import { loadBank } from "../src/server/seeding/load-files";
import { seedQuestions } from "../src/server/seeding/questions";
import { seedTestEnvironment } from "../src/server/seeding/test-env";
import { createDraft } from "../src/server/admin/questions";
import { teacherRoster } from "../src/server/teacher/assign";
import { buildAllDiagnostics, domainOfAnchor, myDiagnostic, openDiagnostic, toPracticeTheta } from "../src/server/diagnostic/test";
import { ensurePrerequisites, FAMILY_PREREQUISITES, wouldCycle } from "../src/server/skills/auto-prerequisites";
import { demoDatabase, ROOT, seededRandom } from "./helpers/db";

const cfg = { adaptive: DEFAULT_ADAPTIVE, mastery: DEFAULT_MASTERY };
const items: CandidateItem[] = Array.from({ length: 12 }, (_, i) => ({ id: `q${i}`, skillId: "theme", level: 1 + (i % 7), a: 1, b: -1.5 + i * 0.25, c: 0, estimatedSeconds: 45 }));
const pre = (o: Partial<PrerequisiteStatus> = {}): PrerequisiteStatus => ({ skillId: "inference", name: "Inference", mastery: 20, minimumMastery: 60, weight: 0.6, tested: true, ...o });
const wrong = (i: number): ResponseEvidence => ({ itemId: `q${i}`, correct: false, level: 4, a: 1, b: 0, c: 0, responseMs: 40_000, estimatedSeconds: 45, usedHint: false, at: new Date(Date.UTC(2026, 9, 1, 8, i)).toISOString() });
const state = (o: Partial<SkillState> = {}): SkillState => ({
  studentId: "s", skillId: "theme", sessionId: "new", mode: "PRACTICE", ability: { theta: -0.5, se: 0.6 }, prior: { mean: 0, sd: 1 },
  history: [wrong(0), wrong(1), wrong(2), wrong(3)], previousTargetB: 0, candidates: items, prerequisites: [pre()], ...o,
});

describe("1 · prerequisite routing (pure)", () => {
  test("the wrong streak never spans sessions: one wrong answer after a detour does not route again", () => {
    const one = processAnswer(state({ sessionCorrect: [] }), wrong(4), cfg, new Date(Date.UTC(2026, 9, 2)), () => 0);
    assert.notEqual(one.next.reasonCode, "PREREQ_ROUTE", "the earlier session's wrong answers do not count");
    const three = processAnswer(state({ sessionCorrect: [false, false] }), wrong(4), cfg, new Date(Date.UTC(2026, 9, 2)), () => 0);
    assert.equal(three.next.reasonCode, "PREREQ_ROUTE", "three wrong in this session still route");
    const legacy = processAnswer(state(), wrong(4), cfg, new Date(Date.UTC(2026, 9, 2)), () => 0);
    assert.equal(legacy.next.reasonCode, "PREREQ_ROUTE", "without a session list (simulations) the history is used as before");
  });

  test("a visited prerequisite is not routed to again; an untested one is a check", () => {
    const base = { mode: "PRACTICE" as const, theta: 0, previousTargetB: 0, candidates: items, recentItemIds: [], recentCorrect: [false, false, false], config: DEFAULT_ADAPTIVE, random: () => 0 };
    assert.equal(selectNextItem({ ...base, prerequisites: [pre({ visited: true })] }).reasonCode === "PREREQ_ROUTE", false);
    const other = selectNextItem({ ...base, prerequisites: [pre({ visited: true }), pre({ skillId: "evidence", name: "Text Evidence", mastery: 40 })] });
    assert.equal(other.routeToSkillId, "evidence", "the next weak prerequisite is used instead");
    const check = selectNextItem({ ...base, prerequisites: [pre({ mastery: 0, tested: false })] });
    assert.equal(check.reasonCode, "PREREQ_ROUTE");
    assert.match(check.reason, /not been checked yet/);
    assert.match(check.reason, /prerequisite "Inference"/, "the route names the prerequisite (used to mark it visited)");
  });
});

describe("1 · prerequisite routing (practice on the demo school)", () => {
  let repo: SqliteRepo; let omar: Actor;
  const T0 = new Date("2026-11-02T08:00:00Z").getTime();
  let clock = 0;
  const later = (s = 30) => new Date(T0 + (clock += s) * 1000);
  const rng = seededRandom(99);
  function wrongFor(item: PracticeItem, q: ClientQuestion): unknown {
    switch (item.type) {
      case "MULTIPLE_CHOICE": case "DROPDOWN": return item.options!.find((x) => !x.correct)!.label;
      case "MULTI_SELECT": return item.options!.map((o) => o.label);
      case "TRUE_FALSE": return !item.answer;
      case "FILL_BLANK": return "zzz";
      case "SENTENCE_ORDER": case "WORD_ORDER": return [...item.sequence!].reverse();
      case "ERROR_CORRECTION": return (item.errorIndex! + 1) % item.segments!.length;
      case "MATCHING": return Object.fromEntries(item.pairs!.map((p, i) => [p.left, item.pairs![(i + 1) % item.pairs!.length].right]));
      default: return q;
    }
  }
  before(async () => {
    ({ repo } = await demoDatabase());
    await seedQuestions(repo, { schoolCode: DEMO_SCHOOL_CODE, bank: loadBank(ROOT) });
    const g4 = (await repo.findMany("Question", { status: "UNDER_REVIEW" })).filter((q) => String(q.externalRef).startsWith("G4-"));
    await repo.updateMany("Question", { id: { in: g4.map((q) => q.id) } }, { status: "PUBLISHED" });
    omar = await resolveActor(repo, (await repo.findUnique("User", { username: "demo.s1002" }))!);
  });

  // r67 (owner): a prerequisite route no longer ENDS the practice (one of the early stops behind "the skill ended after
  // 4 questions") — the weak prerequisite is still found after 3 wrong answers in a row and logged for the teacher;
  // a visited (logged) prerequisite is never suggested again, and the streak never spans sessions
  test("three wrong answers log a prerequisite (practice goes on); each prerequisite is suggested at most once", async () => {
    const st = (await repo.findUnique("Student", { id: omar.studentId! }))!;
    const cur = (await repo.findMany("Curriculum", { gradeId: st.gradeId }))[0];
    const sid = String((await repo.findUnique("Skill", { curriculumId: cur.id, code: "G4.theme" }))!.id);
    const items = await loadSkillItems(repo, sid, { wholePool: true });
    // the route's decision log is written after the response (as in production): wait for it before the next answer
    // r89 fix: 30 s was sometimes below the "first question on this passage" rapid-guess threshold (up to ~1/3 of a
    // long passage's reading time, src/server/practice/guessing.ts), which silently dropped that answer from the
    // wrong-answer streak (rapidGuess answers are excluded from sessionCorrect) and made the prerequisite route
    // never fire. 240 s is comfortably above that threshold for any passage this skill's pool can contain.
    const answerWrong = async (sessionId: string, q: ClientQuestion) => { const r = await submitAnswer(repo, omar, { sessionId, questionId: q.questionId, response: wrongFor(items.find((i) => i.questionId === q.questionId)!, q) }, later(240), rng); await afterResponseSettled(); return r; };
    let view = await startPractice(repo, omar, sid, later(0), rng);
    const routes = async () => (await repo.findMany("AdaptiveDecisionLog", { studentId: omar.studentId, skillId: sid, reasonCode: "PREREQ_ROUTE" }, { select: ["reason", "sessionId"] }));
    let n = 0;
    while (view.question && n < DEFAULT_ADAPTIVE.prereqRouteAfterWrong) { const r = await answerWrong(view.sessionId, view.question); n++; assert.notEqual(r.feedback.next.endReason, "PREREQ_ROUTE"); view = r.view; }
    const first = await routes();
    assert.equal(first.length, 1, "three wrong answers log one prerequisite route");
    assert.ok(view.question && !view.ended, "the practice goes on");
    // more wrong answers may log ANOTHER weak prerequisite, never the one already visited
    for (let k = 0; k < 8 && view.question; k++) { const r = await answerWrong(view.sessionId, view.question); view = r.view; }
    const all = (await routes()).map((x) => String(x.reason).match(/prerequisite "([^"]+)"/)?.[1] ?? "");
    assert.equal(new Set(all).size, all.length, `each prerequisite at most once (${all.join(", ")})`);
  });
});

describe("2 · the Diagnostic Test seeds practice (Test School)", () => {
  let repo: SqliteRepo; let admin: Actor; let teacher: Actor; let roster: { id: string; name: string }[];
  const ANCHORS = ["RL.1", "RL.2", "RL.3", "RL.5", "RL.6", "RL.9", "RI.1", "RI.2", "RI.3", "RI.5", "RI.6", "RI.8", "L.4", "L.5", "RL.4", "RI.4", "L.1", "L.2"];
  const student = async (id: string) => resolveActor(repo, (await repo.findUnique("User", { id: (await repo.findUnique("Student", { id }))!.userId }))!);
  async function take(st: Actor, right: () => boolean, resumeAfter?: number): Promise<{ resumedMs: number | null }> {
    const aid = (await myDiagnostic(repo, st))!.href.split("/")[2];
    let clock = Date.now() - 6 * 3_600_000; let v = await startQuiz(repo, st, aid, new Date(clock)); let i = 0; let resumedMs: number | null = null;
    while (v.question) {
      if (resumeAfter !== undefined && i === resumeAfter) { clock += 2 * 3_600_000; v = await startQuiz(repo, st, aid, new Date(clock)); } // came back 2 hours later
      const it = (await loadQuestionItems(repo, [v.question!.questionId]))[0];
      clock += 20_000;
      v = (await submitQuizAnswer(repo, st, { assignmentId: aid, questionId: it.questionId, response: it.options!.find((o) => o.correct === right())!.label }, new Date(clock))).view;
      if (resumeAfter !== undefined && i === resumeAfter) resumedMs = Number((await repo.findMany("QuestionAttempt", { studentId: st.studentId!, questionId: it.questionId }))[0].responseMs);
      i++;
    }
    // the decision logs are written after each response (r68: in the bounded after-response queue)
    await afterResponseSettled();
    return { resumedMs };
  }
  before(async () => {
    ({ repo } = await demoDatabase());
    await seedTestEnvironment(repo, { root: process.cwd(), passwordHash: "x".repeat(60), practice: "none" });
    const a = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);
    [admin, teacher] = await Promise.all(["test.admin", "test.teacher.1"].map(a));
    await repo.updateMany("Question", { status: "PUBLISHED" }, { status: "DRAFT" });
    roster = (await teacherRoster(repo, teacher))[0].students;
    const made: string[] = [];
    for (const g of [4, 5, 6]) {
      const gr = (await repo.findMany("Grade", { schoolId: admin.schoolId, level: g }))[0];
      const cur = (await repo.findMany("Curriculum", { gradeId: gr.id }))[0];
      const skill = (await repo.findMany("Skill", { curriculumId: cur.id, deletedAt: null }))[0];
      for (const anchor of ANCHORS) {
        const code = anchor.replace(".", `.${g}.`);
        if (!(await repo.findMany("Standard", { code: `CCSS.ELA-LITERACY.${code}` })).length) await repo.create("Standard", { framework: "CCSS", code: `CCSS.ELA-LITERACY.${code}`, description: code, gradeLevel: g, strand: code.split(".")[0], isActive: true });
        for (const level of [2, 3, 4, 5, 6]) made.push(await createDraft(repo, admin, { skillId: String(skill.id), standardCode: `CCSS.ELA-LITERACY.${code}`, type: "MULTIPLE_CHOICE", stem: `G${g} ${code} level ${level}`, level, whyCorrect: "Because.",
          options: [{ label: "A", text: `right ${code} ${level}`, correct: true, rationale: null }, { label: "B", text: `wrong ${code} ${level}`, correct: false, rationale: "No." }, { label: "C", text: `other ${code} ${level}`, correct: false, rationale: "No." }] } as never));
      }
    }
    await repo.updateMany("Question", { id: { in: made } }, { status: "PUBLISHED" });
    const all = await buildAllDiagnostics(repo, admin);
    await openDiagnostic(repo, admin, all.built.find((x) => x.grade === 4)!.id, {});
  });

  test("grade-unit θ → practice θ: grade level = 0, one level = 0.75, clamped", () => {
    assert.equal(toPracticeTheta(4, 4), 0);
    assert.equal(toPracticeTheta(4 + 1 / 3, 4), 0.75, "one authoring level above = LEVEL_TO_B[5]");
    assert.equal(toPracticeTheta(9, 4), 3);
    assert.equal(toPracticeTheta(1, 4), -3);
    assert.deepEqual(["RL.2", "RI.1", "L.4", "RL.4", "L.1", "L.2"].map((a, i) => domainOfAnchor(a, (["LIT", "INFO", "VOCAB", "VOCAB", "LANG", "LANG"] as const)[i])), ["READING", "READING", "VOCABULARY", "VOCABULARY", "GRAMMAR", "LANGUAGE"]);
  });

  test("finishing the Diagnostic writes DOMAIN rows practice reads; every answer has a decision log with θ before it", async () => {
    await take(await student(roster[0].id), () => true);
    await take(await student(roster[1].id), () => false);
    const dom = async (id: string) => new Map((await repo.findMany("StudentAbility", { studentId: id })).filter((r) => String(r.scope).startsWith("DOMAIN:")).map((r) => [String(r.scope), r]));
    const [hi, lo] = await Promise.all([dom(roster[0].id), dom(roster[1].id)]);
    for (const k of ["DOMAIN:READING", "DOMAIN:VOCABULARY", "DOMAIN:GRAMMAR", "DOMAIN:LANGUAGE"]) {
      assert.ok(hi.has(k) && lo.has(k), `${k} written`);
      const [h, l] = [Number(hi.get(k)!.theta), Number(lo.get(k)!.theta)];
      assert.ok(h > 0.5 && l < -0.5 && h <= 3 && l >= -3, `${k}: strong ${h}, weak ${l} on the practice scale`);
      assert.equal(String(hi.get(k)!.domain), k.slice(7));
      assert.ok(Number(hi.get(k)!.responses) > 0);
    }
    const attempts = await repo.findMany("QuestionAttempt", { studentId: roster[0].id });
    const logs = await repo.findMany("AdaptiveDecisionLog", { studentId: roster[0].id, reasonCode: "ASSIGNED_SET" });
    assert.equal(logs.length, attempts.length, "one decision log per answer");
    const byAttempt = new Map(logs.map((l) => [String(l.attemptId), l]));
    for (const a of attempts) {
      const l = byAttempt.get(String(a.id))!;
      assert.ok(l, "linked to its attempt");
      assert.ok(l.masteryBefore !== null && l.masteryAfter !== null);
    }
    // θ before the answer: the first answer on a skill starts from the prior, and each log continues from the previous one
    const sorted = [...logs].sort((x, y) => Number(x.id) - Number(y.id)).filter((l) => l.skillId === logs[0].skillId);
    for (let i = 1; i < sorted.length; i++) assert.equal(Number(sorted[i].previousTheta), Number(sorted[i - 1].newTheta));
  });

  test("a resumed test is timed from the resume, not from when the question was first shown", async () => {
    const { resumedMs } = await take(await student(roster[2].id), () => true, 3);
    assert.equal(resumedMs, 20_000);
  });
});

describe("7 · no prerequisite cycles", () => {
  test("taxonomy + family list: central idea comes before summarize, and the union has no cycle", () => {
    const tax = JSON.parse(readFileSync("data/curriculum/taxonomy.json", "utf8")) as { prerequisites: { skill: string; prerequisite: string }[] };
    const edges = [...tax.prerequisites.map((p) => [p.skill, p.prerequisite] as [string, string]), ...FAMILY_PREREQUISITES];
    assert.ok(edges.some(([a, b]) => a === "summarize" && b === "central-idea"));
    assert.ok(!edges.some(([a, b]) => a === "central-idea" && b === "summarize"));
    const needs = new Map<string, Set<string>>();
    for (const [a, b] of edges) { assert.equal(wouldCycle(needs, a, b), false, `${a} → ${b} closes a cycle`); needs.set(a, new Set([...(needs.get(a) ?? []), b])); }
  });

  test("wouldCycle finds direct and indirect cycles", () => {
    const needs = new Map([["b", new Set(["c"])], ["c", new Set(["a"])]]);
    assert.equal(wouldCycle(needs, "a", "b"), true, "a → b → c → a");
    assert.equal(wouldCycle(needs, "a", "a"), true);
    assert.equal(wouldCycle(needs, "c", "d"), false);
  });

  test("an older database with central idea → summarize does not get the reverse edge", async () => {
    const { repo } = await demoDatabase();
    const skills = await repo.findMany("Skill", { deletedAt: null });
    const cur = String(skills.find((k) => String(k.code).endsWith(".summarize"))!.curriculumId);
    const id = (fam: string) => String(skills.find((k) => k.curriculumId === cur && String(k.code).endsWith(`.${fam}`))!.id);
    const [sum, ci] = [id("summarize"), id("central-idea")];
    await repo.deleteMany("SkillPrerequisite", { skillId: { in: [sum, ci] }, prerequisiteSkillId: { in: [sum, ci] } });
    await repo.create("SkillPrerequisite", { skillId: ci, prerequisiteSkillId: sum, weight: 0.6, minimumMastery: 60 }); // the old taxonomy direction
    await ensurePrerequisites(repo);
    assert.equal(await repo.count("SkillPrerequisite", { skillId: sum, prerequisiteSkillId: ci }), 0, "the edge that would close the cycle is skipped");
    const all = await repo.findMany("SkillPrerequisite", {});
    const needs = new Map<string, Set<string>>();
    for (const e of all) { assert.equal(wouldCycle(needs, String(e.skillId), String(e.prerequisiteSkillId)), false, "no cycle in the stored graph"); needs.set(String(e.skillId), new Set([...(needs.get(String(e.skillId)) ?? []), String(e.prerequisiteSkillId)])); }
  });
});

describe("3/4 · item calibration uses only pre-answer θ, with the scoring model", () => {
  test("answers without a decision log are left out; with one, b moves (2PL: the stored c is ignored)", async () => {
    const { repo } = await demoDatabase();
    const { runItemAnalysis } = await import("../src/server/jobs/item-analysis");
    const qs = await repo.findMany("Question", { deletedAt: null }, { take: 2 });
    const students = await repo.findMany("Student", {}, { take: 6 });
    const ses = await repo.create("PracticeSession", { studentId: students[0].id, mode: "ADAPTIVE_PRACTICE", startedAt: new Date() });
    await repo.updateMany("Question", { id: { in: qs.map((q) => q.id) } }, { irtC: 0.25 });
    for (const [k, q] of qs.entries()) {
      for (let i = 0; i < 40; i++) {
        const at = await repo.create("QuestionAttempt", { sessionId: ses.id, studentId: students[i % students.length].id, questionId: q.id, skillId: q.skillId, response: {}, isCorrect: i % 10 === 0, responseMs: 30_000, difficultyB: Number(q.irtB), createdAt: new Date() });
        // only the first question's answers have a decision log (θ before the answer)
        if (k === 0) await repo.create("AdaptiveDecisionLog", { studentId: students[i % students.length].id, sessionId: ses.id, attemptId: at.id, questionId: q.id, skillId: q.skillId, previousTheta: 0, newTheta: 0, thetaSE: 1, reason: "test", reasonCode: "ASSIGNED_SET", engineVersion: "t", createdAt: new Date() });
      }
    }
    await runItemAnalysis(repo);
    const [a, b] = await Promise.all(qs.map(async (q) => (await repo.findUnique("Question", { id: q.id }))!));
    assert.equal(a.calibrated, true);
    assert.ok(Number(a.irtB) > Number(qs[0].irtB), "mostly wrong → harder");
    assert.ok(!b.calibrated, "no pre-answer θ → not calibrated from future data");
    const stats = (await repo.findUnique("QuestionStats", { questionId: qs[1].id }))!;
    assert.equal(Number(stats.attempts), 40, "the answers still count for p-value and time");
    assert.equal(stats.pointBiserial, null, "… but not for discrimination");
  });
});
