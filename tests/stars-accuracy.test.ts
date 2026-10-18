/**
 * ⭐ Stars that follow the student's REAL level (owner r68 §A "very accurate") — in-memory demo school only:
 *   - practice from ANY source counts (assigned skill, Curriculum Map set, MAP / NAFS / Grammar plans, free practice,
 *     NAFS practice in the NAFS center's own tables); tests, Learn checks, lessons and review checks never do;
 *   - rapid guesses never count; answers of an Unreliable session (> 20 % guesses) never count — live and in the
 *     migration, the same result;
 *   - NAFS practice answers bring the star up to date when My Skills is opened (no heavy job);
 *   - level-ups and reviews keep working (the existing rules).
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { demoDatabase } from "./helpers/db";
import { publishGrade4Bank } from "./helpers/practice";
import { resolveActor } from "../src/server/auth/actor";
import type { Actor } from "../src/server/auth/rbac";
import { countedAnswers, nafsPracticeAnswers, refreshSkillStatus, skillKeyIndex, statusesOfSkills, STAR_MIN_ANSWERS } from "../src/server/skills/status";
import { recomputeStudents } from "../src/server/skills/status-extras";
import { syncNafsPracticeStars } from "../src/server/skills/my-skills";

const s = (v: unknown) => String(v ?? "");

describe("⭐ star accuracy", () => {
  let repo: SqliteRepo; let teacher: Actor; let schoolId = ""; let classId = ""; let tid = ""; let ids: string[] = [];
  let g4 = new Map<string, string>();
  let clock = Date.parse("2026-09-01T08:00:00Z");
  const at = () => new Date((clock += 60_000));
  const now = new Date("2026-10-13T09:00:00Z");

  async function answers(sid: string, skillId: string, n: number, o: { mode?: string; assignmentId?: string | null; rapid?: boolean; unreliable?: boolean; source?: string | null } = {}) {
    const qs = await repo.findMany("Question", { skillId, status: "PUBLISHED" }, { select: ["id"], take: 50 });
    const ses = await repo.create("PracticeSession", { studentId: sid, skillId, mode: o.mode ?? "ADAPTIVE_PRACTICE", assignmentId: o.assignmentId ?? null, startedAt: at(), questionCount: n, correctCount: n, activeMs: 0, unreliable: Boolean(o.unreliable) });
    for (let i = 0; i < n; i++) await repo.create("QuestionAttempt", { sessionId: ses.id, studentId: sid, questionId: qs[i % qs.length].id, skillId, response: { value: "x" }, isCorrect: true, responseMs: o.rapid ? 800 : 9000, rapidGuess: Boolean(o.rapid), difficultyB: 0, createdAt: at(), source: o.source ?? null, unreliable: Boolean(o.unreliable) });
  }
  const mastered = (sid: string, skillId: string) => repo.upsert("StudentSkillMastery", { studentId: sid, skillId }, { studentId: sid, skillId, score: 95, band: "MASTERED", isMastered: true, attempts: 40, correct: 36 }, { isMastered: true, score: 95 });
  const star = async (sid: string, skillId: string) => (await statusesOfSkills(repo, schoolId, [sid], [skillId])).get(sid)!.get(skillId)!;

  before(async () => {
    ({ repo } = await demoDatabase({ classesPerGrade: 1, studentsPerClass: 6 }));
    await publishGrade4Bank(repo);
    teacher = await resolveActor(repo, (await repo.findUnique("User", { username: "demo.teacher.4a" }))!);
    schoolId = teacher.schoolId!;
    tid = s((await repo.findUnique("Teacher", { userId: teacher.userId }))!.id);
    classId = s((await repo.findMany("ClassTeacher", { teacherId: tid }))[0].classId);
    ids = (await repo.findMany("ClassMembership", { classId })).map((m) => s(m.studentId));
    const g = (await repo.findMany("Grade", { schoolId, level: 4 }))[0];
    const cur = (await repo.findMany("Curriculum", { gradeId: g.id }))[0];
    g4 = new Map((await repo.findMany("Skill", { curriculumId: cur.id })).map((k) => [s(k.code).replace(/^G4\./, ""), s(k.id)]));
  });

  test("an Unreliable session (> 20 % rapid guesses) never counts toward the star — live and in the migration", async () => {
    const sid = ids[0], k = g4.get("inference")!;
    await answers(sid, k, 40, { unreliable: true });
    await mastered(sid, k);
    assert.equal((await countedAnswers(repo, sid, [k])).answered, 0, "unreliable answers are not counted");
    const r = await refreshSkillStatus(repo, sid, k, now);
    assert.equal(r?.status, "NOT_STARTED", "no star from an unreliable session");
    await answers(sid, k, STAR_MIN_ANSWERS);
    assert.equal((await refreshSkillStatus(repo, sid, k, now))?.status, "MASTERED", "30 careful answers + mastery: the star");
    // the migration gives the same answer count (unreliable left out)
    const row = (await repo.findMany("SkillStatus", { studentId: sid, skillKey: (await skillKeyIndex(repo, schoolId)).keyOf.get(k)! }))[0];
    assert.equal(Number(row.answered), STAR_MIN_ANSWERS);
    await repo.deleteMany("SkillStatus", { studentId: sid });
    await recomputeStudents(repo, schoolId, [sid], now);
    const again = (await repo.findMany("SkillStatus", { studentId: sid }))[0];
    assert.equal(again.status, "MASTERED"); assert.equal(Number(again.answered), STAR_MIN_ANSWERS, "the migration leaves the unreliable answers out too");
  });

  test("rapid guesses, tests, lessons and review sources never count; assigned work and Curriculum sets do", async () => {
    const sid = ids[1], k = g4.get("theme")!;
    await answers(sid, k, 20, { rapid: true });
    const test = await repo.create("Assignment", { classId, createdById: tid, title: "Chapter test", target: "ASSESSMENT", curriculumPlanId: "TEST", testId: "t1", createdAt: now });
    await answers(sid, k, 20, { mode: "TEACHER_QUIZ", assignmentId: s(test.id) });
    await answers(sid, k, 10, { source: "LESSON" });
    await answers(sid, k, 10, { source: "REVIEW" });
    assert.equal((await countedAnswers(repo, sid, [k])).answered, 0, "none of these count");
    const plan = await repo.create("SkillPlan", { schoolId, classId, title: "Grade 4 Curriculum", kind: "CURRICULUM", gradeLevel: 4, createdAt: now });
    const set = await repo.create("Assignment", { classId, createdById: tid, title: "Unit 1 · Set 1", target: "ASSESSMENT", curriculumPlanId: plan.id, program: "CURRICULUM", createdAt: now });
    await answers(sid, k, 18, { mode: "TEACHER_QUIZ", assignmentId: s(set.id) });
    await answers(sid, k, 12);
    assert.equal((await countedAnswers(repo, sid, [k])).answered, 30, "a Curriculum set + practice: 30");
    await mastered(sid, k);
    assert.equal((await refreshSkillStatus(repo, sid, k, now))?.status, "MASTERED");
  });

  test("🇸🇦 NAFS practice counts (its own tables, read only); its rapid answers do not; My Skills brings the star up to date", async () => {
    const sid = ids[2], k = g4.get("central-idea")!;
    const qs = await repo.findMany("Question", { skillId: k, status: "PUBLISHED" }, { select: ["id"], take: 40 });
    assert.ok(qs.length > 0);
    const base = Date.parse("2026-10-10T08:00:00Z");
    for (let i = 0; i < 34; i++) await repo.create("NafsPracticeAnswer", { runId: "run-1", practiceId: "np-1", studentId: sid, questionId: qs[i % qs.length].id, target: "NAFS.RC", difficulty: 2, choice: 0, correct: true, ms: i < 4 ? 900 : 15000, at: new Date(base + i * 60_000) });
    const n = await nafsPracticeAnswers(repo, sid, [k]);
    assert.equal(n.answered, 30, "4 rapid answers (< 3 s) left out");
    assert.equal((await countedAnswers(repo, sid, [k])).answered, 30, "counted with the other practice");
    await mastered(sid, k);
    assert.equal((await star(sid, k)).status, "NOT_STARTED", "nothing written yet (the NAFS center does not call the hook)");
    const synced = await syncNafsPracticeStars(repo, sid, now);
    assert.ok(synced >= 1, "My Skills brings it up to date");
    assert.equal((await star(sid, k)).status, "MASTERED", "⭐ from NAFS practice");
    assert.equal(await syncNafsPracticeStars(repo, sid, now), 0, "nothing to do the second time");
    // NAFS TESTS never count: NafsResult is never read for a star
    assert.doesNotMatch(String(nafsPracticeAnswers), /NafsResult/);
  });

  test("the same skill everywhere: a Grade 5 copy, a Grammar assignment and free practice share one star", async () => {
    const sid = ids[3], k = g4.get("capitalization")!;
    const ga = await repo.create("Assignment", { classId, createdById: tid, title: "Capitalization", skillId: k, target: "SKILL", track: "GRAMMAR", createdAt: now });
    await answers(sid, k, 15, { assignmentId: s(ga.id) });
    await answers(sid, k, 15); // free practice
    await mastered(sid, k);
    assert.equal((await refreshSkillStatus(repo, sid, k, now))?.status, "MASTERED");
    const g = (await repo.findMany("Grade", { schoolId, level: 5 }))[0];
    const cur = (await repo.findMany("Curriculum", { gradeId: g.id }))[0];
    const k5 = s((await repo.findMany("Skill", { curriculumId: cur.id, code: "G5.capitalization" }))[0]?.id);
    if (k5) assert.equal((await star(sid, k5)).status, "MASTERED", "the Grade 5 copy shows the same star");
  });
});
