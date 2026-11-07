/**
 * 👩‍🏫 Round 6 — ReadRise teacher side like Achieve3000's Teacher Data Center + Grading Center: Class Overview and
 * Dashboard, Level Detail, Activity Tracker (invalid scores flagged, not hidden), Grading Center (points, rubric,
 * badges in RRRun.annotations), class settings, the weekly plan, teacher materials, BR histogram buckets.
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import { ForbiddenError, type Actor } from "../src/server/auth/rbac";
import { seedTestEnvironment } from "../src/server/seeding/test-env";
import { RR_LEVELS } from "../src/server/readrise/level";
import { ensureRRStudent, weekStart } from "../src/server/readrise/engine";
import { finishReading, startRun, submitActivity, submitPostPoll, submitPrePoll, submitWriting } from "../src/server/readrise/student";
import { HIST_BUCKETS, histogram } from "../src/server/readrise/dashboards";
import { ATTENTION_SCORE, activityOf, activityTracker, assessmentOf, classOverview, levelDetail, preTestOf } from "../src/server/readrise/teacher-report";
import {
  TEACHER_BADGES, classSettings, cleanGuide, ensureWeeklyPlan, gradeWriting, gradingStudents, pickWeekly, planByWeek, runMeta, scoreForPoints,
  secondTryScore, setClassSetting, strategyOf, studentWritings, teacherGuide, withRunMeta,
} from "../src/server/readrise/teacher";
import { cleanAnnotations } from "../src/components/readrise/text";
import { afterResponseSettled } from "../src/server/lib/after-response";
import { demoDatabase } from "./helpers/db";

const DAY = 86_400_000;
const T0 = new Date("2026-09-06T08:00:00Z");
const at = (d: number, h = 0) => new Date(T0.getTime() + d * DAY + h * 3_600_000);
const answers = (right: number) => Object.fromEntries(Array.from({ length: 8 }, (_, i) => [String(i + 1), i < right ? "A" : "B"]));
const WRITING = Array.from({ length: 32 }, (_, i) => `word${i}`).join(" ");
const SKILLS = ["cause-effect", "cause-effect", "cause-effect", "vocabulary", "detail", "inference", "central-idea", "detail"];
const careful = () => Object.fromEntries(Array.from({ length: 8 }, (_, i) => [String(i + 1), 20_000 * (i + 1)]));
const rushed = () => Object.fromEntries(Array.from({ length: 8 }, (_, i) => [String(i + 1), 20_000 + 400 * i]));
const ROOT = process.cwd();
const read = (f: string) => readFileSync(join(ROOT, f), "utf8");

describe("👩‍🏫 round 6 — ReadRise teacher data center", () => {
  test("pure: run meta keeps highlights; points → score; badges filtered", () => {
    const hl = [{ start: 0, end: 2, color: "yellow" }];
    const a = withRunMeta(hl, { teacherBadges: ["word-wiz", "Nope"], writingPoints: 20 }) as { marks: unknown[] };
    assert.deepEqual(cleanAnnotations(a.marks, 100), hl, "the reader's highlights are kept (text.ts { marks, …extras })");
    const m = runMeta(withRunMeta(a, { rubric: [3, 2, 9, -1] }));
    assert.deepEqual(m.teacherBadges, ["Word Wiz"]);
    assert.equal(m.writingPoints, 20);
    assert.deepEqual(m.rubric, [3, 2, 3, 0]);
    assert.equal(runMeta({ highlights: [], secondTry: { score: 88 } }).secondTry, 88, "object form (the reader's 2nd try)");
    assert.deepEqual(runMeta({ marks: hl, secondTry: { 2: "A" } }).secondTryAnswers, { 2: "A" });
    assert.equal(secondTryScore({ 1: "A", 2: "B" }, { 2: "A" }, [{ number: 1, answer: "A" }, { number: 2, answer: "A" }]), 100);
    assert.equal(secondTryScore({ 1: "A" }, {}, [{ number: 1, answer: "A" }]), null);
    assert.equal(runMeta(null).secondTry, null);
    assert.deepEqual([scoreForPoints(5), scoreForPoints(10), scoreForPoints(20), scoreForPoints(7)], [2, 3, 4, null]);
    assert.equal(TEACHER_BADGES.length, 5);
  });

  test("pure: histogram has a BR bucket; weekly pick mixes topics; strategy; pre-test; assessments; activity flags; guide", () => {
    assert.equal(HIST_BUCKETS[0], -400);
    const h = histogram([-120, 95, 250, 950, 1700], { low: 900, high: 1000 });
    assert.deepEqual([h[0].label, h[0].count, h[1].label, h[1].count, h[3].count, h[h.length - 1].label, h[h.length - 1].count], ["BR", 1, "0L", 1, 1, "1600L+", 1]); // round 7: bucket labels read with an L (formatLevel)
    assert.equal(h.reduce((n, b) => n + b.count, 0), 5);
    const cands = [{ id: "a", topic: "Science" }, { id: "b", topic: "Science" }, { id: "c", topic: "Space" }, { id: "d", topic: "Sports" }, { id: "e", topic: "Science" }];
    const p = pickWeekly(cands, "c1|2026-11-08");
    assert.equal(p.length, 3);
    assert.equal(new Set(p.map((id) => cands.find((c) => c.id === id)!.topic)).size, 3, "three topics");
    assert.deepEqual(pickWeekly(cands, "c1|2026-11-08"), p, "deterministic");
    assert.equal(pickWeekly(cands.slice(0, 2), "x").length, 2);
    assert.equal(strategyOf([{ band: "MID", skill: "cause-effect" }, { band: "MID", skill: "cause-effect" }, { band: "MID", skill: "detail" }, { band: "LOW", skill: "vocabulary" }]), "Cause/Effect");
    assert.equal(strategyOf([{ band: "LOW", skill: "vocabulary" }]), "Vocabulary Building");
    assert.equal(strategyOf([]), null);
    const pls = [{ result: 700, completedAt: "2026-10-01T08:00:00Z" }, { result: 650, completedAt: "2026-09-02T08:00:00Z" }, { result: 400, completedAt: "2025-03-01T08:00:00Z" }];
    assert.equal(preTestOf(pls, "2026-09-01")?.level, 650, "the year's first placement");
    const as = assessmentOf({ result: 640, period: "BOY", startedAt: "2026-09-02T08:00:00Z", completedAt: "2026-09-02T08:20:00Z", steps: [{ answers: ["A", "B", "C"], ms: 300_000 }, { answers: ["A", "B", "C"], ms: 240_000 }] });
    assert.deepEqual([as.questions, as.seconds, as.result, as.valid], [6, 540, 640, true]);
    const r = activityOf({ id: "r", articleId: "x", versionLevel: 300, score: 50, firstTry: true, stretch: false, completedAt: "2026-09-10T08:00:00Z", readSeconds: 120, answerMs: { ms: { 1: 30_000, 2: 30_000 }, rapid: [3, 4] }, unreliable: false }, "T", true);
    assert.deepEqual([r.minutes, r.invalid, r.kind, r.assigned], [3, true, "5-step", true]);
    assert.equal(activityOf({ id: "s", articleId: "x", versionLevel: 400, score: 80, firstTry: true, stretch: true, completedAt: "2026-09-10T08:00:00Z", readSeconds: 200 }, "T", false).invalid, false);
    assert.equal(cleanGuide({ nothing: 1 }), null);
    assert.deepEqual(cleanGuide({ summary: " S ", keyTerms: [{ term: "habitat", def: "home" }, { def: "x" }], discussion: ["Why?", 3] })?.keyTerms, [{ term: "habitat", def: "home" }]);
    assert.equal(ATTENTION_SCORE, 65);
  });

  test("teacher materials: read from data/readrise/teacher-guides; missing file → null", () => {
    const root = mkdtempSync(join(tmpdir(), "rr6-guides-"));
    mkdirSync(join(root, "data", "readrise", "teacher-guides"), { recursive: true });
    writeFileSync(join(root, "data", "readrise", "teacher-guides", "RR-901.json"), JSON.stringify({ summary: "Bees.", introduce: "Ask about honey.", keyTerms: [{ term: "hive", def: "a bee home" }], challengeTerms: [], discussion: ["Why do bees dance?"], strategy: "Main Idea" }));
    assert.equal(teacherGuide("RR-901", root)?.strategy, "Main Idea");
    assert.equal(teacherGuide("RR-902", root), null);
    assert.equal(teacherGuide("../etc", root), null);
  });

  describe("demo school", () => {
    let repo: SqliteRepo; let admin: Actor; let teacher: Actor | null; let st: Actor[]; let classId: string; let arts: string[];
    const actorOf = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);
    async function makeArticle(code: string, topic: string): Promise<string> {
      const a = await repo.create("RRArticle", { schoolId: null, code, title: `Article ${code}`, topic, summary: "About things.", pollStatement: "Things matter.", status: "PUBLISHED" });
      const id = String(a.id);
      for (const level of RR_LEVELS) await repo.create("RRVersion", { articleId: id, level, title: `${code} (${level})`, body: `Bees ${"make honey ".repeat(150)}`, wordCount: 301, estLevel: level });
      for (const band of ["LOW", "MID", "HIGH"]) for (let n = 1; n <= 8; n++) await repo.create("RRQuestion", { articleId: id, band, number: n, stem: `Q${n}?`, options: ["r", "w", "w", "w"], answer: "A", skill: SKILLS[n - 1] });
      await repo.create("RRPrompt", { articleId: id, band: "MID", prompt: "Why do bees matter?", checklist: [] }).catch(() => null);
      return id;
    }
    async function readOne(s: Actor, articleId: string, right: number, now: Date, times = careful()) {
      const v = await startRun(repo, s, articleId, {}, now);
      await submitPrePoll(repo, s, v.runId, 1, now);
      await finishReading(repo, s, v.runId, { readSeconds: 150 }, now);
      const end = new Date(now.getTime() + 5 * 60_000);
      await submitActivity(repo, s, v.runId, answers(right), end, { at: times });
      // round 6 order (Achieve3000): Respond → Reflect → Write (an older run: Write → Reflect)
      const step = String((await repo.findUnique("RRRun", { id: v.runId }))!.step);
      if (step === "POSTPOLL") { await submitPostPoll(repo, s, v.runId, 2, end); await submitWriting(repo, s, v.runId, WRITING, end); }
      else { await submitWriting(repo, s, v.runId, WRITING, end); await submitPostPoll(repo, s, v.runId, 2, end); }
      return v.runId;
    }

    before(async () => {
      ({ repo } = await demoDatabase());
      await seedTestEnvironment(repo, { root: ROOT, passwordHash: "x".repeat(60), practice: "none" });
      admin = await actorOf("test.admin");
      const A = await actorOf("test.student.001");
      classId = String((await repo.findMany("ClassMembership", { studentId: A.studentId!, leftAt: null }))[0].classId);
      const ids = (await repo.findMany("ClassMembership", { classId, leftAt: null })).map((m) => String(m.studentId));
      st = [];
      for (const id of ids.slice(0, 3)) { const u = await repo.findUnique("Student", { id }); st.push(await resolveActor(repo, (await repo.findUnique("User", { id: u!.userId }))!)); }
      const ct = (await repo.findMany("ClassTeacher", { classId }))[0];
      const tu = ct ? await repo.findUnique("Teacher", { id: ct.teacherId }) : null;
      teacher = tu ? await resolveActor(repo, (await repo.findUnique("User", { id: tu.userId }))!) : null;
      arts = [];
      const topics = ["Science", "Space", "Sports", "History", "Animals", "Health", "Earth", "People", "Science", "Space"];
      for (let i = 0; i < topics.length; i++) arts.push(await makeArticle(`RR-9${String(i).padStart(2, "0")}`, topics[i]));
      for (const s of st) {
        await ensureRRStudent(repo, s.studentId!, at(0));
        await repo.updateMany("RRStudent", { studentId: s.studentId! }, { level: 800, startLevel: 800, source: "PLACEMENT", placedAt: at(0) });
        await repo.create("RRPlacement", { studentId: s.studentId!, schoolId: s.schoolId, startLevel: 800, steps: [{ level: 800, passageId: "p", answers: ["A", "A", "A"], correct: 3, ms: 240_000 }], result: 800, period: "BOY", startedAt: at(0), completedAt: at(0, 1) });
      }
      for (const [i, d] of [18, 19, 20].entries()) await readOne(st[0], arts[i], 8, at(d));
      await readOne(st[1], arts[0], 4, at(2));
      await readOne(st[1], arts[1], 3, at(3));
      await readOne(st[2], arts[0], 0, at(5), rushed());
      await afterResponseSettled();
    });

    test("Class Overview + Dashboard tiles + trends", async () => {
      const o = await classOverview(repo, admin, classId, at(40));
      const a = o.students.find((x) => x.studentId === st[0].studentId)!;
      assert.deepEqual([a.activities, a.avgFirstTry, a.attention, a.preTest], [3, 100, false, 800]);
      assert.ok(a.current! >= 800 && a.growth === a.current! - 800);
      assert.ok(a.band && a.bandLabel && a.expectedEnd! >= a.current! && a.expectedNow! >= 800 && a.initialEnd! > 800);
      const b = o.students.find((x) => x.studentId === st[1].studentId)!;
      assert.equal(b.attention, true, `below 65%: ${b.avgFirstTry}`);
      const c = o.students.find((x) => x.studentId === st[2].studentId)!;
      assert.equal(c.activities, 0, "the unreliable run is not an activity");
      assert.equal(o.tiles.scoreN, 5);
      assert.equal(o.tiles.preTestAvg, 800);
      assert.ok(o.weekly.length === 12 && o.monthly.length >= 1 && o.levelByMonth.some((m) => m.avg !== null));
      assert.equal(o.monthly.reduce((n, m) => n + m.n, 0), 5);
      await assert.rejects(classOverview(repo, st[0], classId, at(40)), ForbiddenError);
    });

    test("Level detail and Activity tracker", async () => {
      const d = await levelDetail(repo, admin, classId, st[0].studentId!, at(40));
      assert.deepEqual([d.goal.activities, d.goal.target, d.goal.targetAvg, d.preTest], [3, 40, 75, 800]);
      assert.equal(d.assessments.length, 1);
      assert.deepEqual([d.assessments[0].questions, d.assessments[0].seconds, d.assessments[0].result], [3, 240, 800]);
      assert.ok(d.forecast && d.chart && d.chart.months.length === d.chart.actual.length && d.chart.initial.some((v) => v !== null));
      assert.ok(d.chart!.meets.min > 0);
      const t = await activityTracker(repo, admin, classId, st[2].studentId!);
      assert.equal(t.rows.length, 1);
      assert.deepEqual([t.rows[0].invalid, t.rows[0].score, t.rows[0].assigned, t.rows[0].kind], [true, 0, false, "5-step"], "shown and flagged, not hidden");
      assert.ok(t.rows[0].minutes! > 2);
    });

    test("Grading Center: students, writings newest first, points + rubric + badges saved; highlights kept", async () => {
      const g = await gradingStudents(repo, admin, classId);
      assert.ok(g.find((x) => x.studentId === st[0].studentId)!.toGrade === 3);
      const w = await studentWritings(repo, admin, classId, st[0].studentId!);
      assert.equal(w.length, 3);
      assert.ok(w[0].submittedAt! > w[2].submittedAt!, "newest first");
      assert.match(w[0].submittedRiyadh!, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
      await repo.updateMany("RRRun", { id: w[0].runId }, { annotations: [{ start: 0, end: 1, color: "yellow" }] });
      await gradeWriting(repo, admin, w[0].runId, { points: 20, rubric: [3, 3, 2, 3], comment: "Great details!", badges: ["Summarizer", "Bogus"] }, at(41));
      const run = await repo.findUnique("RRRun", { id: w[0].runId });
      assert.deepEqual([run!.writingScore, run!.writingComment], [4, "Great details!"]);
      const m = runMeta(run!.annotations);
      assert.deepEqual([m.writingPoints, m.rubric, m.teacherBadges], [20, [3, 3, 2, 3], ["Summarizer"]]);
      assert.deepEqual((run!.annotations as { teacherBadges: string[] }).teacherBadges, ["summarizer"], "stored as points.ts codes");
      assert.equal(cleanAnnotations((run!.annotations as { marks: unknown[] }).marks, 100).length, 1, "the highlight is still there");
      await assert.rejects(gradeWriting(repo, admin, w[1].runId, { points: 7, comment: "" }), /5, 10 or 20/);
      const again = await studentWritings(repo, admin, classId, st[0].studentId!);
      assert.deepEqual([again[0].points, again[0].badges], [20, ["Summarizer"]]);
      await assert.rejects(studentWritings(repo, st[0], classId, st[0].studentId!), ForbiddenError);
    });

    test("class settings + weekly plan: 3 unread articles each Sunday, open 7 days, once per week; By week view", async () => {
      const who = teacher ?? admin;
      assert.deepEqual(await classSettings(repo, classId), { feedOff: false, badgesOff: false, weeklyAuto: false });
      const now = new Date("2026-11-10T09:00:00Z"); // a Tuesday
      assert.deepEqual((await ensureWeeklyPlan(repo, classId, now)).added, [], "off: nothing");
      await setClassSetting(repo, who, classId, "weeklyAuto", true, now);
      await setClassSetting(repo, who, classId, "feedOff", true, now);
      assert.deepEqual(await classSettings(repo, classId), { feedOff: true, badgesOff: false, weeklyAuto: true });
      const r1 = await ensureWeeklyPlan(repo, classId, now);
      assert.equal(r1.added.length, 3);
      const read = new Set(arts.slice(0, 3));
      assert.ok(r1.added.every((id) => !read.has(id)), "never an article the class read");
      const links = await repo.findMany("RRClassArticle", { classId, articleId: { in: r1.added } });
      const ws = weekStart(now);
      assert.ok(links.every((l) => new Date(l.startAt as string).getTime() === ws && new Date(l.dueAt as string).getTime() === ws + 7 * DAY - 60_000));
      assert.deepEqual((await ensureWeeklyPlan(repo, classId, new Date(now.getTime() + DAY))).added, [], "idempotent in the week");
      const r2 = await ensureWeeklyPlan(repo, classId, new Date(now.getTime() + 7 * DAY));
      assert.equal(r2.added.length, 3);
      assert.ok(r2.added.every((id) => !r1.added.includes(id)), "a new week: new articles");
      const weeks = await planByWeek(repo, admin, classId);
      assert.equal(weeks.length, 2);
      assert.ok(weeks[0].week > weeks[1].week, "newest week first");
      assert.ok(weeks.flatMap((w) => w.articles).every((a) => a.auto && a.strategy === "Cause/Effect"), "strategy from the question skills");
      await assert.rejects(setClassSetting(repo, st[0], classId, "badgesOff", true), ForbiddenError);
    });

    test("pages: the overview/dashboard/plan tabs, the student views, the Grading Center, materials, settings", () => {
      const page = read("src/app/teacher/readrise/page.tsx");
      for (const k of ['key: "overview"', 'key: "dashboard"', 'key: "plan"', "<ClassSettingsCard", "LevelDetailView", "ActivityTrackerView", "ensureWeeklyPlan(repo, klass.id)"]) assert.ok(page.includes(k), k);
      const dc = read("src/app/teacher/readrise/_components/data-center.tsx");
      for (const k of ['t("Attention! below 65%")', 't("One or more activity scores may be invalid")', 'data-testid="rr-invalid"', 't("Expected end-of-year level")', 'title="Class level progress by month"', "formatLevel"]) assert.ok(dc.includes(k), k);
      assert.doesNotMatch(dc, /Lexile/, "the interface never says Lexile");
      const grading = read("src/app/teacher/readrise/grading/page.tsx");
      for (const k of ["WRITING_RUBRIC", "TEACHER_BADGES", "WRITING_POINTS", 't("Teacher Feedback")', "gradeReadRiseWritingAction"]) assert.ok(grading.includes(k), k);
      assert.match(read("src/app/teacher/readrise/library/[articleId]/page.tsx"), /\{guide && <TeacherMaterials/);
      assert.match(read("src/app/admin/readrise/dashboard/page.tsx"), /<LevelBars/);
    });
  });
});
