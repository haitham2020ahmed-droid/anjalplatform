/**
 * ✋ Manual assign from the Curriculum Map (FAKE data only — the Test School): the teacher ticks students and gives
 * them Below / On / Above; exactly those students get the set, each starting at the chosen level.
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import type { Actor } from "../src/server/auth/rbac";
import { seedTestEnvironment } from "../src/server/seeding/test-env";
import { parseCurriculumMap } from "../src/server/curriculum-map/source";
import { seedCurriculumMap } from "../src/server/curriculum-map/seed";
import { createDraft } from "../src/server/admin/questions";
import { teacherRoster } from "../src/server/teacher/assign";
import { assignFromMap, rosterForGrade, setStudentLevels } from "../src/server/curriculum-map/levels";
import { evidenceLevels } from "../src/server/curriculum-map/evidence-level";
import { startQuiz } from "../src/server/practice/session";
import { demoDatabase } from "./helpers/db";

describe("manual levels on assign", () => {
  let repo: SqliteRepo; let teacher: Actor; let classId: string; let roster: { id: string }[];
  before(async () => {
    ({ repo } = await demoDatabase());
    await seedTestEnvironment(repo, { root: process.cwd(), passwordHash: "x".repeat(60), practice: "none" });
    const a = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);
    const admin = await a("test.admin"); teacher = await a("test.teacher.1");
    await seedCurriculumMap(repo, parseCurriculumMap(readFileSync("data/curriculum-map/source.txt", "utf8")), { schoolId: admin.schoolId! });
    const ids: string[] = [];
    for (const lv of ["BELOW", "ON", "ABOVE"]) for (let i = 0; i < 6; i++) ids.push(await createDraft(repo, admin, { skillId: "", type: "MULTIPLE_CHOICE", stem: `${lv} item ${i}`, level: 4, whyCorrect: "Because.", mapNodeCode: `G4.U1.TS2.ACS.${lv}`, options: [{ label: "A", text: `r${lv}${i}`, correct: true, rationale: null }, { label: "B", text: `w${lv}${i}`, correct: false, rationale: "No." }] } as never));
    await repo.updateMany("Question", { id: { in: ids } }, { status: "PUBLISHED" });
    const r = await teacherRoster(repo, teacher); classId = r[0].id; roster = r[0].students;
  });

  test("ticked students get the set at their chosen level; the others do not get it", async () => {
    const chosen = [{ studentId: roster[0].id, level: "BELOW" as const }, { studentId: roster[1].id, level: "ABOVE" as const }, { studentId: roster[2].id, level: "ON" as const }];
    await setStudentLevels(repo, teacher, classId, chosen);
    const r = await assignFromMap(repo, teacher, { source: "CURRICULUM", classId, categoryCode: "G4.U1.TS2.ACS", studentIds: chosen.map((c) => c.studentId), mode: "ADAPTIVE", targetCorrect: 10 });
    const aid = r.groups[0].assignmentId;
    assert.equal(await repo.count("AssignmentStudent", { assignmentId: aid }), 3, "only the three ticked students");
    for (const c of chosen) {
      const st = await resolveActor(repo, (await repo.findUnique("User", { id: (await repo.findUnique("Student", { id: c.studentId }))!.userId }))!);
      const v = await startQuiz(repo, st, aid);
      const q = (await repo.findUnique("Question", { id: v.question!.questionId }))!;
      assert.ok(String(q.stem).startsWith(c.level), `${c.level} student starts at ${c.level} (got “${q.stem}”)`);
    }
  });

  test("every source counts: MAP → level; the teacher's choice wins; “no data” only without any data", async () => {
    const [a, b] = [roster[10].id, roster[11].id];
    await repo.create("MapResult", { studentId: a, testDate: new Date(), subject: "Reading", goalName: null, rit: 225, achievementPercentile: 85, termName: "Fall 2026", importedAt: new Date() });
    const ev = await evidenceLevels(repo, teacher.schoolId, [a, b], 4, { category: "ACS" });
    assert.notEqual(ev.get(a)!.from, "NO_DATA", "a MAP score gives a level");
    assert.equal(ev.get(b)!.from, "NO_DATA");
    const room = (await rosterForGrade(repo, teacher, 4)).find((c) => c.id === classId)!;
    assert.equal(room.students.find((x) => x.id === a)!.byCategory.ACS.from, ev.get(a)!.from, "the Assign window shows the same level");
    await setStudentLevels(repo, teacher, classId, [{ studentId: a, level: "BELOW" }]);
    const again = (await evidenceLevels(repo, teacher.schoolId, [a], 4, { category: "ACS" })).get(a)!;
    assert.deepEqual([again.level, again.from], ["BELOW", "TEACHER"]);
  });
});
