/**
 * ⭐ Reports → Skills grid (owner r67 §6): students × skills with the five icons, filters (class, plan, "skills most
 * of the class hasn't mastered"), a cell's detail (dates, questions, accuracy, reviews, self-check mismatch), the weekly
 * goals per class, and a fixed number of reads whatever the class size. In-memory demo school only.
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import type { Repo } from "../src/server/seeding/repo";
import { demoDatabase, ROOT } from "./helpers/db";
import { publishGrade4Bank, simulatePractice } from "./helpers/practice";
import { resolveActor } from "../src/server/auth/actor";
import type { Actor } from "../src/server/auth/rbac";
import { cellDetail, GRID_PLANS, isWeakForClass, skillsGrid } from "../src/server/skills/skills-grid";
import { setSkillGoal, migrateSchool, countsLine } from "../src/server/skills/status-extras";
import { skillKeyIndex } from "../src/server/skills/status";

const s = (v: unknown) => String(v ?? "");
const read = (f: string) => readFileSync(join(ROOT, f), "utf8");

/** counts every read (the grid must not read per student or per skill) */
function counting(repo: Repo): { repo: Repo; calls: () => number } {
  let n = 0;
  const p = new Proxy(repo, { get(t, k, r) { const v = Reflect.get(t, k, r); return typeof v === "function" && ["findMany", "findUnique", "count", "groupCount"].includes(String(k)) ? (...a: unknown[]) => { n++; return (v as (...x: unknown[]) => unknown).apply(t, a); } : v; } });
  return { repo: p as Repo, calls: () => n };
}

describe("⭐ Skills grid", () => {
  let repo: SqliteRepo; let teacher: Actor; let other: Actor; let classId = ""; let schoolId = ""; let ids: string[] = []; let g4 = new Map<string, string>();
  const now = new Date("2026-10-13T09:00:00Z");
  const row = async (sid: string, code: string, status: string, extra: Record<string, unknown> = {}) => {
    const ix = await skillKeyIndex(repo, schoolId);
    const key = ix.keyOf.get(g4.get(code)!)!;
    await repo.create("SkillStatus", { studentId: sid, skillKey: key, level: 1, status, skillId: g4.get(code), answered: status === "MASTERED" ? 34 : 12, correct: status === "MASTERED" ? 30 : 6, score: status === "MASTERED" ? 100 : 48, startedAt: new Date("2026-09-01"), masteredAt: status === "MASTERED" ? new Date("2026-10-12") : null, reviewDueAt: status === "MASTERED" ? new Date("2026-10-29") : null, createdAt: now, updatedAt: now, history: [{ at: "2026-09-01T00:00:00Z", status: "IN_PROGRESS", why: "started" }], ...extra });
    return key;
  };

  before(async () => {
    ({ repo } = await demoDatabase({ classesPerGrade: 2, studentsPerClass: 4 }));
    await publishGrade4Bank(repo);
    teacher = await resolveActor(repo, (await repo.findUnique("User", { username: "demo.teacher.4a" }))!);
    other = await resolveActor(repo, (await repo.findUnique("User", { username: "demo.teacher.4b" }))!);
    schoolId = teacher.schoolId!;
    const t = await repo.findUnique("Teacher", { userId: teacher.userId });
    classId = s((await repo.findMany("ClassTeacher", { teacherId: t!.id }))[0].classId);
    ids = (await repo.findMany("ClassMembership", { classId })).map((m) => s(m.studentId));
    const g = (await repo.findMany("Grade", { schoolId, level: 4 }))[0];
    const cur = (await repo.findMany("Curriculum", { gradeId: g.id }))[0];
    g4 = new Map((await repo.findMany("Skill", { curriculumId: cur.id })).map((k) => [s(k.code).replace(/^G4\./, ""), s(k.id)]));
    // theme: 3 of 4 mastered · inference: 1 of 4 (most of the class has not) · capitalization: one 🔄
    for (const [i, id] of ids.entries()) {
      await row(id, "theme", i < 3 ? "MASTERED" : "IN_PROGRESS", i === 0 ? { selfCheck: "UNSURE" } : {});
      await row(id, "inference", i === 0 ? "MASTERED" : "IN_PROGRESS", i === 1 ? { selfCheck: "HAPPY", needsSupportAt: now, answered: 50 } : {});
    }
    await row(ids[2], "capitalization", "NEEDS_REVIEW", { history: [{ at: "2026-10-01T00:00:00Z", review: "FAIL", right: 2, of: 5, status: "NEEDS_REVIEW" }] });
  });

  test("students × skills with one status per cell; counts per skill", async () => {
    const g = await skillsGrid(repo, teacher, { classId }, now);
    assert.equal(g.students.length, ids.length);
    const theme = g.skills.find((k) => k.key === "fam:theme")!;
    assert.deepEqual([theme.mastered, theme.total], [3, ids.length]);
    for (const st of g.students) for (const k of g.skills) assert.ok(g.cells[st.id][k.key].status, "every cell has a status");
    assert.equal(g.cells[ids[2]]["fam:capitalization"].status, "NEEDS_REVIEW");
    assert.equal(g.cells[ids[3]]["fam:capitalization"].status, "NOT_STARTED", "☆ for a skill not started");
    assert.equal(g.cells[ids[1]]["fam:inference"].needsSupport, true);
  });

  test("filter: skills most of the class hasn't mastered", async () => {
    assert.equal(isWeakForClass(1, 4), true); assert.equal(isWeakForClass(2, 4), false);
    const g = await skillsGrid(repo, teacher, { classId, weakOnly: true }, now);
    assert.ok(g.skills.some((k) => k.key === "fam:inference"));
    assert.ok(!g.skills.some((k) => k.key === "fam:theme"), "3 of 4 mastered: not weak");
  });

  test("filter by plan: MAP plan · Curriculum · Year plan · custom", async () => {
    // r68 (owner): the source filter also has NAFS and Grammar (Curriculum · MAP · NAFS · Grammar · All)
    assert.deepEqual(GRID_PLANS.map((p) => p.key), ["ALL", "CURRICULUM", "MAP", "NAFS", "GRAMMAR", "YEAR", "CUSTOM"]);
    const tRow = await repo.findUnique("Teacher", { userId: teacher.userId });
    await repo.create("Assignment", { classId, createdById: tRow!.id, title: "Theme", target: "SKILL", skillId: g4.get("theme"), program: "MAP", track: "MAP", createdAt: now });
    await repo.create("Assignment", { classId, createdById: tRow!.id, title: "Inference", target: "SKILL", skillId: g4.get("inference"), createdAt: now });
    await repo.create("MapYearPlan", { schoolId, classId, startDate: now, weeks: [{ week: 1, skills: [{ skillId: g4.get("capitalization"), code: "", name: "Capitalization", group: "MECH", need: 2, of: 4, rit: 200 }] }], createdById: tRow!.id, generatedAt: now, updatedAt: now });
    assert.deepEqual((await skillsGrid(repo, teacher, { classId, plan: "MAP" }, now)).skills.map((k) => k.key), ["fam:theme"]);
    assert.deepEqual((await skillsGrid(repo, teacher, { classId, plan: "CUSTOM" }, now)).skills.map((k) => k.key), ["fam:inference"]);
    assert.deepEqual((await skillsGrid(repo, teacher, { classId, plan: "YEAR" }, now)).skills.map((k) => k.key), ["fam:capitalization"]);
  });

  test("a cell's detail: dates, questions, accuracy, reviews, self-check mismatch; own classes only", async () => {
    const d = (await cellDetail(repo, teacher, ids[2], "fam:capitalization"))!;
    assert.equal(d.view.status, "NEEDS_REVIEW");
    assert.equal(d.reviews[0].outcome, "FAIL"); assert.equal(d.reviews[0].right, 2);
    const m = (await cellDetail(repo, teacher, ids[0], "fam:theme"))!;
    assert.equal(m.accuracy, 88); assert.equal(m.view.answered, 34); assert.ok(m.view.masteredAt);
    assert.equal(m.mismatch, "Unsure but strong");
    assert.equal((await cellDetail(repo, teacher, ids[1], "fam:inference"))!.mismatch, "Confident but weak");
    await assert.rejects(() => cellDetail(repo, other, ids[0], "fam:theme"), /not in your classes/);
  });

  test("🎯 weekly goals per class: the teacher sets one, the grid shows progress", async () => {
    await setSkillGoal(repo, teacher, { studentId: ids[0], target: 2 }, now);
    await assert.rejects(() => setSkillGoal(repo, other, { studentId: ids[0], target: 2 }, now), /not in your classes/);
    const g = await skillsGrid(repo, teacher, { classId }, now);
    const st = g.students.find((x) => x.id === ids[0])!;
    assert.deepEqual([st.goal?.target, st.goal?.mastered, st.goal?.setBy], [2, 2, "TEACHER"], "theme + inference mastered this week");
    assert.equal(st.goal?.done, true);
  });

  test("⚡ fast: a fixed number of reads, whatever the class size", async () => {
    const a = counting(repo);
    await skillsGrid(a.repo, teacher, { classId }, now);
    const small = a.calls();
    const big = await demoDatabase({ classesPerGrade: 1, studentsPerClass: 12 });
    const bt = await resolveActor(big.repo, (await big.repo.findUnique("User", { username: "demo.teacher.4a" }))!);
    const b = counting(big.repo);
    await skillsGrid(b.repo, bt, {}, now);
    await skillsGrid(b.repo, bt, {}, now);
    const c2 = counting(big.repo);
    await skillsGrid(c2.repo, bt, {}, now);
    assert.ok(small <= 25, `reads: ${small}`);
    assert.ok(c2.calls() <= 20, `warm reads: ${c2.calls()}`);
  });

  test("the page: under Reports (its own route), with the legend, filters, cells as links to the detail", () => {
    const f = "src/app/teacher/reports/skills-grid/page.tsx";
    assert.ok(existsSync(join(ROOT, f)));
    const src = read(f);
    for (const x of ["StarLegend", "SkillStar", "grid-filters", "Skills most of the class hasn't mastered", "cell-detail", "weekly goal"]) assert.ok(src.toLowerCase().includes(x.toLowerCase()), x);
    assert.doesNotMatch(src, /^export (?!default|const metadata|const dynamic)/m, "page files export only Next page fields");
  });

  test("📦 migration counts on test data (demo school with practice)", async () => {
    const { repo: r2 } = await demoDatabase({ classesPerGrade: 1, studentsPerClass: 3 });
    await publishGrade4Bank(r2);
    const g = (await r2.findMany("Grade", { level: 4 }))[0];
    const st4 = await r2.findMany("Student", { gradeId: g.id }, { select: ["userId"] });
    const users = (await r2.findMany("User", { id: { in: st4.map((x) => s(x.userId)) } })).map((u) => s(u.username)).slice(0, 3);
    await simulatePractice(r2, users, [{ date: "2026-09-02", skill: "G4.theme" }, { date: "2026-09-09", skill: "G4.inference" }], 12);
    const sc = (await r2.findMany("School", {}))[0];
    const live = await r2.count("SkillStatus", {});
    assert.ok(live > 0, "the practice already wrote statuses (the hook after each answer)");
    await r2.deleteMany("SkillStatus", {}); // as on an older database: nothing yet
    const r = await migrateSchool(r2, s(sc.id), now);
    assert.equal(r.written, live, "the migration rebuilds exactly what live practice wrote");
    const again = await migrateSchool(r2, s(sc.id), now);
    assert.deepEqual(again.counts, r.counts); assert.equal(again.written, 0);
    assert.ok(r.counts.IN_PROGRESS > 0);
    console.log(`  migration on the demo practice data: ${countsLine(r.counts)} (students ${r.students}, skills ${r.universe}, rows written ${r.written})`);
  });
});
