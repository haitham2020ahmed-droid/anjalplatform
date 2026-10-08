import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import { ForbiddenError, type Actor } from "../src/server/auth/rbac";
import { seedTestEnvironment } from "../src/server/seeding/test-env";
import { parseCurriculumMap } from "../src/server/curriculum-map/source";
import { seedCurriculumMap } from "../src/server/curriculum-map/seed";
import { bridgeOf, bridges, importBridges, resetBridges } from "../src/server/curriculum-map/bridge";
import { decideLevel } from "../src/server/curriculum-map/leveled";
import { assignFromMap } from "../src/server/curriculum-map/levels";
import { createDraft } from "../src/server/admin/questions";
import { teacherRoster } from "../src/server/teacher/assign";
import { assignmentReport } from "../src/server/student/assigned";
import { startQuiz, submitQuizAnswer } from "../src/server/practice/session";
import { loadQuestionItems } from "../src/server/practice/items";
import { demoDatabase } from "./helpers/db";

describe("🌉 Cross-Grade Bridge: the same skill one grade up (challenge) and one grade down (support)", () => {
  let repo: SqliteRepo; let admin: Actor; let teacher: Actor;
  before(async () => {
    ({ repo } = await demoDatabase());
    await seedTestEnvironment(repo, { root: process.cwd(), passwordHash: "x".repeat(60), practice: "none" });
    admin = await resolveActor(repo, (await repo.findUnique("User", { username: "test.admin" }))!);
    teacher = await resolveActor(repo, (await repo.findUnique("User", { username: "test.teacher.1" }))!);
    await seedCurriculumMap(repo, parseCurriculumMap(readFileSync("data/curriculum-map/source.txt", "utf8")), { schoolId: admin.schoolId! });
  });

  test("automatic links: same category type, adjacent grades; Grade 4 has no support, Grade 6 no challenge", async () => {
    const g5 = (await bridges(repo, admin.schoolId!, 5)).filter((r) => r.from.endsWith(".ACS"));
    assert.ok(g5.length >= 18 && g5.every((r) => /^G6\..*\.ACS$/.test(r.challenge ?? "") && /^G4\..*\.ACS$/.test(r.support ?? "") && r.source === "AUTO"));
    assert.ok((await bridges(repo, admin.schoolId!, 4)).every((r) => r.support === null));
    assert.ok((await bridges(repo, admin.schoolId!, 6)).every((r) => r.challenge === null));
  });

  test("the school's own sheet overrides; wrong grades are refused; reset goes back to automatic", async () => {
    await assert.rejects(importBridges(repo, teacher, [["From", "Challenge", "Support"]]), ForbiddenError);
    const r = await importBridges(repo, admin, [["From", "Challenge", "Support"], ["G5.U1.TS2.ACS", "G6.U2.SEL2.ACS", "G4.U3.TS1.ACS"], ["G5.U1.TS3.ACS", "G4.U1.TS1.ACS", ""], ["G9.X", "", ""]]);
    assert.equal(r.saved, 1);
    assert.equal(r.errors.length, 2, "a Grade 4 place as a challenge, and an unknown code");
    assert.deepEqual(await bridgeOf(repo, admin.schoolId!, "G5.U1.TS2.ACS"), { challenge: "G6.U2.SEL2.ACS", support: "G4.U3.TS1.ACS" });
    assert.equal((await bridges(repo, admin.schoolId!, 5)).find((x) => x.from === "G5.U1.TS2.ACS")!.source, "IMPORT");
    assert.equal(await resetBridges(repo, admin), 1);
  });

  test("the five-rung ladder: support below Below, challenge above Above", () => {
    const five = ["SUPPORT", "BELOW", "ON", "ABOVE", "CHALLENGE"] as const;
    const ok = (l: (typeof five)[number], n: number) => Array.from({ length: n }, () => ({ level: l, correct: true }));
    const no = (l: (typeof five)[number], n: number) => Array.from({ length: n }, () => ({ level: l, correct: false }));
    const climb = decideLevel("BELOW", [...ok("BELOW", 4), ...ok("ON", 4), ...ok("ABOVE", 4), ...ok("CHALLENGE", 4)], 30, [...five]);
    assert.deepEqual([climb.path, climb.done], [["BELOW", "ON", "ABOVE", "CHALLENGE"], true]);
    assert.deepEqual(decideLevel("BELOW", no("BELOW", 4), 30, [...five]).path, ["BELOW", "SUPPORT"]);
    assert.deepEqual(decideLevel("BELOW", no("BELOW", 4), 30).path, ["BELOW"], "no bridge questions: the classic three rungs");
  });

  test("end to end: a Grade 4 student who masters Above moves on to Grade 5 questions of the same skill", async () => {
    const from = "G4.U1.TS2.ACS";
    const { challenge } = await bridgeOf(repo, admin.schoolId!, from);
    assert.ok(challenge && challenge.startsWith("G5."));
    const ids: string[] = [];
    const mk = async (code: string, tag: string, n: number) => { for (let i = 0; i < n; i++) ids.push(await createDraft(repo, admin, { skillId: "", type: "MULTIPLE_CHOICE", stem: `${tag} question ${i} about the story ${tag}${i}`, level: 4, whyCorrect: "Because.", mapNodeCode: code, options: [{ label: "A", text: `right ${tag}${i}`, correct: true, rationale: null }, { label: "B", text: `wrong ${tag}${i}`, correct: false, rationale: "No." }] })); };
    await mk(`${from}.BELOW`, "BELOW", 4); await mk(`${from}.ON`, "ON", 4); await mk(`${from}.ABOVE`, "ABOVE", 4); await mk(`${challenge}.ABOVE`, "CHALLENGE", 5);
    await repo.updateMany("Question", { id: { in: ids } }, { status: "PUBLISHED" });
    const roster = await teacherRoster(repo, teacher);
    const r = await assignFromMap(repo, teacher, { classId: roster[0].id, categoryCode: from, studentIds: [roster[0].students[0].id], maxQuestions: 30 });
    assert.ok(r.notes.some((n) => /Challenge path: 5 question/.test(n)));
    const st = await resolveActor(repo, (await repo.findUnique("User", { id: (await repo.findUnique("Student", { id: roster[0].students[0].id }))!.userId }))!);
    const aid = r.groups[0].assignmentId;
    let clock = Date.now(); let v = await startQuiz(repo, st, aid, new Date(clock)); const seen: string[] = [];   // a reader: 30 s a question
    while (v.question) {
      const it = (await loadQuestionItems(repo, [v.question.questionId]))[0];
      seen.push(String((await repo.findUnique("Question", { id: it.questionId }))!.stem).split(" ")[0]);
      v = (await submitQuizAnswer(repo, st, { assignmentId: aid, questionId: it.questionId, response: it.options!.find((o) => o.correct)!.label }, new Date((clock += 30_000)))).view;
    }
    assert.deepEqual(seen, [...Array(4).fill("BELOW"), ...Array(4).fill("ON"), ...Array(4).fill("ABOVE"), ...Array(4).fill("CHALLENGE")]);
    assert.match((await assignmentReport(repo, st, aid)).masteryLevel, /Reached 🚀 Challenge.*Below → On → Above → 🚀 Challenge/);
    // mastered past Above (🚀): the category's level is Above, where its next set starts
    assert.equal(String((await repo.findMany("StudentCategoryLevel", { studentId: roster[0].students[0].id }))[0]?.level), "ABOVE");
  });
});
