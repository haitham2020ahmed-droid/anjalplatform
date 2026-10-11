import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import type { Actor } from "../src/server/auth/rbac";
import { seedTestEnvironment, rightAnswer } from "../src/server/seeding/test-env";
import { teacherRoster } from "../src/server/teacher/assign";
import { demoDatabase } from "./helpers/db";
import { tutorFeedback, tutorLeaksAnswer, bandOfTheta } from "../src/tutor/tutor";
import { auc, computeRisks, EXPERT_WEIGHTS, featuresOf, fitLogistic, forecast, riskProbability, riskReasons, risksOf, trainRiskModel, type RawSignals } from "../src/server/predict/risk";
import { weightsFrom, learnActionWeights } from "../src/server/insights/learning-weights";
import { intentOf, classIntelligence, copilotAnswer } from "../src/server/copilot/copilot";
import { schoolAi } from "../src/server/predict/school-ai";
import { buildProfiles } from "../src/server/insights/student-profile";
import { tagOptions } from "../src/server/insights/misconception-tags";
import { loadSkillItems } from "../src/server/practice/items";
import { startPractice, submitAnswer } from "../src/server/practice/session";
import { ensurePrerequisites } from "../src/server/skills/auto-prerequisites";

const base: RawSignals = { days14: 6, daysPrev14: 6, growthPerWeek: 5, theta: 0, goalChance: 50, rootGaps: 0, rapidRate: 0, weeklyChange: 0, interventionFailed: false, hasMap: true, weakSkill: null };

describe("🧑‍🏫 Update 34 · tutor (pure)", () => {
  const input = { misconception: "DETAIL_NOT_MAIN", band: "ON" as const, repeated: 1, rationale: "The basket is a small detail.", tip: "Think about the whole text.", hint: null, hasPassage: true, correctTexts: ["Fixing something can make it stronger than before."] };
  test("names the mistake, guides with a question, never gives the answer", () => {
    const t = tutorFeedback(input);
    assert.match(t.message, /supporting detail.*main idea/);
    assert.match(t.guidingQuestion, /WHOLE text/);
    assert.ok(t.example.length > 20 && t.strategy.length > 10);
    assert.equal(tutorLeaksAnswer(t, input.correctTexts), false);
    assert.equal(tutorLeaksAnswer({ ...t, hint: "Fixing something can make it stronger than before." }, input.correctTexts), true, "the leak check works");
    const leaky = tutorFeedback({ ...input, hint: "The answer: fixing something can make it stronger than before" });
    assert.equal(tutorLeaksAnswer(leaky, input.correctTexts), false, "a hint that would give it away is replaced");
  });
  test("adjusts to the level and to repeated mistakes", () => {
    const below = tutorFeedback({ ...input, band: "BELOW" }), above = tutorFeedback({ ...input, band: "ABOVE" }), again = tutorFeedback({ ...input, repeated: 4 });
    assert.ok(below.message.length < tutorFeedback(input).message.length, "simpler for Below Level");
    assert.match(above.strategy, /10 words/);
    assert.match(again.message, /pattern/);
    assert.deepEqual([bandOfTheta(-1), bandOfTheta(0), bandOfTheta(1.2), bandOfTheta(null)], ["BELOW", "ON", "ABOVE", "ON"]);
  });
});

describe("🚨 Update 34 · prediction and learning (pure)", () => {
  test("risk rises with the signals that predict failure, with reasons and actions", () => {
    const ok = riskProbability(featuresOf(base));
    const bad: RawSignals = { ...base, days14: 1, daysPrev14: 7, growthPerWeek: 0, theta: -1.2, goalChance: 15, rootGaps: 2, weakSkill: "Text Evidence" };
    const p = riskProbability(featuresOf(bad));
    assert.ok(p > 0.85 && ok < 0.5, `${ok} → ${p}`);
    const r = riskReasons(bad, featuresOf(bad));
    assert.equal(r[0].key, "lowGoalChance");
    assert.ok(r.some((x) => x.key === "decliningPractice" && /7 → 1/.test(x.text)));
    assert.ok(r.find((x) => x.key === "weakFoundations")!.action.includes("Text Evidence"));
  });
  test("the model re-fits from outcomes and ranks better than chance; AUC is right", () => {
    assert.equal(auc([0.9, 0.8, 0.2, 0.1], [true, true, false, false]), 1);
    assert.equal(auc([0.1, 0.2, 0.8, 0.9], [true, true, false, false]), 0);
    // synthetic school where only practice decline matters
    const X = [], y: boolean[] = [];
    let seed = 7; const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
    for (let i = 0; i < 400; i++) { const r = { ...base, days14: Math.round(rnd() * 12), daysPrev14: Math.round(rnd() * 12), goalChance: Math.round(rnd() * 100) }; const f = featuresOf(r); X.push(f); y.push(rnd() < 1 / (1 + Math.exp(-(2.5 * f.decliningPractice - 1)))); }
    const m = fitLogistic(X, y, EXPERT_WEIGHTS, 0.01, 1500, 0.3);
    assert.ok(m.w.decliningPractice > EXPERT_WEIGHTS.w.decliningPractice, `learned ${m.w.decliningPractice}`);
    assert.ok(auc(X.map((x) => riskProbability(x, m)), y) > auc(X.map((x) => riskProbability(x)), y));
  });
  test("forecasts weeks from the student's own pace", () => {
    const f = forecast([{ name: "Theme", mastery: 55 }], 10, { rit: 205, goal: 207, current: 200, weeksToTerm: 10 });
    assert.deepEqual(f.skills[0], { name: "Theme", weeks: 2 });
    assert.equal(f.ritPerWeek, 0.5);
    assert.equal(f.weeksToGoal, 14);
  });
  test("learned step weights: better steps weigh more, few examples stay near neutral, bounded", () => {
    const rows = [...Array(60)].map((_, i) => ({ kind: "FOUNDATION", followed: true, improved: i % 3 !== 0 })).concat([...Array(60)].map((_, i) => ({ kind: "TARGET", followed: true, improved: i % 3 === 0 }))).concat([{ kind: "STRETCH", followed: true, improved: true }]);
    const { weights } = weightsFrom(rows);
    assert.ok(weights.FOUNDATION > 1 && weights.TARGET < 1);
    assert.ok(weights.STRETCH < 1.05, "one example barely moves it");
    assert.ok(Object.values(weights).every((w) => w >= 0.7 && w <= 1.3));
  });
  test("copilot intents", () => {
    assert.deepEqual(["What should I teach tomorrow?", "Who needs help this week?", "How should I group them?", "What mistakes do they make?", "How is my class doing?", "Which questions should I give?"].map(intentOf), ["TOMORROW", "HELP", "GROUPS", "MISTAKES", "PROGRESS", "QUESTIONS"]);
  });
});

describe("🤖 Update 34 · on the test school", () => {
  let repo: SqliteRepo; let admin: Actor; let teacher: Actor; let student: Actor; let classId: string; let ids: string[];
  before(async () => {
    ({ repo } = await demoDatabase());
    await seedTestEnvironment(repo, { root: process.cwd(), passwordHash: "x".repeat(60), practice: "light" as never });
    const as = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);
    admin = await as("test.admin"); teacher = await as("test.teacher.1"); student = await as("test.student.001");
    const r = (await teacherRoster(repo, teacher))[0]; classId = r.id; ids = r.students.map((x) => x.id);
    await ensurePrerequisites(repo); await tagOptions(repo);
  });

  test("a wrong answer brings the tutor (with the answer hidden until asked)", async () => {
    const st = (await repo.findUnique("Student", { id: student.studentId! }))!;
    const cur = (await repo.findMany("Curriculum", { gradeId: st.gradeId, isActive: true }))[0];
    const skills = await repo.findMany("Skill", { curriculumId: cur.id });
    let skillId = "";
    for (const k of skills) if ((await loadSkillItems(repo, String(k.id))).some((i) => i.type === "MULTIPLE_CHOICE")) { skillId = String(k.id); break; }
    let v = await startPractice(repo, student, skillId, new Date(Date.now() + 5 * 86_400_000));
    const items = new Map((await loadSkillItems(repo, skillId)).map((i) => [i.questionId, i]));
    let got = false;
    for (let k = 0; k < 15 && v.question && !got; k++) {
      const it = items.get(v.question.questionId)!;
      const wrong = it.type === "MULTIPLE_CHOICE" ? it.options!.find((o) => !o.correct)!.label : rightAnswer(it);
      const r = await submitAnswer(repo, student, { sessionId: v.sessionId, questionId: it.questionId, response: wrong }, new Date(Date.now() + 5 * 86_400_000 + k * 40_000));
      if (it.type === "MULTIPLE_CHOICE") { assert.ok(r.feedback.tutor && r.feedback.tutor.message.length > 10 && r.feedback.tutor.guidingQuestion); assert.equal(tutorLeaksAnswer(r.feedback.tutor!, [r.feedback.correctAnswer]), false); got = true; }
      v = r.view;
    }
    assert.ok(got);
  });

  test("early warning: every student scored with reasons; snapshots kept to learn from", async () => {
    await buildProfiles(repo, String(admin.schoolId));
    const r = await computeRisks(repo, String(admin.schoolId));
    assert.ok(r.students > 100);
    const p = (await repo.findMany("StudentProfile", { studentId: { in: ids } })).filter((x) => x.riskScore !== null);
    assert.equal(p.length, ids.length);
    assert.equal(await repo.count("RiskSnapshot", { studentId: { in: ids } }), ids.length);
    const risks = await risksOf(repo, String(admin.schoolId), ids);
    assert.ok(risks.every((x) => x.score >= 0 && x.score <= 100 && Array.isArray(x.reasons)));
  });

  test("the risk model learns from MAP outcomes once there are enough", async () => {
    // fictional history: old snapshots + a later MAP score that met or missed the goal
    const day = new Date(Date.now() - 120 * 86_400_000), fall = new Date(Date.now() - 150 * 86_400_000), spring = new Date(Date.now() - 20 * 86_400_000);
    const sts = (await repo.findMany("Student", { schoolId: admin.schoolId })).slice(0, 120);
    for (const [i, s] of sts.entries()) {
      const declining = i % 2 === 0;
      const f = featuresOf({ ...base, days14: declining ? 1 : 8, daysPrev14: declining ? 8 : 8 });
      await repo.create("RiskSnapshot", { studentId: s.id, schoolId: admin.schoolId, takenOn: day, score: 50, features: f, model: "EXPERT" });
      await repo.create("MapResult", { studentId: s.id, testDate: fall, subject: "Reading", goalName: null, rit: 200, projectedGrowth: 8, termName: "Fall 2025", importedAt: fall });
      await repo.create("MapResult", { studentId: s.id, testDate: spring, subject: "Reading", goalName: null, rit: declining ? (i % 6 === 0 ? 210 : 203) : (i % 5 === 0 ? 204 : 209), termName: "Spring 2026", importedAt: spring });
    }
    const t = await trainRiskModel(repo, String(admin.schoolId));
    assert.ok(t.n >= 100 && t.positives > 10, JSON.stringify(t));
    assert.ok(t.aucLearned !== null && t.aucExpert !== null);
    assert.ok(await repo.findUnique("PredictionModel", { schoolId: admin.schoolId, kind: "RISK" }));
  });

  test("the Copilot answers 'What should I teach tomorrow?' from the class's data", async () => {
    const intel = await classIntelligence(repo, teacher, classId);
    assert.equal(intel.students.length, ids.length);
    const a = await copilotAnswer(repo, intel, "TOMORROW");
    assert.ok(a.headline.startsWith("Tomorrow"));
    assert.ok(a.evidence.length >= 2 && /students/.test(a.evidence[0]));
    const g = await copilotAnswer(repo, intel, "GROUPS");
    const all = g.groups.flatMap((x) => x.studentIds);
    assert.equal(new Set(all).size, all.length, "each student in one group");
    const h = await copilotAnswer(repo, intel, "HELP");
    assert.ok(h.summary.length >= 1);
  });

  test("the platform learns which steps work; the school dashboard shows it", async () => {
    const w = await learnActionWeights(repo, String(admin.schoolId));
    assert.ok(w.weights.FOUNDATION >= 0.7);
    const d = await schoolAi(repo, String(admin.schoolId));
    assert.ok(d.grades.length >= 1 && d.outcomes.students > 100);
    assert.ok(["EXPERT", "LEARNED"].includes(d.models.risk.source));
  });

  test("questions whose data misleads are held back from practice (while the skill has 4+ others)", async () => {
    const st = (await repo.findUnique("Student", { id: student.studentId! }))!;
    const cur = (await repo.findMany("Curriculum", { gradeId: st.gradeId, isActive: true }))[0];
    const k = (await repo.findMany("Skill", { curriculumId: cur.id }))[2];
    const items = await loadSkillItems(repo, String(k.id));
    assert.ok(items.length >= 5);
    await repo.upsert("QuestionStats", { questionId: items[0].questionId }, { attempts: 80, correct: 30, flags: ["NEGATIVE_DISCRIMINATION"] }, { flags: ["NEGATIVE_DISCRIMINATION"] });
    const { bumpBankVersion } = await import("../src/server/cache/bank-version");
    bumpBankVersion();
    const after = await loadSkillItems(repo, String(k.id));
    assert.ok(!after.some((i) => i.questionId === items[0].questionId));
    assert.equal(after.length, items.length - 1);
  });
});
