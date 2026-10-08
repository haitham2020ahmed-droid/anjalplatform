import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import type { Actor } from "../src/server/auth/rbac";
import { seedTestEnvironment } from "../src/server/seeding/test-env";
import { parseCurriculumMap } from "../src/server/curriculum-map/source";
import { seedCurriculumMap } from "../src/server/curriculum-map/seed";
import { teacherRoster } from "../src/server/teacher/assign";
import { importMapScores, MAP_TEMPLATE_HEADERS } from "../src/server/map/student-map";
import { personalPlan, areaMatchesStandard } from "../src/server/map/personal-plan";
import { createDraft } from "../src/server/admin/questions";
import { itemQuality } from "../src/server/admin/item-quality";
import { interventionBoard } from "../src/server/teacher/intervention";
import { parentSummary } from "../src/server/student/parent-summary";
import { recordLevel } from "../src/server/curriculum-map/student-level";
import { demoDatabase } from "./helpers/db";

describe("📊→📋→⭐→📈 the data-driven cycle: plan results, question quality, spaced review, parents", () => {
  let repo: SqliteRepo; let admin: Actor; let teacher: Actor; let classId: string; let kids: string[]; let grade: number;
  const sessions = new Map<string, string>();
  const sessionOf = async (sid: string) => { if (!sessions.has(sid)) sessions.set(sid, String((await repo.create("PracticeSession", { studentId: sid, skillId: null, mode: "ADAPTIVE_PRACTICE", startedAt: new Date() })).id)); return sessions.get(sid)!; };
  const attempt = async (sid: string, qid: string, skillId: unknown, ok: boolean, daysAgo: number, value = "A") =>
    repo.create("QuestionAttempt", { sessionId: await sessionOf(sid), studentId: sid, questionId: qid, skillId, response: { value }, isCorrect: ok, partialCredit: null, responseMs: 9000, usedHint: false, rapidGuess: false, difficultyB: 0, createdAt: new Date(Date.now() - daysAgo * 86_400_000) });
  before(async () => {
    ({ repo } = await demoDatabase());
    await seedTestEnvironment(repo, { root: process.cwd(), passwordHash: "x".repeat(60), practice: "none" });
    admin = await resolveActor(repo, (await repo.findUnique("User", { username: "test.admin" }))!);
    teacher = await resolveActor(repo, (await repo.findUnique("User", { username: "test.teacher.1" }))!);
    await seedCurriculumMap(repo, parseCurriculumMap(readFileSync("data/curriculum-map/source.txt", "utf8")), { schoolId: admin.schoolId! });
    const r = (await teacherRoster(repo, teacher))[0]; classId = r.id; kids = r.students.map((x) => x.id);
    grade = Number((await repo.findUnique("Grade", { id: (await repo.findUnique("Class", { id: classId }))!.gradeId }))!.level);
    const H = [...MAP_TEMPLATE_HEADERS], at = (h: string) => H.indexOf(h), table = [H];
    for (const [i, pct] of [[0, 8], [1, 20], [2, 50], [3, 80]] as const) {
      const row = H.map(() => ""); row[0] = String((await repo.findUnique("Student", { id: kids[i] }))!.studentNumber);
      row[at("Reading Fall RIT")] = String(170 + i * 10); row[at("Reading Fall Percentile")] = String(pct);
      row[at("R: Literary Theme")] = "160"; row[at("R: Vocabulary")] = "180"; row[at("R: Info Central Idea")] = "175"; table.push(row);
    }
    await importMapScores(repo, teacher, table, 2026);
  });

  test("standards link answers to MAP goal areas", () => {
    assert.ok(areaMatchesStandard("Literary Text: Analyze Theme", "CCSS.ELA-LITERACY.RL.4.2"));
    assert.ok(!areaMatchesStandard("Literary Text: Analyze Theme", "RL.4.4"), "RL.x.4 is vocabulary");
    assert.ok(areaMatchesStandard("Vocabulary: Acquisition and Use", "L.4.4.a"));
    assert.ok(areaMatchesStandard("Informational Text: Central Idea", "RI.4.2"));
  });

  test("📈 the plan shows results under each goal, and each group's level moves", async () => {
    const q = await createDraft(repo, admin, { skillId: "", type: "MULTIPLE_CHOICE", stem: "What is the theme of the cycle story?", level: 4, whyCorrect: "x", standardCode: `CCSS.ELA-LITERACY.RL.${grade}.2`, mapNodeCode: `G${grade}.U1.TS2.ACS.BELOW`, options: [{ label: "A", text: "kindness", correct: true, rationale: null }, { label: "B", text: "speed", correct: false, rationale: "n" }] });
    const skillId = (await repo.findUnique("Question", { id: q }))!.skillId;
    for (const sid of [kids[0], kids[1]]) { for (let d = 0; d < 6; d++) await attempt(sid, q, skillId, d < 4, 20); for (let d = 0; d < 6; d++) await attempt(sid, q, skillId, true, 3); }
    await recordLevel(repo, { studentId: kids[0], level: "ON", source: "ADAPTIVE", answers: 10, category: "ACS" });
    await recordLevel(repo, { studentId: kids[0], level: "ABOVE", source: "ADAPTIVE", answers: 10, category: "ACS" });
    const p = await personalPlan(repo, teacher, classId, "READING");
    const below = p.bands.find((b) => b.band === "BELOW")!;
    const lit = below.goals.find((g) => /Literary/.test(g.area))!;
    assert.deepEqual([lit.result!.practiced, lit.result!.answers, lit.result!.accuracy], [2, 24, 83]);
    assert.equal(lit.result!.trend, 33, "accuracy rose from 67% to 100% in the last two weeks");
    assert.equal(below.goals.find((g) => /Vocabulary/.test(g.area))?.result?.answers ?? 0, 0);
    assert.deepEqual(below.moves, { up: 1, down: 0 }, "Below→On is not counted (no ‘from’ level yet), On→Above is one move up");
  });

  test("🔬 question quality: too easy for its level, and an option nobody chose", async () => {
    const q = await createDraft(repo, admin, { skillId: "", type: "MULTIPLE_CHOICE", stem: "An easy Above question for the quality report?", level: 5, whyCorrect: "x", mapNodeCode: `G${grade}.U1.TS1.ACS.ABOVE`, options: ["A", "B", "C", "D"].map((l, i) => ({ label: l, text: `option ${l}`, correct: i === 0, rationale: i ? "n" : null })) });
    await repo.updateMany("Question", { id: q }, { status: "PUBLISHED" });
    const skillId = (await repo.findUnique("Question", { id: q }))!.skillId;
    for (let i = 0; i < 32; i++) await attempt(kids[i % kids.length], q, skillId, i !== 0, 2, i === 0 ? "B" : "A");
    const { rows } = await itemQuality(repo, admin);
    const r = rows.find((x) => x.id === q)!;
    assert.ok(r.flags.includes("TOO_EASY") && r.flags.includes("UNUSED_OPTION"));
    assert.deepEqual(r.unused, ["C", "D"]);
  });

  test("🔁 spaced review: a skill mastered 3+ weeks ago and not practised since", async () => {
    const skill = (await repo.findMany("Skill", {}))[0];
    const old = new Date(Date.now() - 30 * 86_400_000);
    await repo.upsert("StudentSkillMastery", { studentId_skillId: { studentId: kids[3], skillId: skill.id } } as never, { studentId: kids[3], skillId: skill.id, score: 0.95, band: "MASTERED", attempts: 20, correct: 19, isMastered: true, masteredAt: old, lastPracticedAt: old, updatedAt: old } as never, { isMastered: true, masteredAt: old, lastPracticedAt: old } as never).catch(async () => {
      await repo.create("StudentSkillMastery", { studentId: kids[3], skillId: skill.id, score: 0.95, band: "MASTERED", attempts: 20, correct: 19, maxLevelCorrect: 5, isMastered: true, masteredAt: old, lastPracticedAt: old, updatedAt: old });
    });
    const b = await interventionBoard(repo, teacher);
    const row = b.rows.find((x) => x.studentId === kids[3])!;
    assert.ok(row.flags.some((f) => f.flag === "REVIEW"));
    assert.deepEqual(row.reviewSkills.map((k) => k.id), [String(skill.id)]);
  });

  test("👪 the parent summary: practice, accuracy, the MAP goal and a tip from the data", async () => {
    const s = await parentSummary(repo, teacher, kids[0]);
    assert.ok(s.answers30 >= 12);
    assert.equal(s.map?.rit, 170);
    assert.ok(s.tip.en.length > 10 && s.tip.ar.length > 10);
    assert.deepEqual(s.categories.map((c) => c.level), ["ABOVE"]);
  });
});
