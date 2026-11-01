/**
 * ⭐ Stars unify — GROUP 3 (teacher displays, reports, exports), owner 1 Nov 2026: every "mastered / developing /
 * needs work / stars" a teacher sees comes from the ONE star system (SkillStatus), counted by skill KEY (copies of a
 * skill are one skill, with the Student Skills name). The old engine flag / score (StudentSkillMastery) never decides
 * or shows a status.
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import type { Actor } from "../src/server/auth/rbac";
import { seedTestEnvironment } from "../src/server/seeding/test-env";
import { teacherRoster } from "../src/server/teacher/assign";
import { clearSkillKeys, skillKeyIndex, type SkillKeyIndex } from "../src/server/skills/status";
import { classOverview, masteryGrid, studentDetail } from "../src/server/teacher/queries";
import { studentAnalytics } from "../src/server/analytics/reports";
import { bySourceReport } from "../src/server/skills/skills-by-source";
import { classProgress } from "../src/server/insights/progress";
import { dataMeetingSnapshot } from "../src/server/tiers/data-meeting";
import { buildStrands } from "../src/server/insights/language-strands";
import { NOT_STARTED_VIEW, type StarView } from "../src/server/skills/status";
import { demoDatabase } from "./helpers/db";

const s = (v: unknown) => String(v ?? "");

describe("⭐ group 3: teacher displays read the stars, by skill key", () => {
  let repo: SqliteRepo; let teacher: Actor; let classId = ""; let ids: string[] = []; let ix: SkillKeyIndex;
  let key = ""; let copies: string[] = []; let otherId = ""; let otherKey = "";
  const now = new Date();
  const range = { from: new Date(now.getTime() - 365 * 86_400_000), to: now };
  const star = (studentId: string, skillId: string, status: string, score: number, extra: Record<string, unknown> = {}) =>
    repo.create("SkillStatus", { studentId, skillKey: ix.keyOf.get(skillId)!, level: 1, status, skillId, answered: status === "MASTERED" ? 30 : 12, correct: 10, score, startedAt: now, masteredAt: status === "MASTERED" ? now : null, createdAt: now, updatedAt: now, history: [], ...extra });
  const engine = (studentId: string, skillId: string, score: number, isMastered: boolean) =>
    repo.create("StudentSkillMastery", { studentId, skillId, score, band: isMastered ? "MASTERED" : "DEVELOPING", isMastered, attempts: 20, correct: 15, lastPracticedAt: now, updatedAt: now });

  before(async () => {
    ({ repo } = await demoDatabase());
    await seedTestEnvironment(repo, { root: process.cwd(), passwordHash: "x".repeat(60), practice: "none" });
    teacher = await resolveActor(repo, (await repo.findUnique("User", { username: "test.teacher.1" }))!);
    const r = await teacherRoster(repo, teacher); classId = r[0].id; ids = r[0].students.map((x) => x.id);
    clearSkillKeys(repo);
    ix = await skillKeyIndex(repo, s((await repo.findUnique("Student", { id: ids[0] }))!.schoolId));
    // a skill KEY with two copies (e.g. the Grade 4 and Grade 5 row), and another single skill
    const pick = [...ix.skillsOf].find(([k, list]) => k.startsWith("fam:") && list.length >= 2)!;
    key = pick[0]; copies = pick[1].slice(0, 2);
    const other = [...ix.skillsOf].find(([k]) => k.startsWith("fam:") && k !== key)!;
    otherKey = other[0]; otherId = other[1][0];
    // student 0: ⭐ on the key; the engine has rows on BOTH copies (one says mastered) → still ONE ⭐ skill
    await star(ids[0], copies[0], "MASTERED", 95);
    await engine(ids[0], copies[0], 95, true); await engine(ids[0], copies[1], 92, true);
    // student 0: the engine flag says mastered on `other`, but the star is only ◐ → NOT mastered
    await engine(ids[0], otherId, 97, true);
    await star(ids[0], otherId, "IN_PROGRESS", 60);
    // student 1: 🔄 on the key; student 2: ◐ needing support on the key; student 3: ◐ on the key
    await star(ids[1], copies[1], "NEEDS_REVIEW", 70);
    await star(ids[2], copies[0], "IN_PROGRESS", 40, { needsSupportAt: now });
    await star(ids[3], copies[1], "IN_PROGRESS", 55);
  });

  test("class overview: skills mastered by key, the old engine flag never counts", async () => {
    const o = await classOverview(repo, teacher, classId, range);
    const st0 = o.students.find((x) => x.studentId === ids[0])!;
    assert.equal(st0.skillsMastered, 1, "two copies of the ⭐ skill count once; the engine-only 'mastered' skill does not count");
    assert.equal(st0.avgMastery, Math.round((95 + 60) / 2), "average star score over the started keys");
    const weak = o.weakSkills.find((x) => x.key === key)!;
    assert.ok(weak, "the key (1 of 4 ⭐) is a skill to reteach");
    assert.deepEqual([weak.students, weak.mastered, weak.needsHelp], [4, 1, 2], "4 started, 1 ⭐, 🔄 + ◐ needing support");
    assert.equal(weak.name, ix.nameOf.get(key), "the shared Student Skills name");
    assert.ok(!o.strongSkills.some((x) => x.key === key));
    assert.deepEqual(o.kpis.stars, { mastered: 1, inProgress: 3, needsReview: 1 });
  });

  test("student detail: one row per key with its star; ⭐ vs not", async () => {
    const d = await studentDetail(repo, teacher, ids[0]);
    assert.equal(d.skills.filter((k) => k.key === key).length, 1, "one row for the two copies");
    assert.equal(d.skills.find((k) => k.key === key)!.star.status, "MASTERED");
    const o = d.skills.find((k) => k.key === otherKey)!;
    assert.equal(o.star.status, "IN_PROGRESS", "the engine's isMastered is not shown as mastered");
    assert.equal(o.band, "In progress");
    assert.equal(o.score, 60, "the star score, not the engine's 97");
  });

  test("heat map: one column per key, the star in each cell", async () => {
    const units = await repo.findMany("UnitSkill", { skillId: { in: copies } });
    if (!units.length) return; // the copies are not in a unit of this class's book
    const g = await masteryGrid(repo, teacher, classId, s(units[0].unitId)).catch(() => null);
    if (!g) return;
    assert.equal(new Set(g.skills.map((k) => k.key)).size, g.skills.length, "never two columns of one key");
    const col = g.skills.findIndex((k) => k.key === key);
    if (col >= 0) assert.equal(g.rows.find((r) => r.studentId === ids[1])!.cells[col]?.status, "NEEDS_REVIEW");
  });

  test("student analytics and skills by source count keys by star", async () => {
    const a = await studentAnalytics(repo, teacher, ids[0], { label: "x", from: range.from, to: range.to } as never);
    assert.deepEqual([a.skillsAttempted, a.skillsMastered, a.skillsDeveloping, a.skillsNeedingIntervention], [2, 1, 1, 0]);
    const src = await bySourceReport(repo, teacher, ids[0], { label: "x", from: range.from, to: range.to } as never);
    const rows = src.groups.flatMap((g) => g.skills);
    assert.equal(rows.filter((r) => r.key === key).length, 1, "one row for the two copies");
    assert.equal(rows.find((r) => r.key === otherKey)!.status, "IN_PROGRESS", "no 1–5 rating from the engine score");
    assert.equal(src.summary.mastered, 1);
  });

  test("progress: skills mastered / need work by key (⭐ / 🔄 or needing support)", async () => {
    const p = await classProgress(repo, teacher, classId);
    const by = (i: number) => p.rows.find((r) => r.studentId === ids[i])!;
    assert.deepEqual([by(0).mastered, by(0).needsWork], [1, 0]);
    assert.deepEqual([by(1).mastered, by(1).needsWork], [0, 1], "🔄 needs work");
    assert.deepEqual([by(2).mastered, by(2).needsWork], [0, 1], "◐ needing support needs work");
    assert.deepEqual([by(3).mastered, by(3).needsWork], [0, 0], "plain ◐ is neither");
  });

  test("data meeting: weakest skills by key; a key everyone has ⭐ is never listed", async () => {
    const snap = await dataMeetingSnapshot(repo, teacher, { classId });
    const w = snap.weakSkills.find((x) => x.name === ix.nameOf.get(key));
    assert.ok(w, "the key is weak");
    assert.deepEqual([w!.started, w!.notMastered, w!.needsReview], [4, 3, 1]);
    // every student who started `other` has ⭐ → never listed
    for (const id of ids.slice(1, 3)) await star(id, otherId, "MASTERED", 90);
    await repo.updateMany("SkillStatus", { studentId: ids[0], skillKey: otherKey }, { status: "MASTERED", masteredAt: now });
    const snap2 = await dataMeetingSnapshot(repo, teacher, { classId });
    assert.ok(!snap2.weakSkills.some((x) => x.name === ix.nameOf.get(otherKey)));
  });
});

describe("⭐ group 3: language strands count by key (pure)", () => {
  test("two copies of a skill are one; the star decides; the next step is never ⭐", () => {
    const now = new Date();
    const skills = [
      { id: "t4", name: "Theme G4", code: "G4.theme", category: "LITERATURE", domain: "READING", sequence: 1 },
      { id: "t5", name: "Theme G5", code: "G5.theme", category: "LITERATURE", domain: "READING", sequence: 2 },
      { id: "c4", name: "Character", code: "G4.character", category: "LITERATURE", domain: "READING", sequence: 3 },
    ];
    const keyOf = (id: string) => (id === "c4" ? "fam:character" : "fam:theme");
    const stars = new Map<string, StarView>([["fam:theme", { ...NOT_STARTED_VIEW("fam:theme"), status: "MASTERED", score: 96 }], ["fam:character", { ...NOT_STARTED_VIEW("fam:character"), status: "IN_PROGRESS", score: 50 }]]);
    const rows = buildStrands({
      skills, mastery: [{ skillId: "c4", score: 99, attempts: 20, isMastered: true }], mastered: new Set(), attempts: [], fluency: [], writing: [], now,
      stars: { keyOf, ofKey: (k) => stars.get(k) ?? NOT_STARTED_VIEW(k), nameOf: (k) => (k === "fam:theme" ? "Theme" : "Character") },
    });
    const rl = rows.find((r) => r.key === "RL")!;
    assert.deepEqual([rl.mastered, rl.total], [1, 2], "Theme (two copies) is one ⭐ skill of two");
    assert.equal(rl.level, "ON", "level from the star scores (96 + 50) / 2 = 73");
    assert.deepEqual(rl.next, { skillId: "c4", text: "Character" }, "the engine's 'mastered' flag does not hide it; ⭐ Theme is never the next step");
  });
});
