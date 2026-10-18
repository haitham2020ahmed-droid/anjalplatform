/**
 * r74 (owner): Student Skills shows ONLY ASSIGNED skills, and every assign carries a required SOURCE
 * (MAP · NAFS · Curriculum · Grammar · RTI). In-memory demo school, KNOWN assignments and stars:
 *
 *   theme          Curriculum → s0 s1 s2 · MAP → s0 s1 (two sources)   stars: s0 ⭐ · s1 ◐ needs support · s2 ⭐
 *   commas         Grammar    → s0 s1 s2 s4 — nobody practised it (assigned, ☆)
 *   context clues  RTI        → s3                                       stars: s3 ⭐
 *   summarize      NAFS       → s2 (a SET of its questions, no skillId)
 *   figurative     an OLDER row (no source, program MAP) → s0           (inferred MAP)
 *   inference      practised by s1 (🔄) but NEVER assigned               → on no tab, in no number
 *   capitalization only in a teacher TEST (curriculumPlanId TEST)        → a test does not assign a skill
 *
 * Checked: the grid's columns / badges / "—" cells / filter, the By-source cards, the class report (4 numbers, the
 * line, 3 groups, ≤ 5 action points with buttons, the table), the server refusing work without a source on every
 * assign path, My Work merging one skill from two sources into one item, the strings (EN + AR) and the page.
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
import { ValidationError } from "../src/server/curriculum-admin";
import { skillKeyIndex } from "../src/server/skills/status";
import { classSkills, GRID_PLANS, gridOf, isGridPlan, skillsGrid } from "../src/server/skills/skills-grid";
import { classReport, GROUP_RULE, groupOf, sourceCards } from "../src/server/skills/skills-report";
import { isSkillWork } from "../src/server/skills/assigned-skills";
import { assignQuestions, assignSkill, assignSkillToClasses } from "../src/server/teacher/assign";
import { createAssignment } from "../src/server/teacher/assignments";
import { assignSkillByLevel } from "../src/server/teacher/skill-assign";
import { saveAssignDraft } from "../src/server/teacher/assign-drafts";
import { starAssign } from "../src/server/assign/star";
import { assignFromMap } from "../src/server/curriculum-map/levels";
import { createSkillPlan } from "../src/server/curriculum-map/plans";
import { sendMapPlan } from "../src/server/curriculum-map/send-plan";
import { sendScope } from "../src/server/curriculum-map/send-scope";
import { assignPlan, mergeWorkItems, myWorkItems } from "../src/server/plans/wizard";
import { sendProgramPlan } from "../src/server/plans/send";
import { sendPlan } from "../src/server/plans/editor";
import { assignRecommendations } from "../src/server/map/recommend";
import { assignRange } from "../src/server/map/skill-plan";
import { assignGroupSkills } from "../src/server/map/map-reports";
import { sendPlans, sendToGroup } from "../src/server/map/map-plan";
import { assignYearWeek } from "../src/server/map/year-plan";
import { assignTest } from "../src/server/tests/assessments";
import { skillPageAction } from "../src/server/skills/student-skills";
import { requireSource } from "../src/server/assign/source";
import { ASSIGN_SOURCES, isAssignSource, parseAssignSource, SOURCE_REQUIRED, sourceOfAssignment } from "../src/lib/assign-source";
import { UI_STRINGS } from "../src/i18n/en";
import { ar } from "../src/i18n/ar";

const s = (v: unknown) => String(v ?? "");
const read = (f: string) => readFileSync(join(ROOT, f), "utf8");
const DAY = 86_400_000;

describe("r74 🏷️ source on every assign + Student Skills = assigned skills only", () => {
  let repo: SqliteRepo; let teacher: Actor; let classId = ""; let schoolId = ""; let ids: string[] = []; let tid = "";
  const g4 = new Map<string, string>();
  const now = new Date("2026-10-14T09:00:00Z");
  const key = async (code: string) => (await skillKeyIndex(repo, schoolId)).keyOf.get(g4.get(code)!)!;
  const star = async (sid: string, code: string, status: string, extra: Record<string, unknown> = {}) => repo.create("SkillStatus", {
    studentId: sid, skillKey: await key(code), level: 1, status, skillId: g4.get(code), answered: status === "MASTERED" ? 34 : 12, correct: status === "MASTERED" ? 30 : 6,
    score: status === "MASTERED" ? 100 : 48, startedAt: now, masteredAt: status === "MASTERED" ? new Date(now.getTime() - 3 * DAY) : null, createdAt: now, updatedAt: now, history: [], ...extra,
  });

  before(async () => {
    ({ repo } = await demoDatabase({ classesPerGrade: 1, studentsPerClass: 5 }));
    await publishGrade4Bank(repo);
    teacher = await resolveActor(repo, (await repo.findUnique("User", { username: "demo.teacher.4a" }))!);
    schoolId = teacher.schoolId!;
    tid = s((await repo.findUnique("Teacher", { userId: teacher.userId }))!.id);
    classId = s((await repo.findMany("ClassTeacher", { teacherId: tid }))[0].classId);
    ids = (await repo.findMany("ClassMembership", { classId })).map((m) => s(m.studentId)).sort();
    const g = (await repo.findMany("Grade", { schoolId, level: 4 }))[0];
    const cur = (await repo.findMany("Curriculum", { gradeId: g.id }))[0];
    for (const k of await repo.findMany("Skill", { curriculumId: cur.id })) g4.set(s(k.code).replace(/^G4\./, ""), s(k.id));
    const [s0, s1, s2, s3, s4] = ids;
    // assignments (each with its source)
    await assignSkill(repo, teacher, { classId, skillId: g4.get("theme")!, studentIds: [s0, s1, s2], source: "CURRICULUM", startAt: new Date(now.getTime() - DAY), dueAt: new Date(now.getTime() + 3 * DAY) }, now);
    await assignSkill(repo, teacher, { classId, skillId: g4.get("theme")!, studentIds: [s0, s1], source: "MAP", track: "MAP", startAt: new Date(now.getTime() - 2 * DAY), dueAt: new Date(now.getTime() + 10 * DAY) }, now);
    await assignSkill(repo, teacher, { classId, skillId: g4.get("commas")!, studentIds: [s0, s1, s2, s4], source: "GRAMMAR" }, now);
    await assignSkill(repo, teacher, { classId, skillId: g4.get("context-clues")!, studentIds: [s3], source: "RTI" }, now);
    const sq = (await repo.findMany("Question", { skillId: g4.get("summarize")!, status: "PUBLISHED" }, { select: ["id"], take: 4 })).map((q) => s(q.id));
    await assignQuestions(repo, teacher, { classId, questionIds: sq, studentIds: [s2], source: "NAFS", title: "Summarize set" }, now);
    // an OLDER assignment (before r74: no source, program MAP) and a TEST (never an assigned skill)
    const old = await repo.create("Assignment", { classId, createdById: tid, title: "Figurative", target: "SKILL", skillId: g4.get("figurative-language"), program: "MAP", track: "MAP", createdAt: now });
    await repo.create("AssignmentStudent", { assignmentId: old.id, studentId: s0, status: "NOT_STARTED", progress: 0 });
    const tst = await repo.create("Assignment", { classId, createdById: tid, title: "Unit test", target: "SKILL", skillId: g4.get("capitalization"), curriculumPlanId: "TEST", source: "CURRICULUM", createdAt: now });
    await repo.create("AssignmentStudent", { assignmentId: tst.id, studentId: s0, status: "NOT_STARTED", progress: 0 });
    // stars (one per student × skill)
    await star(s0, "theme", "MASTERED"); await star(s1, "theme", "IN_PROGRESS", { needsSupportAt: now, answered: 52 }); await star(s2, "theme", "MASTERED");
    await star(s3, "context-clues", "MASTERED");
    await star(s1, "inference", "NEEDS_REVIEW"); // practised, never assigned
    await star(s0, "capitalization", "IN_PROGRESS"); // only in a test
  });

  test("pure rules: the source of a row (saved, else inferred), the tests that assign nothing, the groups", () => {
    assert.deepEqual([...ASSIGN_SOURCES], ["MAP", "NAFS", "CURRICULUM", "GRAMMAR", "RTI"]);
    assert.equal(parseAssignSource(" map "), "MAP"); assert.equal(parseAssignSource(""), null); assert.equal(isAssignSource("CUSTOM"), false);
    assert.equal(sourceOfAssignment({ source: "RTI", program: "MAP" }), "RTI", "the saved source wins");
    assert.equal(sourceOfAssignment({ program: "NAFS" }), "NAFS");
    assert.equal(sourceOfAssignment({ track: "GRAMMAR" }), "GRAMMAR");
    assert.equal(sourceOfAssignment({ curriculumPlanId: "plan1" }), "CURRICULUM");
    assert.equal(sourceOfAssignment({ title: "Re-check: Theme" }), "RTI");
    assert.equal(sourceOfAssignment({ note: "Extra practice on this skill, then a short re-check." }), "RTI");
    assert.equal(sourceOfAssignment({}), "CURRICULUM", "an old row with nothing: Curriculum");
    assert.throws(() => requireSource(undefined), (e: Error) => e instanceof ValidationError && e.message === SOURCE_REQUIRED);
    assert.throws(() => requireSource("CUSTOM"), ValidationError);
    for (const t of [{ testId: "t" }, { curriculumPlanId: "TEST" }, { curriculumPlanId: "WEEKLY_CHECK" }, { title: "Review check: Theme" }, { title: "Progress Check: x" }, { title: "Placement test · Grade 4" }, { note: "Fall Diagnostic Test" }]) assert.equal(isSkillWork(t), false, JSON.stringify(t));
    assert.equal(isSkillWork({ title: "Theme" }), true);
    assert.equal(groupOf([]), null);
    assert.equal(groupOf([{ status: "MASTERED" }, { status: "NEXT_LEVEL" }]), "NEXT_LEVEL");
    assert.equal(groupOf([{ status: "MASTERED" }, { status: "NEEDS_REVIEW" }]), "SUPPORT");
    assert.equal(groupOf([{ status: "IN_PROGRESS", needsSupport: true }]), "SUPPORT");
    assert.equal(groupOf([{ status: "MASTERED" }, { status: "NOT_STARTED" }]), "ON_TRACK");
    assert.equal(isGridPlan("YEAR"), false, "older links (Year plan / Custom) fall back to All sources");
  });

  test("Skills grid: ONLY assigned skills, a source badge under each, — for a student it is not assigned to", async () => {
    const g = await skillsGrid(repo, teacher, { classId }, now);
    const cols = Object.fromEntries(g.skills.map((k) => [k.key, k]));
    assert.deepEqual(new Set(Object.keys(cols)), new Set(["fam:theme", "fam:commas", "fam:context-clues", "fam:summarize", "fam:figurative-language"]));
    assert.ok(!cols["fam:inference"], "practised but never assigned: not a column");
    assert.ok(!cols["fam:capitalization"], "only in a test: not a column");
    assert.deepEqual(cols["fam:theme"].sources, ["MAP", "CURRICULUM"], "two sources: two badges");
    assert.deepEqual([cols["fam:commas"].sources, cols["fam:context-clues"].sources, cols["fam:summarize"].sources, cols["fam:figurative-language"].sources], [["GRAMMAR"], ["RTI"], ["NAFS"], ["MAP"]], "the set's skill; the older row inferred");
    assert.deepEqual([cols["fam:theme"].total, cols["fam:theme"].mastered, cols["fam:theme"].pct, cols["fam:theme"].support], [3, 2, 67, 1], "counted over the 3 students it is assigned to");
    assert.deepEqual([cols["fam:commas"].total, cols["fam:commas"].started, cols["fam:commas"].notStarted], [4, 0, 4], "assigned, nobody practised: ☆ column");
    const [s0, s1, , s3, s4] = ids;
    assert.deepEqual(g.assigned![s3], { "fam:context-clues": ["RTI"] }, "s3: only context clues");
    assert.ok(!g.assigned![s4]["fam:theme"], "theme is not assigned to s4 → —");
    assert.deepEqual(g.assigned![s0]["fam:theme"], ["MAP", "CURRICULUM"]);
    assert.equal(g.cells[s1]["fam:theme"].needsSupport, true);
    const by = Object.fromEntries(g.students.map((x) => [x.id, x]));
    assert.deepEqual([by[s0].assigned, by[s0].mastered, by[s3].assigned, by[s3].mastered, by[s4].assigned], [3, 1, 1, 1, 1]);
  });

  test("the Source filter: All sources · MAP · NAFS · Curriculum · Grammar · RTI (RTI added); a source shows its own assignments only", async () => {
    assert.deepEqual(GRID_PLANS.map((p) => [p.key, p.label]), [["ALL", "All sources"], ["MAP", "MAP"], ["NAFS", "NAFS"], ["CURRICULUM", "Curriculum"], ["GRAMMAR", "Grammar"], ["RTI", "RTI"]]);
    const keys = async (plan: (typeof GRID_PLANS)[number]["key"]) => (await skillsGrid(repo, teacher, { classId, plan }, now)).skills.map((k) => [k.key, k.total]);
    assert.deepEqual(await keys("MAP"), [["fam:theme", 2], ["fam:figurative-language", 1]], "MAP: theme for s0 s1 only + the older MAP row");
    assert.deepEqual(await keys("RTI"), [["fam:context-clues", 1]]);
    assert.deepEqual(await keys("NAFS"), [["fam:summarize", 1]]);
    assert.deepEqual(await keys("GRAMMAR"), [["fam:commas", 4]]);
    assert.deepEqual(await keys("CURRICULUM"), [["fam:theme", 3]]);
  });

  test("By source: one card per source — skills, questions answered, accuracy, stars, need support, weakest skill", async () => {
    const cards = sourceCards(await classSkills(repo, teacher, { classId }));
    assert.deepEqual(cards.map((c) => c.source), ["MAP", "NAFS", "CURRICULUM", "GRAMMAR", "RTI"]);
    const map = cards.find((c) => c.source === "MAP")!;
    // MAP pairs: theme s0 ⭐ (34 answers, 30 right) · theme s1 ◐ support (52, 6) · figurative s0 ☆
    assert.deepEqual([map.skills, map.answered, map.accuracy, map.needSupport], [2, 86, 42, 1]);
    assert.deepEqual([map.stars.MASTERED, map.stars.IN_PROGRESS, map.stars.NOT_STARTED], [1, 1, 1]);
    assert.deepEqual(map.weakest, { key: "fam:figurative-language", name: map.weakest!.name, pct: 0 });
    const cur = cards.find((c) => c.source === "CURRICULUM")!;
    assert.deepEqual([cur.skills, cur.answered, cur.accuracy, cur.stars.MASTERED, cur.needSupport, cur.weakest?.pct], [1, 120, 55, 2, 1, 67]);
    const gram = cards.find((c) => c.source === "GRAMMAR")!;
    assert.deepEqual([gram.skills, gram.answered, gram.accuracy, gram.stars.NOT_STARTED, gram.needSupport], [1, 0, null, 4, 0]);
    // a card → the star grid of that source only (one star per student × skill: the same theme star as in MAP)
    const d = await classSkills(repo, teacher, { classId });
    const rti = gridOf(d, { plan: "RTI" });
    assert.deepEqual(rti.skills.map((k) => k.key), ["fam:context-clues"]);
    assert.equal(gridOf(d, { plan: "MAP" }).cells[ids[0]]["fam:theme"].status, gridOf(d, { plan: "CURRICULUM" }).cells[ids[0]]["fam:theme"].status);
  });

  test("Class report: 4 numbers, the line, 3 named groups, ≤ 5 action points with buttons, the table", async () => {
    const d = await classSkills(repo, teacher, { classId });
    const links = { skill: (k: string) => `/skill/${k}`, plan: (x: string[]) => `/plan/${x.join(",")}`, student: (id: string) => `/student/${id}`, source: (x: string) => `/source/${x}`, assigned: "/assigned" };
    const r = classReport(d, links, now);
    const [s0, s1, s2, s3, s4] = ids;
    // pairs: s0 theme⭐ commas☆ fig☆ · s1 theme◐ commas☆ · s2 theme⭐ commas☆ summarize☆ · s3 context⭐ · s4 commas☆ → 3 of 10
    assert.deepEqual([r.masteryPct, r.skillsAssigned, r.onTrack, r.needSupport], [30, 5, 4, 1]);
    assert.equal(r.strongest?.name, d.skills.find((k) => k.key === "fam:context-clues")!.name); assert.equal(r.strongest?.pct, 100);
    assert.equal(r.weakest?.pct, 0);
    assert.deepEqual(r.weakestSource && [r.weakestSource.source, r.weakestSource.pct], ["NAFS", 0], "NAFS and Grammar at 0 %: the first in the source order");
    assert.deepEqual(r.groups.SUPPORT.map((x) => x.id), [s1]);
    assert.deepEqual(new Set(r.groups.ON_TRACK.map((x) => x.id)), new Set([s0, s2, s4]));
    assert.deepEqual(r.groups.NEXT_LEVEL.map((x) => x.id), [s3], "every assigned skill mastered");
    assert.equal(r.groups.ON_TRACK.find((x) => x.id === s4)!.notStarted, true);
    assert.deepEqual([r.notStarted, r.newStars, r.withWork], [1, 3, 5], "extras: not started · new stars (14 days)");
    // the action plan
    assert.deepEqual(r.actions.map((a) => a.kind), ["RETEACH", "SMALL_GROUP", "NEXT_LEVEL", "FOLLOW_UP", "SOURCE"]);
    assert.ok(r.actions.length <= 5);
    const names = Object.fromEntries(d.students.map((x) => [x.id, x.name]));
    assert.equal(r.actions[0].href, "/skill/fam:commas", "most of the class has not mastered commas → reteach the whole class");
    assert.deepEqual([r.actions[0].vars.n, r.actions[0].vars.total], [4, 4]);
    assert.equal(r.actions[1].href, "/skill/fam:theme"); assert.equal(r.actions[1].vars.names, names[s1], "small group with the names");
    assert.equal(r.actions[2].href, `/plan/${s3}`); assert.equal(r.actions[3].href, `/student/${s4}`); assert.equal(r.actions[4].href, "/source/NAFS");
    for (const a of r.actions) for (const k of [a.text, a.button]) { assert.ok((UI_STRINGS as readonly string[]).includes(k), k); assert.ok((ar as Record<string, string>)[k], k); }
    // the table: student, X of Y mastered, accuracy, status colour (group order)
    assert.deepEqual(r.rows.map((x) => x.group), ["SUPPORT", "ON_TRACK", "ON_TRACK", "ON_TRACK", "NEXT_LEVEL"]);
    const row = Object.fromEntries(r.rows.map((x) => [x.id, x]));
    assert.deepEqual([row[s0].mastered, row[s0].of, row[s0].accuracy], [1, 3, 88]);
    assert.deepEqual([row[s1].mastered, row[s1].of, row[s1].accuracy], [0, 2, 12]);
    assert.deepEqual([row[s4].mastered, row[s4].of, row[s4].accuracy], [0, 1, null]);
    assert.ok(!r.rows.some((x) => x.mastered > x.of));
    assert.equal(r.rows.length, 5);
  });

  test("the server refuses work without a valid source — on every assign path (clear EN message, AR translation)", async () => {
    const no = async (label: string, p: Promise<unknown>) => { await assert.rejects(p, (e: Error) => e instanceof ValidationError && e.message === SOURCE_REQUIRED, label); };
    const sk = g4.get("theme")!;
    await no("assignSkill", assignSkill(repo, teacher, { classId, skillId: sk, source: undefined }, now));
    await no("assignSkill (unknown)", assignSkill(repo, teacher, { classId, skillId: sk, source: "CUSTOM" }, now));
    await no("assignSkillToClasses (Search / Skills dialog)", assignSkillToClasses(repo, teacher, { classIds: [classId], skillId: sk, source: "" }, now));
    await no("assignQuestions (question bank)", assignQuestions(repo, teacher, { classId, questionIds: ["x"], source: null }, now));
    await no("createAssignment", createAssignment(repo, teacher, { classId, title: "x", target: "SKILL", skillIds: [sk], dueAt: null, source: undefined }, now));
    await no("assignSkillByLevel (auto / manual)", assignSkillByLevel(repo, teacher, { classId, skillId: sk, mode: "AUTOMATIC", source: undefined }, now));
    await no("saveAssignDraft", saveAssignDraft(repo, teacher, { skillId: sk, skillName: "Theme", classIds: [classId], studentIds: [], track: "CURRICULUM", program: null, questionIds: null, startAt: null, dueAt: null, note: "" }, now));
    await no("starAssign (quick ☆)", starAssign(repo, teacher, { kind: "SKILL", ref: sk, classId }, now));
    await no("assignFromMap (Curriculum Map)", assignFromMap(repo, teacher, { classId, categoryCode: "G4.U1.TS1.ACS", source: undefined }, now));
    await no("createSkillPlan", createSkillPlan(repo, teacher, { classId, title: "x", codes: ["G4.U1.TS1.ACS"], source: undefined }, now));
    await no("sendMapPlan", sendMapPlan(repo, teacher, { grade: 4, classId, source: undefined }, now));
    await no("sendScope (Curriculum Map Send)", sendScope(repo, teacher, { grade: 4, kind: "UNIT", codes: ["G4.U1"], classIds: [classId] }, now));
    await no("assignPlan (Plans wizard)", assignPlan(repo, teacher, { classId, type: "CUSTOM", skillIds: [sk] }, now));
    // owner r82: a program plan (MAP / RTI / NAFS / Curriculum) is that program's work; a custom plan needs the choice
    await no("sendProgramPlan (custom plan)", sendProgramPlan(repo, teacher, { classId, program: null, picks: [{ studentId: ids[0], skillId: sk }] }, now));
    await no("sendPlan (plan editor)", sendPlan(repo, teacher, "nope", now));
    await no("assignRecommendations (MAP / intervention)", assignRecommendations(repo, teacher, classId, [{ studentId: ids[0], skillId: sk }]));
    await no("assignRange (MAP skill plan)", assignRange(repo, teacher, { classId, group: "LIT", range: 0, skillIds: [sk], studentIds: [ids[0]] }, now));
    await no("assignGroupSkills (MAP group)", assignGroupSkills(repo, teacher, { classId, group: "LIT", low: 190, high: 200, skillIds: [sk], studentIds: [ids[0]] }, now));
    await no("sendToGroup (MAP group)", sendToGroup(repo, teacher, classId, { group: "LIT", low: 190, high: 200, studentIds: [ids[0]] }, now));
    await no("sendPlans (MAP study plans)", sendPlans(repo, teacher, ["nope"], now));
    await no("assignYearWeek (MAP Year plan)", assignYearWeek(repo, teacher, classId, 1, now));
    await no("assignTest (Assessments)", assignTest(repo, teacher, { classId, type: "WEEKLY_QUIZ", questions: { SAME: ["x"] } }, now));
    await no("skillPageAction (Student Skills: reteach / small group)", skillPageAction(repo, teacher, classId, "fam:theme", "RETEACH", now));
    assert.ok((UI_STRINGS as readonly string[]).includes(SOURCE_REQUIRED)); assert.ok((ar as Record<string, string>)[SOURCE_REQUIRED]);
    // with a source: saved on the ASSIGNMENT (not the skill)
    const ok = await assignSkill(repo, teacher, { classId, skillId: g4.get("inference")!, studentIds: [ids[4]], source: "rti" }, now);
    assert.equal(s((await repo.findUnique("Assignment", { id: ok.assignmentId }))!.source), "RTI");
    assert.ok(!("source" in (await repo.findUnique("Skill", { id: g4.get("inference")! }))!), "the skill itself has no source");
    await repo.updateMany("Assignment", { id: ok.assignmentId }, { deletedAt: now }); // keep the fixture's numbers
  });

  test("My Work: the same skill from two sources = ONE item with both badges, earliest start, latest due", async () => {
    const st = await repo.findUnique("Student", { id: ids[0] });
    const me = await resolveActor(repo, (await repo.findUnique("User", { id: st!.userId }))!);
    const items = await myWorkItems(repo, me, now);
    const theme = items.filter((i) => i.skillId === g4.get("theme"));
    assert.equal(theme.length, 1, "one item");
    assert.deepEqual(new Set(theme[0].sources), new Set(["CURRICULUM", "MAP"]), "two source badges");
    assert.equal(theme[0].dueAt?.slice(0, 10), new Date(now.getTime() + 10 * DAY).toISOString().slice(0, 10), "the latest due date");
    assert.equal(theme[0].startAt?.slice(0, 10), new Date(now.getTime() - 2 * DAY).toISOString().slice(0, 10), "the earliest start");
    assert.equal(items.filter((i) => i.skillId === g4.get("commas")).length, 1);
    // pure: a due date missing on one of them → no due date; the most urgent status leads; overdue from the merged date
    const base = { kind: "skill" as const, skillId: "k", skill: "K", standard: null, assignedAt: now.toISOString(), note: null, startsLater: false, completedAt: null, progress: 0 };
    const merged = mergeWorkItems([
      { ...base, assignmentId: "a1", track: "CURRICULUM", source: "CURRICULUM", startAt: null, dueAt: new Date(now.getTime() - DAY).toISOString(), status: "OVERDUE" },
      { ...base, assignmentId: "a2", track: "MAP", source: "MAP", startAt: null, dueAt: null, status: "IN_PROGRESS" },
    ], now);
    assert.equal(merged.length, 1);
    assert.deepEqual([merged[0].sources, merged[0].dueAt, merged[0].overdue, merged[0].assignmentId], [["CURRICULUM", "MAP"], null, false, "a1"]);
    const comp = read("src/components/student/my-work-list.tsx");
    assert.match(comp, /SourceChips/); assert.match(comp, /k === "RTI" \? <SourceTag key=\{k\} source="CUSTOM" label=\{t\("Practice"\)\}/, "students never see RTI");
  });

  test("the page: three tabs, the Class filter, badges in the grid (printed) and the student view, the header fix, RTI, the report", () => {
    const src = read("src/app/teacher/reports/skills-grid/page.tsx");
    for (const x of ['data-testid="tab-source"', 'data-testid="tab-report"', "By source", "Class report", 'data-testid="class-filter"', "<SourceBadges sources={k.sources ?? []}", "Not assigned to this student", "<SourceBadges sources={r.sources}", 'data-testid="report-numbers"', 'data-testid="report-groups"', 'data-testid="report-actions"', 'data-testid="report-table"', "@page { size: A4", "Print (one page)", "<InfoTip text={GROUP_RULE} />", "<SourceSelect t={t} />"]) assert.ok(src.includes(x), x);
    // the column header next to the Student column is never cut: it wraps (3 lines) and keeps the full name in its title
    assert.match(src, /line-clamp-3 whitespace-normal break-words/); assert.match(src, /title=\{k\.name\}/);
    const badge = read("src/components/assign/source-select.tsx");
    assert.doesNotMatch(badge.slice(badge.indexOf("export function SourceBadges")), /print:hidden/, "badges are printed");
    assert.match(badge, /<option value="">\{t\("Choose a source…"\)\}<\/option>/, "always empty first");
    assert.match(badge, /required aria-required="true"/);
    for (const k of ["All sources", "By source", "Class report", "Class mastery", "Students on track", "Students needing support", "Ready for next level", "Choose a source…", GROUP_RULE, "{m} of {n} mastered", "Weakest source", "Strongest skill"]) { assert.ok((UI_STRINGS as readonly string[]).includes(k), k); assert.ok((ar as Record<string, string>)[k], k); }
    assert.equal(new Set(UI_STRINGS).size, UI_STRINGS.length, "no duplicate interface strings");
  });

  test("every teacher assign window shows the Source (always empty)", () => {
    const files = [
      "src/components/skill-picker/assign-steps.tsx", "src/components/curriculum-map/assign-button.tsx", "src/components/curriculum-map/send-plan.tsx",
      "src/components/assign/star-assign.tsx", "src/components/map/year-plan-board.tsx", "src/components/plans/plan-builder.tsx", "src/components/plans/editor-ui.tsx",
      "src/app/admin/questions/assign-questions-dialog.tsx", "src/app/teacher/assignments/new/assignment-form.tsx", "src/app/teacher/skill-assign/bank-panel.tsx",
      "src/app/teacher/map-assign/page.tsx", "src/app/teacher/plans/curriculum/page.tsx", "src/app/teacher/ai/page.tsx", "src/app/teacher/alerts/flags-view.tsx",
      "src/components/map/group-plan-view.tsx", "src/app/teacher/assessments/new/test-builder.tsx", "src/app/teacher/writing/page.tsx", "src/app/teacher/reports/skills-grid/page.tsx",
      "src/components/curriculum-map/skill-plan.tsx",
    ];
    for (const f of files) assert.match(read(f), /<SourceSelect\b/, f);
    assert.doesNotMatch(read("src/components/skill-picker/assign-steps.tsx"), /<ProgramChoice/, "the Program choice (with a default) is replaced by the Source");
    // students never see level words on their pages
    assert.doesNotMatch(read("src/components/student/my-work-list.tsx"), /Approaching|Meeting|Exceeding|Below|Above/);
  });
});
