/**
 * 🎯 ReadRise: no level without the placement test (owner's request) — FAKE data only (in-memory test school).
 *  - the first visit still creates a working start row (MAP Lexile or the grade's default, e.g. 950 in Grade 6), but it
 *    is never a level: the student home gauge says "Take the placement test", ReadRise shows the big placement card
 *    and the articles stay locked (no number shown), teacher / admin reports say "No placement yet"
 *  - students who already had such a row (never placed) are treated as not placed; their row is kept
 *  - finishing the placement (or a teacher setting the level) gives the real level everywhere
 *  - a teacher can restart a half-done placement (and allow a retake once per term, as before)
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import type { Actor } from "../src/server/auth/rbac";
import { seedTestEnvironment } from "../src/server/seeding/test-env";
import { RR_LEVELS, defaultLevel } from "../src/server/readrise/level";
import { parsePlacement, type PlacementPassage } from "../src/server/readrise/content-loader";
import { ensureRRStudent, readRisePlaced, setLevelByTeacher, studentReadRiseSummary } from "../src/server/readrise/engine";
import { answerPlacement, placementView, startPlacement, teacherResetPlacement } from "../src/server/readrise/placement";
import { readRiseAccess, readRiseHome } from "../src/server/readrise/student";
import { classReport, schoolDashboard } from "../src/server/readrise/dashboards";
import { classGrowth, loadStudentGrowth } from "../src/server/readrise/growth-report";
import { studentHome } from "../src/server/student/student-home";
import { demoDatabase, ROOT } from "./helpers/db";

const NOW = new Date("2026-10-13T08:00:00Z");
const read = (f: string) => readFileSync(`${ROOT}/${f}`, "utf8");

/** Injected placement passages: 3 per level, answers A, A, A. */
const PASSAGES: PlacementPassage[] = parsePlacement({
  passages: RR_LEVELS.flatMap((level) => [1, 2, 3].map((k) => ({ id: `P${level}-${k}`, level, title: `P ${level}/${k}`, text: "Text.", questions: [1, 2, 3].map((n) => ({ stem: `Q${n}`, options: ["a", "b", "c", "d"], answer: "A", skill: "detail" })) }))),
});

describe("🎯 ReadRise: a level only after the placement test", () => {
  let repo: SqliteRepo; let admin: Actor; let teacher: Actor; let st: Actor[]; let classId = "";
  const actorOf = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);
  const gradeOf = async (a: Actor) => Number((await repo.findUnique("Grade", { id: String((await repo.findUnique("Student", { id: a.studentId! }))!.gradeId) }))!.level);

  before(async () => {
    ({ repo } = await demoDatabase());
    await seedTestEnvironment(repo, { root: process.cwd(), passwordHash: "x".repeat(60), practice: "none" });
    [admin, teacher] = await Promise.all(["test.admin", "test.teacher.1"].map(actorOf));
    st = await Promise.all(["001", "002", "003"].map((t) => actorOf(`test.student.${t}`)));
    classId = String((await repo.findMany("ClassMembership", { studentId: st[0].studentId!, leftAt: null }))[0].classId);
  });

  test("the first visit makes a working start (grade default), never a level: locked, no number, the placement card", async () => {
    const s = st[0], sid = s.studentId!;
    const home = await readRiseHome(repo, s, {}, NOW, PASSAGES);
    // where the old "level without a test" came from: ensureRRStudent → initialLevel → defaultLevel(grade) (no MAP Lexile)
    const row = (await repo.findUnique("RRStudent", { studentId: sid }))!;
    assert.equal(row.source, "DEFAULT");
    assert.equal(Number(row.level), defaultLevel(await gradeOf(s)));
    assert.equal(readRisePlaced(row), false);
    assert.equal(home.placed, false);
    assert.equal(home.locked, true, "articles locked until the placement");
    assert.equal(home.placement.state, "NEED");
    assert.equal(home.summary.placed, false);
    assert.deepEqual(await readRiseAccess(repo, sid, PASSAGES), { placed: false, locked: true });
    assert.deepEqual(await readRiseAccess(repo, sid, []), { placed: false, locked: false }, "no placement test available: articles open, still no level");
    const h = await studentHome(repo, s, NOW);
    assert.equal(h.readRiseLevel, null, "the home gauge shows no number");
    assert.equal(h.readRiseStart, null);
  });

  test("an existing student with a level but no placement is 'not placed' (the row is kept)", async () => {
    const sid = st[1].studentId!;
    await repo.create("RRStudent", { studentId: sid, schoolId: String(st[1].schoolId), level: 950, startLevel: 950, source: "MAP", placedAt: new Date(NOW.getTime() - 30 * 86_400_000), weeklyGoal: 2 });
    assert.equal((await studentHome(repo, st[1], NOW)).readRiseLevel, null);
    assert.equal((await studentReadRiseSummary(repo, sid, NOW))!.placed, false);
    assert.equal((await loadStudentGrowth(repo, sid, NOW)).level, null);
    assert.ok(await repo.findUnique("RRStudent", { studentId: sid }), "nothing deleted");
  });

  test("teacher / admin reports: No placement yet (no level, not in the medians)", async () => {
    const r = await classReport(repo, admin, classId, NOW);
    const row = r.students.find((x) => x.studentId === st[0].studentId)!;
    assert.equal(row.placed, false);
    assert.equal(row.level, null);
    assert.equal(row.growth, null);
    assert.equal(row.flags.notPlaced, true);
    assert.equal(r.summary.placed, 0);
    const g = await classGrowth(repo, admin, classId, NOW);
    assert.ok(g.students.every((x) => x.level === null));
    const d = await schoolDashboard(repo, admin, NOW);
    assert.equal(d.grades.reduce((a, x) => a + x.placed, 0), 0);
    const page = read("src/app/teacher/readrise/page.tsx");
    assert.match(page, /t\("No placement yet"\)/);
    assert.match(page, /t\("Restart the placement"\)/);
  });

  test("a teacher restarts a half-done placement; finishing it gives the real level everywhere", async () => {
    const s = st[0], sid = s.studentId!;
    const pid = await startPlacement(repo, s, NOW);
    let v = await placementView(repo, s, PASSAGES);
    await answerPlacement(repo, s, pid, v.passage!.id, ["A", "A", "A"], PASSAGES, NOW);
    let r = await classReport(repo, admin, classId, NOW);
    assert.equal(r.students.find((x) => x.studentId === sid)!.placementOpen, true, "the report knows a test is open");
    const reset = await teacherResetPlacement(repo, admin, sid, "", NOW);
    assert.equal(reset.restarted, true);
    assert.deepEqual((await repo.findUnique("RRPlacement", { id: pid }))!.steps, [], "back to the first passage");
    // finish the test
    for (let i = 0; i < 10; i++) {
      v = await placementView(repo, s, PASSAGES);
      if (v.state !== "IN_PROGRESS") break;
      const a = await answerPlacement(repo, s, pid, v.passage!.id, i % 2 ? ["A", "B", "B"] : ["A", "A", "A"], PASSAGES, NOW);
      if (a.done) break;
    }
    const row = (await repo.findUnique("RRStudent", { studentId: sid }))!;
    assert.equal(row.source, "PLACEMENT");
    const home = await readRiseHome(repo, s, {}, NOW, PASSAGES);
    assert.deepEqual([home.placed, home.locked], [true, false]);
    assert.equal((await studentHome(repo, s, NOW)).readRiseLevel, Number(row.level));
    r = await classReport(repo, admin, classId, NOW);
    const x = r.students.find((y) => y.studentId === sid)!;
    assert.deepEqual([x.placed, x.level, x.flags.notPlaced], [true, Number(row.level), false]);
  });

  test("a level a teacher sets by hand is a real level", async () => {
    const s = st[2], sid = s.studentId!;
    await ensureRRStudent(repo, sid, NOW);
    assert.equal((await readRiseAccess(repo, sid, PASSAGES)).locked, true);
    await setLevelByTeacher(repo, teacher.role === "TEACHER" && teacher.teacherStudentIds?.has(sid) ? teacher : admin, sid, 820, "MAP", NOW);
    assert.deepEqual(await readRiseAccess(repo, sid, PASSAGES), { placed: true, locked: false });
    assert.equal((await studentHome(repo, s, NOW)).readRiseLevel, 820);
  });

  test("the pages: gauge and ReadRise card say 'Take the placement test'; articles locked; the start action checks", () => {
    const gauge = read("src/components/student/readrise-gauge.tsx");
    assert.match(gauge, /t\("Take the placement test"\)/);
    assert.doesNotMatch(gauge, /Read your first ReadRise article to see your level/);
    assert.match(read("src/components/student/readrise-level-card.tsx"), /level === null \? "\/student\/readrise\/placement"/);
    const page = read("src/app/student/readrise/page.tsx");
    assert.match(page, /data-testid="rr-placement-card"/);
    assert.match(page, /h\.locked \?/);
    assert.match(page, /report && h\.placed/);
    assert.match(read("src/app/student/readrise/[articleId]/page.tsx"), /access\.locked/);
    assert.match(read("src/app/student/readrise/actions.ts"), /readRiseAccess\(repo, actor\.studentId!\)\)\.locked\) throw new ValidationError\("Take the placement test first\."\)/);
    for (const f of ["src/components/student/readrise-gauge.tsx", "src/app/student/readrise/page.tsx"]) assert.doesNotMatch(read(f).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, ""), /t\("[^"]*Lexile/, `${f}: never called Lexile`);
  });
});
