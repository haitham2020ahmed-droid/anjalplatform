/**
 * ⭐ Stars everywhere — group 2 (parents, assignment completion, rewards; owner, 1 Nov 2026): every "mastered",
 * "practise next", assignment completion, badge and coin reads the ONE skill status (SkillStatus stars, by skill KEY):
 *   - two copies of one skill (Grade 4 / Grade 5 rows) are ONE skill;
 *   - the old engine flag (StudentSkillMastery isMastered / score) without ⭐ is never "mastered";
 *   - a ⭐ skill is never suggested to practise; 🔄 comes first;
 *   - a skill assignment is COMPLETED by ⭐ (any copy) or 50 counted answers — never "10 answers + 75 %".
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import type { Actor } from "../src/server/auth/rbac";
import { seedTestEnvironment } from "../src/server/seeding/test-env";
import { teacherRoster, refreshSkillAssignments, assignmentStatus } from "../src/server/teacher/assign";
import { clearSkillKeys, skillKeyIndex } from "../src/server/skills/status";
import { masteredKeyCount, masteredSkills } from "../src/server/reports/mastered-count";
import { parentReport } from "../src/server/insights/parent-report";
import { familyWeek } from "../src/server/reports/family-week";
import { monthFacts, monthSpan } from "../src/server/reports/monthly-report";
import { studentBadges } from "../src/server/student/badges";
import { syncRewards } from "../src/server/motivation/sync";
import { countCoreAnswer, reviewKeyOf } from "../src/server/practice/completion";
import { familyReport } from "../src/server/map/map-reports";
import { demoDatabase } from "./helpers/db";

const s = (v: unknown) => String(v ?? "");
const NOW = new Date("2026-10-20T08:00:00Z");

describe("⭐ group 2 — parents, assignment completion and rewards read the stars by key", () => {
  let repo: SqliteRepo; let teacher: Actor; let classId: string; let ids: string[]; let teacherRowId: string;
  let copies: string[]; let key: string; let otherSkill: string; let otherKey: string; let reviewSkill: string; let reviewKey: string;
  let names: Map<string, string>;
  const star = (studentId: string, skillId: string, skillKey: string, status: string, extra: Record<string, unknown> = {}) => repo.create("SkillStatus", {
    studentId, skillKey, level: 1, status, skillId, answered: 30, correct: 27, score: status === "MASTERED" ? 92 : 55, startedAt: NOW,
    masteredAt: status === "MASTERED" ? new Date("2026-10-10T08:00:00Z") : null, createdAt: NOW, updatedAt: NOW, history: [], ...extra,
  });
  const oldMastered = (studentId: string, skillId: string) => repo.create("StudentSkillMastery", { studentId, skillId, score: 95, attempts: 12, correct: 12, isMastered: true, band: "MASTERED", masteredAt: new Date("2026-10-11T08:00:00Z"), updatedAt: NOW });

  before(async () => {
    ({ repo } = await demoDatabase());
    await seedTestEnvironment(repo, { root: process.cwd(), passwordHash: "x".repeat(60), practice: "none" });
    teacher = await resolveActor(repo, (await repo.findUnique("User", { username: "test.teacher.1" }))!);
    const r = await teacherRoster(repo, teacher); classId = r[0].id; ids = r[0].students.map((x) => x.id);
    teacherRowId = s((await repo.findMany("Teacher", { userId: teacher.userId }))[0].id);
    const schoolId = s((await repo.findUnique("Student", { id: ids[0] }))!.schoolId);
    clearSkillKeys(repo);
    const ix = await skillKeyIndex(repo, schoolId);
    const fams = [...ix.skillsOf].filter(([k, list]) => k.startsWith("fam:") && list.length >= 2);
    [key, copies] = [fams[0][0], fams[0][1].slice(0, 2)];
    const singles = [...ix.skillsOf].filter(([k]) => k.startsWith("fam:") && k !== key);
    [otherKey, otherSkill] = [singles[0][0], singles[0][1][0]];
    [reviewKey, reviewSkill] = [singles[1][0], singles[1][1][0]];
    names = ix.nameOf;
    // student 0: ⭐ on the key (written on the Grade 5 copy), 🔄 on another, ◐ on a third; the old engine flag says
    // "mastered" on the ◐ skill (it must not count)
    await star(ids[0], copies[1], key, "MASTERED");
    await star(ids[0], reviewSkill, reviewKey, "NEEDS_REVIEW", { score: 70 });
    await star(ids[0], otherSkill, otherKey, "IN_PROGRESS", { answered: 12, score: 60 });
    await oldMastered(ids[0], otherSkill);
    // student 1: only the old engine flag (10 answers at 100 %), no star at all
    await oldMastered(ids[1], copies[0]);
  });

  test("mastered-count: ⭐ only, copies count once, the old flag alone is not mastered", async () => {
    const m = await masteredSkills(repo, [ids[0], ids[1]], [...copies, otherSkill]);
    assert.deepEqual([...m.get(ids[0])!].sort(), [...copies].sort(), "both copies of the ⭐ key, not the ◐ skill with isMastered");
    assert.equal(m.get(ids[1])!.size, 0, "isMastered without ⭐ is not mastered");
    const n = await masteredKeyCount(repo, [ids[0], ids[1]], [...copies, otherSkill]);
    assert.equal(n.get(ids[0]), 1, "two copies of one skill are ONE skill");
    assert.equal(n.get(ids[1]), 0);
  });

  test("parent report: completed / strengths = ⭐ keys; practise next = 🔄 then ◐, never ⭐", async () => {
    const r0 = await parentReport(repo, teacher, ids[0], NOW);
    assert.deepEqual(r0.completed, [names.get(key)]);
    assert.deepEqual(r0.strengths, [names.get(key)]);
    assert.deepEqual(r0.practiseNext, [names.get(reviewKey), names.get(otherKey)], "🔄 first, then ◐");
    const r1 = await parentReport(repo, teacher, ids[1], NOW);
    assert.equal(r1.completed.length, 0, "the old engine flag alone is not a completed skill");
  });

  test("MAP family report: 'Skills mastered' = ⭐ keys (copies once, old flag alone never)", async () => {
    assert.equal((await familyReport(repo, teacher, ids[0], NOW)).practice.mastered, 1);
    assert.equal((await familyReport(repo, teacher, ids[1], NOW)).practice.mastered, 0);
  });

  test("monthly report: mastered this month = ⭐ keys with masteredAt in the month; next never ⭐", async () => {
    const f = (await monthFacts(repo, [ids[0], ids[1]], monthSpan(2026, 9))).get(ids[0])!;
    assert.deepEqual(f.mastered, [names.get(key)]);
    assert.ok(!f.next.includes(names.get(key)!), "a ⭐ skill is not a next step");
    assert.equal(f.next[0], names.get(reviewKey));
    assert.equal((await monthFacts(repo, [ids[1]], monthSpan(2026, 9))).get(ids[1])!.mastered.length, 0);
    assert.equal((await monthFacts(repo, [ids[0]], monthSpan(2026, 8))).get(ids[0])!.mastered.length, 0, "a star of another month is not counted");
  });

  test("family week: practise at home never names a ⭐ skill", async () => {
    const w = await familyWeek(repo, teacher, ids[0], NOW);
    assert.ok(!w.practise.some((p) => p.skillId && copies.includes(p.skillId)), JSON.stringify(w.practise));
    assert.equal(w.practise[0].skillId, reviewSkill, "🔄 first");
  });

  test("badges: Skill Master counts ⭐ keys; the old 10 answers / 80 % rule earns nothing", async () => {
    const b0 = await studentBadges(repo, ids[0], NOW);
    const master0 = b0.find((b) => b.code === "skill-master")!;
    assert.equal(master0.earned, true);
    assert.equal(b0.find((b) => b.code === "skill-star")!.value, 1, "two copies of one ⭐ skill count once");
    const b1 = await studentBadges(repo, ids[1], NOW);
    assert.equal(b1.find((b) => b.code === "skill-master")!.earned, false);
  });

  test("rewards sync: no 'Skill mastered' coin from the old rule", async () => {
    await syncRewards(repo, ids[1], NOW, { force: true });
    assert.equal((await repo.findMany("CoinLedger", { studentId: ids[1], reason: "mastered" })).length, 0);
  });

  test("assignment: a review when ⭐ came first, COMPLETED at 50 answers; never by 10 answers + 75 %", async () => {
    assert.equal(assignmentStatus({ answered: 12, star: { mastered: false, score: 90 }, dueAt: null, now: NOW }).status, "IN_PROGRESS");
    const mk = async (skillId: string, title: string) => {
      const a = await repo.create("Assignment", { classId, createdById: teacherRowId, title, target: "SKILL", skillId, createdAt: NOW, targetMastery: 75 });
      for (const sid of [ids[0], ids[1]]) await repo.create("AssignmentStudent", { assignmentId: a.id, studentId: sid, status: "IN_PROGRESS", progress: 0, coreAnswered: 12, coreCorrect: 12 });
      return a;
    };
    const a = await mk(copies[0], "Grade 4 copy");
    await refreshSkillAssignments(repo, [a], [ids[0], ids[1]], NOW);
    const rows = await repo.findMany("AssignmentStudent", { assignmentId: a.id });
    // owner 1 Nov 2026: ⭐ (on the Grade 5 copy) from BEFORE the work → a 20-question REVIEW, settled by the answers
    // (completion.ts) — a refresh never finishes it at 12 answers
    assert.equal(rows.find((r) => r.studentId === ids[0])!.status, "IN_PROGRESS", "⭐ before the work: a review, open until its 20th answer");
    assert.equal(rows.find((r) => r.studentId === ids[1])!.status, "IN_PROGRESS", "12 answers at 100 % with isMastered is not complete");
    // the multi-skill progress and the 30–50 rule: the 30th counted answer with the engine's mastery but no ⭐ yet
    // (the star row has only a few answers) is not Done; the 50th is
    const b = await mk(otherSkill, "Other skill");
    await repo.updateMany("AssignmentStudent", { assignmentId: b.id, studentId: ids[1] }, { coreAnswered: 29 });
    const r30 = await countCoreAnswer(repo, s(b.id), ids[1], { answered: 29, correct: 29, stored: 29, done: false }, true, NOW, true, null);
    assert.equal(r30!.justDone, false, "30 answers + the old engine flag is not ⭐: still open");
    await repo.updateMany("AssignmentStudent", { assignmentId: b.id, studentId: ids[1] }, { coreAnswered: 49 });
    const r50 = await countCoreAnswer(repo, s(b.id), ids[1], { answered: 49, correct: 49, stored: 49, done: false }, true, NOW, true, null);
    assert.deepEqual([r50!.justDone, r50!.doneBy], [true, "MAX"]);
    // student 0 already has ⭐ on the key: the 30th counted answer finishes the work as "MASTERED"
    const c = await mk(copies[0], "Grade 4 copy again");
    await repo.updateMany("AssignmentStudent", { assignmentId: c.id, studentId: ids[0] }, { coreAnswered: 29 });
    const s30 = await countCoreAnswer(repo, s(c.id), ids[0], { answered: 29, correct: 29, stored: 29, done: false }, true, NOW, false, null);
    assert.deepEqual([s30!.justDone, s30!.doneBy], [true, "MASTERED"]);
    // a COMPLETED row never moves back
    await repo.updateMany("AssignmentStudent", { assignmentId: a.id, studentId: ids[0] }, { status: "COMPLETED", completedAt: NOW, progress: 1 });
    await refreshSkillAssignments(repo, [a], [ids[0]], NOW);
    assert.equal((await repo.findMany("AssignmentStudent", { assignmentId: a.id, studentId: ids[0] }))[0].status, "COMPLETED");
  });
  test("🔄 review work (⭐ before the work): 20 counted answers, 16 right → Done and ⭐ kept; fewer → 🔄 + alert, keeps going", async () => {
    // student 0 has ⭐ on `key` since 10 Oct (before NOW): two works on that skill
    const mkReview = async (title: string) => {
      const a = await repo.create("Assignment", { classId, createdById: teacherRowId, title, target: "SKILL", skillId: copies[0], createdAt: NOW, targetMastery: 75 });
      await repo.create("AssignmentStudent", { assignmentId: a.id, studentId: ids[0], status: "IN_PROGRESS", progress: 0, coreAnswered: 19, coreCorrect: 16 });
      return a;
    };
    const pass = await mkReview("Review pass");
    assert.equal(await reviewKeyOf(repo, s(pass.id), ids[0]), key, "⭐ before the work: a review");
    const r1 = await countCoreAnswer(repo, s(pass.id), ids[0], { answered: 19, correct: 16, stored: 19, done: false }, true, NOW, false, null, undefined, key);
    assert.deepEqual([r1!.answered, r1!.correct, r1!.justDone, r1!.doneBy], [20, 17, true, "MASTERED"], "17 of 20: passed, Done");
    let rows = await repo.findMany("SkillStatus", { studentId: ids[0], skillKey: key });
    assert.equal(rows[0].status, "MASTERED", "the ⭐ stays");
    const fail = await mkReview("Review fail");
    await repo.updateMany("AssignmentStudent", { assignmentId: fail.id, studentId: ids[0] }, { coreCorrect: 10 });
    const r2 = await countCoreAnswer(repo, s(fail.id), ids[0], { answered: 19, correct: 10, stored: 19, done: false }, false, NOW, false, null, undefined, key);
    assert.deepEqual([r2!.answered, r2!.justDone], [20, false], "10 of 20: not passed, the work goes on");
    rows = await repo.findMany("SkillStatus", { studentId: ids[0], skillKey: key });
    assert.equal(rows[0].status, "NEEDS_REVIEW", "🔄 Needs review");
    assert.equal((await repo.findMany("InterventionAlert", { studentId: ids[0], ruleCode: "REVIEW_FAILED" })).length, 1, "the teacher is told");
    // a student WITHOUT ⭐ before the work: the 20th answer is just an answer (no review)
    const plain = await repo.create("Assignment", { classId, createdById: teacherRowId, title: "Plain", target: "SKILL", skillId: otherSkill, createdAt: NOW, targetMastery: 75 });
    await repo.create("AssignmentStudent", { assignmentId: plain.id, studentId: ids[2], status: "IN_PROGRESS", progress: 0, coreAnswered: 19, coreCorrect: 19 });
    assert.equal(await reviewKeyOf(repo, s(plain.id), ids[2]), false, "no ⭐ before the work: not a review");
    const r3 = await countCoreAnswer(repo, s(plain.id), ids[2], { answered: 19, correct: 19, stored: 19, done: false }, true, NOW, false, null);
    assert.equal(r3!.justDone, false, "no ⭐ before: the normal 30–50 rule");
  });
});
