/**
 * 📏 Round 2 · group "numbers": every report on ONE definition (owner, 1 Nov 2026).
 *  - Questions / Accuracy / Minutes = practiceTotals rules: rapid guesses out of accuracy, ≤ 5 min per answer, the
 *    hidden Curriculum Map holder skill left out, date-bounded (class overview, practiceStats, learning path)
 *  - an open InterventionAlert about a skill the student has ⭐ on is not shown (class overview, student detail)
 *  - the hardest-questions list ignores rapid guesses
 *  - strong / needs work in the student file = the star book by key (⭐ never "needs work", holder skill out)
 *  - "Excelling" = ⭐ (isExcelling), the class middle = the average STAR score
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { demoDatabase } from "./helpers/db";
import { resolveActor } from "../src/server/auth/actor";
import type { Actor } from "../src/server/auth/rbac";
import { clearSkillKeys, type StarView } from "../src/server/skills/status";
import { starBook } from "../src/server/skills/star-read";
import { classOverview, hiddenStarKeys, studentDetail } from "../src/server/teacher/queries";
import { practiceStats } from "../src/server/insights/student-data";
import { studentLearningPath } from "../src/server/student/learning-path";
import { studentFile } from "../src/server/insights/student-file";
import { isExcelling } from "../src/server/plans/perf-suggest";
import { monthCompare, peerRows, starScoreRows } from "../src/server/insights/class-compare";

const s = (v: unknown) => String(v ?? "");
const ROOT = process.cwd();
const read = (f: string) => readFileSync(join(ROOT, f), "utf8");
const DAY = 86_400_000;
// a quiet month far from the demo's own answers
const NOW = new Date("2030-01-20T09:00:00Z");
const range = { from: new Date("2030-01-01T00:00:00Z"), to: new Date("2030-01-31T23:59:59Z") };

describe("📏 round 2 · numbers on one definition", () => {
  let repo: SqliteRepo; let teacher: Actor; let admin: Actor; let classId = ""; let schoolId = "";
  let a = "", b = "", c = ""; let qid = ""; let holderId = "";
  let starred = "", plain = "";

  before(async () => {
    ({ repo } = await demoDatabase({ classesPerGrade: 1, studentsPerClass: 3 }));
    const as = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);
    teacher = await as("demo.teacher.4a");
    const t = (await repo.findUnique("Teacher", { userId: teacher.userId }))!;
    classId = s((await repo.findMany("ClassTeacher", { teacherId: t.id }))[0].classId);
    const ids = (await repo.findMany("ClassMembership", { classId, leftAt: null })).map((m) => s(m.studentId)).sort();
    [a, b, c] = ids;
    schoolId = s((await repo.findUnique("Student", { id: a }))!.schoolId);
    const adminUser = (await repo.findMany("User", { schoolId, role: "SCHOOL_ADMIN" }))[0];
    admin = await resolveActor(repo, adminUser);
    const q = (await repo.findMany("Question", {}, { select: ["id", "skillId"] })).find((x) => x.skillId)!;
    qid = s(q.id);
    const skill = (await repo.findUnique("Skill", { id: q.skillId }))!;
    // the hidden Curriculum Map holder skill (questions not linked to a skill yet)
    const holder = await repo.create("Skill", { curriculumId: skill.curriculumId, familyId: skill.familyId, code: "G4.curriculum-map-unclassified", name: "Unclassified (Curriculum Map)", domain: skill.domain, category: skill.category, sequence: 999, isActive: true });
    holderId = s(holder.id);
    clearSkillKeys(repo);
    for (const st of [a, b, c]) { await repo.deleteMany("SkillStatus", { studentId: st }); await repo.deleteMany("InterventionAlert", { studentId: st }); }

    // student A: 10 practice answers in January 2030 — 6 right, 2 wrong, 2 rapid guesses (right); one answer took 20 min
    const ses = await repo.create("PracticeSession", { studentId: a, skillId: q.skillId, mode: "ADAPTIVE_PRACTICE", startedAt: new Date(NOW.getTime() - 3 * DAY), activeMs: 0 });
    for (let k = 0; k < 10; k++) {
      const rapid = k >= 8, ok = k < 6 || rapid;
      await repo.create("QuestionAttempt", { sessionId: ses.id, studentId: a, questionId: qid, skillId: q.skillId, response: { value: "A" }, isCorrect: ok, partialCredit: null, responseMs: k === 0 ? 20 * 60_000 : 60_000, usedHint: false, rapidGuess: rapid, difficultyB: 0, createdAt: new Date(NOW.getTime() - 3 * DAY + k * 60_000) } as never);
    }
    // student B: only answers on the hidden holder skill
    const sesB = await repo.create("PracticeSession", { studentId: b, skillId: holderId, mode: "ADAPTIVE_PRACTICE", startedAt: new Date(NOW.getTime() - 2 * DAY), activeMs: 0 });
    for (let k = 0; k < 5; k++) await repo.create("QuestionAttempt", { sessionId: sesB.id, studentId: b, questionId: qid, skillId: holderId, response: { value: "A" }, isCorrect: true, partialCredit: null, responseMs: 30_000, usedHint: false, rapidGuess: false, difficultyB: 0, createdAt: new Date(NOW.getTime() - 2 * DAY + k * 60_000) } as never);

    // ⭐ A has ⭐ on one skill; an alert about it must disappear, the others stay
    const book = await starBook(repo, [a], schoolId);
    const skills = (await repo.findMany("Skill", { curriculumId: skill.curriculumId, deletedAt: null }, { select: ["id", "code"] })).filter((k) => s(k.id) !== holderId);
    const byKey = new Map<string, string>();
    for (const k of skills) if (!byKey.has(book.keyOf(s(k.id)))) byKey.set(book.keyOf(s(k.id)), s(k.id));
    const pick = [...byKey.values()];
    starred = pick[0]; plain = pick[1];
    const star = (studentId: string, skillId: string, status: string, score: number, extra: Record<string, unknown> = {}) =>
      repo.create("SkillStatus", { studentId, skillKey: book.keyOf(skillId), level: 1, status, skillId, answered: 30, correct: 25, score, startedAt: new Date(), masteredAt: status === "MASTERED" ? new Date() : null, updatedAt: new Date(), ...extra });
    await star(a, starred, "MASTERED", 95);
    await star(a, plain, "IN_PROGRESS", 40);
    for (const [skillId, msg] of [[starred, "about a ⭐ skill"], [plain, "about a skill in progress"], [null, "no skill"]] as const) {
      await repo.create("InterventionAlert", { studentId: a, skillId, ruleCode: "LOW_ACCURACY", message: msg, evidence: {}, createdAt: NOW });
    }
    // C: strong / needs work from the stars (+ a ⭐ on the holder skill that must never be counted)
    await star(c, pick[2], "MASTERED", 92);
    await star(c, pick[3], "NEEDS_REVIEW", 70);
    await star(c, pick[4], "IN_PROGRESS", 60, { needsSupportAt: new Date() });
    await star(c, pick[5], "IN_PROGRESS", 20);
    await star(c, pick[6], "IN_PROGRESS", 80);
    await repo.create("SkillStatus", { studentId: c, skillKey: book.keyOf(holderId), level: 1, status: "MASTERED", skillId: holderId, answered: 30, correct: 30, score: 99, startedAt: new Date(), masteredAt: new Date(), updatedAt: new Date() });
  });

  test("class overview: questions / accuracy / minutes = practiceTotals (rapid guesses out, ≤ 5 min, holder skill out)", async () => {
    const o = await classOverview(repo, teacher, classId, range);
    const ra = o.students.find((x) => x.studentId === a)!, rb = o.students.find((x) => x.studentId === b)!;
    assert.equal(ra.answered, 10);
    assert.equal(ra.accuracyPct, 75, "6 right of 8 careful answers");
    assert.equal(ra.minutes, 14, "9 × 1 min + the 20-minute answer counted as 5");
    assert.equal(rb.answered, 0, "answers on the hidden holder skill are not counted");
    assert.equal(o.kpis.questions, 10);
    assert.equal(o.kpis.accuracyPct, 75);
    assert.equal(o.kpis.minutes, 14);
    const hq = o.hardQuestions.find((h) => h.questionId === qid);
    assert.ok(hq, "the question is listed");
    assert.equal(hq!.attempts, 8, "rapid guesses are not in the hardest-questions list");
    assert.equal(hq!.accuracyPct, 75);
  });

  test("an open alert about a ⭐ skill is hidden (class overview and student detail); others stay", async () => {
    const o = await classOverview(repo, teacher, classId, range);
    const mine = o.alerts.filter((x) => x.studentId === a).map((x) => x.message).sort();
    assert.deepEqual(mine, ["about a skill in progress", "no skill"]);
    const d = await studentDetail(repo, teacher, a);
    assert.deepEqual(d.alerts.map((x) => x.message).sort(), ["about a skill in progress", "no skill"]);
  });

  test("practiceStats: month / week numbers on the practiceTotals rules; the holder skill is left out", async () => {
    const p = await practiceStats(repo, [a, b], NOW);
    const pa = p.get(a)!, pb = p.get(b)!;
    assert.deepEqual(pa.month, { answers: 10, minutes: 14 });
    assert.deepEqual(pa.week, { answers: 10, minutes: 14 });
    assert.equal(pa.recentAnswers, 8, "careful answers");
    assert.equal(pa.recentAccuracy, 75);
    assert.deepEqual(pb.month, { answers: 0, minutes: 0 });
    // the level engine's evidence is unchanged: every bank answer of the last 30 days (the holder skill's too)
    assert.equal(pb.recentAnswers, 5);
  });

  test("learning path: accuracy over the last 30 days leaves rapid guesses out", async () => {
    const lp = await studentLearningPath(repo, teacher, a, NOW);
    assert.equal(lp.answers30, 10);
    assert.equal(lp.accuracy30, 75);
  });

  test("student file: strong = ⭐ by key; needs work = 🔄, then ◐ needing support, then the lowest star score; holder out", async () => {
    const f = await studentFile(repo, admin, c, NOW);
    const book = await starBook(repo, [c], schoolId);
    const nameOfStatus = (status: string) => [...book.byKey.get(c)!.values()].filter((v) => v.status === status && v.skillId !== holderId).map((v) => book.nameOf(v.key));
    assert.deepEqual(f.skills.strong.map((x) => x.name), nameOfStatus("MASTERED"));
    assert.equal(f.skills.strong[0].pct, 92, "the star score");
    assert.equal(f.skills.mastered, 1, "the holder skill's ⭐ is not counted");
    assert.equal(f.skills.started, 5);
    assert.deepEqual(f.skills.weak.map((x) => x.pct), [70, 60, 20, 80], "🔄 first, then needs support, then the lowest star score");
    assert.ok(!f.skills.weak.some((w) => f.skills.strong.some((x) => x.name === w.name)), "a ⭐ skill is never in needs work");
  });

  test("Excelling = ⭐ on half or more of the started skills (never accuracy)", () => {
    const v = (status: string) => ({ status } as StarView);
    assert.equal(isExcelling([v("MASTERED"), v("IN_PROGRESS")]), true);
    assert.equal(isExcelling([v("MASTERED"), v("IN_PROGRESS"), v("NEEDS_REVIEW")]), false);
    assert.equal(isExcelling([v("IN_PROGRESS")]), false);
    assert.equal(isExcelling([]), false);
  });

  test("class middle = the average STAR score; class month accuracy leaves rapid guesses out", async () => {
    const book = await starBook(repo, [a, c], schoolId);
    const rows = starScoreRows(book, [a, c], await hiddenStarKeys(repo, book));
    assert.ok(!rows.some((r) => r.skillId === book.keyOf(holderId)), "the holder skill never places a student");
    const r = peerRows({ students: [{ id: a, name: "A" }, { id: c, name: "C" }], mastery: rows, stars: [], attempts: [], now: NOW });
    const avgA = Math.round((95 + 40) / 2);
    assert.equal(r.rows.find((x) => x.studentId === a)!.average, avgA);
    const now = NOW;
    const m = monthCompare({ ids: [a], skillNames: new Map(), stars: [], sessions: [], now,
      attempts: [{ studentId: a, isCorrect: true, rapidGuess: true, createdAt: new Date(now.getTime() - DAY) }, { studentId: a, isCorrect: false, rapidGuess: false, createdAt: new Date(now.getTime() - DAY) }] });
    assert.equal(m.thisMonth.answers, 2);
    assert.equal(m.thisMonth.accuracy, 0, "the rapid right answer counts for nothing");
  });

  test("the code keeps the rules: 5-minute cap per answer, 25 students at a time, holder skill out of ⭐ counts", () => {
    for (const f of ["src/server/student/weekly.ts", "src/server/teacher/classroom.ts", "src/server/admin/school-goals.ts"]) {
      assert.doesNotMatch(read(f), /180_000/, f);
      assert.match(read(f), /responseMs \?\? 0\), 5 \* 60_000\)/, f);
    }
    assert.match(read("src/server/analytics/school-dashboard.ts"), /STUDENT_CHUNK = 25/);
    for (const f of ["src/server/analytics/school-dashboard.ts", "src/server/insights/progress.ts", "src/server/map/map-reports.ts"]) assert.match(read(f), /hiddenStarKeys/, f);
  });
});
