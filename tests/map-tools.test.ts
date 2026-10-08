import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import type { Actor } from "../src/server/auth/rbac";
import { seedTestEnvironment } from "../src/server/seeding/test-env";
import { teacherRoster } from "../src/server/teacher/assign";
import { importMapScores, MAP_TEMPLATE_HEADERS } from "../src/server/map/student-map";
import { bandOf, personalPlan } from "../src/server/map/personal-plan";
import { personalPlanDoc } from "../src/server/map/personal-plan-doc";
import { interventionBoard } from "../src/server/teacher/intervention";
import { bankGaps } from "../src/server/map/bank-gaps";
import { demoDatabase } from "./helpers/db";

describe("📋 personalized plan · 🚨 intervention board · 🕳 bank gaps", () => {
  let repo: SqliteRepo; let teacher: Actor; let admin: Actor; let classId: string; let roster: { id: string; name: string }[];
  before(async () => {
    ({ repo } = await demoDatabase());
    await seedTestEnvironment(repo, { root: process.cwd(), passwordHash: "x".repeat(60), practice: "none" });
    teacher = await resolveActor(repo, (await repo.findUnique("User", { username: "test.teacher.1" }))!);
    admin = await resolveActor(repo, (await repo.findUnique("User", { username: "test.admin" }))!);
    const r = await teacherRoster(repo, teacher); classId = r[0].id; roster = r[0].students;
    const H = [...MAP_TEMPLATE_HEADERS], at = (h: string) => H.indexOf(h);
    const rows = [[8, 170, "BR", 165, 180, 40], [35, 185, "", 178, 192, 0], [50, 195, "", 190, 200, 5], [75, 205, "", 210, 199, 0]].map(([pct, rit, lex, theme, vocab, rapid], i) => {
      const row = H.map(() => ""); row[0] = String(roster[i].id && (i + 1)); return { row, pct, rit, lex, theme, vocab, rapid, i };
    });
    const table = [H];
    for (const x of rows) {
      const num = String((await repo.findUnique("Student", { id: roster[x.i].id }))!.studentNumber);
      const r2 = H.map(() => ""); r2[0] = num; r2[at("Reading Fall RIT")] = String(x.rit); r2[at("Reading Fall Percentile")] = String(x.pct); r2[at("Reading Spring Projection")] = String(Number(x.rit) + 8);
      r2[at("Fall Lexile")] = String(x.lex); r2[at("R: Literary Theme")] = String(x.theme); r2[at("R: Vocabulary")] = String(x.vocab); r2[at("R: Info Central Idea")] = String(Number(x.rit) - 3); r2[at("Reading Rapid-Guessing %")] = String(x.rapid);
      table.push(r2);
    }
    assert.equal((await importMapScores(repo, teacher, table, 2026)).imported, 4);
  });

  test("groups: one percentile rule for every class (no overlap, no gap)", () => {
    assert.deepEqual([bandOf(40, null), bandOf(41, null), bandOf(60, null), bandOf(61, null), bandOf(null, -6), bandOf(null, 6)], ["BELOW", "ON", "ON", "ABOVE", "BELOW", "ABOVE"]);
  });

  test("the plan: students in their groups, weakest areas as goals with skills and standards", async () => {
    const p = await personalPlan(repo, teacher, classId, "READING");
    const by = Object.fromEntries(p.bands.map((b) => [b.band, b]));
    assert.deepEqual([by.BELOW.students.length, by.ON.students.length, by.ABOVE.students.length], [2, 1, 1]);
    assert.equal(by.BELOW.ritRange, "170–185");
    assert.equal(by.BELOW.goals[0].area.startsWith("Literary Text: Analyze Theme"), true, "Literary Theme is the Below group's weakest area");
    assert.ok(by.BELOW.goals.length >= 1 && by.BELOW.resources[0].includes("Below"));
    assert.equal(by.ABOVE.students[0].projection, 213);
    assert.equal(p.notTested.length, roster.length - 4, "the rest of the class is listed as not tested");
  });

  test("the intervention board: urgent, retest, beginner reader, not tested, inactive", async () => {
    const b = await interventionBoard(repo, teacher);
    const flagsOf = (i: number) => b.rows.find((r) => r.studentId === roster[i].id)!.flags.map((f) => f.flag);
    assert.ok(flagsOf(0).includes("URGENT") && flagsOf(0).includes("RETEST") && flagsOf(0).includes("BEGINNER"));
    assert.ok(!flagsOf(1).includes("URGENT"));
    assert.ok(flagsOf(1).includes("NOT_TESTED"), "Language was not tested");
    assert.ok(b.counts.INACTIVE >= roster.length, "no practice yet: everyone inactive");
    assert.equal(b.rows[0].studentId, roster[0].id, "most urgent first");
  });

  test("bank gaps: questions per area against the students who need it", async () => {
    const rows = await bankGaps(repo, admin);
    assert.ok(rows.length > 0 && rows.every((r) => ["GAP", "LOW", "OK"].includes(r.status)));
    const theme = rows.find((r) => r.area.startsWith("Literary Text: Analyze Theme") && r.studentsWeakest > 0);
    assert.ok(theme, "students whose weakest area is Literary Theme are counted");
  });

  test("the Word document: the plan's content, every value escaped", async () => {
    const p = await personalPlan(repo, teacher, classId, "READING");
    p.bands[0].students[0].name = '<script>alert(1)</script> & "x"';
    const doc = personalPlanDoc(p);
    assert.ok(doc.includes("Personalized Plan") && doc.includes("Academic Goals") && doc.includes("Projected Spring RIT Score"));
    assert.ok(!doc.includes("<script>") && doc.includes("&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;x&quot;"));
  });

  test("one NWEA score spread over two platform areas becomes ONE goal (no repeated goal)", async () => {
    const H = [...MAP_TEMPLATE_HEADERS], at = (h: string) => H.indexOf(h);
    const sid = roster[5].id, num = String((await repo.findUnique("Student", { id: sid }))!.studentNumber);
    const row = H.map(() => ""); row[0] = num; row[at("Reading Fall RIT")] = "160"; row[at("Reading Fall Percentile")] = "2";
    row[at("R: Literary Structure")] = row[at("R: Literary Theme")] = "150"; row[at("R: Info Structure")] = row[at("R: Info Central Idea")] = "170"; row[at("R: Vocabulary")] = "160";
    await importMapScores(repo, teacher, [H, row], 2031);
    const p = await personalPlan(repo, teacher, classId, "READING", "Fall 2031");
    const goals = p.bands.find((b) => b.band === "BELOW")!.goals;
    assert.deepEqual(goals.map((g) => g.area.split(":")[0]), ["Literary Text", "Vocabulary", "Informational Text"], "three different areas, weakest first");
    assert.match(goals[0].area, /Analyze Structure.*·.*Analyze Theme/);
  });
});
