/**
 * 📊 Admin → School Analytics as one dashboard (owner r67, item 6): the numbers on the cards are right (rapid guesses
 * left out, standards lowest first from 5 answers, this week's active students), one pass kept while nothing changes,
 * and the page is one flat dashboard. In-memory SQLite only.
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import { ForbiddenError, type Actor } from "../src/server/auth/rbac";
import { schoolDashboard } from "../src/server/analytics/school-dashboard";
import { noteWrite } from "../src/server/cache/bank-version";
import { demoDatabase, ROOT } from "./helpers/db";
import { publishGrade4Bank } from "./helpers/practice";

const s = (v: unknown) => String(v ?? "");
const DAY = 86_400_000;

describe("📊 School Analytics dashboard", () => {
  let repo: SqliteRepo;
  let admin: Actor, teacher: Actor;
  let classId: string, students: string[];
  const now = new Date();
  const period = { name: "SCHOOL_YEAR" as const, label: "This school year", from: new Date(now.getTime() - 120 * DAY), to: new Date(now.getTime() + DAY) };

  before(async () => {
    ({ repo } = await demoDatabase());
    await publishGrade4Bank(repo);
    admin = await resolveActor(repo, (await repo.findUnique("User", { username: "demo.admin" }))!);
    teacher = await resolveActor(repo, (await repo.findUnique("User", { username: "demo.teacher.4a" }))!);
    const t = (await repo.findUnique("Teacher", { userId: teacher.userId }))!;
    classId = s((await repo.findMany("ClassTeacher", { teacherId: t.id }))[0].classId);
    students = (await repo.findMany("ClassMembership", { classId }, { select: ["studentId"] })).map((m) => s(m.studentId));
    const qs = await repo.findMany("Question", { status: "PUBLISHED", standardId: { not: null } }, { select: ["id", "skillId", "standardId"], take: 400 });
    // two standards: 6 answers on A (2 right), 6 on B (5 right); 3 rapid guesses that never count; one old answer 3 weeks ago
    const stdA = s(qs[0].standardId), qA = qs.filter((q) => s(q.standardId) === stdA).slice(0, 1);
    const qB = qs.filter((q) => s(q.standardId) !== stdA).slice(0, 1);
    const add = async (sid: string, q: Record<string, unknown>, ok: boolean, at: Date, rapid = false) => {
      const sess = await repo.create("PracticeSession", { studentId: sid, skillId: q.skillId, mode: "ADAPTIVE_PRACTICE", startedAt: at });
      await repo.create("QuestionAttempt", { studentId: sid, sessionId: sess.id, questionId: q.id, skillId: q.skillId, response: "A", isCorrect: ok, responseMs: rapid ? 800 : 20_000, difficultyB: 0, rapidGuess: rapid, createdAt: at });
    };
    for (let i = 0; i < 6; i++) await add(students[i % students.length], qA[0], i < 2, new Date(now.getTime() - DAY));
    for (let i = 0; i < 6; i++) await add(students[0], qB[0], i < 5, new Date(now.getTime() - 2 * DAY));
    for (let i = 0; i < 3; i++) await add(students[1], qB[0], true, new Date(now.getTime() - DAY), true);
    await add(students[2], qB[0], true, new Date(now.getTime() - 21 * DAY));
    await repo.create("StudentSkillMastery", { studentId: students[0], skillId: qB[0].skillId, score: 80, isMastered: true, attempts: 6, correct: 5 });
  });

  test("the cards: students, active this week, answers, accuracy, mastered — rapid guesses never count", async () => {
    const d = await schoolDashboard(repo, admin, period, now);
    assert.equal(d.kpis.answers, 13, "6 + 6 + 1 (the 3 rapid guesses left out)");
    assert.equal(d.kpis.accuracy, Math.round((100 * 8) / 13));
    const activeNow = new Set([...Array.from({ length: 6 }, (_, i) => students[i % students.length]), students[0]]).size;
    assert.equal(d.kpis.activeWeek, activeNow, "who answered in the last 7 days");
    assert.equal(d.kpis.mastered, 1);
    assert.equal(d.kpis.avgMastery, 80);
    assert.equal(d.kpis.students, await repo.count("Student", { schoolId: admin.schoolId, deletedAt: null }));
    const cls = d.classes.find((c) => c.classId === classId)!;
    assert.equal(cls.answers, 13);
    assert.equal(cls.students, students.length);
    assert.equal(d.weeks.reduce((a, w) => a + w.answers, 0), 13, "the weekly chart adds up");
    assert.equal(d.weeks[d.weeks.length - 1].answers, 12, "this week's bar");
  });

  test("standards lowest first (from 5 answers), with the not-yet-assessed count", async () => {
    const d = await schoolDashboard(repo, admin, period, now);
    assert.deepEqual(d.standards.map((x) => x.accuracy), [33, 86], "A: 2 of 6; B: 6 of 7 (the old answer counts in the year, rapid guesses never)");
    assert.ok(d.standards[0].short && !d.standards[0].short.startsWith("CCSS."));
    assert.ok(d.notAssessed > 0);
  });

  test("fast: kept while nothing changes (the next visit reads nothing), fresh after a new answer", async () => {
    let calls = 0;
    const counting = new Proxy(repo, { get(target, p, r) { const v = Reflect.get(target, p, r); return typeof v === "function" && ["findMany", "count", "findUnique"].includes(String(p)) ? (...a: unknown[]) => { calls++; return (v as (...x: unknown[]) => unknown).apply(target, a); } : v; } });
    await schoolDashboard(counting as SqliteRepo, admin, period, now);
    const first = calls;
    assert.ok(first > 0 && first <= 20, `one pass: ${first} database reads`);
    calls = 0;
    await schoolDashboard(counting as SqliteRepo, admin, period, now);
    assert.equal(calls, 0, "kept");
    noteWrite("QuestionAttempt");
    calls = 0;
    await schoolDashboard(counting as SqliteRepo, admin, period, now);
    assert.ok(calls > 0, "read again after a write");
  });

  test("admins only; the page is one flat dashboard", async () => {
    await assert.rejects(schoolDashboard(repo, teacher, period, now), ForbiddenError);
    const page = readFileSync(join(ROOT, "src/app/admin/analytics/page.tsx"), "utf8");
    for (const want of ['data-testid="kpis"', "Questions answered per week", "Accuracy by grade", 'data-testid="class-cards"', "Standards, lowest first", "reportHref(", "Open class"]) assert.ok(page.includes(want), want);
    assert.doesNotMatch(page, /<ReportDownloads|role="tab"|<details|<Section /, "no tabs or nested sections; downloads are small buttons");
    assert.equal((page.match(/^export /gm) ?? []).length, 2, "the page file exports only Next page fields (metadata, default)");
  });
});
