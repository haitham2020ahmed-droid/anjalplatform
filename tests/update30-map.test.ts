import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import type { Actor } from "../src/server/auth/rbac";
import { seedTestEnvironment } from "../src/server/seeding/test-env";
import { teacherRoster } from "../src/server/teacher/assign";
import { AREA_COLUMNS, fromNweaCdf, importMapScores, MAP_TEMPLATE_HEADERS, mapTemplateRows } from "../src/server/map/student-map";
import { mapEntryGrid, saveMapEntry } from "../src/server/map/map-entry";
import { continuumTableFromWords, type PdfWord } from "../src/server/map/continuum-pdf";
import { demoDatabase } from "./helpers/db";

describe("Update 30 · MAP: 3 + 3 instructional areas (template and by hand), NWEA data file, Continuum PDF", () => {
  let repo: SqliteRepo; let teacher: Actor; let classId: string; let roster: { id: string; name: string }[];
  before(async () => {
    ({ repo } = await demoDatabase());
    await seedTestEnvironment(repo, { root: process.cwd(), passwordHash: "x".repeat(60), practice: "none" });
    teacher = await resolveActor(repo, (await repo.findUnique("User", { username: "test.teacher.1" }))!);
    const r = await teacherRoster(repo, teacher); classId = r[0].id; roster = r[0].students;
  });

  test("the template has the 3 Reading and 3 Language areas of NWEA's report, with the class's names filled in", async () => {
    assert.deepEqual(AREA_COLUMNS.map((a) => a.header), ["R: Informational Text", "R: Literary Text", "R: Vocabulary", "L: Grammar & Usage", "L: Mechanics", "L: Writing"]);
    for (const a of AREA_COLUMNS) assert.ok(MAP_TEMPLATE_HEADERS.includes(a.header));
    const rows = await mapTemplateRows(repo, teacher, classId);
    assert.equal(rows.length, roster.length + 1);
    assert.ok(rows.slice(1).every((r) => r[1] && r[0]), "name and number filled in");
  });

  test("by hand: Reading and Language, 3 areas each; an area fills every platform goal of that area", async () => {
    const g = await mapEntryGrid(repo, teacher, { classId, subject: "LANGUAGE", season: "FALL", year: 2026 });
    assert.deepEqual(g.goals.map((x) => x.header), ["Grammar & Usage", "Mechanics", "Writing"]);
    const st = g.rows[0];
    const r = await saveMapEntry(repo, teacher, { classId, subject: "LANGUAGE", season: "FALL", year: 2026, rows: [{ studentId: st.studentId, rit: "201", percentile: "50", projection: "208", lexile: "", goals: { grammar: "199", mech: "Low", writing: "205" } }] });
    assert.equal(r.imported, 1, JSON.stringify(r.errors));
    const goals = (await repo.findMany("MapResult", { studentId: st.studentId, termName: "Fall 2026" })).filter((x) => x.goalName);
    assert.equal(goals.length, 5, "Grammar + Mechanics + the 3 Writing goals");
    const again = await mapEntryGrid(repo, teacher, { classId, subject: "LANGUAGE", season: "FALL", year: 2026 });
    const row = again.rows.find((x) => x.studentId === st.studentId)!;
    assert.deepEqual([row.goals.grammar, row.goals.writing], ["199", "205"]);
    assert.ok(Number(row.goals.mech) < 199, "“Low” saved as a RIT");
  });

  test("a file with NWEA's own area names (Language: Understand, Edit for Mechanics …) imports", async () => {
    const num = String((await repo.findUnique("Student", { id: roster[1].id }))!.studentNumber);
    const H = ["Student Number", "Reading Fall RIT", "Informational Text", "Literary Text", "Vocabulary", "Language Fall RIT", "Language: Understand, Edit for Grammar, Usage", "Language: Understand, Edit for Mechanics", "Writing: Write, Revise Texts for Purpose and Audience"];
    const r = await importMapScores(repo, teacher, [H, [num, "195", "190", "200", "185", "198", "196", "201", "199"]], 2027);
    assert.equal(r.imported, 1, JSON.stringify(r.errors));
    const goals = (await repo.findMany("MapResult", { studentId: roster[1].id, termName: "Fall 2027" })).filter((x) => x.goalName);
    assert.equal(goals.length, 10, "5 Reading + 5 Language platform goals");
  });

  test("NWEA comprehensive data file (fake rows): subject rows, growth, CGI, goals with descriptors", () => {
    const H = ["TermName", "StudentID", "StudentLastName", "StudentFirstName", "Grade", "Subject", "Course", "TestRITScore", "TestStandardError", "TestPercentile", "TestDurationMinutes", "RapidGuessingPercentage", "FallToSpringProjectedGrowth", "FallToFallConditionalGrowthIndex", "Goal1Name", "Goal1RitScore", "Goal1StdErr", "Goal1Adjective", "Goal2Name", "Goal2RitScore", "Goal2StdErr", "Goal2Adjective", "LexileScore"];
    const row = ["Fall 2026-2027", "T-001", "Tester", "Sam", "5", "Reading", "Growth: Reading 2-5", "201", "3.1", "48", "41", "5", "7", "0.2", "Literary Text", "199", "6.5", "Avg", "Vocabulary", "205", "6.6", "HiAvg", "760L"];
    const out = fromNweaCdf([H, row]);
    assert.ok(out, "recognised as the data file");
    const t = out!.table, at = (h: string) => t[0].indexOf(h);
    assert.deepEqual([t[1][at("Reading Fall RIT")], t[1][at("Reading Spring Projection")], t[1][at("R: Literary Text")], t[1][at("R: Vocabulary")], t[1][at("Fall Lexile")]], ["201", "208", "199", "205", "760"]);
    const ex = out!.extras.get("t-001|READING")!;
    assert.equal(ex.testMinutes, 41);
    assert.equal(ex.goals.lit.descriptor, "Avg");
  });

  test("the Continuum PDF (fake words): bands, goal areas, sub-topics, wrapped statements and codes", () => {
    const w = (s: string, x: number, y: number, size: number): PdfWord => ({ s, x, y, size });
    const page: PdfWord[] = [
      w("Reading · RIT 161–170", 40, 760, 18), w("READING", 400, 760, 18),
      w("Literary Text: Key Ideas", 40, 720, 11.5),
      w("Theme", 40, 700, 9.4),
      w("Identifies the theme of a simple fable", 40, 680, 9.6), w("RL.3.2", 500, 680, 6.6),
      w("Describes how a character changes from the", 40, 660, 9.6),
      w("beginning to the end of a story", 40, 648, 9.6), w("RL.3.3", 500, 648, 6.6),
      w("APPENDIX", 40, 600, 12),
    ];
    const { table, counts } = continuumTableFromWords([page]);
    assert.equal(counts.Reading, 2);
    assert.deepEqual(table[1], ["Reading", "161", "170", "Literary Text: Key Ideas", "Theme", "Identifies the theme of a simple fable", "RL.3.2"]);
    assert.match(table[2][5], /from the beginning to the end of a story$/);
  });
});
