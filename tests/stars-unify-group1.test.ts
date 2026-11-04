/**
 * ⭐ Group 1 (student-facing) reads the SAME stars as My Skills (SkillStatus, by skill key), never the engine's old
 * isMastered / nextReviewAt: two copies of a skill count once; old isMastered without ⭐ is not "mastered";
 * a ⭐ skill is never suggested; 🔄 comes first as a review.
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { demoDatabase } from "./helpers/db";
import { resolveActor } from "../src/server/auth/actor";
import type { Actor } from "../src/server/auth/rbac";
import { clearSkillKeys, skillKeyIndex } from "../src/server/skills/status";
import { starBook } from "../src/server/skills/star-read";
import { skillStates, buildGraph, type SkillState } from "../src/server/graph/knowledge-graph";
import { planFromContext, type PathContext } from "../src/server/graph/learning-path";
import { liveStarLists } from "../src/server/insights/student-profile";
import { myMonth, weeklySummary } from "../src/server/insights/class-compare";
import { lessonsForStudent } from "../src/server/lessons/run";
import { lessonForSkill } from "../src/server/lessons/content";

const s = (v: unknown) => String(v ?? "");

describe("⭐ group 1: stars by key on the student-facing pages", () => {
  let repo: SqliteRepo; let student: Actor; let teacher: Actor; let sid = ""; let schoolId = "";
  let key = ""; let copies: string[] = []; let oldOnly = "";
  const star = (studentId: string, skillId: string, skillKey: string, status: string, score = 95) =>
    repo.create("SkillStatus", { studentId, skillKey, level: 1, status, skillId, answered: 30, correct: 25, score, startedAt: new Date(), masteredAt: status === "MASTERED" ? new Date() : null, updatedAt: new Date() });

  before(async () => {
    ({ repo } = await demoDatabase({ classesPerGrade: 1, studentsPerClass: 3 }));
    const as = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);
    teacher = await as("demo.teacher.4a");
    const t = (await repo.findUnique("Teacher", { userId: teacher.userId }))!;
    const classId = s((await repo.findMany("ClassTeacher", { teacherId: t.id }))[0].classId);
    sid = s((await repo.findMany("ClassMembership", { classId }))[0].studentId);
    const st = (await repo.findUnique("Student", { id: sid }))!;
    schoolId = s(st.schoolId);
    student = await resolveActor(repo, (await repo.findUnique("User", { id: st.userId }))!);
    clearSkillKeys(repo);
    const ix = await skillKeyIndex(repo, schoolId);
    const pick = [...ix.skillsOf].find(([k, list]) => k.startsWith("fam:") && list.length >= 2)!;
    key = pick[0]; copies = pick[1].slice(0, 2);
    oldOnly = [...ix.keyOf].find(([, k]) => k !== key)![0];
    await star(sid, copies[0], key, "MASTERED");
    // the engine's old table says mastered, but there is no ⭐
    await repo.create("StudentSkillMastery", { studentId: sid, skillId: oldOnly, score: 96, attempts: 25, correct: 24, isMastered: true, masteredAt: new Date(), nextReviewAt: new Date(Date.now() - 86_400_000), updatedAt: new Date() });
  });

  test("two copies of one skill share ONE ⭐; old isMastered without ⭐ is not mastered", async () => {
    const st = await skillStates(repo, sid, [...copies, oldOnly]);
    assert.equal(st.get(copies[0])!.isMastered, true);
    assert.equal(st.get(copies[1])!.isMastered, true, "the other copy is the same star");
    assert.equal(st.get(copies[0])!.key, st.get(copies[1])!.key);
    assert.equal(st.get(oldOnly)!.isMastered, false, "old isMastered alone is not ⭐");
    const lists = liveStarLists(await starBook(repo, [sid], schoolId), sid);
    assert.equal(lists.mastered.length, 1, "counted once by key");
  });

  test("myMonth counts ⭐ keys only", async () => {
    const m = await myMonth(repo, student, new Date());
    assert.equal(m.thisMonth, 1);
  });

  test("weeklySummary: new stars by key, need review = students with 🔄", async () => {
    const before = (await weeklySummary(repo, teacher))!;
    assert.equal(before.newStars, 1);
    assert.equal(before.needReview, 0, "the old nextReviewAt never makes a review");
    await star(sid, oldOnly, (await starBook(repo, [sid], schoolId)).keyOf(oldOnly), "NEEDS_REVIEW", 70);
    const after = (await weeklySummary(repo, teacher))!;
    assert.equal(after.needReview, 1);
    assert.match(after.lines[0], /^This week: 1 new stars · 1 students need review/);
  });

  test("lessons for you: a ⭐ skill is never suggested; the % is the star score", async () => {
    const st = (await repo.findUnique("Student", { id: sid }))!;
    const curs = await repo.findMany("Curriculum", { gradeId: st.gradeId, isActive: true });
    const skills = await repo.findMany("Skill", { curriculumId: { in: curs.map((c) => c.id) }, deletedAt: null }, { select: ["id", "name", "code", "familyId"] });
    const fams = new Map((await repo.findMany("SkillFamily", {}, { select: ["id", "code"] })).map((f) => [s(f.id), s(f.code)]));
    const book = await starBook(repo, [sid], schoolId);
    const free = skills.filter((k) => lessonForSkill({ familyCode: fams.get(s(k.familyId)), code: s(k.code), name: s(k.name) }) && book.of(sid, s(k.id)).status === "NOT_STARTED");
    const keys = new Map<string, string>();
    for (const k of free) if (!keys.has(book.keyOf(s(k.id)))) keys.set(book.keyOf(s(k.id)), s(k.id));
    const [growing, starred] = [...keys.values()];
    assert.ok(growing && starred, "two lesson skills of different keys");
    await star(sid, growing, book.keyOf(growing), "IN_PROGRESS", 41);
    await star(sid, starred, book.keyOf(starred), "MASTERED");
    // the old engine says the ⭐ one is weak: it must still not be suggested
    await repo.create("StudentSkillMastery", { studentId: sid, skillId: starred, score: 20, attempts: 10, correct: 2, isMastered: false, updatedAt: new Date() });
    const r = await lessonsForStudent(repo, student);
    const g = r.suggested.find((x) => x.skillId === growing);
    assert.ok(g, JSON.stringify(r.suggested));
    assert.equal(g!.why, "Practice shows this skill is still growing (41%)");
    assert.ok(!r.suggested.some((x) => book.keyOf(x.skillId) === book.keyOf(starred)), "⭐ never suggested");
  });

  test("learning path: ⭐ skipped, 🔄 first as a review", () => {
    const S = (o: Partial<SkillState>): SkillState => ({ mastery: 30, attempts: 10, theta: null, recentErrors: 0, recentAnswers: 0, misconception: null, isMastered: false, ...o });
    const skills = ["a", "b", "c"].map((id, i) => ({ id, code: `G4.${id}`, name: id.toUpperCase(), sequence: i, category: "READING" }));
    const graph = buildGraph(skills, []);
    const states = new Map<string, SkillState>([["a", S({ isMastered: true, star: "MASTERED", key: "ka", mastery: 10 })], ["b", S({ star: "NEEDS_REVIEW", key: "kb", reviewDue: true, mastery: 80 })], ["c", S({ star: "IN_PROGRESS", key: "kc" })]]);
    const c: PathContext = { graph, states, practicable: new Set(["a", "b", "c"]), weakArea: new Set(), assigned: new Set(), currentUnit: new Set(["a", "b", "c"]), unitOf: new Map([["a", 1], ["b", 1], ["c", 1]]), currentUnitNo: 1, velocity: new Map(), reviewDue: new Set(["b"]) };
    const p = planFromContext(c, 5);
    assert.ok(!p.steps.some((x) => x.skillId === "a"), "⭐ is never a step even with a low engine score");
    assert.deepEqual([p.steps[0].skillId, p.steps[0].action, p.steps[0].why[0]], ["b", "REVIEW", "Needs review"]);
    assert.ok(p.steps.some((x) => x.skillId === "c"));
  });
});
