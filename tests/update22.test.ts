/**
 * Update 22 (FAKE names only — the Test School): quick add students (usernames from names, numbers, no
 * duplicates), MAP scores → individual plan drafts at once (also without goal-area scores), teachers told.
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import { ForbiddenError, type Actor } from "../src/server/auth/rbac";
import { seedTestEnvironment } from "../src/server/seeding/test-env";
import { nextNumbers, parseQuickLines, pickUsername, quickAddStudents, usernameCandidates } from "../src/server/admin/quick-students";
import { importMapScores, MAP_TEMPLATE_HEADERS } from "../src/server/map/student-map";
import { autoItems, DEFAULT_BANDS, type MapProfile } from "../src/server/map/map-plan";
import { parseTemplateTable } from "../src/imports/questions/template";
import { RESPOND_HEADERS } from "../src/server/curriculum-map/respond";
import { demoDatabase } from "./helpers/db";

describe("Update 22 · names → usernames and numbers", () => {
  test("first + family name, Al joined; a second candidate with the middle name", () => {
    assert.deepEqual(usernameCandidates("Sami Fahd Al Qahtani"), ["sami.alqahtani", "sami.fahd.alqahtani"]);
    assert.deepEqual(usernameCandidates("Ziad Nour"), ["ziad.nour"]);
    const taken = new Set(["ziad.nour"]);
    assert.equal(pickUsername("Ziad Nour", taken), "ziad.nour2");
    assert.equal(pickUsername("Sami Fahd Al Qahtani", new Set(["sami.alqahtani"])), "sami.fahd.alqahtani");
  });
  test("numbers continue after the highest used; lines with or without a number", () => {
    assert.deepEqual(nextNumbers(["AJ26-004", "AJ25-099", "123"], 2, 2026), ["AJ26-005", "AJ26-006"]);
    assert.deepEqual(parseQuickLines("1. Ziad Nour\n\nSami Al Qahtani, 7788\nOmar\tB-12"), [{ name: "Ziad Nour", number: null }, { name: "Sami Al Qahtani", number: "7788" }, { name: "Omar", number: "B-12" }]);
  });
});

describe("Update 22 · quick add and plans from MAP scores", () => {
  let repo: SqliteRepo; let admin: Actor; let teacher: Actor; let classId = "";
  const now = new Date(Date.UTC(2026, 9, 1, 8));
  const actorFor = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);
  before(async () => {
    ({ repo } = await demoDatabase());
    await seedTestEnvironment(repo, { root: process.cwd(), passwordHash: "x".repeat(60), practice: "none" });
    admin = await actorFor("test.admin"); teacher = await actorFor("test.teacher.1");
    const t = (await repo.findMany("Teacher", { userId: teacher.userId }))[0];
    classId = String((await repo.findMany("ClassTeacher", { teacherId: t.id }))[0].classId);
  });

  test("admin pastes names: accounts in the class, a name already there is skipped; teachers cannot", async () => {
    const r = await quickAddStudents(repo, admin, { classId, text: "Ziad Nour\nSami Fahd Al Qahtani, QA-1\nZiad Nour" }, now);
    assert.equal(r.created.length, 2);
    assert.equal(r.skipped[0].reason, "already in this class");
    assert.ok(r.created.every((c) => c.password.length >= 8));
    assert.deepEqual(r.created.map((c) => c.number), ["AJ26-001", "QA-1"]);
    const sid = (await repo.findMany("Student", { studentNumber: "QA-1" }))[0];
    assert.ok(await repo.findUnique("ClassMembership", { classId, studentId: sid.id }));
    await assert.rejects(quickAddStudents(repo, teacher, { classId, text: "Other Kid" }, now), ForbiddenError);
  });

  test("overall RIT only (no goal areas): a plan with every area of the subject at the student's band", () => {
    const p = { overall: { rit: 186, percentile: 30, descriptor: "LoAvg", band: "181–190", lexile: null, rapidGuessPct: null }, areas: [{ group: "LIT" }, { group: "INFO" }, { group: "VOCAB" }].map((a) => ({ ...a, name: "", icon: "", rit: null, band: null, low: null, high: null, percentile: null, descriptor: null, status: null })) } as unknown as MapProfile;
    const items = autoItems(p, new Map(), DEFAULT_BANDS);
    assert.deepEqual(items.map((i) => [i.group, i.status, i.low, i.high]), [["LIT", "FOCUS", 181, 190], ["INFO", "FOCUS", 181, 190], ["VOCAB", "FOCUS", 181, 190]]);
  });

  test("admin imports MAP scores → plan drafts for both subjects at once, and the class teacher is told", async () => {
    const H = [...MAP_TEMPLATE_HEADERS], c = (h: string) => H.indexOf(h);
    const row = (num: string, name: string, rr: string, lr: string) => { const r = H.map(() => ""); r[0] = num; r[1] = name; r[c("Reading Fall RIT")] = rr; r[c("Reading Spring Projection")] = rr ? String(Number(rr) + 9) : ""; r[c("Language Fall RIT")] = lr; return r; };
    const r = await importMapScores(repo, admin, [H, row("AJ26-001", "Ziad Nour", "188", "192"), row("QA-1", "Sami Fahd Al Qahtani", "", "201")], 2026, now);
    assert.equal(r.imported, 2, JSON.stringify(r.errors));
    assert.equal(r.plans?.plans, 3);   // Ziad: Reading + Language · Sami: Language
    const plans = await repo.findMany("MapPlan", { classId });
    assert.equal(plans.length, 3);
    assert.ok(plans.every((p) => p.status === "DRAFT"));
    const note = (await repo.findMany("Notification", { userId: teacher.userId })).find((n) => String(n.title).startsWith("🗺️ MAP plans ready"));
    assert.ok(note && String(note.link).includes(classId));
    // the same file again: untouched drafts are made again, not doubled
    const again = await importMapScores(repo, admin, [H, row("AJ26-001", "Ziad Nour", "190", "")], 2026, new Date(now.getTime() + 60_000));
    assert.equal(again.plans?.plans, 2);
    assert.equal((await repo.findMany("MapPlan", { classId })).length, 3);
    // a draft the teacher edited is kept when scores come again
    const p = (await repo.findMany("MapPlan", { classId, subject: "READING" }))[0];
    await repo.updateMany("MapPlan", { id: p.id }, { editedAt: now });
    const third = await importMapScores(repo, admin, [H, row("AJ26-001", "Ziad Nour", "191", "")], 2026, new Date(now.getTime() + 120_000));
    assert.equal(third.plans?.plans, 1);
    assert.ok(await repo.findUnique("MapPlan", { id: p.id }));
  });
});

describe("Update 22 · a file uploaded on the wrong page", () => {
  test("the questions import says where Respond / MAP / roster files go", () => {
    const say = (h: string[]) => { const r = parseTemplateTable([h, h.map(() => "x")], "CURRICULUM"); return r.ok ? "" : r.errors.join(" "); };
    assert.match(say([...RESPOND_HEADERS]), /Respond to Reading file/);
    assert.match(say([...MAP_TEMPLATE_HEADERS]), /MAP scores file/);
    assert.match(say(["role", "username", "display_name"]), /roster/);
  });
});

describe("Update 22 · MAP Skill Plan by RIT range", () => {
  let repo: SqliteRepo; let admin: Actor; let classId = "";
  const now = new Date(Date.UTC(2026, 9, 1, 8));
  before(async () => {
    ({ repo } = await demoDatabase());
    await seedTestEnvironment(repo, { root: process.cwd(), passwordHash: "x".repeat(60), practice: "none" });
    admin = await resolveActor(repo, (await repo.findUnique("User", { username: "test.admin" }))!);
    const u = (await repo.findUnique("User", { username: "test.teacher.2" }))!;
    const t = (await repo.findMany("Teacher", { userId: u.id }))[0];
    classId = String((await repo.findMany("ClassTeacher", { teacherId: t.id }))[0].classId);
  });
  test("six ranges around the grade norm (Grade 6: the published Reading 6 cut points)", async () => {
    const { skillRanges } = await import("../src/server/map/skill-plan");
    assert.deepEqual((await skillRanges(repo, 6)).map((r) => r.label), ["Less than 198", "198–204", "205–210", "211–214", "215–218", "219+"]);
  });
  test("every student lands in one range; empty ranges show the nearest skills; an admin assigns for the class teacher", async () => {
    const { skillPlan, assignRange } = await import("../src/server/map/skill-plan");
    const ids = (await repo.findMany("ClassMembership", { classId, leftAt: null })).map((m) => String(m.studentId));
    const H = [...MAP_TEMPLATE_HEADERS];
    const sts = await repo.findMany("Student", { id: { in: ids } });
    const rows = sts.map((st, i) => { const r = H.map(() => ""); r[0] = String(st.studentNumber); r[H.indexOf("Reading Fall RIT")] = String(170 + i * 3); return r; });
    await importMapScores(repo, admin, [H, ...rows], 2026, now);
    const v = await skillPlan(repo, admin, { grade: 0, group: "LIT", classId });
    assert.equal(v.ranges.reduce((t, r) => t + r.students.length, 0), ids.length);
    assert.ok(v.ranges.every((r) => r.skills > 0), "no empty range");
    const r = v.ranges.find((x) => x.students.length)!;
    const a = await assignRange(repo, admin, { classId, group: "LIT", range: r.index, skillIds: r.areas.flatMap((x) => x.topics.flatMap((t) => t.skills.map((k) => k.id))), studentIds: r.students.map((x) => x.id) }, now);
    assert.equal(a.students, r.students.length);
    const asg = await repo.findUnique("Assignment", { id: a.assignmentId });
    assert.ok(asg?.createdById, "made on behalf of the class teacher");
  });
});
