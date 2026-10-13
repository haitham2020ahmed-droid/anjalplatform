/**
 * ⚡ Speed pass (same answers, fewer / smaller reads) — demo school in memory, never a real database:
 *   answer totals by GROUP BY · lessons of many skills in two reads · a teacher's classes read once per page
 *   (fresh at once after a class change) · the four Curriculum Map level views share one read of the students' data.
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { demoDatabase, ROOT } from "./helpers/db";
import { seedQuestions } from "../src/server/seeding/questions";
import { loadBank } from "../src/server/seeding/load-files";
import { DEMO_SCHOOL_CODE } from "../src/server/seeding/demo";
import type { FindOptions, Repo, Row, Where } from "../src/server/seeding/repo";
import { resolveActor } from "../src/server/auth/actor";
import type { Actor } from "../src/server/auth/rbac";
import { answerTotals } from "../src/server/insights/student-data";
import { hasLesson, hasLessons } from "../src/server/lessons/run";
import { accessibleClasses } from "../src/server/teacher/assign";
import { evidenceLevels } from "../src/server/curriculum-map/evidence-level";

const s = (v: unknown) => String(v ?? "");

/** Counts the calls per model (reads only matter here). */
function counting(inner: Repo) {
  const by = new Map<string, number>();
  const n = (m: string) => by.set(m, (by.get(m) ?? 0) + 1);
  const repo: Repo = {
    upsert: (m, w, c, u) => inner.upsert(m, w, c, u), create: (m, d) => inner.create(m, d), createMany: (m, r) => inner.createMany(m, r),
    findUnique: (m, w) => { n(m); return inner.findUnique(m, w); },
    findMany: (m: string, w?: Where, o?: FindOptions) => { n(m); return inner.findMany(m, w, o); },
    count: (m, w) => { n(m); return inner.count(m, w); },
    groupCount: (m: string, b: string, w?: Where) => { n(m); return inner.groupCount!(m, b, w); },
    updateMany: (m, w, d) => inner.updateMany(m, w, d), deleteMany: (m, w) => inner.deleteMany(m, w),
    transaction: (fn) => inner.transaction(fn),
  };
  return { repo, by, reset: () => by.clear() };
}

describe("speed pass: same answers, fewer reads", () => {
  let repo: SqliteRepo; let teacher: Actor; let ids: string[] = [];
  before(async () => {
    ({ repo } = await demoDatabase({ classesPerGrade: 1, studentsPerClass: 4 }));
    teacher = await resolveActor(repo, (await repo.findUnique("User", { username: "demo.teacher.4a" }))!);
    const classId = s((await repo.findMany("ClassTeacher", { teacherId: (await repo.findUnique("Teacher", { userId: teacher.userId }))!.id }))[0].classId);
    ids = (await repo.findMany("ClassMembership", { classId })).map((m) => s(m.studentId));
    // a few answers (right and wrong) for the first students
    await seedQuestions(repo, { schoolCode: DEMO_SCHOOL_CODE, bank: loadBank(ROOT) });
    const q = (await repo.findMany("Question", {}, { select: ["id", "skillId"], take: 1 }))[0];
    const ses = await repo.create("PracticeSession", { studentId: ids[0], skillId: q.skillId, mode: "ADAPTIVE_PRACTICE", startedAt: new Date() } as Row);
    for (const [i, ok] of [[0, true], [0, false], [0, true], [1, false]] as const) {
      await repo.create("QuestionAttempt", { studentId: ids[i], questionId: q.id, skillId: q.skillId, sessionId: ses.id, isCorrect: ok, response: {}, responseMs: 4000, difficultyB: 0, createdAt: new Date() } as Row);
    }
  });

  test("answer totals: two GROUP BY counts give what counting every answer gave", async () => {
    const rows = await repo.findMany("QuestionAttempt", { studentId: { in: ids } }, { select: ["studentId", "isCorrect"] });
    assert.ok(rows.length >= 4, "the answers were saved");
    const want = new Map(ids.map((id) => [id, { answers: 0, correct: 0 }]));
    for (const r of rows) { const o = want.get(s(r.studentId))!; o.answers++; if (r.isCorrect) o.correct++; }
    const c = counting(repo);
    assert.deepEqual(await answerTotals(c.repo, ids), want);
    assert.equal(c.by.get("QuestionAttempt"), 2, "two grouped counts, no answer rows");
  });

  test("lessons of many skills: two reads, the same answer as one skill at a time", async () => {
    const skills = (await repo.findMany("Skill", {}, { select: ["id"] })).map((k) => s(k.id)).slice(0, 60);
    const c = counting(repo);
    const many = await hasLessons(c.repo, [...skills, "no-such-skill"]);
    assert.ok((c.by.get("Skill") ?? 0) + (c.by.get("SkillFamily") ?? 0) <= 2);
    for (const id of skills) assert.equal(many.get(id), await hasLesson(repo, id), id);
    assert.equal(many.get("no-such-skill"), false);
    assert.ok([...many.values()].some(Boolean), "some skills have a lesson");
  });

  test("a teacher's classes: read once per page, copies for callers, fresh at once after a class change", async () => {
    const c = counting(repo);
    const a = await accessibleClasses(c.repo, teacher);
    const b = await accessibleClasses(c.repo, teacher);
    assert.deepEqual(a, b);
    assert.equal(c.by.get("ClassTeacher"), 1, "the second ask is served from the short cache");
    a[0].name = "changed by a caller";
    assert.notEqual((await accessibleClasses(c.repo, teacher))[0].name, "changed by a caller");
    // another class for this teacher: seen at once (write counters), not after the cache time
    const t = (await repo.findUnique("Teacher", { userId: teacher.userId }))!;
    const other = (await repo.findMany("Class", {}, { select: ["id"] })).find((k) => !a.some((x) => x.id === k.id))!;
    await repo.create("ClassTeacher", { classId: other.id, teacherId: t.id });
    assert.equal((await accessibleClasses(c.repo, teacher)).length, a.length + 1);
  });

  test("the four level views of the Curriculum Map share one read of the students' data", async () => {
    const plain = await Promise.all([null, "CV", "ACS", "RTR"].map((cat) => evidenceLevels(repo, teacher.schoolId, ids, 4, { category: cat as "CV" | null }, new Date("2026-10-13T12:00:00Z"))));
    const c = counting(repo);
    const memo = new Map<string, Promise<unknown>>();
    const shared = await Promise.all([null, "CV", "ACS", "RTR"].map((cat) => evidenceLevels(c.repo, teacher.schoolId, ids, 4, { category: cat as "CV" | null, memo }, new Date("2026-10-13T12:00:00Z"))));
    assert.deepEqual(shared, plain, "the same levels and reasons");
    assert.equal(c.by.get("StudentReadingLexile"), 1);
    assert.equal(c.by.get("DiagnosticScore"), 1);
  });
});
