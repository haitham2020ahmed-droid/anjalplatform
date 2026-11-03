/**
 * 📏 Round 4 · group "reports": every practice number a parent, teacher or admin sees comes from ONE definition
 * (analytics/practice-totals.ts), weeks are Riyadh weeks from Sunday, skills are counted by KEY from the stars.
 *  1. This week / This month / the monthly family report / the family week = practiceTotals (rapid guesses out of
 *     accuracy, ≤ 5 min per answer, NAFS + ReadRise included, Riyadh days)
 *  2. the MAP Family Report's "this month" = the last 30 days, its skills = ⭐ earned in those days
 *  3. class accuracy = correct ÷ careful answers
 *  4. "no practice in N days" sees NAFS answers
 *  5. Week in Review and the Reports week summary = one function
 *  6. the class month on practiceTotals; skills improved / still weak by key from the stars
 *  7–11. bounded reads, the star score instead of the old engine score, Riyadh months, answerTotals gone
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
import { emptyTotals, practiceTotals, practiceTotalsFor } from "../src/server/analytics/practice-totals";
import { activeDaysFor, weekStart, weekStats } from "../src/server/student/weekly";
import { studentLearningPath } from "../src/server/student/learning-path";
import { monthFacts, monthSpan } from "../src/server/reports/monthly-report";
import { gradeSummary } from "../src/server/insights/progress";
import { weekNumbers } from "../src/server/insights/week-in-review";
import { monthCompare, monthWindows, weeklySummary } from "../src/server/insights/class-compare";
import { newStarKeys, weakKeys, weakestKeyOf } from "../src/server/insights/star-keys";
import { teacherHomeSummary } from "../src/server/teacher/needs-attention";

const s = (v: unknown) => String(v ?? "");
const read = (f: string) => readFileSync(join(process.cwd(), f), "utf8");
const DAY = 86_400_000;
// Tuesday 22 Jan 2030, 12:00 Riyadh — far from the demo's own answers; the Riyadh week began Sun 20 Jan 00:00 Riyadh
const NOW = new Date("2030-01-22T09:00:00Z");

describe("📏 round 4 · reports on one definition", () => {
  let repo: SqliteRepo; let teacher: Actor; let admin: Actor; let classId = ""; let schoolId = "";
  let a = "", b = ""; let qid = ""; let skillId = "";

  before(async () => {
    ({ repo } = await demoDatabase({ classesPerGrade: 1, studentsPerClass: 3 }));
    const as = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);
    teacher = await as("demo.teacher.4a");
    const t = (await repo.findUnique("Teacher", { userId: teacher.userId }))!;
    classId = s((await repo.findMany("ClassTeacher", { teacherId: t.id }))[0].classId);
    [a, b] = (await repo.findMany("ClassMembership", { classId, leftAt: null })).map((m) => s(m.studentId)).sort();
    schoolId = s((await repo.findUnique("Student", { id: a }))!.schoolId);
    admin = await resolveActor(repo, (await repo.findMany("User", { schoolId, role: "SCHOOL_ADMIN" }))[0]);
    const q = (await repo.findMany("Question", {}, { select: ["id", "skillId"] })).find((x) => x.skillId)!;
    qid = s(q.id); skillId = s(q.skillId);
    clearSkillKeys(repo);
    for (const st of [a, b]) await repo.deleteMany("SkillStatus", { studentId: st });
    // A, Monday 21 Jan: 10 practice answers — 6 right, 2 wrong, 2 rapid guesses (right); one answer took 20 minutes
    const ses = await repo.create("PracticeSession", { studentId: a, skillId, mode: "ADAPTIVE_PRACTICE", startedAt: new Date("2030-01-21T07:00:00Z"), activeMs: 3 * 3_600_000 });
    for (let k = 0; k < 10; k++) {
      const rapid = k >= 8, ok = k < 6 || rapid;
      await repo.create("QuestionAttempt", { sessionId: ses.id, studentId: a, questionId: qid, skillId, response: { value: "A" }, isCorrect: ok, partialCredit: null, responseMs: rapid ? 1000 : k === 0 ? 20 * 60_000 : 60_000, usedHint: false, rapidGuess: rapid, difficultyB: 0, createdAt: new Date(`2030-01-21T07:${String(10 + k).padStart(2, "0")}:00Z`) } as never);
    }
    // A, Saturday 19 Jan 22:00 UTC = Sunday 01:00 in Riyadh: in this school week (a UTC week would miss it)
    await repo.create("QuestionAttempt", { sessionId: ses.id, studentId: a, questionId: qid, skillId, response: { value: "A" }, isCorrect: true, partialCredit: null, responseMs: 60_000, usedHint: false, rapidGuess: false, difficultyB: 0, createdAt: new Date("2030-01-19T22:00:00Z") } as never);
    // A, Tuesday: one NAFS practice answer (a star source too)
    await repo.create("NafsPracticeAnswer", { runId: "run-r4", practiceId: "p-r4", studentId: a, questionId: qid, target: "x", difficulty: 1, choice: 0, correct: true, ms: 60_000, at: new Date("2030-01-22T06:00:00Z") });
    // B: only a NAFS answer, 2 days ago (no bank answer at all)
    await repo.create("NafsPracticeAnswer", { runId: "run-r4b", practiceId: "p-r4", studentId: b, questionId: qid, target: "x", difficulty: 1, choice: 0, correct: false, ms: 40_000, at: new Date(NOW.getTime() - 2 * DAY) });
  });

  test("1. This week = practiceTotals for the Riyadh week (Sunday), Riyadh days active, minutes ≤ 5 per answer", async () => {
    const w = await weekStats(repo, a, NOW);
    const tot = await practiceTotalsFor(repo, a, weekStart(NOW), NOW);
    assert.equal(w.since, "2030-01-20", "the Riyadh Sunday (the UTC instant is Saturday 21:00)");
    assert.equal(w.answers, 12, "10 practice + the Sunday-01:00-Riyadh answer + the NAFS answer");
    assert.equal(w.correct, 8, "right CAREFUL answers: the 2 rapid guesses count for nothing");
    assert.equal(w.minutes, 14, "5 (the 20-minute answer, capped) + 7 × 1 min + Sunday 1 + NAFS 1 (the 2 fast guesses ≈ 0)");
    assert.equal(w.days, 3, "Sunday, Monday and Tuesday in Riyadh");
    assert.deepEqual([w.answers, w.correct, w.minutes], [tot.questions, tot.correct, tot.minutes], "the same numbers as practiceTotals");
    assert.equal((await activeDaysFor(repo, [a, b], weekStart(NOW), NOW)).get(b), 1, "a NAFS-only day is a day of practice");
  });

  test("1. This month (learning path / parent) and the monthly family report = practiceTotals", async () => {
    const p = await studentLearningPath(repo, admin, a, NOW);
    const t30 = await practiceTotalsFor(repo, a, new Date(NOW.getTime() - 30 * DAY), NOW);
    assert.deepEqual([p.answers30, p.accuracy30], [t30.questions, t30.accuracy]);
    assert.equal(p.accuracy30, 80, "8 right of 10 careful answers");
    assert.equal(p.rapidPct30, 17, "2 rapid guesses of 12 answers");
    const span = monthSpan(2030, 0);
    const f = (await monthFacts(repo, [a, b], span)).get(a)!;
    const tm = await practiceTotalsFor(repo, a, span.from, new Date(span.to.getTime() - 1));
    assert.deepEqual([f.answers, f.minutes, f.accuracy], [tm.questions, tm.minutes, tm.accuracy], "the month's effort is the one definition");
    assert.equal(f.days, 3);
    assert.doesNotMatch(read("src/server/reports/monthly-report.ts"), /take: 40000/, "no 40,000-answer cap");
    assert.match(read("src/server/reports/monthly-report.ts"), /const PART = 25/, "25 students at a time");
  });

  test("3. class accuracy = correct ÷ careful answers", async () => {
    const g = await gradeSummary(repo, admin, "READING", NOW);
    const row = g.flatMap((x) => x.classes).find((c) => c.classId === classId)!;
    const ids = (await repo.findMany("ClassMembership", { classId, leftAt: null })).map((m) => s(m.studentId));
    const tot = [...(await practiceTotals(repo, ids, new Date("2029-08-01T00:00:00Z"), new Date(NOW.getTime() + DAY))).values()];
    const careful = tot.reduce((x, y) => x + y.careful, 0), correct = tot.reduce((x, y) => x + y.correct, 0);
    assert.ok(careful > 0);
    assert.equal(row.accuracy, Math.round((100 * correct) / careful));
  });

  test("4. last active = the last answer of ANY source (a NAFS-only student is not 'never practised')", async () => {
    const h = await teacherHomeSummary(repo, teacher, NOW);
    const rb = h.list.find((x) => x.studentId === b);
    assert.ok(!rb || (!rb.neverPractised && rb.idleDays !== null && rb.idleDays < 7), "B practised NAFS 2 days ago");
    assert.doesNotMatch(read("src/server/teacher/needs-attention.ts"), /StudentSkillMastery/, "no engine row is read for one date");
  });

  test("5. Week in Review and the Reports week summary are ONE function (Riyadh week, practiceTotals)", async () => {
    const w = await weekNumbers(repo, [a, b], NOW, { schoolId, stars: true });
    const tot = await practiceTotals(repo, [a, b], weekStart(NOW), NOW);
    assert.equal(w.questions, [...tot.values()].reduce((x, y) => x + y.questions, 0));
    assert.equal(w.minutes, [...tot.values()].reduce((x, y) => x + y.minutes, 0), "answer time, not the 3-hour session");
    assert.equal(w.skills, 1, "one skill KEY practised");
    assert.equal(w.active, 2);
    assert.match(read("src/server/insights/class-compare.ts"), /weekNumbers\(repo, ids, now, \{ schoolId: actor\.schoolId, stars: true \}\)/);
    const ws = await weeklySummary(repo, teacher, NOW);
    const all = (await repo.findMany("ClassMembership", { classId, leftAt: null })).map((m) => s(m.studentId));
    const wAll = await weekNumbers(repo, all, NOW, { schoolId, stars: true });
    assert.deepEqual([ws!.minutes, ws!.active, ws!.newStars, ws!.weakest], [wAll.minutes, wAll.active, wAll.newStars, wAll.weakest]);
  });

  test("6 / 9. skills by KEY from the stars: weakest = 🔄 first, then the lowest star score; ⭐ in a range", () => {
    const v = (key: string, status: StarView["status"], score: number, masteredAt: string | null = null): StarView => ({ key, status, level: 1, answered: 30, correct: 20, score, skillId: `id-${key}`, startedAt: "2030-01-01T00:00:00Z", masteredAt, reviewDueAt: null, needsSupport: false, selfCheck: null, updatedAt: null });
    const byKey = new Map([
      ["s1", new Map([["k1", v("k1", "IN_PROGRESS", 20)], ["k2", v("k2", "NEEDS_REVIEW", 70)], ["k3", v("k3", "MASTERED", 95, "2030-01-10T00:00:00Z")], ["hid", v("hid", "NEEDS_REVIEW", 5)]])],
      ["s2", new Map([["k1", v("k1", "IN_PROGRESS", 40)], ["k3", v("k3", "MASTERED", 90, "2029-11-01T00:00:00Z")]])],
    ]);
    const book = { byKey, ix: { keyOf: new Map(), skillsOf: new Map(), nameOf: new Map([["k1", "Inference"], ["k2", "Theme"]]), gradeOf: new Map() }, nameOf: (k: string) => (k === "k1" ? "Inference" : k === "k2" ? "Theme" : "Skill") } as never;
    const hidden = new Set(["hid"]);
    assert.deepEqual(weakKeys(book, ["s1", "s2"], hidden).map((k) => [k.key, k.review, k.score]), [["k2", 1, null], ["k1", 0, 30]], "🔄 first, then the lowest star score; the holder skill out");
    assert.equal(weakestKeyOf(book, "s1", hidden)!.key, "k2");
    assert.equal(weakestKeyOf(book, "s2", hidden)!.key, "k1");
    assert.deepEqual(newStarKeys(book, "s1", new Date("2030-01-01"), new Date("2030-01-31")), ["k3"]);
    assert.deepEqual(newStarKeys(book, "s2", new Date("2030-01-01"), new Date("2030-01-31")), [], "a ⭐ earned before the range");
  });

  test("6. the class month on practiceTotals (two 30-day Riyadh windows), no 30,000-answer read", () => {
    const { ms } = monthWindows(NOW);
    assert.equal(new Date(ms.thisTo + 3 * 3_600_000).toISOString().slice(0, 10), "2030-01-22", "this window ends today (Riyadh)");
    const m = monthCompare({ ids: ["x"], stars: [], windows: ms, lastTotals: new Map(), thisTotals: new Map([["x", { ...emptyTotals(), questions: 10, correct: 3, careful: 6, minutes: 7 }]]) });
    assert.deepEqual([m.thisMonth.answers, m.thisMonth.accuracy, m.thisMonth.minutes, m.thisMonth.active], [10, 50, 7, 1]);
    const src = read("src/server/insights/class-compare.ts");
    assert.doesNotMatch(src.slice(src.indexOf("export async function classMonth"), src.indexOf("// ------------------------------------------------------------------ a student against the class")), /QuestionAttempt|take: 30000/);
  });

  test("2 / 7 / 8 / 9 / 10 / 11: the code keeps the rules", () => {
    const fs = read("src/server/reports/family-sections.ts");
    assert.match(fs, /practiceTotalsFor\(repo, studentId, from, now\)/, "MAP Family Report: the last 30 days");
    assert.match(fs, /newStarKeys\(book, studentId, from, now, await hiddenStarKeys\(repo, book\)\)/, "⭐ earned in those 30 days, holder skill out");
    assert.match(read("src/server/insights/department.ts"), /gradeSummaryWithRows/, "the department reuses the grade summary's numbers");
    assert.doesNotMatch(read("src/server/insights/department.ts"), /practiceStats\(|repo\.findMany\("QuestionAttempt"/, "no second read of every student's practice, no unbounded answer read");
    assert.match(read("src/server/insights/department.ts"), /i \+= 25\) \{\n    const answers = \(await loadAnswers/, "weakest skills: 25 students at a time");
    const sg = read("src/server/admin/school-goals.ts");
    assert.match(sg, /practiceTotals/); assert.match(sg, /cancelIndexForStudents/); assert.match(sg, /completedAt: \{ gte: term\.from \}/);
    assert.match(read("src/server/insights/error-patterns.ts"), /skillId: \{ in: graphIds \}/, "only the skill rows needed");
    const ex = read("src/server/teacher/extras.ts");
    assert.doesNotMatch(ex.slice(ex.indexOf("export async function classChallenge"), ex.indexOf("// ------------------------------------------------------------------ 📈 MAP growth report")), /repo\.count\("QuestionAttempt"/, "class challenge: careful answers only");
    assert.match(ex, /accuracy: weekCareful \? Math\.round\(\(100 \* weekRight\) \/ weekCareful\) : null/, "class visit: careful answers only");
    const mm = read("src/server/map/map-more.ts");
    assert.doesNotMatch(mm.slice(mm.indexOf("export async function myMap")), /StudentSkillMastery/, "My MAP: the star score, not the engine");
    const ew = read("src/server/insights/early-warning.ts");
    assert.doesNotMatch(ew, /StudentSkillMastery/, "early warning: last active and assign practice from the star / answer sources");
    assert.match(ew, /weakestKeyOf\(book, id, hiddenK\)/);
    const cc = read("src/server/insights/class-compare.ts");
    assert.doesNotMatch(cc.slice(cc.indexOf("export async function myMonth")), /Date\.UTC\(now\.getUTCFullYear/, "My month: Riyadh months");
    assert.doesNotMatch(read("src/server/insights/student-data.ts"), /answerTotals/, "the unused answerTotals is gone");
    for (const f of ["src/app/parent/page.tsx", "src/app/admin/term-report/page.tsx"]) assert.match(read(f), /await getT\(\)/, f);
    assert.doesNotMatch(read("src/app/admin/term-report/page.tsx"), /`Grade \$\{g\.grade\}: reteach/, "the reteach sentences are templates");
  });
});
