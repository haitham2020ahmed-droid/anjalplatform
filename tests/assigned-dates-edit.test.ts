/**
 * 📅📅 Teacher "Assigned" page — edit a row's start AND due date together (owner request, Nov 2026:
 * "ضيف اداه... بدايه ونهايه حتي لو الطلاب بدوا اقدر اعدل عادي" — one tool, next to the status badge, that can move
 * either date or both, on a row of ANY status, even once students already started). FAKE data only (in-memory
 * Test School). Covers: the combined server function (updateAssignedDates), its ONE_ROW_START/ONE_ROW_DUE table
 * mapping, the PLAN fan-out to every place's own Assignment row, MAP_TEST's NOT NULL opensAt/closesAt guard,
 * kinds with only one of the two dates (NAFS_PRACTICE: due only) or neither (EXIT_TICKET), permissions, and the
 * page/action wiring.
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
import { assignTest } from "../src/server/tests/assessments";
import { createMapTest } from "../src/server/map/map-test";
import {
  EDITABLE_DATE_KINDS, EDITABLE_DUE_KINDS, EDITABLE_START_KINDS, assignedList, updateAssignedDates, updateAssignedStart,
} from "../src/server/teacher/assigned";
import { demoDatabase, ROOT } from "./helpers/db";

const DAY = 86_400_000;
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

describe("Assigned: edit start + due date together", () => {
  let repo: SqliteRepo; let teacher: Actor; let teacher2: Actor;
  let classId = ""; let schoolId = "";
  let skillAssignId = ""; let mapTestId = ""; let nafsPracticeId = ""; let exitTicketId = "";
  let planId = ""; let planPlaceId = "";
  const now = new Date(Date.UTC(2026, 10, 2, 8));

  before(async () => {
    ({ repo } = await demoDatabase());
    await seedTestEnvironment(repo, { root: process.cwd(), passwordHash: "x".repeat(60), practice: "none" });
    teacher = await resolveActor(repo, (await repo.findUnique("User", { username: "test.teacher.1" }))!);
    teacher2 = await resolveActor(repo, (await repo.findUnique("User", { username: "test.teacher.2" }))!);
    const c = (await readableClasses(repo, teacher))[0];
    classId = String(c.id); schoolId = String(c.schoolId);
    const u = teacher.userId;
    const grade = await repo.findUnique("Grade", { id: c.gradeId });
    const skills = await repo.findMany("Skill", { curriculumId: { in: (await repo.findMany("Curriculum", { gradeId: grade!.id })).map((x) => x.id) } }, { select: ["id"] });
    const given0 = new Set((await repo.findMany("Assignment", { classId }, { select: ["skillId"] })).map((a) => String(a.skillId)));
    const free = skills.map((k) => String(k.id)).filter((k) => !given0.has(k)).sort();

    skillAssignId = (await assignSkill(repo, teacher, { source: "CURRICULUM", classId, skillId: free[0] }, now)).assignmentId;

    mapTestId = await createMapTest(repo, teacher, { kind: "AUTO", subject: "READING", classIds: [classId], items: 20, opensAt: new Date(now.getTime() - DAY), closesAt: new Date(now.getTime() + 14 * DAY) }, now);

    nafsPracticeId = String((await repo.create("NafsPractice", { schoolId, createdById: u, title: "Main idea practice", targets: ["NAFS.RC.MAIN"], classId, createdAt: now, dueAt: new Date(now.getTime() + 5 * DAY) })).id);

    exitTicketId = String((await repo.create("ExitTicket", { schoolId, classId, createdById: u, title: "Commas", questionIds: [], status: "OPEN", createdAt: now })).id);

    const place = (await assignSkill(repo, teacher, { source: "CURRICULUM", classId, skillId: free[1] }, now)).assignmentId;
    planPlaceId = place;
    planId = String((await repo.create("SkillPlan", { schoolId, classId, title: "Grade curriculum plan", kind: "CURRICULUM", gradeLevel: Number(grade!.level), status: "SENT", createdById: u, createdAt: now, startAt: null, dueAt: null })).id);
    await repo.create("SkillPlanItem", { planId, code: "U1", label: "Unit 1", assignmentIds: [place], order: 1 });
  });

  test("ONE_ROW_START / ONE_ROW_DUE coverage: EDITABLE_* sets match what each kind can actually store", () => {
    // every start-capable kind can also at least be read back as a date (the table/field mapping is private, but
    // the exported sets are the page's only source of truth for which 📅 inputs to render)
    assert.ok(EDITABLE_START_KINDS.has("SKILL") && EDITABLE_START_KINDS.has("PLAN") && EDITABLE_START_KINDS.has("MAP_TEST"));
    assert.ok(!EDITABLE_START_KINDS.has("NAFS_PRACTICE"), "no start column for NAFS practice");
    assert.ok(!EDITABLE_START_KINDS.has("EXIT_TICKET") && !EDITABLE_START_KINDS.has("LESSON"));
    assert.ok(EDITABLE_DUE_KINDS.has("NAFS_PRACTICE"), "NAFS practice DOES have a due date, unlike start");
    assert.ok(!EDITABLE_DUE_KINDS.has("EXIT_TICKET") && !EDITABLE_DUE_KINDS.has("LESSON"), "truly nothing to edit for these");
    // EDITABLE_DATE_KINDS (what the page actually gates the 📅 tool on) is the union, so NAFS_PRACTICE is included
    // even though it is absent from EDITABLE_START_KINDS
    assert.ok(EDITABLE_DATE_KINDS.has("NAFS_PRACTICE") && EDITABLE_DATE_KINDS.has("SKILL") && EDITABLE_DATE_KINDS.has("PLAN"));
    assert.ok(!EDITABLE_DATE_KINDS.has("EXIT_TICKET") && !EDITABLE_DATE_KINDS.has("LESSON"));
  });

  test("SKILL: both dates together, in any status — works even once a student has already started", async () => {
    await repo.updateMany("AssignmentStudent", { assignmentId: skillAssignId }, { status: "IN_PROGRESS" });
    const start = new Date(now.getTime() + DAY), due = new Date(now.getTime() + 8 * DAY);
    const r = await updateAssignedDates(repo, teacher, "SKILL", skillAssignId, { startAt: start, dueAt: due }, now);
    assert.equal(r.startAt, start.toISOString()); assert.equal(r.dueAt, due.toISOString());
    const row = (await repo.findUnique("Assignment", { id: skillAssignId }))!;
    assert.equal(new Date(row.startAt as string).getTime(), start.getTime());
    assert.equal(new Date(row.dueAt as string).getTime(), due.getTime());
    // only the due date, leaving the start as it is
    const due2 = new Date(now.getTime() + 20 * DAY);
    const r2 = await updateAssignedDates(repo, teacher, "SKILL", skillAssignId, { dueAt: due2 }, now);
    assert.equal(r2.startAt, start.toISOString(), "start untouched");
    assert.equal(r2.dueAt, due2.toISOString());
    // clearing both: null is allowed for SKILL (Assignment.startAt/dueAt are both nullable)
    const r3 = await updateAssignedDates(repo, teacher, "SKILL", skillAssignId, { startAt: null, dueAt: null }, now);
    assert.equal(r3.startAt, null); assert.equal(r3.dueAt, null);
    // bad order rejected
    await assert.rejects(
      updateAssignedDates(repo, teacher, "SKILL", skillAssignId, { startAt: new Date(now.getTime() + 10 * DAY), dueAt: new Date(now.getTime() + 2 * DAY) }, now),
      /start date must be before the due date/,
    );
    // nothing to change
    await assert.rejects(updateAssignedDates(repo, teacher, "SKILL", skillAssignId, {}, now), /Nothing to change/);
  });

  test("MAP_TEST: opensAt/closesAt are NOT NULL — clearing either is refused, a valid pair saves", async () => {
    await assert.rejects(updateAssignedDates(repo, teacher, "MAP_TEST", mapTestId, { startAt: null }, now), /needs both an opening and a closing date/);
    await assert.rejects(updateAssignedDates(repo, teacher, "MAP_TEST", mapTestId, { dueAt: null }, now), /needs both an opening and a closing date/);
    const start = new Date(now.getTime() - 2 * DAY), due = new Date(now.getTime() + 21 * DAY);
    const r = await updateAssignedDates(repo, teacher, "MAP_TEST", mapTestId, { startAt: start, dueAt: due }, now);
    assert.equal(r.startAt, start.toISOString()); assert.equal(r.dueAt, due.toISOString());
    const win = (await repo.findUnique("MapSimWindow", { id: mapTestId }))!;
    assert.equal(new Date(win.opensAt as string).getTime(), start.getTime());
    assert.equal(new Date(win.closesAt as string).getTime(), due.getTime());
  });

  test("NAFS_PRACTICE: due date only (no start column at all) — due updates, a start attempt is refused", async () => {
    const due = new Date(now.getTime() + 9 * DAY);
    const r = await updateAssignedDates(repo, teacher, "NAFS_PRACTICE", nafsPracticeId, { dueAt: due }, now);
    assert.equal(r.dueAt, due.toISOString()); assert.equal(r.startAt, null, "NAFS practice never has a start date");
    const row = (await repo.findUnique("NafsPractice", { id: nafsPracticeId }))!;
    assert.equal(new Date(row.dueAt as string).getTime(), due.getTime());
    await assert.rejects(updateAssignedDates(repo, teacher, "NAFS_PRACTICE", nafsPracticeId, { startAt: new Date(now.getTime() + DAY) }, now), /no start date to change/);
  });

  test("EXIT_TICKET: neither date exists — both kinds of edit are refused", async () => {
    await assert.rejects(updateAssignedDates(repo, teacher, "EXIT_TICKET", exitTicketId, { startAt: new Date(now.getTime() + DAY) }, now), /no start date to change/);
    await assert.rejects(updateAssignedDates(repo, teacher, "EXIT_TICKET", exitTicketId, { dueAt: new Date(now.getTime() + DAY) }, now), /no due date to change/);
  });

  test("PLAN: fans the dates out to the plan AND every one of its places' own Assignment rows (the real per-student gate)", async () => {
    const start = new Date(now.getTime() + 3 * DAY), due = new Date(now.getTime() + 15 * DAY);
    const r = await updateAssignedDates(repo, teacher, "PLAN", planId, { startAt: start, dueAt: due }, now);
    assert.equal(r.startAt, start.toISOString()); assert.equal(r.dueAt, due.toISOString());
    const plan = (await repo.findUnique("SkillPlan", { id: planId }))!;
    assert.equal(new Date(plan.startAt as string).getTime(), start.getTime(), "SkillPlan's own display copy");
    assert.equal(new Date(plan.dueAt as string).getTime(), due.getTime());
    const place = (await repo.findUnique("Assignment", { id: planPlaceId }))!;
    assert.equal(new Date(place.startAt as string).getTime(), start.getTime(), "the place's own Assignment.startAt — what students actually hit");
    assert.equal(new Date(place.dueAt as string).getTime(), due.getTime());
  });

  test("audit logged as assignment.update_dates; only the assigning/class teacher may change it", async () => {
    await updateAssignedDates(repo, teacher, "SKILL", skillAssignId, { startAt: null, dueAt: new Date(now.getTime() + 2 * DAY) }, now);
    const log = (await repo.findMany("AuditLog", { entityType: "SKILL", entityId: skillAssignId, action: "assignment.update_dates" }))[0];
    assert.ok(log, "an audit row exists for the combined action");
    await assert.rejects(updateAssignedDates(repo, teacher2, "SKILL", skillAssignId, { dueAt: new Date(now.getTime() + 3 * DAY) }, now), /Not found|not in your classes|Only/);
  });

  test("updateAssignedStart (kept for any other caller) is a thin wrapper and still works start-only", async () => {
    // the previous test left dueAt at now+2*DAY, so the new start must stay before that
    const start = new Date(now.getTime() + 1 * DAY);
    const r = await updateAssignedStart(repo, teacher, "SKILL", skillAssignId, start, now);
    assert.equal(r.startAt, start.toISOString());
    const row = (await repo.findUnique("Assignment", { id: skillAssignId }))!;
    assert.equal(new Date(row.startAt as string).getTime(), start.getTime());
  });

  test("the list still reflects edited dates (assignedList reads the same columns)", async () => {
    const due = new Date(now.getTime() + 6 * DAY);
    await updateAssignedDates(repo, teacher, "SKILL", skillAssignId, { dueAt: due }, now);
    const row = (await assignedList(repo, teacher, { kind: "SKILL" }, now)).items.find((x) => x.id === skillAssignId)!;
    assert.equal(row.dueAt, due.toISOString());
  });

  test("the page and action wiring: a combined 📅 editor, offered on any status (no SCHEDULED gate), with both date inputs", () => {
    const page = read("src/app/teacher/assigned/page.tsx");
    assert.match(page, /function EditDatesForm/, "the combined form exists");
    assert.doesNotMatch(page, /x\.status === "SCHEDULED".*EditDatesForm|EditDatesForm.*x\.status === "SCHEDULED"/, "no longer gated to Scheduled-only");
    assert.match(page, /EDITABLE_DATE_KINDS\.has\(x\.kind\)/, "gated on the union set instead");
    assert.match(page, /name="startAt"/); assert.match(page, /name="dueAt"/);
    assert.match(page, /required=\{x\.kind === "MAP_TEST"\}/, "MAP Test's two dates cannot be cleared from the UI either");
    const actions = read("src/app/teacher/assigned/actions.ts");
    assert.match(actions, /export async function updateAssignedDatesAction/);
    assert.match(actions, /updateAssignedDates\(repo, actor, kind, id, patch\)/);
  });
});
