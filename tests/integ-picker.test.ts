/**
 * Integration of the skill question picker with the plan builders (in-memory Demo School; no real data):
 *  - a plan sent with picked questions stores them on the skill's Assignment (questionIds, program)
 *  - the student's practice of that assignment serves only those questions (the engine still chooses among them)
 *  - MAP plan drafts made on score import are listed for review, never sent automatically; Dismiss keeps nothing open
 *  - no "Any grade" filters / grade tags left in the teachers' skill choosers
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import { ForbiddenError, type Actor } from "../src/server/auth/rbac";
import { teacherCurriculum } from "../src/server/teacher/assign";
import { chosenQuestionIdsOfAssignment, questionsOfSkill } from "../src/server/questions/skill-questions";
import { loadSkillItems } from "../src/server/practice/items";
import { startPractice, submitAnswer } from "../src/server/practice/session";
import { sendProgramPlan } from "../src/server/plans/send";
import { pickField, readQuestionPicks } from "../src/server/plans/plan-form";
import { dismissMapDraft, mapDraftsForClass, sendMapDraft } from "../src/server/plans/map-drafts";
import { ensureDrafts } from "../src/server/map/map-plan";
import { importMapScores, MAP_TEMPLATE_HEADERS } from "../src/server/map/student-map";
import { questionIdsField, toPickerQuestions } from "../src/components/skill-picker/helpers";
import { UI_STRINGS } from "../src/i18n/en";
import { ar } from "../src/i18n/ar";
import { demoDatabase } from "./helpers/db";
import { publishGrade4Bank } from "./helpers/practice";

const ROOT = join(__dirname, "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const NOW = new Date("2027-02-14T08:00:00Z");
const ids = (v: unknown): string[] => (typeof v === "string" ? JSON.parse(v) : (v as string[] | null)) ?? [];

describe("🧩 picker ↔ plans: picked questions go into the assignment and the student's practice", () => {
  let repo: SqliteRepo;
  let teacher: Actor, student: Actor;
  let classId: string, skillId: string, otherSkillId: string;
  let students: { id: string }[];
  let picked: string[];
  let assignmentId: string;

  before(async () => {
    ({ repo } = await demoDatabase());
    await publishGrade4Bank(repo);
    teacher = await resolveActor(repo, (await repo.findUnique("User", { username: "demo.teacher.4a" }))!);
    const view = (await teacherCurriculum(repo, teacher))!;
    classId = view.classId;
    students = view.students;
    for (const u of view.units) for (const k of u.skills) {
      const mc = (await loadSkillItems(repo, k.id)).filter((i) => i.type === "MULTIPLE_CHOICE");
      if (!skillId && mc.length >= 8) { skillId = k.id; picked = mc.slice(2, 5).map((i) => i.questionId); }
      else if (skillId && !otherSkillId && k.id !== skillId && mc.length >= 2) otherSkillId = k.id;
    }
    assert.ok(skillId && otherSkillId, "two skills with questions");
    const st = (await repo.findUnique("Student", { id: students[0].id }))!;
    student = await resolveActor(repo, (await repo.findUnique("User", { id: st.userId }))!);
  });

  test("the picker's form field → readQuestionPicks → sendProgramPlan stores questionIds and program", async () => {
    const field = questionIdsField({ auto: false, questionIds: picked });
    const form = new Map([[pickField(skillId), field], [pickField(otherSkillId), ""]]);
    const picks = readQuestionPicks((k) => form.get(k) ?? null, [skillId, otherSkillId]);
    assert.deepEqual(picks, { [skillId]: picked }, "a skill left on the platform's choice has no picks");
    const r = await sendProgramPlan(repo, teacher, {
      classId, program: "RTI", title: "Picked plan",
      picks: students.flatMap((s) => [{ studentId: s.id, skillId }, { studentId: s.id, skillId: otherSkillId }]), questionIds: picks,
    }, NOW);
    assert.equal(r.skills, 2);
    const rows = await repo.findMany("Assignment", { id: { in: r.assignmentIds } });
    const mine = rows.find((a) => a.skillId === skillId)!, auto = rows.find((a) => a.skillId === otherSkillId)!;
    assert.equal(mine.program, "RTI");
    assert.deepEqual(ids(mine.questionIds), picked, "the teacher's questions, in order");
    assert.equal(auto.program, "RTI");
    assert.equal(auto.questionIds ?? null, null, "automatic selection at each student's level");
    assert.deepEqual(await chosenQuestionIdsOfAssignment(repo, String(mine.id)), picked);
    assert.equal(await chosenQuestionIdsOfAssignment(repo, String(auto.id)), null);
    assignmentId = String(mine.id);
  });

  test("questions of another skill cannot be slipped into a plan", async () => {
    const foreign = (await questionsOfSkill(repo, teacher.schoolId!, otherSkillId)).filter((q) => !picked.includes(q.id)).slice(0, 1).map((q) => q.id);
    const own = new Set((await questionsOfSkill(repo, teacher.schoolId!, skillId)).map((q) => q.id));
    if (foreign.length && !own.has(foreign[0])) {
      await assert.rejects(sendProgramPlan(repo, teacher, { classId, program: null, picks: [{ studentId: students[0].id, skillId }], questionIds: { [skillId]: foreign } }, NOW), /this skill only/);
    }
  });

  test("the student's practice of that assignment serves only the picked questions", async () => {
    let view = await startPractice(repo, student, skillId, NOW);
    const session = (await repo.findUnique("PracticeSession", { id: view.sessionId }))!;
    assert.equal(String(session.assignmentId), assignmentId, "the practice is linked to the assignment");
    const seen: string[] = [];
    for (let i = 0; i < 6 && view.question && !view.ended; i++) {
      const q = view.question;
      seen.push(q.questionId);
      assert.ok(picked.includes(q.questionId), `served ${q.questionId}: one of the teacher's questions`);
      const r = await submitAnswer(repo, student, { sessionId: view.sessionId, questionId: q.questionId, response: q.options![0].label }, new Date(NOW.getTime() + (i + 1) * 20_000));
      view = r.view;
    }
    assert.ok(seen.length >= 1);
  });
});

describe("🗺️ MAP plan drafts made on score import: listed for review, never sent automatically", () => {
  let repo: SqliteRepo;
  let teacher: Actor, other: Actor;
  let classId: string;
  before(async () => {
    ({ repo } = await demoDatabase());
    await publishGrade4Bank(repo);
    teacher = await resolveActor(repo, (await repo.findUnique("User", { username: "demo.teacher.4a" }))!);
    const view = (await teacherCurriculum(repo, teacher))!;
    classId = view.classId;
    const H = [...MAP_TEMPLATE_HEADERS], at = (h: string) => H.indexOf(h), table = [H];
    for (const [i, s] of view.students.slice(0, 3).entries()) {
      const row = H.map(() => ""); row[0] = String((await repo.findUnique("Student", { id: s.id }))!.studentNumber);
      row[at("Reading Fall RIT")] = String(185 + i * 8); row[at("Reading Fall Percentile")] = String(20 + i * 20);
      row[at("R: Literary Text")] = "175"; row[at("R: Vocabulary")] = "195"; row[at("R: Informational Text")] = "185";
      table.push(row);
    }
    await importMapScores(repo, teacher, table, 2026, NOW);
    const otherUser = (await repo.findMany("User", { role: "TEACHER" })).find((u) => u.username !== "demo.teacher.4a")!;
    other = await resolveActor(repo, otherUser);
  });

  test("the import made drafts; nothing was sent; the plan tab lists them", async () => {
    const rows = await repo.findMany("MapPlan", { classId });
    assert.ok(rows.length >= 1, "drafts made on import");
    assert.ok(rows.every((r) => r.status === "DRAFT"), "never sent automatically");
    assert.equal((await repo.findMany("Notification", { title: "🗺️ Your MAP plan is ready" })).length, 0);
    const drafts = await mapDraftsForClass(repo, teacher, classId);
    assert.equal(drafts.length, rows.length);
    for (const d of drafts) { assert.equal(d.subject, "READING"); assert.ok(d.areas.length >= 1); assert.ok(d.studentName); }
  });

  test("only the class's own teacher sees and acts on its drafts", async () => {
    const [d] = await mapDraftsForClass(repo, teacher, classId);
    await assert.rejects(mapDraftsForClass(repo, other, classId), ForbiddenError);
    await assert.rejects(dismissMapDraft(repo, other, d.id, NOW), ForbiddenError);
    await assert.rejects(sendMapDraft(repo, other, d.id, NOW), ForbiddenError);
  });

  test("Dismiss: the draft leaves the list, is not made again, and cannot be sent", async () => {
    const before = await mapDraftsForClass(repo, teacher, classId);
    const d = before[0];
    await dismissMapDraft(repo, teacher, d.id, NOW);
    assert.equal((await repo.findUnique("MapPlan", { id: d.id }))!.status, "DISMISSED", "kept, not deleted");
    assert.ok(!(await mapDraftsForClass(repo, teacher, classId)).some((x) => x.id === d.id));
    await ensureDrafts(repo, teacher, classId, "READING", NOW);
    assert.equal((await mapDraftsForClass(repo, teacher, classId)).length, before.length - 1, "the same term's draft is not made again");
    await assert.rejects(sendMapDraft(repo, teacher, d.id, NOW), /already sent or dismissed/);
  });

  test("Send (after the preview) is the only way a draft reaches the student", async () => {
    const [d] = await mapDraftsForClass(repo, teacher, classId);
    if (!d) return;
    try {
      await sendMapDraft(repo, teacher, d.id, NOW);
      assert.equal((await repo.findUnique("MapPlan", { id: d.id }))!.status, "SENT");
      assert.ok(!(await mapDraftsForClass(repo, teacher, classId)).some((x) => x.id === d.id));
    } catch (e) {
      assert.match(String((e as Error).message), /no questions yet/);
      assert.equal((await repo.findUnique("MapPlan", { id: d.id }))!.status, "DRAFT", "still waiting for the teacher");
    }
  });
});

describe("🧩 teachers' skill choosers: skill names only, questions one click away", () => {
  const CHOOSERS = [
    "src/components/plans/plan-builder.tsx", "src/app/teacher/map-center/plan-tab.tsx", "src/app/teacher/rti-plan/page.tsx",
    "src/app/teacher/plans/page.tsx", "src/app/teacher/curriculum/page.tsx", "src/components/curriculum-map/send-plan.tsx",
    "src/app/teacher/assign-dialog.tsx", "src/components/teacher/home-widgets.tsx", "src/app/teacher/assessments/new/test-builder.tsx",
    "src/components/game/challenge-setup.tsx", "src/app/teacher/skill-assign/page.tsx", "src/components/skill-picker/skill-question-picker.tsx",
  ];
  test('no "Any grade" filter and no grade tag on a skill', () => {
    for (const f of CHOOSERS) {
      const src = read(f);
      assert.doesNotMatch(src, /Any grade|\(any grade\)|from any grade/, `${f}: no "Any grade"`);
      assert.doesNotMatch(src, /gradeTag|Grade \{k\.grade\}|G\{k\.grade\}|\{ n: k\.grade \}/, `${f}: no grade tag on a skill`);
    }
    assert.ok(!(UI_STRINGS as readonly string[]).includes("Any grade"));
  });

  test("the plan builders and the MAP/NAFS skill list open the skill's questions", () => {
    assert.match(read("src/components/plans/plan-builder.tsx"), /<SkillQuestionPicker[^>]*name=\{pickField/);
    assert.doesNotMatch(read("src/components/plans/plan-builder.tsx"), /TODO\(agent B\)/);
    assert.match(read("src/app/teacher/curriculum/page.tsx"), /<SkillQuestionPicker/);
    for (const f of ["src/app/teacher/map-center/actions.ts", "src/app/teacher/rti-plan/actions.ts", "src/app/teacher/plans/actions.ts"]) assert.match(read(f), /questionIds: readQuestionPicks/, f);
    assert.match(read("src/app/teacher/map-center/plan-tab.tsx"), /Drafts ready to review/);
  });

  test("the picker reads the server's result shape (choices, correct answer, level)", () => {
    const rows = toPickerQuestions({ skill: { id: "k", name: "K", grade: 4 }, total: 1, questions: [{ id: "q1", stem: "Pick", choices: [{ label: "A", text: "cat" }, { label: "B", text: "dog" }], correctAnswer: "B. dog", level: "ON", type: "MULTIPLE_CHOICE", passageTitle: null }] });
    assert.deepEqual(rows, [{ id: "q1", stem: "Pick", choices: ["cat", "dog"], answer: "B. dog", level: "ON", type: "MULTIPLE_CHOICE", passageTitle: null }]);
    assert.deepEqual(toPickerQuestions({ error: "x" }), []);
  });

  test("every new string has an Arabic version", () => {
    for (const s of ["See questions", "{n} questions picked", "The platform chooses at each student's level", "Drafts ready to review", "Dismiss", "Draft dismissed.", "Add a skill", "Choose questions of this skill only."]) {
      assert.ok((UI_STRINGS as readonly string[]).includes(s), s);
      assert.match(ar[s as keyof typeof ar], /[؀-ۿ]/, s);
    }
  });
});
