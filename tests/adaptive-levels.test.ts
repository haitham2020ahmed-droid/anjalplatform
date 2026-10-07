import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import type { Actor } from "../src/server/auth/rbac";
import { seedTestEnvironment } from "../src/server/seeding/test-env";
import { parseCurriculumMap } from "../src/server/curriculum-map/source";
import { seedCurriculumMap } from "../src/server/curriculum-map/seed";
import { decideLevel, pickNext } from "../src/server/curriculum-map/leveled";
import { DEFAULT_LEXILE_BANDS, levelForLexile } from "../src/server/curriculum-map/lexile";
import { assignFromMap, studentLevels } from "../src/server/curriculum-map/levels";
import { createDraft } from "../src/server/admin/questions";
import { teacherRoster } from "../src/server/teacher/assign";
import { assignedSkills, assignmentReport } from "../src/server/student/assigned";
import { startQuiz, submitQuizAnswer } from "../src/server/practice/session";
import { loadQuestionItems } from "../src/server/practice/items";
import { importMapScores, MAP_TEMPLATE_HEADERS } from "../src/server/map/student-map";
import { demoDatabase } from "./helpers/db";

describe("adaptive curriculum levels (Below → On → Above) driven by Lexile", () => {
  test("the rules: 4 of 5 correct moves up; 1 or fewer of 4 moves down; Above passed = done", () => {
    const ok = (level: "BELOW" | "ON" | "ABOVE", n: number) => Array.from({ length: n }, () => ({ level, correct: true }));
    const no = (level: "BELOW" | "ON" | "ABOVE", n: number) => Array.from({ length: n }, () => ({ level, correct: false }));
    assert.deepEqual(decideLevel("BELOW", ok("BELOW", 3), 20).level, "BELOW", "3 correct is not enough");
    assert.deepEqual(decideLevel("BELOW", ok("BELOW", 4), 20).path, ["BELOW", "ON"]);
    const all = decideLevel("BELOW", [...ok("BELOW", 4), ...ok("ON", 4), ...ok("ABOVE", 4)], 20);
    assert.deepEqual([all.path, all.done, all.reason], [["BELOW", "ON", "ABOVE"], true, "MASTERED_ABOVE"]);
    const down = decideLevel("ON", no("ON", 4), 20);
    assert.deepEqual([down.level, down.path], ["BELOW", ["ON", "BELOW"]]);
    assert.equal(decideLevel("BELOW", no("BELOW", 6), 20).level, "BELOW", "never below Below");
    const mixed = decideLevel("BELOW", [{ level: "BELOW", correct: true }, { level: "BELOW", correct: false }, { level: "BELOW", correct: true }, { level: "BELOW", correct: true }, { level: "BELOW", correct: true }], 20);
    assert.equal(mixed.level, "ON", "4 of the last 5");
    assert.deepEqual([decideLevel("BELOW", ok("BELOW", 2), 2).done, decideLevel("BELOW", ok("BELOW", 2), 2).reason], [true, "LIMIT"]);
  });

  test("Lexile decides the level (CCSS bands) and picks the closest text", () => {
    const g4 = DEFAULT_LEXILE_BANDS[4];
    assert.deepEqual([700, 740, 875, 900].map((l) => levelForLexile(g4, l)), ["BELOW", "ON", "ON", "ABOVE"]);
    const pool = [{ id: "a", level: "ON" as const, lexile: 760, difficulty: 4 }, { id: "b", level: "ON" as const, lexile: 860, difficulty: 4 }, { id: "c", level: "ON" as const, lexile: 820, difficulty: 4 }];
    assert.equal(pickNext(pool, "ON", new Set(), 850), "b");
    assert.equal(pickNext(pool, "ON", new Set(["b"]), 850), "c");
    assert.equal(pickNext(pool, "ON", new Set(), null), "a", "no student Lexile: easiest text first");
  });

  describe("end to end", () => {
    let repo: SqliteRepo; let teacher: Actor; let admin: Actor; let classId: string; let roster: { id: string; name: string }[]; let adaptiveId = "";
    const student = async (id: string) => resolveActor(repo, (await repo.findUnique("User", { id: (await repo.findUnique("Student", { id }))!.userId }))!);
    const LEX = { BELOW: [600, 620, 640, 660, 680, 700], ON: [760, 780, 800, 820, 840, 860], ABOVE: [900, 920, 940, 960, 980, 1000] } as const;
    before(async () => {
      ({ repo } = await demoDatabase());
      await seedTestEnvironment(repo, { root: process.cwd(), passwordHash: "x".repeat(60), practice: "none" });
      const a = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);
      [teacher, admin] = await Promise.all(["test.teacher.1", "test.admin"].map(a));
      await seedCurriculumMap(repo, parseCurriculumMap(readFileSync("data/curriculum-map/source.txt", "utf8")), { schoolId: admin.schoolId! });
      const r = await teacherRoster(repo, teacher); classId = r[0].id; roster = r[0].students;
      const ids: string[] = [];
      for (const level of ["BELOW", "ON", "ABOVE"] as const) for (const [i, lexile] of LEX[level].entries()) {
        ids.push(await createDraft(repo, admin, { skillId: "", type: "MULTIPLE_CHOICE", stem: `${level} plot question ${i} with its own words ${level}${i}`, level: 4, whyCorrect: "Because.", lexile, mapNodeCode: `G4.U1.TS2.ACS.${level}`,
          options: [{ label: "A", text: `right ${level}${i}`, correct: true, rationale: null }, { label: "B", text: `wrong ${level}${i}`, correct: false, rationale: "No." }, { label: "C", text: `other ${level}${i}`, correct: false, rationale: "No." }] }));
      }
      await repo.updateMany("Question", { id: { in: ids } }, { status: "PUBLISHED" });
    });

    test("a student with no data starts at Below, climbs to On then Above, and finishes when Above is mastered", async () => {
      const r = await assignFromMap(repo, teacher, { classId, categoryCode: "G4.U1.TS2.ACS", studentIds: [roster[0].id, roster[1].id], maxQuestions: 20 });
      assert.deepEqual([r.groups.length, r.groups[0].questions], [1, 18], "one adaptive set with the whole pool");
      const aid = r.groups[0].assignmentId; adaptiveId = aid;
      const st = await student(roster[0].id);
      assert.equal((await assignedSkills(repo, st)).items.find((i) => i.assignmentId === aid)!.questionCount, 18 > 20 ? 20 : 18);
      let v = await startQuiz(repo, st, aid);
      const seen: string[] = [];
      while (v.question) {
        const it = (await loadQuestionItems(repo, [v.question.questionId]))[0];
        const q = (await repo.findUnique("Question", { id: it.questionId }))!;
        seen.push(String(q.stem).split(" ")[0]);
        v = (await submitQuizAnswer(repo, st, { assignmentId: aid, questionId: it.questionId, response: it.options!.find((o) => o.correct)!.label })).view;
      }
      assert.deepEqual(seen, [...Array(4).fill("BELOW"), ...Array(4).fill("ON"), ...Array(4).fill("ABOVE")], "4 at each level, then done");
      const rep = await assignmentReport(repo, st, aid);
      assert.match(rep.masteryLevel, /Reached Above Level \(path: Below → On → Above\)/);
      assert.equal((await assignedSkills(repo, st)).items.find((i) => i.assignmentId === aid)!.status, "COMPLETED");
      assert.deepEqual((await studentLevels(repo, [roster[0].id])).get(roster[0].id), { level: "ABOVE", source: "ADAPTIVE" });
    });

    test("a student whose MAP Lexile is high starts at Above, with the text closest to their Lexile", async () => {
      await importMapScores(repo, teacher, [MAP_TEMPLATE_HEADERS, [String((await repo.findUnique("Student", { id: roster[1].id }))!.studentNumber), "", "215", "220", "", "955"]], 2026);
      const st = await student(roster[1].id);
      const v = await startQuiz(repo, st, adaptiveId);
      const q = (await repo.findUnique("Question", { id: v.question!.questionId }))!;
      assert.deepEqual([String(q.stem).split(" ")[0], Number(q.lexile)], ["ABOVE", 960]);
    });

    test("a question's Lexile outside its level's band is flagged on import; a bad Lexile is refused", async () => {
      const { analyzeImport, getImportJob } = await import("../src/server/admin/question-import");
      const { CURRICULUM_TEMPLATE_HEADERS } = await import("../src/imports/questions/template");
      const H = [...CURRICULUM_TEMPLATE_HEADERS];
      assert.ok(H.includes("Lexile"), "the Curriculum template has a Lexile column");
      const row = (stem: string, lexile: string) => H.map((h) => ({ "Question Text": stem, "Question Type": "Multiple Choice", "Option A": "a", "Option B": "b", "Option C": "c", "Option D": "d", "Correct Answer": "A", Explanation: "Because.", Grade: "4", Unit: "1", "Text Set / Selection": "2", Category: "Analyze Craft and Structure", "Map Level": "Below", Lexile: lexile } as Record<string, string>)[h] ?? "");
      const csv = new TextEncoder().encode([H, row("Too hard for Below level text", "950"), row("A bad Lexile value here", "abc")].map((r) => r.map((c) => `"${c}"`).join(",")).join("\n") + "\n");
      const job = await getImportJob(repo, admin, await analyzeImport(repo, admin, { fileName: "lex.csv", bytes: csv, target: "CURRICULUM" }));
      assert.match(job.rows[0].warnings.join(" "), /Lexile 950L is in the Above Level band for Grade 4/);
      assert.equal(job.rows[1].status, "INVALID");
      assert.match(job.rows[1].errors.join(" "), /Lexile “abc”/);
    });

    test("from the map: one level to chosen students only; ☆ Choose questions lists the whole category", async () => {
      const chosen = [roster[5].id, roster[6].id];
      const r = await assignFromMap(repo, teacher, { classId, categoryCode: "G4.U1.TS2.ACS.ON", studentIds: chosen });
      assert.deepEqual(r.groups.map((g) => [g.level, g.students, g.questions]), [["ON", 2, 6]]);
      const got = (await repo.findMany("AssignmentStudent", { assignmentId: r.groups[0].assignmentId })).map((x) => String(x.studentId)).sort();
      assert.deepEqual(got, [...chosen].sort(), "only the chosen students");
      const qs = (await repo.findMany("AssessmentQuestion", { assessmentId: (await repo.findUnique("Assignment", { id: r.groups[0].assignmentId }))!.assessmentId })).map((x) => String(x.questionId));
      assert.ok((await repo.findMany("Question", { id: { in: qs } })).every((q) => String(q.stem).startsWith("ON ")), "only On Level questions");
      // adaptive for chosen students only
      const ad = await assignFromMap(repo, teacher, { classId, categoryCode: "G4.U1.TS2.ACS", studentIds: [roster[7].id] });
      assert.equal(ad.groups[0].students, 1);
      // the bank filter by a category code shows the questions of its three levels
      const { listQuestions } = await import("../src/server/admin/questions");
      assert.equal((await listQuestions(repo, teacher, { status: "PUBLISHED", mapCode: "G4.U1.TS2.ACS" })).items.length, 18);
      assert.equal((await listQuestions(repo, teacher, { status: "PUBLISHED", mapCode: "G4.U1.TS2.ACS.BELOW" })).items.length, 6);
    });
  });
});
