/**
 * 🔁 Duplicate-answer scanner (src/server/admin/option-duplicates.ts): finds a published MULTIPLE_CHOICE / DROPDOWN /
 * MULTI_SELECT question whose options repeat the same words under two different letters — a copy-paste slip — and
 * flags the dangerous kind: one of the matching options is marked correct and the other isn't, so a student who
 * picks the "wrong-lettered" twin of the right answer is marked wrong while seeing an identical-looking "correct
 * answer" right after. Admin-only, school-scoped. No test file referenced this module before this one (audit
 * finding, Oct 2026, P2 #9: "27 admin areas with no dedicated test" — a closer look found only 3 genuinely
 * untested; this is one of them).
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import { ForbiddenError, type Actor } from "../src/server/auth/rbac";
import { duplicateOptionQuestions } from "../src/server/admin/option-duplicates";
import { demoDatabase } from "./helpers/db";

const s = (v: unknown) => String(v ?? "");

describe("🔁 duplicate-answer scanner", () => {
  let repo: SqliteRepo;
  let admin: Actor;
  let schoolId: string;
  let skillId: string;
  let typeId: string;
  let dropdownTypeId: string;
  let n = 0;

  const mk = async (opts: { label: string; text: string; correct: boolean }[], o: { status?: string; typeId?: string } = {}): Promise<string> => {
    const q = await repo.create("Question", {
      externalRef: `DUPOPT-${n++}`, skillId, typeId: o.typeId ?? typeId, stem: `Duplicate-answer test question ${n}`,
      content: {}, difficultyLevel: 4, irtB: 0, status: o.status ?? "PUBLISHED", origin: "TEACHER_AUTHORED", createdAt: new Date(), updatedAt: new Date(),
    });
    for (const [i, o2] of opts.entries()) await repo.create("QuestionOption", { questionId: q.id, label: o2.label, text: o2.text, isCorrect: o2.correct, rationale: o2.correct ? null : "No.", order: i });
    return s(q.id);
  };

  before(async () => {
    ({ repo } = await demoDatabase());
    admin = await resolveActor(repo, (await repo.findUnique("User", { username: "demo.admin" }))!);
    schoolId = s(admin.schoolId);
    const g = (await repo.findMany("Grade", { schoolId }))[0];
    const cur = (await repo.findMany("Curriculum", { gradeId: g.id }))[0];
    skillId = s((await repo.findMany("Skill", { curriculumId: cur.id, deletedAt: null }))[0].id);
    typeId = s((await repo.findUnique("QuestionType", { code: "MULTIPLE_CHOICE" }))?.id ?? (await repo.create("QuestionType", { code: "MULTIPLE_CHOICE", name: "multiple choice", isAutoScored: true })).id);
    dropdownTypeId = s((await repo.findUnique("QuestionType", { code: "DROPDOWN" }))?.id ?? (await repo.create("QuestionType", { code: "DROPDOWN", name: "dropdown", isAutoScored: true })).id);
  });

  test("only an admin permission (questions:read) may run the scan", async () => {
    const student: Actor = { userId: "x", role: "STUDENT", schoolId };
    await assert.rejects(() => duplicateOptionQuestions(repo, student), ForbiddenError);
  });

  test("a risky duplicate: the right answer's wrong-lettered twin is marked incorrect", async () => {
    const id = await mk([
      { label: "A", text: "Paris", correct: true },
      { label: "B", text: "paris.", correct: false }, // same word, different case/punctuation, marked wrong
      { label: "C", text: "London", correct: false },
      { label: "D", text: "Berlin", correct: false },
    ]);
    const { rows, checked } = await duplicateOptionQuestions(repo, admin);
    assert.ok(checked >= 1);
    const row = rows.find((r) => r.questionId === id)!;
    assert.ok(row, "the question with mixed-correctness duplicates is reported");
    assert.equal(row.risky, true);
    assert.equal(row.groups.length, 1);
    assert.deepEqual(row.groups[0].labels.sort(), ["A", "B"]);
    assert.equal(row.groups[0].mixedCorrectness, true);
  });

  test("a harmless duplicate: both copies of the repeated text share the same correctness", async () => {
    const id = await mk([
      { label: "A", text: "Cats", correct: false },
      { label: "B", text: "CATS", correct: false }, // repeated, but both wrong — not dangerous
      { label: "C", text: "Dogs", correct: true },
    ]);
    const { rows } = await duplicateOptionQuestions(repo, admin);
    const row = rows.find((r) => r.questionId === id)!;
    assert.ok(row, "still reported, since the text repeats");
    assert.equal(row.risky, false);
    assert.equal(row.groups[0].mixedCorrectness, false);
  });

  test("no repeated option text: not reported at all", async () => {
    const id = await mk([
      { label: "A", text: "Red", correct: true },
      { label: "B", text: "Blue", correct: false },
      { label: "C", text: "Green", correct: false },
    ]);
    const { rows } = await duplicateOptionQuestions(repo, admin);
    assert.ok(!rows.some((r) => r.questionId === id));
  });

  test("an unpublished (DRAFT) duplicate question is not scanned", async () => {
    const id = await mk([
      { label: "A", text: "Same", correct: true },
      { label: "B", text: "same", correct: false },
    ], { status: "DRAFT" });
    const { rows } = await duplicateOptionQuestions(repo, admin);
    assert.ok(!rows.some((r) => r.questionId === id), "drafts are not shown to students, so they are skipped");
  });

  test("DROPDOWN questions are scanned the same way as MULTIPLE_CHOICE", async () => {
    const id = await mk([
      { label: "A", text: "Twelve", correct: true },
      { label: "B", text: "twelve", correct: false },
      { label: "C", text: "Thirteen", correct: false },
    ], { typeId: dropdownTypeId });
    const { rows } = await duplicateOptionQuestions(repo, admin);
    const row = rows.find((r) => r.questionId === id)!;
    assert.ok(row);
    assert.equal(row.risky, true);
  });

  test("risky questions sort before safe ones, then by grade", async () => {
    const { rows } = await duplicateOptionQuestions(repo, admin);
    const firstSafeIndex = rows.findIndex((r) => !r.risky);
    const lastRiskyIndex = rows.map((r) => r.risky).lastIndexOf(true);
    if (firstSafeIndex !== -1 && lastRiskyIndex !== -1) assert.ok(lastRiskyIndex < firstSafeIndex, "every risky row comes before every safe row");
  });
});
