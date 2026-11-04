/**
 * Each program in its own place (in-memory Demo School; no real student data):
 *  - programOf: Assignment.program, else inferred from track / curriculumPlanId (older rows)
 *  - myWorkByProgram: a student's assigned work for ONE program
 *  - MAP page: skills are suggested from each student's LOWEST sub-areas; sent work is tagged MAP
 *  - the old MAP / growth / plan routes redirect to the right tab of /teacher/map-center
 *  - a teacher cannot send to another teacher's class (nor to a student outside the class)
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import { ForbiddenError, type Actor } from "../src/server/auth/rbac";
import { assignSkill, teacherCurriculum } from "../src/server/teacher/assign";
import { gradeAreaSkills } from "../src/server/map/recommend";
import { myWorkByProgram, programOf, programOfPlanKind, PROGRAMS } from "../src/server/plans/program";
import { lowestAreas, suggestMapPlan } from "../src/server/plans/map-suggest";
import { applyEdits, picksOf, sendProgramPlan, sentPlans } from "../src/server/plans/send";
import { planKey, readPlanForm } from "../src/server/plans/plan-form";
import { assignPlan } from "../src/server/plans/wizard";
import { mapCenterHref, mapTabOf } from "../src/app/teacher/map-center/href";
import { DEMO_SCHOOL_CODE } from "../src/server/seeding/demo";
import { loadBank } from "../src/server/seeding/load-files";
import { seedQuestions } from "../src/server/seeding/questions";
import { UI_STRINGS } from "../src/i18n/en";
import { ar } from "../src/i18n/ar";
import { demoDatabase, ROOT } from "./helpers/db";

const NOW = new Date("2027-01-10T08:00:00Z");
const read = (f: string) => readFileSync(join(ROOT, f), "utf8");

describe("programOf (pure)", () => {
  test("the stored program wins; older rows are inferred from track and curriculumPlanId", () => {
    assert.deepEqual([...PROGRAMS], ["MAP", "RTI", "CURRICULUM", "NAFS"]);
    assert.equal(programOf({ program: "RTI", track: "MAP" }), "RTI");
    assert.equal(programOf({ program: null, track: "MAP" }), "MAP");
    assert.equal(programOf({ track: "NAFS" }), "NAFS");
    assert.equal(programOf({ track: "RTI" }), "RTI");
    assert.equal(programOf({ track: "CURRICULUM" }), "CURRICULUM");
    assert.equal(programOf({ track: "GRAMMAR" }), "CURRICULUM", "grammar work belongs to the curriculum");
    assert.equal(programOf({ track: "CUSTOM", curriculumPlanId: "p1" }), "CURRICULUM", "a full-curriculum plan place");
    assert.equal(programOf({ track: "CUSTOM" }), null, "a custom plan has no program");
    assert.equal(programOf({}), "CURRICULUM", "rows from before the track column");
    assert.equal(programOf({ program: "BOGUS", track: "NAFS" }), "NAFS", "an unknown stored value falls back");
    assert.equal(programOf(null), null);
    assert.deepEqual(["MAP", "RTI", "NAFS", "UNIT", "PLACES", "CURRICULUM", "CUSTOM"].map(programOfPlanKind), ["MAP", "RTI", "NAFS", "CURRICULUM", "CURRICULUM", "CURRICULUM", null]);
  });

  test("lowest sub-areas: lowest RIT first, one per area", () => {
    const g = [{ areaId: "a", name: "A", rit: 200 }, { areaId: "b", name: "B", rit: 181 }, { areaId: "c", name: "C", rit: 190 }, { areaId: "b", name: "B again", rit: 185 }];
    assert.deepEqual(lowestAreas(g, 2).map((x) => x.areaId), ["b", "c"]);
  });

  test("plan form: ticks count only for the same options; edits keep / add", () => {
    const get = (m: Record<string, string>) => (k: string) => m[k] ?? null;
    const key = planKey("c1", "group", ["s1", "s2"], ["READING"]);
    const f = readPlanForm(get({ classId: "c1", who: "group", edited: "1", pkey: key, dueAt: "2027-02-01" }), (k) => ({ sid: ["s1", "s2"], keep: ["k1"], add: ["k9"] } as Record<string, string[]>)[k] ?? [], ["READING"]);
    assert.deepEqual([f.keep, f.add, f.studentIds, f.dueText], [["k1"], ["k9"], ["s1", "s2"], "2027-02-01"]);
    const stale = readPlanForm(get({ classId: "c1", who: "group", edited: "1", pkey: key }), (k) => ({ sid: ["s1", "s2"], keep: ["k1"] } as Record<string, string[]>)[k] ?? [], ["LANGUAGE"]);
    assert.equal(stale.keep, null, "another subject: the suggestion starts fresh");
    const plan = applyEdits([{ id: "k1", name: "One", reason: "r", studentIds: ["s1"] }, { id: "k2", name: "Two", reason: "r", studentIds: ["s2"] }], ["k1"], [{ id: "k9", name: "Nine" }, { id: "k1", name: "One" }], ["s1", "s2"]);
    assert.deepEqual(plan.map((k) => [k.id, k.studentIds]), [["k1", ["s1"]], ["k9", ["s1", "s2"]]]);
    assert.deepEqual(picksOf(plan), [{ studentId: "s1", skillId: "k1" }, { studentId: "s1", skillId: "k9" }, { studentId: "s2", skillId: "k9" }]);
  });
});

describe("program pages (Demo School)", () => {
  let repo: SqliteRepo;
  let t4: Actor, t5: Actor;
  let class4: string, class5: string;
  let students4: string[];
  const actorFor = async (username: string) => resolveActor(repo, (await repo.findUnique("User", { username }))!);

  before(async () => {
    ({ repo } = await demoDatabase());
    await seedQuestions(repo, { schoolCode: DEMO_SCHOOL_CODE, bank: loadBank(ROOT) });
    const qs = (await repo.findMany("Question", { status: "UNDER_REVIEW" })).filter((q) => /^G4-/.test(String(q.externalRef)));
    await repo.updateMany("Question", { id: { in: qs.map((q) => q.id) } }, { status: "PUBLISHED" });
    t4 = await actorFor("demo.teacher.4a");
    t5 = await actorFor("demo.teacher.5a");
    class4 = (await teacherCurriculum(repo, t4))!.classId;
    class5 = (await teacherCurriculum(repo, t5))!.classId;
    students4 = (await repo.findMany("ClassMembership", { classId: class4, leftAt: null })).map((m) => String(m.studentId)).sort();
  });

  test("MAP suggestions come from each student's lowest sub-areas; the sent plan is MAP work", async () => {
    const admin = await actorFor("demo.admin");
    const areas = await gradeAreaSkills(repo, admin.schoolId!, 4);
    const reading = new Set((await repo.findMany("MapGoalArea", { subject: "READING" })).map((a) => String(a.id)));
    const withSkills = areas.filter((a) => reading.has(a.areaId) && a.skills.length >= 1);
    assert.ok(withSkills.length >= 4, "Grade 4 has Reading sub-areas with practisable skills");
    const [low1, low2, ...high] = withSkills;
    const [sA, sB] = students4;
    const at = new Date("2026-09-20T08:00:00Z");
    const row = (studentId: string, goal: { areaId: string; area: string } | null, rit: number) => ({ studentId, testDate: at, subject: "Reading", goalName: goal ? goal.area : null, goalAreaId: goal ? goal.areaId : null, rit, termName: "Fall 2026", importedAt: at });
    await repo.createMany("MapResult", [
      row(sA, null, 195), row(sA, low1, 178), row(sA, low2, 183), ...high.map((a) => row(sA, a, 214)),
      // student B: the opposite order, so each student gets THEIR lowest areas
      row(sB, null, 205), row(sB, low1, 220), row(sB, low2, 221), ...high.map((a, i) => row(sB, a, 190 + i)),
    ]);
    const sug = await suggestMapPlan(repo, t4, { classId: class4, subject: "READING" });
    const a = sug.rows.find((r) => r.studentId === sA)!;
    assert.deepEqual(a.areas.map((x) => x.name), [low1.area, low2.area], "student A: their two lowest sub-areas, lowest first");
    const b = sug.rows.find((r) => r.studentId === sB)!;
    assert.deepEqual(b.areas.map((x) => x.name), high.slice(0, 2).map((x) => x.area), "student B: their own lowest sub-areas");
    const forA = sug.skills.filter((k) => k.studentIds.includes(sA));
    assert.ok(forA.length > 0 && forA.every((k) => [low1, low2].some((ar) => ar.skills.some((s) => s.id === k.id))), "A's skills belong to A's lowest sub-areas");
    assert.ok(sug.noScores.length === students4.length - 2, "students without scores are listed apart");
    assert.equal(sug.rows[0].studentId, sA, "lowest RIT first");

    // the teacher removes one skill and adds one, then sends: tagged MAP, only to the right students
    const extra = (await repo.findMany("Skill", { id: { in: high[high.length - 1].skills.map((k) => k.id) } }))[0];
    const plan = applyEdits(sug.skills, sug.skills.slice(1).map((k) => k.id), [{ id: String(extra.id), name: String(extra.name) }], [sA, sB]);
    const r = await sendProgramPlan(repo, t4, { source: "CURRICULUM", classId: class4, program: "MAP", title: "MAP Plan · test", picks: picksOf(plan), dueAt: null }, NOW);
    assert.equal(r.skills, plan.length);
    const rows = await repo.findMany("Assignment", { id: { in: r.assignmentIds } });
    assert.ok(rows.every((x) => x.program === "MAP" && x.track === "MAP"));
    assert.equal((await repo.findUnique("SkillPlan", { id: r.planId }))!.kind, "MAP");
    const removed = sug.skills[0].id;
    assert.ok(!rows.some((x) => x.skillId === removed), "the unticked skill is not sent");
    const work = await myWorkByProgram(repo, sA, "MAP", NOW);
    assert.ok(work.length >= 1 && work.every((w) => w.program === "MAP"));
    assert.deepEqual(await myWorkByProgram(repo, students4[2], "MAP", NOW), [], "a student with no MAP work");
  });

  test("myWorkByProgram returns only one program's work (older rows inferred)", async () => {
    const skills = (await teacherCurriculum(repo, t4, class4))!.units.flatMap((u) => u.skills).slice(0, 4).map((k) => k.id);
    const st = students4[2];
    const cur = await assignSkill(repo, t4, { source: "CURRICULUM", classId: class4, skillId: skills[0], studentIds: [st], track: "CURRICULUM" }, NOW);
    const nafsOld = await assignSkill(repo, t4, { source: "NAFS", classId: class4, skillId: skills[1], studentIds: [st], track: "NAFS" }, NOW); // no program: an older row
    const rti = await sendProgramPlan(repo, t4, { source: "CURRICULUM", classId: class4, program: "RTI", picks: [{ studentId: st, skillId: skills[2] }] }, NOW);
    const custom = await sendProgramPlan(repo, t4, { source: "CURRICULUM", classId: class4, program: null, picks: [{ studentId: st, skillId: skills[3] }] }, NOW);
    assert.equal((await repo.findUnique("Assignment", { id: custom.assignmentIds[0] }))!.program ?? null, null, "a custom plan has no program");
    const ids = async (p: "MAP" | "RTI" | "CURRICULUM" | "NAFS") => (await myWorkByProgram(repo, st, p, NOW)).map((w) => w.assignmentId);
    assert.deepEqual(await ids("CURRICULUM"), [cur.assignmentId]);
    assert.deepEqual(await ids("NAFS"), [nafsOld.assignmentId]);
    assert.deepEqual(await ids("RTI"), rti.assignmentIds);
    assert.deepEqual(await ids("MAP"), []);
    const w = (await myWorkByProgram(repo, st, "RTI", NOW))[0];
    assert.match(w.href, /^\/practice\//);
    assert.equal(w.status, "NOT_STARTED");
    assert.equal(w.progress, 0);
    // removed work disappears
    await repo.updateMany("Assignment", { id: cur.assignmentId }, { deletedAt: NOW });
    assert.deepEqual(await ids("CURRICULUM"), []);
  });

  test("the Plans wizard tags its plans too (NAFS → NAFS, Custom → none)", async () => {
    const skill = (await teacherCurriculum(repo, t4, class4))!.units.flatMap((u) => u.skills)[5].id;
    const r = await assignPlan(repo, t4, { source: "CURRICULUM", classId: class4, type: "CUSTOM", skillIds: [skill] }, NOW);
    assert.equal((await repo.findUnique("Assignment", { id: r.assignmentIds[0] }))!.program ?? null, null);
    const n = await assignPlan(repo, t4, { source: "CURRICULUM", classId: class4, type: "NAFS", studentIds: [students4[0]] }, NOW);
    if (n.assignmentIds.length) assert.ok((await repo.findMany("Assignment", { id: { in: n.assignmentIds } })).every((a) => a.program === "NAFS"));
  });

  test("All plans sent: every plan of the teacher with its program, students and progress — never another teacher's", async () => {
    const mine = await sentPlans(repo, t4);
    assert.ok(mine.length >= 3);
    assert.ok(mine.some((p) => p.program === "MAP" && p.title === "MAP Plan · test" && p.students === 2 && p.progress === 0 && p.href.startsWith("/teacher/plans/")));
    assert.ok(mine.some((p) => p.program === "RTI") && mine.some((p) => p.program === null));
    assert.deepEqual(await sentPlans(repo, t5), [], "teacher 5a sent nothing");
  });

  test("a teacher cannot send to another teacher's class, nor to a student outside the class", async () => {
    const skill = (await teacherCurriculum(repo, t4, class4))!.units.flatMap((u) => u.skills)[0].id;
    const st5 = (await repo.findMany("ClassMembership", { classId: class5, leftAt: null }))[0].studentId as string;
    await assert.rejects(sendProgramPlan(repo, t4, { source: "CURRICULUM", classId: class5, program: "MAP", picks: [{ studentId: st5, skillId: skill }] }, NOW), ForbiddenError);
    await assert.rejects(sendProgramPlan(repo, t4, { source: "CURRICULUM", classId: class4, program: "MAP", picks: [{ studentId: st5, skillId: skill }] }, NOW), ForbiddenError);
    await assert.rejects(suggestMapPlan(repo, t4, { classId: class5 }), ForbiddenError, "another class's MAP data is private");
    await assert.rejects(suggestMapPlan(repo, t4, { classId: class4, studentIds: [st5] }), ForbiddenError);
    assert.equal(await repo.count("SkillPlan", { classId: class5 }), 0, "nothing half-made");
  });
});

describe("one place per program: routes", () => {
  test("old MAP routes redirect to the right tab of /teacher/map-center", () => {
    const expect: Record<string, string> = {
      "map-plans": "\"plan\"", "map-skill-plan": "\"plan\"", "personal-plan": "\"plan\"", "map-recommendations": "\"plan\"",
      growth: "\"reports\"", "map-reports": "\"reports\"", "map-overview": "\"reports\"",
    };
    for (const [route, tab] of Object.entries(expect)) {
      const src = read(`src/app/teacher/${route}/page.tsx`);
      assert.match(src, /redirect\(mapCenterHref\(/, `${route} redirects`);
      assert.ok(src.includes(tab), `${route} → ${tab}`);
    }
    assert.match(read("src/app/teacher/map-plans/page.tsx"), /"matrix" \? "results"/, "the class matrix opens Results");
    // the server actions of the old pages are kept
    for (const f of ["map-plans/actions.ts", "map-skill-plan/actions.ts", "personal-plan/actions.ts", "map-recommendations/actions.ts", "map-overview/actions.ts"]) assert.ok(existsSync(join(ROOT, "src/app/teacher", f)), f);
    assert.equal(mapCenterHref("plan", { classId: "c1", subject: "language", msg: "Saved" }), "/teacher/map-center?tab=plan&classId=c1&subject=LANGUAGE&msg=Saved");
    assert.equal(mapCenterHref("reports", {}, { view: "overview" }), "/teacher/map-center?tab=reports&view=overview");
    assert.equal(mapTabOf("student"), "results", "old MAP Center tabs open Results");
  });

  test("MAP page: three tabs, Enter scores from Results, friendly empty state; RTI and Plans pages send their own program", () => {
    const page = read("src/app/teacher/map-center/page.tsx");
    for (const w of ["\"Results\"", "\"Reports\"", "\"Make a MAP plan\""]) assert.ok(page.includes(w), w);
    const results = read("src/app/teacher/map-center/results-tab.tsx");
    assert.match(results, /title="No MAP scores yet"/);
    assert.match(results, /href="\/teacher\/map-rit"/);
    assert.match(read("src/app/teacher/map-center/reports-tab.tsx"), /growth\.find\(\(c\) => c\.classId === classId && c\.tested > 0\)/, "growth only when Winter/Spring data exists");
    assert.match(read("src/app/teacher/map-center/actions.ts"), /program: "MAP"/);
    assert.match(read("src/app/teacher/rti-plan/actions.ts"), /program: "RTI"/);
    assert.match(read("src/app/teacher/plans/actions.ts"), /program: kind === "nafs" \? "NAFS" : null/);
    const plans = read("src/app/teacher/plans/page.tsx");
    assert.ok(!/PLAN_TYPES/.test(plans), "no MAP / RTI / Curriculum builders on Plans");
    assert.match(plans, /<ProgramChip program=\{p\.program\} \/>/);
    assert.ok(existsSync(join(ROOT, "src/app/teacher/rti-plan/weekly/page.tsx")), "the weekly RTI groups sheet is kept");
  });

  test("every new interface string has an Arabic version", () => {
    for (const s of ["Make a MAP plan", "All plans sent", "Suggest skills", "Enter scores", "No MAP scores yet", "Change the skills", "Send", "NAFS plan", "Custom plan"]) {
      assert.ok((UI_STRINGS as readonly string[]).includes(s), s);
      assert.ok((ar as Record<string, string>)[s], `ar: ${s}`);
    }
  });
});
