/**
 * 🔍 "Why can't a student see their work?" (src/server/admin/work-visibility.ts) — FAKE data only (in-memory Test
 * School): every assigned thing of the student's classes (the Assigned page's own rows) with ONE reason each, checked
 * against the student's real My Work; "Link now" / "Link all missing for this class" for students who joined later.
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import type { Actor } from "../src/server/auth/rbac";
import { seedTestEnvironment } from "../src/server/seeding/test-env";
import { readableClasses } from "../src/server/teacher/coordinators";
import { assignSkill } from "../src/server/teacher/assign";
import { assignArticle, unassignArticle } from "../src/server/readrise/teacher";
import { cancelAssignment } from "../src/server/teacher/assigned";
import { linkMissingForClass, linkStudentNow, workVisibility, type VisView } from "../src/server/admin/work-visibility";
import { allWorkItems } from "../src/server/student/all-work";
import { demoDatabase } from "./helpers/db";

const DAY = 86_400_000;

describe("Why can't a student see their work?", () => {
  let repo: SqliteRepo; let teacher: Actor; let admin: Actor;
  let classId = ""; let sid = ""; let sid2 = ""; let late = ""; let late2 = ""; let schoolId = "";
  const ids = { whole: "", chosen: "", cancelled: "", rr: "", article: "" };
  // after the seeded class memberships (joined "now"): the seeded students were in the class when the work was sent
  const t0 = new Date(Math.ceil((Date.now() + 30 * DAY) / DAY) * DAY + 8 * 3_600_000);
  const now = new Date(t0.getTime() + 2 * DAY);
  const actorFor = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);
  const rowOf = (v: VisView, kind: string, id: string) => v.rows.find((r) => r.kind === kind && r.id === id);

  before(async () => {
    ({ repo } = await demoDatabase());
    await seedTestEnvironment(repo, { root: process.cwd(), passwordHash: "x".repeat(60), practice: "none" });
    teacher = await actorFor("test.teacher.1"); admin = await actorFor("test.admin");
    const c = (await readableClasses(repo, teacher))[0];
    classId = String(c.id); schoolId = String(c.schoolId);
    const members = await repo.findMany("ClassMembership", { classId, leftAt: null });
    sid = String(members[0].studentId); sid2 = String(members[1].studentId);
    const inClass = new Set(members.map((m) => String(m.studentId)));
    const others = (await repo.findMany("Student", { schoolId })).map((x) => String(x.id)).filter((x) => !inClass.has(x));
    late = others[0]; late2 = others[1];
    const grade = await repo.findUnique("Grade", { id: c.gradeId });
    const given0 = new Set((await repo.findMany("Assignment", { classId }, { select: ["skillId"] })).map((a) => String(a.skillId)));
    const skills = (await repo.findMany("Skill", { curriculumId: { in: (await repo.findMany("Curriculum", { gradeId: grade!.id })).map((x) => x.id) } }, { select: ["id"] }))
      .map((k) => String(k.id)).filter((k) => !given0.has(k)).sort();
    ids.whole = (await assignSkill(repo, teacher, { source: "CURRICULUM", classId, skillId: skills[0] }, t0)).assignmentId;
    ids.chosen = (await assignSkill(repo, teacher, { source: "CURRICULUM", classId, skillId: skills[1], studentIds: [sid2] }, t0)).assignmentId;
    ids.cancelled = (await assignSkill(repo, teacher, { source: "CURRICULUM", classId, skillId: skills[2] }, t0)).assignmentId;
    await cancelAssignment(repo, teacher, "SKILL", ids.cancelled, null, t0);
    // two students join the class AFTER the work was sent
    for (const x of [late, late2]) await repo.create("ClassMembership", { classId, studentId: x, joinedAt: new Date(t0.getTime() + DAY), leftAt: null });
    // a ReadRise article: cancelled, taken off the class list, assigned again (3 Nov 2026 fix)
    ids.article = String((await repo.create("RRArticle", { schoolId, code: "WV-1", title: "Whales", topic: "Science", pollStatement: "Whales are fish.", status: "PUBLISHED", createdAt: t0, updatedAt: t0 })).id);
    await assignArticle(repo, teacher, classId, ids.article, null, t0);
    const first = await repo.findUnique("RRClassArticle", { classId, articleId: ids.article });
    await cancelAssignment(repo, teacher, "READRISE", String(first!.id), null, t0);
    await unassignArticle(repo, teacher, classId, ids.article, t0);
    await assignArticle(repo, teacher, classId, ids.article, null, new Date(t0.getTime() + 1000));
    ids.rr = String((await repo.findUnique("RRClassArticle", { classId, articleId: ids.article }))!.id);
  });

  test("a whole-class skill → ✅ shown in My Work, with its section", async () => {
    const v = await workVisibility(repo, admin, sid, now);
    const r = rowOf(v, "SKILL", ids.whole)!;
    assert.ok(r, "listed");
    assert.equal(r.reason, "SHOWN", r.text);
    assert.equal(r.section, "This week");
    assert.equal(r.icon, "✅");
  });

  test("sent to chosen students only → 🚫 with the count", async () => {
    const v = await workVisibility(repo, admin, sid, now);
    const r = rowOf(v, "SKILL", ids.chosen)!;
    assert.equal(r.reason, "CHOSEN_ONLY", r.text);
    assert.match(r.text, /\(1 student\)/);
    assert.equal(r.linkable, false);
    // the chosen one sees it
    assert.equal(rowOf(await workVisibility(repo, admin, sid2, now), "SKILL", ids.chosen)!.reason, "SHOWN");
  });

  test("cancelled for everyone → ❌ with the date and who", async () => {
    const v = await workVisibility(repo, admin, sid, now);
    const r = rowOf(v, "SKILL", ids.cancelled)!;
    assert.equal(r.reason, "CANCELLED_ALL");
    assert.match(r.text, new RegExp(`Cancelled for everyone on ${t0.toISOString().slice(0, 10)} by `));
  });

  test("a ReadRise article cancelled, unassigned and assigned again → ✅ (the old cancel does not hide the new row)", async () => {
    const v = await workVisibility(repo, admin, sid, now);
    const r = rowOf(v, "READRISE", ids.rr)!;
    assert.ok(r, "the new class-article row is listed");
    assert.equal(r.reason, "SHOWN", r.text);
    assert.ok((await allWorkItems(repo, (await workVisibilityActor(sid)), now)).some((w) => w.assignmentId === `readrise:${ids.article}`));
  });

  test("a student who joined after the work was sent → ⚠️ Not linked; Link now makes it ✅ (audit-logged)", async () => {
    let v = await workVisibility(repo, admin, late, now);
    let r = rowOf(v, "SKILL", ids.whole)!;
    assert.equal(r.reason, "NOT_LINKED", r.text);
    assert.equal(r.linkable, true);
    assert.ok(v.classes.find((c) => c.id === classId)!.missing >= 2, "the two newcomers miss the whole-class skill (and older whole-class work)");
    // a chosen-students skill is never a newcomer's: 🚫, not ⚠️
    assert.equal(rowOf(v, "SKILL", ids.chosen)!.reason, "CHOSEN_ONLY");
    assert.equal(await linkStudentNow(repo, teacher, ids.whole, late, now), 1);
    assert.equal(await linkStudentNow(repo, teacher, ids.whole, late, now), 0, "twice is harmless");
    v = await workVisibility(repo, admin, late, now);
    r = rowOf(v, "SKILL", ids.whole)!;
    assert.equal(r.reason, "SHOWN", r.text);
    assert.ok((await repo.findMany("AuditLog", { action: "assignment.link_student", entityId: ids.whole })).length >= 1);
    await assert.rejects(() => linkStudentNow(repo, teacher, ids.cancelled, late, now), /cancelled for everyone/);
  });

  test("Link all missing for this class: only students who joined after; never one the teacher removed", async () => {
    // the teacher removes sid2 from the whole-class skill: it must never be linked back
    await cancelAssignment(repo, teacher, "SKILL", ids.whole, sid2, now);
    const n = await linkMissingForClass(repo, teacher, classId, now);
    assert.ok(n >= 1, `${n} linked`);
    const links = await repo.findMany("AssignmentStudent", { assignmentId: ids.whole });
    assert.ok(links.some((l) => String(l.studentId) === late2), "the second late student is linked");
    assert.ok(!(await repo.findMany("AssignmentStudent", { assignmentId: ids.chosen })).some((l) => String(l.studentId) === sid), "a student left out on purpose is not linked");
    assert.equal(rowOf(await workVisibility(repo, admin, sid2, now), "SKILL", ids.whole)!.reason, "REMOVED");
    assert.equal(await linkMissingForClass(repo, teacher, classId, now), 0, "nothing left");
    assert.ok((await repo.findMany("AuditLog", { action: "assignment.link_missing", entityId: classId })).length >= 1);
  });

  test("a teacher can check only students of their own classes; a student cannot use it", async () => {
    const v = await workVisibility(repo, teacher, sid, now);
    assert.ok(v.rows.length >= 4);
    const mine = new Set((await readableClasses(repo, teacher)).map((c) => String(c.id)));
    const taught = new Set((await repo.findMany("ClassMembership", { leftAt: null })).filter((m) => mine.has(String(m.classId))).map((m) => String(m.studentId)));
    const stranger = (await repo.findMany("Student", { schoolId })).map((x) => String(x.id)).find((x) => !taught.has(x));
    if (stranger) await assert.rejects(() => workVisibility(repo, teacher, stranger, now), /own classes/);
    const student = await workVisibilityActor(sid);
    await assert.rejects(() => workVisibility(repo, student, sid, now));
  });

  async function workVisibilityActor(id: string): Promise<Actor> {
    return resolveActor(repo, (await repo.findUnique("User", { id: (await repo.findUnique("Student", { id }))!.userId }))!);
  }
});
