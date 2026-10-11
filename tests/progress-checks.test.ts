import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import { ForbiddenError, type Actor } from "../src/server/auth/rbac";
import { ValidationError } from "../src/server/curriculum-admin";
import { seedTestEnvironment } from "../src/server/seeding/test-env";
import { pickCategory, selectItems, skillCategory, spread, type Candidate } from "../src/server/progress-checks/select";
import { classTextSets, createProgressCheck, progressCheckResults } from "../src/server/progress-checks/progress-checks";
import { defaultCycle, fluencyDue, instructionalWeekOf, loadCycle, saveCycle, textSetDueDate, validateCycle } from "../src/server/assessment-cycle/cycle";
import { cycleStatus } from "../src/server/assessment-cycle/status";
import { computeTiers } from "../src/server/tiers/tiers";
import { calendar } from "../src/server/teacher/extras";
import { demoDatabase } from "./helpers/db";

const DAY = 86_400_000;
const NOW = new Date("2026-10-10T08:00:00Z");
const ago = (n: number) => new Date(NOW.getTime() - n * DAY);
const cand = (id: string, skillId: string, lvl: number, type = "MULTIPLE_CHOICE", lessonLinked = false): Candidate => ({ id, skillId, difficultyLevel: lvl, type, lessonLinked });

describe("📋 progress checks — pure selection", () => {
  test("skill categories: vocabulary by domain / category / role; reading = comprehension; grammar & spelling = other", () => {
    assert.equal(skillCategory({ domain: "VOCABULARY", category: "WORD_STUDY" }), "VOCABULARY");
    assert.equal(skillCategory({ domain: "READING", category: "LITERATURE" }, "VOCABULARY_STRATEGY"), "VOCABULARY");
    assert.equal(skillCategory({ domain: "READING", category: "INFORMATIONAL" }, "STRATEGY_AND_FEATURE"), "COMPREHENSION");
    assert.equal(skillCategory({ domain: "GRAMMAR", category: "GRAMMAR" }, "GRAMMAR"), "OTHER");
    assert.equal(skillCategory({ domain: "WORD_STUDY", category: "PHONICS_WORD_STUDY" }, "SPELLING"), "OTHER");
  });

  test("6 + 4 mix, a short category gives its slots to the other, skills take turns, an enhanced item is included", () => {
    const C = [...Array.from({ length: 6 }, (_, i) => cand(`a${i}`, "s1", 1 + i, "MULTIPLE_CHOICE", i < 3)), ...Array.from({ length: 6 }, (_, i) => cand(`b${i}`, "s2", 2 + i)), cand("hot", "s2", 4, "HOT_TEXT")];
    const V = [cand("v1", "s3", 3), cand("v2", "s3", 4), cand("v3", "s3", 5), cand("v4", "s4", 4), cand("v5", "s4", 2, "TWO_PART")];
    const r = selectItems({ COMPREHENSION: C, VOCABULARY: V }, 4);
    assert.equal(r.items.length, 10);
    assert.equal(r.items.filter((q) => q.category === "COMPREHENSION").length, 6);
    assert.equal(r.items.filter((q) => q.category === "VOCABULARY").length, 4);
    assert.ok(new Set(r.items.filter((q) => q.category === "COMPREHENSION").map((q) => q.skillId)).size === 2, "both comprehension skills covered");
    assert.ok(r.items.some((q) => q.id === "hot") && r.items.some((q) => q.id === "v5"), "TWO_PART / HOT_TEXT included");
    const short = selectItems({ COMPREHENSION: C, VOCABULARY: V.slice(0, 2) }, 4);
    assert.deepEqual([short.items.length, short.items.filter((q) => q.category === "VOCABULARY").length], [10, 2]);
    assert.match(short.notes.join(" "), /Only 2 vocabulary/);
    assert.deepEqual(spread(5, 4), [2, 3, 4, 5, 6]);
    // a retake avoids the earlier form's items when it can
    const first = pickCategory(C, 4, 4).map((q) => q.id);
    const second = pickCategory(C, 4, 4, new Set(first)).map((q) => q.id);
    assert.equal(second.filter((id) => first.includes(id)).length, 0);
  });
});

describe("🗓️ assessment cycle — pure", () => {
  const c = defaultCycle(NOW);
  test("defaults for a Saudi school year (late August – June), validation", () => {
    assert.equal(c.year, "2026-2027");
    assert.equal(c.yearStart, "2026-08-23", "the first Sunday on or after 20 August");
    assert.ok(c.yearEnd.startsWith("2027-06"));
    assert.ok(c.diagnostic.BOY.closes < c.diagnostic.MOY.opens && c.diagnostic.MOY.closes < c.diagnostic.EOY.opens);
    assert.equal(c.map.length, 3);
    assert.deepEqual(validateCycle(JSON.parse(JSON.stringify(c))), c);
    assert.throws(() => validateCycle({ ...c, diagnostic: { ...c.diagnostic, MOY: c.diagnostic.BOY } }), /in order/);
    assert.throws(() => validateCycle({ ...c, yearStart: "2026-13-01" }), ValidationError);
    assert.throws(() => validateCycle({ ...c, map: [{ name: "Fall", opens: "2025-01-01", closes: "2025-01-05" }] }), /inside the school year/);
    assert.equal(instructionalWeekOf(c, NOW), 7);
  });

  test("text-set due dates from lesson weeks; break weeks are skipped", () => {
    assert.equal(textSetDueDate(c, 1, [1, 2], 1), "2026-09-03", "Thursday of week 2");
    assert.equal(textSetDueDate(c, 2, [5], 3), "2026-11-05", "unit 2 week 5 = instructional week 11");
    assert.equal(textSetDueDate(c, 1, null, 3), "2026-09-24", "no weeks: Wonders pacing (TS3 = week 5)");
    const withBreak = { ...c, breaks: [{ name: "National Day", opens: "2026-08-30", closes: "2026-09-03" }] };
    assert.equal(textSetDueDate(withBreak, 1, [1, 2], 1), "2026-09-10");
  });

  test("fluency due by tier cadence: Tier 3 weekly, Tier 2 every 2 weeks, Tier 1 once per benchmark window", () => {
    assert.equal(fluencyDue(c, { tier: 2, everyDays: 14, lastCheck: ago(20), tierSince: ago(60) }, NOW).state, "OVERDUE");
    assert.equal(fluencyDue(c, { tier: 2, everyDays: 14, lastCheck: ago(13), tierSince: ago(60) }, NOW).state, "DUE");
    assert.equal(fluencyDue(c, { tier: 2, everyDays: 14, lastCheck: ago(5), tierSince: ago(60) }, NOW).state, "OK");
    assert.equal(fluencyDue(c, { tier: 3, everyDays: 7, lastCheck: ago(9), tierSince: ago(60) }, NOW).state, "OVERDUE");
    const inBoy = new Date(`${c.diagnostic.BOY.opens}T09:00:00Z`);
    assert.equal(fluencyDue(c, { tier: 1, everyDays: 0, lastCheck: null, tierSince: null }, inBoy).state, "DUE");
    assert.equal(fluencyDue(c, { tier: 1, everyDays: 0, lastCheck: null, tierSince: null }, NOW).state, "OVERDUE", "BOY closed less than 30 days ago");
    assert.equal(fluencyDue(c, { tier: 1, everyDays: 0, lastCheck: new Date(`${c.diagnostic.BOY.opens}T10:00:00Z`), tierSince: null }, NOW).state, "OK");
    assert.equal(fluencyDue(c, { tier: 1, everyDays: 0, lastCheck: null, tierSince: null }, new Date("2026-12-01T00:00:00Z")).state, "OK", "between windows");
  });
});

describe("📋 progress checks on the Test School", () => {
  let repo: SqliteRepo; let admin: Actor; let teacher: Actor; let otherTeacher: Actor | null = null; let foreignTeacher: Actor;
  let classId: string; let schoolId: string; let ids: string[];
  let lessons: { id: string; code: string; unit: number }[];
  const actorOf = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);

  /** the student answers the check: `right` = number of items answered correctly (first ones) */
  async function take(checkId: string, studentId: string, right: (q: string, cat: string) => boolean, at: Date) {
    const pc = (await repo.findUnique("ProgressCheck", { id: checkId }))!;
    const a = (await repo.findUnique("Assignment", { id: pc.assignmentId }))!;
    const cats = (typeof pc.categories === "string" ? JSON.parse(pc.categories) : pc.categories) as Record<string, string>;
    const qs = await repo.findMany("Question", { id: { in: Object.keys(cats) } });
    const ses = await repo.create("PracticeSession", { studentId, assignmentId: a.id, assessmentId: a.assessmentId, mode: "TEACHER_QUIZ", startedAt: at, endedAt: at, questionCount: qs.length, correctCount: qs.filter((q) => right(String(q.id), cats[String(q.id)])).length });
    for (const q of qs) await repo.create("QuestionAttempt", { sessionId: ses.id, studentId, questionId: q.id, skillId: q.skillId, response: {}, isCorrect: right(String(q.id), cats[String(q.id)]), responseMs: 9000, difficultyB: 0, createdAt: at });
    await repo.updateMany("AssignmentStudent", { assignmentId: a.id, studentId }, { status: "COMPLETED", completedAt: at, progress: 1 });
  }

  before(async () => {
    ({ repo } = await demoDatabase());
    await seedTestEnvironment(repo, { root: process.cwd(), passwordHash: "x".repeat(60), practice: "none" });
    admin = await actorOf("test.admin");
    schoolId = String(admin.schoolId);
    teacher = await actorOf("test.teacher.1");
    const t1 = (await repo.findUnique("Teacher", { userId: teacher.userId }))!;
    classId = String((await repo.findMany("ClassTeacher", { teacherId: t1.id }))[0].classId);
    ids = (await repo.findMany("ClassMembership", { classId, leftAt: null })).map((m) => String(m.studentId)).sort();
    for (let n = 2; n <= 6; n++) {
      const a = await actorOf(`test.teacher.${n}`);
      const t = (await repo.findUnique("Teacher", { userId: a.userId }))!;
      if (!(await repo.findUnique("ClassTeacher", { classId, teacherId: t.id }))) { otherTeacher = a; break; }
    }
    foreignTeacher = await resolveActor(repo, (await repo.findMany("User", { role: "TEACHER" })).find((u) => u.schoolId !== schoolId)!);
    lessons = (await classTextSets(repo, teacher, classId)).map((t) => ({ id: t.lessonId, code: t.code, unit: t.unit }));
  });

  test("createProgressCheck: lesson skills, this school, published, auto-marked, categories; idempotent; retake = new form", async () => {
    const lesson = lessons.find((l) => l.code.endsWith("U2-TS1")) ?? lessons[3];
    const r = await createProgressCheck(repo, teacher, { classId, lessonId: lesson.id }, NOW);
    assert.equal(r.created, true);
    assert.ok(r.items >= 8 && r.items <= 10, JSON.stringify(r));
    assert.ok(r.byCategory.COMPREHENSION >= 4 && r.byCategory.VOCABULARY >= 1, JSON.stringify(r.byCategory));
    const pc = (await repo.findUnique("ProgressCheck", { id: r.checkId }))!;
    assert.equal(String(pc.schoolId), schoolId);
    const cats = (typeof pc.categories === "string" ? JSON.parse(pc.categories) : pc.categories) as Record<string, string>;
    const qs = await repo.findMany("Question", { id: { in: Object.keys(cats) } });
    const lessonSkills = new Set((await repo.findMany("LessonSkill", { lessonId: lesson.id })).map((l) => String(l.skillId)));
    const skills = new Map((await repo.findMany("Skill", { id: { in: qs.map((q) => String(q.skillId)) } })).map((k) => [String(k.id), k]));
    const types = new Map((await repo.findMany("QuestionType", {})).map((t) => [String(t.id), t]));
    const klass = (await repo.findUnique("Class", { id: classId }))!;
    for (const q of qs) {
      assert.equal(q.status, "PUBLISHED");
      assert.ok(lessonSkills.has(String(q.skillId)) || String(q.lessonId) === lesson.id, "a skill of the lesson (or linked to it)");
      const k = skills.get(String(q.skillId))!;
      const cur = (await repo.findUnique("Curriculum", { id: k.curriculumId }))!;
      assert.equal(String(cur.gradeId), String(klass.gradeId), "the school's own bank, same grade");
      assert.notEqual(types.get(String(q.typeId))!.code, "SHORT_ANSWER");
      if (lessonSkills.has(String(q.skillId))) assert.equal(cats[String(q.id)], skillCategory(k) === "OTHER" ? cats[String(q.id)] : skillCategory(k));
      assert.ok(cats[String(q.id)] === "COMPREHENSION" || cats[String(q.id)] === "VOCABULARY");
    }
    const a = (await repo.findUnique("Assignment", { id: r.assignmentId }))!;
    assert.match(String(a.title), /^Progress Check: /);
    assert.equal(await repo.count("AssignmentStudent", { assignmentId: r.assignmentId }), ids.length);
    // idempotent
    const again = await createProgressCheck(repo, teacher, { classId, lessonId: lesson.id }, NOW);
    assert.deepEqual([again.created, again.checkId], [false, r.checkId]);
    assert.equal(await repo.count("ProgressCheck", { classId, lessonId: lesson.id }), 1);
    // retake: Form B
    const b = await createProgressCheck(repo, teacher, { classId, lessonId: lesson.id, retake: true }, NOW);
    assert.deepEqual([b.created, b.form], [true, "B"]);
    assert.equal(await repo.count("ProgressCheck", { classId, lessonId: lesson.id }), 2);
  });

  test("authorization: other class, other school, admins and other-grade text sets are refused", async () => {
    const lesson = lessons[0];
    if (otherTeacher) await assert.rejects(createProgressCheck(repo, otherTeacher, { classId, lessonId: lesson.id }, NOW), ForbiddenError);
    await assert.rejects(createProgressCheck(repo, foreignTeacher, { classId, lessonId: lesson.id }, NOW), ForbiddenError);
    await assert.rejects(createProgressCheck(repo, admin, { classId, lessonId: lesson.id }, NOW), ForbiddenError);
    await assert.rejects(progressCheckResults(repo, foreignTeacher, classId), ForbiddenError);
    // a text set of another grade of the same school / of another school
    const klass = (await repo.findUnique("Class", { id: classId }))!;
    const otherGrade = (await repo.findMany("Grade", { schoolId })).find((g) => g.id !== klass.gradeId)!;
    const cur = (await repo.findMany("Curriculum", { gradeId: otherGrade.id }))[0];
    const unit = (await repo.findMany("Unit", { curriculumId: cur.id }))[0];
    const foreignLesson = (await repo.findMany("Lesson", { unitId: unit.id }))[0];
    await assert.rejects(createProgressCheck(repo, teacher, { classId, lessonId: String(foreignLesson.id) }, NOW), /not in this class's grade/);
    const demoGrade = (await repo.findMany("Grade", {})).find((g) => g.schoolId !== schoolId)!;
    const dcur = (await repo.findMany("Curriculum", { gradeId: demoGrade.id }))[0];
    const dlesson = (await repo.findMany("Lesson", { unitId: (await repo.findMany("Unit", { curriculumId: dcur.id }))[0].id }))[0];
    await assert.rejects(createProgressCheck(repo, teacher, { classId, lessonId: String(dlesson.id) }, NOW), ForbiddenError);
  });

  test("results: total, Comprehension and Vocabulary subscores, 80% pass, missed skills, reteach links", async () => {
    const lesson = lessons.find((l) => l.code.endsWith("U1-TS1")) ?? lessons[0];
    const r = await createProgressCheck(repo, teacher, { classId, lessonId: lesson.id }, NOW);
    const [s1, s2] = ids;
    await take(r.checkId, s1, () => true, ago(-1));
    await take(r.checkId, s2, (_q, cat) => cat === "COMPREHENSION", ago(-1));
    const res = await progressCheckResults(repo, teacher, classId);
    const ci = res.checks.findIndex((c) => c.id === r.checkId);
    assert.ok(ci >= 0);
    const row1 = res.students.find((x) => x.id === s1)!.cells[ci], row2 = res.students.find((x) => x.id === s2)!.cells[ci];
    assert.deepEqual([row1.pct, row1.comprehension, row1.vocabulary, row1.pass, row1.status], [100, 100, 100, true, "COMPLETED"]);
    const expected = Math.round((100 * r.byCategory.COMPREHENSION) / r.items);
    assert.deepEqual([row2.pct, row2.comprehension, row2.vocabulary], [expected, 100, 0]);
    assert.equal(row2.pass, expected >= 80);
    assert.ok(row2.missedSkills.length >= 1 && row2.missedSkills.every((m) => m.name));
    const third = res.students.find((x) => x.id === ids[2])!.cells[ci];
    assert.deepEqual([third.status, third.pct], ["NOT_STARTED", null]);
    assert.equal(res.checks[ci].completed, 2);
    if (!row2.pass) {
      const re = res.reteach.filter((x) => x.checkId === r.checkId);
      assert.ok(re.length >= 1 && re[0].href.startsWith("/teacher/skill-assign?skillId="));
      assert.ok(re[0].students.some((p) => p.id === s2));
    }
  });

  test("tiers: two progress checks under 60% → Tier 3; two at 80%+ bring a Tier 2 student back to Tier 1", async () => {
    const [l1, l2] = lessons.filter((l) => l.unit === 3).slice(0, 2);
    const c1 = await createProgressCheck(repo, teacher, { classId, lessonId: l1.id }, ago(20));
    const c2 = await createProgressCheck(repo, teacher, { classId, lessonId: l2.id }, ago(10));
    const low = ids[5], high = ids[6];
    await take(c1.checkId, low, () => false, ago(15));
    await take(c2.checkId, low, () => false, ago(5));
    await repo.create("StudentTier", { studentId: high, schoolId, tier: 2, source: "AUTO", locked: false, reason: "x", since: ago(40), monitorEveryDays: 14 });
    await take(c1.checkId, high, () => true, ago(15));
    await take(c2.checkId, high, () => true, ago(5));
    await computeTiers(repo, schoolId, NOW, { studentIds: [low, high], notify: false, route: false });
    const tl = (await repo.findUnique("StudentTier", { studentId: low }))!, th = (await repo.findUnique("StudentTier", { studentId: high }))!;
    assert.equal(Number(tl.tier), 3);
    // Update 39B: a check is read as an ability on the grade scale (all wrong on 10 items → very low)
    assert.match(String(tl.reason), /two checks in a row very low/);
    const ch = (await repo.findMany("TierChange", { studentId: low, source: "AUTO" }))[0];
    const ev = (typeof ch.evidence === "string" ? JSON.parse(ch.evidence) : ch.evidence) as { checks: { kind: string }[] };
    assert.ok(ev.checks.some((c) => c.kind === "PROGRESS"));
    assert.equal(Number(th.tier), 1);
    assert.match(String(th.reason), /Back to Tier 1/);
  });

  test("cycle: admin saves the plan (teachers refused); the teacher strip shows overdue progress checks, fluency by tier and diagnostic", async () => {
    await assert.rejects(saveCycle(repo, teacher, defaultCycle(NOW), NOW), ForbiddenError);
    assert.equal((await loadCycle(repo, schoolId, NOW)).saved, false);
    const plan = defaultCycle(NOW);
    await saveCycle(repo, admin, { ...plan, fluency: { tier1: "BENCHMARK_WINDOWS", tier2Days: 14, tier3Days: 7 } }, NOW);
    assert.equal((await loadCycle(repo, schoolId, NOW)).saved, true);
    // a Tier 2 student whose last fluency check was 20 days ago; a Tier 3 student checked yesterday
    const [f2, f3] = [ids[10], ids[11]];
    await repo.create("StudentTier", { studentId: f2, schoolId, tier: 2, source: "TEACHER", locked: true, reason: "x", since: ago(60), monitorEveryDays: 14 });
    await repo.create("StudentTier", { studentId: f3, schoolId, tier: 3, source: "TEACHER", locked: true, reason: "x", since: ago(60), monitorEveryDays: 7 });
    await repo.create("FluencyCheck", { studentId: f2, wcpm: 80, checkedAt: ago(20), source: "TEACHER" });
    await repo.create("FluencyCheck", { studentId: f3, wcpm: 60, checkedAt: ago(1), source: "TEACHER" });
    // the BOY diagnostic closed 23 days ago; nobody took it
    await repo.create("DiagnosticTest", { schoolId, grade: 4, year: "2026-2027", title: "BOY", assessmentId: "none", status: "CLOSED", period: "BOY", createdAt: new Date("2026-08-30T00:00:00Z") });
    const st = await cycleStatus(repo, teacher, NOW, { classId });
    assert.equal(st.week, 7);
    const c = st.classes.find((x) => x.classId === classId)!;
    const flu = c.overdue.find((i) => i.kind === "FLUENCY")!;
    assert.ok(flu && /Tier 2/.test(flu.detail), JSON.stringify(c.overdue));
    assert.ok(!/Tier 3/.test(flu.detail), "the Tier 3 student checked yesterday is not overdue");
    const prog = c.overdue.filter((i) => i.kind === "PROGRESS");
    const u1ts1 = lessons.find((l) => l.code.endsWith("U1-TS1"))!, u1ts2 = lessons.find((l) => l.code.endsWith("U1-TS2"))!;
    assert.ok(!prog.some((i) => i.href.includes(u1ts1.id)), "a check was given for U1-TS1");
    assert.ok(prog.some((i) => i.href.includes(u1ts2.id)), "U1-TS2 ended weeks ago with no check");
    assert.ok(c.overdue.some((i) => i.kind === "DIAGNOSTIC" && i.students === ids.length));
    assert.ok(!(await cycleStatus(repo, foreignTeacher, NOW)).classes.some((k) => k.classId === classId), "other schools never see this class");
  });

  test("calendar: assessment windows and progress checks due appear as events", async () => {
    const ev = await calendar(repo, teacher, new Date("2026-08-31T00:00:00Z"), 35);
    assert.ok(ev.some((e) => e.kind === "CYCLE" && /Diagnostic BOY/.test(e.title)));
    assert.ok(ev.some((e) => e.kind === "PROGRESS" && /U1-TS2/.test(e.title)));
    assert.ok(!ev.some((e) => e.kind === "PROGRESS" && /U1-TS1/.test(e.title)), "already given");
  });
});
