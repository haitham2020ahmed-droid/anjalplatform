/**
 * 👯 Exact duplicate questions: the fingerprint, finding the groups (skill families, Concept Vocabulary, revisions),
 * the copy that is kept, moving every reference (unique keys respected, JSON id lists), the delete with its audit
 * entry, the command-line tool, the importer's indexed duplicate check and the editor's “already exists”.
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import type { Actor } from "../src/server/auth/rbac";
import type { Row } from "../src/server/seeding/repo";
import { contentHashOf, normalizeText, backfillContentHashes, hashQuestions } from "../src/server/questions/dedupe-hash";
import { applyDuplicateGroups, chooseKeeper, findDuplicates, planBatches, removedCsv, rewriteIds, runDedupe, JSON_REFS, KEYED_REFS, SIMPLE_REFS } from "../src/server/questions/dedupe";
import { schoolSkillIndex } from "../src/server/questions/skill-questions";
import { createDraft, duplicateOfInput, getQuestion, reviseQuestion, type EditorInput } from "../src/server/admin/questions";
import { analyzeImport, commitImportChunk, getImportJob } from "../src/server/admin/question-import";
import { TEMPLATE_HEADERS } from "../src/imports/questions/template";
import { flagList } from "../src/server/teacher/classroom";
import { parseSchema } from "../scripts/db/schema-ddl";
import { demoDatabase, ROOT } from "./helpers/db";
import { join } from "node:path";

const s = (v: unknown) => String(v ?? "");
const base = { type: "MULTIPLE_CHOICE", stem: "What is the main idea?", passage: null, options: [{ text: "Dogs", correct: true }, { text: "Cats", correct: false }, { text: "Birds", correct: false }], answers: [], content: {} };

describe("👯 the fingerprint (pure)", () => {
  test("case, spaces, end punctuation and curly quotes do not matter; choice order does not matter", () => {
    const h = contentHashOf(base);
    assert.equal(contentHashOf({ ...base, stem: "  WHAT is   the main idea " }), h);
    assert.equal(contentHashOf({ ...base, stem: "What is the main idea" }), h);
    assert.equal(contentHashOf({ ...base, options: [...base.options].reverse() }), h);
    assert.equal(contentHashOf({ ...base, options: [{ text: "dogs.", correct: true }, { text: "CATS", correct: false }, { text: "Birds", correct: false }] }), h);
    assert.equal(normalizeText("“Hello,” she said’s…  "), "\"hello,\" she said's");
  });
  test("another key, type, choice, passage or picture is another question", () => {
    const h = contentHashOf(base);
    assert.notEqual(contentHashOf({ ...base, options: [{ text: "Dogs", correct: false }, { text: "Cats", correct: true }, { text: "Birds", correct: false }] }), h);
    assert.notEqual(contentHashOf({ ...base, type: "DROPDOWN" }), h);
    assert.notEqual(contentHashOf({ ...base, options: [...base.options, { text: "Fish", correct: false }] }), h);
    assert.notEqual(contentHashOf({ ...base, passage: "A story about dogs." }), h);
    assert.notEqual(contentHashOf({ ...base, image: "img1" }), h);
    assert.equal(contentHashOf({ ...base, passage: "A story  about DOGS" }), contentHashOf({ ...base, passage: "a story about dogs." }));
  });
  test("choices that only differ in capital letters keep them (two different keys never look the same)", () => {
    const q = (k: number) => ({ ...base, stem: "Which sentence uses capital letters correctly?", options: [{ text: "Sam went to Paris.", correct: k === 0 }, { text: "sam went to paris.", correct: k === 1 }] });
    assert.notEqual(contentHashOf(q(0)), contentHashOf(q(1)));
  });
  test("the copy to keep: published first, then the most answers, then the oldest", () => {
    const m = (id: string, status: string, attempts: number, createdAt: string) => ({ id, status, attempts, createdAt });
    assert.equal(chooseKeeper([m("a", "DRAFT", 50, "2020"), m("b", "PUBLISHED", 0, "2026"), m("c", "PUBLISHED", 0, "2025")]).id, "c");
    assert.equal(chooseKeeper([m("a", "DRAFT", 1, "2020"), m("b", "DRAFT", 5, "2026")]).id, "b");
    assert.equal(chooseKeeper([m("a", "PUBLISHED", 9, "2026"), m("b", "PUBLISHED", 2, "2020")]).id, "a");
  });
  test("JSON id lists: ids replaced, repeats kept once, object keys moved", () => {
    const map = new Map([["d1", "k1"], ["d2", "k1"]]);
    assert.deepEqual(rewriteIds(["k1", "d1", "x", "d2"], map), { value: ["k1", "x"], changed: true });
    assert.deepEqual(rewriteIds({ d1: "VOCABULARY", y: "OTHER" }, map), { value: { k1: "VOCABULARY", y: "OTHER" }, changed: true });
    assert.deepEqual(rewriteIds([{ questionId: "d2", correct: true }], map), { value: [{ questionId: "k1", correct: true }], changed: true });
    assert.equal(rewriteIds(["a", "b"], map).changed, false);
  });
  test("every table with a question id column is handled (or deleted with the question)", () => {
    const schema = parseSchema(join(ROOT, "prisma/schema.prisma"));
    const handled = new Set([...SIMPLE_REFS.map(([t, c]) => `${t}.${c}`), ...KEYED_REFS.map((r) => `${r.table}.questionId`), ...JSON_REFS.map(([t, c]) => `${t}.${c}`),
      // the question's own parts, deleted with it
      "QuestionOption.questionId", "QuestionAnswer.questionId", "QuestionExplanation.questionId"]);
    const missing: string[] = [];
    for (const m of schema.models.values()) for (const f of m.fields) {
      if (m.name === "Question") continue;
      if (/^(questionId|currentQuestionId|hintQuestionId|nextQuestionId|servedQuestionId|duplicateOfId|questionIds)$/.test(f.name) && !handled.has(`${m.name}.${f.name}`)) missing.push(`${m.name}.${f.name}`);
    }
    assert.deepEqual(missing, []);
  });
});

describe("👯 finding and removing duplicates (database)", () => {
  let repo: SqliteRepo;
  let admin: Actor;
  let schoolId: string;
  let g4: string, g5: string, other: string, cv4: string, cv5: string;
  let typeId: string;
  let n = 0;
  const mk = async (skillId: string, stem: string, o: { status?: string; createdAt?: string; key?: number; options?: string[]; tags?: unknown } = {}): Promise<string> => {
    const at = new Date(o.createdAt ?? `2026-0${1 + (n % 8)}-01T00:00:00Z`);
    const q = await repo.create("Question", { externalRef: `DUP-${n++}`, skillId, typeId, stem, content: {}, difficultyLevel: 4, irtB: 0, status: o.status ?? "PUBLISHED", origin: "TEACHER_AUTHORED", createdAt: at, updatedAt: at, ...(o.tags ? { tags: o.tags } : {}) });
    for (const [i, text] of (o.options ?? ["Dogs", "Cats", "Birds", "Fish"]).entries()) await repo.create("QuestionOption", { questionId: q.id, label: "ABCD"[i], text, isCorrect: i === (o.key ?? 0), rationale: i === (o.key ?? 0) ? null : "No.", order: i });
    await repo.create("QuestionExplanation", { questionId: q.id, kind: "WHY_CORRECT", body: [{ type: "text", text: "Because." }], order: 0 });
    return s(q.id);
  };

  before(async () => {
    ({ repo } = await demoDatabase());
    admin = await resolveActor(repo, (await repo.findUnique("User", { username: "demo.admin" }))!);
    schoolId = s(admin.schoolId);
    typeId = s((await repo.findUnique("QuestionType", { code: "MULTIPLE_CHOICE" }))?.id ?? (await repo.create("QuestionType", { code: "MULTIPLE_CHOICE", name: "multiple choice", isAutoScored: true })).id);
    const idx = await schoolSkillIndex(repo, schoolId);
    // one skill family present in grades 4 and 5, another family, and grade-bound Concept Vocabulary skills
    const fam = [...idx.members.values()].find((ids) => !ids.some((id) => idx.keyOf.get(id)!.startsWith("solo:")) && new Set(ids.map((id) => idx.gradeOf.get(id))).size > 1)!;
    g4 = fam.find((id) => idx.gradeOf.get(id) === 4) ?? fam[0];
    g5 = fam.find((id) => idx.gradeOf.get(id) !== idx.gradeOf.get(g4))!;
    other = [...idx.ids].find((id) => idx.keyOf.get(id) !== idx.keyOf.get(g4) && !idx.keyOf.get(id)!.startsWith("solo:"))!;
    const skillRow = async (id: string) => (await repo.findUnique("Skill", { id }))!;
    const cv = async (from: string, code: string) => { const r = await skillRow(from); const { id: _drop, ...rest } = r; void _drop; return s((await repo.create("Skill", { ...rest, code, name: "Concept Vocabulary: Text Set 1" })).id); };
    cv4 = await cv(g4, `G4.cv-dup-test`); cv5 = await cv(g5, `G5.cv-dup-test`);
  });

  let A: string, B: string, C: string, D: string, E: string, V4: string, V5: string, R: string, S1: string, S2: string;
  test("find: same family (any grade) = duplicates; other family and similar = review only; Concept Vocabulary and open revisions never", async () => {
    const stem = "Which detail best supports the main idea of the duplicate test passage?";
    A = await mk(g4, stem, { createdAt: "2026-03-01T00:00:00Z" });                                 // published, newer
    B = await mk(g4, `  ${stem.toUpperCase()}  `, { status: "DRAFT", createdAt: "2025-01-01T00:00:00Z" }); // older draft
    C = await mk(g4, stem.replace(/\?$/, ""), { status: "ARCHIVED" });                                // archived copy
    D = await mk(g5, stem, { status: "UNDER_REVIEW" });                                              // same family, grade 5
    E = await mk(other, stem);                                                                       // another family: review only
    V4 = await mk(cv4, "What does the word harbor mean in the text set?");
    V5 = await mk(cv5, "What does the word harbor mean in the text set?");                           // Concept Vocabulary: not a duplicate
    R = await mk(g4, stem, { status: "DRAFT", tags: { revisionOf: A } });                            // an open revision of A
    S1 = await mk(g4, "Which word is a noun in the duplicate test sentence?");
    S2 = await mk(g4, "Which word is a noun in the duplicate test sentence?", { key: 2 });           // another key: similar only
    const plan = await findDuplicates(repo, schoolId);
    assert.ok(plan.refreshed >= 10, "fingerprints were filled while scanning");
    const mine = plan.groups.filter((g) => [g.keep.id, ...g.remove.map((r) => r.id)].some((id) => [A, B, C, D, E, V4, V5, R, S1, S2].includes(id)));
    assert.equal(mine.length, 1);
    assert.equal(mine[0].keep.id, A, "the published copy is kept");
    assert.deepEqual(mine[0].remove.map((r) => r.id).sort(), [B, C, D].sort());
    const other_ = plan.review.find((r) => r.reason === "OTHER_FAMILY" && r.questions.some((q) => q.id === E));
    assert.ok(other_, "the copy under another skill family is listed for review");
    assert.ok(plan.review.some((r) => r.reason === "SIMILAR" && r.questions.some((q) => q.id === S1) && r.questions.some((q) => q.id === S2)), "same words, another key: similar");
    assert.ok(!plan.review.some((r) => r.questions.some((q) => q.id === V4)), "Concept Vocabulary of other grades is not even listed");
    assert.ok(plan.bySkill.length > 0 && plan.toRemove >= 3);
  });

  test("apply: every reference moves to the kept copy (unique keys merged), then the copies and their parts are deleted", async () => {
    const st = (await repo.findMany("Student", {}))[0];
    const st2 = (await repo.findMany("Student", {}))[1];
    const sess = await repo.create("PracticeSession", { studentId: st.id, skillId: g4, mode: "ADAPTIVE_PRACTICE", startedAt: new Date(), currentQuestionId: B });
    const att = (q: string) => repo.create("QuestionAttempt", { studentId: st.id, sessionId: sess.id, questionId: q, skillId: g4, response: "A", isCorrect: true, responseMs: 4000, difficultyB: 0, createdAt: new Date() });
    await att(B); await att(B); await att(D); await att(A);
    await repo.create("AdaptiveDecisionLog", { sessionId: sess.id, studentId: st.id, questionId: B, nextQuestionId: D, reasonCode: "TEST", reason: "test", createdAt: new Date() }).catch(() => null);
    const asm = await repo.create("Assessment", { title: "Dup test", type: "TEACHER_QUIZ" });
    await repo.create("AssessmentQuestion", { assessmentId: asm.id, questionId: A, order: 1 });
    await repo.create("AssessmentQuestion", { assessmentId: asm.id, questionId: B, order: 2 });   // both in one assessment: merged
    const asm2 = await repo.create("Assessment", { title: "Dup test 2", type: "TEACHER_QUIZ" });
    await repo.create("AssessmentQuestion", { assessmentId: asm2.id, questionId: C, order: 1 });  // only the copy: moved
    await repo.create("QuestionUse", { questionId: A, use: "PLACEMENT" });
    await repo.create("QuestionUse", { questionId: B, use: "PLACEMENT" });
    await repo.create("QuestionUse", { questionId: B, use: "MAP_TEST" });
    await repo.create("QuestionFlag", { schoolId, questionId: A, studentId: st.id, reason: "UNCLEAR", status: "OPEN", createdAt: new Date() });
    await repo.create("QuestionFlag", { schoolId, questionId: B, studentId: st.id, reason: "TYPO", status: "OPEN", createdAt: new Date() });
    await repo.create("QuestionFlag", { schoolId, questionId: D, studentId: st2.id, reason: "TYPO", status: "OPEN", createdAt: new Date() });
    await repo.create("QuestionStats", { questionId: A, attempts: 10, correct: 5 });
    await repo.create("QuestionStats", { questionId: B, attempts: 30, correct: 15 });
    await repo.create("SecondChanceAnswer", { studentId: st.id, questionId: D, correct: false, createdAt: new Date() });
    const klass = (await repo.findMany("Class", {}))[0];
    const teacher = (await repo.findMany("Teacher", {}))[0];
    const asg = await repo.create("Assignment", { classId: klass.id, createdById: teacher.id, title: "Picked", target: "SKILL", questionIds: [A, B, "other-id", D] });
    const plan = await findDuplicates(repo, schoolId);
    const batches = planBatches(plan.groups, 4);
    assert.ok(batches.every((b) => b.flat().length <= 4 || b.length === 1));
    const auditsBefore = await repo.count("AuditLog", { action: "question.dedupe" });
    let removed = 0, moved = 0;
    const rows: { removedId: string }[] = [];
    for (const b of batches) { const r = await applyDuplicateGroups(repo, { schoolId, actorId: admin.userId }, b); removed += r.removed; moved += r.movedAnswers; rows.push(...r.rows); }
    assert.ok(removed >= 3);
    assert.equal(moved, 3, "the three answers on the copies moved");
    for (const id of [B, C, D]) {
      assert.equal(await repo.findUnique("Question", { id }), null, `${id} deleted`);
      assert.equal(await repo.count("QuestionOption", { questionId: id }), 0);
      assert.equal(await repo.count("QuestionExplanation", { questionId: id }), 0);
    }
    for (const id of [A, E, V4, V5, R, S1, S2]) assert.ok(await repo.findUnique("Question", { id }), `${id} kept`);
    assert.equal(await repo.count("QuestionAttempt", { questionId: A }), 4, "student answers are on the kept copy");
    assert.equal((await repo.findUnique("PracticeSession", { id: sess.id }))!.currentQuestionId, A);
    assert.deepEqual((await repo.findMany("AssessmentQuestion", { assessmentId: asm.id })).map((r) => r.questionId), [A], "one row per assessment");
    assert.deepEqual((await repo.findMany("AssessmentQuestion", { assessmentId: asm2.id })).map((r) => r.questionId), [A]);
    assert.deepEqual((await repo.findMany("QuestionUse", { questionId: A })).map((u) => u.use).sort(), ["MAP_TEST", "PLACEMENT"]);
    assert.equal(await repo.count("QuestionFlag", { questionId: A }), 2, "one flag per student (unique key), the other student's flag moved");
    const stats = (await repo.findUnique("QuestionStats", { questionId: A }))!;
    assert.deepEqual([stats.attempts, stats.correct, stats.pValue], [40, 20, 0.5], "statistics added up");
    assert.equal(await repo.count("SecondChanceAnswer", { questionId: A }), 1);
    assert.deepEqual((await repo.findUnique("Assignment", { id: asg.id }))!.questionIds, [A, "other-id"], "the chosen questions point at the kept copy, once");
    assert.ok(await repo.count("AuditLog", { action: "question.dedupe" }) > auditsBefore, "an audit entry per batch");
    assert.match(removedCsv(rows as never), /Removed question/);
    // a second run finds nothing more
    const again = await findDuplicates(repo, schoolId);
    assert.ok(!again.groups.some((g) => [g.keep.id, ...g.remove.map((r) => r.id)].includes(A)));
  });

  test("apply re-checks everything: other schools' questions, non-duplicates and wrong keepers are ignored", async () => {
    const x = await mk(g4, "A question that is only once in the bank for the recheck test?");
    const r = await applyDuplicateGroups(repo, { schoolId, actorId: null }, [[x, S1], [E, A]]);
    assert.equal(r.removed, 0, "not the same fingerprint / not the same family");
    assert.ok(await repo.findUnique("Question", { id: x }));
    const r2 = await applyDuplicateGroups(repo, { schoolId: "another-school", actorId: null }, [[A, E]]);
    assert.equal(r2.removed, 0);
  });

  test("the command-line tool: dry run by default, --apply removes", async () => {
    const one = await mk(g5, "Command line test: which sentence is a fact?");
    const two = await mk(g4, "Command line test: which sentence is a fact", { status: "DRAFT" });
    const lines: string[] = [];
    const dry = await runDedupe(repo, ["--school", schoolId], (l) => lines.push(l));
    assert.equal(dry.removed, 0);
    assert.ok(await repo.findUnique("Question", { id: two }), "dry run writes nothing");
    assert.match(lines.join("\n"), /Dry run/);
    const done = await runDedupe(repo, ["--apply", "--school", schoolId], () => undefined);
    assert.ok(done.removed >= 1);
    assert.equal(await repo.findUnique("Question", { id: two }), null);
    assert.ok(await repo.findUnique("Question", { id: one }), "the published copy stays");
  });

  test("fingerprints: set on create, filled in batches for old rows; open revisions share their original's", async () => {
    const input: EditorInput = { skillId: g4, type: "MULTIPLE_CHOICE", stem: "Editor test: which animal can fly?", level: 4, whyCorrect: "Birds fly.", options: [{ label: "A", text: "Bird", correct: true, rationale: null }, { label: "B", text: "Dog", correct: false, rationale: "No." }] };
    const id = await createDraft(repo, admin, input);
    const q = (await repo.findUnique("Question", { id }))!;
    assert.match(s(q.contentHash), /^[0-9a-f]{64}$/);
    assert.equal((await hashQuestions(repo, [id]))[0].hash, q.contentHash, "the hash from the editor = the hash from the stored rows");
    await repo.updateMany("Question", { id }, { contentHash: null });
    assert.ok(await backfillContentHashes(repo) >= 1);
    assert.equal((await repo.findUnique("Question", { id }))!.contentHash, q.contentHash);
    // the editor says “already exists” (same family, any grade), but not for the question itself
    const dup = await duplicateOfInput(repo, admin, { ...input, skillId: g5, stem: "editor test: Which animal can fly" });
    assert.equal(dup?.id, id);
    assert.equal(await duplicateOfInput(repo, admin, input, id), null, "itself is not a duplicate");
    assert.equal(await duplicateOfInput(repo, admin, { ...input, skillId: other }), null, "another skill family is another question");
    // a revision keeps the original's fingerprint and is never removed as its duplicate
    const p = await mk(g4, "Revision test: what is the setting?");
    await backfillContentHashes(repo);
    const rev = await reviseQuestion(repo, admin, p);
    assert.equal((await repo.findUnique("Question", { id: rev }))!.contentHash, (await repo.findUnique("Question", { id: p }))!.contentHash);
    const plan = await findDuplicates(repo, schoolId);
    assert.ok(!plan.groups.some((g) => [g.keep.id, ...g.remove.map((r) => r.id)].includes(rev)));
    assert.ok((await getQuestion(repo, admin, rev)).revisionOf === p);
  });

  test("the importer skips bank duplicates with an indexed lookup and says “Skipped N duplicate questions”", async () => {
    const stem = "Importer test: which word means very small?";
    const existing = await mk(g4, stem, { options: ["tiny", "huge", "loud", "fast"] });
    await repo.updateMany("Question", { id: existing }, { contentHash: null }); // saved before fingerprints: filled by the import
    const skill = (await repo.findUnique("Skill", { id: g4 }))! as Row;
    const grade = (await schoolSkillIndex(repo, schoolId)).gradeOf.get(g4)!;
    const row = (text: string, opts: string[]) => TEMPLATE_HEADERS.map((h) => ({ "Question Text": text, "Question Type": "Multiple Choice", "Option A": opts[0], "Option B": opts[1], "Option C": opts[2], "Option D": opts[3], "Correct Answer": "A", Explanation: "Because.", Grade: String(grade), Skill: s(skill.name), "Difficulty Level": "4" } as Record<string, string>)[h] ?? "");
    const table = [[...TEMPLATE_HEADERS], row(stem.toUpperCase(), ["tiny", "huge", "loud", "fast"]), row("Importer test: a brand new question?", ["one", "two", "three", "four"])];
    const jobId = await analyzeImport(repo, admin, { fileName: "dups.xlsx", bytes: new TextEncoder().encode("dups"), table });
    const job = await getImportJob(repo, admin, jobId);
    assert.deepEqual(job.rows.map((r) => r.status), ["DUPLICATE", "VALID"], JSON.stringify(job.rows.map((r) => [r.errors, r.warnings])));
    assert.equal(job.rows[0].duplicate?.id, existing);
    let last;
    do last = await commitImportChunk(repo, admin, jobId); while (!last.done);
    assert.deepEqual([last.counts.imported, last.counts.duplicatesSkipped], [1, 1]);
    const done = await getImportJob(repo, admin, jobId);
    assert.equal(done.summary?.duplicatesSkipped, 1);
    // a second import of the same file: the new question is now in the bank too
    const again = await analyzeImport(repo, admin, { fileName: "dups2.xlsx", bytes: new TextEncoder().encode("dups2"), table });
    assert.deepEqual((await getImportJob(repo, admin, again)).rows.map((r) => r.status), ["DUPLICATE", "DUPLICATE"]);
    const imported = await repo.findUnique("Question", { id: done.rows[1].questionId! });
    assert.match(s(imported?.contentHash), /^[0-9a-f]{64}$/, "imported questions get their fingerprint");
  });

  test("staff flags reach Flagged Questions", async () => {
    const { flagQuestionsForReview } = await import("../src/server/admin/questions-list");
    await flagQuestionsForReview(repo, admin, [A], "Check the key");
    const rows = await flagList(repo, admin, "OPEN");
    assert.ok(rows.find((r) => r.questionId === A)?.notes.some((n) => /Check the key/.test(n)));
  });
});
