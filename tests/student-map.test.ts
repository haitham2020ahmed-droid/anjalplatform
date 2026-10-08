import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import type { Actor } from "../src/server/auth/rbac";
import { seedTestEnvironment } from "../src/server/seeding/test-env";
import { teacherRoster } from "../src/server/teacher/assign";
import { fromNweaExport, importMapScores, isMapPracticeSkill, mapTemplateRows, MAP_TEMPLATE_HEADERS, seedAbilityFromRit, studentMap } from "../src/server/map/student-map";
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
    rows[1][3] = "230"; rows[1][5] = "236";
    rows[2][3] = "170"; rows[2][5] = "181"; rows[2][4] = "8";
    rows[3][3] = "200"; rows[3][5] = "";
    rows[4][3] = "999";                                 // invalid RIT
    rows.push(["NOPE-1", "Somebody", "", "210", "", "215"]); // not in the teacher's classes
    const r = await importMapScores(repo, teacher, rows, 2026);
    assert.equal(r.term, "Fall 2026");
    assert.equal(r.imported, 3);
    assert.equal(r.skipped, roster.length - 4, "students left without a score are skipped quietly");
    assert.deepEqual(r.errors.map((e) => e.message.slice(0, 20)), ["Reading Fall RIT “99", "Student “NOPE-1” was"]);
    const byName = new Map(roster.map((x) => [x.name, x.id]));
    const a = (await repo.findMany("MapResult", { studentId: byName.get(rows[1][1])!, termName: "Fall 2026" }))[0];
    assert.deepEqual([a.rit, a.projectedGrowth], [230, 6]);
    const b = (await repo.findMany("MapResult", { studentId: byName.get(rows[2][1])!, termName: "Fall 2026" }))[0];
    assert.deepEqual([b.rit, b.projectedGrowth, b.achievementPercentile], [170, 11, 8]);
    // importing the same Fall again replaces, never duplicates
    await importMapScores(repo, teacher, [MAP_TEMPLATE_HEADERS, [rows[1][0], "", "", "231", "", "237"]], 2026);
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

  test("Reading AND Language Usage, with goal areas, in one file; recommendations use the goal areas", async () => {
    const H = [...MAP_TEMPLATE_HEADERS];
    const at = (h: string) => H.indexOf(h);
    const sid = roster[6].id;
    const row = H.map(() => "");
    row[0] = String((await repo.findUnique("Student", { id: sid }))!.studentNumber);
    row[at("Reading Fall RIT")] = "201"; row[at("Reading Spring Projection")] = "209"; row[at("Fall Lexile")] = "780L";
    row[at("R: Literary Theme")] = "185"; row[at("R: Vocabulary")] = "214"; row[at("R: Info Central Idea")] = "203";
    row[at("Language Fall RIT")] = "196"; row[at("Language Spring Projection")] = "204"; row[at("Language Fall Percentile")] = "41";
    row[at("L: Mechanics")] = "180"; row[at("L: Grammar & Usage")] = "199";
    const r = await importMapScores(repo, teacher, [H, row, H.map((_, i) => (i === 0 ? "X" : i === at("R: Vocabulary") ? "500" : ""))], 2026);
    assert.equal(r.imported, 1);
    const saved = await repo.findMany("MapResult", { studentId: sid, termName: "Fall 2026" });
    const overall = (subj: RegExp) => saved.find((x) => !x.goalName && subj.test(String(x.subject)))!;
    assert.deepEqual([overall(/read/i).rit, overall(/read/i).projectedGrowth, overall(/read/i).lexile], [201, 8, 780]);
    assert.deepEqual([overall(/language/i).rit, overall(/language/i).projectedGrowth, overall(/language/i).achievementPercentile], [196, 8, 41]);
    assert.equal(saved.filter((x) => x.goalName).length, 5, "3 Reading + 2 Language goal areas");
    assert.ok(saved.filter((x) => x.goalName).every((x) => x.goalAreaId));
    // the Language view of the RIT page
    const lang = await ritView(repo, teacher, { classId, term: "Fall 2026", subject: "LANGUAGE" });
    assert.deepEqual(lang.rows.map((x) => x.rit), [196]);
    // importing the same Fall again replaces, never duplicates (both subjects)
    await importMapScores(repo, teacher, [H, row], 2026);
    assert.equal((await repo.findMany("MapResult", { studentId: sid, termName: "Fall 2026" })).length, saved.length);
  });

  test("a different number (e.g. NWEA ID) matches the student by name — no duplicate; a wrong grade is refused", async () => {
    const H = [...MAP_TEMPLATE_HEADERS];
    const at = (h: string) => H.indexOf(h);
    const target = roster[8];
    const parts = target.name.split(" ");
    const nwea = H.map(() => ""); nwea[0] = "1185593876"; nwea[1] = `${parts.slice(1).join(" ").toUpperCase()}, ${parts[0].toUpperCase()}`; nwea[at("Reading Fall RIT")] = "199";
    const wrongGrade = H.map(() => ""); wrongGrade[0] = "1199999999"; wrongGrade[1] = "Grade Five Boy"; wrongGrade[2] = "5"; wrongGrade[at("Reading Fall RIT")] = "190";
    const before = await repo.count("Student", {});
    const r = await importMapScores(repo, teacher, [H, nwea, wrongGrade], 2027, new Date(), { createInClassId: classId });
    assert.equal(r.imported, 1);
    assert.equal(await repo.count("Student", {}), before, "no new student: matched by name");
    assert.equal((await repo.findMany("MapResult", { studentId: target.id, termName: "Fall 2027" }))[0].rit, 199);
    assert.match(r.errors[0].message, /Grade 5 in the file, but this class is Grade 4/);
  });

  test("NWEA's own export: converted, merged (projection kept), rapid guessing flagged, Language national mean", async () => {
    const NW = ["Student ID", "Student Last Name", "Student First Name", "Student Middle Initial", "Term Tested", "Term Rostered", "School", "Grade", "Subject", "Course", "RIT Score", "Rapid-Guessing %", "RIT Score 10 Point Range", "LexileScore", "LexileRange", "QuantileScore", "QuantileRange", "Test Name", "Language Arts: Informational Text", "Language Arts: Literary Text", "Language Arts: Vocabulary", "Language Arts: Language: Understand, Edit for Grammar, Usage", "Language Arts: Language: Understand, Edit for Mechanics", "Language Arts: Writing: Write, Revise Texts for Purpose and Audience"];
    const sid = roster[10].id, num = String((await repo.findUnique("Student", { id: sid }))!.studentNumber);
    const w = fromNweaExport([NW, ["9", "x", "y", "", "Winter 2026-2027", "", "", "4", "Language Arts", "Reading", "180", "0", "", "BR120L", "", "", "", "", "171-180", "161-170", "181-190", "", "", ""]])!;
    assert.deepEqual([w.term, w.table[1][MAP_TEMPLATE_HEADERS.indexOf("Fall Lexile")], w.table[1][MAP_TEMPLATE_HEADERS.indexOf("R: Info Central Idea")], w.table[1][MAP_TEMPLATE_HEADERS.indexOf("R: Literary Theme")]], ["Winter 2027", "0", "176", "166"]);
    // 1) the ASG data (with the projection) through the template, 2) NWEA's export for the same Fall
    const H = [...MAP_TEMPLATE_HEADERS], row = H.map(() => "");
    row[0] = num; row[H.indexOf("Reading Fall RIT")] = "190"; row[H.indexOf("Reading Spring Projection")] = "198"; row[H.indexOf("Reading Fall Percentile")] = "22";
    await importMapScores(repo, teacher, [H, row], 2028);
    const nweaRows = [NW,
      [num, "Last", "First", "", "Fall 2028-2029", "", "", "4", "Language Arts", "Reading", "190", "34", "181-190", "650L", "", "", "", "", "181-190", "171-180", "191-200", "", "", ""],
      [num, "Last", "First", "", "Fall 2028-2029", "", "", "4", "Language Arts", "Language Usage", "196", "5", "191-200", "", "", "", "", "", "", "", "", "191-200", "171-180", "181-190"],
      ["7777777777", "Other", "Class", "", "Fall 2028-2029", "", "", "4", "Language Arts", "Reading", "200", "0", "", "", "", "", "", "", "", "", "", "", "", ""]];
    const before = await repo.count("Student", {});
    const r = await importMapScores(repo, teacher, nweaRows, 2000, new Date(), { createInClassId: classId });
    assert.equal(r.term, "Fall 2028", "the term comes from the file");
    assert.equal(await repo.count("Student", {}), before, "a grade-wide NWEA file never creates students");
    assert.match(r.errors.map((e) => e.message).join(), /1 student\(s\) of the NWEA file are not in your classes/);
    const saved = await repo.findMany("MapResult", { studentId: sid, termName: "Fall 2028" });
    const read = saved.find((x) => !x.goalName && /read/i.test(String(x.subject)))!;
    assert.deepEqual([read.projectedGrowth, read.achievementPercentile, read.lexile, read.rapidGuessPct], [8, 22, 650, 34], "projection and percentile kept; Lexile and rapid guessing added");
    assert.equal(saved.filter((x) => x.goalName).length, 10, "every platform goal area filled from the 6 NWEA areas");
    const v = await ritView(repo, teacher, { classId, term: "Fall 2028" });
    assert.equal(v.rows.find((x) => x.studentId === sid)!.rapidGuess, 34);
    const lang = await ritView(repo, teacher, { classId, term: "Fall 2028", subject: "LANGUAGE" });
    const lr = lang.rows.find((x) => x.studentId === sid)!;
    assert.deepEqual([lr.national?.mean, lr.national?.diff, lr.national?.percentile], [194.7, 1.3, null], "Language: national mean; no invented percentile");
  });
});
