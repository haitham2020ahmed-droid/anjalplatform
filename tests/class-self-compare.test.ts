/**
 * 📈 Fair comparisons (owner r67 points 7–10) — demo school in memory, never a real database:
 *   the class compared with ITSELF month over month (never ranked against other teachers' classes);
 *   a student against classmates (position + growth, "weak but growing fast" / "strong but flat") — TEACHERS ONLY;
 *   the teacher's week in two lines; the student sees only their own month — students and parents never see ranks.
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { demoDatabase } from "./helpers/db";
import { resolveActor } from "../src/server/auth/actor";
import { ForbiddenError, type Actor } from "../src/server/auth/rbac";
import { classMonth, monthCompare, monthLines, myMonth, myMonthMessage, peerCompare, peerRows, studentPeer, weeklySummary } from "../src/server/insights/class-compare";

const ROOT = process.cwd();
const read = (f: string) => readFileSync(join(ROOT, f), "utf8");
const s = (v: unknown) => String(v ?? "");
const DAY = 86_400_000;
const NOW = new Date(Date.UTC(2026, 9, 13, 8));
const ago = (d: number) => new Date(NOW.getTime() - d * DAY);
const files = (dir: string): string[] => readdirSync(join(ROOT, dir)).flatMap((f) => { const p = join(dir, f); return statSync(join(ROOT, p)).isDirectory() ? files(p) : /\.tsx?$/.test(f) ? [p] : []; });

describe("📈 the class against itself (pure)", () => {
  test("this month against last month: stars, effort, time, skills improved and still weak", () => {
    const names = new Map([["k1", "Inference"], ["k2", "Theme"]]);
    const answers = (skillId: string, n: number, ok: number, d: number) => Array.from({ length: n }, (_, i) => ({ studentId: `s${i % 3}`, skillId, isCorrect: i < ok, createdAt: ago(d) }));
    const m = monthCompare({
      ids: ["s0", "s1", "s2"], skillNames: names, now: NOW,
      attempts: [...answers("k1", 10, 4, 40), ...answers("k1", 10, 8, 5), ...answers("k2", 10, 4, 40), ...answers("k2", 10, 4, 5)],
      stars: [{ masteredAt: ago(3) }, { masteredAt: ago(10) }, { masteredAt: ago(45) }],
      sessions: [{ activeMs: 30 * 60_000, startedAt: ago(5) }, { activeMs: 10 * 60_000, startedAt: ago(40) }],
    });
    assert.deepEqual([m.thisMonth.newStars, m.lastMonth.newStars], [2, 1]);
    assert.deepEqual([m.thisMonth.minutes, m.lastMonth.minutes], [30, 10]);
    assert.deepEqual([m.thisMonth.answers, m.thisMonth.accuracy], [20, 60]);
    assert.deepEqual(m.improved.map((k) => [k.name, k.from, k.to]), [["Inference", 40, 80]]);
    assert.deepEqual(m.weak.map((k) => [k.name, k.accuracy, k.stillWeak]), [["Theme", 40, true]]);
    assert.deepEqual(monthLines(m), [
      "2 new stars this month (up from 1).", "Improved most: Inference (40% → 80%).", "Still to work on: Theme (40% correct).", "Practice: 30 minutes by 3 students (last month 10 minutes by 3).",
    ]);
  });

  test("a student against classmates: position, growth, encourage / challenge", () => {
    const students = ["a", "b", "c", "d", "e"].map((id) => ({ id, name: id.toUpperCase() }));
    const mastery = [["a", 30], ["b", 50], ["c", 60], ["d", 70], ["e", 90]].map(([id, score]) => ({ studentId: id, score, attempts: 10 }));
    const stars = [...Array(3).fill({ studentId: "a", masteredAt: ago(2) }), { studentId: "b", masteredAt: ago(2) }];
    const attempts = ["a", "b", "c", "d", "e"].flatMap((id) => Array.from({ length: 6 }, (_, i) => ({ studentId: id, isCorrect: i < 3, createdAt: ago(3) })));
    const r = peerRows({ students, mastery, stars, attempts, now: NOW });
    const row = (id: string) => r.rows.find((x) => x.studentId === id)!;
    assert.equal(r.middle, 60);
    assert.deepEqual([row("a").position, row("c").position, row("e").position], ["below", "around", "above"]);
    assert.equal(row("a").fasterThan, 100, "the most new stars of the class");
    assert.equal(row("a").sentence, "A is below the class middle and progressing faster than 100% of classmates this month ↑.");
    assert.deepEqual(r.encourage.map((x) => x.studentId), ["a", "b"], "weak but growing fast (most growth first)");
    assert.deepEqual(r.challenge.map((x) => x.studentId), ["e", "d"], "strong but flat (strongest first)");
  });

  test("the student's own month: encouraging, own numbers only", () => {
    assert.equal(myMonthMessage(4, 2), "This month you mastered 4 skills — more than last month 🎉");
    assert.equal(myMonthMessage(1, 0), "This month you mastered 1 skill — more than last month 🎉");
    assert.match(myMonthMessage(2, 5), /Keep practising to beat last month's 5/);
    assert.match(myMonthMessage(0, 3), /earn your first star/);
  });
});

describe("📈 on the demo school: never across classes, never to students or parents", () => {
  let repo: SqliteRepo; let teacher: Actor; let other: Actor; let admin: Actor; let student: Actor; let parent: Actor | null = null;
  let classId = ""; let otherClass = ""; let sid = "";
  before(async () => {
    ({ repo } = await demoDatabase({ classesPerGrade: 2, studentsPerClass: 4 }));
    const as = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);
    admin = await as("demo.admin"); teacher = await as("demo.teacher.4a"); other = await as("demo.teacher.4b");
    const cls = async (a: Actor) => s((await repo.findMany("ClassTeacher", { teacherId: (await repo.findUnique("Teacher", { userId: a.userId }))!.id }))[0].classId);
    classId = await cls(teacher); otherClass = await cls(other);
    sid = s((await repo.findMany("ClassMembership", { classId }))[0].studentId);
    student = await resolveActor(repo, (await repo.findUnique("User", { id: (await repo.findUnique("Student", { id: sid }))!.userId }))!);
    const link = (await repo.findMany("ParentStudent", { studentId: sid }))[0];
    if (link) parent = await resolveActor(repo, (await repo.findUnique("User", { id: (await repo.findUnique("Parent", { id: link.parentId }))!.userId }))!);
    const skill = (await repo.findMany("Skill", {}, { take: 1 }))[0];
    await repo.create("StudentSkillMastery", { studentId: sid, skillId: skill.id, score: 95, attempts: 20, correct: 19, isMastered: true, masteredAt: new Date(), updatedAt: new Date() });
    // the other class does much better: it must never show up in this class's report
    for (const m of await repo.findMany("ClassMembership", { classId: otherClass })) {
      const k = (await repo.findMany("Skill", {}, { take: 3 }))[2];
      await repo.create("StudentSkillMastery", { studentId: m.studentId, skillId: k.id, score: 99, attempts: 30, correct: 30, isMastered: true, masteredAt: new Date(), updatedAt: new Date() });
    }
  });

  test("the class against itself only: nothing about another class", async () => {
    const m = await classMonth(repo, teacher, classId);
    assert.equal(m.thisMonth.newStars, 1, "only this class's stars");
    const json = JSON.stringify(m);
    assert.ok(!json.includes(otherClass), "no other class id");
    const otherName = s((await repo.findUnique("Class", { id: otherClass }))!.name);
    assert.ok(!json.includes(otherName), "no other class name");
    assert.ok(!("rank" in m) && !/rank/i.test(Object.keys(m).join(" ")), "no ranking field");
    await assert.rejects(classMonth(repo, other, classId), ForbiddenError, "another teacher's class");
    assert.equal((await classMonth(repo, admin, classId)).classId, classId, "the admin reads one class at a time");
  });

  test("peer comparison: teachers and admins only", async () => {
    const p = await peerCompare(repo, teacher, classId);
    assert.equal(p.rows.length, 4);
    assert.ok(p.rows.every((r) => r.position === null || ["above", "around", "below"].includes(r.position)));
    await assert.rejects(peerCompare(repo, student, classId), ForbiddenError);
    if (parent) await assert.rejects(peerCompare(repo, parent, classId), ForbiddenError);
    await assert.rejects(studentPeer(repo, student, classId, sid, "x"), ForbiddenError);
    await assert.rejects(peerCompare(repo, other, classId), ForbiddenError, "not across teachers");
  });

  test("the student sees only their own month; the teacher's week in two lines", async () => {
    const mine = await myMonth(repo, student, new Date());
    assert.equal(mine.thisMonth, 1);
    assert.deepEqual(Object.keys(mine).sort(), ["lastMonth", "message", "template", "thisMonth", "vars"], "no class, no rank");
    await assert.rejects(myMonth(repo, teacher), ForbiddenError);
    if (parent) await assert.rejects(myMonth(repo, parent), ForbiddenError);
    const w = (await weeklySummary(repo, teacher))!;
    assert.equal(w.lines.length, 2);
    assert.match(w.lines[0], /^This week: 1 new stars · \d+ students need review · weakest class skill: /);
    assert.equal(await weeklySummary(repo, admin), null, "the admin's school view is elsewhere");
  });

  test("students and parents never see ranks: no comparison code in their pages", () => {
    for (const f of [...files("src/app/student"), ...files("src/app/parent"), ...files("src/components/student")]) {
      const src = read(f);
      assert.doesNotMatch(src, /peerCompare|studentPeer|peerRows|classMonth|fasterThan/, f);
    }
    const mine = read("src/app/student/reports/page.tsx");
    assert.match(mine, /myMonth\(repo, actor\)/);
    assert.match(read("src/app/teacher/reports/class/page.tsx"), /Never ranked against other classes/);
    assert.match(read("src/app/teacher/students/[studentId]/page.tsx"), /Compared with the class[\s\S]*Staff only/);
  });

  // r87: "each student against the class" was a raw 4-column table — simplified to one plain-language line per
  // student (the ready-made `sentence` field) plus a colour-coded position pill, no numbers to compare by hand.
  test("'each student against the class' is plain language + a colour-coded pill, not a raw numbers table", () => {
    const page = read("src/app/teacher/reports/class/page.tsx");
    assert.match(page, /r\.sentence/, "shows the plain-language sentence");
    assert.match(page, /r\.position === "above".*r\.position === "below".*r\.position === "around"/, "colour-codes the three positions (+ the no-data case)");
    assert.doesNotMatch(page, /ReportTable/, "no raw numbers table on this page any more");
  });
});
