import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import type { Actor } from "../src/server/auth/rbac";
import { seedTestEnvironment } from "../src/server/seeding/test-env";
import { teacherRoster } from "../src/server/teacher/assign";
import { demoDatabase } from "./helpers/db";
import { estimateDifficulty, estimateDok, metadataGaps } from "../src/questions/intelligence";
import { ancestors, buildGraph, classGaps, descendants, diagnose, rootGaps, type SkillState } from "../src/server/graph/knowledge-graph";
import { genericPath, planFromContext, planPath, type PathContext } from "../src/server/graph/learning-path";
import { analyzeQuestions, confirmMetadata, coverage, findDuplicateGroups, intelligenceOverview, queueDuplicates } from "../src/server/questions/intelligence";
import { reviewSuggestion } from "../src/server/ai/jobs";
import { ensurePrerequisites, FAMILY_PREREQUISITES } from "../src/server/skills/auto-prerequisites";
import { buildProfiles, profilesOf } from "../src/server/insights/student-profile";
import { nextStep } from "../src/server/student/next-step";
import { runItemAnalysis } from "../src/server/jobs/item-analysis";
import { detectMisconceptions } from "../src/server/insights/misconception-tags";

const S = (o: Partial<SkillState>): SkillState => ({ mastery: 0, attempts: 0, theta: null, recentErrors: 0, recentAnswers: 0, misconception: null, isMastered: false, ...o });

describe("🧠 Update 33 · question intelligence (rules)", () => {
  test("DOK from the skill and the wording", () => {
    assert.equal(estimateDok("G4.nouns", "Which word is a noun?"), 1);
    assert.equal(estimateDok("G4.context-clues", "What does “ancient” mean in the sentence?"), 2);
    assert.equal(estimateDok("G5.inference", "What can the reader infer about Omar?"), 3);
    assert.equal(estimateDok("G4.sequence", "Which detail best supports the idea that the storm was over?"), 3, "an evidence question goes up");
    assert.equal(estimateDok("", "Choose the answer.", "WRITING"), 3, "category fallback");
  });

  test("the difficulty estimate rises with structure and length, and agrees with authors on the platform's bank", () => {
    const easy = estimateDifficulty({ stem: "Is a cat an animal?", type: "TRUE_FALSE", dok: 1 });
    const hard = estimateDifficulty({ stem: "Which TWO details from the passage best support the author's claim that community gardens improve neighborhoods, and why?", type: "MULTI_SELECT", dok: 3, options: [{ text: "Gardens give people a reason to meet their neighbors every week", correct: true }, { text: "Gardens are expensive to build in small neighborhoods", correct: false }, { text: "Neighbors share vegetables and stories in the gardens", correct: true }, { text: "Some people prefer parks to gardens in the city", correct: false }] });
    assert.ok(easy.level < hard.level, `${easy.level} < ${hard.level}`);
    assert.ok(hard.factors.structure > easy.factors.structure);
    const bank = JSON.parse(readFileSync("data/questions/bank.json", "utf8"));
    const P = new Map(bank.passages.map((p: { id: string; text: string }) => [p.id, p.text]));
    let within = 0;
    for (const q of bank.items) {
      const e = estimateDifficulty({ stem: q.stem, type: q.type, passage: q.passage ? (P.get(q.passage) as string) : null, options: q.options?.map((o: { text: string; correct: boolean }) => ({ text: o.text, correct: o.correct })), dok: estimateDok(q.skillKey, q.stem), grade: q.grade });
      if (Math.abs(e.level - q.level) <= 1) within++;
    }
    const rate = within / bank.items.length;
    console.log(`  difficulty estimate within one level of the authored level: ${(rate * 100).toFixed(1)}% of ${bank.items.length}`);
    assert.ok(rate >= 0.6, `${rate}`);
  });

  test("missing metadata is listed field by field", () => {
    assert.deepEqual(metadataGaps({ skillId: "s", standardId: null, mapInstructionalArea: "Vocabulary", difficultyLevel: 4, dok: null, lexile: null, textLevel: 640 }, [{ misconception: null }], true), ["standard", "dok", "misconceptions"]);
  });
});

describe("🕸️ Update 33 · knowledge graph and personal path (pure)", () => {
  const skills = [
    { id: "cc", code: "G4.context-clues", name: "Context Clues", sequence: 1 }, { id: "te", code: "G4.text-evidence", name: "Text Evidence", sequence: 2 },
    { id: "inf", code: "G4.inference", name: "Inference", sequence: 3 }, { id: "th", code: "G4.theme", name: "Theme", sequence: 4 }, { id: "ch", code: "G4.character", name: "Character", sequence: 5 },
  ];
  const edges = [["inf", "cc"], ["inf", "te"], ["th", "inf"], ["th", "ch"]].map(([skillId, prerequisiteSkillId]) => ({ skillId, prerequisiteSkillId, minimumMastery: 60, weight: 0.5 }));
  const g = buildGraph(skills, [...edges, { skillId: "cc", prerequisiteSkillId: "th", minimumMastery: 60, weight: 0.5 }]); // the last edge makes a cycle: must not hang
  const ctx = (states: Record<string, SkillState>): PathContext => ({
    graph: buildGraph(skills, edges), states: new Map(Object.entries(states)), practicable: new Set(skills.map((k) => k.id)), weakArea: new Set(), assigned: new Set(),
    currentUnit: new Set(skills.map((k) => k.id)), unitOf: new Map(skills.map((k) => [k.id, 1])), currentUnitNo: 1, velocity: new Map(), reviewDue: new Set(),
  });

  test("depth, ancestors and dependents; a cycle an admin made is cut", () => {
    const clean = buildGraph(skills, edges);
    assert.deepEqual([clean.nodes.get("cc")!.depth, clean.nodes.get("inf")!.depth, clean.nodes.get("th")!.depth], [0, 1, 2]);
    assert.deepEqual(ancestors(clean, "th").map((a) => a.id).sort(), ["cc", "ch", "inf", "te"]);
    assert.deepEqual(descendants(clean, "cc").sort(), ["inf", "th"]);
    assert.ok(g.nodes.size === 5, "cyclic graph built");
    const fam = new Set(FAMILY_PREREQUISITES.map(([a]) => a));
    assert.ok(fam.has("inference") && fam.has("theme"));
  });

  test("is it really Inference, or a missing prerequisite?", () => {
    const gr = buildGraph(skills, edges);
    const struggling = S({ mastery: 35, attempts: 12, recentErrors: 6, recentAnswers: 10 });
    const d1 = diagnose(gr, new Map([["inf", struggling], ["te", S({ mastery: 30, attempts: 8 })], ["cc", S({ mastery: 85, attempts: 15, isMastered: false })]]), "inf");
    assert.deepEqual([d1.verdict, d1.causes.map((c) => c.skillId)], ["PREREQUISITE", ["te"]]);
    const d2 = diagnose(gr, new Map([["inf", struggling], ["te", S({ mastery: 80, attempts: 12 })], ["cc", S({ mastery: 82, attempts: 12 })]]), "inf");
    assert.equal(d2.verdict, "SKILL_ITSELF");
    const d3 = diagnose(gr, new Map([["inf", struggling], ["te", S({ mastery: 80, attempts: 12 })]]), "inf");
    assert.deepEqual([d3.verdict, d3.causes.map((c) => c.skillId)], ["UNTESTED_PREREQUISITE", ["cc"]]);
    const d4 = diagnose(gr, new Map([["inf", { ...struggling, misconception: "NOT_SUPPORTED" }], ["te", S({ mastery: 70, attempts: 2 })], ["cc", S({ mastery: 82, attempts: 12 })]]), "inf");
    assert.ok(d4.verdict === "PREREQUISITE" && d4.causes[0].skillId === "te" && /mistake/.test(d4.causes[0].why), "the misconception points to Text Evidence");
    assert.equal(diagnose(gr, new Map([["inf", S({ mastery: 80, attempts: 12 })]]), "inf").verdict, "NOT_STRUGGLING");
  });

  test("root gaps: the weak foundation, not every weak skill", () => {
    const gr = buildGraph(skills, edges);
    const gaps = rootGaps(gr, new Map([["te", S({ mastery: 30, attempts: 8 })], ["inf", S({ mastery: 35, attempts: 8 })], ["th", S({ mastery: 30, attempts: 8 })]]));
    assert.deepEqual(gaps.map((x) => x.skillId), ["te"], "Inference and Theme are weak BECAUSE of Text Evidence");
    assert.deepEqual(gaps[0].blocks.map((b) => b.skillId).sort(), ["inf", "th"]);
  });

  test("Student A (strong vocabulary, weak inference) and Student B (weak vocabulary) get different paths", () => {
    const A = planFromContext(ctx({ cc: S({ mastery: 88, attempts: 20, theta: 1.4 }), te: S({ mastery: 45, attempts: 8 }), inf: S({ mastery: 30, attempts: 10, recentErrors: 5, recentAnswers: 10 }), ch: S({ mastery: 70, attempts: 10 }) }));
    assert.ok(A.skipped.some((x) => x.skillId === "cc"), "skips basic vocabulary practice");
    const ia = A.steps.findIndex((x) => x.skillId === "inf"), ta = A.steps.findIndex((x) => x.skillId === "te");
    assert.ok(ta >= 0 && ia > ta && A.steps[ta].action === "FOUNDATION", "reviews evidence skills first, then inference");
    const B = planFromContext(ctx({ cc: S({ mastery: 25, attempts: 10, theta: -1.2 }), te: S({ mastery: 70, attempts: 10 }), inf: S({ mastery: 30, attempts: 10 }), ch: S({ mastery: 70, attempts: 10 }) }));
    const cb = B.steps.findIndex((x) => x.skillId === "cc"), ib = B.steps.findIndex((x) => x.skillId === "inf");
    assert.ok(cb >= 0 && (ib === -1 || cb < ib), "builds vocabulary before inference");
    assert.ok(B.steps[cb].level < 4, "at an easier level (ability below grade)");
    assert.notDeepEqual(A.steps.map((x) => x.skillId), B.steps.map((x) => x.skillId), "different journeys");
    const gen = genericPath(ctx({}));
    assert.deepEqual(gen.map((x) => x.skillId).slice(0, 2), ["cc", "te"], "the old way: curriculum order for everyone");
  });
});

describe("🧠 Update 33 · on the test school", () => {
  let repo: SqliteRepo; let admin: Actor; let teacher: Actor; let student: Actor; let ids: string[];
  before(async () => {
    ({ repo } = await demoDatabase());
    await seedTestEnvironment(repo, { root: process.cwd(), passwordHash: "x".repeat(60), practice: "light" as never });
    const as = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);
    admin = await as("test.admin"); teacher = await as("test.teacher.1"); student = await as("test.student.001");
    ids = (await teacherRoster(repo, teacher))[0].students.map((x) => x.id);
    await ensurePrerequisites(repo);
  });

  test("every question is analysed once; a person's values are kept; disagreements wait for review", async () => {
    const st0 = (await repo.findUnique("Student", { id: student.studentId! }))!;
    const cur0 = (await repo.findMany("Curriculum", { gradeId: st0.gradeId, isActive: true }))[0];
    const q0 = (await repo.findMany("Question", { status: "PUBLISHED", skillId: { in: (await repo.findMany("Skill", { curriculumId: cur0.id }, { select: ["id"] })).map((k) => k.id) } }))[0];
    await repo.updateMany("Question", { id: q0.id }, { dok: 4, dokSource: "ADMIN" });
    const r = await analyzeQuestions(repo, String(admin.schoolId), { limit: 10000 });
    assert.ok(r.analysed > 100 && r.dokFilled > 100, JSON.stringify(r));
    assert.equal((await analyzeQuestions(repo, String(admin.schoolId))).analysed, 0, "nothing new");
    assert.deepEqual([(await repo.findUnique("Question", { id: q0.id }))!.dok, (await repo.findUnique("Question", { id: q0.id }))!.dokSource], [4, "ADMIN"]);
    const o = await intelligenceOverview(repo, String(admin.schoolId));
    assert.equal(o.complete + o.autoCompleted + o.missingAny, o.total);
    assert.equal(o.missing.dok, 0);
    assert.ok(o.estimateAgreement.compared === o.total);
    const sg = (await repo.findMany("AiSuggestion", { tool: "INTEL", status: "SUGGESTED" }))[0];
    if (sg) {
      await reviewSuggestion(repo, admin, String(sg.id), "APPROVE");
      const q = (await repo.findUnique("Question", { id: sg.questionId }))!;
      assert.deepEqual([q.difficultySource, Number(q.difficultyLevel)], ["ESTIMATE", Number((sg.data as { to: number }).to)]);
    }
    assert.ok((await confirmMetadata(repo, admin, [String(q0.id)])) === 1);
  });

  test("coverage per skill with its problems", async () => {
    const rows = await coverage(repo, String(admin.schoolId), 4);
    assert.ok(rows.length > 10);
    assert.ok(rows.every((r) => r.easy + r.medium + r.hard === r.total));
    assert.ok(rows.some((r) => r.flags.includes("INSUFFICIENT")), "6-question skills are under 20");
  });

  test("duplicates: exact copies and the same objective in other words", async () => {
    const st = (await repo.findUnique("Student", { id: student.studentId! }))!;
    const cur = (await repo.findMany("Curriculum", { gradeId: st.gradeId, isActive: true }))[0];
    const sk = await repo.findMany("Skill", { curriculumId: cur.id }, { select: ["id"] });
    const q = (await repo.findMany("Question", { status: "PUBLISHED", skillId: { in: sk.map((k) => k.id) } }))[3];
    const opts = await repo.findMany("QuestionOption", { questionId: q.id });
    const copy = await repo.create("Question", { ...q, id: undefined, externalRef: `${q.externalRef}-copy`, createdAt: new Date(Date.now() + 1000) });
    for (const o of opts) await repo.create("QuestionOption", { ...o, id: undefined, questionId: copy.id });
    const reworded = await repo.create("Question", { ...q, id: undefined, externalRef: `${q.externalRef}-rw`, stem: `${q.stem} Choose one.`, createdAt: new Date(Date.now() + 2000) });
    for (const o of opts) await repo.create("QuestionOption", { ...o, id: undefined, questionId: reworded.id, text: o.isCorrect ? o.text : `Maybe ${o.text}` });
    const groups = await findDuplicateGroups(repo, String(admin.schoolId));
    assert.ok(groups.some((g) => g.kind === "EXACT" && g.keep === q.id && g.remove === copy.id));
    assert.ok(groups.some((g) => g.remove === reworded.id));
    const n = await queueDuplicates(repo, String(admin.schoolId));
    assert.ok(n >= 2);
    assert.equal(await queueDuplicates(repo, String(admin.schoolId)), 0, "no double suggestions");
  });

  test("the class's foundation gaps and every student's path and profile", async () => {
    const st = (await repo.findUnique("Student", { id: student.studentId! }))!;
    const cur = (await repo.findMany("Curriculum", { gradeId: st.gradeId, isActive: true }))[0];
    const cg = await classGaps(repo, ids, String(cur.id));
    assert.equal(cg.diagnoses.size, ids.length);
    const p = await planPath(repo, student.studentId!);
    assert.ok(p.steps.length >= 1 && p.steps.every((x) => x.level >= 1 && x.level <= 7 && x.why.length));
    const step = await nextStep(repo, student);
    assert.ok(step.title);
    await buildProfiles(repo, String(admin.schoolId), new Date(), ids.slice(0, 5));
    const prof = (await profilesOf(repo, ids.slice(0, 5)));
    const i = [...prof.values()].map((x) => x.intelligence).find(Boolean)!;
    assert.ok(i && Array.isArray(i.path) && Array.isArray(i.mastered) && Array.isArray(i.missingPrerequisites) && Array.isArray(i.diagnoses) && i.trajectory.length === 1);
  });

  test("a misconception counts only when chosen clearly more often than chance", async () => {
    // a question whose wrong options carry three different misconceptions
    const q = (await repo.findMany("Question", { status: "PUBLISHED" })).find(() => true)!;
    const wrongOpts = await repo.findMany("QuestionOption", { questionId: q.id, isCorrect: false });
    const codes = ["DETAIL_NOT_MAIN", "NOT_SUPPORTED", "CONTEXT_IGNORED"];
    for (const [k, o] of wrongOpts.entries()) await repo.updateMany("QuestionOption", { id: o.id }, { misconception: codes[k % 3] });
    const ses = await repo.create("PracticeSession", { studentId: ids[9], mode: "ADAPTIVE_PRACTICE", startedAt: new Date() });
    const ses2 = await repo.create("PracticeSession", { studentId: ids[10], mode: "ADAPTIVE_PRACTICE", startedAt: new Date() });
    for (let i = 0; i < 6; i++) {
      await repo.create("QuestionAttempt", { sessionId: ses.id, studentId: ids[9], questionId: q.id, skillId: q.skillId, response: {}, isCorrect: false, misconception: "DETAIL_NOT_MAIN", responseMs: 30_000, difficultyB: 0, createdAt: new Date() });
      await repo.create("QuestionAttempt", { sessionId: ses2.id, studentId: ids[10], questionId: q.id, skillId: q.skillId, response: {}, isCorrect: false, misconception: codes[i % 3], responseMs: 30_000, difficultyB: 0, createdAt: new Date() });
    }
    const d = await detectMisconceptions(repo, [ids[9], ids[10]], new Date(Date.now() - 86_400_000));
    assert.equal(d.get(ids[9])?.[0]?.code, "DETAIL_NOT_MAIN", "always the same mistake: detected");
    assert.ok(d.get(ids[9])![0].lift >= 2.5);
    assert.equal(d.get(ids[10])?.length ?? 0, 0, "random wrong picks: no misconception claimed");
  });

  test("calibration starts at 30 answers (b only) and records where the difficulty comes from", async () => {
    const q = (await repo.findMany("Question", { status: "PUBLISHED", calibrated: false }))[5];
    const ses = await repo.create("PracticeSession", { studentId: ids[0], mode: "ADAPTIVE_PRACTICE", startedAt: new Date() });
    for (let i = 0; i < 40; i++) {
      const at = await repo.create("QuestionAttempt", { sessionId: ses.id, studentId: ids[i % ids.length], questionId: q.id, skillId: q.skillId, response: {}, isCorrect: i % 10 === 0, responseMs: 30_000, difficultyB: Number(q.irtB), createdAt: new Date() });
      // calibration only uses answers with the ability BEFORE the answer (the decision log), never the current one
      await repo.create("AdaptiveDecisionLog", { studentId: ids[i % ids.length], sessionId: ses.id, attemptId: at.id, questionId: q.id, skillId: q.skillId, previousTheta: 0, newTheta: 0, thetaSE: 1, reason: "test", reasonCode: "ASSIGNED_SET", engineVersion: "t", createdAt: new Date() });
    }
    await runItemAnalysis(repo);
    const after = (await repo.findUnique("Question", { id: q.id }))!;
    assert.equal(after.calibrated, true);
    assert.equal(after.difficultySource, "CALIBRATED");
    assert.ok(Number(after.irtB) > Number(q.irtB), "mostly wrong → harder than authored");
    assert.equal(Number(after.irtA), 1, "discrimination waits for 200 answers");
  });
});
