/**
 * 👥 Admin → Users (src/server/admin/users.ts): list, create, update, teacher↔class assignment and parent↔child
 * links — everything scoped to the admin's own school, SUPER_ADMIN accounts never touched.
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import { verifyPassword } from "../src/server/auth/password";
import { ForbiddenError, type Actor } from "../src/server/auth/rbac";
import { ValidationError } from "../src/server/curriculum-admin";
import {
  AccountClashError, createUser, linkParent, listUsers, setTeacherClasses, unlinkParent, updateUser,
} from "../src/server/admin/users";
import { demoDatabase } from "./helpers/db";

const s = (v: unknown) => String(v ?? "");

describe("admin · users", () => {
  let repo: SqliteRepo; let admin: Actor; let teacher: Actor; let student: Actor; let schoolId: string;
  const now = new Date("2026-10-20T08:00:00Z");

  before(async () => {
    ({ repo } = await demoDatabase());
    admin = await resolveActor(repo, (await repo.findUnique("User", { username: "demo.admin" }))!);
    teacher = await resolveActor(repo, (await repo.findUnique("User", { username: "demo.teacher.4a" }))!);
    schoolId = s(admin.schoolId);
    const anyStudent = (await repo.findMany("User", { schoolId, role: "STUDENT" }))[0];
    student = await resolveActor(repo, anyStudent);
  });

  test("listUsers: filters by role and search text; inactive/removed accounts are hidden unless asked for", async () => {
    const all = await listUsers(repo, admin);
    assert.ok(all.some((u) => u.role === "TEACHER") && all.some((u) => u.role === "STUDENT"));
    const teachersOnly = await listUsers(repo, admin, { role: "TEACHER" });
    assert.ok(teachersOnly.every((u) => u.role === "TEACHER"));
    const { userId } = await createUser(repo, admin, { role: "TEACHER", username: "t.search.me", displayName: "Zed Findable" }, now);
    assert.ok((await listUsers(repo, admin, { q: "Findable" })).some((u) => u.userId === userId));
    await updateUser(repo, admin, userId, { isActive: false }, now);
    assert.ok(!(await listUsers(repo, admin, { q: "Findable" })).some((u) => u.userId === userId), "deactivated is hidden by default");
    assert.ok((await listUsers(repo, admin, { q: "Findable", includeInactive: true })).some((u) => u.userId === userId));
  });

  test("createUser: a new teacher gets a temporary password that must be changed; a clashing username names who holds it", async () => {
    const r = await createUser(repo, admin, { role: "TEACHER", username: "t.freshman", displayName: "Fresh Teacher" }, now);
    const u = (await repo.findUnique("User", { id: r.userId }))!;
    assert.equal(u.mustChangePassword, true);
    assert.ok(await verifyPassword(r.temporaryPassword, s(u.passwordHash)));
    await assert.rejects(createUser(repo, admin, { role: "TEACHER", username: "t.freshman", displayName: "Again" }, now), AccountClashError);
    await assert.rejects(createUser(repo, admin, { role: "TEACHER", username: "bad username!", displayName: "X" }, now), ValidationError);
  });

  test("createUser: a student gets the next free auto-number when none is given, and a used number is refused with who holds it", async () => {
    const r1 = await createUser(repo, admin, { role: "STUDENT", displayName: "Auto One", username: "s.auto1", gradeLevel: 4 }, now);
    assert.ok(r1.studentNumber);
    const r2 = await createUser(repo, admin, { role: "STUDENT", displayName: "Auto Two", username: "s.auto2", gradeLevel: 4, studentNumber: r1.studentNumber! }, now).catch((e) => e);
    assert.ok(r2 instanceof ValidationError);
    assert.match((r2 as Error).message, new RegExp(r1.studentNumber!));
  });

  test("updateUser: an admin cannot deactivate their own account; deactivating revokes sessions", async () => {
    await assert.rejects(updateUser(repo, admin, admin.userId, { isActive: false }, now), ValidationError);
    const { userId } = await createUser(repo, admin, { role: "TEACHER", username: "t.toggle", displayName: "Toggle Teacher" }, now);
    await repo.create("Session", { id: "test-session-hash", userId, version: 1, expiresAt: new Date(now.getTime() + 86_400_000), createdAt: now });
    await updateUser(repo, admin, userId, { isActive: false }, now);
    assert.equal(await repo.count("Session", { userId }), 0, "sessions revoked");
    await updateUser(repo, admin, userId, { displayName: "  Renamed   Teacher  " }, now);
    assert.equal((await repo.findUnique("User", { id: userId }))!.displayName, "Renamed Teacher");
  });

  test("setTeacherClasses: replaces the set exactly (adds and removes); only teachers may be assigned", async () => {
    const classes = await repo.findMany("Class", { schoolId, deletedAt: null });
    const { userId } = await createUser(repo, admin, { role: "TEACHER", username: "t.multi", displayName: "Multi Class" }, now);
    await setTeacherClasses(repo, admin, userId, [s(classes[0].id), s(classes[1].id)], now);
    const t = (await repo.findUnique("Teacher", { userId }))!;
    assert.equal(await repo.count("ClassTeacher", { teacherId: t.id }), 2);
    await setTeacherClasses(repo, admin, userId, [s(classes[0].id)], now);
    assert.equal(await repo.count("ClassTeacher", { teacherId: t.id }), 1);
    const anyStudentId = (await repo.findMany("User", { schoolId, role: "STUDENT" }))[0].id;
    await assert.rejects(setTeacherClasses(repo, admin, s(anyStudentId), [s(classes[0].id)], now), ValidationError);
  });

  test("linkParent / unlinkParent: only a parent-to-student link is accepted", async () => {
    const { userId: parentId } = await createUser(repo, admin, { role: "PARENT", username: "p.one", displayName: "One Parent" }, now);
    const studentUser = (await repo.findMany("User", { schoolId, role: "STUDENT" }))[1];
    await linkParent(repo, admin, parentId, s(studentUser.id), "mother", now);
    const parent = (await repo.findUnique("Parent", { userId: parentId }))!;
    const st = (await repo.findUnique("Student", { userId: studentUser.id }))!;
    assert.equal(await repo.count("ParentStudent", { parentId: parent.id, studentId: st.id }), 1);
    await assert.rejects(linkParent(repo, admin, s(studentUser.id), parentId, null, now), ValidationError, "roles reversed");
    await unlinkParent(repo, admin, parentId, s(studentUser.id));
    assert.equal(await repo.count("ParentStudent", { parentId: parent.id, studentId: st.id }), 0);
  });

  test("permission gate: a teacher cannot manage staff or students; a SUPER_ADMIN is never a manageable target", async () => {
    await assert.rejects(createUser(repo, teacher, { role: "TEACHER", username: "t.nope", displayName: "Nope" }, now), ForbiddenError);
    await assert.rejects(createUser(repo, teacher, { role: "STUDENT", username: "s.nope", displayName: "Nope", gradeLevel: 4 }, now), ForbiddenError);
    await assert.rejects(listUsers(repo, student), ForbiddenError);
    await assert.rejects(updateUser(repo, teacher, admin.userId, { displayName: "Hack" }, now), ForbiddenError);
    const superAdmin = (await repo.findMany("User", { role: "SUPER_ADMIN" }))[0];
    if (superAdmin) await assert.rejects(updateUser(repo, admin, s(superAdmin.id), { displayName: "Hack" }, now), ForbiddenError);
  });
});
