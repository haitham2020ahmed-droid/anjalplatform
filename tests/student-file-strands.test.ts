/**
 * 🧭 The ONE student file's language profile (owner r67 point 7) and ReadRise level chart (point 10) — demo school in
 * memory, never a real database: the seven strands (level for staff, skills mastered x of y from the one "mastered"
 * adapter, trend ↑ → ↓ over 4 weeks, the next step), Fluency from the one-minute readings, the ReadRise level journey
 * ("ReadRise level", never Lexile), and the merged student pages.
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { demoDatabase } from "./helpers/db";
import { resolveActor } from "../src/server/auth/actor";
import type { Actor } from "../src/server/auth/rbac";
import { buildStrands, languageStrands, STRANDS, strandLevel, strandOfSkill, trendOf } from "../src/server/insights/language-strands";
import { masteredSkills, MASTERED_SCORE } from "../src/server/reports/mastered-count";
import { studentFileInsights } from "../src/server/insights/student-file-insights";

const ROOT = process.cwd();
const read = (f: string) => readFileSync(join(ROOT, f), "utf8");
const s = (v: unknown) => String(v ?? "");
const DAY = 86_400_000;

describe("🧭 language strands (pure)", () => {
  test("every skill finds its strand; levels; the 4-week trend", () => {
    assert.deepEqual(STRANDS.map((x) => x.label), ["Reading Literature", "Reading Informational", "Vocabulary", "Grammar & Usage", "Mechanics", "Writing", "Fluency"]);
    assert.equal(strandOfSkill({ category: "LITERATURE", code: "G4.theme" }), "RL");
    assert.equal(strandOfSkill({ category: "INFORMATIONAL", code: "G4.text-features" }), "RI");
    assert.equal(strandOfSkill({ category: "COMPREHENSION", code: "G4.theme" }), "RL", "a story skill");
    assert.equal(strandOfSkill({ category: "COMPREHENSION", code: "G4.central-idea" }), "RI");
    assert.equal(strandOfSkill({ category: "VOCABULARY", code: "G4.context-clues" }), "VOC");
    assert.equal(strandOfSkill({ category: "PHONICS_WORD_STUDY", code: "x" }), "VOC");
    assert.equal(strandOfSkill({ category: "GRAMMAR", code: "x" }), "GRAM");
    assert.equal(strandOfSkill({ category: "MECHANICS", code: "x" }), "MECH");
    assert.equal(strandOfSkill({ category: "WRITING", code: "x" }), "WRIT");
    assert.equal(strandLevel(null), null);
    assert.equal(strandLevel(85), "ABOVE"); assert.equal(strandLevel(60), "ON"); assert.equal(strandLevel(40), "BELOW");
    assert.equal(trendOf({ n: 10, ok: 9 }, { n: 10, ok: 5 }), "up");
    assert.equal(trendOf({ n: 10, ok: 4 }, { n: 10, ok: 8 }), "down");
    assert.equal(trendOf({ n: 10, ok: 6 }, { n: 10, ok: 6 }), "flat");
    assert.equal(trendOf({ n: 2, ok: 2 }, { n: 10, ok: 0 }), "flat", "too few answers: no arrow");
  });

  test("x of y, the next step (weakest practised skill first), Fluency from the one-minute readings", () => {
    const now = new Date(Date.UTC(2026, 9, 13));
    const ago = (d: number) => new Date(now.getTime() - d * DAY);
    const skills = [
      { id: "a", name: "Theme", code: "G4.theme", category: "LITERATURE", domain: "READING", sequence: 1 },
      { id: "b", name: "Character", code: "G4.character", category: "LITERATURE", domain: "READING", sequence: 2 },
      { id: "c", name: "Plot", code: "G4.plot-events", category: "LITERATURE", domain: "READING", sequence: 3 },
      { id: "v", name: "Context Clues", code: "G4.context-clues", category: "VOCABULARY", domain: "VOCABULARY", sequence: 1 },
    ];
    const mastery = [{ skillId: "a", score: 95, attempts: 20, isMastered: true }, { skillId: "b", score: 40, attempts: 12, isMastered: false }];
    const attempts = [
      ...Array.from({ length: 6 }, (_, i) => ({ skillId: "b", isCorrect: true, createdAt: ago(3 + i) })),
      ...Array.from({ length: 6 }, (_, i) => ({ skillId: "b", isCorrect: i < 2, createdAt: ago(16 + i) })),
    ];
    const fluency = [{ mode: "MINUTE", wcpm: 80, level: "BELOW", createdAt: ago(40) }, { mode: "MINUTE", wcpm: 92, level: "ON", createdAt: ago(2) }];
    const rows = buildStrands({ skills, mastery, mastered: new Set(["a"]), attempts, fluency, writing: [], now });
    assert.equal(rows.length, 7);
    const rl = rows.find((r) => r.key === "RL")!;
    assert.deepEqual([rl.mastered, rl.total], [1, 3], "skills mastered 1 of 3");
    assert.equal(rl.level, "ON", "(95 + 40) / 2 = 67.5");
    assert.equal(rl.trend, "up", "last 2 weeks 100 % against 33 %");
    assert.deepEqual(rl.next, { skillId: "b", text: "Character" }, "the weakest practised skill first");
    const voc = rows.find((r) => r.key === "VOC")!;
    assert.deepEqual([voc.mastered, voc.total, voc.level], [0, 1, null], "not practised: no level");
    assert.equal(voc.next?.text, "Context Clues", "the first not started");
    const flu = rows.find((r) => r.key === "FLU")!;
    assert.deepEqual([flu.mastered, flu.total, flu.level, flu.wcpm, flu.trend], [null, null, "ON", 92, "up"]);
  });
});

describe("🧭 the student file on the demo school", () => {
  let repo: SqliteRepo; let teacher: Actor; let studentId = ""; let classId = "";
  const now = new Date();
  before(async () => {
    ({ repo } = await demoDatabase());
    teacher = await resolveActor(repo, (await repo.findUnique("User", { username: "demo.teacher.4a" }))!);
    const t = await repo.findUnique("Teacher", { userId: teacher.userId });
    classId = s((await repo.findMany("ClassTeacher", { teacherId: t!.id }))[0].classId);
    studentId = s((await repo.findMany("ClassMembership", { classId }))[0].studentId);
  });

  test("mastered x of y comes from the ONE adapter (the skill stars, else engine mastery ≥ the Mastered band)", async () => {
    const st = (await repo.findUnique("Student", { id: studentId }))!;
    const cur = await repo.findMany("Curriculum", { gradeId: st.gradeId });
    const skills = (await repo.findMany("Skill", { curriculumId: { in: cur.map((c) => s(c.id)) } })).filter((k) => strandOfSkill(k) === "RL");
    assert.ok(skills.length >= 3, "grade 4 has Reading Literature skills");
    const [a, b, c] = skills;
    await repo.create("StudentSkillMastery", { studentId, skillId: a.id, score: MASTERED_SCORE, attempts: 20, correct: 18, isMastered: false, updatedAt: now });
    await repo.create("StudentSkillMastery", { studentId, skillId: b.id, score: 70, attempts: 15, correct: 10, isMastered: true, updatedAt: now });
    await repo.create("StudentSkillMastery", { studentId, skillId: c.id, score: 30, attempts: 12, correct: 3, isMastered: false, updatedAt: now });
    const m = (await masteredSkills(repo, [studentId])).get(studentId)!;
    assert.ok(m.has(s(a.id)) && m.has(s(b.id)) && !m.has(s(c.id)), "score ≥ the band, or the engine's flag");
    const rows = await languageStrands(repo, studentId, now);
    const rl = rows.find((r) => r.key === "RL")!;
    assert.equal(rl.mastered, 2);
    assert.equal(rl.total, skills.filter((k) => k.isActive !== false && k.isActive !== 0).length);
    assert.equal(rl.next?.skillId, s(c.id), "the weakest practised skill is the next step");
    assert.match(read("src/server/reports/mastered-count.ts"), /skillStatusesFor/, "reads the ONE skill status (stars) first");
  });

  test("the file's insights: seven strands, the ReadRise level journey, the class comparison (staff)", async () => {
    const schoolId = teacher.schoolId!;
    await repo.create("RRStudent", { studentId, schoolId, level: 650, startLevel: 550, source: "PLACEMENT", placedAt: new Date(now.getTime() - 60 * DAY), updatedAt: now });
    await repo.create("RRLevelChange", { studentId, schoolId, fromLevel: 550, toLevel: 600, reason: "Up 75%+", createdAt: new Date(now.getTime() - 30 * DAY) });
    await repo.create("RRLevelChange", { studentId, schoolId, fromLevel: 600, toLevel: 650, reason: "Up 75%+", createdAt: new Date(now.getTime() - 5 * DAY) });
    const ins = await studentFileInsights(repo, teacher, studentId, { classId, name: "Demo Student", now });
    assert.equal(ins.strands.length, 7);
    assert.ok(ins.readRise?.placed);
    assert.deepEqual(ins.readRise!.history.map((h) => h.level), [550, 600, 650]);
    assert.ok(ins.peer, "the student against the class (teacher view)");
  });

  test("the page: the strands, the ReadRise level chart (never Lexile), comments and notes, staff-only comparison", () => {
    const page = read("src/app/teacher/students/[studentId]/page.tsx");
    for (const x of ['id="strands"', 'id="mistakes"', 'id="class"', 'id="readrise"', 'id="followup"', 'id="comments"', 'id="notes"', "studentFileInsights(", "<ReadRiseLevelChart", "TREND_ARROW"]) assert.ok(page.includes(x), x);
    const chart = read("src/components/insights/readrise-level-chart.tsx");
    assert.match(chart, /ReadRise level/);
    assert.doesNotMatch(chart.replace(/\/\*[\s\S]*?\*\//g, ""), /Lexile/, "never called Lexile");
    assert.doesNotMatch(page.slice(page.indexOf('id="readrise"'), page.indexOf('id="skills"')), /Lexile/);
    assert.match(read("src/server/insights/language-strands.ts"), /TEACHER-FACING ONLY/);
  });
});
