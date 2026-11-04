/**
 * r84 (owner): PLANS no longer add Skills Grid columns; a new "Plans" tab has one card per live plan; the Class report is
 * the comprehensive report (single skills + Curriculum sections + NAFS + every plan, each student × skill ONCE).
 *
 * Fixture = the r82 reproduction (tests/helpers/r82-fixture.ts: single-skill assigns theme / commas / summarize, a
 * Curriculum Map section assign + the same section sent as a Curriculum plan, a MAP study plan set for s0, a MAP group set
 * with no chosen skill, a co-teacher's work) and, added here, all by the viewing teacher unless said:
 *
 *   NAFS practice, ONE standard (S12), whole class             → a Skills Grid column
 *   NAFS practice, THREE standards (S01 S02 S03), s0 s1          → a plan (NAFS)       s0: S01 ⭐, S02 ◐ · s1: nothing
 *   RTI plan (SkillPlan, program RTI), group s2 s3              → a plan (RTI)        central idea + character
 *                                                                  s2 ⭐ ⭐ · s3 central idea ◐ needs support, character ☆
 *   MAP plan (SkillPlan, program MAP), whole class              → a plan (MAP)        context clues + theme (theme is ALSO
 *                                                                  single-assigned: one pair)   s0 ⭐ ⭐ · s1 theme ⭐, context ◐
 *   a Custom plan, then CANCELLED on Assigned                   → nowhere             sequence
 *   a Custom plan, then CLOSED on the Plans tab                 → Finished plans      plot events (s4 ⭐)
 *   the co-teacher's RTI plan                                   → only the admin      author's purpose
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { r82Fixture, type R82 } from "./helpers/r82-fixture";
import { ROOT } from "./helpers/db";
import { classSkills, gridOf, skillsGrid, type ClassSkills } from "../src/server/skills/skills-grid";
import { classReport, sourceCards } from "../src/server/skills/skills-report";
import { agoOf, planActions, planCards, planGrid, setPlanClosed } from "../src/server/skills/skills-plans";
import { isMapPlanSet, isNafsPlan, planTypeOf } from "../src/server/skills/assigned-skills";
import { cancelAssignment, restoreMany } from "../src/server/teacher/assigned";
import { skillsPlanSummary, skillsPlansOneLine, R } from "../src/lib/report-summaries";
import { UI_STRINGS } from "../src/i18n/en";
import { ar } from "../src/i18n/ar";

const s = (v: unknown) => String(v ?? "");
const DAY = 86_400_000, HOUR = 3_600_000;
const read = (f: string) => readFileSync(join(ROOT, f), "utf8");
const LINKS = { skill: (k: string) => `/skill/${k}`, plan: (x: string[]) => `/plan/${x.join(",")}`, student: (id: string) => `/student/${id}`, source: (x: string) => `/source/${x}`, assigned: "/assigned" };

let f: R82;
const ids = { nafs1: "", nafs3: "", rti: "", map: "", cancelled: "", closed: "", co: "" };
let s0 = "", s1 = "", s2 = "", s3 = "", s4 = "";

before(async () => {
  f = await r82Fixture();
  const { repo, teacher, coTeacher, schoolId, classId, g4, now } = f;
  [s0, s1, s2, s3, s4] = f.ids;
  const tid = f.tid;
  const coTid = s((await repo.findUnique("Teacher", { userId: coTeacher.userId }))!.id);
  // a sent plan with one place per skill (as the Plans pages make it)
  const plan = async (o: { title: string; program: string | null; kind: string; who: string[] | null; skills: string[]; source: string; at: Date; by?: { user: string; tid: string } }) => {
    const p = await repo.create("SkillPlan", { schoolId, classId, title: o.title, kind: o.kind, program: o.program, gradeLevel: 4, status: "SENT", studentIds: o.who, createdById: o.by?.user ?? teacher.userId, createdAt: o.at, sentAt: o.at });
    let order = 0;
    for (const code of o.skills) {
      const a = await repo.create("Assignment", { classId, createdById: o.by?.tid ?? tid, title: `${o.title} · ${code}`, target: "SKILL", skillId: g4.get(code), skillIds: [g4.get(code)], curriculumPlanId: p.id, source: o.source, createdAt: o.at });
      for (const st of o.who ?? f.ids) await repo.create("AssignmentStudent", { assignmentId: a.id, studentId: st, status: "NOT_STARTED", progress: 0 });
      await repo.create("SkillPlanItem", { planId: p.id, code: `G4.${code.toUpperCase()}`, label: code, assignmentIds: [a.id], order: order++ });
    }
    return s(p.id);
  };
  ids.nafs1 = s((await repo.create("NafsPractice", { schoolId, createdById: teacher.userId, title: "S12 practice", targets: ["MOE.S12"], classId, studentIds: null, createdAt: now })).id);
  ids.nafs3 = s((await repo.create("NafsPractice", { schoolId, createdById: teacher.userId, title: "Vocabulary standards practice", targets: ["MOE.S01", "MOE.S02", "MOE.S03"], classId, studentIds: [s0, s1], createdAt: new Date(now.getTime() - DAY) })).id);
  ids.rti = await plan({ title: "RTI · Reading group", program: "RTI", kind: "RTI", who: [s2, s3], skills: ["central-idea", "character"], source: "RTI", at: new Date(now.getTime() - 2 * DAY) });
  ids.map = await plan({ title: "MAP plan · Vocabulary", program: "MAP", kind: "MAP", who: null, skills: ["context-clues", "theme"], source: "MAP", at: now });
  ids.cancelled = await plan({ title: "Old custom plan", program: null, kind: "CUSTOM", who: null, skills: ["sequence"], source: "CURRICULUM", at: now });
  ids.closed = await plan({ title: "Finished custom plan", program: null, kind: "CUSTOM", who: null, skills: ["plot-events"], source: "CURRICULUM", at: now });
  ids.co = await plan({ title: "Co-teacher RTI plan", program: "RTI", kind: "RTI", who: null, skills: ["author-purpose"], source: "RTI", at: now, by: { user: coTeacher.userId, tid: coTid } });
  await cancelAssignment(repo, teacher, "PLAN", ids.cancelled, null, now);
  await setPlanClosed(repo, teacher, classId, `plan:${ids.closed}`, true, now);
  // stars (one row a student × skill)
  const star = (st: string, code: string, status: string, at: Date, support = false) => repo.create("SkillStatus", { studentId: st, skillKey: `fam:${code}`, level: 1, status, skillId: g4.get(code), answered: 30, correct: 25, score: 80, startedAt: at, masteredAt: status === "MASTERED" ? at : null, needsSupportAt: support ? at : null, updatedAt: at });
  await star(s2, "central-idea", "MASTERED", new Date(now.getTime() - 3 * DAY));
  await star(s2, "character", "MASTERED", new Date(now.getTime() - 3 * DAY));
  await star(s3, "central-idea", "IN_PROGRESS", new Date(now.getTime() - DAY), true);
  await star(s0, "context-clues", "MASTERED", new Date(now.getTime() - 5 * DAY));
  await star(s0, "theme", "MASTERED", new Date(now.getTime() - 5 * DAY));
  await star(s1, "theme", "MASTERED", new Date(now.getTime() - 6 * DAY));
  await star(s1, "context-clues", "IN_PROGRESS", new Date(now.getTime() - 2 * DAY));
  await star(s4, "plot-events", "MASTERED", new Date(now.getTime() - 4 * DAY));
  // NAFS answers: s0 — S01 mastered (4 of the last 5 right, ≥ 2 at Medium / Hard), S02 two answers
  const ans = (target: string, list: [number, boolean][]) => Promise.all(list.map(([d, ok], i) => repo.create("NafsPracticeAnswer", { runId: "r", practiceId: ids.nafs3, studentId: s0, questionId: `q${target}${i}`, target, difficulty: d, choice: ok ? 1 : 0, correct: ok, ms: 9000, at: new Date(now.getTime() - 3 * HOUR + i * 60_000) })));
  await ans("MOE.S01", [[2, true], [3, true], [2, false], [3, true], [2, true]]);
  await ans("MOE.S02", [[2, true], [2, false]]);
});

const data = (who = f.teacher, range?: { from: string | null; to: string | null }) => classSkills(f.repo, who, { classId: f.classId, range }, f.now);
const card = (d: ClassSkills, id: string) => planCards(d).find((c) => c.id === id)!;

describe("r84 🗂️ plans leave the Skills Grid", () => {
  test("the pure rules: which work is a plan", () => {
    assert.equal(isNafsPlan(["MOE.S12"]), false); assert.equal(isNafsPlan(["MOE.S01", "MOE.S02"]), true); assert.equal(isNafsPlan(["MOE.S01", "MOE.S01"]), false);
    assert.equal(isMapPlanSet("MAP plan · Literary Text"), "PLAN"); assert.equal(isMapPlanSet("MAP group · Literary Text"), "GROUP"); assert.equal(isMapPlanSet("Theme"), null);
    assert.equal(planTypeOf("RTI", "PLACES"), "RTI"); assert.equal(planTypeOf(null, "UNIT"), "CURRICULUM"); assert.equal(planTypeOf(null, "PLACES"), "CURRICULUM");
    assert.equal(planTypeOf(null, "CUSTOM"), "CUSTOM"); assert.equal(planTypeOf(null, "NAFS"), "NAFS"); assert.equal(planTypeOf("MAP", "MAP"), "MAP"); assert.equal(planTypeOf(null, null), "CUSTOM");
  });

  test("Skills Grid columns: single assigns, the Curriculum section and the ONE-standard NAFS practice — never a plan's skill", async () => {
    const cols = (await skillsGrid(f.repo, f.teacher, { classId: f.classId }, f.now)).skills.map((k) => k.key).sort();
    assert.deepEqual(cols, ["fam:commas", "fam:compare-contrast", "fam:reread", "fam:summarize", "fam:text-features", "fam:theme", "nafs:MOE.S12"]);
    for (const k of ["fam:central-idea", "fam:character", "fam:context-clues", "nafs:MOE.S01", "nafs:MOE.S02", "nafs:MOE.S03", "fam:inference", "fam:plot-events", "fam:sequence", "fam:author-purpose"]) assert.ok(!cols.includes(k), k);
    // theme is single-assigned AND in the MAP plan: a column, with its single-assign source only
    const g = await skillsGrid(f.repo, f.teacher, { classId: f.classId }, f.now);
    assert.deepEqual(g.skills.find((k) => k.key === "fam:theme")!.sources, ["CURRICULUM"]);
    assert.equal(g.skills.find((k) => k.key === "fam:theme")!.mastered, 2, "the same stars (s0, s1 ⭐)");
  });
});

describe("r84 🗂️ the Plans tab", () => {
  test("one card per live plan: exact %, counts, last activity, status; cancelled hidden; the co-teacher's hidden", async () => {
    const d = await data();
    const cards = planCards(d);
    const byTitle = Object.fromEntries(cards.map((c) => [c.title, c]));
    assert.deepEqual(cards.map((c) => c.title).sort(), ["Finished custom plan", "Grade 4 Curriculum plan", "MAP plan · Reading · Fall 2026", "MAP plan · Vocabulary", "RTI · Reading group", "Vocabulary standards practice"].sort());
    assert.ok(!cards.some((c) => c.title === "Old custom plan"), "cancelled on Assigned: hidden");
    assert.ok(!cards.some((c) => c.title === "Co-teacher RTI plan"), "another teacher's plan: not on this teacher's tab");
    assert.ok(!cards.some((c) => c.title.startsWith("MAP group")), "a MAP group set with no chosen skill: no card");
    const pick = (c: (typeof cards)[number]) => ({ type: c.type, scope: c.scope, students: c.students, skills: c.skills, pct: c.pct, finished: c.finished, support: c.support, notStarted: c.notStarted, status: c.status });
    assert.deepEqual(pick(byTitle["RTI · Reading group"]), { type: "RTI", scope: "group", students: 2, skills: 2, pct: 50, finished: 1, support: 1, notStarted: 0, status: "ACTIVE" });
    assert.deepEqual(pick(byTitle["MAP plan · Vocabulary"]), { type: "MAP", scope: "class", students: 5, skills: 2, pct: 30, finished: 1, support: 0, notStarted: 3, status: "ACTIVE" });
    assert.deepEqual(pick(byTitle["Vocabulary standards practice"]), { type: "NAFS", scope: "group", students: 2, skills: 3, pct: 17, finished: 0, support: 0, notStarted: 1, status: "ACTIVE" });
    assert.deepEqual(pick(byTitle["MAP plan · Reading · Fall 2026"]), { type: "MAP", scope: "student", students: 1, skills: 1, pct: 0, finished: 0, support: 0, notStarted: 1, status: "ACTIVE" });
    assert.deepEqual(pick(byTitle["Grade 4 Curriculum plan"]), { type: "CURRICULUM", scope: "class", students: 5, skills: 3, pct: 0, finished: 0, support: 0, notStarted: 5, status: "ACTIVE" });
    assert.deepEqual(pick(byTitle["Finished custom plan"]), { type: "CUSTOM", scope: "class", students: 5, skills: 1, pct: 20, finished: 1, support: 0, notStarted: 4, status: "FINISHED" });
    assert.equal(byTitle["Finished custom plan"].closed, true);
    // last activity ("Yesterday", "2 days ago", "Today", none)
    assert.deepEqual(agoOf(byTitle["RTI · Reading group"].lastActivity, f.now), { key: "Yesterday" });
    assert.deepEqual(agoOf(byTitle["MAP plan · Vocabulary"].lastActivity, f.now), { key: "{n} days ago", vars: { n: 2 } });
    assert.deepEqual(agoOf(byTitle["Vocabulary standards practice"].lastActivity, f.now), { key: "Today" });
    assert.deepEqual(agoOf(byTitle["Grade 4 Curriculum plan"].lastActivity, f.now), { key: "Not started yet" });
    assert.equal(byTitle["RTI · Reading group"].sentAt.slice(0, 10), "2026-10-13");
    // "In one line": 5 active plans, their average, who has not started
    const one = skillsPlansOneLine(cards)!;
    assert.equal(one.key, R.onePlans);
    assert.deepEqual(one.vars, { n: 5, pct: Math.round((50 + 30 + 17 + 0 + 0) / 5), idle: 0 + 3 + 1 + 1 + 5 });
  });

  test("Close plan → Finished plans; Reopen → back; only a teacher of the class", async () => {
    await setPlanClosed(f.repo, f.teacher, f.classId, `plan:${ids.rti}`, true, f.now);
    assert.equal(card(await data(), `plan:${ids.rti}`).status, "FINISHED");
    await setPlanClosed(f.repo, f.teacher, f.classId, `plan:${ids.rti}`, false, f.now);
    assert.equal(card(await data(), `plan:${ids.rti}`).status, "ACTIVE");
    await assert.rejects(setPlanClosed(f.repo, f.teacher, f.classId, "not a plan", true, f.now));
    const other = s((await f.repo.findMany("Class", { schoolId: f.schoolId })).find((c) => s(c.id) !== f.classId)!.id);
    await assert.rejects(setPlanClosed(f.repo, f.teacher, other, `plan:${ids.rti}`, true, f.now), "not their class");
  });

  test("an opened plan: only its students × its skills, x of y · %, column footers, summary and action plan", async () => {
    const v = planGrid(await data(), `plan:${ids.rti}`)!;
    assert.deepEqual(v.rows.map((r) => [r.id, r.mastered, r.of, r.pct, r.state]), [[s2, 2, 2, 100, "FINISHED"], [s3, 0, 2, 0, "SUPPORT"]].sort((a, b) => v.rows.findIndex((r) => r.id === a[0]) - v.rows.findIndex((r) => r.id === b[0])));
    assert.deepEqual(v.skills.map((k) => [k.key, k.mastered, k.total, k.pct]).sort(), [["fam:central-idea", 1, 2, 50], ["fam:character", 1, 2, 50]]);
    assert.ok(!v.cells[s0], "a student not in the plan is not a row");
    const sum = skillsPlanSummary(v);
    assert.deepEqual(sum.lines[0], { key: R.plOverview, tone: "info", vars: { done: 1, n: 2, pct: 50 } });
    assert.equal(sum.lines[1].key, R.plWeak);
    assert.ok(sum.lines.some((l) => l.key === R.plSupport && l.vars?.n === 1));
    assert.equal(sum.lines[sum.lines.length - 1].key, R.plNextReteach);
    const acts = planActions(v, LINKS);
    assert.deepEqual(acts.map((a) => a.kind), ["RETEACH", "SMALL_GROUP", "NEXT_LEVEL"]);
    assert.equal(acts[1].href, `/plan/${s3}`); assert.equal(acts[2].href, `/plan/${s2}`);
    // who has not started → follow up (the class MAP plan)
    const m = planGrid(await data(), `plan:${ids.map}`)!;
    assert.equal(planActions(m, LINKS)[0].kind, "FOLLOW_UP");
    assert.equal(planActions(m, LINKS)[0].vars.n, 3);
    assert.equal(skillsPlanSummary(m).lines.at(-1)!.key, R.plNextFollow);
    // a NAFS plan: the NAFS star rule (s0: S01 ⭐ from the practice answers)
    const n = planGrid(await data(), `nafs:${ids.nafs3}`)!;
    assert.equal(n.cells[s0]["nafs:MOE.S01"].status, "MASTERED"); assert.equal(n.cells[s0]["nafs:MOE.S02"].status, "IN_PROGRESS");
    assert.equal(planGrid(await data(), "plan:nope"), null);
  });

  test("the date filter applies: a plan sent before the From date is not on the tab", async () => {
    const d = await data(f.teacher, { from: "2026-10-15", to: null });
    assert.ok(!planCards(d).some((c) => c.id === `plan:${ids.rti}`), "sent 2 days before");
    assert.ok(planCards(d).some((c) => c.id === `plan:${ids.map}`), "sent today");
  });

  test("the admin sees every teacher's plans (and still never a cancelled one)", async () => {
    const titles = planCards(await data(f.admin)).map((c) => c.title);
    assert.ok(titles.includes("Co-teacher RTI plan") && titles.includes("RTI · Reading group"));
    assert.ok(!titles.includes("Old custom plan"));
  });
});

describe("r84 📋 Class report = everything assigned, each student × skill once; By source totals", () => {
  test("numbers, a line per source, a line per plan, no double counting", async () => {
    const d = await data();
    const r = classReport(d, LINKS, f.now);
    // 6 single / section skills + S12 + inference (MAP study plan) + central idea, character (RTI) + context clues (MAP plan;
    // theme is already counted) + S01–S03 + plot events (the closed plan) = 15; sequence (cancelled) never
    assert.equal(r.skillsAssigned, 15);
    const row = (id: string) => r.rows.find((x) => x.id === id)!;
    assert.equal(row(s0).of, 13, "s0: theme once although single-assigned and in the MAP plan");
    assert.equal(row(s1).of, 11);
    assert.equal(row(s2).of, 11); assert.equal(row(s2).mastered, 2);
    // pairs: every student's keys once
    for (const st of f.ids) assert.equal(row(st).of, new Set(Object.keys(d.stars[st])).size);
    const pairs = f.ids.reduce((n, st) => n + row(st).of, 0), mastered = f.ids.reduce((n, st) => n + row(st).mastered, 0);
    assert.equal(r.masteryPct, Math.round((100 * mastered) / pairs));
    assert.deepEqual(r.bySource.map((x) => [x.source, x.n, x.pct]).filter(([k]) => k === "MAP" || k === "RTI" || k === "NAFS"), [["MAP", 11, 27], ["NAFS", 11, 9], ["RTI", 4, 50]]);
    assert.deepEqual(r.plans.map((p) => [p.title, p.pct, p.finished]).sort(), [["Finished custom plan", 20, true], ["Grade 4 Curriculum plan", 0, false], ["MAP plan · Reading · Fall 2026", 0, false], ["MAP plan · Vocabulary", 30, false], ["RTI · Reading group", 50, false], ["Vocabulary standards practice", 17, false]]);
    assert.ok(r.groups.SUPPORT.some((x) => x.id === s3), "s3 needs support (in the RTI plan)");
    assert.ok(r.actions.length <= 5);
  });

  test("By source: plan skills in their source totals, counted once", async () => {
    const d = await data();
    const map = sourceCards(d).find((c) => c.source === "MAP")!;
    assert.equal(map.skills, 3, "inference, context clues, theme");
    assert.equal(Object.values(map.stars).reduce((a, b) => a + b, 0), 11);
    assert.equal(map.stars.MASTERED, 3);
    const nafs = sourceCards(d).find((c) => c.source === "NAFS")!;
    assert.equal(nafs.skills, 4); assert.equal(nafs.stars.MASTERED, 1);
    assert.deepEqual(gridOf(d, { plan: "RTI", all: true }).skills.map((k) => k.key).sort(), ["fam:central-idea", "fam:character"], "the source's star grid has the plan's skills");
  });

  test("cancel a plan → gone from every tab; Undo → back", async () => {
    await cancelAssignment(f.repo, f.teacher, "PLAN", ids.rti, null, f.now);
    let d = await data();
    assert.ok(!planCards(d).some((c) => c.id === `plan:${ids.rti}`));
    assert.equal(classReport(d, LINKS, f.now).skillsAssigned, 13, "central idea and character are gone");
    assert.ok(!sourceCards(d).some((c) => c.source === "RTI"));
    await restoreMany(f.repo, f.teacher, [{ kind: "PLAN", id: ids.rti }], f.now);
    d = await data();
    assert.ok(planCards(d).some((c) => c.id === `plan:${ids.rti}`));
  });
});

describe("r84 the page and the strings", () => {
  test("tabs in order, the Plans view, the report lines, EN + AR, plain words", () => {
    const src = read("src/app/teacher/reports/skills-grid/page.tsx");
    const order = ['t("Skills Grid")', 't("Plans")', 't("By source")', 't("Class report")'].map((x) => src.indexOf(x));
    assert.ok(order.every((x, i) => x > 0 && (i === 0 || x > order[i - 1])), "Skills Grid · Plans · By source · Class report");
    for (const x of ['data-testid="plans-tab"', 'data-testid="plan-card"', 'data-testid="finished-plans"', 'data-testid="plan-grid"', 'data-testid="report-sources"', 'data-testid="report-plans"', "closePlanAction", "skillsPlansOneLine(cards)", "skillsPlanSummary(v)", "<InfoTip text={PLAN_RULE} />", "all: tab === \"source\""]) assert.ok(src.includes(x), x);
    const ui = new Set<string>(UI_STRINGS);
    assert.equal(ui.size, UI_STRINGS.length, "no duplicate interface strings");
    const words = ["Plans", "Finished plans", "Close plan", "Reopen plan", "Class achievement", "Last activity", "Group of {n}", "Whole class", "One student", "Yesterday", "{n} days ago", "Today", "Active", "Finished",
      R.onePlans, R.onePlansDone, R.plOverview, R.plWeak, R.plSupport, R.plIdle, R.plNextFollow, R.plNextReteach, R.plNextLevel,
      "Follow up ({n}): {names} have not started this plan.", "Reteach {skill}: {n} of {total} students of this plan have not mastered it.", "Small group for {names}: they need support in this plan.", "Move to the next level ({n}): {names} finished every skill of this plan.",
      "Plan closed: it is now under Finished plans ✓", "Plan opened again ✓", "Custom", "Curriculum"];
    for (const w of words) { assert.ok(ui.has(w), `EN: ${w}`); assert.ok((ar as Record<string, string>)[w], `AR: ${w}`); }
    for (const w of words) assert.doesNotMatch(w, /adaptive|SkillPlan|NafsPractice|SchoolSetting/i, w);
    assert.equal((ar as Record<string, string>)["Plans"], "الخطط");
  });
});
