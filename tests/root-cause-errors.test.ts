/**
 * 🔍 Root cause of errors (owner r67 point 4) and the error-type sentence (point 5), with an action button next to
 * every insight (point 15) — demo school in memory, never a real database:
 *   "The real gap is Key Details (52%), which Main Idea depends on." + Assign Key Details (the prerequisite graph);
 *   "Ahmed confuses an event or fact with the theme or lesson — 5 of the last 8 wrong answers." (misconception tags);
 *   a mistake shared by 40 %+ of the class → "Re-teach to the whole class" with the Learn lesson; staff only.
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { demoDatabase } from "./helpers/db";
import { resolveActor } from "../src/server/auth/actor";
import { ForbiddenError, type Actor } from "../src/server/auth/rbac";
import { buildGraph, type SkillState } from "../src/server/graph/knowledge-graph";
import { CLASS_WIDE_SHARE, classErrors, classWidePatterns, errorSentenceFor, rootCausesFrom, studentRootCauses } from "../src/server/insights/error-patterns";
import { INSIGHT_ACTIONS, insightHref } from "../src/components/teacher/insight-links";

const ROOT = process.cwd();
const read = (f: string) => readFileSync(join(ROOT, f), "utf8");
const s = (v: unknown) => String(v ?? "");
const st = (mastery: number, attempts: number, o: Partial<SkillState> = {}): SkillState => ({ mastery, attempts, theta: null, recentErrors: 0, recentAnswers: 0, misconception: null, isMastered: false, ...o });

describe("🔍 the sentences (pure)", () => {
  test("the main mistake: 3+ of the last 8 wrong answers, in plain words", () => {
    const wrong = [...Array(5).fill({ misconception: "EVENT_NOT_THEME" }), { misconception: "NOT_SUPPORTED" }, { misconception: null }, { misconception: null }, { misconception: "EVENT_NOT_THEME" }];
    const e = errorSentenceFor("s1", "Ahmed Ali", wrong)!;
    assert.equal(e.sentence, "Ahmed confuses an event or fact with the theme or lesson — 5 of the last 8 wrong answers.");
    assert.deepEqual([e.count, e.of, e.code], [5, 8, "EVENT_NOT_THEME"], "only the last 8 count");
    assert.equal(errorSentenceFor("s1", "Ahmed", [{ misconception: "NOT_SUPPORTED" }, { misconception: "NOT_SUPPORTED" }, { misconception: null }]), null, "2 is not a pattern");
    assert.equal(errorSentenceFor("s1", "Ahmed", [{ misconception: "UNKNOWN_CODE" }, { misconception: "UNKNOWN_CODE" }, { misconception: "UNKNOWN_CODE" }]), null);
  });

  test("class-wide: shared by 40 %+ of the class → re-teach to everyone", () => {
    assert.equal(CLASS_WIDE_SHARE, 0.4);
    const codes = new Map([["a", new Set(["DETAIL_NOT_MAIN"])], ["b", new Set(["DETAIL_NOT_MAIN", "SPELLING"])], ["c", new Set<string>()], ["d", new Set(["SPELLING"])], ["e", new Set<string>()]]);
    const p = classWidePatterns(codes, 5);
    assert.deepEqual(p.map((x) => x.code), ["DETAIL_NOT_MAIN", "SPELLING"], "2 of 5 = 40 %");
    assert.equal(p[0].rootFamily, "central-idea", "the Learn lesson comes from the mistake's foundation skill");
    assert.deepEqual(classWidePatterns(codes, 6).map((x) => x.code), [], "2 of 6 is under 40 %");
  });

  test("root cause: the weak prerequisite underneath, in one sentence", () => {
    const g = buildGraph(
      [{ id: "kd", code: "G4.key-details", name: "Key Details", sequence: 1, category: "INFORMATIONAL" }, { id: "mi", code: "G4.central-idea", name: "Main Idea", sequence: 2, category: "INFORMATIONAL" }, { id: "th", code: "G4.theme", name: "Theme", sequence: 3, category: "LITERATURE" }],
      [{ skillId: "mi", prerequisiteSkillId: "kd", minimumMastery: 60, weight: 0.5 }],
    );
    const states = new Map([["mi", st(40, 12, { recentAnswers: 8, recentErrors: 5 })], ["kd", st(52, 10)], ["th", st(85, 10)]]);
    const r = rootCausesFrom(g, states);
    assert.equal(r.length, 1);
    assert.equal(r[0].sentence, "The real gap is Key Details (52%), which Main Idea depends on.");
    assert.deepEqual([r[0].prereqId, r[0].skillId], ["kd", "mi"]);
    assert.deepEqual(rootCausesFrom(g, new Map([["mi", st(40, 12)], ["kd", st(80, 10)]])), [], "a strong prerequisite: the skill itself");
  });

  test("the five action buttons, the same everywhere", () => {
    assert.deepEqual(INSIGHT_ACTIONS.map((a) => a.label), ["Create plan", "Small group", "Re-teach", "Contact parent", "Send a Learn lesson"]);
    const x = { classId: "c1", studentId: "s1", skillId: "k1" };
    assert.equal(insightHref("plan", x), "/teacher/plans?tab=custom&classId=c1&who=student&sid=s1");
    assert.equal(insightHref("group", { ...x, studentIds: ["s1", "s2"] }), "/teacher/intervention/groups?class=c1&students=s1%2Cs2");
    assert.equal(insightHref("reteach", x), "/teacher/skill-assign?skillId=k1&classId=c1");
    assert.equal(insightHref("parent", x), "/teacher/students/s1#comments", "comments reach the student and the parent");
    assert.equal(insightHref("lesson", x), "/teacher/learn/assign?kind=LESSON&skillId=k1&classId=c1&studentId=s1");
    assert.equal(insightHref("parent", { classId: "c1" }), null, "no student, no parent");
    for (const f of ["src/app/teacher/alerts/page.tsx", "src/app/teacher/alerts/flags-view.tsx", "src/app/teacher/reports/early-warning/page.tsx", "src/app/teacher/ai/page.tsx", "src/app/teacher/reports/errors/page.tsx", "src/app/teacher/reports/class/page.tsx", "src/app/teacher/students/[studentId]/page.tsx"]) assert.match(read(f), /<InsightActions /, f);
  });
});

describe("🔍 on the demo school", () => {
  let repo: SqliteRepo; let teacher: Actor; let other: Actor; let student: Actor; let classId = ""; let ids: string[] = [];
  before(async () => {
    ({ repo } = await demoDatabase({ classesPerGrade: 1, studentsPerClass: 4 }));
    const as = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);
    teacher = await as("demo.teacher.4a"); other = await as("demo.teacher.5a");
    const t = await repo.findUnique("Teacher", { userId: teacher.userId });
    classId = s((await repo.findMany("ClassTeacher", { teacherId: t!.id }))[0].classId);
    ids = (await repo.findMany("ClassMembership", { classId })).map((m) => s(m.studentId)).sort();
    student = await resolveActor(repo, (await repo.findUnique("User", { id: (await repo.findUnique("Student", { id: ids[0] }))!.userId }))!);
    const g4 = (await repo.findUnique("Student", { id: ids[0] }))!.gradeId;
    const cur = await repo.findMany("Curriculum", { gradeId: g4 });
    const skills = await repo.findMany("Skill", { curriculumId: { in: cur.map((c) => s(c.id)) } });
    const skill = skills.find((k) => /central-idea$/.test(s(k.code)))!;
    const q = (await repo.findMany("Question", {}, { take: 1 }))[0];
    // 2 of 4 students pick "a detail instead of the main idea" again and again
    for (const sid of ids.slice(0, 2)) {
      const sess = await repo.create("PracticeSession", { studentId: sid, mode: "ADAPTIVE_PRACTICE", skillId: skill.id, startedAt: new Date() });
      for (let i = 0; i < 5; i++) await repo.create("QuestionAttempt", { sessionId: sess.id, studentId: sid, questionId: q.id, skillId: skill.id, isCorrect: false, response: { value: "B" }, responseMs: 20000, rapidGuess: false, difficultyB: 0, misconception: "DETAIL_NOT_MAIN", createdAt: new Date(Date.now() - i * 60_000) });
    }
    // student 3: a Grade 4 skill weak because its (Grade 4) prerequisite is weak
    const g4ids = new Set(skills.map((k) => s(k.id)));
    edge = (await repo.findMany("SkillPrerequisite", { skillId: { in: [...g4ids] } })).find((e) => g4ids.has(s(e.prerequisiteSkillId)) && Number(e.minimumMastery) > 45) ?? null;
    assert.ok(edge, "the grade's prerequisite graph");
    await repo.create("StudentSkillMastery", { studentId: ids[2], skillId: edge.skillId, score: 35, attempts: 12, correct: 4, isMastered: false, updatedAt: new Date() });
    await repo.create("StudentSkillMastery", { studentId: ids[2], skillId: edge.prerequisiteSkillId, score: 45, attempts: 10, correct: 4, isMastered: false, updatedAt: new Date() });
  });
  let edge: Record<string, unknown> | null = null;

  test("the class view: each student's sentence, the class-wide mistake with its Learn lesson, the gaps", async () => {
    const v = await classErrors(repo, teacher, classId);
    assert.equal(v.size, 4);
    assert.equal(v.sentences.length, 2);
    assert.match(v.sentences[0].sentence, /picks a detail instead of the main idea — 5 of the last 5 wrong answers\.$/);
    assert.equal(v.classWide.length, 1, "2 of 4 = 50 %");
    assert.equal(v.classWide[0].code, "DETAIL_NOT_MAIN");
    assert.match(s(v.classWide[0].lesson?.name), /./, "the grade's central-idea skill gives the Learn lesson");
    const r = await studentRootCauses(repo, ids[2]);
    assert.ok(r.length >= 1, "the real gap is found");
    assert.equal(r[0].prereqId, s(edge!.prerequisiteSkillId));
    assert.match(r[0].sentence, /^The real gap is .+ \(45%\), which .+ depends on\.$/);
    assert.ok(v.gaps.some((g) => g.prereqId === s(edge!.prerequisiteSkillId) && g.students.includes(ids[2])), "grouped in the class view");
  });

  test("staff only, own classes only", async () => {
    await assert.rejects(classErrors(repo, student, classId), ForbiddenError);
    await assert.rejects(classErrors(repo, other, classId), ForbiddenError);
  });
});
