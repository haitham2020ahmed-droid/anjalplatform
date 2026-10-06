import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { bandDistribution, mean, median, percentile, streaks } from "../src/analytics/stats";
import { months, resolvePeriod, type Calendar } from "../src/analytics/periods";
import { growthFromLogs } from "../src/server/analytics/growth";
import { replayDays, buildSnapshots } from "../src/server/analytics/snapshots";
import { classComparison, NO_NATIONAL, standardsReport, studentAnalytics } from "../src/server/analytics/reports";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import type { Actor } from "../src/server/auth/rbac";
import { loadSkillItems } from "../src/server/practice/items";
import { startPractice, submitAnswer } from "../src/server/practice/session";
import { DEMO_SCHOOL_CODE } from "../src/server/seeding/demo";
import { loadBank } from "../src/server/seeding/load-files";
import { seedQuestions } from "../src/server/seeding/questions";
import { demoDatabase, ROOT, seededRandom } from "./helpers/db";
const rng = seededRandom(4242);

const cal: Calendar = {
  year: { name: "2026-2027", start: new Date("2026-09-01T00:00:00Z"), end: new Date("2027-06-30T23:59:59Z") },
  terms: [
    { name: "Term 1", start: new Date("2026-09-01T00:00:00Z"), end: new Date("2026-12-31T23:59:59Z") },
    { name: "Term 2", start: new Date("2027-01-10T00:00:00Z"), end: new Date("2027-06-30T23:59:59Z") },
  ],
};

describe("statistics", () => {
  test("mean, median, percentiles, streaks and band distribution", () => {
    assert.equal(mean([2, 4, 9]), 5);
    assert.equal(median([5, 1, 3]), 3);
    assert.equal(median([1, 2, 3, 4]), 2.5);
    assert.equal(percentile([0, 10, 20, 30, 40], 25), 10);
    assert.equal(mean([]), null);
    assert.deepEqual(streaks([true, true, false, true, true, true], true), { longest: 3, current: 3 });
    assert.deepEqual(streaks([true, false, false, true], false), { longest: 2, current: 0 });
    assert.deepEqual(bandDistribution([10, 45, 61, 80, 95, 100]).map((b) => b.count), [1, 1, 1, 1, 2]);
  });
});

describe("reporting periods", () => {
  const now = new Date("2026-11-15T10:00:00Z");
  test("last 7/30 days, term, semester, school year and custom ranges", () => {
    assert.equal(resolvePeriod("LAST_7_DAYS", cal, now).from.toISOString().slice(0, 10), "2026-11-09");
    assert.equal(resolvePeriod("LAST_30_DAYS", cal, now).from.toISOString().slice(0, 10), "2026-10-17");
    assert.equal(resolvePeriod("TERM", cal, now).label, "Term 1");
    assert.equal(resolvePeriod("SEMESTER", cal, now).label, "First semester");
    assert.equal(resolvePeriod("SCHOOL_YEAR", cal, now).label, "2026-2027");
    assert.throws(() => resolvePeriod("CUSTOM", cal, now, { from: new Date("2026-12-01"), to: new Date("2026-11-01") }), /before the end/);
    assert.deepEqual(months(resolvePeriod("TERM", cal, now)).map((m) => m.label), ["Sep 26", "Oct 26", "Nov 26"]);
  });
});

describe("growth (hand-built histories with known answers)", () => {
  const at = (iso: string) => Date.parse(iso);
  const logs = [
    { skillId: "A", at: at("2026-09-10T08:00:00Z"), masteryAfter: 20, newTheta: -0.5 },
    { skillId: "A", at: at("2026-10-12T08:00:00Z"), masteryAfter: 45, newTheta: 0 },
    { skillId: "A", at: at("2026-11-10T08:00:00Z"), masteryAfter: 60, newTheta: 0.4 },
    { skillId: "B", at: at("2026-11-11T08:00:00Z"), masteryAfter: 30, newTheta: -0.2 },
  ];
  const info = new Map([["A", { name: "Theme", domain: "READING" }], ["B", { name: "Commas", domain: "LANGUAGE" }]]);

  test("daily replay keeps the latest mastery per skill", () => {
    const days = replayDays(logs);
    assert.deepEqual(days.map((d) => d.day), ["2026-09-10", "2026-10-12", "2026-11-10", "2026-11-11"]);
    assert.equal(days[3].mastery, 45); // (60 + 30) / 2
  });

  test("monthly trend, start/current, and paired skill growth that is not fooled by a new skill", () => {
    const g = growthFromLogs(logs, resolvePeriod("TERM", cal, new Date("2026-11-30T12:00:00Z")), info);
    assert.deepEqual(g.series.map((p) => p.mastery), [20, 45, 45]);
    assert.equal(g.start, 20);
    assert.equal(g.current, 45);
    // the average fell from 60 to 45 when skill B started, but Theme grew 20 → 60;
    // Commas has a single measurement, so no growth is claimed for it
    assert.deepEqual(g.skills.map((s) => [s.name, s.start, s.growth]), [["Theme", 20, 40]]);
    assert.deepEqual(g.domains.map((d) => d.domain), ["READING"]);
  });

  test("a period with no practice reports no growth instead of zero", () => {
    const g = growthFromLogs([], resolvePeriod("TERM", cal, new Date("2026-11-30T12:00:00Z")), info);
    assert.equal(g.growth, null);
    assert.ok(g.series.every((p) => p.mastery === null));
  });
});

describe("analytics on the database", () => {
  let repo: SqliteRepo;
  let teacher: Actor, otherTeacher: Actor, admin: Actor;
  let classA: string;
  let s1: string;
  const term = resolvePeriod("TERM", cal, new Date("2026-12-20T12:00:00Z"));

  before(async () => {
    ({ repo } = await demoDatabase());
    await seedQuestions(repo, { schoolCode: DEMO_SCHOOL_CODE, bank: loadBank(ROOT) });
    const g4 = (await repo.findMany("Question", { status: "UNDER_REVIEW" })).filter((q) => String(q.externalRef).startsWith("G4-"));
    await repo.updateMany("Question", { id: { in: g4.map((q) => q.id) } }, { status: "PUBLISHED" });
    teacher = await resolveActor(repo, (await repo.findUnique("User", { username: "demo.teacher.4a" }))!);
    otherTeacher = await resolveActor(repo, (await repo.findUnique("User", { username: "demo.teacher.4b" }))!);
    admin = await resolveActor(repo, (await repo.findUnique("User", { username: "demo.admin" }))!);
    // three students in class 4A practise in September, October and November
    let k = 0;
    for (const u of ["demo.s1001", "demo.s1002", "demo.s1003"]) {
      const a = await resolveActor(repo, (await repo.findUnique("User", { username: u }))!);
      const st = (await repo.findUnique("Student", { id: a.studentId! }))!;
      const cur = (await repo.findMany("Curriculum", { gradeId: st.gradeId }))[0];
      for (const [mi, month] of ["2026-09-15", "2026-10-15", "2026-11-15"].entries()) {
        const code = ["G4.theme", "G4.context-clues", "G4.central-idea"][mi];
        const skill = String((await repo.findUnique("Skill", { curriculumId: cur.id, code }))!.id);
        let clock = Date.parse(`${month}T08:00:00Z`);
        let view = await startPractice(repo, a, skill, new Date(clock), rng);
        const items = await loadSkillItems(repo, skill);
        for (let n = 0; n < 8 && view.question; n++) {
          const it = items.find((i) => i.questionId === view.question!.questionId)!;
          const right = (n + k) % 3 !== 0;
          const resp = it.options ? (it.type === "MULTI_SELECT" ? it.options.filter((o) => o.correct === right || (!right && !o.correct)).map((o) => o.label) : it.options.find((o) => o.correct === right)!.label)
            : it.type === "TRUE_FALSE" ? (right ? it.answer : !it.answer) : it.type === "FILL_BLANK" ? (right ? it.answers![0] : "zzz")
            : it.type === "ERROR_CORRECTION" ? (right ? it.errorIndex : (it.errorIndex! + 1) % it.segments!.length)
            : it.type === "MATCHING" ? Object.fromEntries(it.pairs!.map((p, i) => [p.left, right ? p.right : it.pairs![(i + 1) % it.pairs!.length].right]))
            : right ? it.sequence : [...it.sequence!].reverse();
          ({ view } = await submitAnswer(repo, a, { sessionId: view.sessionId, questionId: it.questionId, response: resp }, new Date((clock += 40_000)), rng));
        }
        if (!view.ended) await repo.updateMany("PracticeSession", { id: view.sessionId }, { endedAt: new Date(clock), endReason: "STUDENT_EXIT", currentQuestionId: null });
      }
      k++;
    }
    s1 = String((await repo.findUnique("Student", { userId: (await repo.findUnique("User", { username: "demo.s1001" }))!.id }))!.id);
    classA = String((await repo.findMany("ClassMembership", { studentId: s1 }))[0].classId);
  });

  test("snapshots are rebuilt from the decision log and re-running is idempotent", async () => {
    const ids = (await repo.findMany("ClassMembership", { classId: classA })).map((m) => String(m.studentId));
    const n1 = await buildSnapshots(repo, ids, term.from, term.to);
    const c1 = await repo.count("AbilitySnapshot", { scope: "GLOBAL" });
    await buildSnapshots(repo, ids, term.from, term.to);
    assert.ok(n1 >= 9 && c1 === (await repo.count("AbilitySnapshot", { scope: "GLOBAL" })));
  });

  test("student analytics: every §11 metric, consistent with the raw answers", async () => {
    const a = await studentAnalytics(repo, teacher, s1, term);
    const raw = (await repo.findMany("QuestionAttempt", { studentId: s1 }));
    assert.equal(a.questions, raw.length);
    assert.equal(a.correct + a.incorrect, a.questions);
    assert.equal(a.correct, raw.filter((r) => r.isCorrect).length);
    assert.equal(a.skillsAttempted, 3);
    assert.ok(a.sessions >= 3 && a.minutes > 0 && a.avgSeconds! > 0);
    assert.ok(a.streakCorrect.longest >= 1 && a.highestLevelCorrect >= 1);
    assert.equal(a.unitProgress.length, 6);
    assert.equal(a.readingRange, null, "no placement yet, so no reading range");
    // December carries November's mastery forward (mastery persists between sessions)
    assert.deepEqual(a.growth.series.map((p) => p.mastery !== null), [true, true, true, true]);
    assert.equal(a.growth.series[3].mastery, a.growth.series[2].mastery);
    // Central Idea has a single question in today's Grade 4 bank → one measurement → no growth claimed
    assert.deepEqual(a.growth.skills.map((x) => x.name).sort(), ["Context Clues", "Theme"]);
    assert.deepEqual(a.importedMap, []);
  });

  test("only people with access can see a student's analytics (parent yes, other teacher no)", async () => {
    await assert.rejects(studentAnalytics(repo, otherTeacher, s1, term), /do not have access/);
    const parent = await resolveActor(repo, (await repo.findUnique("User", { username: "demo.p1001" }))!);
    assert.ok((await studentAnalytics(repo, parent, s1, term)).questions > 0);
  });

  test("comparison: grade/school averages are suppressed below 5 students; no national figure is invented", async () => {
    const c = await classComparison(repo, teacher, classA, term);
    assert.equal(c.rows[0].studentsWithData, 3);
    assert.ok(c.rows[0].avgMastery !== null);
    assert.equal(c.rows[1].suppressed, true, "only 3 students in the grade have data");
    assert.equal(c.rows[1].avgMastery, null);
    const national = c.external.find((e) => e.scope === "NATIONAL")!;
    assert.equal(national.available, false);
    assert.equal(national.message, NO_NATIONAL);
    assert.equal(c.distribution.reduce((t, b) => t + b.count, 0), 3);
  });

  test("an imported national reference is shown with its source", async () => {
    await repo.create("BenchmarkReference", { scope: "NATIONAL", metric: "ACCURACY_PCT", gradeLevel: 4, season: "FALL", value: 68, source: "Example licensed dataset 2026 (imported)" });
    const c = await classComparison(repo, teacher, classA, term);
    const national = c.external.find((e) => e.scope === "NATIONAL")!;
    assert.equal(national.available, true);
    assert.equal(national.value, 68);
    assert.match(national.source!, /imported/);
  });

  test("standards report: by CCSS standard, weakest first; school-wide view is admin-only", async () => {
    const r = await standardsReport(repo, teacher, { classId: classA }, term);
    assert.ok(r.rows.length >= 2);
    for (let i = 1; i < r.rows.length; i++) assert.ok(r.rows[i].accuracyPct >= r.rows[i - 1].accuracyPct);
    assert.ok(r.rows.every((x) => x.short.match(/^(RL|RI|L|W|RF)\.4\./) && x.attempts >= 5));
    assert.ok(r.notAssessed > 50);
    await assert.rejects(standardsReport(repo, teacher, { school: true }, term), /Missing permission/);
    const s = await standardsReport(repo, admin, { school: true }, term);
    assert.ok(s.rows.length >= r.rows.length);
    await assert.rejects(standardsReport(repo, otherTeacher, { classId: classA }, term), /do not teach/);
  });
});
