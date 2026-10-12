/**
 * 📝 Bulk review of the “needs review” skill links: accept every confident guess (≥ 0.8), accept a group's ticked
 * rows, improve the guesses with AI (mocked provider; only candidate skill ids are accepted), admins only.
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import { ForbiddenError, type Actor } from "../src/server/auth/rbac";
import { seedQuestions } from "../src/server/seeding/questions";
import { loadBank } from "../src/server/seeding/load-files";
import { DEMO_SCHOOL_CODE } from "../src/server/seeding/demo";
import { isHiddenSkill } from "../src/server/skills/master";
import { acceptConfidentBatch, acceptGroup, AI_REASON, aiProgress, confidentCount, improveGuessesBatch, reviewGroupRows, reviewGroups } from "../src/server/questions/link-review-bulk";
import type { Picked } from "../src/server/ai/engine";
import { demoDatabase, ROOT } from "./helpers/db";

const s = (v: unknown) => String(v ?? "");

describe("skill links · bulk review", () => {
  let repo: SqliteRepo; let admin: Actor; let teacher: Actor; let schoolId: string;
  let skills: { id: string; name: string }[] = [];
  let qIds: string[] = [];
  let n = 0;
  const row = (subjectId: string, guess: { id: string; name: string } | null, confidence: number, extra: Record<string, unknown> = {}) =>
    repo.create("SkillLinkReview", { id: `rev${String(++n).padStart(3, "0")}`, schoolId, kind: "QUESTION", subjectId, excerpt: `question ${n}`, guessId: guess?.id ?? null, guessLabel: guess?.name ?? null, confidence, reason: "rule", status: "OPEN", ...extra });
  const status = async (id: string) => s((await repo.findUnique("SkillLinkReview", { id }))!.status);
  const skillOfQ = async (id: string) => s((await repo.findUnique("Question", { id }))!.skillId);

  before(async () => {
    ({ repo } = await demoDatabase());
    await seedQuestions(repo, { schoolCode: DEMO_SCHOOL_CODE, bank: loadBank(ROOT) });
    admin = await resolveActor(repo, (await repo.findUnique("User", { username: "demo.admin" }))!);
    teacher = await resolveActor(repo, (await repo.findUnique("User", { username: "demo.teacher.4a" }))!);
    schoolId = s(admin.schoolId);
    const g4 = (await repo.findMany("Grade", { schoolId, level: 4 }))[0];
    const cur = await repo.findMany("Curriculum", { gradeId: g4.id });
    skills = (await repo.findMany("Skill", { curriculumId: { in: cur.map((c) => c.id) }, isActive: true, deletedAt: null }, { select: ["id", "name", "code"] }))
      .filter((k) => !isHiddenSkill(k.code)).map((k) => ({ id: s(k.id), name: s(k.name) }));
    assert.ok(skills.length >= 4, "Grade 4 has skills");
    const qs = await repo.findMany("Question", { skillId: { in: skills.map((k) => k.id) }, deletedAt: null }, { select: ["id", "skillId"], take: 40 });
    // questions not already on the skills we move them to
    qIds = qs.filter((q) => ![skills[0].id, skills[1].id, skills[2].id].includes(s(q.skillId))).map((q) => s(q.id));
    assert.ok(qIds.length >= 12);
  });

  test("accept all confident guesses: only rows ≥ 0.8 with a guess are linked", async () => {
    const a = await row(qIds[0], skills[0], 0.9), b = await row(qIds[1], skills[1], 0.8), c = await row(qIds[2], skills[0], 0.79), d = await row(qIds[3], null, 0.95);
    const before3 = await skillOfQ(qIds[2]);
    assert.equal(await confidentCount(repo, admin), 2, "preview count");
    let after: string | null = null, linked = 0;
    for (let i = 0; i < 10; i++) { const r = await acceptConfidentBatch(repo, admin, after); linked += r.linked; if (r.done || !r.next) break; after = r.next; }
    assert.equal(linked, 2);
    assert.deepEqual([await status(s(a.id)), await status(s(b.id)), await status(s(c.id)), await status(s(d.id))], ["APPROVED", "APPROVED", "OPEN", "OPEN"]);
    assert.equal(await skillOfQ(qIds[0]), skills[0].id);
    assert.equal(await skillOfQ(qIds[1]), skills[1].id);
    assert.equal(await skillOfQ(qIds[2]), before3, "below 0.8 is not moved");
    assert.equal(await confidentCount(repo, admin), 0);
  });

  test("group view: counts per suggested skill; accept the ticked rows, the unticked stay open", async () => {
    const g = [await row(qIds[4], skills[2], 0.5), await row(qIds[5], skills[2], 0.6), await row(qIds[6], skills[2], 0.4)];
    const groups = await reviewGroups(repo, admin);
    assert.equal(groups.find((x) => x.label === skills[2].name)?.count, 3);
    assert.ok(groups.some((x) => x.label === ""), "rows without a guess form their own group");
    const page = await reviewGroupRows(repo, admin, skills[2].name, 1);
    assert.equal(page.total, 3);
    assert.deepEqual(page.rows.map((r) => r.id).sort(), g.map((r) => s(r.id)).sort());
    assert.ok((page.skillsByGrade[4] ?? []).some((k) => k.id === skills[0].id), "skills to move to");
    const r = await acceptGroup(repo, admin, [s(g[0].id), s(g[1].id)]);
    assert.equal(r.linked, 2);
    assert.deepEqual([await status(s(g[0].id)), await status(s(g[1].id)), await status(s(g[2].id))], ["APPROVED", "APPROVED", "OPEN"]);
    assert.equal(await skillOfQ(qIds[4]), skills[2].id);
    assert.notEqual(await skillOfQ(qIds[6]), skills[2].id);
  });

  test("improve guesses with AI: only candidate skill ids are saved; question text and skill names only", async () => {
    await repo.deleteMany("SkillLinkReview", { schoolId });
    const r = [await row(qIds[7], skills[3], 0.3), await row(qIds[8], skills[3], 0.3), await row(qIds[9], null, 0), await row(qIds[10], skills[3], 0.3)];
    const bodies: string[] = [];
    const provider = {
      async complete(_system: string, user: string) {
        bodies.push(user);
        const u = JSON.parse(user) as { candidateSkills: Record<string, { key: string; skill: string }[]>; questions: { q: string; grade: number }[] };
        const list = u.candidateSkills.grade4;
        const key = list.find((k) => k.skill === skills[1].name)!.key;
        return "```json\n" + JSON.stringify({ results: [
          { q: "q1", skill: key, confidence: 0.92 },                     // valid
          { q: "q2", skill: "99.1", confidence: 0.99 },                  // not a candidate → ignored
          { q: "q3", skill: skills[0].id, confidence: 0.9 },             // a raw id instead of a key → ignored
          { q: "q4", skill: key, confidence: 7 },                        // valid, clamped to 1
        ] }) + "\n```";
      },
    };
    const picked = { ok: true, provider, name: "gemini", model: "test" } as unknown as Picked;
    assert.deepEqual(await aiProgress(repo, admin), { total: 4, improved: 0 });
    const b = await improveGuessesBatch(repo, admin, {}, { picked });
    assert.equal(bodies.length, 1, "one request for the batch");
    assert.equal(b.processed, 4); assert.equal(b.improved, 2);
    const after = await Promise.all(r.map((x) => repo.findUnique("SkillLinkReview", { id: x.id })));
    assert.deepEqual([s(after[0]!.guessLabel), Number(after[0]!.confidence), s(after[0]!.reason)], [skills[1].name, 0.92, AI_REASON]);
    assert.ok(skills.some((k) => k.id === s(after[0]!.guessId) && k.name === skills[1].name), "a Grade 4 candidate id");
    assert.deepEqual([s(after[1]!.guessId), s(after[1]!.reason)], [skills[3].id, "rule"], "an id outside the candidates is ignored");
    assert.equal(after[2]!.guessId, null);
    assert.equal(Number(after[3]!.confidence), 1);
    // nothing about students; the question ids stay on the server
    assert.doesNotMatch(bodies[0], /student|studentId|username|email|rev\d/i);
    assert.ok(!qIds.slice(7, 11).some((id) => bodies[0].includes(id)));
    assert.deepEqual(await aiProgress(repo, admin), { total: 4, improved: 2 });
    // resumed: rows improved by AI are skipped
    const b2 = await improveGuessesBatch(repo, admin, {}, { picked });
    assert.equal(b2.processed, 2);
    // the school's limit (4 a minute by default) makes the page wait; the provider is not called
    const calls = bodies.length;
    for (let i = 0; i < 4; i++) await repo.create("AiRequestLog", { schoolId, tool: "SKILL_LINK", provider: "gemini", model: "test", ok: true, items: 1, ms: 1, error: null, createdAt: new Date() });
    const w = await improveGuessesBatch(repo, admin, {}, { picked });
    assert.ok(w.waitMs > 0 && !w.stop);
    assert.equal(bodies.length, calls);
  });

  test("admins only: a teacher is refused", async () => {
    const id = s((await repo.findMany("SkillLinkReview", { schoolId, status: "OPEN" }))[0].id);
    await assert.rejects(confidentCount(repo, teacher), ForbiddenError);
    await assert.rejects(acceptConfidentBatch(repo, teacher, null), ForbiddenError);
    await assert.rejects(reviewGroups(repo, teacher), ForbiddenError);
    await assert.rejects(reviewGroupRows(repo, teacher, "x"), ForbiddenError);
    await assert.rejects(acceptGroup(repo, teacher, [id]), ForbiddenError);
    await assert.rejects(improveGuessesBatch(repo, teacher, {}), ForbiddenError);
    await assert.rejects(aiProgress(repo, teacher), ForbiddenError);
    assert.equal(await status(id), "OPEN");
  });
});
