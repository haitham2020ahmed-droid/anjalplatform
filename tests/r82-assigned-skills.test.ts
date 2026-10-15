/**
 * r82 (owner, live site after r78): "For teacher Elrefaie, Student Skills STILL shows ALL skills, not only what was
 * assigned" + "NAFS 'Assign adaptive practice now' should be source NAFS and show in my Student Skills".
 *
 * The reproduction fixture (tests/helpers/r82-fixture.ts) holds the live data shapes r78's fixture lacked. On it the r78
 * rule gave 41 of the 73 Grade 4 skills as columns (a Curriculum Map send whose questions span 15 skills, MAP plan /
 * MAP group sets of 10–12 skills, a co-teacher's 20-skill set, last year's teacher's work); r82 gives exactly the 7
 * skills the teacher chose. Guard: the columns == the skills LISTED on that teacher's Assigned page (by kind), exactly.
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { r82Fixture, type R82 } from "./helpers/r82-fixture";
import { ROOT } from "./helpers/db";
import { resolveActor } from "../src/server/auth/actor";
import type { Actor } from "../src/server/auth/rbac";
import { skillKeyIndex } from "../src/server/skills/status";
import { cellDetail, classSkills, gridOf, skillsGrid } from "../src/server/skills/skills-grid";
import { classReport, sourceCards } from "../src/server/skills/skills-report";
import { assignedPageSkills, countsAsAssigning, studentAssignedSkills } from "../src/server/skills/assigned-skills";
import { chosenSkills, keysOfDeclared } from "../src/server/skills/chosen-skills";
import { nafsCells, nafsColumn } from "../src/server/skills/nafs-skills";
import { planCards, planGrid } from "../src/server/skills/skills-plans";
import { studentSkillsForTeacher } from "../src/server/skills/student-skills";
import { assignedList, cancelAssignment, restoreMany, viewerCreators } from "../src/server/teacher/assigned";
import { ensureNafsFramework } from "../src/server/nafs/framework";
import { saveNafsQuestion } from "../src/server/nafs/bank";
import { createNafsPractice, listNafsPractice, myNafsPractice, nafsPracticeView } from "../src/server/nafs/practice";

const s = (v: unknown) => String(v ?? "");
const read = (f: string) => readFileSync(join(ROOT, f), "utf8");
const LINKS = { skill: (k: string) => `/skill/${k}`, plan: (x: string[]) => `/plan/${x.join(",")}`, student: (id: string) => `/student/${id}`, source: (x: string) => `/source/${x}`, assigned: "/assigned" };
const sorted = (x: Iterable<string>) => [...new Set(x)].sort();

let f: R82;
before(async () => { f = await r82Fixture(); });

describe("r82 📌 Student Skills = the skills the teacher CHOSE, on THEIR Assigned page", () => {
  const cols = async (who: Actor = f.teacher) => (await skillsGrid(f.repo, who, { classId: f.classId }, f.now)).skills.map((k) => k.key).sort();
  // r84: every assigned skill (plans included: the Class report / By source) — the Skills Grid itself leaves plans out
  const all = async (who: Actor = f.teacher) => gridOf(await classSkills(f.repo, who, { classId: f.classId }, f.now), { all: true }).skills.map((k) => k.key).sort();
  /** r84: the MAP study plan set ("MAP plan · Literary Text" → inference) is a plan: on the Plans tab, not a column */
  const COLS = () => f.mine.SKILL.filter((k) => k !== "fam:inference").sort();

  test("the cause, reproduced: one Curriculum Map place holds questions of 15 skills — only its 3 declared skills count", async () => {
    const ix = await skillKeyIndex(f.repo, f.schoolId);
    assert.deepEqual(sorted(keysOfDeclared("Reread / Diagrams and Headings \\ Compare and Contrast", ix).keys()), ["fam:compare-contrast", "fam:reread", "fam:text-features"]);
    const rows = await f.repo.findMany("Assignment", { classId: f.classId, deletedAt: null });
    const chosen = await chosenSkills(f.repo, f.schoolId, rows, ix);
    const byTitle = (t: RegExp) => rows.filter((a) => t.test(s(a.title))).map((a) => chosen.get(s(a.id))!);
    for (const c of byTitle(/Analyze Craft and Structure/)) { assert.equal(c.by, "MAP_PLACE"); assert.deepEqual(sorted(c.keys.keys()), ["fam:compare-contrast", "fam:reread", "fam:text-features"]); }
    assert.ok(byTitle(/Analyze Craft and Structure/).length >= 2, "the plan's place and the direct section send");
    assert.deepEqual(byTitle(/^MAP plan · /).map((c) => [c.by, sorted(c.keys.keys())]), [["MAP_PLAN", ["fam:inference"]]], "MAP plan set: the area's skill");
    assert.deepEqual(byTitle(/^MAP group · /).map((c) => [c.by, c.keys.size]), [["NONE", 0]], "a MAP goal-area group: no skill was chosen");
    assert.deepEqual(byTitle(/^Summarize practice/).map((c) => [c.by, sorted(c.keys.keys())]), [["ONE_SKILL_SET", ["fam:summarize"]]], "a set of one skill");
    assert.deepEqual(byTitle(/^Grammar & vocabulary mix/).map((c) => c.keys.size), [0], "a 20-skill mix: no skill (r78 counted 20)");
    assert.deepEqual(byTitle(/^Unit 1$/).map((c) => c.by), ["NONE"], "a unit assignment: no skill");
  });

  test("Elrefaie's grid: exactly her 7 chosen skills — no co-teacher / last-year / practised-only / test / withdrawn / cancelled skill", async () => {
    const c = await all();
    assert.deepEqual(c, sorted([...f.mine.SKILL, ...f.mine.PLAN]));
    assert.deepEqual(await cols(), COLS(), "r84: the Skills Grid = the single assigns and the Curriculum section (not the MAP plan set)");
    assert.ok(c.length < f.mixedSkills.length, `${c.length} columns, not the ${f.mixedSkills.length} skills of the place's questions`);
    for (const k of [...f.others, "fam:figurative-language", "fam:adjectives", "fam:adverbs", "fam:nouns", "fam:cause-effect", "fam:central-idea", "fam:character"]) assert.ok(!c.includes(k), k);
    assert.equal(classReport(await classSkills(f.repo, f.teacher, { classId: f.classId }, f.now), LINKS, f.now).skillsAssigned, 7, "Class report: 7 skills assigned");
    // whole year / a date range / each source: the same rule
    const d = await classSkills(f.repo, f.teacher, { classId: f.classId, range: { from: "2026-10-01", to: "2026-10-31" } }, f.now);
    assert.deepEqual(d.skills.map((k) => k.key).sort(), c, "This month = the same skills (all made this month)");
    const bySource = new Set(sourceCards(d).flatMap((card) => gridOf(d, { plan: card.source, all: true }).skills.map((k) => k.key)));
    assert.deepEqual(sorted(bySource), c, "By source: the union of the cards is the grid");
  });

  test("GUARD: the columns == the skills listed on the teacher's Assigned page (by kind), exactly", async () => {
    const ix = await skillKeyIndex(f.repo, f.schoolId);
    const page = await assignedPageSkills(f.repo, f.teacher, f.classId, ix);
    assert.deepEqual(sorted(page.byKind.SKILL), sorted(f.mine.SKILL), "SKILL rows");
    assert.deepEqual(sorted(page.byKind.PLAN), sorted(f.mine.PLAN), "PLAN rows (the sent Curriculum Map plan's place)");
    assert.equal(page.byKind.NAFS_PRACTICE.size, 0);
    assert.deepEqual(await all(), sorted([...page.byKind.SKILL, ...page.byKind.PLAN, ...page.byKind.NAFS_PRACTICE]), "every assigned skill == Assigned page skills");
    assert.deepEqual(await cols(), sorted(page.columns), "r84 GUARD: grid columns == the Assigned page's skills by the plan rule");
    assert.ok(!page.items.some((i) => i.teacher && i.teacher.id !== f.teacher.userId), "her Assigned page lists only her work");
    // the admin: every teacher's work (Assigned page with every teacher = the admin's grid)
    const adminPage = await assignedPageSkills(f.repo, f.admin, f.classId, ix);
    const adminCols = await all(f.admin);
    assert.deepEqual(adminCols, sorted([...adminPage.byKind.SKILL, ...adminPage.byKind.PLAN, ...adminPage.byKind.NAFS_PRACTICE]), "admin: the same guard");
    assert.deepEqual(await cols(f.admin), sorted(adminPage.columns), "admin: the r84 column guard");
    for (const k of f.others) assert.ok(adminCols.includes(k), `admin sees ${k}`);
    assert.ok(!adminCols.includes("fam:figurative-language") && !adminCols.includes("fam:adjectives"), "never a practised-only skill or a test's skill");
    // the co-teacher sees only theirs
    assert.deepEqual(await cols(f.coTeacher), ["fam:capitalization"], "the co-teacher: their one chosen skill (their 20-skill mix chose none)");
    assert.deepEqual(await viewerCreators(f.repo, f.admin, [f.classId]), null);
  });

  test("per-student view and removed-for-one-student follow the same rule", async () => {
    const [s0, s1] = f.ids;
    const v0 = await studentSkillsForTeacher(f.repo, f.teacher, s0, f.now);
    const keys0 = v0.assigned.groups.flatMap((g) => g.rows.map((r) => r.key)).sort();
    assert.deepEqual(keys0, await all(), "s0 got all 7 (incl. the MAP plan set made for s0)");
    assert.ok(!keys0.includes("fam:figurative-language"), "practised, never assigned → not in the student view");
    const v1 = await studentSkillsForTeacher(f.repo, f.teacher, s1, f.now);
    const keys1 = v1.assigned.groups.flatMap((g) => g.rows.map((r) => r.key));
    assert.ok(!keys1.includes("fam:commas"), "commas removed for s1 on Assigned");
    assert.ok(!keys1.includes("fam:inference"), "the MAP plan set went to s0 only");
    const g = await skillsGrid(f.repo, f.teacher, { classId: f.classId }, f.now);
    assert.ok(g.assigned![s0]["fam:commas"] && !g.assigned![s1]["fam:commas"]);
    const ix = await skillKeyIndex(f.repo, f.schoolId);
    assert.ok((await studentAssignedSkills(f.repo, s0, ix)).byStudent.get(s0)!.has("fam:capitalization"), "without a viewer (admin rule): every teacher's");
    assert.ok(!(await studentAssignedSkills(f.repo, s0, ix, await viewerCreators(f.repo, f.teacher, [f.classId]))).byStudent.get(s0)!.has("fam:capitalization"), "the teacher's own: not the co-teacher's");
  });

  test("the wiring: no skill inferred from a mix of questions; tests never assign; the viewer's own Assigned rows", () => {
    const src = read("src/server/skills/assigned-skills.ts");
    assert.doesNotMatch(src, /SET_SKILLS_CAP|skillsOfSets/, "the up-to-20-skills-per-set rule is gone");
    assert.match(src, /chosenSkills\(/);
    assert.match(read("src/server/skills/skills-grid.ts"), /viewerCreators\(/);
    assert.match(read("src/server/skills/student-skills.ts"), /viewerCreators\(/);
    for (const k of ["TEST", "PROGRESS_CHECK", "MAP_TEST", "NAFS_TEST", "LEARN"] as const) assert.equal(countsAsAssigning({ kind: k, detail: null }), false, k);
    assert.equal(countsAsAssigning({ kind: "NAFS_PRACTICE", detail: null }), true);
  });
});

describe("r82 🇸🇦 NAFS adaptive practice = assigned, source NAFS", () => {
  let t6: Actor; let k6 = ""; let st6: string[] = []; let pid = ""; let a: Actor; let b: Actor;
  // r84: a practice on 2 targets is a PLAN — its skills are counted (all) but never Skills Grid columns
  const nafsCols = async () => gridOf(await classSkills(f.repo, t6, { classId: k6 }, f.now), { all: true }).skills.filter((k) => k.key.startsWith("nafs:"));

  before(async () => {
    const repo = f.repo;
    t6 = await resolveActor(repo, (await repo.findUnique("User", { username: "demo.teacher.6a" }))!);
    const tid = s((await repo.findUnique("Teacher", { userId: t6.userId }))!.id);
    k6 = s((await repo.findMany("ClassTeacher", { teacherId: tid }))[0].classId);
    st6 = (await repo.findMany("ClassMembership", { classId: k6 })).map((m) => s(m.studentId)).sort();
    const act = async (sid: string) => resolveActor(repo, (await repo.findUnique("User", { id: (await repo.findUnique("Student", { id: sid }))!.userId }))!);
    a = await act(st6[0]); b = await act(st6[1]);
    await ensureNafsFramework(repo);
    for (const d of [1, 2, 3] as const) for (let k = 0; k < 3; k++) {
      await saveNafsQuestion(repo, t6, { nafsCode: "NAFS.IAE.EVAL", standard: "MOE.S12", difficulty: d, stem: `Could this event really happen? level ${d} number ${k}`, options: [`yes ${d}${k}`, `no ${d}${k}`, `maybe ${d}${k}`, `never ${d}${k}`], correct: 1 });
      await saveNafsQuestion(repo, t6, { nafsCode: "NAFS.RC.MAIN", difficulty: d, stem: `What is the main idea of the text? level ${d} number ${k}`, options: [`idea ${d}${k}`, `detail ${d}${k}`, `title ${d}${k}`, `end ${d}${k}`], correct: 1 });
    }
    // "Assign adaptive practice now" from the Suggested plan: the group's weak standard + a NAFS skill, two students
    pid = (await createNafsPractice(repo, t6, { title: "S12 group practice", targets: ["MOE.S12", "NAFS.RC.MAIN"], classId: k6, studentIds: [st6[0], st6[1]] }, f.now)).id;
    // answers (NAFS tables only): a — S12: 4 of the last 5 right, ≥ 2 at Medium/Hard → mastered; b — main idea: 2 answers
    const run = async (sid: string) => s((await repo.create("NafsPracticeRun", { practiceId: pid, studentId: sid, classId: k6, state: {}, asked: 0, correct: 0, startedAt: f.now, updatedAt: f.now })).id);
    const ra = await run(st6[0]), rb = await run(st6[1]);
    const ans = (runId: string, sid: string, target: string, list: [number, boolean][]) => Promise.all(list.map(([d, ok], i) => repo.create("NafsPracticeAnswer", { runId, practiceId: pid, studentId: sid, questionId: `q${i}`, target, difficulty: d, choice: ok ? 1 : 0, correct: ok, ms: 9000, at: new Date(f.now.getTime() - 3_600_000 + i * 60_000) })));
    await ans(ra, st6[0], "MOE.S12", [[2, true], [3, true], [2, false], [3, true], [2, true]]);
    await ans(rb, st6[1], "NAFS.RC.MAIN", [[2, true], [3, false]]);
  });

  test("(a) on the teacher's Assigned page: listed as NAFS practice", async () => {
    const page = await assignedList(f.repo, t6, { classId: k6 }, f.now);
    assert.ok(page.items.some((i) => i.kind === "NAFS_PRACTICE" && i.id === pid && i.recipients === 2));
    const ix = await skillKeyIndex(f.repo, f.schoolId);
    assert.deepEqual(sorted((await assignedPageSkills(f.repo, t6, k6, ix)).byKind.NAFS_PRACTICE), ["nafs:MOE.S12", "nafs:NAFS.RC.MAIN"]);
  });

  test("(b) Student Skills: one column per target in the NAFS area, source NAFS, stars from the NAFS answers", async () => {
    // r84: 2 targets = a plan → not in the Skills Grid; its own plan grid (and By source / Class report) has the columns
    assert.deepEqual((await skillsGrid(f.repo, t6, { classId: k6 }, f.now)).skills.filter((k) => k.key.startsWith("nafs:")), [], "a 2-standard practice adds no Skills Grid column");
    const dd = await classSkills(f.repo, t6, { classId: k6 }, f.now);
    assert.deepEqual(planCards(dd).map((c) => [c.id, c.type, c.skills, c.students]), [[`nafs:${pid}`, "NAFS", 2, 2]], "its Plans card");
    assert.deepEqual(planGrid(dd, `nafs:${pid}`)!.skills.map((k) => k.key).sort(), ["nafs:MOE.S12", "nafs:NAFS.RC.MAIN"]);
    const g = gridOf(dd, { all: true });
    const s12 = g.skills.find((k) => k.key === "nafs:MOE.S12")!;
    assert.equal(s12.code, "S12"); assert.equal(s12.short, "Could it happen?"); assert.equal(s12.strand, "NAFS"); assert.deepEqual(s12.sources, ["NAFS"]);
    assert.equal(nafsColumn("nafs:MOE.S12").name, "Could it happen?");
    assert.equal(g.skills.find((k) => k.key === "nafs:NAFS.RC.MAIN")!.name, "Main idea");
    assert.ok(g.groups!.some((x) => x.strand === "NAFS" && x.label === "NAFS"), "grouped under a NAFS area");
    assert.equal(g.cells[st6[0]]["nafs:MOE.S12"].status, "MASTERED", "a: 4 of the last 5 right (≥ 2 at Medium/Hard) → ⭐");
    assert.equal(g.cells[st6[0]]["nafs:MOE.S12"].answered, 5); assert.equal(g.cells[st6[0]]["nafs:MOE.S12"].correct, 4);
    assert.equal(g.cells[st6[1]]["nafs:NAFS.RC.MAIN"].status, "IN_PROGRESS", "b: started → ◐");
    assert.equal(g.cells[st6[1]]["nafs:MOE.S12"].status, "NOT_STARTED", "b: ☆");
    assert.ok(!g.assigned![st6[2]]?.["nafs:MOE.S12"], "a student not chosen: —");
    assert.equal(s12.total, 2); assert.equal(s12.mastered, 1);
    // the GUARD for NAFS too
    const ix = await skillKeyIndex(f.repo, f.schoolId);
    const page = await assignedPageSkills(f.repo, t6, k6, ix);
    assert.deepEqual(g.skills.map((k) => k.key).sort(), sorted([...page.byKind.SKILL, ...page.byKind.PLAN, ...page.byKind.NAFS_PRACTICE]));
    assert.equal(page.columns.size, 0, "r84: no column by the plan rule");
    // the cell detail and the per-student view
    const det = await cellDetail(f.repo, t6, st6[0], "nafs:MOE.S12");
    assert.equal(det!.view.status, "MASTERED"); assert.equal(det!.accuracy, 80);
    const v = await studentSkillsForTeacher(f.repo, t6, st6[0], f.now);
    const nafs = v.assigned.groups.find((x) => x.strand === "NAFS")!;
    assert.deepEqual(nafs.rows.map((r) => [r.code, r.status, r.sources.join()]), [["S12", "MASTERED", "NAFS"], ["", "NOT_STARTED", "NAFS"]]);
    // pure: the mastery rule replayed per practice
    const cells = nafsCells([0, 1, 2, 3].map((i) => ({ practiceId: "p", studentId: "x", target: "MOE.S01", difficulty: 1, correct: true, at: new Date(1000 + i) })), { end: 10_000, cut: 0 });
    assert.equal(cells.get("x|nafs:MOE.S01")!.now.status, "IN_PROGRESS", "4 answers: not yet (needs 5, two at Medium or Hard)");
  });

  test("(c) By source card NAFS and the Class report include them", async () => {
    const d = await classSkills(f.repo, t6, { classId: k6 }, f.now);
    const card = sourceCards(d).find((c) => c.source === "NAFS")!;
    assert.equal(card.skills, 2); assert.equal(card.answered, 7); assert.equal(card.stars.MASTERED, 1);
    const r = classReport(d, LINKS, f.now);
    assert.equal(r.skillsAssigned, 2); assert.equal(r.withWork, 2);
    assert.ok(r.rows.some((x) => x.id === st6[0] && x.mastered === 1));
  });

  test("cancel on Assigned → gone everywhere (grid, report, student's NAFS, the teacher's NAFS list); Undo brings it back", async () => {
    assert.ok((await myNafsPractice(f.repo, b)).some((x) => x.id === pid));
    await cancelAssignment(f.repo, t6, "NAFS_PRACTICE", pid, st6[1], f.now);
    let g = gridOf(await classSkills(f.repo, t6, { classId: k6 }, f.now), { all: true });
    assert.ok(!g.assigned![st6[1]]?.["nafs:NAFS.RC.MAIN"], "b removed: —");
    assert.ok(!(await myNafsPractice(f.repo, b)).some((x) => x.id === pid), "b no longer has it");
    await assert.rejects(nafsPracticeView(f.repo, b, pid));
    assert.ok((await myNafsPractice(f.repo, a)).some((x) => x.id === pid), "a keeps it");
    await cancelAssignment(f.repo, t6, "NAFS_PRACTICE", pid, null, f.now);
    assert.deepEqual(await nafsCols(), [], "cancelled for everyone: no NAFS column");
    assert.equal(classReport(await classSkills(f.repo, t6, { classId: k6 }, f.now), LINKS, f.now).skillsAssigned, 0);
    assert.ok(!(await myNafsPractice(f.repo, a)).some((x) => x.id === pid));
    assert.ok(!(await listNafsPractice(f.repo, t6, f.now)).some((x) => x.id === pid), "the NAFS center's list too");
    await restoreMany(f.repo, t6, [{ kind: "NAFS_PRACTICE", id: pid }], f.now);
    assert.equal((await nafsCols()).length, 2, "Undo: back");
    g = gridOf(await classSkills(f.repo, t6, { classId: k6 }, f.now), { all: true });
    assert.ok(!g.assigned![st6[1]]?.["nafs:NAFS.RC.MAIN"], "b's own removal stays until undone for b");
  });
});
