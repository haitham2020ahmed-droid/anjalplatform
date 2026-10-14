/**
 * 📌 Assigned → several at once (owner r68 §E / MEMFIX §8) — FAKE data only (in-memory Test School):
 *   checkboxes + "Select all shown" + smart selects (by type, by unit) → "Cancel selected" (one confirm) / "Undo
 *   selected"; a cancelled item DISAPPEARS from the default list (only Status = Cancelled shows it, with Undo); the toast
 *   "Cancelled 5 · Undo" restores them at once; each item is checked like a single cancel (another teacher's: refused).
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import type { Actor } from "../src/server/auth/rbac";
import { seedTestEnvironment } from "../src/server/seeding/test-env";
import { readableClasses } from "../src/server/teacher/coordinators";
import { assignSkill } from "../src/server/teacher/assign";
import { allWorkItems } from "../src/server/student/all-work";
import { assignedList, BULK_MAX, cancelMany, parseBulkRefs, restoreMany, unitOfTitle, type BulkRef } from "../src/server/teacher/assigned";
import { UI_STRINGS } from "../src/i18n/en";
import { ar } from "../src/i18n/ar";
import { demoDatabase, ROOT } from "./helpers/db";

const DAY = 86_400_000;
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

describe("📌 Assigned: select several, cancel / undo in one go", () => {
  let repo: SqliteRepo; let teacher: Actor; let teacher2: Actor; let me: Actor; let classId = ""; let schoolId = "";
  const refs: BulkRef[] = [];
  const now = new Date(Date.UTC(2026, 10, 2, 8));
  const actorFor = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);

  before(async () => {
    ({ repo } = await demoDatabase());
    await seedTestEnvironment(repo, { root: process.cwd(), passwordHash: "x".repeat(60), practice: "none" });
    teacher = await actorFor("test.teacher.1"); teacher2 = await actorFor("test.teacher.2");
    const c = (await readableClasses(repo, teacher))[0];
    classId = String(c.id); schoolId = String(c.schoolId);
    const sid = String((await repo.findMany("ClassMembership", { classId, leftAt: null }))[0].studentId);
    me = await resolveActor(repo, (await repo.findUnique("User", { id: (await repo.findUnique("Student", { id: sid }))!.userId }))!);
    const grade = await repo.findUnique("Grade", { id: c.gradeId });
    const skills = (await repo.findMany("Skill", { curriculumId: { in: (await repo.findMany("Curriculum", { gradeId: grade!.id })).map((x) => x.id) } }, { select: ["id"] })).map((k) => String(k.id));
    const withQs = new Set((await repo.findMany("Question", { skillId: { in: skills }, status: "PUBLISHED" }, { select: ["skillId"] })).map((q) => String(q.skillId)));
    const given = new Set((await repo.findMany("Assignment", { classId }, { select: ["skillId"] })).map((a) => String(a.skillId)));
    const free = skills.filter((k) => withQs.has(k) && !given.has(k)).slice(0, 3);
    for (const k of free) refs.push({ kind: "SKILL", id: (await assignSkill(repo, teacher, { classId, skillId: k }, now)).assignmentId });
    const teacherRow = await repo.findUnique("Teacher", { userId: teacher.userId });
    for (const n of [1, 2]) {
      const r = await repo.create("RespondAssignment", { schoolId, classId, setCode: `G4.U${n}.TS1.RTR`, title: `Respond to Reading · Unit ${n} · Set 1`, createdById: teacherRow!.id, createdAt: new Date(now.getTime() - n * 60_000) });
      await repo.create("RespondAssignmentStudent", { assignmentId: r.id, studentId: me.studentId!, level: "ON", updatedAt: now });
      refs.push({ kind: "RESPOND", id: String(r.id) });
    }
    const w = String((await repo.create("WritingTask", { schoolId, classId, createdById: teacher.userId, kind: "WRITE", title: "Unit 1 · My hero", prompt: "Write.", genre: "NARRATIVE", createdAt: now, dueAt: new Date(now.getTime() + 3 * DAY) })).id);
    refs.push({ kind: "WRITING", id: w });
  });

  test("the pure parts: checkbox values, the unit of a title, at most BULK_MAX at once", () => {
    assert.deepEqual(parseBulkRefs(["SKILL:a", "SKILL:a", "NOPE:b", "WRITING:", ":x", "RESPOND:r1"]), [{ kind: "SKILL", id: "a" }, { kind: "RESPOND", id: "r1" }]);
    assert.equal(unitOfTitle("Unit 1 · Selection 1: Amigo Brothers · Review (adaptive: Approaching → Meeting → Exceeding)"), "Unit 1");
    assert.equal(unitOfTitle("Respond to Reading · unit 12 · Set 2"), "Unit 12");
    assert.equal(unitOfTitle("Main idea practice"), null);
    assert.equal(parseBulkRefs(Array.from({ length: BULK_MAX + 20 }, (_, i) => `SKILL:${i}`)).length, BULK_MAX);
  });

  test("cancel selected: all at once, gone from the default list and from My Work; Status = Cancelled shows them; Undo brings them back", async () => {
    const before = await assignedList(repo, teacher, {}, now);
    for (const r of refs) assert.ok(before.items.some((x) => x.kind === r.kind && x.id === r.id), `${r.kind} listed`);
    const respond = before.items.filter((x) => x.kind === "RESPOND");
    assert.ok(respond.every((x) => x.unit && /^Unit \d+$/.test(x.unit)), "each row knows its unit (smart select)");
    const work0 = (await allWorkItems(repo, me, now)).length;
    const res = await cancelMany(repo, teacher, refs, now);
    assert.equal(res.done.length, refs.length); assert.equal(res.failed.length, 0);
    const after = await assignedList(repo, teacher, {}, now);
    for (const r of refs) assert.ok(!after.items.some((x) => x.kind === r.kind && x.id === r.id), `${r.kind} disappears from the default list`);
    const cancelled = await assignedList(repo, teacher, { status: "CANCELLED" }, now);
    for (const r of refs) assert.ok(cancelled.items.some((x) => x.kind === r.kind && x.id === r.id && x.cancelled), `${r.kind} under Status = Cancelled`);
    assert.ok((await assignedList(repo, teacher, { status: "ALL" }, now)).items.length >= cancelled.items.length, "All shows both");
    assert.equal((await allWorkItems(repo, me, now)).length, work0 - refs.length, "gone from the student's My Work at once");
    // twice: harmless, still one cancel each
    await cancelMany(repo, teacher, refs, now);
    assert.equal(await repo.count("AssignmentCancel", { restoredAt: null, refId: { in: refs.map((r) => r.id) } }), refs.length);
    // the toast's Undo
    const back = await restoreMany(repo, teacher, refs, now);
    assert.equal(back.done.length, refs.length);
    assert.equal((await allWorkItems(repo, me, now)).length, work0, "everything back");
    const again = await assignedList(repo, teacher, {}, now);
    for (const r of refs) assert.ok(again.items.some((x) => x.kind === r.kind && x.id === r.id && !x.cancelled));
  });

  test("each item is checked: another teacher cannot cancel them (nothing changes)", async () => {
    const r = await cancelMany(repo, teacher2, refs, now);
    assert.equal(r.done.length, 0);
    assert.equal(r.failed.length, refs.length);
    assert.equal(await repo.count("AssignmentCancel", { restoredAt: null, refId: { in: refs.map((x) => x.id) } }), 0);
    await assert.rejects(cancelMany(repo, me, refs, now), "students: no");
  });

  test("the page: checkboxes, Select all shown, smart selects, one confirm, the toast with Undo; translated", () => {
    const page = read("src/app/teacher/assigned/page.tsx");
    assert.match(page, /type="checkbox" name="sel" value=\{`\$\{x\.kind\}:\$\{x\.id\}`\}/);
    assert.match(page, /data-unit=/); assert.match(page, /<AssignedBulkBar/);
    assert.match(page, /<option value="">\{t\("Not cancelled"\)\}<\/option>/, "the default list = not cancelled");
    assert.doesNotMatch(page, /line-through/, "no struck-through rows any more");
    const bar = read("src/components/teacher/assigned-bulk.tsx");
    for (const x of ["Select all shown", "Select by type…", "Select by unit…", "Cancel selected", "Undo selected", "Cancelled {n}", "window.confirm", "assigned-toast", "router.refresh"]) assert.ok(bar.includes(x), x);
    assert.match(read("src/app/teacher/assigned/actions.ts"), /export async function bulkAssignedAction/);
    for (const w of ["Select all shown", "Cancel selected", "Undo selected", "Cancelled {n}", "Scheduled", "Cancel {n} items for everyone? Students will no longer see them; their answers are kept."]) {
      assert.ok((UI_STRINGS as readonly string[]).includes(w), w); assert.ok(ar[w as (typeof UI_STRINGS)[number]], w);
    }
  });
});
