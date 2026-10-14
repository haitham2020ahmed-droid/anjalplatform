/**
 * 📅 START + END dates on every assign window (owner r68 §D) — FAKE data only (in-memory Test School):
 *   the shared parsing (start of day / end of day in Riyadh, end before start refused); work with a start date is NOT in
 *   the student's My Work (or the home badge) before that day and IS from it — skills and sets (☆ quick assign, the Year
 *   plan's weeks), Learn lessons and words, ReadRise articles, writing, Respond to Reading, plans; Assigned shows the start
 *   date and "Scheduled"; every assign window has the two dates.
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
import { allWorkItems } from "../src/server/student/all-work";
import { assignedList } from "../src/server/teacher/assigned";
import { starAssign } from "../src/server/assign/star";
import { assignLearn } from "../src/server/learn/teacher";
import { assignArticle } from "../src/server/readrise/teacher";
import { createTask, myTasks } from "../src/server/teacher/writing";
import { readPlanForm } from "../src/server/plans/plan-form";
import { assignDates, DATE_ORDER_ERROR, endOfDay, startedBy, startOfDay } from "../src/lib/assign-dates";
import { demoDatabase, ROOT } from "./helpers/db";

const DAY = 86_400_000;
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const ymd = (d: Date) => new Date(d.getTime() + 3 * 3_600_000).toISOString().slice(0, 10);

describe("📅 start and end dates everywhere", () => {
  let repo: SqliteRepo; let teacher: Actor; let me: Actor; let classId = ""; let schoolId = ""; let free: string[] = [];
  const now = new Date(Date.UTC(2026, 10, 2, 8)); // Monday 2 Nov 2026, 11:00 Riyadh
  const later = new Date(now.getTime() + 3 * DAY);
  const keys = async (at: Date) => new Set((await allWorkItems(repo, me, at)).map((r) => r.assignmentId));

  before(async () => {
    ({ repo } = await demoDatabase());
    await seedTestEnvironment(repo, { root: process.cwd(), passwordHash: "x".repeat(60), practice: "none" });
    teacher = await resolveActor(repo, (await repo.findUnique("User", { username: "test.teacher.1" }))!);
    const c = (await readableClasses(repo, teacher))[0];
    classId = String(c.id); schoolId = String(c.schoolId);
    const sid = String((await repo.findMany("ClassMembership", { classId, leftAt: null }))[0].studentId);
    me = await resolveActor(repo, (await repo.findUnique("User", { id: (await repo.findUnique("Student", { id: sid }))!.userId }))!);
    const grade = await repo.findUnique("Grade", { id: c.gradeId });
    const skills = (await repo.findMany("Skill", { curriculumId: { in: (await repo.findMany("Curriculum", { gradeId: grade!.id })).map((x) => x.id) } }, { select: ["id"] })).map((k) => String(k.id));
    const withQs = new Set((await repo.findMany("Question", { skillId: { in: skills }, status: "PUBLISHED" }, { select: ["skillId"] })).map((q) => String(q.skillId)));
    const given = new Set((await repo.findMany("Assignment", { classId }, { select: ["skillId"] })).map((a) => String(a.skillId)));
    free = skills.filter((k) => withQs.has(k) && !given.has(k));
  });

  test("the shared parsing: start of the day, end of the day (Riyadh), end before start refused", () => {
    assert.equal(startOfDay("2026-11-05")!.toISOString(), "2026-11-04T21:00:00.000Z", "00:00 in Riyadh");
    assert.equal(endOfDay("2026-11-05")!.toISOString(), "2026-11-05T20:59:59.000Z", "23:59:59 in Riyadh");
    assert.equal(startOfDay(""), null);
    assert.equal(assignDates("2026-11-05", "2026-11-04").error, DATE_ORDER_ERROR);
    assert.equal(assignDates("2026-11-05", "2026-11-05").error, null, "the same day is fine");
    assert.equal(startedBy(null, now), true); assert.equal(startedBy(later, now), false); assert.equal(startedBy(now, later), true);
    const f = readPlanForm((k) => ({ classId: "c", startAt: "2026-11-05", dueAt: "2026-11-12" } as Record<string, string>)[k] ?? null, () => []);
    assert.equal(f.startText, "2026-11-05"); assert.equal(f.startAt?.toISOString(), "2026-11-04T21:00:00.000Z", "plans read the start date");
  });

  test("☆ a skill with a start date: not in My Work before, in it from that day; Assigned shows Scheduled + the start", async () => {
    const r = await starAssign(repo, teacher, { kind: "SKILL", ref: free[0], classId, startAt: ymd(later), dueAt: ymd(new Date(later.getTime() + 4 * DAY)) }, now);
    const a = (await repo.findUnique("Assignment", { id: r.id }))!;
    assert.ok(a.startAt, "the start is saved");
    assert.ok(!(await keys(now)).has(r.id), "not before the start");
    assert.ok((await keys(new Date(later.getTime() + DAY))).has(r.id), "from the start date");
    const row = (await assignedList(repo, teacher, {}, now)).items.find((x) => x.id === r.id)!;
    assert.equal(row.status, "SCHEDULED"); assert.ok(row.startAt);
    await assert.rejects(starAssign(repo, teacher, { kind: "SKILL", ref: free[1], classId, startAt: ymd(later), dueAt: ymd(now) }, now), /must be on or after the start date/);
  });

  test("Learn, ReadRise and writing honour the start date", async () => {
    const learn = await assignLearn(repo, teacher, { kind: "LESSON", ref: "LN-000", classId, target: "CLASS", startAt: startOfDay(ymd(later)), dueAt: endOfDay(ymd(new Date(later.getTime() + 2 * DAY))) }, now);
    assert.ok(learn.students > 0);
    assert.ok(!(await keys(now)).has("learn:LESSON:LN-000"), "Learn: not before");
    assert.ok((await keys(new Date(later.getTime() + DAY))).has("learn:LESSON:LN-000"), "Learn: from the start");
    const art = String((await repo.create("RRArticle", { schoolId, code: "T-9", title: "Owls", topic: "Science", pollStatement: "Owls see well.", status: "PUBLISHED", createdAt: now, updatedAt: now })).id);
    await assignArticle(repo, teacher, classId, art, endOfDay(ymd(new Date(later.getTime() + 2 * DAY))), now, startOfDay(ymd(later)));
    assert.ok(!(await keys(now)).has(`readrise:${art}`), "ReadRise: not before");
    assert.ok((await keys(new Date(later.getTime() + DAY))).has(`readrise:${art}`), "ReadRise: from the start");
    const task = await createTask(repo, teacher, { classId, kind: "WRITE", title: "My week", prompt: "Write about your week.", startAt: startOfDay(ymd(later)), dueAt: endOfDay(ymd(new Date(later.getTime() + 2 * DAY))) } as Parameters<typeof createTask>[2], now);
    assert.ok(!(await myTasks(repo, me)).some((t) => t.id === task), "writing: not before the start (today)");
    await repo.updateMany("WritingTask", { id: task }, { startAt: new Date(Date.now() - DAY) }); // myTasks reads the clock
    assert.ok((await myTasks(repo, me)).some((t) => t.id === task), "writing: once the start has come");
  });

  test("every assign window has a start and an end date", () => {
    const files: Record<string, RegExp> = {
      "src/components/assign/star-assign.tsx": /Start date/,
      "src/components/curriculum-map/assign-button.tsx": /<AssignDates/,
      "src/components/plans/plan-builder.tsx": /<AssignDates/,
      "src/app/teacher/skill-assign/page.tsx": /<AssignDates/,
      "src/app/teacher/skill-assign/bank-panel.tsx": /<AssignDates/,
      "src/app/teacher/learn/assign/page.tsx": /<AssignDates/,
      "src/app/teacher/readrise/page.tsx": /<AssignDates/,
      "src/app/teacher/readrise/library/[articleId]/page.tsx": /<AssignDates/,
      "src/app/teacher/respond/assign/page.tsx": /<AssignDates/,
      "src/app/teacher/writing/new/page.tsx": /name="startAt"/,
      "src/app/teacher/plans/curriculum/page.tsx": /<AssignDates/,
      "src/app/teacher/assign-dialog.tsx": /name="startAt"/,
      "src/app/teacher/assessments/new/test-builder.tsx": /openAt|startAt/,
      "src/components/map/group-plan-view.tsx": /name="startAt"/,
      "src/components/curriculum-map/send-plan.tsx": /startAt/,
      "src/app/teacher/assignments/new/assignment-form.tsx": /name="startAt"/,
    };
    for (const [f, re] of Object.entries(files)) assert.match(read(f), re, f);
    // the Year plan: a week still ahead starts on its Sunday
    assert.match(read("src/server/map/year-plan.ts"), /startAt = w\.from >/);
    assert.match(read("prisma/schema.prisma"), /model RRClassArticle \{[\s\S]*?startAt\s+DateTime\?/);
    for (const m of ["LearnAssign", "LearnAssignee", "WritingTask", "RespondAssignment"]) assert.match(read("prisma/schema.prisma"), new RegExp(`model ${m} \\{[\\s\\S]*?startAt\\s+DateTime\\?`), m);
  });
});
