/**
 * ⭐ TEACHER Reports → "Student Skills" (owner r68 spec C) — in-memory demo school only:
 *   Skills Grid (default): source filter (Curriculum · MAP · NAFS · Grammar · All …), strand filter, "12 of 20 mastered"
 *   under each column, paginated; Skill page: four name lists, most-missed questions, Assign to students not mastered ·
 *   Create small group · Reteach to whole class (only when 40 %+ struggle); Student view: My Skills read-only, the
 *   summary line, Create Plan prefilled with Learning + Review; Send to the family → the admin approves first; access.
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { demoDatabase, ROOT } from "./helpers/db";
import { publishGrade4Bank } from "./helpers/practice";
import { resolveActor } from "../src/server/auth/actor";
import type { Actor } from "../src/server/auth/rbac";
import { skillKeyIndex } from "../src/server/skills/status";
import { GRID_PAGE, GRID_PLANS, skillsGrid } from "../src/server/skills/skills-grid";
import { needsReteach, RETEACH_SHARE, sendSkillsToFamily, skillPage, skillPageAction, studentSkillsForTeacher } from "../src/server/skills/student-skills";
import { REPORT_CATEGORIES } from "../src/components/teacher/report-catalog";
import { assignSkill } from "../src/server/teacher/assign";
import { UI_STRINGS } from "../src/i18n/en";
import { ar } from "../src/i18n/ar";

const s = (v: unknown) => String(v ?? "");
const read = (f: string) => readFileSync(join(ROOT, f), "utf8");

describe("⭐ Reports → Student Skills (teacher)", () => {
  let repo: SqliteRepo; let teacher: Actor; let other: Actor; let admin: Actor; let schoolId = ""; let classId = ""; let tid = ""; let ids: string[] = [];
  let g4 = new Map<string, string>();
  const now = new Date("2026-10-13T09:00:00Z");
  const keyOf = async (id: string) => (await skillKeyIndex(repo, schoolId)).keyOf.get(id)!;
  const row = async (sid: string, code: string, status: string) => repo.create("SkillStatus", { studentId: sid, skillKey: await keyOf(g4.get(code)!), level: 1, status, skillId: g4.get(code), answered: 20, correct: 12, score: 60, startedAt: now, masteredAt: status === "MASTERED" ? now : null, createdAt: now, updatedAt: now, history: [] });

  before(async () => {
    ({ repo } = await demoDatabase({ classesPerGrade: 2, studentsPerClass: 5 }));
    await publishGrade4Bank(repo);
    teacher = await resolveActor(repo, (await repo.findUnique("User", { username: "demo.teacher.4a" }))!);
    other = await resolveActor(repo, (await repo.findUnique("User", { username: "demo.teacher.4b" }))!);
    const adminUser = (await repo.findMany("User", { role: "SCHOOL_ADMIN" }))[0];
    admin = await resolveActor(repo, adminUser);
    schoolId = teacher.schoolId!;
    tid = s((await repo.findUnique("Teacher", { userId: teacher.userId }))!.id);
    classId = s((await repo.findMany("ClassTeacher", { teacherId: tid }))[0].classId);
    ids = (await repo.findMany("ClassMembership", { classId })).map((m) => s(m.studentId));
    const g = (await repo.findMany("Grade", { schoolId, level: 4 }))[0];
    const cur = (await repo.findMany("Curriculum", { gradeId: g.id }))[0];
    g4 = new Map((await repo.findMany("Skill", { curriculumId: cur.id })).map((k) => [s(k.code).replace(/^G4\./, ""), s(k.id)]));
    // theme: 1 mastered, 2 learning, 1 review, 1 not started (60 % struggle) · capitalization: 4 mastered
    await row(ids[0], "theme", "MASTERED"); await row(ids[1], "theme", "IN_PROGRESS"); await row(ids[2], "theme", "IN_PROGRESS"); await row(ids[3], "theme", "NEEDS_REVIEW");
    for (const id of ids.slice(0, 4)) await row(id, "capitalization", "MASTERED");
    // wrong answers on theme questions (most-missed)
    const qs = await repo.findMany("Question", { skillId: g4.get("theme")!, status: "PUBLISHED" }, { select: ["id"], take: 3 });
    const ses = await repo.create("PracticeSession", { studentId: ids[1], skillId: g4.get("theme")!, mode: "ADAPTIVE_PRACTICE", startedAt: now, questionCount: 6, correctCount: 1, activeMs: 0 });
    for (let i = 0; i < 6; i++) await repo.create("QuestionAttempt", { sessionId: ses.id, studentId: ids[1], questionId: qs[i % 2].id, skillId: g4.get("theme")!, response: { value: "x" }, isCorrect: i === 5, responseMs: 9000, rapidGuess: false, difficultyB: 0, createdAt: new Date(now.getTime() - 86_400_000) });
    // r74: Student Skills shows only assigned skills — theme (Curriculum) and capitalization (Grammar) for the class
    await assignSkill(repo, teacher, { classId, skillId: g4.get("theme")!, source: "CURRICULUM" }, now);
    await assignSkill(repo, teacher, { classId, skillId: g4.get("capitalization")!, source: "GRAMMAR" }, now);
  });

  test("Skills Grid: the source and strand filters, the column counts, pagination", async () => {
    assert.deepEqual(GRID_PLANS.map((p) => p.key), ["ALL", "MAP", "NAFS", "CURRICULUM", "GRAMMAR", "RTI"], "r74: All sources · MAP · NAFS · Curriculum · Grammar · RTI");
    const g = await skillsGrid(repo, teacher, { classId }, now);
    const theme = g.skills.find((k) => k.key === "fam:theme")!;
    assert.deepEqual([theme.mastered, theme.total], [1, ids.length], "1 of 5 mastered");
    assert.equal(theme.strand, "LITERATURE");
    const grammar = await skillsGrid(repo, teacher, { classId, plan: "GRAMMAR" }, now);
    assert.ok(grammar.skills.some((k) => k.key === "fam:capitalization") && !grammar.skills.some((k) => k.key === "fam:theme"), "Grammar source: the grammar skills");
    const lit = await skillsGrid(repo, teacher, { classId, strand: "LITERATURE" }, now);
    assert.ok(lit.skills.every((k) => k.strand === "LITERATURE") && lit.skills.length >= 1);
    assert.equal(g.page, 1); assert.equal(g.pages, Math.ceil(ids.length / GRID_PAGE)); assert.equal(g.totalStudents, ids.length);
    const page = read("src/app/teacher/reports/skills-grid/page.tsx");
    for (const x of ["{n} of {total} mastered", "grid-pages", "Print the class grid", "view: \"skill\"", "view: \"student\"", "All strands"]) assert.ok(page.includes(x), x);
    assert.ok(REPORT_CATEGORIES.length > 0 && read("src/components/teacher/report-catalog.ts").includes("title: \"Student Skills\""), "the Reports card is Student Skills");
  });

  test("Skill page: four lists, most-missed questions, the three actions (reteach only when 40 %+ struggle)", async () => {
    const p = await skillPage(repo, teacher, classId, "fam:theme", now);
    assert.deepEqual([p.lists.MASTERED.length, p.lists.LEARNING.length, p.lists.REVIEW.length, p.lists.NOT_STARTED.length], [1, 2, 1, 1]);
    assert.equal(p.struggling, 3); assert.equal(p.reteach, true, "3 of 5 struggle (≥ 40 %)");
    assert.ok(p.missed.length >= 1 && p.missed[0].wrong >= 2 && p.missed[0].stem.length > 0, "the most-missed questions with their text");
    assert.equal(needsReteach(1, 5), false); assert.equal(needsReteach(2, 5), true); assert.equal(RETEACH_SHARE, 0.4);
    const cap = await skillPage(repo, teacher, classId, "fam:capitalization", now);
    assert.equal(cap.reteach, false);
    // Assign to students not mastered: the 4 who are not ⭐
    const a = await skillPageAction(repo, teacher, classId, "fam:theme", "NOT_MASTERED", now, "CURRICULUM");
    assert.equal(a.students, 4);
    const mine = new Set((await repo.findMany("AssignmentStudent", { assignmentId: a.assignmentId })).map((r) => s(r.studentId)));
    assert.ok(!mine.has(ids[0]) && mine.has(ids[4]), "the mastered student is left out");
    // Create small group: Learning + Review only
    const sg = await skillPageAction(repo, teacher, classId, "fam:theme", "SMALL_GROUP", now, "CURRICULUM");
    assert.equal(sg.students, 3);
    assert.match(s((await repo.findUnique("Assignment", { id: sg.assignmentId }))!.note), /^Small group:/);
    // Reteach to whole class
    const rt = await skillPageAction(repo, teacher, classId, "fam:theme", "RETEACH", now, "CURRICULUM");
    assert.equal(rt.students, ids.length);
    assert.match(s((await repo.findUnique("Assignment", { id: rt.assignmentId }))!.note), /^Reteach:/);
    await assert.rejects(skillPage(repo, other, classId, "fam:theme", now), /not|class|Forbidden/i, "another teacher's class: no");
  });

  test("Student view: My Skills read-only + summary + Create Plan prefilled with Learning + Review", async () => {
    const v = await studentSkillsForTeacher(repo, teacher, ids[3], now);
    assert.equal(v.skills.counts.REVIEW, 1); assert.equal(v.skills.counts.MASTERED, 1);
    assert.match(v.summary, /1 mastered · \d+ learning · 1 to review · \d+ not started/);
    assert.ok(v.skills.groups.MASTERED.flatMap((g) => g.rows).every((r) => r.href === null), "read-only: no practice buttons");
    // r74: the teacher's view lists only the skills assigned to this student (theme 🔄 + capitalization ⭐), by strand, with sources
    assert.deepEqual(v.assigned.groups.map((g) => [g.strand, g.rows.map((r) => [r.key, r.status, r.sources.join("+")])]), [["LITERATURE", [["fam:theme", "NEEDS_REVIEW", "CURRICULUM"]]], ["GRAMMAR", [["fam:capitalization", "MASTERED", "GRAMMAR"]]]]);
    assert.deepEqual([v.assigned.total, v.assigned.counts.NOT_STARTED], [2, 0]);
    assert.ok(v.planHref && v.planHref.startsWith("/teacher/plans?"), "Create Plan");
    const q = new URLSearchParams(v.planHref!.split("?")[1]);
    assert.equal(q.get("tab"), "new"); assert.equal(q.get("who"), "student"); assert.equal(q.get("sid"), ids[3]);
    assert.ok(q.getAll("add").includes(g4.get("theme")!), "the Review skill is prefilled");
    await assert.rejects(studentSkillsForTeacher(repo, other, ids[3], now), /not in your classes|Forbidden/i);
  });

  test("Send to the family: the admin approves first (teacher) / sent at once (admin)", async () => {
    const id = await sendSkillsToFamily(repo, teacher, ids[3], now);
    const r = (await repo.findUnique("FamilyReport", { id }))!;
    assert.equal(r.status, "PENDING", "waits for the admin's approval");
    assert.equal(r.refId, "skills");
    assert.ok((await repo.findMany("Notification", { type: "REPORT_APPROVAL" })).length >= 1, "the admin is told");
    assert.equal(await sendSkillsToFamily(repo, teacher, ids[3], now), id, "sent again: the same open request, updated");
    const id2 = await sendSkillsToFamily(repo, admin, ids[0], now);
    assert.equal((await repo.findUnique("FamilyReport", { id: id2 }))!.status, "APPROVED", "the admin's own send is approved at once");
  });

  test("words: translated; the page keeps the grid's contract", () => {
    for (const w of ["Student Skills", "Skills Grid", "Assign to students not mastered", "Create small group", "Reteach to whole class", "Most-missed questions", "Create Plan", "Send to the family", "{n} of {total} mastered"]) {
      assert.ok((UI_STRINGS as readonly string[]).includes(w), w); assert.ok(ar[w as (typeof UI_STRINGS)[number]], w);
    }
  });
});
