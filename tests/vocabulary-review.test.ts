/**
 * Vocabulary learning (FAKE test data only — the Test School): spaced word review (1, 3, 7, 21, 60 days, 10 a day),
 * in-context and example / non-example review items, the word journal and the teacher's read-only view, the
 * dictionary's Arabic meaning + context sentence (school-scoped, CSV import) and the context clue coach.
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import { ForbiddenError, type Actor } from "../src/server/auth/rbac";
import { ValidationError } from "../src/server/curriculum-admin";
import { seedTestEnvironment } from "../src/server/seeding/test-env";
import { readableClasses } from "../src/server/teacher/coordinators";
import { lookupWord, saveDefinition, type Fetcher } from "../src/server/student/words";
import { buildReviewItem, dueList, exampleItem, firstReview, meaningItem, nextWordReview, REVIEW_STEPS, type PoolWord, type ReviewWord } from "../src/server/vocabulary/review";
import { addJournalWord, classJournal, clueCoach, importWordsCsv, parseCsv, rankClueTypes, reviewToday, saveWordExtras, starWord, submitWordReview, unitWords } from "../src/server/vocabulary/service";
import { demoDatabase } from "./helpers/db";

const DAY = 86_400_000;
const ADJ = ["generous", "brave", "calm", "eager", "honest", "gentle", "clever", "curious"];
const NOUN = ["river", "mountain", "forest", "desert"];
const POS: Record<string, string> = Object.fromEntries([...ADJ.map((w) => [w, "adjective"]), ...NOUN.map((w) => [w, "noun"])]);
const fake: Fetcher = async (url) => {
  const w = decodeURIComponent(url.split("/").pop()!);
  return { ok: true, status: 200, json: async () => [{ word: w, meanings: [{ partOfSpeech: POS[w] ?? "verb", definitions: [{ definition: `Original meaning of ${w}.` }] }] }] };
};

describe("Vocabulary review", () => {
  let repo: SqliteRepo; let admin: Actor; let teacher: Actor; let other: Actor | null = null; let me: Actor;
  let classId = ""; let studentId = "";
  const now = new Date(Date.UTC(2026, 9, 14, 9));
  const actorFor = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);
  const studentActor = async (id: string) => resolveActor(repo, (await repo.findUnique("User", { id: (await repo.findUnique("Student", { id }))!.userId }))!);

  before(async () => {
    ({ repo } = await demoDatabase());
    await seedTestEnvironment(repo, { root: process.cwd(), passwordHash: "x".repeat(60), practice: "none" });
    admin = await actorFor("test.admin");
    for (const i of [1, 2, 3, 4, 5, 6]) {
      const t = await actorFor(`test.teacher.${i}`);
      const c = (await readableClasses(repo, t))[0];
      if (!c) continue;
      const g = Number((await repo.findUnique("Grade", { id: c.gradeId }))!.level);
      if (g === 4 && !classId) { teacher = t; classId = String(c.id); }
    }
    for (const i of [1, 2, 3, 4, 5, 6]) { const t = await actorFor(`test.teacher.${i}`); if (!(await readableClasses(repo, t)).some((c) => c.id === classId)) { other = t; break; } }
    studentId = String((await repo.findMany("ClassMembership", { classId, leftAt: null }))[0].studentId);
    me = await studentActor(studentId);
  });

  test("steps 1, 3, 7, 21, 60 days: right → next step, wrong → step 1 (tomorrow)", () => {
    assert.deepEqual([...REVIEW_STEPS], [1, 3, 7, 21, 60]);
    const f = firstReview(now);
    assert.equal(f.reviewStep, 0); assert.equal(f.nextReviewAt.getTime(), now.getTime() + DAY);
    let step = 0; const days: number[] = [];
    for (let i = 0; i < 5; i++) { const n = nextWordReview(step, true, now); days.push((n.nextReviewAt.getTime() - now.getTime()) / DAY); step = n.reviewStep; }
    assert.deepEqual(days, [3, 7, 21, 60, 60]);
    const w = nextWordReview(3, false, now);
    assert.equal(w.reviewStep, 0); assert.equal(w.nextReviewAt.getTime(), now.getTime() + DAY);
  });

  test("due list: due today only, never-scheduled first, at most 10 a day minus those already reviewed", () => {
    const words = Array.from({ length: 14 }, (_, i) => ({ word: `w${String(i).padStart(2, "0")}`, nextReviewAt: i === 13 ? null : new Date(now.getTime() + (i < 12 ? -i * DAY : 3 * DAY)) }));
    const d = dueList(words, 0, now);
    assert.equal(d.length, 10);
    assert.equal(d[0].word, "w13", "never scheduled comes first");
    assert.ok(!d.some((x) => x.word === "w12"), "not due yet");
    assert.equal(dueList(words, 7, now).length, 3);
    assert.equal(dueList(words, 12, now).length, 0);
  });

  const rw = (o: Partial<ReviewWord> & { word: string }): ReviewWord => ({ partOfSpeech: "adjective", definition: `def of ${o.word}`, sentence: null, example: null, nonExample: null, reviewStep: 0, ...o });
  const pool: PoolWord[] = [...ADJ.map((w) => ({ word: w, partOfSpeech: "adjective", definition: `def of ${w}`, sentence: `A ${w} sentence here.` })), ...NOUN.map((w) => ({ word: w, partOfSpeech: "noun", definition: `def of ${w}` }))];

  test("in-context item: sentence + 4 meanings, distractors of the same part of speech, answer once", () => {
    const it = meaningItem(rw({ word: "generous", sentence: "Lina was generous and gave half her lunch to a friend." }), pool, "seed")!;
    assert.equal(it.kind, "CONTEXT");
    assert.match(it.sentence!, /generous/);
    assert.equal(it.choices.length, 4);
    assert.equal(it.choices.filter((c) => c === it.answer).length, 1);
    assert.equal(new Set(it.choices).size, 4);
    for (const c of it.choices.filter((c) => c !== it.answer)) assert.ok(ADJ.some((w) => c === `def of ${w}`), `same part of speech: ${c}`);
    const noSentence = meaningItem(rw({ word: "river", partOfSpeech: "noun", definition: "def of river" }), pool, "s")!;
    assert.equal(noSentence.kind, "MEANING");
    assert.equal(noSentence.choices.length, 4, "fills from other parts of speech when needed");
    assert.equal(meaningItem(rw({ word: "x" }), pool.slice(0, 2), "s"), null, "too few words for 4 choices");
  });

  test("example / non-example item", () => {
    const w = rw({ word: "generous", example: "He shared his toys with everyone.", nonExample: "He kept all the sweets for himself.", reviewStep: 1 });
    const it = exampleItem(w, pool, "s")!;
    assert.equal(it.kind, "EXAMPLE");
    assert.match(it.prompt, /example of “generous”/);
    assert.ok(it.choices.includes(w.nonExample!) && it.choices.filter((c) => c === w.example).length === 1);
    assert.equal(buildReviewItem(w, pool, "s")!.kind, "EXAMPLE", "odd steps ask example / non-example");
    assert.equal(buildReviewItem({ ...w, reviewStep: 2 }, pool, "s")!.kind, "MEANING");
    assert.equal(exampleItem({ ...w, nonExample: null }, pool, "s"), null);
  });

  test("looked-up words are scheduled; daily review session builds items, caps at 10 and moves steps", async () => {
    for (const w of [...ADJ, ...NOUN]) await lookupWord(repo, me, w, now, fake);
    const sw = await repo.findUnique("StudentWord", { studentId, word: "brave" });
    assert.equal(new Date(String(sw!.nextReviewAt instanceof Date ? sw!.nextReviewAt.toISOString() : sw!.nextReviewAt)).getTime(), now.getTime() + DAY);
    assert.equal((await reviewToday(repo, me, now)).items.length, 0, "nothing due on the day it was added");
    await saveWordExtras(repo, teacher, "brave", { contextSentence: "The brave firefighter ran into the smoke to help.", arabicGloss: "شجاع" });
    const t1 = new Date(now.getTime() + DAY);
    const r = await reviewToday(repo, me, t1);
    assert.equal(r.dueTotal, 12); assert.equal(r.items.length, 10);
    const brave = r.items.find((i) => i.word === "brave") ?? null;
    if (brave) { assert.equal(brave.kind, "CONTEXT"); assert.match(brave.sentence!, /brave firefighter/); }
    const [a, b, c] = r.items;
    const res = await submitWordReview(repo, me, { [a.word]: a.answer, [b.word]: b.answer, [c.word]: "wrong answer" }, t1);
    assert.equal(res.total, 3); assert.equal(res.correct, 2);
    const ra = await repo.findUnique("StudentWord", { studentId, word: a.word });
    assert.equal(Number(ra!.reviewStep), 1); assert.equal(Number(ra!.quizRight), 1);
    const rc = await repo.findUnique("StudentWord", { studentId, word: c.word });
    assert.equal(Number(rc!.reviewStep), 0); assert.equal(Number(rc!.quizWrong), 1);
    assert.equal(res.results.find((x) => x.word === c.word)!.nextReviewAt, new Date(t1.getTime() + DAY).toISOString());
    const again = await reviewToday(repo, me, new Date(t1.getTime() + 3_600_000));
    assert.equal(again.reviewedToday, 3); assert.equal(again.items.length, 7, "10 a day in all");
    assert.ok(!again.items.some((i) => [a.word, b.word, c.word].includes(i.word)));
    // a word not in today's list is ignored
    assert.equal((await submitWordReview(repo, me, { [a.word]: a.answer }, new Date(t1.getTime() + 3_600_000))).total, 0);
  });

  test("word journal: my sentence + not an example → example item; teacher reads the class journal only", async () => {
    await assert.rejects(addJournalWord(repo, me, { word: "generous", myExample: "I like cats." }, now, fake), ValidationError);
    await addJournalWord(repo, me, { word: "Generous", myExample: "My uncle is generous because he helps every neighbour.", notExample: "He never shares anything with anyone." }, now, fake);
    const row = await repo.findUnique("StudentWord", { studentId, word: "generous" });
    assert.match(String(row!.myExample), /uncle/);
    await repo.updateMany("StudentWord", { studentId, word: "generous" }, { reviewStep: 1, nextReviewAt: now, lastQuizAt: null });
    await repo.updateMany("StudentWord", { studentId }, { lastQuizAt: null });
    const it = (await reviewToday(repo, me, now)).items.find((i) => i.word === "generous")!;
    assert.equal(it.kind, "EXAMPLE");
    assert.equal(it.answer, "My uncle is generous because he helps every neighbour.");
    // a new word from the journal joins the notebook and the review
    await addJournalWord(repo, me, { word: "kind", myExample: "It was kind of her to carry my bag." }, now, fake);
    assert.ok(await repo.findUnique("StudentWord", { studentId, word: "kind" }));
    const j = await classJournal(repo, teacher, classId);
    assert.ok(j.some((e) => e.word === "generous" && e.studentId === studentId && e.notExample));
    assert.ok(j.every((e) => e.myExample));
    if (other) await assert.rejects(classJournal(repo, other, classId), ForbiddenError);
    await assert.rejects(classJournal(repo, me, classId), ForbiddenError);
  });

  test("school non-example: the review uses the school's sentence as the example", async () => {
    await saveDefinition(repo, teacher, "calm", { partOfSpeech: "adjective", definition: "Quiet and not worried.", nonExample: "She screamed and ran around the room." }, now);
    await saveWordExtras(repo, teacher, "calm", { contextSentence: "The lake was calm, with no waves at all." });
    await repo.updateMany("StudentWord", { studentId, word: "calm" }, { reviewStep: 1, nextReviewAt: now, lastQuizAt: null });
    const it = (await reviewToday(repo, me, now)).items.find((i) => i.word === "calm")!;
    assert.equal(it.kind, "EXAMPLE");
    assert.equal(it.answer, "The lake was calm, with no waves at all.");
    assert.ok(it.choices.includes("She screamed and ran around the room."));
  });

  test("dictionary: Arabic meaning + context sentence are school-scoped; CSV import", async () => {
    const otherSchool = (await repo.findMany("School", {})).find((x) => x.id !== admin.schoolId)!;
    await repo.create("WordEntry", { schoolId: otherSchool.id, word: "eager", meanings: [], source: "NONE", isVocab: false, updatedAt: now });
    await saveWordExtras(repo, admin, "eager", { arabicGloss: "متحمس", contextSentence: "The eager pupils raised their hands before the teacher finished." });
    assert.equal((await repo.findUnique("WordEntry", { schoolId: admin.schoolId, word: "eager" }))!.arabicGloss, "متحمس");
    assert.equal((await repo.findUnique("WordEntry", { schoolId: otherSchool.id, word: "eager" }))!.arabicGloss ?? null, null);
    await assert.rejects(saveWordExtras(repo, me, "eager", { arabicGloss: "x" }), ForbiddenError);
    await assert.rejects(saveWordExtras(repo, admin, "eager", { contextSentence: "This sentence does not use it." }), ValidationError);
    assert.deepEqual(parseCsv('word,definition\n"a, b","say ""hi"""\n\n'), [["word", "definition"], ["a, b", 'say "hi"']]);
    const r = await importWordsCsv(repo, teacher, 'word,definition,contextSentence,arabicGloss\nharvest,"Gathering crops, when they are ripe.",The family will harvest the dates in autumn.,حصاد\ntwo words,x,,\nhonest,,,صادق\n', now);
    assert.equal(r.saved, 2); assert.equal(r.errors.length, 1);
    const h = await repo.findUnique("WordEntry", { schoolId: admin.schoolId, word: "harvest" });
    assert.equal(h!.source, "SCHOOL"); assert.equal(h!.arabicGloss, "حصاد");
    const honest = await repo.findUnique("WordEntry", { schoolId: admin.schoolId, word: "honest" });
    assert.equal(honest!.arabicGloss, "صادق"); assert.equal(honest!.source, "API", "an empty definition keeps the dictionary's");
    await assert.rejects(importWordsCsv(repo, me, "a,b"), ForbiddenError);
  });

  test("unit words: a student stars a word of their grade's lists", async () => {
    const units = await unitWords(repo, me);
    const w = units.flatMap((u) => u.words).find((x) => !x.inNotebook);
    if (w) {
      await starWord(repo, me, w.word, now, fake);
      const sw = await repo.findUnique("StudentWord", { studentId, word: w.word });
      assert.ok(sw && sw.nextReviewAt);
    }
    await assert.rejects(starWord(repo, me, "zzzqx", now, fake), ValidationError);
  });

  test("clue coach: picks the clue type the student misses most", async () => {
    const st = await repo.findUnique("Student", { id: studentId });
    const cur = await repo.findMany("Curriculum", { gradeId: st!.gradeId });
    const skills = await repo.findMany("Skill", { curriculumId: { in: cur.map((c) => c.id) } });
    const qs = (await repo.findMany("Question", { skillId: { in: skills.map((k) => k.id) }, status: "PUBLISHED" })).slice(0, 9);
    assert.ok(qs.length >= 9);
    await repo.updateMany("Question", { id: { in: qs.map((q) => q.id) } }, { tags: {} });
    const syn = qs.slice(0, 3), ant = qs.slice(3, 6), cause = qs.slice(6, 9);
    for (const [g, t] of [[syn, "SYNONYM"], [ant, "ANTONYM"], [cause, "CAUSE_EFFECT"]] as const) await repo.updateMany("Question", { id: { in: g.map((q) => q.id) } }, { tags: { clueType: t } });
    const sess = await repo.create("PracticeSession", { studentId, skillId: syn[0].skillId, mode: "ADAPTIVE_PRACTICE", startedAt: now });
    const ans = async (q: Record<string, unknown>, ok: boolean) => repo.create("QuestionAttempt", { sessionId: sess.id, studentId, questionId: q.id, skillId: q.skillId, response: {}, isCorrect: ok, responseMs: 20_000, rapidGuess: false, difficultyB: 0, createdAt: now });
    for (const q of syn) await ans(q, true);
    for (const q of ant) await ans(q, false);
    for (const q of cause) await ans(q, true);
    await ans(cause[0], false);
    const c = await clueCoach(repo, me);
    assert.equal(c.focus!.type, "ANTONYM");
    assert.equal(c.focus!.accuracy, 0);
    assert.ok(c.questionIds.length > 0 && c.questionIds.every((id) => ant.some((q) => q.id === id)));
    assert.ok(c.practiceSkillId);
    // rotation: once antonyms improve, the next weakest type comes up
    for (let i = 0; i < 6; i++) for (const q of ant) await ans(q, true);
    assert.equal((await clueCoach(repo, me)).focus!.type, "CAUSE_EFFECT");
    // an untried type ranks between a weak and a strong one
    const ranked = rankClueTypes([{ type: "SYNONYM", label: "", right: 5, total: 5, accuracy: 100, questions: 1 }, { type: "EXAMPLE", label: "", right: 0, total: 0, accuracy: null, questions: 1 }, { type: "ANTONYM", label: "", right: 0, total: 4, accuracy: 0, questions: 1 }]);
    assert.deepEqual(ranked.map((x) => x.type), ["ANTONYM", "EXAMPLE", "SYNONYM"]);
  });
});
