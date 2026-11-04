/**
 * r72 Student Skills (owner: "ORGANISED above all — show ONLY the skills the students actually worked on, the level by
 * the stars, not crowded"). Fixture with KNOWN practice (in-memory demo school, the star migration NOT run, so the
 * raw-practice fallback is used for one student):
 *   s0  theme ⭐ MASTERED · capitalization ◐                       (star rows)
 *   s1  theme ◐ + needs support · inference 🔄 NEEDS_REVIEW         (star rows)
 *   s2  summarize: 2 careful answers (no star row → fallback ◐) · figurative language: rapid guesses only (never counts)
 *   s3  context clues ◐ · character: a ☆ row with 0 answers (not practised)
 *   commas: assigned to everyone (MAP work + a custom assignment) but nobody practised it.
 * r74 (owner): the columns are the ASSIGNED skills — here every practised skill but figurative language and character
 * is assigned to the class (Curriculum), commas too (never practised: a ☆ column); figurative language (rapid guesses)
 * and character (a ☆ row) are never assigned, so they are on no column. Grouped by strand (Literature · Vocabulary ·
 * Grammar) and sorted by code; the per-student view lists that student's assigned skills.
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { demoDatabase, ROOT } from "./helpers/db";
import { publishGrade4Bank } from "./helpers/practice";
import { resolveActor } from "../src/server/auth/actor";
import type { Actor } from "../src/server/auth/rbac";
import { skillKeyIndex } from "../src/server/skills/status";
import { byCode, isPractised, masteredPct, skillCode, skillsGrid } from "../src/server/skills/skills-grid";
import { starsMigrated } from "../src/server/skills/grid-fallback";
import { assignedOf, studentSkillsForTeacher } from "../src/server/skills/student-skills";
import { assignSkill } from "../src/server/teacher/assign";
import { TEACHER_WORD, teacherWordOf } from "../src/lib/skill-stars";
import { skillsGridSummary } from "../src/lib/report-summaries";
import { UI_STRINGS } from "../src/i18n/en";
import { ar } from "../src/i18n/ar";

const s = (v: unknown) => String(v ?? "");
const read = (f: string) => readFileSync(join(ROOT, f), "utf8");
const ALL_ORDER = ["fam:inference", "fam:summarize", "fam:theme", "fam:context-clues", "fam:commas", "fam:capitalization"];

describe("r72 ⭐ Student Skills: only practised skills, organised", () => {
  let repo: SqliteRepo; let teacher: Actor; let classId = ""; let schoolId = ""; let ids: string[] = []; const g4 = new Map<string, string>();
  const now = new Date("2026-10-13T09:00:00Z");
  const row = async (sid: string, code: string, status: string, extra: Record<string, unknown> = {}) => {
    const key = (await skillKeyIndex(repo, schoolId)).keyOf.get(g4.get(code)!)!;
    await repo.create("SkillStatus", { studentId: sid, skillKey: key, level: 1, status, skillId: g4.get(code), answered: status === "MASTERED" ? 34 : status === "NOT_STARTED" ? 0 : 12, correct: 6, score: status === "MASTERED" ? 100 : 48, startedAt: now, masteredAt: status === "MASTERED" ? now : null, createdAt: now, updatedAt: now, history: [], ...extra });
  };

  before(async () => {
    ({ repo } = await demoDatabase({ classesPerGrade: 1, studentsPerClass: 4 }));
    await publishGrade4Bank(repo);
    teacher = await resolveActor(repo, (await repo.findUnique("User", { username: "demo.teacher.4a" }))!);
    schoolId = teacher.schoolId!;
    const tRow = await repo.findUnique("Teacher", { userId: teacher.userId });
    classId = s((await repo.findMany("ClassTeacher", { teacherId: tRow!.id }))[0].classId);
    ids = (await repo.findMany("ClassMembership", { classId })).map((m) => s(m.studentId)).sort();
    const g = (await repo.findMany("Grade", { schoolId, level: 4 }))[0];
    const cur = (await repo.findMany("Curriculum", { gradeId: g.id }))[0];
    for (const k of await repo.findMany("Skill", { curriculumId: cur.id })) g4.set(s(k.code).replace(/^G4\./, ""), s(k.id));
    await row(ids[0], "theme", "MASTERED"); await row(ids[0], "capitalization", "IN_PROGRESS");
    await row(ids[1], "theme", "IN_PROGRESS", { needsSupportAt: now, answered: 52 }); await row(ids[1], "inference", "NEEDS_REVIEW");
    await row(ids[3], "context-clues", "IN_PROGRESS"); await row(ids[3], "character", "NOT_STARTED");
    // s2: raw practice only (no star row): 2 careful answers on summarize, 3 rapid guesses on figurative language
    const ses = await repo.create("PracticeSession", { studentId: ids[2], skillId: g4.get("summarize")!, mode: "ADAPTIVE_PRACTICE", startedAt: now, questionCount: 5, correctCount: 1, activeMs: 0 });
    for (const [code, n, rapid] of [["summarize", 2, false], ["figurative-language", 3, true]] as const) {
      const q = (await repo.findMany("Question", { skillId: g4.get(code)!, status: "PUBLISHED" }, { select: ["id"], take: 1 }))[0];
      for (let i = 0; i < n; i++) await repo.create("QuestionAttempt", { sessionId: ses.id, studentId: ids[2], questionId: q.id, skillId: g4.get(code)!, response: { value: "x" }, isCorrect: i === 0, responseMs: rapid ? 600 : 9000, rapidGuess: rapid, difficultyB: 0, createdAt: now });
    }
    // commas: assigned (MAP work + a custom assignment for everyone), never practised
    const old = await repo.create("Assignment", { classId, createdById: tRow!.id, title: "MAP", target: "SKILL", skillIds: [g4.get("commas"), g4.get("theme")], program: "MAP", track: "MAP", createdAt: now });
    for (const id of ids) await repo.create("AssignmentStudent", { assignmentId: old.id, studentId: id, status: "NOT_STARTED", progress: 0 });
    await assignSkill(repo, teacher, { source: "CURRICULUM", classId, skillId: g4.get("commas")! }, now);
    // r74: the practised skills are assigned too (Curriculum) — but NOT figurative language / character
    for (const code of ["theme", "capitalization", "inference", "summarize", "context-clues"]) await assignSkill(repo, teacher, { source: "CURRICULUM", classId, skillId: g4.get(code)! }, now);
  });

  test("pure rules: practised, the code, the code order, the %", () => {
    assert.equal(isPractised({ status: "NOT_STARTED", answered: 0 }), false);
    assert.equal(isPractised({ status: "NOT_STARTED", answered: 1 }), true);
    assert.equal(isPractised({ status: "NEXT_LEVEL", answered: 0 }), true, "mastered at the previous level");
    assert.equal(isPractised(null), false);
    assert.equal(skillCode("fam:theme", "G4.theme", 4), "RL.4.2");
    assert.equal(skillCode("fam:theme", "G4.theme", null), "RL.2");
    assert.equal(skillCode("solo:x", "RI.5.3", 5), "RI.5.3");
    assert.equal(skillCode("solo:x", "G4.custom-thing", 4), "", "not a standard code: the name alone");
    const sorted = [{ code: "RL.4.10", name: "b" }, { code: "", name: "a" }, { code: "RL.4.2", name: "z" }, { code: "RL.4.2", name: "c" }].sort(byCode);
    assert.deepEqual(sorted.map((x) => `${x.code}|${x.name}`), ["RL.4.2|c", "RL.4.2|z", "RL.4.10|b", "|a"]);
    assert.deepEqual([masteredPct(1, 4), masteredPct(2, 3), masteredPct(0, 0)], [25, 67, 0]);
  });

  test("All: ONLY the assigned skills (stars from rows + raw practice), grouped by strand, sorted by code", async () => {
    assert.equal(await starsMigrated(repo, schoolId), false, "the fixture runs on the fallback");
    const g = await skillsGrid(repo, teacher, { classId }, now);
    assert.deepEqual(g.skills.map((k) => k.key), ALL_ORDER, "Literature (RL.4.1, RL.4.2 ×2 by name) · Vocabulary · Grammar");
    for (const k of ["fam:character", "fam:figurative-language"]) assert.ok(!g.skills.some((x) => x.key === k), `${k}: never assigned`);
    assert.deepEqual(g.groups, [{ strand: "LITERATURE", label: "Literature", count: 3 }, { strand: "VOCABULARY", label: "Vocabulary", count: 1 }, { strand: "GRAMMAR", label: "Grammar", count: 2 }]);
    assert.equal(g.groups!.reduce((n, x) => n + x.count, 0), g.skills.length, "the group header spans every column");
    assert.deepEqual(g.skills.map((k) => k.code).slice(0, 4), ["RL.4.1", "RL.4.2", "RL.4.2", "L.4.4.a"]);
    assert.equal(g.skills.find((k) => k.key === "fam:capitalization")!.code, "L.4.2.a");
    const theme = g.skills.find((k) => k.key === "fam:theme")!;
    assert.deepEqual([theme.short, theme.name, theme.mastered, theme.total, theme.pct, theme.started], ["Theme", "Theme", 1, 4, 25, 2]);
    for (const k of g.skills) assert.ok((k.short ?? "").split(" ").length <= 4 + 1, `short label: ${k.short}`);
    // rows and columns
    assert.equal(g.students.length, 4); assert.equal(g.practisingStudents, 4);
    const by = new Map(g.students.map((x) => [x.id, x]));
    assert.deepEqual(ids.map((id) => [by.get(id)!.practised, by.get(id)!.mastered, by.get(id)!.assigned]), [[2, 1, 6], [2, 0, 6], [1, 0, 6], [1, 0, 6]], "practised · mastered · assigned per row");
    assert.deepEqual(g.skills.map((k) => k.pct), [0, 0, 25, 0, 0, 0], "% of students mastered per column");
    assert.deepEqual(g.skills.find((k) => k.key === "fam:commas")!.started, 0, "assigned, never practised: still a column (☆)");
  });

  test("each cell: the star and its teacher level word (the existing star scale)", async () => {
    const g = await skillsGrid(repo, teacher, { classId }, now);
    const cell = (i: number, k: string) => g.cells[ids[i]][k];
    const want: [number, string, string, string][] = [
      [0, "fam:theme", "MASTERED", "Mastered"], [0, "fam:capitalization", "IN_PROGRESS", "In progress"],
      [1, "fam:theme", "IN_PROGRESS", "Needs support"], [1, "fam:inference", "NEEDS_REVIEW", "Needs review"],
      [2, "fam:summarize", "IN_PROGRESS", "In progress"], [3, "fam:context-clues", "IN_PROGRESS", "In progress"],
    ];
    for (const [i, k, status, word] of want) {
      assert.equal(cell(i, k).status, status, `${i} ${k}`);
      assert.equal(teacherWordOf(cell(i, k)), word, `${i} ${k}`);
      assert.ok(isPractised(cell(i, k)));
    }
    assert.equal(cell(2, "fam:summarize").answered, 2, "the 2 careful answers (raw practice)");
    assert.equal(cell(3, "fam:theme").status, "NOT_STARTED"); assert.equal(isPractised(cell(3, "fam:theme")), false, "☆: no level word");
    for (const w of Object.values(TEACHER_WORD)) assert.ok((UI_STRINGS as readonly string[]).includes(w), w);
  });

  test("every source filter only narrows the assigned skills (r74: by the assignment's source)", async () => {
    const keys = async (o: Parameters<typeof skillsGrid>[2]) => (await skillsGrid(repo, teacher, { classId, ...o }, now)).skills.map((k) => k.key);
    assert.deepEqual(await keys({ plan: "MAP" }), ["fam:theme", "fam:commas"], "the older MAP work (no source: inferred MAP) = commas + theme");
    assert.deepEqual(await keys({ plan: "CURRICULUM" }), ALL_ORDER);
    assert.deepEqual(await keys({ plan: "GRAMMAR" }), [], "no work was assigned from Grammar");
    assert.deepEqual(await keys({ plan: "RTI" }), []);
    assert.deepEqual(await keys({ strand: "VOCABULARY" }), ["fam:context-clues"]);
    assert.deepEqual(await keys({ weakOnly: true }), ALL_ORDER, "theme 1 of 4: every assigned skill is weak here");
    const all = new Set(await keys({}));
    for (const plan of ["CURRICULUM", "MAP", "NAFS", "GRAMMAR", "RTI"] as const) for (const k of await keys({ plan })) assert.ok(all.has(k), `${plan}: ${k} is assigned`);
  });

  test("per student: ONLY that student's assigned skills (practised or ☆), grouped, with the level and the sources", async () => {
    const v0 = await studentSkillsForTeacher(repo, teacher, ids[0], now);
    const st = (v: Awaited<ReturnType<typeof studentSkillsForTeacher>>) => Object.fromEntries(v.assigned.groups.flatMap((g) => g.rows.map((r) => [r.key, r.status])));
    assert.deepEqual(st(v0), { "fam:inference": "NOT_STARTED", "fam:summarize": "NOT_STARTED", "fam:theme": "MASTERED", "fam:context-clues": "NOT_STARTED", "fam:capitalization": "IN_PROGRESS", "fam:commas": "NOT_STARTED" });
    assert.deepEqual([v0.assigned.total, v0.assigned.counts.MASTERED, v0.assigned.counts.LEARNING], [6, 1, 1]);
    assert.deepEqual(v0.assigned.groups[0].rows.map((r) => r.code), ["RL.4.1", "RL.4.2", "RL.4.2"]);
    assert.deepEqual(v0.assigned.groups.flatMap((g) => g.rows).find((r) => r.key === "fam:theme")!.sources, ["MAP", "CURRICULUM"], "two sources");
    const v1 = await studentSkillsForTeacher(repo, teacher, ids[1], now);
    assert.deepEqual(v1.assigned.groups[0].rows.filter((r) => r.status !== "NOT_STARTED").map((r) => [r.key, teacherWordOf(r)]), [["fam:inference", "Needs review"], ["fam:theme", "Needs support"]], "RL.4.1 before RL.4.2");
    const v3 = await studentSkillsForTeacher(repo, teacher, ids[3], now);
    assert.ok(!v3.assigned.groups.flatMap((g) => g.rows).some((r) => r.key === "fam:character"), "a skill never assigned is not listed");
    const none = assignedOf({ counts: { MASTERED: 0, LEARNING: 0, REVIEW: 0, NOT_STARTED: 1 }, tabs: [], tab: "NOT_STARTED", groups: { MASTERED: [], LEARNING: [], REVIEW: [], NOT_STARTED: [{ strand: "GRAMMAR", label: "Grammar", rows: [] }] }, total: 1 }, new Map(), () => "", () => ({ name: "x", skillId: null, strand: "GRAMMAR" }));
    assert.deepEqual([none.total, none.groups.length], [0, 0], "nothing assigned → the empty state");
  });

  test("the summary + action plan from the grid's own numbers", async () => {
    const g = await skillsGrid(repo, teacher, { classId }, now);
    const sm = skillsGridSummary({ totalStudents: 4, practising: g.practisingStudents ?? 0, skills: g.skills }, { classId, skillHref: (k) => `/x?skill=${k}` });
    assert.deepEqual(sm.lines.map((l) => [l.key, l.vars ?? null]), [
      ["{k} skills assigned · {n} of {total} students have started.", { n: 4, total: 4, k: 6 }],
      ["Most mastered: {skill} ({pct}% of the students).", { skill: "Theme", pct: 25 }],
      ["Least mastered: {skill} ({pct}% of the students).", { skill: "Capitalization", pct: 0 }],
      ["{n} skills have students who need support.", { n: 1 }],
      ["Next step: open {skill} and re-teach it to the students who have not mastered it.", { skill: "Capitalization" }],
    ]);
    assert.deepEqual(sm.actions.map((a) => a.kind), ["open", "reteach"]); assert.equal(sm.actions[0].href, "/x?skill=fam:capitalization");
    const empty = skillsGridSummary({ totalStudents: 4, practising: 0, skills: [] }, { classId, skillHref: () => "" });
    assert.equal(empty.lines[0].key, "No skill has been assigned to this class yet.");
  });

  test("the page: grouped header, sticky names and header, short labels + InfoTip, level word, legend, footers, summary; EN + AR", () => {
    const src = read("src/app/teacher/reports/skills-grid/page.tsx");
    const grid = src.slice(src.indexOf("function GridView"), src.indexOf("function SkillView"));
    for (const x of ['data-testid="grid-groups"', "colSpan={gr.count}", 'thead className="sticky top-0', "sticky start-0", "overflow-auto", "<InfoTip text={k.name} />", "k.short", "teacherWordOf(v)", "isPractised(v)", "grid-row-count", "% of students mastered", "{m} of {n} mastered", "{n} of {total} mastered", "No assigned skills yet", "<ReportSummary", "<SourceBadges"]) assert.ok(grid.includes(x), x);
    assert.match(src, /<StarLegend t=\{t\} className="mb-3" \/>/, "the small legend above the grid");
    const sv = src.slice(src.indexOf("function StudentView"), src.indexOf("function Detail"));
    assert.doesNotMatch(sv, /MySkillsView/, "the teacher's student view lists only practised skills");
    for (const x of ["v.assigned", "teacherWordOf(r)", "InfoTip", "No assigned skills yet", "Create Plan", "Send to the family", "setStudentSkillGoalAction", "<SourceBadges"]) assert.ok(sv.includes(x), x);
    // student pages never get the level words
    assert.doesNotMatch(read("src/app/student/skills/page.tsx"), /teacherWordOf|TEACHER_WORD/);
    assert.doesNotMatch(read("src/components/skills/my-skills-view.tsx"), /teacherWordOf|TEACHER_WORD|needsSupport/);
    const keys = ["Only the skills you assigned, grouped by strand: one star and its level in each cell, the source under each skill.", "No assigned skills yet", "{m} of {n} mastered", "% of students mastered", "Skills assigned", "{n} skills assigned · {m} mastered · {l} learning · {r} to review", "Open {skill}"];
    for (const k of keys) { assert.ok((UI_STRINGS as readonly string[]).includes(k), k); assert.ok((ar as Record<string, string>)[k], k); }
    assert.equal(new Set(UI_STRINGS).size, UI_STRINGS.length, "no duplicate interface strings");
  });
});
