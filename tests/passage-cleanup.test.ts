import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import type { Actor } from "../src/server/auth/rbac";
import { seedTestEnvironment } from "../src/server/seeding/test-env";
import { createDraft } from "../src/server/admin/questions";
import { assignQuestions, teacherRoster } from "../src/server/teacher/assign";
import { restoreQuestions } from "../src/server/admin/question-cleanup";
import { asksAboutStoryContent, backupSubset, executePassageCleanup, findMissingPassageQuestions, UNCHANGED_TABLES, verifyIntegrity } from "../src/server/admin/passage-cleanup";
import { needsPassage, passageReference } from "../src/lib/passage-detect";
import { demoDatabase } from "./helpers/db";

describe("automatic removal of questions with missing passages", () => {
  let repo: SqliteRepo;
  let admin: Actor, teacher: Actor, student: Actor;
  const ids = {} as Record<"missing" | "answered" | "inSet" | "grammar" | "withText" | "sentence" | "story" | "concept", string>;
  before(async () => {
    ({ repo } = await demoDatabase());
    await seedTestEnvironment(repo, { root: process.cwd(), passwordHash: "x".repeat(60), practice: "none" });
    const a = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);
    [admin, teacher, student] = await Promise.all(["test.admin", "test.teacher.1", "test.student.005"].map(a));
    const g4 = (await repo.findMany("Grade", { schoolId: admin.schoolId, level: 4 }))[0];
    const cur = (await repo.findMany("Curriculum", { gradeId: g4.id }))[0];
    const skills = await repo.findMany("Skill", { curriculumId: cur.id, deletedAt: null });
    const reading = skills.find((k) => k.domain === "READING")!;
    const readingQ = skills.find((k) => k.domain === "READING" && ["LITERATURE", "INFORMATIONAL", "COMPREHENSION"].includes(String(k.category)))!;
    const grammar = skills.find((k) => k.domain === "GRAMMAR")!;
    const mc = (stem: string, skillId: string, extra: Record<string, unknown> = {}) => createDraft(repo, admin, {
      skillId, type: "MULTIPLE_CHOICE", stem, level: 3, whyCorrect: "Because.",
      options: [{ label: "A", text: "First", correct: true, rationale: null }, { label: "B", text: "Second", correct: false, rationale: "Not supported." }, { label: "C", text: "Third", correct: false, rationale: "Not supported." }], ...extra,
    } as never);
    ids.missing = await mc("According to the passage, why did Sam leave the farm?", String(reading.id));
    ids.answered = await mc("Which detail from the text shows that Mia was brave?", String(reading.id));
    ids.inSet = await mc("What does the author mean by “a sea of faces” in paragraph 3?", String(reading.id));
    ids.grammar = await mc("According to the passage, which word is the helping verb?", String(grammar.id));
    ids.withText = await mc("According to the passage, why did Sam leave the farm?", String(reading.id), { passageText: "Sam lived on a farm. One day he left to find work in the city." });
    ids.sentence = await mc("Read the sentence. Which word is the main verb?", String(reading.id));
    // no “passage” wording, but it asks about a story that is not there → removed
    ids.story = await mc("Why did Sam leave the farm at the end?", String(readingQ.id));
    // a concept question about reading: answerable without any text → kept
    ids.concept = await mc("A flashback tells about events that happened before the main story.", String(readingQ.id));
    await repo.updateMany("Question", { id: { in: Object.values(ids) } }, { status: "PUBLISHED" });
    // a student answered one of them
    const s = await repo.create("PracticeSession", { studentId: student.studentId!, mode: "ADAPTIVE_PRACTICE", startedAt: new Date() });
    await repo.create("QuestionAttempt", { sessionId: s.id, studentId: student.studentId!, questionId: ids.answered, skillId: reading.id, response: { value: "A" }, isCorrect: true, responseMs: 5000, usedHint: false, rapidGuess: false, difficultyB: 0, createdAt: new Date() });
    // a teacher put one in an assigned set
    const roster = await teacherRoster(repo, teacher);
    await assignQuestions(repo, teacher, { classId: roster[0]!.id, questionIds: [ids.inSet] });
  });

  test("story-content questions are recognised; concept questions are not", () => {
    for (const t of ["Why did Sam leave the farm?", "How does the grandmother feel at the end?", "Why did she go back to the river?", "What is the main idea of “Nature's Engineers”?", "How is the last paragraph organized?", "What reason does the author give for this idea?", "Which solutions does the article describe?"]) assert.ok(asksAboutStoryContent(t), t);
    for (const t of ["A flashback tells about events that happened before the main story.", "Which sentence is written in FIRST person?", "Which signal words show compare and contrast?", "A good summary includes your own opinion about the text.", "An author’s perspective can be found in the words the author chooses.", "An article claims: “Our town should build bike lanes.” Which reason would be the WEAKEST support?"]) assert.equal(asksAboutStoryContent(t), false, t);
  });

  test("the detection matches the examples and leaves self-contained questions alone", () => {
    for (const t of ["According to the passage, what happened?", "According to the text, why…", "In paragraph 2, what does…", "What does the author mean by…", "Which detail from the text supports…", "Based on the reading, which…"] as const) assert.ok(needsPassage(t), t);
    for (const t of ["Read the sentence. Which word is a verb?", "Choose the correct spelling.", "Which word means the same as happy?", "Complete the sentence with the past tense."] as const) assert.equal(needsPassage(t), false, t);
    assert.equal(passageReference("Based on the reading, which is true?"), "Based on the reading");
  });

  test("flags exactly the right questions, with the right action and a full log row", async () => {
    const f = new Map((await findMissingPassageQuestions(repo)).map((x) => [x.id, x]));
    assert.equal(f.get(ids.missing)?.action, "DELETE");
    assert.equal(f.get(ids.answered)?.action, "ARCHIVE", "answered → archived, history kept");
    assert.equal(f.get(ids.inSet)?.action, "KEEP_IN_ASSIGNMENT", "in a teacher's assignment → kept");
    for (const k of ["grammar", "withText", "sentence", "concept"] as const) assert.ok(!f.has(ids[k]), `${k} is not flagged`);
    assert.equal(f.get(ids.story)?.action, "DELETE", "a story question without the story is removed");
    assert.match(f.get(ids.story)!.reason, /Reading question about a story/);
    const row = f.get(ids.missing)!;
    assert.equal(row.grade, 4);
    assert.ok(row.skill.length > 0 && row.text.startsWith("According to the passage"));
    assert.match(row.reason, /No passage\/text attached.*According to the passage/);
  });

  test("backup → delete/archive → integrity OK; curriculum and users unchanged; restore brings them back", async () => {
    const counts = async () => Object.fromEntries(await Promise.all(UNCHANGED_TABLES.map(async (t) => [t, await repo.count(t, {})])));
    const before = await counts();
    const total = await repo.count("Question", {});
    const flagged = await findMissingPassageQuestions(repo);
    const toDelete = flagged.filter((x) => x.action === "DELETE").map((x) => x.id);
    const backup = await backupSubset(repo, toDelete);
    assert.equal(backup.tables.Question.length, toDelete.length);
    assert.ok(backup.tables.QuestionOption.length >= toDelete.length * 2, "options are in the backup");
    const r = await executePassageCleanup(repo, flagged);
    assert.ok(r.integrity.ok, r.integrity.problems.join("; "));
    assert.deepEqual(await counts(), before, "grades, units, skills, standards, curriculum, users untouched");
    assert.equal(r.remaining, total - toDelete.length);
    assert.equal(await repo.findUnique("Question", { id: ids.missing }), null, "deleted");
    assert.equal((await repo.findUnique("Question", { id: ids.answered }))!.status, "ARCHIVED");
    assert.equal(await repo.count("QuestionAttempt", { questionId: ids.answered }), 1, "the student's answer is kept");
    assert.equal((await repo.findUnique("Question", { id: ids.inSet }))!.status, "PUBLISHED", "the assigned question is untouched");
    for (const k of ["grammar", "withText", "sentence"] as const) assert.equal((await repo.findUnique("Question", { id: ids[k] }))!.status, "PUBLISHED");
    assert.equal(await repo.count("QuestionOption", { questionId: ids.missing }), 0, "no orphan options");
    // a second run finds nothing more to do
    assert.equal((await findMissingPassageQuestions(repo)).filter((x) => x.action === "DELETE").length, 0);
    // restore
    await restoreQuestions(repo, JSON.parse(JSON.stringify(backup)));
    assert.ok(await repo.findUnique("Question", { id: ids.missing }), "restored");
    assert.equal(await repo.count("QuestionOption", { questionId: ids.missing }), 3);
    assert.ok((await verifyIntegrity(repo)).problems.every((p) => /still active/.test(p)), "restored rows are consistent");
  });
});
