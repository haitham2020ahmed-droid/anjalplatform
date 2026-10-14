/**
 * 📘 Learn — automatic lessons ONLY for clear, strong problems (owner addition 3). FAKE data only (in-memory demo
 * school): each trigger (≥ 10 careful answers ≤ 40 %, 2 drops in a row, Urgent + weakest skill), each guard (rapid
 * guesses not counted, 1 per student per week, not the same lesson within 14 days, never after the teacher dismissed
 * it), the school and class switches, ONE bell notice per scan, the teacher's panel (Keep / Undo before the student
 * starts / Change lesson or level), the reason text, inside the alert scan, and no level words for the student.
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { demoDatabase, ROOT } from "./helpers/db";
import { resolveActor } from "../src/server/auth/actor";
import type { Actor } from "../src/server/auth/rbac";
import { ForbiddenError } from "../src/server/auth/rbac";
import { LEVEL_WORDS } from "../src/lib/learn/format";
import { lessonCatalog, useLearnDir } from "../src/server/learn/files";
import { resetLearnEnsure } from "../src/server/learn/load";
import { learnSkills, matchSkills } from "../src/server/learn/match";
import { openLesson, studentLearnHome } from "../src/server/learn/student";
import { extraWorkItems } from "../src/server/student/all-work";
import { scanAlerts } from "../src/server/insights/alerts";
import { AUTO_BY, autoLearnScan, autoPanel, changeAuto, keepAuto, setAutoSwitch, undoAuto } from "../src/server/learn/auto";
import {
  AUTO_DROP_STEP, AUTO_MAX_ACCURACY, AUTO_MIN_ANSWERS, AUTO_PER_STUDENT, AUTO_REPEAT_DAYS, AUTO_STUDENT_DAYS, AUTO_WINDOW_DAYS,
  detectProblems, reasonText, skillStats, type Answer,
} from "../src/server/learn/auto-rules";
import { UI_STRINGS } from "../src/i18n/en";

const DAY = 86_400_000;
const T0 = new Date("2026-10-13T08:00:00Z").getTime();
const at = (days: number) => new Date(T0 + days * DAY);
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

describe("automatic lessons: the rules (pure)", () => {
  const ans = (skillId: string, list: [number, boolean][]): Answer[] => list.map(([d, correct]) => ({ skillId, correct, at: T0 - d * DAY }));
  const many = (n: number, right: number, daysAgo = 2): [number, boolean][] => Array.from({ length: n }, (_, i) => [daysAgo, i < right]);

  test("thresholds are named constants with the owner's values", () => {
    assert.deepEqual([AUTO_MIN_ANSWERS, AUTO_MAX_ACCURACY, AUTO_WINDOW_DAYS, AUTO_REPEAT_DAYS, AUTO_PER_STUDENT, AUTO_STUDENT_DAYS], [10, 40, 21, 14, 1, 7]);
  });

  test("ACCURACY: ≥ 10 careful answers in 21 days with ≤ 40 % → a clear problem; 9 answers, 50 % or older answers → not", () => {
    assert.deepEqual(detectProblems(skillStats(ans("k", many(14, 4)), T0), false).map((c) => [c.skillId, c.trigger]), [["k", "ACCURACY"]]);
    assert.equal(detectProblems(skillStats(ans("k", many(9, 0)), T0), false).length, 0, "too few answers");
    assert.equal(detectProblems(skillStats(ans("k", many(10, 5)), T0), false).length, 0, "50 %");
    assert.equal(detectProblems(skillStats(ans("k", many(14, 0, 25)), T0), false).length, 0, "older than 21 days");
    // the weakest first
    const two = detectProblems(skillStats([...ans("a", many(10, 4)), ...ans("b", many(10, 1))], T0), false);
    assert.deepEqual(two.map((c) => c.skillId), ["b", "a"]);
  });

  test("DROPS: the weekly accuracy fell 2 weeks in a row (≥ 10 points each, last week ≤ 60 %)", () => {
    const wk = (d: number, n: number, right: number): [number, boolean][] => Array.from({ length: n }, (_, i) => [d, i < right]);
    const drop = [...wk(16, 5, 4), ...wk(9, 5, 3), ...wk(2, 5, 2)]; // 80 → 60 → 40
    const c = detectProblems(skillStats(ans("k", drop), T0), false);
    assert.deepEqual(c.map((x) => x.trigger), ["DROPS"]);
    assert.deepEqual(c[0].evidence, { kind: "DROPS", weeks: [80, 60, 40], answers: [5, 5, 5] });
    assert.equal(detectProblems(skillStats(ans("k", [...wk(16, 5, 4), ...wk(9, 5, 4), ...wk(2, 5, 2)]), T0), false).length, 0, "one fall only");
    assert.equal(detectProblems(skillStats(ans("k", [...wk(16, 5, 5), ...wk(9, 5, 4), ...wk(2, 4, 3)]), T0), false).length, 0, "ends at 75 %: no real problem");
    assert.equal(detectProblems(skillStats(ans("k", [...wk(16, 3, 3), ...wk(9, 5, 3), ...wk(2, 5, 1)]), T0), false).length, 0, "too few answers in a week");
    assert.ok(AUTO_DROP_STEP >= 10);
  });

  test("URGENT: only for an Urgent student, only their clearly weakest skill", () => {
    const list = [...ans("a", many(6, 2)), ...ans("b", many(6, 3))];
    assert.equal(detectProblems(skillStats(list, T0), false).length, 0);
    assert.deepEqual(detectProblems(skillStats(list, T0), true).map((c) => [c.skillId, c.trigger]), [["a", "URGENT"]]);
    assert.equal(detectProblems(skillStats(ans("a", many(6, 4)), T0), true).length, 0, "67 % is not a clear problem");
  });

  test("the reason in plain words (and its template is a translated interface string)", () => {
    assert.equal(reasonText({ kind: "ACCURACY", correct: 4, total: 14, days: 21 }, "Main idea"), "4 of 14 correct on Main idea in the last 3 weeks");
    assert.equal(reasonText({ kind: "DROPS", weeks: [80, 60, 40], answers: [5, 5, 5] }, "Main idea"), "Main idea fell two weeks in a row: 80% → 60% → 40%");
    assert.match(reasonText({ kind: "URGENT", correct: 2, total: 6, days: 21 }, "Main idea"), /^Early warning: urgent\. Weakest skill: Main idea \(2 of 6 correct/);
    const ui = new Set<string>(UI_STRINGS);
    for (const k of ["{c} of {n} correct on {skill} in the last 3 weeks", "{skill} fell two weeks in a row: {weeks}", "Early warning: urgent. Weakest skill: {skill} ({c} of {n} correct in the last 3 weeks)", "Sent automatically", "Sent “{title}” to {names} ({n} students)", "Change lesson or level", "Keep", "Undo"]) assert.ok(ui.has(k), k);
    const ar = read("src/i18n/ar.ts");
    assert.match(ar, /"Sent automatically": "أُرسل تلقائيًا"/);
  });
});

describe("automatic lessons in a school (demo data)", () => {
  let repo: SqliteRepo;
  let schoolId = "", class4a = "", class4b = "", skillId = "", skillName = "", dir = "";
  let admin: Actor, t4a: Actor, t4b: Actor;
  let m4a: string[] = [], m4b: string[] = [];
  let t4aUser = "";
  const actorFor = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);
  const studentActor = async (sid: string) => resolveActor(repo, (await repo.findUnique("User", { id: String((await repo.findUnique("Student", { id: sid }))!.userId) }))!);
  const sessions = new Map<string, string>();
  let questionId = "";
  const sessionOf = async (sid: string) => { if (!sessions.has(sid)) sessions.set(sid, String((await repo.create("PracticeSession", { studentId: sid, skillId: null, mode: "ADAPTIVE_PRACTICE", startedAt: new Date(T0 - 40 * DAY) })).id)); return sessions.get(sid)!; };
  /** careful (or rapid) answers of one student on the lesson's skill, `daysAgo` before `base` */
  const answer = async (sid: string, n: number, right: number, daysAgo: number, base = T0, rapid = false) => {
    const sessionId = await sessionOf(sid);
    await repo.createMany("QuestionAttempt", Array.from({ length: n }, (_, i) => ({ sessionId, studentId: sid, questionId, skillId, response: {}, isCorrect: i < right, responseMs: rapid ? 900 : 20_000, rapidGuess: rapid, difficultyB: 0, createdAt: new Date(base - daysAgo * DAY - i * 60_000) })));
  };
  const autosOf = (sid: string) => repo.findMany("LearnAuto", { studentId: sid });
  const bells = async () => (await repo.findMany("Notification", { userId: t4aUser })).filter((n) => String(n.title).startsWith("📘"));

  before(async () => {
    dir = mkdtempSync(join(tmpdir(), "learn-auto-"));
    mkdirSync(join(dir, "lessons")); mkdirSync(join(dir, "words"));
    cpSync(join(ROOT, "data/learn/topics.json"), join(dir, "topics.json"));
    cpSync(join(ROOT, "data/learn/continuum.json"), join(dir, "continuum.json"));
    const sample = JSON.parse(read("data/learn/lessons/LN-000.json"));
    cpSync(join(ROOT, "data/learn/lessons/LN-000.json"), join(dir, "lessons/LN-000.json"));
    writeFileSync(join(dir, "lessons/LN-001.json"), JSON.stringify({ ...sample, code: "LN-001", title: "Main idea (second look)", families: [], skillNames: [], standards: ["W.9.9"] }));
    useLearnDir(dir);
    resetLearnEnsure();
    ({ repo } = await demoDatabase());
    admin = await actorFor("demo.admin");
    t4a = await actorFor("demo.teacher.4a");
    t4b = await actorFor("demo.teacher.4b");
    t4aUser = t4a.userId;
    schoolId = String(admin.schoolId);
    const classes = await repo.findMany("Class", { schoolId });
    class4a = String(classes.find((c) => c.name === "DEMO 4A")!.id);
    class4b = String(classes.find((c) => c.name === "DEMO 4B")!.id);
    // fake extra students (the demo classes have 3 each)
    const grade4 = String(classes.find((c) => c.id === class4a)!.gradeId);
    for (const [cid, tag] of [[class4a, "A"], [class4b, "B"]] as const) {
      for (let i = 0; i < 4; i++) {
        const u = await repo.create("User", { username: `auto.${tag}${i}`, displayName: `Auto ${tag}${i}`, role: "STUDENT", schoolId, isActive: true });
        const st = await repo.create("Student", { userId: u.id, schoolId, gradeId: grade4, studentNumber: `AUTO-${tag}${i}` });
        await repo.create("ClassMembership", { classId: cid, studentId: st.id, joinedAt: new Date(T0 - 60 * DAY), leftAt: null });
      }
    }
    m4a = (await repo.findMany("ClassMembership", { classId: class4a })).map((m) => String(m.studentId)).sort();
    m4b = (await repo.findMany("ClassMembership", { classId: class4b })).map((m) => String(m.studentId)).sort();
    assert.ok(m4a.length >= 6 && m4b.length >= 3, `DEMO 4A has ${m4a.length} students`);
    // no seeded answers: every answer in this school is the test's
    await repo.deleteMany("QuestionAttempt", {});
    const skills = await learnSkills(repo, schoolId);
    const m = matchSkills(skills, lessonCatalog().filter((l) => l.ready));
    const k = skills.find((x) => x.grade === 4 && m.get(x.id)?.codes[0] === "LN-000" && ["NAME", "FAMILY"].includes(m.get(x.id)!.rule));
    assert.ok(k, "a Grade 4 central-idea skill");
    skillId = k!.id; skillName = k!.name;
    questionId = String((await repo.findMany("Question", {}, { select: ["id"], take: 1 }))[0].id);
  });
  after(() => { useLearnDir(null); rmSync(dir, { recursive: true, force: true }); });

  test("ACCURACY: sent as an ordinary assigned lesson (level chosen as usual) + ONE bell notice; rapid guesses never count", async () => {
    const [a, b] = m4a;
    await answer(a, 14, 4, 3);
    await answer(a, 10, 10, 3, T0, true); // rapid guesses (all "correct") are not counted
    await answer(b, 9, 0, 3);
    await answer(b, 12, 0, 3, T0, true); // 9 careful + 12 rapid: not enough careful answers
    const before = (await bells()).length;
    const n = await autoLearnScan(repo, schoolId, at(0));
    assert.equal(n, 1);
    const [row] = await autosOf(a);
    assert.equal(row.trigger, "ACCURACY");
    assert.equal(row.ref, "LN-000");
    assert.equal(row.reason, `4 of 14 correct on ${skillName} in the last 3 weeks`);
    assert.deepEqual(typeof row.evidence === "string" ? JSON.parse(row.evidence) : row.evidence, { kind: "ACCURACY", correct: 4, total: 14, days: 21 });
    assert.equal(row.status, "SENT");
    assert.equal((await autosOf(b)).length, 0, "rapid guesses excluded");
    const asg = await repo.findUnique("LearnAssign", { id: row.assignId });
    assert.equal(asg!.createdById, AUTO_BY); assert.equal(asg!.target, "STUDENTS"); assert.equal(asg!.level, null);
    const who = await repo.findMany("LearnAssignee", { assignId: row.assignId });
    assert.deepEqual(who.map((x) => [x.studentId, x.status, x.level]), [[a, "NOT_STARTED", null]]);
    const bell = (await bells()).slice(before);
    assert.equal(bell.length, 1, "one bell notice for the class teacher");
    assert.equal(bell[0].link, "/teacher/learn");
    assert.match(String(bell[0].title), /1 student$/);
    // a second scan the same day: nothing new, no second notice
    assert.equal(await autoLearnScan(repo, schoolId, at(0.2)), 0);
    assert.equal((await bells()).length, before + 1, "no spam");
  });

  test("the student sees an ordinary assigned lesson in Learn and My Work: no level, no level word, no 'weak'", async () => {
    const st = await studentActor(m4a[0]);
    const home = await studentLearnHome(repo, st);
    const item = home.forYou.find((x) => x.code === "LN-000");
    assert.ok(item?.assigned, "assigned");
    const work = (await extraWorkItems(repo, st, at(0))).filter((r) => r.kind === "LEARN");
    assert.equal(work.length, 1);
    assert.match(work[0].skill, /^Learn — Main idea$/);
    const shown = JSON.stringify({ item, work });
    assert.doesNotMatch(shown, LEVEL_WORDS);
    assert.doesNotMatch(shown, /weak|automatic|struggl|"level"/i);
  });

  test("the teacher's panel: the item with students, reason and evidence; another class's teacher does not see it", async () => {
    const p = await autoPanel(repo, t4a, at(0));
    const it = p.items.find((x) => x.ref === "LN-000")!;
    assert.ok(it);
    assert.equal(it.className, "DEMO 4A");
    assert.equal(it.open, 1);
    assert.deepEqual(it.students.map((x) => [x.studentId, x.reason.key, x.reason.vars.c, x.reason.vars.n, x.started]), [[m4a[0], "{c} of {n} correct on {skill} in the last 3 weeks", 4, 14, false]]);
    assert.equal(p.school, true, "on by default");
    assert.ok(p.classes.some((c) => c.id === class4a && c.on));
    assert.equal((await autoPanel(repo, t4b, at(0))).items.length, 0);
    assert.equal((await autoPanel(repo, admin, at(0))).items.length, 1, "the admin sees the school");
    await assert.rejects(keepAuto(repo, t4b, [it.students[0].id]), ForbiddenError);
    assert.equal(await keepAuto(repo, t4a, [it.students[0].id]), 1);
    assert.equal((await autosOf(m4a[0]))[0].status, "KEPT");
    // the page shows the panel at the top
    const page = read("src/app/teacher/learn/page.tsx");
    assert.match(page, /<Flash msg=\{sp\.msg\} err=\{sp\.err\} \/>\n\s*<AutoPanel v=\{auto\} \/>/);
  });

  test("guard: at most 1 automatic lesson per student per week", async () => {
    const c = m4a[2];
    await repo.create("LearnAuto", { schoolId, studentId: c, classId: class4a, skillId: "x", skillName: "Other", ref: "LN-001", title: "x", trigger: "ACCURACY", reason: "x", evidence: {}, assignId: "x", status: "KEPT", scanAt: at(-3), createdAt: at(-3) });
    await answer(c, 12, 2, 2);
    assert.equal(await autoLearnScan(repo, schoolId, at(0.3)), 0, "one 3 days ago");
    assert.equal((await autosOf(c)).length, 1);
    // a week later (the same answers still in the window)
    assert.equal(await autoLearnScan(repo, schoolId, at(5)), 1);
    assert.deepEqual((await autosOf(c)).map((r) => r.ref).sort(), ["LN-000", "LN-001"]);
  });

  test("guard: not the same lesson within 14 days (assigned or worked on)", async () => {
    const d = m4a[3], e = m4a[4];
    await repo.create("LearnProgress", { schoolId, studentId: d, kind: "LESSON", ref: "LN-000", level: 2, openedAt: at(-5), updatedAt: at(-5), attempts: 1, seconds: 60, neededAgain: false });
    await repo.create("LearnAssignee", { assignId: "old", schoolId, studentId: e, kind: "LESSON", ref: "LN-000", title: "Main idea", status: "DONE", createdAt: at(-20), updatedAt: at(-20) });
    await repo.create("LearnProgress", { schoolId, studentId: e, kind: "LESSON", ref: "LN-000", level: 2, openedAt: at(-20), updatedAt: at(-20), finishedAt: at(-20), attempts: 1, seconds: 60, neededAgain: false });
    await answer(d, 12, 2, 2, T0 + 6 * DAY); await answer(e, 12, 2, 2, T0 + 6 * DAY);
    await autoLearnScan(repo, schoolId, at(6));
    assert.equal((await autosOf(d)).length, 0, "worked on it 11 days ago");
    assert.equal((await autosOf(e)).length, 1, "20 days ago is fine");
  });

  test("DROPS trigger and URGENT trigger (the Early warning's Urgent students, their weakest skill)", async () => {
    const f = m4a[5];
    const base = T0 + 7 * DAY;
    await answer(f, 5, 4, 16, base); await answer(f, 5, 3, 9, base); await answer(f, 5, 2, 2, base); // 80 → 60 → 40 (9 of 15 = 60 %: not ACCURACY)
    await autoLearnScan(repo, schoolId, new Date(base));
    const [row] = await autosOf(f);
    assert.equal(row.trigger, "DROPS");
    assert.equal(row.reason, `${skillName} fell two weeks in a row: 80% → 60% → 40%`);
    const g = m4b[0];
    const base2 = T0 + 8 * DAY;
    await answer(g, 6, 2, 1, base2);
    assert.equal(await autoLearnScan(repo, schoolId, new Date(base2)), 0, "not Urgent: 6 answers is no clear problem");
    assert.equal(await autoLearnScan(repo, schoolId, new Date(base2), new Set([g])), 1);
    const [u] = await autosOf(g);
    assert.equal(u.trigger, "URGENT");
    assert.match(String(u.reason), /^Early warning: urgent\. Weakest skill: .+ \(2 of 6 correct in the last 3 weeks\)$/);
  });

  test("Undo before the student starts (never sent again); a started lesson cannot be undone", async () => {
    const [a] = await autosOf(m4a[3 + 1]); // e: sent, not started
    const r = await undoAuto(repo, t4a, [String(a.id)], at(6));
    assert.deepEqual(r, { undone: 1, started: 0 });
    assert.equal((await repo.findMany("LearnAssignee", { assignId: a.assignId, studentId: m4a[4] })).length, 0, "removed from the student");
    assert.equal((await autosOf(m4a[4]))[0].status, "UNDONE");
    assert.equal((await repo.findUnique("LearnAssign", { id: a.assignId }))!.deletedAt !== null, true, "the empty assignment is closed");
    // started: the DROPS student opens the lesson
    const [f] = await autosOf(m4a[5]);
    await openLesson(repo, await studentActor(m4a[5]), "LN-000", at(7));
    assert.deepEqual(await undoAuto(repo, t4a, [String(f.id)], at(7)), { undone: 0, started: 1 });
    // never again after the teacher dismissed it (answers still weak, weeks later)
    await answer(m4a[4], 12, 1, 1, T0 + 16 * DAY);
    await autoLearnScan(repo, schoolId, at(16));
    assert.deepEqual((await autosOf(m4a[4])).map((x) => x.status), ["UNDONE"]);
  });

  test("Change lesson or level: the same lesson → its level; another lesson → assigned instead", async () => {
    const [g] = await autosOf(m4b[0]);
    await assert.rejects(changeAuto(repo, t4a, [String(g.id)], "LN-000", 3), ForbiddenError);
    const r1 = await changeAuto(repo, t4b, [String(g.id)], "LN-000", 3, at(8));
    assert.deepEqual(r1, { changed: 1, started: 0 });
    assert.equal((await repo.findMany("LearnAssignee", { assignId: g.assignId, studentId: m4b[0] }))[0].level, 3);
    const r2 = await changeAuto(repo, t4b, [String(g.id)], "LN-001", null, at(8));
    assert.equal(r2.changed, 1);
    const rows = await repo.findMany("LearnAssignee", { studentId: m4b[0], kind: "LESSON" });
    assert.deepEqual(rows.map((x) => x.ref), ["LN-001"]);
    assert.equal((await autosOf(m4b[0]))[0].status, "CHANGED");
  });

  test("switches: the admin's school switch (on by default) and each class's switch", async () => {
    await assert.rejects(setAutoSwitch(repo, t4a, null, false), ForbiddenError);
    await assert.rejects(setAutoSwitch(repo, t4b, class4a, false), ForbiddenError);
    const h = m4b[1], i = m4a[1];
    await answer(h, 12, 1, 1, T0 + 30 * DAY); await answer(i, 12, 1, 1, T0 + 30 * DAY);
    await setAutoSwitch(repo, admin, null, false);
    assert.equal(await autoLearnScan(repo, schoolId, at(30)), 0, "school off");
    assert.equal((await autoPanel(repo, t4a, at(30))).school, false);
    await setAutoSwitch(repo, admin, null, true);
    await setAutoSwitch(repo, t4a, class4a, false);
    assert.equal((await autoPanel(repo, t4a, at(30))).classes.find((c) => c.id === class4a)!.on, false);
    await autoLearnScan(repo, schoolId, at(30));
    assert.equal((await autosOf(i)).length, 0, "4A switched off");
    assert.equal((await autosOf(h)).length, 1, "4B still on");
    await setAutoSwitch(repo, t4a, class4a, true);
  });

  test("runs inside the 3-hourly alert scan", async () => {
    const j = m4b[2];
    await answer(j, 12, 1, 1, T0 + 40 * DAY);
    await scanAlerts(repo, schoolId, at(40), true);
    assert.equal((await autosOf(j)).length, 1);
    const src = read("src/server/insights/alerts.ts");
    assert.match(src, /autoLearnScan\(repo, schoolId, now, new Set\(found\.filter\(\(f\) => f\.kind === EW_KIND\)/);
  });
});
