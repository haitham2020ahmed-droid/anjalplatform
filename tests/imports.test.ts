import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseCsv, safeCell, toCsv } from "../src/imports/csv";
import { readXlsx } from "../src/imports/xlsx";
import { matchGoalArea, parseDate } from "../src/imports/specs";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import type { Actor } from "../src/server/auth/rbac";
import { cancelImport, confirmImport, errorReportCsv, stageImport } from "../src/server/imports/pipeline";
import { mapComparison } from "../src/server/analytics/map-compare";
import { getStudentCurriculum, getUnitSkillCards } from "../src/server/queries/student-curriculum";
import { DEMO_SCHOOL_CODE } from "../src/server/seeding/demo";
import { loadBank } from "../src/server/seeding/load-files";
import { seedQuestions } from "../src/server/seeding/questions";
import { demoDatabase, ROOT } from "./helpers/db";

const NWEA_HEADER = "TermName,StudentID,StudentLastName,StudentFirstName,Subject,Course,TestStartDate,TestRITScore,TestStandardError,TestPercentile,FallToSpringProjectedGrowth,Goal1Name,Goal1RitScore,Goal1StdErr,Goal2Name,Goal2RitScore,Goal2StdErr";
const csv = (...lines: string[]) => Buffer.from([NWEA_HEADER, ...lines].join("\r\n"), "utf8");

describe("file readers", () => {
  test("CSV: quotes, commas and line breaks inside quotes, escaped quotes, BOM, CRLF, blank lines", () => {
    const rows = parseCsv('\uFEFFa,b,c\r\n"x, y","say ""hi""","line1\nline2"\r\n\r\n1,2,3\n');
    assert.deepEqual(rows, [["a", "b", "c"], ["x, y", 'say "hi"', "line1\nline2"], ["1", "2", "3"]]);
    assert.throws(() => parseCsv('a,"unclosed\n'), /unclosed/);
  });

  test("CSV export neutralises spreadsheet formulas but keeps negative numbers", () => {
    assert.equal(safeCell("=HYPERLINK(\"http://evil\")"), `"'=HYPERLINK(""http://evil"")"`);
    assert.equal(safeCell("@SUM(A1)"), "'@SUM(A1)");
    assert.equal(safeCell("-3"), "-3");
    assert.equal(safeCell("+cmd"), "'+cmd");
    assert.ok(toCsv([["a"]]).startsWith("\uFEFF"));
  });

  test("XLSX made by openpyxl (an independent library): strings, numbers and real Excel dates", () => {
    const dir = mkdtempSync(join(tmpdir(), "xlsx-"));
    const file = join(dir, "map.xlsx");
    execFileSync("python3", ["-c", `
import openpyxl, datetime
wb = openpyxl.Workbook(); ws = wb.active; ws.title = "Results"
ws.append(${JSON.stringify(NWEA_HEADER.split(","))})
ws.append(["Fall 2026-2027","DEMO-1001","Harbi","Lina","Reading","Reading 2-5",datetime.datetime(2026,9,20),205,3.1,61,8,"Vocabulary: Acquisition and Use",198,3.6,"Literary Text: Key Ideas and Details",207,3.5])
ws.append(["Fall 2026-2027","DEMO-1002","Q","Omar","Language Usage","LU 2-5",datetime.datetime(2026,9,21),190,3.2,30,9,None,None,None,None,None,None])
wb.save(${JSON.stringify(file)})`]);
    const rows = readXlsx(readFileSync(file));
    assert.equal(rows.length, 3);
    assert.equal(rows[1][1], "DEMO-1001");
    assert.equal(rows[1][11], "Vocabulary: Acquisition and Use");
    assert.equal(parseDate(rows[1][6], "MDY").date!.toISOString().slice(0, 10), "2026-09-20", "Excel date serial converted");
    assert.throws(() => readXlsx(Buffer.from("not a zip file at all")), /not a valid Excel/);
  });

  test("dates: ISO, month/day (NWEA), day/month, and impossible dates", () => {
    assert.equal(parseDate("2026-09-14", "MDY").date!.toISOString().slice(0, 10), "2026-09-14");
    assert.equal(parseDate("9/14/2026", "MDY").date!.toISOString().slice(0, 10), "2026-09-14");
    assert.equal(parseDate("14/09/2026", "DMY").date!.toISOString().slice(0, 10), "2026-09-14");
    assert.match(parseDate("14/09/2026", "MDY").error!, /date format setting/);
    assert.match(parseDate("2/30/2026", "MDY").error!, /not a real date/);
  });

  test("NWEA goal names map to the platform's MAP goal areas", () => {
    assert.equal(matchGoalArea("Vocabulary: Acquisition and Use"), "VOCAB");
    assert.equal(matchGoalArea("Literary Text: Language, Craft, and Structure"), "LIT_STRUCTURE");
    assert.equal(matchGoalArea("Informational Text: Key Ideas and Details"), "INFO_CENTRAL_IDEA");
    assert.equal(matchGoalArea("Language: Understand, Edit for Mechanics"), "LANG_MECHANICS");
    assert.equal(matchGoalArea("Language: Understand, Edit for Grammar, Usage"), "LANG_GRAMMAR");
    assert.equal(matchGoalArea("Something else"), null);
  });
});

describe("MAP import pipeline", () => {
  let repo: SqliteRepo;
  let admin: Actor, teacher: Actor, otherAdmin: Actor;
  before(async () => {
    ({ repo } = await demoDatabase());
    await seedQuestions(repo, { schoolCode: DEMO_SCHOOL_CODE, bank: loadBank(ROOT) });
    admin = await resolveActor(repo, (await repo.findUnique("User", { username: "demo.admin" }))!);
    teacher = await resolveActor(repo, (await repo.findUnique("User", { username: "demo.teacher.4a" }))!);
    const other = await repo.create("School", { code: "OTHER-SCH", name: "Other" });
    await repo.create("Student", { userId: (await repo.create("User", { username: "o.s", displayName: "o", role: "STUDENT", schoolId: other.id })).id, schoolId: other.id, gradeId: (await repo.create("Grade", { schoolId: other.id, level: 4, name: "Grade 4" })).id, studentNumber: "DEMO-1003X" });
    otherAdmin = await resolveActor(repo, await repo.create("User", { username: "o.admin", displayName: "o", role: "SCHOOL_ADMIN", schoolId: other.id }));
  });

  test("only school admins can import", async () => {
    await assert.rejects(stageImport(repo, teacher, { kind: "MAP_RESULTS", fileName: "m.csv", bytes: csv() }), /Missing permission/);
  });

  test("validation: every problem is reported per row; good rows are kept; nothing is written yet", async () => {
    const r = await stageImport(repo, admin, { kind: "MAP_RESULTS", fileName: "fall.csv", bytes: csv(
      "Fall 2026-2027,DEMO-1001,H,Lina,Reading,R,9/20/2026,205,3.1,61,8,Vocabulary: Acquisition and Use,196,3.6,Literary Text: Key Ideas and Details,207,3.5",
      "Fall 2026-2027,NOPE-1,X,Y,Reading,R,9/20/2026,200,3,50,8,,,,,,",
      "Fall 2026-2027,DEMO-1002,Q,Omar,Reading,R,9/20/2026,400,3,50,8,,,,,,",
      "Fall 2026-2027,DEMO-1003,A,Sara,Reading,R,13/25/2026,200,3,50,8,,,,,,",
      "Fall 2026-2027,DEMO-1004,B,Yousef,Mathematics,M,9/20/2026,210,3,55,8,,,,,,",
      "Fall 2026-2027,DEMO-1001,H,Lina,Reading,R,9/20/2026,205,3.1,61,8,,,,,,",
      "Fall 2026-2027,DEMO-1003X,Z,Z,Reading,R,9/20/2026,200,3,50,8,,,,,,",
    ) }, new Date("2026-10-01T08:00:00Z"));
    assert.equal(r.status, "AWAITING_CONFIRMATION");
    assert.equal(r.totalRows, 7);
    const msgs = r.issues.map((i) => `${i.row}:${i.message}`).join(" | ");
    assert.match(msgs, /3:No student with this number/);
    assert.match(msgs, /4:RIT 400 is outside the valid range/);
    assert.match(msgs, /5:Test date .*date format setting/);
    assert.match(msgs, /6:Subject "Mathematics" is not English/);
    assert.match(msgs, /7:Same result appears earlier/);
    assert.match(msgs, /8:No student with this number/, "a student number from another school is not matched");
    assert.equal(r.validRecords, 3, "Lina: overall + 2 goals");
    assert.equal(await repo.count("MapResult"), 0, "nothing written before confirmation");
  });

  test("confirming writes exactly the imported values, goal areas matched; nothing recalculated", async () => {
    const job = (await repo.findMany("ImportJob", { status: "AWAITING_CONFIRMATION" }))[0];
    await assert.rejects(confirmImport(repo, otherAdmin, String(job.id)), /not found/, "another school's admin cannot confirm");
    const s = await confirmImport(repo, admin, String(job.id), { duplicates: "skip" }, new Date("2026-10-01T09:00:00Z"));
    assert.equal(s.written, 3);
    const rows = await repo.findMany("MapResult");
    const overall = rows.find((r) => !r.goalName)!;
    assert.deepEqual([overall.rit, overall.ritSE, overall.achievementPercentile, overall.projectedGrowth, overall.subject], [205, 3.1, 61, 8, "READING"]);
    const vocab = rows.find((r) => r.goalName === "Vocabulary: Acquisition and Use")!;
    assert.equal(vocab.rit, 196);
    const area = await repo.findUnique("MapGoalArea", { id: vocab.goalAreaId });
    assert.equal(area!.code, "VOCAB");
    assert.equal((await repo.findUnique("ImportJob", { id: job.id }))!.payload, null, "staged rows are cleared after import");
  });

  test("uploading the same file again: flagged, duplicates skipped by default, or replaced on request", async () => {
    const file = csv("Fall 2026-2027,DEMO-1001,H,Lina,Reading,R,9/20/2026,205,3.1,61,8,Vocabulary: Acquisition and Use,196,3.6,Literary Text: Key Ideas and Details,207,3.5");
    const again = await stageImport(repo, admin, { kind: "MAP_RESULTS", fileName: "fall.csv", bytes: csv(
      "Fall 2026-2027,DEMO-1001,H,Lina,Reading,R,9/20/2026,205,3.1,61,8,Vocabulary: Acquisition and Use,196,3.6,Literary Text: Key Ideas and Details,207,3.5",
    ) });
    assert.equal(again.duplicates, 3);
    assert.equal((await confirmImport(repo, admin, again.jobId, { duplicates: "skip" })).written, 0);
    assert.equal(await repo.count("MapResult"), 3);
    const third = await stageImport(repo, admin, { kind: "MAP_RESULTS", fileName: "fall-fixed.csv", bytes: file });
    const s = await confirmImport(repo, admin, third.jobId, { duplicates: "replace" });
    assert.equal(s.replaced, 3);
    assert.equal(await repo.count("MapResult"), 3, "replaced, not doubled");
    const same = await stageImport(repo, admin, { kind: "MAP_RESULTS", fileName: "fall.csv", bytes: file });
    assert.ok(same.alreadyImportedOn, "the exact same file is recognised");
    await cancelImport(repo, admin, same.jobId);
  });

  test("day/month dates work when chosen; files without required columns fail clearly", async () => {
    const r = await stageImport(repo, admin, { kind: "MAP_RESULTS", fileName: "w.csv", dateOrder: "DMY", bytes: csv("Winter 2026-2027,DEMO-1002,Q,Omar,Language Usage,LU,14/01/2027,193,3.2,34,6,,,,,,") });
    assert.equal(r.validRecords, 1);
    const bad = await stageImport(repo, admin, { kind: "MAP_RESULTS", fileName: "b.csv", bytes: Buffer.from("Name,Score\nLina,205") });
    assert.equal(bad.status, "FAILED");
    assert.match(bad.issues[0].message, /Missing required column/);
  });

  test("the error report is a safe CSV: a malicious cell cannot run as a formula", async () => {
    const r = await stageImport(repo, admin, { kind: "MAP_RESULTS", fileName: "x.csv", bytes: csv('Fall,"=HYPERLINK(""http://evil"",""click"")",H,L,Reading,R,9/20/2026,205,3,50,8,,,,,,', "Fall,DEMO-1001,H,Lina,Reading,R,9/20/2026,206,3,50,8,,,,,,") });
    const report = await errorReportCsv(repo, admin, r.jobId);
    assert.match(report, /'=HYPERLINK/);
    assert.ok(!/(^|,)=HYPERLINK/m.test(report.replace(/"/g, "")));
  });
});

describe("other external results and MAP comparison", () => {
  let repo: SqliteRepo;
  let admin: Actor, teacher: Actor;
  let lina: string;
  before(async () => {
    ({ repo } = await demoDatabase());
    await seedQuestions(repo, { schoolCode: DEMO_SCHOOL_CODE, bank: loadBank(ROOT) });
    const g4 = (await repo.findMany("Question", { status: "UNDER_REVIEW" })).filter((q) => String(q.externalRef).startsWith("G4-"));
    await repo.updateMany("Question", { id: { in: g4.map((q) => q.id) } }, { status: "PUBLISHED" });
    admin = await resolveActor(repo, (await repo.findUnique("User", { username: "demo.admin" }))!);
    teacher = await resolveActor(repo, (await repo.findUnique("User", { username: "demo.teacher.4a" }))!);
    lina = String((await repo.findUnique("Student", { userId: (await repo.findUnique("User", { username: "demo.s1001" }))!.id }))!.id);
  });

  test("IXL-style results import with skill, SmartScore, questions and time", async () => {
    const file = Buffer.from("Student ID,Skill,Skill code,SmartScore,Questions answered,Time spent (min),Date\nDEMO-1001,Find words using context,LQN,80,24,12,2026-10-05\nDEMO-1001,Find words using context,LQN,80,24,12,2026-10-05\nDEMO-1002,Use relative pronouns,CSF,120,10,5,2026-10-05\n");
    const r = await stageImport(repo, admin, { kind: "EXTERNAL_RESULTS", fileName: "ixl.csv", bytes: file, source: "IXL" });
    assert.equal(r.validRecords, 1);
    assert.match(r.issues.map((i) => i.message).join("|"), /Score 120 is outside/);
    await confirmImport(repo, admin, r.jobId);
    const x = (await repo.findMany("ExternalAssessmentResult"))[0];
    assert.deepEqual([x.score, x.questions, x.timeSpentSec, x.externalSkill], [80, 24, 720, "Find words using context"]);
  });

  test("MAP goal vs platform mastery, side by side; a MAP weakness drives recommendations", async () => {
    const r = await stageImport(repo, admin, { kind: "MAP_RESULTS", fileName: "f.csv", bytes: csv("Fall 2026-2027,DEMO-1001,H,Lina,Reading,R,9/20/2026,210,3.0,66,8,Vocabulary: Acquisition and Use,199,3.5,Informational Text: Key Ideas and Details,212,3.4") });
    await confirmImport(repo, admin, r.jobId);
    const [c] = await mapComparison(repo, teacher, lina);
    assert.equal(c.overallRit, 210);
    const vocab = c.goals.find((g) => g.goalName.startsWith("Vocabulary"))!;
    assert.equal(vocab.relativeWeakness, true, "199 is more than one standard error below 210");
    assert.equal(vocab.recommendation, "Additional practice recommended");
    const info = c.goals.find((g) => g.goalName.startsWith("Informational"))!;
    assert.equal(info.relativeWeakness, false);
    assert.equal(info.platformMastery, null, "no platform practice yet: shown as missing, not guessed");
    // a vocabulary skill in Unit 3 is now recommended because of the imported MAP weakness
    const cur = await getStudentCurriculum(repo, lina);
    const { cards } = await getUnitSkillCards(repo, lina, cur.units.find((u) => u.number === 3)!.unitId);
    const vocabCard = cards.find((k) => k.name === "Context Clues")!;
    assert.equal(vocabCard.recommended, true);
    assert.match(vocabCard.recommendedReason!, /test results/);
    const otherTeacher = await resolveActor(repo, (await repo.findUnique("User", { username: "demo.teacher.4b" }))!);
    await assert.rejects(mapComparison(repo, otherTeacher, lina), /do not have access/);
  });
});
