/**
 * ⭐ Stars everywhere — group 4 (teacher suggestions, decisions, alerts + admin; owner, 1 Nov 2026): every
 * suggestion, routing, flag and alert reads the ONE skill status (SkillStatus stars, by skill KEY):
 *   - a skill the student has ⭐ on (any copy) is never suggested, routed, flagged or alerted on;
 *   - 🔄 Needs review counts as needing work and comes first;
 *   - admin counts "skills mastered" by KEY from ⭐ (two copies count once; the old isMastered alone never counts).
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import type { Actor } from "../src/server/auth/rbac";
import { seedTestEnvironment } from "../src/server/seeding/test-env";
import { teacherRoster } from "../src/server/teacher/assign";
import { clearSkillKeys, skillKeyIndex } from "../src/server/skills/status";
import { strugglingSkills } from "../src/server/tiers/struggling";
import { interventionBoard } from "../src/server/teacher/intervention";
import { findAlerts } from "../src/server/insights/alerts";
import { weakestSkillsFor } from "../src/server/plans/perf-suggest";
import { schoolAi } from "../src/server/predict/school-ai";
import { backupSheets } from "../src/server/teacher/extras";
import { rootCausesFrom } from "../src/server/insights/error-patterns";
import { buildGraph, type SkillState } from "../src/server/graph/knowledge-graph";
import { demoDatabase } from "./helpers/db";

const s = (v: unknown) => String(v ?? "");
const DAY = 86_400_000;

describe("⭐ group 4 — suggestions, alerts and admin counts read the stars by key", () => {
  let repo: SqliteRepo; let teacher: Actor; let admin: Actor; let classId: string; let ids: string[]; let schoolId: string;
  let copies: string[]; let key: string; let reviewSkill: string; let reviewKey: string; let learnSkill: string; let learnKey: string;
  let masteredBefore = 0;
  const now = new Date();
  const star = (studentId: string, skillId: string, skillKey: string, status: string, extra: Record<string, unknown> = {}) => repo.create("SkillStatus", {
    studentId, skillKey, level: 1, status, skillId, answered: 30, correct: 27, score: status === "MASTERED" ? 92 : 45, startedAt: now,
    masteredAt: status === "MASTERED" ? new Date(now.getTime() - 40 * DAY) : null, createdAt: now, updatedAt: now, history: [], ...extra,
  });
  // the engine says "weak" (low score, many answers) — or "mastered" — on a skill
  const engine = (studentId: string, skillId: string, score: number, isMastered = false) => repo.create("StudentSkillMastery", {
    studentId, skillId, score, attempts: 20, correct: Math.round(score / 5), isMastered, band: isMastered ? "MASTERED" : "BEGINNING",
    masteredAt: isMastered ? new Date(now.getTime() - 40 * DAY) : null, lastPracticedAt: new Date(now.getTime() - 40 * DAY), components: { effectiveN: 10 }, updatedAt: now,
  });
  const answers = async (studentId: string, skillId: string, n: number, correct: number) => {
    const q = (await repo.findMany("Question", { skillId, status: "PUBLISHED" }, { select: ["id"] }))[0];
    const ses = await repo.create("PracticeSession", { studentId, skillId, mode: "ADAPTIVE_PRACTICE", startedAt: new Date(now.getTime() - DAY) });
    for (let i = 0; i < n; i++) await repo.create("QuestionAttempt", { sessionId: ses.id, studentId, questionId: q.id, skillId, response: {}, isCorrect: i < correct, responseMs: 30_000, difficultyB: 0, rapidGuess: false, createdAt: new Date(now.getTime() - DAY + i * 1000) });
  };

  before(async () => {
    ({ repo } = await demoDatabase());
    await seedTestEnvironment(repo, { root: process.cwd(), passwordHash: "x".repeat(60), practice: "none" });
    teacher = await resolveActor(repo, (await repo.findUnique("User", { username: "test.teacher.1" }))!);
    admin = await resolveActor(repo, (await repo.findUnique("User", { username: "test.admin" }))!);
    const r = await teacherRoster(repo, teacher); classId = r[0].id; ids = r[0].students.map((x) => x.id);
    schoolId = s((await repo.findUnique("Student", { id: ids[0] }))!.schoolId);
    clearSkillKeys(repo);
    const ix = await skillKeyIndex(repo, schoolId);
    const qs = new Set((await repo.findMany("Question", { status: "PUBLISHED" }, { select: ["skillId"] })).map((q) => s(q.skillId)));
    const fams = [...ix.skillsOf].filter(([k, list]) => k.startsWith("fam:") && list.filter((id) => qs.has(id)).length >= 2);
    [key, copies] = [fams[0][0], fams[0][1].filter((id) => qs.has(id)).slice(0, 2)];
    const singles = [...ix.skillsOf].filter(([k, list]) => k.startsWith("fam:") && k !== key && list.some((id) => qs.has(id)));
    [reviewKey, reviewSkill] = [singles[0][0], singles[0][1].find((id) => qs.has(id))!];
    [learnKey, learnSkill] = [singles[1][0], singles[1][1].find((id) => qs.has(id))!];
    masteredBefore = (await schoolAi(repo, schoolId)).outcomes.mastered;
    // student 0: ⭐ on the key (written on copy 1) but the engine still calls copy 0 weak (15) with fresh wrong answers;
    //            🔄 on a second skill; ◐ weak on a third
    await star(ids[0], copies[1], key, "MASTERED", { reviewDueAt: new Date(now.getTime() + 5 * DAY) });
    await engine(ids[0], copies[0], 15);
    await engine(ids[0], copies[1], 95, true);
    await answers(ids[0], copies[0], 8, 1);
    await star(ids[0], reviewSkill, reviewKey, "NEEDS_REVIEW", { score: 70 });
    await star(ids[0], learnSkill, learnKey, "IN_PROGRESS", { answered: 12, score: 40 });
    await engine(ids[0], learnSkill, 35);
    // student 1: only the OLD engine flag (isMastered, mastered 40 days ago) — no star at all
    await engine(ids[1], copies[0], 95, true);
  });

  test("Support plan: struggling = 🔄 or ◐, 🔄 first, never ⭐ (any copy)", async () => {
    const m = await strugglingSkills(repo, [ids[0], ids[1]]);
    const list = m.get(ids[0]) ?? [];
    assert.equal(list[0]?.id, reviewSkill, "🔄 first");
    assert.ok(list.some((x) => x.id === learnSkill), "◐ with a low engine score");
    assert.ok(!list.some((x) => copies.includes(x.id)), "the ⭐ key is never struggling, even with a low engine row on its other copy");
    assert.ok(!m.has(ids[1]), "no star row: nothing judged on the engine alone");
  });

  test("Intervention board: REVIEW = 🔄 (or ⭐ review date passed), never the old isMastered + masteredAt", async () => {
    const b = await interventionBoard(repo, teacher, now);
    const row0 = b.rows.find((x) => x.studentId === ids[0]);
    assert.ok(row0?.flags.some((f) => f.flag === "REVIEW" && /Needs review/.test(f.detail)));
    assert.deepEqual(row0!.reviewSkills.map((k) => k.id), [reviewSkill], "the ⭐ with a future review date is not due");
    const row1 = b.rows.find((x) => x.studentId === ids[1]);
    assert.ok(!row1?.flags.some((f) => f.flag === "REVIEW"), "the old engine flag alone is not a review");
  });

  test("Alerts: WEAK_SKILL never for a ⭐ key; 🔄 is weak with the star word", async () => {
    const found = (await findAlerts(repo, schoolId, now)).filter((f) => f.studentId === ids[0] && f.kind === "WEAK_SKILL");
    assert.ok(!found.some((f) => copies.some((c) => f.key.includes(c))), "no alert on any copy of the ⭐ skill");
    const review = found.find((f) => f.key.includes(reviewSkill));
    assert.ok(review && /Needs review \(70%\)/.test(review.detail), review?.detail);
  });

  test("Suggested plans: the weakest skills never include a ⭐ skill", async () => {
    const r = await weakestSkillsFor(repo, teacher, classId, [ids[0]], 6, now);
    assert.ok(!r.sections.some((x) => copies.includes(x.skillId)), "8 answers at 12 % on a ⭐ skill: not suggested");
  });

  test("Admin: skills mastered = ⭐ keys (copies once, the old flag alone never)", async () => {
    const after = (await schoolAi(repo, schoolId)).outcomes.mastered;
    assert.equal(after - masteredBefore, 1, "one ⭐ key; two engine isMastered rows and student 1's old flag do not count");
    const sheets = await backupSheets(repo, admin);
    const rows = sheets.find((x) => x.name === "Skills")!.rows;
    assert.deepEqual(rows[0], ["Student", "Student ID", "Skill", "Status", "Star score", "Answered", "Mastered on"]);
    const mine = rows.filter((r) => r[2] === (rows.find((x) => x[3] === "Mastered")?.[2]) && r[3] === "Mastered");
    assert.equal(mine.length, 1, "one row per student × key");
    assert.equal(mine[0][4], "92");
  });

  test("Root causes: a prerequisite with ⭐ is never the gap", () => {
    const st = (mastery: number, attempts: number, o: Partial<SkillState> = {}): SkillState => ({ mastery, attempts, theta: null, recentErrors: 0, recentAnswers: 0, misconception: null, isMastered: false, ...o });
    const g = buildGraph(
      [{ id: "kd", code: "G4.key-details", name: "Key Details", sequence: 1, category: "INFORMATIONAL" }, { id: "mi", code: "G4.central-idea", name: "Main Idea", sequence: 2, category: "INFORMATIONAL" }],
      [{ skillId: "mi", prerequisiteSkillId: "kd", minimumMastery: 60, weight: 0.5 }],
    );
    const weakKd = new Map([["mi", st(40, 12, { star: "IN_PROGRESS" })], ["kd", st(52, 10, { star: "IN_PROGRESS" })]]);
    assert.equal(rootCausesFrom(g, weakKd).length, 1, "◐ prerequisite with a low engine score: the gap");
    const starredKd = new Map([["mi", st(40, 12, { star: "IN_PROGRESS" })], ["kd", st(52, 10, { star: "MASTERED", isMastered: true })]]);
    assert.deepEqual(rootCausesFrom(g, starredKd), [], "⭐ prerequisite: never the gap");
  });
});
