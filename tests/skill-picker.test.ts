import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import { ForbiddenError, type Actor } from "../src/server/auth/rbac";
import { assignSkill, pickedQuestionIds, programOrNull, teacherCurriculum } from "../src/server/teacher/assign";
import { assignSkillByLevel } from "../src/server/teacher/skill-assign";
import { listChallengeTemplates, saveChallengeTemplate } from "../src/server/game/live-challenge";
import { questionsOfSkill } from "../src/server/questions/skill-questions";
import {
  AUTO, MAX_PICKED, dedupeSkillsByName, defaultProgram, filterQuestions, isCorrectChoice, normalizeSkillName, parseQuestionIdsField,
  pickerOutput, previewQuestions, programOf, questionIdsField, type PickerQuestion,
} from "../src/components/skill-picker/helpers";
import { UI_STRINGS } from "../src/i18n/en";
import { ar } from "../src/i18n/ar";
import { demoDatabase } from "./helpers/db";
import { publishGrade4Bank } from "./helpers/practice";

const ROOT = join(__dirname, "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const NOW = new Date("2027-02-14T08:00:00Z");

describe("🧩 skill picker: pure helpers", () => {
  test("search results: one row per skill name + kind (the same skill of several grades is shown once)", () => {
    const rows = [
      { id: "g4", name: "Main Idea & Details", kind: "READING", n: 3 },
      { id: "g5", name: "main idea and details ", kind: "READING", n: 9 },
      { id: "gr", name: "Main Idea and Details", kind: "GRAMMAR", n: 1 },
      { id: "x", name: "Make Inferences", kind: "READING", n: 2 },
    ];
    assert.equal(normalizeSkillName("Author’s Purpose!"), normalizeSkillName("authors purpose"));
    assert.deepEqual(dedupeSkillsByName(rows, (r) => r.kind).map((r) => r.id), ["g4", "gr", "x"], "first copy kept, order kept, kind separates");
    assert.deepEqual(dedupeSkillsByName(rows, (r) => r.kind, (a, b) => a.n > b.n).map((r) => r.id), ["g5", "gr", "x"], "the better copy stands for the skill");
    assert.deepEqual(dedupeSkillsByName(rows).map((r) => r.id), ["g4", "x"], "no kind: names only");
  });

  test("output shape: { auto: true } or { auto: false, questionIds } and the hidden questionIds field", () => {
    assert.deepEqual(pickerOutput(true, ["a", "b"]), { auto: true });
    assert.deepEqual(pickerOutput(false, ["a", "b", "a", ""]), { auto: false, questionIds: ["a", "b"] });
    assert.equal(pickerOutput(false, Array.from({ length: 80 }, (_, i) => `q${i}`)).auto, false);
    const many = pickerOutput(false, Array.from({ length: 80 }, (_, i) => `q${i}`));
    assert.equal(!many.auto && many.questionIds.length, MAX_PICKED);
    assert.equal(questionIdsField(AUTO), "");
    assert.equal(questionIdsField({ auto: false, questionIds: ["a", "b"] }), '["a","b"]');
    // the server reads it back
    assert.equal(parseQuestionIdsField(""), null, "platform chooses");
    assert.equal(parseQuestionIdsField(null), null);
    assert.equal(parseQuestionIdsField("[]"), null);
    assert.equal(parseQuestionIdsField("{oops"), null);
    assert.deepEqual(parseQuestionIdsField('["a","b","a"]'), ["a", "b"]);
    assert.deepEqual(parseQuestionIdsField("a, b"), ["a", "b"]);
  });

  test("program: Curriculum by default, Grammar starts on Curriculum, the page's program otherwise", () => {
    assert.equal(defaultProgram(undefined), "CURRICULUM");
    assert.equal(defaultProgram("GRAMMAR"), "CURRICULUM");
    assert.equal(defaultProgram("map"), "MAP");
    assert.equal(defaultProgram("NAFS"), "NAFS");
    assert.equal(defaultProgram("RTI"), "RTI");
    assert.equal(programOf("nafs"), "NAFS");
    assert.equal(programOf("whatever"), "CURRICULUM");
    assert.equal(programOrNull("rti"), "RTI");
    assert.equal(programOrNull("GRAMMAR"), null, "the server stores only the four programs");
  });

  test("level filter, search, correct answer mark and the student preview", () => {
    const q = (id: string, level: string, stem: string, choices: string[] | null = ["cat", "dog"], answer: string | null = "B. dog"): PickerQuestion => ({ id, stem, choices, answer, level, type: "MULTIPLE_CHOICE", passageTitle: null });
    const list = [q("1", "BELOW", "Which pet barks?"), q("2", "ON", "Find the main idea."), q("3", "ABOVE", "Which word means happy?", ["glad", "sad"], "A. glad"), q("4", "ON", "Which detail?")];
    assert.deepEqual(filterQuestions(list, "ON", "").map((x) => x.id), ["2", "4"]);
    assert.deepEqual(filterQuestions(list, "ALL", "GLAD").map((x) => x.id), ["3"], "search reads choices too");
    assert.equal(isCorrectChoice("dog", "B. dog"), true);
    assert.equal(isCorrectChoice("cat", "B. dog"), false);
    assert.equal(isCorrectChoice("x", "A. y; C. x"), true);
    assert.equal(isCorrectChoice("dog", null), false);
    assert.deepEqual(previewQuestions(list, AUTO, 3).map((x) => x.id), ["2", "4", "1"], "platform's choice: On Level examples first");
    assert.deepEqual(previewQuestions(list, { auto: false, questionIds: ["3", "1", "zz"] }).map((x) => x.id), ["3", "1"], "the teacher's questions, in order");
  });

  test("every new interface string has an Arabic version; no grade tags left in the skill choosers", () => {
    const known = new Set<string>(UI_STRINGS);
    for (const s of ["Let the platform choose for each student (recommended)", "I'll pick the questions", "{n} selected", "Select all", "Preview as student", "Program", "Search the questions…"]) {
      assert.ok(known.has(s), s);
      assert.match(ar[s as keyof typeof ar], /[؀-ۿ]/, s);
    }
    for (const f of ["src/app/teacher/assessments/new/test-builder.tsx", "src/components/game/challenge-setup.tsx", "src/components/teacher/home-widgets.tsx", "src/app/teacher/assign-dialog.tsx"]) {
      const src = read(f);
      assert.doesNotMatch(src, /Any grade/, `${f}: no "Any grade" filter`);
      assert.doesNotMatch(src, /G\{k\.grade\}|Grade \{skill\.grade\}|\{ n: k\.grade \}|\{ n: x\.grade \}/, `${f}: no grade tag on a skill`);
    }
    assert.match(read("src/app/teacher/assign-dialog.tsx"), /SkillAssignSteps/);
    assert.match(read("src/app/teacher/skill-assign/page.tsx"), /SkillAssignSteps/);
    assert.match(read("src/components/skill-picker/index.ts"), /SkillQuestionPicker/);
  });
});

describe("🧩 skill picker: the server keeps the program and the teacher's questions", () => {
  let repo: SqliteRepo;
  let teacher: Actor;
  let classId: string, skillId: string, students: { id: string }[];
  before(async () => {
    ({ repo } = await demoDatabase());
    await publishGrade4Bank(repo);
    teacher = await resolveActor(repo, (await repo.findUnique("User", { username: "demo.teacher.4a" }))!);
    const view = (await teacherCurriculum(repo, teacher))!;
    classId = view.classId;
    students = view.students;
    for (const u of view.units) for (const k of u.skills) if (!skillId && (await questionsOfSkill(repo, teacher.schoolId!, k.id)).length >= 6) skillId = k.id;
    assert.ok(skillId, "a skill with questions");
  });

  test("assignSkill stores Program and the picked questions; the platform's choice stores none", async () => {
    const ids = (await questionsOfSkill(repo, teacher.schoolId!, skillId)).slice(0, 3).map((q) => q.id);
    const mine = await assignSkill(repo, teacher, { source: "CURRICULUM", classId, skillId, program: "NAFS", questionIds: [ids[1], ids[0], ids[1]] }, NOW);
    const row = (await repo.findUnique("Assignment", { id: mine.assignmentId }))!;
    assert.equal(row.program, "NAFS");
    const stored = typeof row.questionIds === "string" ? JSON.parse(row.questionIds) : row.questionIds;
    assert.deepEqual(stored, [ids[1], ids[0]], "order kept, duplicates dropped");
    const auto = await assignSkill(repo, teacher, { source: "CURRICULUM", classId, skillId, program: "CURRICULUM" }, NOW);
    const a = (await repo.findUnique("Assignment", { id: auto.assignmentId }))!;
    assert.equal(a.program, "CURRICULUM");
    assert.equal(a.questionIds ?? null, null, "the platform chooses");
    const old = await assignSkill(repo, teacher, { source: "CURRICULUM", classId, skillId }, NOW);
    assert.equal((await repo.findUnique("Assignment", { id: old.assignmentId }))!.program ?? null, null, "older callers: no program");
  });

  test("picked questions are checked: published, of this school, at most 50", async () => {
    const id = (await questionsOfSkill(repo, teacher.schoolId!, skillId))[0].id;
    assert.equal(await pickedQuestionIds(repo, teacher.schoolId, []), null);
    assert.deepEqual(await pickedQuestionIds(repo, teacher.schoolId, [id]), [id]);
    await assert.rejects(pickedQuestionIds(repo, teacher.schoolId, ["no-such-question"]), /published/);
    await assert.rejects(pickedQuestionIds(repo, "another-school", [id]), ForbiddenError);
    await assert.rejects(pickedQuestionIds(repo, teacher.schoolId, Array.from({ length: 51 }, (_, i) => `q${i}`)), /at most 50/);
  });

  test("Assign a skill page: picked questions only, and the program on every set", async () => {
    const pool = await questionsOfSkill(repo, teacher.schoolId!, skillId);
    const picked = pool.slice(0, 4).map((q) => q.id);
    const r = await assignSkillByLevel(repo, teacher, { source: "CURRICULUM", classId, skillId, mode: "AUTOMATIC", program: "MAP", questionIds: picked }, NOW);
    assert.equal(r.groups[0].questions, picked.length, "only the teacher's questions");
    assert.equal(r.groups[0].students, students.length);
    const a = (await repo.findMany("Assignment", { classId, program: "MAP" })).at(-1)!;
    const qs = await repo.findMany("AssessmentQuestion", { assessmentId: a.assessmentId });
    assert.deepEqual(qs.map((q) => String(q.questionId)).sort(), [...picked].sort());
  });

  test("Live Challenge: the teacher's questions per skill are kept with the setup (only for chosen skills)", async () => {
    const ids = (await questionsOfSkill(repo, teacher.schoolId!, skillId)).slice(0, 3).map((q) => q.id);
    const id = await saveChallengeTemplate(repo, teacher, { title: "Picked", spec: { skillIds: [skillId], mode: "quiz-race", count: 10, seconds: 20, levelMode: "SAME", picks: { [skillId]: [...ids, ids[0]], other: ["x"] } } });
    const tp = (await listChallengeTemplates(repo, teacher)).find((x) => x.id === id)!;
    assert.deepEqual(tp.spec.picks, { [skillId]: ids });
  });
});
