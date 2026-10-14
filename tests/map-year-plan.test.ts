/**
 * 🗓️ MAP → Year plan (owner r67): 40 school weeks × 2–3 skills, ONLY the needs the class truly shares and that suit its
 * level, every one of them covered, foundational (lower RIT) first with the goal areas mixed; ☆ assigns a skill
 * (★) and ★ cancels it (soft); the teacher moves / swaps / replaces / adds / removes and makes the plan again; the
 * admin sees each class's plan read-only. Demo school in memory — never a real database or real students.
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { demoDatabase, ROOT } from "./helpers/db";
import { publishGrade4Bank } from "./helpers/practice";
import { resolveActor } from "../src/server/auth/actor";
import { ForbiddenError, type Actor } from "../src/server/auth/rbac";
import { ValidationError } from "../src/server/curriculum-admin";
import {
  applyYearEdit, assignYearWeek, chooseYearSkills, classNeeds, editYearPlan, firstSunday, isShared, MAX_PER_WEEK, orderYearSkills, ritRange, spreadWeeks,
  weekDates, WEEKS, yearPlanView, type Need, type YearSkill, type YearWeek,
} from "../src/server/map/year-plan";
import { cancelStar, endOfSchoolWeek, starAssign, starredSkills } from "../src/server/assign/star";
import { mapTabOf, MAP_TABS } from "../src/app/teacher/map-center/href";
import { UI_STRINGS } from "../src/i18n/en";
import { ar } from "../src/i18n/ar";

const s = (v: unknown) => String(v ?? "");
const GROUPS = ["LIT", "INFO", "VOCAB", "GRAMMAR", "MECH", "WRITING"] as const;
const need = (i: number, o: Partial<Need> = {}): Need => ({ skillId: `k${i}`, code: `G4.k${i}`, name: `Skill ${i}`, group: GROUPS[i % 6], subject: i % 6 < 3 ? "READING" : "LANGUAGE", need: 15, of: 20, rit: 180 + (i % 30), seq: i, shared: true, suitable: true, ...o });
const read = (f: string) => readFileSync(join(ROOT, f), "utf8");

describe("🗓️ Year plan: the pure rules", () => {
  test("shared = most of the tested students (≥ half, ≥ 3); a skill only one or two need is never shared", () => {
    assert.equal(isShared(18, 22), true);
    assert.equal(isShared(11, 22), true, "exactly half");
    assert.equal(isShared(10, 22), false);
    assert.equal(isShared(2, 4), false, "two students are never enough");
    assert.equal(isShared(3, 4), true);
    assert.equal(isShared(1, 2), false, "1 of 2: not all");
    assert.equal(isShared(2, 2), true);
    assert.equal(isShared(0, 0), false);
  });

  test("the class's RIT range is its 10th–90th percentile (an outlier does not stretch it)", () => {
    const r = ritRange([190, 192, 194, 195, 196, 197, 198, 199, 200, 201, 240])!;
    assert.ok(r.high < 240 && r.low >= 190, JSON.stringify(r));
    assert.equal(r.median, 197);
  });

  test("only shared AND suitable needs are chosen; over 120 the most shared are kept", () => {
    const list = [need(1), need(2, { shared: false }), need(3, { suitable: false }), need(4)];
    assert.deepEqual(chooseYearSkills(list).chosen.map((n) => n.skillId), ["k1", "k4"]);
    const many = Array.from({ length: 130 }, (_, i) => need(i, { need: i < 10 ? 5 : 15 }));
    const c = chooseYearSkills(many);
    assert.equal(c.chosen.length, 120); assert.equal(c.leftOut, 10);
    assert.ok(c.chosen.every((n) => n.need === 15), "the least shared are the ones left out");
  });

  test("40 weeks × 2–3 skills; every chosen skill appears; 3 only when needed", () => {
    for (const n of [30, 79, 80, 81, 100, 120]) {
      const list = Array.from({ length: n }, (_, i) => need(i));
      const weeks = spreadWeeks(list);
      assert.equal(weeks.length, WEEKS, `${n}`);
      for (const w of weeks) assert.ok(w.skills.length >= 2 && w.skills.length <= 3, `${n}: week ${w.week} has ${w.skills.length}`);
      const fresh = weeks.flatMap((w) => w.skills.filter((k) => !k.review).map((k) => k.skillId));
      assert.deepEqual(new Set(fresh), new Set(list.map((x) => x.skillId)), `${n}: every shared skill is taught`);
      assert.equal(fresh.length, n, `${n}: each taught once`);
      assert.equal(weeks.filter((w) => w.skills.length === 3).length, Math.max(0, n - 80), `${n}: 3-skill weeks only for the extra ones`);
      for (const w of weeks) assert.equal(new Set(w.skills.map((k) => k.skillId)).size, w.skills.length, "never twice in a week");
      if (n < 80) {
        assert.ok(weeks.some((w) => w.skills.some((k) => k.review)), "spiral review fills the weeks");
        // a review only of a skill taught before
        const taught = new Set<string>();
        for (const w of weeks) { for (const k of w.skills.filter((x) => !x.review)) taught.add(k.skillId); for (const k of w.skills.filter((x) => x.review)) assert.ok(taught.has(k.skillId)); }
      }
    }
    assert.equal(spreadWeeks([]).every((w) => !w.skills.length), true);
  });

  test("order: lower RIT first inside every goal area, and the goal areas mixed", () => {
    const list = Array.from({ length: 36 }, (_, i) => need(i, { rit: 180 + ((i * 7) % 30) }));
    const out = orderYearSkills(list, ["GRAMMAR"]);
    assert.equal(out.length, list.length);
    for (const g of GROUPS) { const rits = out.filter((k) => k.group === g).map((k) => k.rit); assert.deepEqual(rits, [...rits].sort((a, b) => a - b), g); }
    let same = 0;
    for (let i = 1; i < out.length; i++) if (out[i].group === out[i - 1].group) same++;
    assert.ok(same <= 3, `areas mixed (${same} same-area neighbours)`);
    // overall it climbs: the first quarter is easier than the last quarter
    const avg = (a: Need[]) => a.reduce((t, k) => t + k.rit, 0) / a.length;
    assert.ok(avg(out.slice(0, 9)) < avg(out.slice(-9)));
  });

  test("week dates: Sunday to Thursday, week after week", () => {
    const start = firstSunday(new Date("2026-09-01T00:00:00Z"));
    assert.deepEqual(weekDates(start, 1), { from: "2026-09-06", to: "2026-09-10" });
    assert.deepEqual(weekDates(start, 2), { from: "2026-09-13", to: "2026-09-17" });
    assert.equal(endOfSchoolWeek(new Date("2026-10-13T09:00:00Z")), "2026-10-15", "Tuesday → that Thursday");
    assert.equal(endOfSchoolWeek(new Date("2026-10-16T09:00:00Z")), "2026-10-22", "Friday → the coming Thursday");
  });

  test("move · swap · replace · add · remove (pure)", () => {
    const k = (id: string): YearSkill => ({ skillId: id, code: id, name: id, group: "LIT", need: 3, of: 4, rit: 190 });
    const w: YearWeek[] = [{ week: 1, skills: [k("a"), k("b")] }, { week: 2, skills: [k("c"), k("d")] }];
    const of = (id: string) => (id === "z" || id === "y" ? k(id) : null);
    assert.deepEqual(applyYearEdit(w, { op: "move", from: { week: 1, index: 0 }, to: { week: 1, index: 1 } }, of)[0].skills.map((x) => x.skillId), ["b", "a"], "reorder");
    const moved = applyYearEdit(w, { op: "move", from: { week: 1, index: 1 }, to: { week: 2, index: 0 } }, of);
    assert.deepEqual(moved.map((x) => x.skills.map((y) => y.skillId)), [["a"], ["b", "c", "d"]], "to another week");
    assert.deepEqual(applyYearEdit(w, { op: "swap", a: { week: 1, index: 0 }, b: { week: 2, index: 1 } }, of).map((x) => x.skills.map((y) => y.skillId)), [["d", "b"], ["c", "a"]]);
    assert.equal(applyYearEdit(w, { op: "replace", at: { week: 2, index: 0 }, skillId: "z" }, of)[1].skills[0].skillId, "z");
    assert.deepEqual(applyYearEdit(w, { op: "add", week: 1, skillId: "y" }, of)[0].skills.map((x) => x.skillId), ["a", "b", "y"], "the teacher adds a third");
    assert.deepEqual(applyYearEdit(w, { op: "remove", at: { week: 2, index: 0 } }, of)[1].skills.map((x) => x.skillId), ["d"]);
    assert.deepEqual(w[0].skills.map((x) => x.skillId), ["a", "b"], "the input is not changed");
    assert.throws(() => applyYearEdit(w, { op: "add", week: 41, skillId: "y" }, of), ValidationError);
    assert.throws(() => applyYearEdit(w, { op: "replace", at: { week: 1, index: 5 }, skillId: "z" }, of), ValidationError);
    assert.throws(() => applyYearEdit(w, { op: "add", week: 1, skillId: "nope" }, of), ValidationError);
    const full: YearWeek[] = [{ week: 1, skills: Array.from({ length: MAX_PER_WEEK }, (_, i) => k(`f${i}`)) }];
    assert.throws(() => applyYearEdit(full, { op: "add", week: 1, skillId: "y" }, of), ValidationError);
  });

  test("the MAP page has the Year plan tab; strings in English and Arabic", () => {
    assert.ok(MAP_TABS.includes("year")); assert.equal(mapTabOf("year"), "year");
    const page = read("src/app/teacher/map-center/page.tsx");
    assert.match(page, /tab === "year" \? <YearTab/);
    for (const w of ["Year plan", "Assign this week", "Make the plan again", "Week {n}"]) { assert.ok((UI_STRINGS as readonly string[]).includes(w), w); assert.ok((ar as Record<string, string>)[w], w); }
    // ☆ star is a separate drop-in component (the study-plan view can use it later)
    assert.match(read("src/components/assign/star-assign.tsx"), /export function StarAssign/);
    for (const f of ["src/components/plans/plan-builder.tsx", "src/app/teacher/curriculum/page.tsx", "src/app/teacher/learn/page.tsx", "src/components/map/year-plan-board.tsx"]) assert.match(read(f), /<StarAssign /, f);
  });
});

describe("🗓️ Year plan on the demo school", () => {
  let repo: SqliteRepo; let teacher: Actor; let admin: Actor; let other: Actor; let classId = ""; let ids: string[] = [];
  const now = new Date();

  before(async () => {
    ({ repo } = await demoDatabase({ classesPerGrade: 2, studentsPerClass: 8 }));
    await publishGrade4Bank(repo);
    const actor = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);
    teacher = await actor("demo.teacher.4a"); other = await actor("demo.teacher.4b"); admin = await actor("demo.admin");
    const t = (await repo.findUnique("Teacher", { userId: teacher.userId }))!;
    classId = s((await repo.findMany("ClassTeacher", { teacherId: t.id }))[0].classId);
    ids = (await repo.findMany("ClassMembership", { classId, leftAt: null })).map((m) => s(m.studentId)).sort();
    // seven students around RIT 195, one far above (226): made-up scores
    const rits = [192, 194, 195, 196, 197, 198, 199, 226];
    const fall = new Date("2026-09-20T08:00:00Z");
    for (const [i, id] of ids.entries()) for (const subject of ["Reading", "Language Usage"]) {
      await repo.create("MapResult", { studentId: id, subject, termName: "Fall 2026", testDate: fall, rit: rits[i % rits.length], goalName: null, importedAt: fall } as never);
    }
  });

  test("the class's needs: counts out of the tested students; a need of the one strong student is not shared", async () => {
    const c = await classNeeds(repo, teacher.schoolId!, classId, 4);
    assert.equal(c.tested.READING, ids.length);
    assert.ok(c.needs.length > 0);
    for (const n of c.needs) {
      assert.equal(n.of, ids.length);
      assert.equal(n.shared, n.need >= Math.max(3, Math.ceil(ids.length / 2)));
    }
    const onlyOne = c.needs.filter((n) => n.need === 1);
    assert.ok(onlyOne.every((n) => !n.shared), "a skill only one student needs is never shared");
  });

  test("the plan: 40 weeks × 2–3, ONLY shared and suitable needs, EVERY one of them, easiest first", async () => {
    const v = await yearPlanView(repo, teacher, classId, now);
    assert.equal(v.canEdit, true); assert.equal(v.saved, true, "kept the first time the teacher opens it");
    assert.equal(v.weeks.length, 40);
    for (const w of v.weeks) assert.ok(w.skills.length >= 2 && w.skills.length <= 3, `week ${w.week}: ${w.skills.length}`);
    const c = await classNeeds(repo, teacher.schoolId!, classId, 4);
    const ok = new Map(c.needs.filter((n) => n.shared && n.suitable).map((n) => [n.skillId, n]));
    const taught = v.weeks.flatMap((w) => w.skills.filter((k) => !k.review));
    assert.ok(taught.length > 0);
    for (const k of v.weeks.flatMap((w) => w.skills)) assert.ok(ok.has(k.skillId), `${k.name} is a shared, suitable need`);
    assert.deepEqual(new Set(taught.map((k) => k.skillId)), new Set(ok.keys()), "coverage: every shared, suitable need is in the plan");
    assert.equal(v.summary.covered, v.summary.shared);
    // nothing far above or below the class (its 10th–90th percentile ± one band)
    for (const k of taught) assert.ok(k.rit >= 190 - 10 - 10 && k.rit <= 199 + 10, `${k.name} RIT ${k.rit}`);
    // how many students need each skill: "n of m"
    for (const k of taught) { assert.equal(k.of, ids.length); assert.ok(k.need >= Math.ceil(ids.length / 2)); }
    // order: inside every goal area the RIT never goes down
    for (const g of new Set(taught.map((k) => k.group))) { const r = taught.filter((k) => k.group === g).map((k) => k.rit); assert.deepEqual(r, [...r].sort((a, b) => a - b), g); }
    // weeks are dated Sunday → Thursday from the school year's start (DEMO year starts 1 September 2026)
    assert.equal(v.weeks[0].from, "2026-09-06"); assert.equal(v.weeks[0].to, "2026-09-10");
  });

  test("☆ assigns a skill to the class (★); ★ again cancels it (soft); Assign this week", async () => {
    const v = await yearPlanView(repo, teacher, classId, now);
    const w = v.weeks.find((x) => x.skills.length)!;
    const k = w.skills[0];
    assert.equal(k.assignedId, null);
    const r = await starAssign(repo, teacher, { source: "MAP", kind: "SKILL", ref: k.skillId, classId, dueAt: w.due, track: "MAP" }, now);
    const a = (await repo.findUnique("Assignment", { id: r.id }))!;
    assert.equal(s(a.skillId), k.skillId); assert.equal(s(a.track), "MAP"); assert.equal(a.deletedAt ?? null, null);
    assert.ok(new Date(s(a.dueAt instanceof Date ? a.dueAt.toISOString() : a.dueAt)).getTime() >= now.getTime() - 60_000, "a past week's due date becomes today");
    assert.equal((await repo.findMany("AssignmentStudent", { assignmentId: r.id })).length, ids.length, "the whole class");
    assert.equal((await yearPlanView(repo, teacher, classId, now)).weeks.find((x) => x.week === w.week)!.skills[0].assignedId, r.id, "★");
    const again = await starAssign(repo, teacher, { source: "CURRICULUM", kind: "SKILL", ref: k.skillId, classId }, now);
    assert.equal(again.already, true); assert.equal(again.id, r.id, "pressing ☆ twice never assigns twice");
    await assert.rejects(cancelStar(repo, other, { kind: "SKILL", id: r.id }, now), ForbiddenError, "another teacher cannot cancel it");
    await cancelStar(repo, teacher, { kind: "SKILL", id: r.id }, now);
    assert.ok((await repo.findUnique("Assignment", { id: r.id }))!.deletedAt, "soft: the row stays, marked cancelled");
    assert.equal((await starredSkills(repo, classId, [k.skillId])).size, 0, "☆ again");
    const done = await assignYearWeek(repo, teacher, classId, w.week, now, { source: "MAP" });
    assert.equal(done.assigned, new Set(w.skills.map((x) => x.skillId)).size);
    const after = (await yearPlanView(repo, teacher, classId, now)).weeks.find((x) => x.week === w.week)!;
    assert.ok(after.skills.every((x) => x.assignedId), "the whole week is ★");
  });

  test("the teacher reorders, moves, swaps, replaces, adds, removes and makes the plan again", async () => {
    const before = await yearPlanView(repo, teacher, classId, now);
    const w1 = before.weeks[0].skills.map((k) => k.skillId), w2 = before.weeks[1].skills.map((k) => k.skillId);
    await editYearPlan(repo, teacher, classId, { op: "move", from: { week: 1, index: 0 }, to: { week: 1, index: 1 } }, now);
    let v = await yearPlanView(repo, teacher, classId, now);
    assert.deepEqual(v.weeks[0].skills.map((k) => k.skillId), [w1[1], w1[0], ...w1.slice(2)]);
    await editYearPlan(repo, teacher, classId, { op: "swap", a: { week: 1, index: 0 }, b: { week: 2, index: 0 } }, now);
    v = await yearPlanView(repo, teacher, classId, now);
    assert.equal(v.weeks[0].skills[0].skillId, w2[0]); assert.equal(v.weeks[1].skills[0].skillId, w1[1]);
    await editYearPlan(repo, teacher, classId, { op: "move", from: { week: 1, index: 0 }, to: { week: 3, index: 0 } }, now);
    v = await yearPlanView(repo, teacher, classId, now);
    assert.equal(v.weeks[2].skills[0].skillId, w2[0], "dragged to week 3");
    const extra = before.candidates.find((c) => !v.weeks[3].skills.some((k) => k.skillId === c.skillId))!;
    await editYearPlan(repo, teacher, classId, { op: "add", week: 4, skillId: extra.skillId }, now);
    v = await yearPlanView(repo, teacher, classId, now);
    assert.equal(v.weeks[3].skills.at(-1)!.skillId, extra.skillId, "the teacher adds a skill to a week");
    const repl = before.candidates.find((c) => c.skillId !== v.weeks[4].skills[0].skillId)!;
    await editYearPlan(repo, teacher, classId, { op: "replace", at: { week: 5, index: 0 }, skillId: repl.skillId }, now);
    v = await yearPlanView(repo, teacher, classId, now);
    assert.equal(v.weeks[4].skills[0].skillId, repl.skillId);
    const n6 = v.weeks[5].skills.length;
    await editYearPlan(repo, teacher, classId, { op: "remove", at: { week: 6, index: 0 } }, now);
    assert.equal((await yearPlanView(repo, teacher, classId, now)).weeks[5].skills.length, n6 - 1);
    await assert.rejects(editYearPlan(repo, teacher, classId, { op: "add", week: 2, skillId: "not-a-skill" }, now), ValidationError);
    await editYearPlan(repo, teacher, classId, { op: "regenerate" }, now);
    const again = await yearPlanView(repo, teacher, classId, now);
    assert.deepEqual(again.weeks.map((w) => w.skills.map((k) => k.skillId)), before.weeks.map((w) => w.skills.map((k) => k.skillId)), "made again from the scores");
  });

  test("the admin sees each class's plan, read-only; another teacher cannot change it", async () => {
    const v = await yearPlanView(repo, admin, classId, now);
    assert.equal(v.canEdit, false);
    assert.equal(v.weeks.length, 40);
    assert.ok(v.weeks.some((w) => w.skills.length));
    await assert.rejects(editYearPlan(repo, admin, classId, { op: "regenerate" }, now), ForbiddenError);
    await assert.rejects(yearPlanView(repo, other, classId, now), ForbiddenError, "not their class");
    await assert.rejects(starAssign(repo, admin, { source: "CURRICULUM", kind: "SKILL", ref: v.weeks[0].skills[0].skillId, classId }, now), ForbiddenError);
    // the other class (no scores yet): its plan is empty with a note, and nothing is saved for it by the admin
    const t2 = (await repo.findUnique("Teacher", { userId: other.userId }))!;
    const class2 = s((await repo.findMany("ClassTeacher", { teacherId: t2.id }))[0].classId);
    const v2 = await yearPlanView(repo, admin, class2, now);
    assert.ok(v2.weeks.every((w) => !w.skills.length)); assert.ok(v2.notes.length);
    assert.equal(await repo.count("MapYearPlan", { classId: class2 }), 0);
  });
});
