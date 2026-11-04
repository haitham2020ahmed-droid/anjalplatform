/**
 * ⭐ STUDENT "My Skills" (owner r68 spec B) — in-memory demo school only (never a real database or real students):
 *   four tabs with counts (default Learning, else Mastered; Review hidden when empty), "Not started" = ONLY the skills of
 *   the student's own plans, grouped by strand, one button per row (Practice again + mastered date · Continue + bar ·
 *   Review now · Start), the nav entry right after My Work, and the proof the owner asked for: a skill mastered in a
 *   Curriculum Map lesson shows ⭐ in My Skills, the MAP plan, the NAFS plan and the teacher's grid.
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { demoDatabase, ROOT } from "./helpers/db";
import { publishGrade4Bank } from "./helpers/practice";
import { resolveActor } from "../src/server/auth/actor";
import type { Actor } from "../src/server/auth/rbac";
import { onSkillAnswer, skillKeyIndex, statusesOfSkills } from "../src/server/skills/status";
import { defaultTab, mySkills, strandOf, tabOf, visibleTabs } from "../src/server/skills/my-skills";
import { skillsGrid } from "../src/server/skills/skills-grid";
import { skillPlanForStudent } from "../src/server/curriculum-map/plans";
import { assignSkill } from "../src/server/teacher/assign";
import { navItemsFor } from "../src/components/nav-items";
import { UI_STRINGS } from "../src/i18n/en";

const s = (v: unknown) => String(v ?? "");
const read = (f: string) => readFileSync(join(ROOT, f), "utf8");

describe("⭐ My Skills (student)", () => {
  let repo: SqliteRepo; let teacher: Actor; let schoolId = ""; let classId = ""; let ids: string[] = []; let tid = "";
  let g4 = new Map<string, string>(); let g5 = new Map<string, string>();
  const now = new Date("2026-10-13T09:00:00Z");
  let clock = Date.parse("2026-10-01T08:00:00Z");
  const at = () => new Date((clock += 60_000));
  const keyOf = async (id: string) => (await skillKeyIndex(repo, schoolId)).keyOf.get(id)!;
  const row = async (sid: string, skillId: string, status: string) => repo.create("SkillStatus", { studentId: sid, skillKey: await keyOf(skillId), level: 1, status, skillId, answered: 12, correct: 8, score: 55, startedAt: now, masteredAt: status === "MASTERED" ? new Date("2026-10-10") : null, createdAt: now, updatedAt: now, history: [] });

  before(async () => {
    ({ repo } = await demoDatabase({ classesPerGrade: 1, studentsPerClass: 4 }));
    await publishGrade4Bank(repo);
    teacher = await resolveActor(repo, (await repo.findUnique("User", { username: "demo.teacher.4a" }))!);
    schoolId = teacher.schoolId!;
    const t = await repo.findUnique("Teacher", { userId: teacher.userId });
    tid = s(t!.id);
    classId = s((await repo.findMany("ClassTeacher", { teacherId: tid }))[0].classId);
    ids = (await repo.findMany("ClassMembership", { classId })).map((m) => s(m.studentId));
    const byGrade = async (level: number) => {
      const g = (await repo.findMany("Grade", { schoolId, level }))[0];
      const cur = (await repo.findMany("Curriculum", { gradeId: g.id }))[0];
      return new Map((await repo.findMany("Skill", { curriculumId: cur.id })).map((k) => [s(k.code).replace(/^G\d\./, ""), s(k.id)]));
    };
    g4 = await byGrade(4); g5 = await byGrade(5);
  });

  test("tabs: Learning by default, else Mastered; Review only when it has skills; the pure rules", async () => {
    assert.equal(tabOf("IN_PROGRESS"), "LEARNING"); assert.equal(tabOf("NEXT_LEVEL"), "LEARNING");
    assert.equal(tabOf("MASTERED"), "MASTERED"); assert.equal(tabOf("NEEDS_REVIEW"), "REVIEW"); assert.equal(tabOf("NOT_STARTED"), "NOT_STARTED");
    assert.equal(defaultTab({ LEARNING: 2, MASTERED: 5, REVIEW: 0, NOT_STARTED: 1 }), "LEARNING");
    assert.equal(defaultTab({ LEARNING: 0, MASTERED: 5, REVIEW: 1, NOT_STARTED: 1 }), "MASTERED");
    assert.deepEqual(visibleTabs({ LEARNING: 1, MASTERED: 0, REVIEW: 0, NOT_STARTED: 0 }), ["MASTERED", "LEARNING", "NOT_STARTED"]);
    assert.deepEqual(visibleTabs({ LEARNING: 1, MASTERED: 0, REVIEW: 2, NOT_STARTED: 0 }), ["MASTERED", "LEARNING", "REVIEW", "NOT_STARTED"]);
    // a student with one skill learning and one mastered
    await row(ids[1], g4.get("inference")!, "IN_PROGRESS");
    await row(ids[1], g4.get("capitalization")!, "MASTERED");
    const v = await mySkills(repo, ids[1], now);
    assert.equal(v.tab, "LEARNING");
    assert.ok(!v.tabs.includes("REVIEW"), "no Review tab without a skill to review");
    assert.equal(v.counts.LEARNING, 1); assert.equal(v.counts.MASTERED, 1);
    const learning = v.groups.LEARNING.flatMap((g) => g.rows)[0];
    assert.equal(learning.action, "Continue"); assert.ok(learning.score >= 0 && learning.score <= 99, "a bar, never question counts");
    const mastered = v.groups.MASTERED.flatMap((g) => g.rows)[0];
    assert.equal(mastered.action, "Practice again"); assert.equal(mastered.masteredAt, "2026-10-10");
    assert.match(s(mastered.href), /^\/practice\/.+\?from=free$/, "practice again opens the skill (free practice)");
    // a student with a review only: Review tab, Review now
    await row(ids[2], g4.get("theme")!, "NEEDS_REVIEW");
    const r = await mySkills(repo, ids[2], now);
    assert.ok(r.tabs.includes("REVIEW")); assert.equal(r.groups.REVIEW[0].rows[0].action, "Review now");
  });

  test("Not started = only the skills of the student's own plans (never the whole list), grouped by strand", async () => {
    const sid = ids[3];
    const before = await mySkills(repo, sid, now);
    assert.equal(before.counts.NOT_STARTED, 0, "no plan: nothing not started (not the whole skill list)");
    await assignSkill(repo, teacher, { source: "GRAMMAR", classId, skillId: g4.get("capitalization")!, studentIds: [sid], track: "GRAMMAR" }, now);
    await assignSkill(repo, teacher, { source: "CURRICULUM", classId, skillId: g4.get("context-clues")!, studentIds: [sid] }, now);
    const v = await mySkills(repo, sid, now);
    const ns = v.groups.NOT_STARTED;
    assert.equal(v.counts.NOT_STARTED, 2);
    assert.ok(ns.every((g) => g.rows.every((x) => x.action === "Start")));
    const strands = ns.map((g) => g.strand);
    assert.ok(strands.includes("GRAMMAR") && strands.includes("VOCABULARY"), `grouped by strand: ${strands.join(",")}`);
    assert.ok(ns.find((g) => g.strand === "GRAMMAR")!.rows[0].from.includes("Grammar"), "where it comes from");
    assert.equal(strandOf("fam:theme", null), "LITERATURE"); assert.equal(strandOf("fam:central-idea", null), "INFORMATIONAL");
    assert.equal(strandOf("fam:context-clues", null), "VOCABULARY"); assert.equal(strandOf("fam:commas", null), "GRAMMAR");
  });

  test("🎯 the owner's proof: mastered in a Curriculum Map lesson → ⭐ in My Skills, the MAP plan, the NAFS plan and the teacher grid", async () => {
    const sid = ids[0];
    const theme4 = g4.get("theme")!, theme5 = g5.get("theme")!;
    // a Curriculum Map lesson: an adaptive set of a curriculum plan (TEACHER_QUIZ), 32 careful answers on the skill
    const plan = await repo.create("SkillPlan", { schoolId, classId, title: "Grade 4 Curriculum", kind: "CURRICULUM", gradeLevel: 4, createdById: teacher.userId, createdAt: now });
    const a = await repo.create("Assignment", { classId, createdById: tid, title: "Unit 1 · Text Set 1 · Analyze Craft and Structure (adaptive: Approaching → Meeting → Exceeding)", target: "ASSESSMENT", track: "CURRICULUM", program: "CURRICULUM", curriculumPlanId: plan.id, createdAt: now });
    await repo.create("AssignmentStudent", { assignmentId: a.id, studentId: sid, status: "IN_PROGRESS", progress: 0.5 });
    const qs = await repo.findMany("Question", { skillId: theme4, status: "PUBLISHED" }, { select: ["id"], take: 40 });
    const ses = await repo.create("PracticeSession", { studentId: sid, assignmentId: a.id, mode: "TEACHER_QUIZ", startedAt: at(), questionCount: 32, correctCount: 30, activeMs: 0 });
    for (let i = 0; i < 32; i++) await repo.create("QuestionAttempt", { sessionId: ses.id, studentId: sid, questionId: qs[i % qs.length].id, skillId: theme4, response: { value: "x" }, isCorrect: i % 8 !== 0, responseMs: 12000, rapidGuess: false, difficultyB: 0, createdAt: at() });
    await repo.upsert("StudentSkillMastery", { studentId: sid, skillId: theme4 }, { studentId: sid, skillId: theme4, score: 96, band: "MASTERED", isMastered: true, attempts: 32, correct: 28 }, { score: 96, isMastered: true });
    const r = await onSkillAnswer(repo, sid, theme4, now); // the hook after every answer (practice and question sets)
    assert.equal(r?.status, "MASTERED", "the Curriculum lesson's practice gives the star");
    // the MAP plan uses the Grade 5 copy; the NAFS plan a NAFS assignment of the same skill
    await repo.create("MapPlan", { schoolId, classId, studentId: sid, subject: "READING", term: "Fall 2026", status: "SENT", items: [{ group: "LIT", skillIds: [theme5], count: 15 }], createdAt: now, updatedAt: now, sentAt: now });
    const nafs = await assignSkill(repo, teacher, { source: "NAFS", classId, skillId: theme4, studentIds: [sid], track: "NAFS", program: "NAFS" }, now);
    const np = await repo.create("SkillPlan", { schoolId, classId, title: "NAFS plan", kind: "NAFS", gradeLevel: 4, status: "SENT", program: "NAFS", createdById: teacher.userId, createdAt: now });
    await repo.create("SkillPlanItem", { planId: np.id, code: "NAFS.RC", label: "Theme", assignmentIds: [nafs.assignmentId], order: 0 });
    // 1. My Skills
    const v = await mySkills(repo, sid, now);
    const row = v.groups.MASTERED.flatMap((g) => g.rows).find((x) => x.key === "fam:theme");
    assert.ok(row, "⭐ in My Skills");
    assert.equal(row!.strand, "LITERATURE");
    assert.ok(row!.from.includes("MAP plan") && row!.from.includes("NAFS plan"), `in the student's plans: ${row!.from.join(",")}`);
    // 2. the MAP plan's skill (the Grade 5 copy) shows the same star
    assert.equal((await statusesOfSkills(repo, schoolId, [sid], [theme5])).get(sid)!.get(theme5)!.status, "MASTERED", "⭐ in the MAP plan (another grade's copy)");
    // 3. the NAFS plan
    const me = await resolveActor(repo, (await repo.findUnique("User", { id: (await repo.findUnique("Student", { id: sid }))!.userId }))!);
    const pv = await skillPlanForStudent(repo, me, s(np.id), now);
    assert.equal(pv.places[0].stars?.[0]?.status, "MASTERED", "⭐ in the NAFS plan");
    // 4. the teacher's grid — r84: the skill reached this student through the NAFS PLAN, so it is on the Plans tab (and in
    // By source / the Class report: `all`), not a Skills Grid column
    assert.ok(!(await skillsGrid(repo, teacher, { classId }, now)).skills.some((k) => k.key === "fam:theme"), "r84: a plan's skill is not a Skills Grid column");
    const g = await skillsGrid(repo, teacher, { classId, all: true }, now);
    assert.equal(g.cells[sid]["fam:theme"]?.status, "MASTERED", "⭐ in the teacher's Skills Grid");
    const col = g.skills.find((k) => k.key === "fam:theme")!;
    // r74: a column counts the students the skill is ASSIGNED to (here the NAFS assignment: this student)
    assert.ok(col.mastered === 1 && col.total === 1, "the column count (n of the assigned students mastered)");
  });

  test("the page and the menu: My Skills right after My Work, a real page (no redirect), translated", () => {
    const menu = navItemsFor("STUDENT", {}).map((i) => i.href);
    assert.equal(menu[menu.indexOf("/student/work") + 1], "/student/skills", "right after My Work");
    const page = read("src/app/student/skills/page.tsx");
    assert.doesNotMatch(page, /redirect\(/, "My Skills is its own page now");
    assert.match(page, /mySkills\(/); assert.match(page, /<MySkillsView/);
    assert.ok(existsSync(join(ROOT, "src/app/student/skills/loading.tsx")));
    const view = read("src/components/skills/my-skills-view.tsx");
    for (const x of ["my-skills-tabs", "Mastered on {date}", "readOnly"]) assert.ok(view.includes(x), x);
    for (const w of ["My Skills", "Mastered", "Learning", "Review", "Not started", "Practice again", "Continue", "Review now", "Start", "Literature", "Informational", "Vocabulary", "Grammar"]) assert.ok((UI_STRINGS as readonly string[]).includes(w), w);
  });
});
