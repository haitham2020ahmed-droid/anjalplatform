import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import type { Actor } from "../src/server/auth/rbac";
import { seedTestEnvironment } from "../src/server/seeding/test-env";
import { teacherRoster } from "../src/server/teacher/assign";
import { importMapScores, isMapPracticeSkill, mapTemplateRows, MAP_TEMPLATE_HEADERS, seedAbilityFromRit, studentMap } from "../src/server/map/student-map";
import { enterRitScores, ritView } from "../src/server/map/rit";
import { startPractice } from "../src/server/practice/session";
import { loadSkillItems } from "../src/server/practice/items";
import { demoDatabase } from "./helpers/db";

describe("MAP: simple score import (Fall RIT + Spring projection), the student's MAP page, adaptive MAP practice", () => {
  let repo: SqliteRepo; let teacher: Actor; let classId: string; let roster: { id: string; name: string }[];
  const student = async (id: string) => resolveActor(repo, (await repo.findUnique("User", { id: (await repo.findUnique("Student", { id }))!.userId }))!);
  before(async () => {
    ({ repo } = await demoDatabase());
    await seedTestEnvironment(repo, { root: process.cwd(), passwordHash: "x".repeat(60), practice: "none" });
    teacher = await resolveActor(repo, (await repo.findUnique("User", { username: "test.teacher.1" }))!);
    const r = await teacherRoster(repo, teacher);
    classId = r[0].id; roster = r[0].students;
  });

  test("the template lists the teacher's students; the import fills Fall RIT and the Spring projection", async () => {
    const t = await mapTemplateRows(repo, teacher, classId);
    assert.deepEqual(t[0], MAP_TEMPLATE_HEADERS);
    assert.equal(t.length, 1 + roster.length);
    const rows = t.map((r) => [...r]);
    rows[1][2] = "230"; rows[1][3] = "236";
    rows[2][2] = "170"; rows[2][3] = "181"; rows[2][4] = "8";
    rows[3][2] = "200"; rows[3][3] = "";
    rows[4][2] = "999";                                 // invalid RIT
    rows.push(["NOPE-1", "Somebody", "210", "215", ""]); // not in the teacher's classes
    const r = await importMapScores(repo, teacher, rows, 2026);
    assert.equal(r.term, "Fall 2026");
    assert.equal(r.imported, 3);
    assert.equal(r.skipped, roster.length - 4, "students left without a score are skipped quietly");
    assert.deepEqual(r.errors.map((e) => e.message.slice(0, 20)), ["Fall RIT “999” must ", "Student “NOPE-1” was"]);
    const byName = new Map(roster.map((x) => [x.name, x.id]));
    const a = (await repo.findMany("MapResult", { studentId: byName.get(rows[1][1])!, termName: "Fall 2026" }))[0];
    assert.deepEqual([a.rit, a.projectedGrowth], [230, 6]);
    const b = (await repo.findMany("MapResult", { studentId: byName.get(rows[2][1])!, termName: "Fall 2026" }))[0];
    assert.deepEqual([b.rit, b.projectedGrowth, b.achievementPercentile], [170, 11, 8]);
    // importing the same Fall again replaces, never duplicates
    await importMapScores(repo, teacher, [MAP_TEMPLATE_HEADERS, [rows[1][0], "", "231", "237", ""]], 2026);
    assert.equal((await repo.findMany("MapResult", { studentId: byName.get(rows[1][1])!, termName: "Fall 2026" })).length, 1);
  });

  test("the teacher sees the projection, and in Spring whether it was met", async () => {
    const fall = await ritView(repo, teacher, { classId, term: "Fall 2026" });
    const top = fall.rows[0];
    assert.deepEqual([top.rit, top.projection, top.vsProjection], [231, 237, null]);
    await enterRitScores(repo, teacher, { classId, term: "Spring 2027", testDate: new Date("2027-04-20"), scores: [{ studentId: top.studentId, rit: 240 }, { studentId: fall.rows[2].studentId, rit: 175 }] });
    const spring = await ritView(repo, teacher, { classId, term: "Spring 2027" });
    const met = spring.rows.find((x) => x.studentId === top.studentId)!, notYet = spring.rows.find((x) => x.studentId === fall.rows[2].studentId)!;
    assert.deepEqual([met.projection, met.vsProjection], [237, 3]);
    assert.deepEqual([notYet.projection, notYet.vsProjection], [181, -6]);
  });

  test("the student's MAP page: RIT, national comparison, goal, practice areas weakest first", async () => {
    const top = (await ritView(repo, teacher, { classId, term: "Fall 2026" })).rows[0];
    const st = await student(top.studentId);
    const m = await studentMap(repo, st);
    assert.deepEqual([m.rit?.value, m.rit?.term, m.rit?.nationalMean], [240, "Spring 2027", 202]);
    assert.deepEqual([m.projection?.spring, m.projection?.met, m.projection?.springTerm], [237, true, "Spring 2027"]);
    assert.ok(m.areas.length >= 3 && m.areas.every((a) => a.next && a.skills.length));
    assert.ok(await isMapPracticeSkill(repo, st, m.areas[0].next!));
    const g5skill = (await repo.findMany("Skill", {})).find((k) => String(k.code).startsWith("G5."))!;
    assert.equal(await isMapPracticeSkill(repo, st, String(g5skill.id)), false, "only the student's own grade");
  });

  test("MAP practice is adaptive and starts at the student's RIT level", async () => {
    const view = await ritView(repo, teacher, { classId, term: "Fall 2026" });
    const high = await student(view.rows[0].studentId), low = await student(view.rows[view.rows.length - 1].studentId);
    const skill = (await studentMap(repo, high)).areas.flatMap((a) => a.skills).sort((x, y) => y.questions - x.questions)[0].id;
    const tHigh = await seedAbilityFromRit(repo, high, skill), tLow = await seedAbilityFromRit(repo, low, skill);
    assert.ok(tHigh! > 1.5 && tLow! < -1, `${tHigh} / ${tLow}`);
    assert.equal(await seedAbilityFromRit(repo, high, skill), null, "never overwrites an ability the engine has");
    const items = new Map((await loadSkillItems(repo, skill)).map((i) => [i.questionId, i]));
    const bHigh = items.get((await startPractice(repo, high, skill)).question!.questionId)!.irt.b;
    const bLow = items.get((await startPractice(repo, low, skill)).question!.questionId)!.irt.b;
    assert.ok(bHigh > bLow, `the stronger reader starts with a harder question (${bHigh} > ${bLow})`);
  });
});
