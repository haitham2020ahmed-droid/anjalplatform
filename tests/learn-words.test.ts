/**
 * 📗 Learn → Words — FAKE data only (in-memory demo school, fixture word cards): the word-file check (every word of
 * the grade's selections, the fields, 4 different options; scripts/learn/check-words.mts), the filter Grade → Unit →
 * Selection, words without an explanation (Grade 6) + a teacher's Write (private → admin approval → everyone),
 * "Practise these words" marked on the server, assigning a selection → My Work, the coverage count, the AI draft
 * sends no student data (and says when the AI is not set up), no level words.
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { demoDatabase, ROOT } from "./helpers/db";
import { resolveActor } from "../src/server/auth/actor";
import type { Actor } from "../src/server/auth/rbac";
import type { Repo } from "../src/server/seeding/repo";
import { checkWordCard, checkWordsFile, type ExpectedSelection, type WordCard } from "../src/lib/learn/format";
import { curriculumSelections, readWordFiles, selectionLabel, useLearnDir } from "../src/server/learn/files";
import { decideEdit, proposals, saveWordEdit } from "../src/server/learn/edits";
import { aiWordDraft, findSelection, practiceQuestions, selectionWords, studentWords, submitWordPractice, teacherWords, wordsCoverage } from "../src/server/learn/words";
import { assignLearn } from "../src/server/learn/teacher";
import { extraWorkItems } from "../src/server/student/all-work";

const NOW = new Date("2026-10-13T08:00:00Z");
const G4U1 = "4|1|1";

/** A fixture card (test data, not content). */
function card(word: string, i: number): WordCard {
  return { word, pos: "noun", meaning: "a short kid-friendly meaning for this test", example: `Our class talked about the ${word} today.`, arabic: "معنى تجريبي", synonyms: [], antonyms: [], family: [],
    check: { stem: `Which sentence uses ${word} correctly?`, options: [`Option A for ${word}`, `Option B for ${word}`, `Option C for ${word}`, `Option D for ${word}`], answer: i % 4 } };
}

describe("Learn → Words", () => {
  let repo: SqliteRepo;
  let dir = "";
  let schoolId = "";
  let admin: Actor, t4a: Actor, t4b: Actor, s1: Actor, other: Actor;
  let class4a = "";
  const sel = () => findSelection(G4U1)!;
  const actorFor = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);
  const studentActor = async (sid: string) => resolveActor(repo, (await repo.findUnique("User", { id: String((await repo.findUnique("Student", { id: sid }))!.userId) }))!);

  before(async () => {
    dir = mkdtempSync(join(tmpdir(), "learn-words-"));
    mkdirSync(join(dir, "lessons")); mkdirSync(join(dir, "words"));
    cpSync(join(ROOT, "data/learn/topics.json"), join(dir, "topics.json"));
    const s = curriculumSelections().find((x) => x.key === G4U1)!;
    // the first selection of Grade 4 explained; one card broken (it is skipped, the others are used)
    const words = s.vocabulary.map(card);
    words[1] = { ...words[1], meaning: "" };
    writeFileSync(join(dir, "words/G4.json"), JSON.stringify({ grade: 4, selections: [{ unit: 1, number: 1, selection: s.name, words }] }));
    useLearnDir(dir);
    ({ repo } = await demoDatabase());
    admin = await actorFor("demo.admin"); t4a = await actorFor("demo.teacher.4a"); t4b = await actorFor("demo.teacher.4b");
    schoolId = String(admin.schoolId);
    const classes = await repo.findMany("Class", { schoolId });
    class4a = String(classes.find((c) => c.name === "DEMO 4A")!.id);
    const class4b = String(classes.find((c) => c.name === "DEMO 4B")!.id);
    s1 = await studentActor(String((await repo.findMany("ClassMembership", { classId: class4a }))[0].studentId));
    other = await studentActor(String((await repo.findMany("ClassMembership", { classId: class4b }))[0].studentId));
  });
  after(() => { useLearnDir(null); rmSync(dir, { recursive: true, force: true }); });

  test("every Curriculum Map vocabulary word: Grade 4 = 136, Grade 5 = 144, Grade 6 = 118; labels Grade · Unit · Selection", () => {
    const sels = curriculumSelections();
    const count = (g: number) => sels.filter((x) => x.grade === g).reduce((n, x) => n + x.vocabulary.length, 0);
    assert.equal(count(4), 136);
    assert.equal(count(5), 144);
    assert.equal(count(6), 118, "Grade 6 words from the school booklets");
    assert.equal(selectionLabel(sel()), "Grade 4 · Unit 1 · A World of Change");
  });

  test("the word-file check: every word of every selection, the same order, the fields, 4 different options", () => {
    const s = sel();
    const exp: ExpectedSelection[] = [{ unit: 1, number: 1, name: s.name, vocabulary: s.vocabulary }];
    const good = { grade: 4, selections: [{ unit: 1, number: 1, selection: s.name, words: s.vocabulary.map(card) }] };
    assert.deepEqual(checkWordsFile(good, exp), []);
    const missing = structuredClone(good); missing.selections[0].words.pop();
    assert.match(checkWordsFile(missing, exp).join("|"), /missing unpredictable/);
    const order = structuredClone(good); order.selections[0].words.reverse();
    assert.match(checkWordsFile(order, exp).join("|"), /not in the file's order/);
    const same = structuredClone(good); same.selections[0].words[0].check.options[1] = same.selections[0].words[0].check.options[0];
    assert.match(checkWordsFile(same, exp).join("|"), /4 different options/);
    assert.ok(checkWordCard({ ...card("alter", 0), meaning: "to alter something" }, "x").some((p) => /uses the word itself/.test(p)));
    assert.ok(checkWordCard({ ...card("alter", 0), example: "Nothing here." }, "x").some((p) => /does not use the word/.test(p)));
    assert.ok(checkWordCard({ ...card("alter", 0), arabic: "change" }, "x").some((p) => /arabic/.test(p)));
    assert.ok(checkWordCard({ ...card("alter", 0), meaning: "a word for Level 2 readers" }, "x").some((p) => /level word/.test(p)), "no level words");
    // the CLI: ✓ / ✗ and exit 1
    const ok = spawnSync("npx", ["tsx", "scripts/learn/check-words.mts", join(dir, "words/G4.json")], { cwd: ROOT, encoding: "utf8" });
    assert.equal(ok.status, 1, "the fixture covers one selection only");
    assert.match(ok.stdout, /^✗ .*G4\.json\n {4}Unit 1 · A World of Change · collapse: meaning/m);
    assert.match(ok.stdout, /Unit 1 · Rivers & Lakes: selection missing|selection missing/);
  });

  test("the cards: a broken card is skipped; the filter Grade → Unit → Selection (a student's own grade first)", async () => {
    const files = readWordFiles();
    assert.equal(files.cards.size, 7);
    assert.equal(files.invalid.length, 1);
    const st = await studentWords(repo, s1, {});
    assert.equal(st.grade, 4, "the student's grade");
    assert.ok(st.units.includes(1) && st.view === null);
    const u = await studentWords(repo, s1, { grade: 5, unit: 2 });
    assert.equal(u.grade, 5);
    assert.ok(u.selections.length > 0 && u.selections.every((x) => x.unit === 2));
    const one = await studentWords(repo, s1, { sel: G4U1 });
    assert.equal(one.view!.words.length, 8);
    assert.deepEqual(one.view!.words.map((w) => w.source), ["FILE", "NONE", "FILE", "FILE", "FILE", "FILE", "FILE", "FILE"]);
    assert.equal(practiceQuestions(one.view!).length, 5);
    assert.ok(practiceQuestions(one.view!).every((q) => !("answer" in q)), "no answers sent with the questions");
  });

  test("words without an explanation: the dictionary's meaning, else “No explanation yet”; Write → private → approval → everyone", async () => {
    await repo.create("WordEntry", { schoolId, word: "collapse", meanings: [{ partOfSpeech: "verb", definition: "to fall down suddenly", example: null, synonyms: [], antonyms: [] }], source: "SCHOOL", isVocab: true, arabicGloss: "ينهار", updatedAt: NOW });
    let v = await selectionWords(repo, schoolId, sel(), []);
    const c = v.words.find((w) => w.word === "collapse")!;
    assert.equal(c.source, "DICTIONARY");
    assert.equal(c.partial!.arabic, "ينهار");
    // a Grade 6 selection with no word list in the school booklets — a teacher adds a word and writes its card
    const g6 = curriculumSelections().find((x) => x.grade === 6 && x.vocabulary.length === 0)!;
    const t = await teacherWords(repo, t4a, { sel: g6.key });
    assert.equal(t.view!.words.length, 0);
    const w = card("rival", 1);
    await saveWordEdit(repo, t4a, `${g6.key}|rival`, w, null, NOW);
    assert.equal((await teacherWords(repo, t4a, { sel: g6.key })).view!.words[0].source, "MINE");
    assert.equal((await teacherWords(repo, t4b, { sel: g6.key })).view!.words.length, 0, "another teacher does not see it yet");
    // an edit of a file card: their class sees it at once, other classes do not
    const edited = { ...card("alter", 0), meaning: "to change something a little" };
    await assert.rejects(saveWordEdit(repo, t4a, `${G4U1}|alter`, { ...edited, check: { ...edited.check, options: ["a", "a", "b", "c"] } }, null, NOW), /4 different options/);
    await saveWordEdit(repo, t4a, `${G4U1}|alter`, edited, card("alter", 0), NOW);
    const mine = (await studentWords(repo, s1, { sel: G4U1 })).view!.words.find((x) => x.word === "alter")!;
    const theirs = (await studentWords(repo, other, { sel: G4U1 })).view!.words.find((x) => x.word === "alter")!;
    assert.deepEqual([mine.source, mine.card!.meaning], ["TEACHER", "to change something a little"]);
    assert.equal(theirs.source, "FILE");
    // the admin approves both: the school's version for everyone
    for (const p of await proposals(repo, admin)) await decideEdit(repo, admin, p.id, true, null, NOW);
    assert.equal((await studentWords(repo, other, { sel: G4U1 })).view!.words.find((x) => x.word === "alter")!.source, "SCHOOL");
    v = await selectionWords(repo, schoolId, g6, []);
    assert.deepEqual(v.words.map((x) => [x.word, x.source]), [["rival", "SCHOOL"]]);
    const cov = await wordsCoverage(repo, schoolId);
    assert.equal(cov.byGrade.find((g) => g.grade === 6)!.explained, 1);
    // the file's 136 + the school's own vocabulary rows of a selection the file has no list for (Sadie’s Game)
    assert.ok(cov.byGrade.find((g) => g.grade === 4)!.total >= 136);
    assert.equal(cov.byGrade.find((g) => g.grade === 4)!.explained, 7, "7 fixture cards (alter: now the school's)");
  });

  test("assign a selection's words → My Work (once); Practise these words marked on the server → Done", async () => {
    const sid = String(s1.studentId);
    const a = await assignLearn(repo, t4a, { kind: "WORDS", ref: G4U1, title: selectionLabel(sel()), classId: class4a, target: "CLASS" }, NOW);
    assert.ok(a.students >= 1);
    let rows = (await extraWorkItems(repo, s1, NOW)).filter((r) => r.kind === "LEARN");
    assert.equal(rows.length, 1);
    assert.equal(rows[0].href, `/student/words?sel=${encodeURIComponent(G4U1)}`);
    assert.equal(rows[0].skill, "Words — Grade 4 · Unit 1 · A World of Change");
    const v = (await studentWords(repo, s1, { sel: G4U1 })).view!;
    const qs = practiceQuestions(v);
    const picks = qs.map((q, i) => ({ word: q.word, choice: i < 3 ? v.words.find((w) => w.word === q.word)!.card!.check.answer : 9 }));
    const r = await submitWordPractice(repo, s1, G4U1, picks, NOW);
    assert.deepEqual([r.score, r.total], [3, 5]);
    rows = (await extraWorkItems(repo, s1, NOW)).filter((x) => x.kind === "LEARN");
    assert.equal(rows[0].status, "Done");
    const p = (await repo.findMany("LearnProgress", { studentId: sid, kind: "WORDS", ref: G4U1 }))[0];
    assert.equal(Number(p.score), 3);
  });

  test("✨ AI draft: only the word and the selection's topic; says when the AI is not set up", async () => {
    const r = await aiWordDraft(repo, t4a, G4U1, "hazard", {});
    assert.equal(r.ok, false);
    assert.match(read("src/server/learn/words.ts"), /const user = \{ task: "Write the vocabulary card", word: w, selection: sel\.name, topic:/);
    await assert.rejects(aiWordDraft(repo, s1, G4U1, "hazard", {}), /Teachers and admins only/);
  });

  test("the Words section reads ONE selection per request (bounded)", async () => {
    const c = counting(repo);
    await teacherWords(c.repo, t4a, { sel: G4U1 });
    const first = c.calls();
    await teacherWords(c.repo, t4a, { sel: G4U1 });
    const second = c.calls() - first;
    assert.ok(second <= 4, `${second} database calls for one selection`);
  });
});

const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
function counting(repo: Repo): { repo: Repo; calls: () => number } {
  let n = 0;
  const r = new Proxy(repo, { get(target, prop, recv) { const v = Reflect.get(target, prop, recv); return typeof v === "function" ? (...a: unknown[]) => { n++; return (v as (...x: unknown[]) => unknown).apply(target, a); } : v; } });
  return { repo: r as Repo, calls: () => n };
}
