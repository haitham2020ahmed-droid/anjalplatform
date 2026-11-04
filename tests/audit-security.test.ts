/**
 * Audit fixes: client IP from the trusted proxy, a per-username failed-login budget across IPs,
 * cross-school writes/reads refused, and the parent report's "mastered" from the adaptive engine.
 * Runs on the demo school + the fake Test School (two schools in one database).
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { DEFAULT_AUTH } from "../src/server/auth/config";
import { clientIp } from "../src/server/auth/http";
import { login } from "../src/server/auth/login";
import { resolveActor } from "../src/server/auth/actor";
import { ForbiddenError, type Actor } from "../src/server/auth/rbac";
import { seedTestEnvironment } from "../src/server/seeding/test-env";
import { confirmMetadata, confirmSkillMetadata } from "../src/server/questions/intelligence";
import { deleteComment } from "../src/server/teacher/classroom";
import { deleteNote } from "../src/server/teacher/extras";
import { readQuestionImage } from "../src/server/admin/question-images";
import { parentReport } from "../src/server/insights/parent-report";
import { skillKeyIndex } from "../src/server/skills/status";
import { demoDatabase } from "./helpers/db";

const hdrs = (h: Record<string, string>) => ({ get: (n: string) => h[n.toLowerCase()] ?? null });

describe("clientIp: the address appended by the trusted proxy", () => {
  test("right-most X-Forwarded-For entry by default; a spoofed left-most value is ignored", () => {
    assert.equal(clientIp(hdrs({ "x-forwarded-for": "1.2.3.4, 203.0.113.9" }), 1), "203.0.113.9");
    assert.equal(clientIp(hdrs({ "x-forwarded-for": "6.6.6.6" }), 1), "6.6.6.6");
    assert.equal(clientIp(hdrs({ "x-forwarded-for": " 9.9.9.9 ,  10.1.1.1 " })), "10.1.1.1", "TRUSTED_PROXY_HOPS defaults to 1");
  });
  test("TRUSTED_PROXY_HOPS picks the Nth from the right; fewer entries → the left-most", () => {
    assert.equal(clientIp(hdrs({ "x-forwarded-for": "1.1.1.1, 2.2.2.2, 3.3.3.3" }), 2), "2.2.2.2");
    assert.equal(clientIp(hdrs({ "x-forwarded-for": "2.2.2.2" }), 3), "2.2.2.2");
  });
  test("behind Cloudflare (Render): CF-Connecting-IP / True-Client-IP win over a forged X-Forwarded-For", () => {
    assert.equal(clientIp(hdrs({ "cf-connecting-ip": "198.51.100.7", "x-forwarded-for": "6.6.6.6, 172.70.1.1" })), "198.51.100.7");
    assert.equal(clientIp(hdrs({ "true-client-ip": "198.51.100.8", "x-forwarded-for": "6.6.6.6" })), "198.51.100.8");
  });
  test("no X-Forwarded-For: X-Real-IP, else unknown", () => {
    assert.equal(clientIp(hdrs({ "x-real-ip": "5.5.5.5" })), "5.5.5.5");
    assert.equal(clientIp(hdrs({})), "unknown");
  });
});

describe("audit fixes on two schools", () => {
  let repo: SqliteRepo;
  let demoAdmin: Actor, testAdmin: Actor;
  const actorOf = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);
  const schoolSkill = async (schoolId: string): Promise<string> => {
    const g = (await repo.findMany("Grade", { schoolId }))[0];
    const c = (await repo.findMany("Curriculum", { gradeId: g.id }))[0];
    const qs = await repo.findMany("Question", {}, { select: ["skillId"] });
    const ks = await repo.findMany("Skill", { curriculumId: c.id }, { select: ["id"] });
    return String((ks.find((k) => qs.some((q) => q.skillId === k.id)) ?? ks[0]).id);
  };

  before(async () => {
    ({ repo } = await demoDatabase({ classesPerGrade: 1, studentsPerClass: 2 }));
    await seedTestEnvironment(repo, { root: process.cwd(), passwordHash: "x".repeat(60), practice: "none" });
    [demoAdmin, testAdmin] = await Promise.all(["demo.admin", "test.admin"].map(actorOf));
    assert.notEqual(demoAdmin.schoolId, testAdmin.schoolId);
  });

  test("login: one username is limited across many IPs (failed attempts), lockout still applies", async () => {
    const t0 = new Date("2026-10-05T07:00:00Z");
    let last;
    for (let i = 0; i < 30; i++) last = await login(repo, { username: "nobody.at.all", password: "wrong-password", ip: `198.51.100.${i}` }, DEFAULT_AUTH, t0);
    assert.equal(last!.ok, false);
    assert.equal(!last!.ok && last!.error, "RATE_LIMITED", "a distributed guess is stopped even with a new IP each time");
  });

  test("confirming metadata: a skill of another school is refused; foreign question ids are ignored", async () => {
    const demoSkill = await schoolSkill(demoAdmin.schoolId!);
    await assert.rejects(confirmSkillMetadata(repo, testAdmin, demoSkill), ForbiddenError);
    const demoQs = (await repo.findMany("Question", { skillId: demoSkill }, { select: ["id"] })).map((q) => String(q.id));
    assert.ok(demoQs.length > 0);
    assert.equal(await confirmMetadata(repo, testAdmin, demoQs), 0, "never confirms another school's questions");
    assert.ok((await repo.findMany("Question", { id: { in: demoQs } })).every((q) => !q.metaReviewedAt));
    assert.ok((await confirmSkillMetadata(repo, demoAdmin, demoSkill)) > 0, "the owning school can");
  });

  test("comments and notes of another school cannot be deleted, even by an admin", async () => {
    const demoStudent = (await repo.findMany("Student", { schoolId: demoAdmin.schoolId }))[0];
    const c = await repo.create("WorkComment", { schoolId: demoAdmin.schoolId, studentId: demoStudent.id, authorId: demoAdmin.userId, body: "Well done", createdAt: new Date() });
    const n = await repo.create("TeacherNote", { schoolId: demoAdmin.schoolId, studentId: demoStudent.id, authorId: demoAdmin.userId, body: "A note", createdAt: new Date() });
    await assert.rejects(deleteComment(repo, testAdmin, String(c.id)), ForbiddenError);
    await assert.rejects(deleteNote(repo, testAdmin, String(n.id)), ForbiddenError);
    assert.ok(await repo.findUnique("WorkComment", { id: c.id }));
    assert.ok(await repo.findUnique("TeacherNote", { id: n.id }));
    await deleteComment(repo, demoAdmin, String(c.id));
    assert.equal(await repo.findUnique("WorkComment", { id: c.id }), null);
  });

  test("question images: only the school that uses or uploaded them", async () => {
    const img = await repo.create("QuestionImage", { mime: "image/png", bytes: Buffer.from([1, 2, 3]), size: 3, width: 1, height: 1, sha256: "a".repeat(64), altText: null, createdById: demoAdmin.userId, createdAt: new Date() });
    assert.ok(await readQuestionImage(repo, String(img.id), demoAdmin.schoolId), "uploader's school");
    assert.equal(await readQuestionImage(repo, String(img.id), testAdmin.schoolId), null, "another school: not found");
    const testQ = (await repo.findMany("Question", { skillId: await schoolSkill(testAdmin.schoolId!) }))[0];
    await repo.updateMany("Question", { id: testQ.id }, { imageId: img.id });
    assert.ok(await readQuestionImage(repo, String(img.id), testAdmin.schoolId), "a school whose question uses it");
  });

  // ⭐ owner (1 Nov 2026): the parent report reads the ONE skill status (stars, by key) — the engine flag alone (and
  // lifetime accuracy) never decide it
  test("parent report: mastered and 'practise next' come from the stars, not the engine flag or lifetime accuracy", async () => {
    const st = (await repo.findMany("Student", { schoolId: testAdmin.schoolId }))[0];
    const skills = (await repo.findMany("Skill", {}, { select: ["id", "name"] })).filter((k) => k.name).slice(0, 2);
    const g = (await repo.findMany("Grade", { schoolId: testAdmin.schoolId }))[0];
    const cur = (await repo.findMany("Curriculum", { gradeId: g.id }))[0];
    const mine = (await repo.findMany("Skill", { curriculumId: cur.id }, { select: ["id", "name"] })).slice(0, 2);
    const [accurate, engine] = mine.length === 2 ? mine : skills;
    await repo.deleteMany("StudentSkillMastery", { studentId: st.id });
    // 20/20 correct but the engine has not decided mastery (e.g. only easy items)
    await repo.create("StudentSkillMastery", { studentId: st.id, skillId: accurate.id, score: 55, band: "DEVELOPING", attempts: 20, correct: 20, isMastered: false });
    // the engine says mastered although lifetime accuracy is under 80%
    await repo.create("StudentSkillMastery", { studentId: st.id, skillId: engine.id, score: 92, band: "MASTERED", attempts: 12, correct: 8, isMastered: true });
    // the engine flag alone shows nothing as mastered
    const before0 = await parentReport(repo, testAdmin, String(st.id));
    assert.deepEqual(before0.completed, [], "isMastered without ⭐ is not a completed skill");
    // the stars: ⭐ on the "accurate" skill, ◐ on the engine-mastered one
    const ix = await skillKeyIndex(repo, String(st.schoolId));
    const now = new Date();
    const keyOf = (id: unknown) => ix.keyOf.get(String(id))!;
    await repo.create("SkillStatus", { studentId: st.id, skillKey: keyOf(accurate.id), level: 1, status: "MASTERED", skillId: accurate.id, answered: 30, correct: 30, score: 90, startedAt: now, masteredAt: now, createdAt: now, updatedAt: now, history: [] });
    await repo.create("SkillStatus", { studentId: st.id, skillKey: keyOf(engine.id), level: 1, status: "IN_PROGRESS", skillId: engine.id, answered: 12, correct: 8, score: 60, startedAt: now, createdAt: now, updatedAt: now, history: [] });
    const r = await parentReport(repo, testAdmin, String(st.id));
    assert.deepEqual(r.completed, [ix.nameOf.get(keyOf(accurate.id))]);
    assert.deepEqual(r.practiseNext, [ix.nameOf.get(keyOf(engine.id))], "◐ → practise next, even with the engine flag");
    assert.ok(!r.practiseNext.includes(String(ix.nameOf.get(keyOf(accurate.id)))));
  });
});

describe("shared catalogue (standards, skill families)", () => {
  test("a test-school admin cannot change it once a real school exists", async () => {
    const { repo } = await demoDatabase({ classesPerGrade: 1, studentsPerClass: 1 });
    await seedTestEnvironment(repo, { root: process.cwd(), passwordHash: "x".repeat(60), practice: "none" });
    const { assertCanEditSharedCatalogue } = await import("../src/server/curriculum-manage");
    const of = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);
    const [demoAdmin, testAdmin] = [await of("demo.admin"), await of("test.admin")];
    await assertCanEditSharedCatalogue(repo, testAdmin); // only demo/test schools: allowed
    await repo.updateMany("School", { id: demoAdmin.schoolId }, { isDemo: false }); // the demo school becomes the real one
    await assert.rejects(assertCanEditSharedCatalogue(repo, testAdmin), ForbiddenError);
    await assertCanEditSharedCatalogue(repo, demoAdmin); // the single real school's admin still can
  });
});
