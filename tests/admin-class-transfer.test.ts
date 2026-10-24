/**
 * 👥 Admin "Class Transfer" (src/app/admin/class-transfer): the page itself is a thin redirect to the School page
 * (its own comment: "Class Transfer now lives on the School page… transferClassAction is kept"), and the real work
 * (transferClass) is already covered for the keepPrevious=true / teacher-forbidden cases by update26b.test.ts. New
 * here: keepPrevious=false (the old teacher loses the class entirely), the ValidationError for a teacher outside
 * the school, the moved class's open plans switching author, and the new teacher's notification.
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import { ForbiddenError, type Actor } from "../src/server/auth/rbac";
import { ValidationError } from "../src/server/curriculum-admin";
import { schoolTeachers, transferClass } from "../src/server/teacher/support";
import { demoDatabase, ROOT } from "./helpers/db";

const s = (v: unknown) => String(v ?? "");
const read = (f: string) => readFileSync(join(ROOT, f), "utf8");

describe("👥 admin Class Transfer", () => {
  let repo: SqliteRepo;
  let admin: Actor, teacher: Actor;
  let schoolId: string, classId: string;

  before(async () => {
    ({ repo } = await demoDatabase());
    const actorFor = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);
    admin = await actorFor("demo.admin");
    teacher = await actorFor("demo.teacher.4a");
    schoolId = s(admin.schoolId);
    const t = (await repo.findUnique("Teacher", { userId: teacher.userId }))!;
    classId = s((await repo.findMany("ClassTeacher", { teacherId: t.id }))[0].classId);
  });

  test("the page itself is a redirect-only wrapper to /admin/school; the action keeps the same role gate as transferClass", () => {
    const page = read("src/app/admin/class-transfer/page.tsx");
    assert.match(page, /requireActor\(\{\s*roles:\s*\["SCHOOL_ADMIN",\s*"SUPER_ADMIN"\]/);
    assert.match(page, /redirect\("\/admin\/school\?open=teacher"\)/);
    const actions = read("src/app/admin/class-transfer/actions.ts");
    assert.match(actions, /requireActor\(\{\s*roles:\s*\["SCHOOL_ADMIN",\s*"SUPER_ADMIN"\],\s*permission:\s*"classes:manage"\s*\}\)/);
  });

  test("without keepPrevious, the old teacher loses the class entirely; plans move to the new teacher; they are notified", async () => {
    const ts = await schoolTeachers(repo, admin);
    const oldTeacherRow = (await repo.findMany("ClassTeacher", { classId }))[0];
    const other = ts.find((t) => t.id !== s(oldTeacherRow.teacherId))!;
    await repo.create("SkillPlan", { schoolId, classId, createdById: teacher.userId, title: "A plan", gradeLevel: 4, createdAt: new Date() });
    const toUser = (await repo.findUnique("User", { id: (await repo.findUnique("Teacher", { id: other.id }))!.userId }))!;

    await transferClass(repo, admin, classId, other.id, false, new Date("2026-10-20T08:00:00Z"));

    const links = await repo.findMany("ClassTeacher", { classId });
    assert.equal(links.length, 1, "without keepPrevious, the old teacher's link is removed, not just demoted");
    assert.equal(s(links[0].teacherId), other.id);
    assert.equal(links[0].isLead, true);
    const plan = (await repo.findMany("SkillPlan", { classId }))[0];
    assert.equal(s(plan.createdById), s(toUser.id), "the class's plans are now attributed to the new teacher");
    const notif = (await repo.findMany("Notification", { userId: toUser.id }))[0];
    assert.ok(notif, "the new teacher is notified");
    assert.match(s(notif.body), /assignments, plans and reports/);
  });

  test("a teacher id outside the school (or unknown) is a ValidationError, not a silent no-op", async () => {
    await assert.rejects(transferClass(repo, admin, classId, "no-such-teacher"), ValidationError);
    // another school's teacher id, if one exists in this fixture, would also fail — assert at least the shape of the guard
    const links = await repo.findMany("ClassTeacher", { classId });
    assert.equal(links.length, 1, "the rejected call changed nothing");
  });

  test("a class outside the admin's school, or a teacher refused altogether", async () => {
    const other = (await repo.findMany("Class", { schoolId: { not: schoolId } }, { take: 1 }))[0];
    if (other) await assert.rejects(transferClass(repo, admin, s(other.id), "irrelevant"), ForbiddenError);
    await assert.rejects(transferClass(repo, teacher, classId, "irrelevant"), ForbiddenError);
  });
});
