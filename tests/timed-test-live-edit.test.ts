/**
 * ⏱ LIVE TIME during a TIMED test (owner r69; FAKE data only — the in-memory demo / Test School): while a NAFS test or a
 * MAP test runs, the teacher extends or shortens the time for the class or ONE student, moves the end time or ends it
 * now — and the students' timers follow (the player's poll), the server's own end rule follows (answers after the end
 * hand the test in / finish the sitting), the poll costs no database read while nothing changed, and nothing is added
 * to the student's answer path.
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import type { Repo } from "../src/server/seeding/repo";
import { resolveActor } from "../src/server/auth/actor";
import { ForbiddenError, type Actor } from "../src/server/auth/rbac";
import { ValidationError } from "../src/server/curriculum-admin";
import { teacherRoster } from "../src/server/teacher/assign";
import { ensureNafsFramework } from "../src/server/nafs/framework";
import { nafsBankChanged, saveNafsQuestion } from "../src/server/nafs/bank";
import { assignNafsOnline, changeNafsTime, givenClasses, nafsClasses, saveNafsTest, updateNafsAssignment } from "../src/server/nafs/tests";
import { bookletTime, GRACE_MS, openBooklet, saveBooklet } from "../src/server/nafs/student";
import { bumpLive, cleanShift, effectiveEnd, liveKey, liveStamp, MAX_EXTRA, studentExtra, withStudentExtra } from "../src/server/timing/live-time";
import { seedTestEnvironment } from "../src/server/seeding/test-env";
import { readableClasses } from "../src/server/teacher/coordinators";
import { answerTest, MAP_GRACE_MS, mapTestTime, startTest } from "../src/server/map/sim";
import { loadQuestionItems } from "../src/server/practice/items";
import { changeMapTestTime, createMapTest, testDetail } from "../src/server/map/map-test";
import { cacheSizes } from "../src/server/cache/idle";
import { UI_STRINGS } from "../src/i18n/en";
import { ar } from "../src/i18n/ar";
import { demoDatabase } from "./helpers/db";

const ROOT = process.cwd();
const read = (f: string) => readFileSync(join(ROOT, f), "utf8");
const hasAr = (x: string) => (UI_STRINGS as readonly string[]).includes(x) && Boolean((ar as Record<string, string>)[x]);
const MIN = 60_000;
const at = (d: Date, min: number) => new Date(d.getTime() + min * MIN);

/** Counts the database reads made through the repo (the poll must make none while nothing changed). */
function counting(repo: Repo): { repo: Repo; reads: () => number } {
  let n = 0;
  const p = new Proxy(repo as object, { get(t, k, r) { const v = Reflect.get(t, k, r); if (typeof v === "function" && ["findMany", "findUnique", "findFirst", "count"].includes(String(k))) return (...a: unknown[]) => { n++; return (v as (...x: unknown[]) => unknown).apply(t, a); }; return typeof v === "function" ? (v as (...x: unknown[]) => unknown).bind(t) : v; } });
  return { repo: p as Repo, reads: () => n };
}

describe("the end rule (pure) and the stamps", () => {
  const T0 = new Date("2026-03-01T08:00:00Z");
  test("effectiveEnd: limit from the start, the class's end, the student's own minutes; never before the start", () => {
    assert.equal(effectiveEnd({ startedAt: T0, minutes: 30 })!.toISOString(), at(T0, 30).toISOString());
    assert.equal(effectiveEnd({ startedAt: T0, minutes: 30, extra: 10 })!.toISOString(), at(T0, 40).toISOString());
    assert.equal(effectiveEnd({ startedAt: T0, minutes: 30, extra: -5 })!.toISOString(), at(T0, 25).toISOString());
    assert.equal(effectiveEnd({ startedAt: T0, minutes: 30, endsAt: at(T0, 20) })!.toISOString(), at(T0, 20).toISOString(), "the class's end time comes first");
    assert.equal(effectiveEnd({ startedAt: T0, minutes: 30, endsAt: at(T0, 20), extra: 5 })!.toISOString(), at(T0, 25).toISOString(), "a student's own minutes also move the class end for them");
    assert.equal(effectiveEnd({ startedAt: T0, minutes: 30, extra: -60 })!.toISOString(), T0.toISOString(), "shortened below the start: ends now, never before");
    assert.equal(effectiveEnd({ startedAt: T0, minutes: null }), null, "untimed");
    assert.equal(effectiveEnd({ startedAt: T0, minutes: null, endsAt: at(T0, 50) })!.toISOString(), at(T0, 50).toISOString());
  });
  test("per-student minutes: bounded, 0 removes, bad values ignored; teacher shifts bounded", () => {
    let m = withStudentExtra(null, "s1", 5);
    assert.deepEqual(m, { s1: 5 });
    m = withStudentExtra(m, "s1", 5); assert.equal(studentExtra(m, "s1"), 10);
    m = withStudentExtra(m, "s1", -10); assert.deepEqual(m, {}, "back to 0: the entry goes");
    assert.equal(studentExtra(withStudentExtra({}, "s2", 10_000), "s2"), MAX_EXTRA);
    assert.equal(studentExtra('{"s3": "x"}', "s3"), 0);
    assert.equal(cleanShift(5), 5); assert.equal(cleanShift(-5), -5); assert.equal(cleanShift(0), null); assert.equal(cleanShift(999), null); assert.equal(cleanShift("x"), null);
  });
  test("stamps: bumped on a change, kept in a swept bounded cache", () => {
    const k = liveKey("nafs", "unit-1");
    assert.equal(liveStamp(k), 0);
    const a = bumpLive(k), b = bumpLive(k);
    assert.ok(b > a && liveStamp(k) === b);
    assert.ok(cacheSizes().some((c) => c.name === "live-time"), "registered with the sweeper");
  });
});

describe("NAFS test: the teacher changes the time live", () => {
  let repo: SqliteRepo; let g6: Actor, other: Actor, s1: Actor, s2: Actor;
  let klassId = "", testId = "", gid = "", sid1 = "", sid2 = "";
  const T0 = new Date(Date.now() - 2 * MIN);
  before(async () => {
    ({ repo } = await demoDatabase());
    const as = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);
    const admin = await as("demo.admin");
    const teachers = await Promise.all((await repo.findMany("User", { role: "TEACHER" })).map((u) => resolveActor(repo, u)));
    const grades = await Promise.all(teachers.map(async (a) => (await teacherRoster(repo, a)).map((c) => c.grade)));
    other = teachers[grades.findIndex((g) => g.length > 0 && !g.includes(6))];
    let i = grades.findIndex((g) => g.includes(6));
    if (i < 0) {
      i = teachers.findIndex((a) => a !== other);
      const g = (await repo.findMany("Grade", { schoolId: admin.schoolId, level: 6 }))[0];
      const k = (await repo.findMany("Class", { gradeId: g.id, deletedAt: null }))[0];
      await repo.create("ClassTeacher", { classId: k.id, teacherId: (await repo.findUnique("Teacher", { userId: teachers[i].userId }))!.id });
    }
    g6 = teachers[i];
    const klass = (await nafsClasses(repo, g6))[0];
    klassId = klass.id; sid1 = klass.students[0].id; sid2 = klass.students[1].id;
    const stu = async (id: string) => resolveActor(repo, (await repo.findUnique("User", { id: (await repo.findUnique("Student", { id }))!.userId }))!);
    s1 = await stu(sid1); s2 = await stu(sid2);
    await ensureNafsFramework(repo);
    const ids: string[] = [];
    for (let k = 0; k < 3; k++) ids.push((await saveNafsQuestion(repo, g6, { nafsCode: "NAFS.RC.MAIN", standard: "MOE.S04", difficulty: 2, stem: `Timed question ${k + 1}?`, options: [`a${k}`, `b${k}`, `c${k}`, `d${k}`], correct: 1 })).id);
    nafsBankChanged(repo, g6.schoolId!);
    testId = await saveNafsTest(repo, g6, { title: "Timed NAFS", mode: "MANUAL", questionIds: ids, timeLimitMin: 30 });
    await assignNafsOnline(repo, g6, { testId, classId: klassId });
    gid = String((await repo.findUnique("NafsTestClass", { testId, classId: klassId }))!.id);
  });

  test("the student's timer: 30 minutes from the first opening; the poll is 'same' with no database read while nothing changed", async () => {
    const b = await openBooklet(repo, s1, gid, T0);
    assert.equal(b.endsAt, at(T0, 30).toISOString());
    await openBooklet(repo, s2, gid, T0);
    const c = counting(repo);
    const r = await bookletTime(c.repo, s1, gid, b.stamp);
    assert.deepEqual(r, { same: true });
    assert.equal(c.reads(), 0, "no database read while the teacher changed nothing");
  });

  test("+10 for the class → every timer moves; +5 for ONE student → only theirs; the end time; end now; no end", async () => {
    const before = liveStamp(liveKey("nafs", gid));
    await changeNafsTime(repo, g6, { testId, classId: klassId, shift: 10 });
    assert.ok(liveStamp(liveKey("nafs", gid)) > before, "the stamp moved");
    const r1 = await bookletTime(repo, s1, gid, before, T0);
    assert.ok(!r1.same && r1.endsAt === at(T0, 40).toISOString());
    await changeNafsTime(repo, g6, { testId, classId: klassId, shift: 5, studentId: sid1 });
    const now = liveStamp(liveKey("nafs", gid));
    const a = await bookletTime(repo, s1, gid, 0, T0), c = await bookletTime(repo, s2, gid, 0, T0);
    assert.ok(!a.same && a.endsAt === at(T0, 45).toISOString(), "the student with extra minutes");
    assert.ok(!c.same && c.endsAt === at(T0, 40).toISOString(), "a classmate is unchanged");
    assert.ok(!a.same && a.stamp === now);
    // −5 for the class
    await changeNafsTime(repo, g6, { testId, classId: klassId, shift: -5 });
    assert.equal((await openBooklet(repo, s2, gid, T0)).endsAt, at(T0, 35).toISOString(), "the page shows the live end too");
    // the class's end time (20 minutes after the start): the earlier end wins; the student's own minutes still count
    await changeNafsTime(repo, g6, { testId, classId: klassId, setEnd: true, endsAt: at(T0, 20) });
    const e1 = await bookletTime(repo, s1, gid, 0, T0), e2 = await bookletTime(repo, s2, gid, 0, T0);
    assert.ok(!e1.same && e1.endsAt === at(T0, 25).toISOString());
    assert.ok(!e2.same && e2.endsAt === at(T0, 20).toISOString());
    // no end time again
    await changeNafsTime(repo, g6, { testId, classId: klassId, setEnd: true, endsAt: null });
    const e3 = await bookletTime(repo, s2, gid, 0, T0);
    assert.ok(!e3.same && e3.endsAt === at(T0, 35).toISOString());
    // the teacher's page lists it
    const g = (await givenClasses(repo, g6, testId)).find((x) => x.classId === klassId)!;
    assert.equal(g.minutes, 35); assert.equal(g.endsAt, null);
    assert.deepEqual(g.extra.map((x) => [x.id, x.minutes]), [[sid1, 5]]);
    assert.equal(g.inProgress, 2);
    // the assignment form's time also reaches the timers
    const st = liveStamp(liveKey("nafs", gid));
    await updateNafsAssignment(repo, g6, { testId, classId: klassId, timeLimitMin: 33 });
    assert.ok(liveStamp(liveKey("nafs", gid)) > st);
  });

  test("the server follows the live end: answers after it (+ grace) hand the test in; before it they are kept", async () => {
    await changeNafsTime(repo, g6, { testId, classId: klassId, setEnd: true, endsAt: at(T0, 10) });
    const kept = await saveBooklet(repo, s2, { id: gid, answers: [1, null, null], submit: false }, at(T0, 9));
    assert.equal(kept.done, false);
    const late = await saveBooklet(repo, s2, { id: gid, answers: [1, 1, null], submit: false }, new Date(at(T0, 10).getTime() + GRACE_MS + 1000));
    assert.equal(late.done, true, "after the new end the answers are handed in");
    // the student with +5 is still writing at minute 13
    assert.equal((await saveBooklet(repo, s1, { id: gid, answers: [1, null, null], submit: false }, at(T0, 13))).done, false);
    const done = await bookletTime(repo, s2, gid, -1, at(T0, 12));
    assert.ok(!done.same && done.done);
  });

  test("only the test's teacher (or an admin), only students who have it, sensible minutes", async () => {
    await assert.rejects(changeNafsTime(repo, other, { testId, classId: klassId, shift: 5 }), ForbiddenError);
    await assert.rejects(changeNafsTime(repo, g6, { testId, classId: klassId, shift: 0 }), ValidationError);
    await assert.rejects(changeNafsTime(repo, g6, { testId, classId: klassId, shift: 999 }), ValidationError);
    await assert.rejects(changeNafsTime(repo, g6, { testId, classId: klassId, shift: 5, studentId: "not-a-student" }), ValidationError);
    await assert.rejects(bookletTime(repo, g6, gid, -1), ForbiddenError, "a teacher is not a student");
  });
});

describe("MAP test: a time limit, changed live", () => {
  let repo: SqliteRepo; let teacher: Actor; let me: Actor;
  let classId = "", windowId = "", studentId = "";
  const now = new Date(Date.now() - 5 * MIN);
  before(async () => {
    ({ repo } = await demoDatabase());
    await seedTestEnvironment(repo, { root: process.cwd(), passwordHash: "x".repeat(60), practice: "none" });
    for (const i of [1, 2, 3, 4, 5, 6]) {
      const t = await resolveActor(repo, (await repo.findUnique("User", { username: `test.teacher.${i}` }))!);
      const c = (await readableClasses(repo, t))[0];
      if (!c) continue;
      if (Number((await repo.findUnique("Grade", { id: c.gradeId }))!.level) === 5 && !classId) { teacher = t; classId = String(c.id); }
    }
    studentId = String((await repo.findMany("ClassMembership", { classId, leftAt: null }))[0].studentId);
    me = await resolveActor(repo, (await repo.findUnique("User", { id: (await repo.findUnique("Student", { id: studentId }))!.userId }))!);
    windowId = await createMapTest(repo, teacher, { kind: "AUTO", subject: "READING", classIds: [classId], items: 20, opensAt: new Date(now.getTime() - 86_400_000), closesAt: new Date(now.getTime() + 14 * 86_400_000) }, now);
  });

  test("untimed by default (like MAP Growth); the teacher sets 20 minutes; the player gets the end, the window and the stamp", async () => {
    const d0 = await testDetail(repo, teacher, windowId);
    assert.equal(d0.v.minutes, null);
    await changeMapTestTime(repo, teacher, windowId, { setMinutes: true, minutes: 20 });
    await assert.rejects(changeMapTestTime(repo, teacher, windowId, { setMinutes: true, minutes: 2 }), ValidationError);
    const sc = await startTest(repo, me, { windowId, subject: "READING" }, now);
    assert.equal(sc.timed, true);
    assert.equal(sc.windowId, windowId);
    assert.equal(sc.endsAt, at(now, 20).toISOString());
    const c = counting(repo);
    assert.deepEqual(await mapTestTime(c.repo, me, { sessionId: sc.sessionId, windowId, stamp: sc.stamp }), { same: true });
    assert.equal(c.reads(), 0, "no database read while nothing changed");
  });

  test("+10 for the test, +5 for one student, end in N minutes: the poll brings the new end", async () => {
    const sc0 = await startTest(repo, me, { windowId, subject: "READING" }, now);
    await changeMapTestTime(repo, teacher, windowId, { shift: 10 });
    const p1 = await mapTestTime(repo, me, { sessionId: sc0.sessionId, windowId, stamp: sc0.stamp }, now);
    assert.ok(!p1.same && p1.screen.endsAt === at(now, 30).toISOString());
    assert.ok(!p1.same && p1.screen.question, "the question stays on the screen");
    await changeMapTestTime(repo, teacher, windowId, { shift: 5, studentId });
    const p2 = await mapTestTime(repo, me, { sessionId: sc0.sessionId, windowId, stamp: 0 }, now);
    assert.ok(!p2.same && p2.screen.endsAt === at(now, 35).toISOString());
    assert.deepEqual((await testDetail(repo, teacher, windowId)).extra.map((x) => [x.id, x.minutes]), [[studentId, 5]]);
    await assert.rejects(changeMapTestTime(repo, teacher, windowId, { shift: 5, studentId: "nobody" }), ValidationError);
  });

  test("time up: the clock's 'up' finishes only when the end really passed; an answer after the end finishes the sitting with the answers given", async () => {
    const sc = await startTest(repo, me, { windowId, subject: "READING" }, now);
    const early = await mapTestTime(repo, me, { sessionId: sc.sessionId, windowId, up: true }, at(now, 10));
    assert.ok(!early.same && !early.screen.done, "not before the end");
    // one careful answer, then the teacher ends the test for everyone in 1 minute (the student keeps their +5)
    const [it] = await loadQuestionItems(repo, [sc.question!.questionId]);
    const opt = it.options?.find((o) => o.correct)?.label ?? null;
    const sc2 = await answerTest(repo, me, sc.sessionId, sc.question!.questionId, opt, at(now, 11));
    assert.equal(sc2.done, false);
    await changeMapTestTime(repo, teacher, windowId, { closesAt: at(now, 12) });
    const p = await mapTestTime(repo, me, { sessionId: sc.sessionId, windowId, stamp: 0 }, at(now, 12));
    assert.ok(!p.same && p.screen.endsAt === at(now, 17).toISOString(), "the end date + the student's own 5 minutes");
    const after = await answerTest(repo, me, sc.sessionId, sc2.question!.questionId, opt, new Date(at(now, 17).getTime() + MAP_GRACE_MS + 1000));
    assert.equal(after.done, true, "finished with the answers given");
    assert.ok(after.result && Number.isFinite(after.result.rit));
  });

  test("the pages: the live panel on both test pages, the timer in both players, translated words", () => {
    assert.match(read("src/app/teacher/nafs/tests/[id]/page.tsx"), /<LiveTimePanel /);
    assert.match(read("src/app/teacher/map-center/test-page.tsx"), /<LiveTimePanel /);
    assert.match(read("src/components/nafs/booklet.tsx"), /bookletTimeAction/);
    assert.match(read("src/components/map/test-player.tsx"), /mapTestTimeAction/);
    // nothing added to the answer path: the answer handlers compare times already in memory (no new read)
    const sim = read("src/server/map/sim.ts");
    const ans = sim.slice(sim.indexOf("export async function answerTest"), sim.indexOf("export async function mapTestTime"));
    assert.ok(ans.length > 500);
    assert.doesNotMatch(ans, /liveStamp\(|findUnique\("MapSimWindow"/);
    for (const x of ["Time (live)", "End now", "Set the end", "More time", "Less time", "Your teacher changed the time.", "Your teacher gave you more time.", "Time changed. The students' timers update in a few seconds."]) assert.ok(hasAr(x), x);
  });
});
