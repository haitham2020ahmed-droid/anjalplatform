/**
 * 🇸🇦 The NAFS CENTER (owner-approved plan; fictional demo school only, in-memory database):
 *  A. the center collects questions from ALL grades through the NAFS links (no grade filter, never a grade shown),
 *     each with a difficulty (Easy / Medium / Hard: its own, statistics, or its level); the practice sets load like
 *     the booklets (idempotent; an invalid file skipped and reported; admin pack + background ensure)
 *  B. Tool 1 adaptive practice: starts Medium, harder after right / easier after wrong, stops at mastery or the count,
 *     never repeats, writes ONLY the NAFS tables (the platform's attempts / mastery / levels unchanged); the teacher's
 *     results per student and skill. Tool 2 test builder: the difficulty mix is respected; standards as targets
 *  C. teacher tabs in order + the Home summary
 *  D. the student NAFS icon only for Grade 6 students; NAFS tests left My Tests
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { copyFileSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import { ForbiddenError, type Actor } from "../src/server/auth/rbac";
import { ValidationError } from "../src/server/curriculum-admin";
import { teacherRoster } from "../src/server/teacher/assign";
import { navItemsFor } from "../src/components/nav-items";
import { difficultyOfLevel, difficultyOfStats, ensureNafsFramework } from "../src/server/nafs/framework";
import { nafsBankChanged, nafsBankPage, nafsIndex, saveNafsQuestion, type NafsEntry } from "../src/server/nafs/bank";
import { bookletChoices, buildNafsAutomatic, buildNafsSimulation, cleanDifficultyMix, difficultyQuota } from "../src/server/nafs/build";
import { nafsClasses } from "../src/server/nafs/tests";
import { ensureNafsPracticeSets, loadNafsPracticeSets, readPracticeSets, usePracticeDir } from "../src/server/nafs/practice-sets";
import { afterAnswer, answerNafsPractice, createNafsPractice, isMastered, listNafsPractice, myNafsPractice, nafsPracticeReport, nafsPracticeView, newRunState, pickNext, type RunState } from "../src/server/nafs/practice";
import { CENTER_TABS, nafsHomeSummary } from "../src/server/nafs/center";
import { packOf, runPackChunk } from "../src/server/questions/load-packs";
import { studentMenuFlags } from "../src/server/student/menu-flags";
import { studentHome } from "../src/server/student/student-home";
import { UI_STRINGS } from "../src/i18n/en";
import { ar } from "../src/i18n/ar";
import { demoDatabase } from "./helpers/db";

const ROOT = process.cwd();
const read = (f: string) => readFileSync(join(ROOT, f), "utf8");
const hasAr = (x: string) => (UI_STRINGS as readonly string[]).includes(x) && Boolean((ar as Record<string, string>)[x]);
const s = (v: unknown) => String(v ?? "");
const LEVEL_WORDS = ["Below", "Approaching", "Meeting", "Exceeding", "Tier", "Mastered", "Developing", "Needs support"];
/** The platform's own attempt / mastery / level tables: NAFS practice must never write them. */
const PLATFORM_TABLES = ["QuestionAttempt", "PracticeSession", "StudentSkillMastery", "StudentAbility", "AbilitySnapshot", "StudentLevel", "StudentLevelState", "StudentCategoryLevel", "QuestionLevelChange", "AssignmentStudent"];

let repo: SqliteRepo;
let g6: Actor, other: Actor, admin: Actor, student: Actor, classmate: Actor, g4student: Actor;
let klassId = "";
let lowGradeQ = "", hardQ = "", statsQ = "", grammarQ = "";
const near: Record<1 | 2 | 3, string[]> = { 1: [], 2: [], 3: [] };

async function mcq(skillId: string, stem: string, level: number, correct = 1): Promise<string> {
  const type = await repo.findUnique("QuestionType", { code: "MULTIPLE_CHOICE" });
  const q = await repo.create("Question", { skillId, passageId: null, typeId: type!.id, stem, content: {}, difficultyLevel: level, irtB: 0, status: "PUBLISHED", origin: "DEMO" });
  await repo.createMany("QuestionOption", ["Alpha", "Bravo", "Charlie", "Delta"].map((t, i) => ({ questionId: q.id, label: "ABCD"[i], text: `${t} ${stem.slice(0, 14)}`, isCorrect: i === correct, order: i })));
  return s(q.id);
}
const counts = async () => Object.fromEntries(await Promise.all(PLATFORM_TABLES.map(async (m) => [m, await repo.count(m, {})] as const)));

before(async () => {
  ({ repo } = await demoDatabase());
  const as = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);
  admin = await as("demo.admin");
  const teachers = await Promise.all((await repo.findMany("User", { role: "TEACHER" })).map((u) => resolveActor(repo, u)));
  const grades = await Promise.all(teachers.map(async (a) => (await teacherRoster(repo, a)).map((c) => c.grade)));
  other = teachers[grades.findIndex((g) => g.length > 0 && !g.includes(6))];
  let i = grades.findIndex((g) => g.includes(6));
  if (i < 0) {
    i = teachers.findIndex((a) => a !== other);
    const g = (await repo.findMany("Grade", { schoolId: admin.schoolId, level: 6 }))[0];
    const k = (await repo.findMany("Class", { gradeId: g.id, deletedAt: null }))[0];
    await repo.create("ClassTeacher", { classId: k.id, teacherId: (await repo.findUnique("Teacher", { userId: teachers[i].userId }))!.id });
  }
  g6 = teachers[i];
  const klass = (await nafsClasses(repo, g6))[0];
  klassId = klass.id;
  const stu = async (id: string) => resolveActor(repo, (await repo.findUnique("User", { id: (await repo.findUnique("Student", { id }))!.userId }))!);
  student = await stu(klass.students[0].id);
  classmate = await stu(klass.students[1].id);
  const g4 = (await repo.findMany("Grade", { schoolId: admin.schoolId, level: 4 }))[0];
  const k4 = (await repo.findMany("Class", { gradeId: g4.id, deletedAt: null }))[0];
  g4student = await stu(s((await repo.findMany("ClassMembership", { classId: k4.id, leftAt: null }))[0].studentId));

  // platform questions on skills of OTHER grades whose family is linked to a NAFS skill (Grade 4 and Grade 6)
  await ensureNafsFramework(repo);
  const links = await repo.findMany("NafsSkillFamily", {});
  const fams = await repo.findMany("SkillFamily", {});
  const synFam = fams.find((f) => /synonyms/i.test(s(f.name)))!;
  assert.ok(links.some((l) => l.familyId === synFam.id), "Synonyms is linked to NAFS");
  const skillOfGrade = async (level: number, familyId: string) => {
    const g = (await repo.findMany("Grade", { schoolId: admin.schoolId, level }))[0];
    const curs = await repo.findMany("Curriculum", { gradeId: g.id });
    return s((await repo.findMany("Skill", { curriculumId: { in: curs.map((c) => c.id) }, familyId }))[0]?.id);
  };
  const syn4 = await skillOfGrade(4, s(synFam.id)), syn6 = await skillOfGrade(6, s(synFam.id));
  assert.ok(syn4 && syn6, "Grade 4 and Grade 6 Synonyms skills");
  lowGradeQ = await mcq(syn4, "Grade four synonym question?", 2);
  hardQ = await mcq(syn6, "Grade six hard synonym question?", 6);
  statsQ = await mcq(syn6, "A level-six question most students get right?", 6);
  await repo.create("QuestionStats", { questionId: statsQ, attempts: 40, correct: 36, pValue: 0.9, updatedAt: new Date() });
  const grammar = (await repo.findMany("Skill", {})).find((k) => fams.find((f) => f.id === k.familyId)?.category === "GRAMMAR");
  grammarQ = await mcq(s(grammar!.id), "Which verb agrees with the subject here?", 4);
  // the school's own NAFS questions for "near-synonyms": 4 Easy, 4 Medium, 4 Hard (for the adaptive practice)
  for (const d of [1, 2, 3] as const) for (let k = 0; k < 4; k++) {
    near[d].push((await saveNafsQuestion(repo, g6, { nafsCode: "NAFS.V.NEAR", difficulty: d, stem: `Near-synonym question level ${d} number ${k + 1}?`, options: [`look ${d}${k}`, `stare ${d}${k}`, `glance ${d}${k}`, `peek ${d}${k}`], correct: 1 })).id);
  }
});

describe("A. what goes into the center", () => {
  test("questions from ALL grades by the NAFS links (no grade filter, no grade shown); grammar without a link stays out", async () => {
    nafsBankChanged(repo, admin.schoolId!);
    const idx = await nafsIndex(repo, admin.schoolId!);
    const ids = new Set(idx.map((e) => e.id));
    assert.ok(ids.has(lowGradeQ), "a Grade 4 question of a linked skill is in the center");
    assert.ok(ids.has(hardQ), "a Grade 6 question too");
    assert.ok(!ids.has(grammarQ), "no NAFS link → not in the center");
    for (const e of idx.slice(0, 50)) assert.ok(!("grade" in e) && !("gradeLevel" in e), "entries carry no grade");
    // the bank page shows no grade either
    const page = await nafsBankPage(repo, g6, { code: "NAFS.V.SYNANT" });
    assert.ok(page.rows.some((r) => r.id === lowGradeQ));
    assert.ok(!/grade/i.test(Object.keys(page.rows[0]).join(",")));
  });

  test("difficulty labels: own (teacher / sets) → statistics (enough answers) → authoring level", async () => {
    assert.deepEqual([difficultyOfLevel(1), difficultyOfLevel(3), difficultyOfLevel(4), difficultyOfLevel(5), difficultyOfLevel(7)], [1, 1, 2, 3, 3]);
    assert.equal(difficultyOfStats(40, 0.9), 1); assert.equal(difficultyOfStats(40, 0.3), 3); assert.equal(difficultyOfStats(40, 0.6), 2);
    assert.equal(difficultyOfStats(10, 0.9), null, "too few answers: not used");
    const idx = new Map((await nafsIndex(repo, admin.schoolId!)).map((e) => [e.id, e]));
    assert.equal(idx.get(lowGradeQ)!.difficulty, 1, "level 2 → Easy");
    assert.equal(idx.get(hardQ)!.difficulty, 3, "level 6 → Hard");
    assert.equal(idx.get(statsQ)!.difficulty, 1, "90% right in 40 answers → Easy (statistics win)");
    for (const d of [1, 2, 3] as const) for (const id of near[d]) assert.equal(idx.get(id)!.difficulty, d, "the teacher's difficulty");
    assert.equal((await repo.findUnique("Question", { id: near[3][0] }))!.difficultyLevel, 6, "Hard written as authoring level 6");
    const easy = await nafsBankPage(repo, g6, { code: "NAFS.V.NEAR", difficulty: 1 });
    assert.deepEqual(easy.rows.map((r) => r.difficulty), [1, 1, 1, 1]);
    for (const w of ["Easy", "Medium", "Hard", "Difficulty", "Mixed"]) assert.ok(hasAr(w), w);
  });

  describe("practice sets (data/nafs/practice/NP-*.json)", () => {
    let dir = "";
    before(() => {
      dir = mkdtempSync(join(tmpdir(), "nafs-practice-"));
      for (const f of ["NP-901.json", "NP-902.json"]) copyFileSync(join(ROOT, "tests", "fixtures", "nafs-practice", f), join(dir, f));
      writeFileSync(join(dir, "NP-999.json"), JSON.stringify({ code: "NP-999", title: "Broken", kind: "POEM", passage: "Too short.", questions: [{ n: 1, standard: "MOE.S02", nafs: "NAFS.V.FORMS", pirls: "P1", difficulty: 5, stem: "Which?", options: ["a", "a"], answer: "E" }] }));
      usePracticeDir(dir);
    });
    after(() => usePracticeDir(null));

    test("loaded like the booklets: idempotent by code + n, invalid skipped and reported, difficulty from the file", async () => {
      const r0 = readPracticeSets();
      assert.deepEqual(r0.valid.map((x) => x.code), ["NP-901", "NP-902"]);
      assert.equal(r0.invalid[0].file, "NP-999.json");
      assert.ok(r0.invalid[0].problems.some((p) => /difficulty/.test(p)));
      const r = await loadNafsPracticeSets(repo, admin.schoolId!, admin.userId);
      assert.deepEqual({ sets: r.sets, added: r.added, invalid: r.invalid.map((x) => x.file) }, { sets: 2, added: 20, invalid: ["NP-999.json"] });
      const again = await loadNafsPracticeSets(repo, admin.schoolId!, admin.userId);
      assert.deepEqual({ added: again.added, skipped: again.skipped }, { added: 0, skipped: 20 }, "a second run adds nothing");
      assert.equal(await ensureNafsPracticeSets(repo, admin.schoolId!, admin.userId), null, "the background ensure does nothing when the center has them");
      const set = (await nafsIndex(repo, admin.schoolId!)).filter((e) => e.practiceSet === "NP-901").sort((a, b) => a.bookletN! - b.bookletN!);
      assert.equal(set.length, 10);
      assert.deepEqual(set.map((e) => e.difficulty), [1, 1, 1, 2, 2, 2, 2, 3, 3, 3]);
      assert.ok(set.every((e) => !e.own && !e.booklet && e.standard && e.passageId && e.kind === "MCQ"));
      assert.equal(set[0].standard, "MOE.S02");
      // the sets are not model booklets (the Ministry preset's booklet list)
      assert.ok(!(await bookletChoices(repo, g6)).some((b) => b.code.startsWith("NP-")));
      // the admin's "Load new questions" pack: a file per chunk; the invalid one reported
      const def = packOf("nafsPractice")!;
      assert.equal(def.title, "NAFS practice sets");
      assert.ok(hasAr(def.title));
      const c0 = await runPackChunk(repo, admin.schoolId!, def, 0);
      assert.deepEqual({ next: c0.next, total: c0.total, added: c0.added }, { next: 1, total: 3, added: 0 });
      const c2 = await runPackChunk(repo, admin.schoolId!, def, 2);
      assert.match(c2.errors.join(" "), /NP-999\.json: skipped/);
      assert.match(read("src/app/teacher/nafs/page.tsx"), /void ensureNafsPracticeSets\(/, "background ensure when the icon opens, never awaited");
      assert.ok(read("data/nafs/practice/README.md").includes("NP-001"));
    });
  });
});

describe("B. Tool 1 — adaptive NAFS practice", () => {
  const E = (id: string, difficulty: 1 | 2 | 3, code = "NAFS.V.NEAR"): NafsEntry => ({ id, nafsCode: code, process: "P2", domain: "V", passageId: null, own: true, hidden: false, draft: false, copyOfId: null, cat: null, standard: null, kind: "MCQ", booklet: null, bookletN: null, practiceSet: null, difficulty });

  test("the adaptive core: start Medium, right → harder, wrong → easier (bounded), mastery = 4 of the last 5 with 2 at Medium/Hard", () => {
    let st = newRunState(["NAFS.V.NEAR"]);
    assert.equal(st.targets["NAFS.V.NEAR"].level, 2, "starts Medium");
    st = afterAnswer(st, "NAFS.V.NEAR", 2, true); assert.equal(st.targets["NAFS.V.NEAR"].level, 3);
    st = afterAnswer(st, "NAFS.V.NEAR", 3, true); assert.equal(st.targets["NAFS.V.NEAR"].level, 3, "never above Hard");
    st = afterAnswer(st, "NAFS.V.NEAR", 3, false); assert.equal(st.targets["NAFS.V.NEAR"].level, 2);
    st = afterAnswer(st, "NAFS.V.NEAR", 2, false); assert.equal(st.targets["NAFS.V.NEAR"].level, 1);
    st = afterAnswer(st, "NAFS.V.NEAR", 1, false); assert.equal(st.targets["NAFS.V.NEAR"].level, 1, "never below Easy");
    assert.equal(st.targets["NAFS.V.NEAR"].reached, 3);
    assert.equal(isMastered([[1, 1], [1, 1], [1, 1], [1, 1], [2, 0]]), false, "4 right but all Easy");
    assert.equal(isMastered([[1, 1], [2, 1], [3, 1], [1, 1], [2, 0]]), true);
    assert.equal(isMastered([[2, 1], [2, 1], [2, 1], [2, 1]]), false, "fewer than 5 answers");
    assert.equal(isMastered([[2, 1], [2, 1], [2, 0], [2, 1], [2, 0]]), false, "3 of 5");
    // picking: the question nearest the level, never one already used, the balanced target first
    const pool = [E("e1", 1), E("m1", 2), E("h1", 3), E("m2", 2), E("x1", 2, "NAFS.V.FORMS")];
    const s0: RunState = newRunState(["NAFS.V.NEAR", "NAFS.V.FORMS"]);
    const p0 = pickNext(pool, ["NAFS.V.NEAR", "NAFS.V.FORMS"], s0, { recent: new Set(), seed: "t" }).pick!;
    assert.equal(p0.entry.difficulty, 2);
    const s1 = { ...afterAnswer({ ...s0, used: [p0.entry.id] }, p0.target, 2, true) };
    const p1 = pickNext(pool, ["NAFS.V.NEAR", "NAFS.V.FORMS"], s1, { recent: new Set(), seed: "t" }).pick!;
    assert.notEqual(p1.target, p0.target, "the target with fewer answers next");
    const done = pickNext(pool, ["NAFS.V.NEAR"], { ...newRunState(["NAFS.V.NEAR"]), used: ["e1", "m1", "h1", "m2"] }, { recent: new Set(), seed: "t" });
    assert.deepEqual({ pick: done.pick, why: done.why }, { pick: null, why: "EMPTY" });
    const recent = pickNext([E("m1", 2), E("m2", 2)], ["NAFS.V.NEAR"], newRunState(["NAFS.V.NEAR"]), { recent: new Set(["m1"]), seed: "t" }).pick!;
    assert.equal(recent.entry.id, "m2", "a question answered recently comes last");
  });

  test("a student practises: Medium first, harder after right, easier after wrong, no repeats, stops at mastery — NAFS tables only", async () => {
    const all = [...near[1], ...near[2], ...near[3]];
    await assert.rejects(createNafsPractice(repo, other, { title: "x", targets: ["NAFS.V.NEAR"], classId: klassId }), ForbiddenError, "Grade 6 teachers and admins only");
    await assert.rejects(createNafsPractice(repo, g6, { title: "x", targets: [], classId: klassId }), ValidationError);
    const { id } = await createNafsPractice(repo, g6, { title: "Near-synonyms", targets: [], questionIds: all, classId: klassId, studentIds: [student.studentId!], maxQuestions: 10 });
    assert.ok((await myNafsPractice(repo, student)).some((x) => x.id === id), "the chosen student sees it");
    assert.ok(!(await myNafsPractice(repo, classmate)).some((x) => x.id === id), "a classmate who was not chosen does not");
    await assert.rejects(nafsPracticeView(repo, classmate, id), ForbiddenError);
    await assert.rejects(nafsPracticeView(repo, g4student, id), ForbiddenError);
    const before0 = await counts();
    const idx = new Map((await nafsIndex(repo, admin.schoolId!)).map((e) => [e.id, e]));
    const seen: string[] = [];
    const plan = [true, false, false, true, true, true, true]; // M✓ H✗ M✗ E✓ M✓ H✓ H✓ → the last 5: ✗✓✓✓✓ with M/H right → mastered
    const want = [2, 3, 2, 1, 2, 3, 3];
    for (const [k, right] of plan.entries()) {
      const v = await nafsPracticeView(repo, student, id);
      assert.equal(v.done, false);
      const q = v.question!;
      assert.equal(idx.get(q.id)!.difficulty, want[k], `question ${k + 1}: ${["", "Easy", "Medium", "Hard"][want[k]]}`);
      assert.ok(!seen.includes(q.id), "never the same question twice");
      assert.equal((await nafsPracticeView(repo, student, id)).question!.id, q.id, "the same question until it is answered");
      assert.ok(!("correct" in q) && !("explanation" in q), "no key before the answer");
      seen.push(q.id);
      const key = 1;
      const fb = await answerNafsPractice(repo, student, { id, questionId: q.id, choice: right ? key : 0 });
      assert.equal(fb.correct, right); assert.equal(fb.answer, 1);
      assert.equal(fb.done, k === plan.length - 1, "finishes exactly when the skill is mastered");
    }
    const end = await nafsPracticeView(repo, student, id);
    assert.equal(end.done, true); assert.equal(end.end, "MASTERED");
    await assert.rejects(answerNafsPractice(repo, student, { id, questionId: seen[0], choice: 1 }), ValidationError);
    // ONLY the NAFS tables were written: the platform's attempts, mastery and levels are unchanged
    assert.deepEqual(await counts(), before0);
    assert.equal(await repo.count("NafsPracticeAnswer", { practiceId: id }), 7);
    // the teacher's view: per student per skill — difficulty reached, accuracy, mastered, time
    const rep = await nafsPracticeReport(repo, g6, id);
    const me = rep.students.find((x) => x.id === student.studentId)!;
    assert.deepEqual({ status: me.status, asked: me.asked, correct: me.correct, pct: me.pct }, { status: "DONE", asked: 7, correct: 5, pct: 71 });
    const cell = me.cells["NAFS.V.NEAR"];
    assert.deepEqual({ reached: cell.reached, mastered: cell.mastered, n: cell.n, pct: cell.pct }, { reached: 3, mastered: true, n: 7, pct: 71 });
    assert.equal(rep.students.length, 1, "only the chosen student");
    await assert.rejects(nafsPracticeReport(repo, other, id), ForbiddenError);
    // students never see level words
    for (const w of LEVEL_WORDS) {
      assert.ok(!JSON.stringify(await myNafsPractice(repo, student)).includes(w), `"${w}"`);
      for (const f of ["src/app/student/nafs/page.tsx", "src/app/student/nafs/practice/[id]/page.tsx", "src/components/nafs/practice-player.tsx"]) assert.ok(!read(f).includes(w), `${f}: ${w}`);
    }
  });

  test("stops at the number of questions; targets = skills / standards with no picked questions", async () => {
    const { id } = await createNafsPractice(repo, g6, { title: "Three only", targets: ["NAFS.V.NEAR"], classId: klassId, maxQuestions: 3 });
    for (let k = 0; k < 3; k++) {
      const v = await nafsPracticeView(repo, classmate, id);
      assert.equal(v.done, false);
      const fb = await answerNafsPractice(repo, classmate, { id, questionId: v.question!.id, choice: 0 });
      assert.equal(fb.done, k === 2);
    }
    const v = await nafsPracticeView(repo, classmate, id);
    assert.deepEqual({ done: v.done, end: v.end }, { done: true, end: "COUNT" });
    const list = await listNafsPractice(repo, g6);
    const row = list.find((x) => x.id === id)!;
    assert.deepEqual({ started: row.started, finished: row.finished, open: row.open }, { started: 1, finished: 1, open: true });
    // a Ministry standard as the target (from the practice sets loaded above)
    const std = await createNafsPractice(repo, g6, { title: "S12", targets: ["MOE.S12"], classId: klassId, maxQuestions: 2 });
    const q = (await nafsPracticeView(repo, student, std.id)).question!;
    assert.equal((await nafsIndex(repo, admin.schoolId!)).find((e) => e.id === q.id)!.standard, "MOE.S12");
    await assert.rejects(createNafsPractice(repo, g6, { title: "x", targets: ["NAFS.V.NEAR"], classId: klassId, studentIds: ["not-mine"] }), ValidationError);
  });
});

describe("B. Tool 2 — the test builder's difficulty", () => {
  test("Easy / Medium / Hard / Mixed: a single level is strict; a mix is shared out and respected", async () => {
    assert.equal(cleanDifficultyMix(null), null); assert.equal(cleanDifficultyMix("ANY"), null);
    assert.deepEqual(cleanDifficultyMix(3), { 1: 0, 2: 0, 3: 100 });
    assert.deepEqual(cleanDifficultyMix({ 1: 50, 2: 0, 3: 50 }), { 1: 50, 2: 0, 3: 50 });
    assert.deepEqual(difficultyQuota(10, { 1: 30, 2: 40, 3: 30 }), { 1: 3, 2: 4, 3: 3 });
    const idx = new Map((await nafsIndex(repo, admin.schoolId!)).map((e) => [e.id, e]));
    const mixed = await buildNafsAutomatic(repo, g6, { codes: ["NAFS.V.NEAR"], total: 6, difficulty: { 1: 50, 2: 0, 3: 50 }, seed: "d1" });
    const got = mixed.questionIds.map((id) => idx.get(id)!.difficulty).sort();
    assert.deepEqual(got, [1, 1, 1, 3, 3, 3], "50% Easy, 50% Hard");
    const hard = await buildNafsAutomatic(repo, g6, { codes: ["NAFS.V.NEAR"], total: 4, difficulty: 3, seed: "d2" });
    assert.deepEqual(hard.questionIds.map((id) => idx.get(id)!.difficulty), [3, 3, 3, 3], "Hard only");
    const tooMany = await buildNafsAutomatic(repo, g6, { codes: ["NAFS.V.NEAR"], total: 6, difficulty: 3, seed: "d3" });
    assert.equal(tooMany.questionIds.length, 4, "never another difficulty when one is chosen");
    assert.ok(tooMany.notes.length >= 1);
    const m = await buildNafsAutomatic(repo, g6, { codes: ["NAFS.V.NEAR"], total: 6, difficulty: { 1: 0, 2: 50, 3: 50 }, seed: "d4" });
    assert.deepEqual(m.questionIds.map((id) => idx.get(id)!.difficulty).sort(), [2, 2, 2, 3, 3, 3]);
    // standards as targets in the automatic builder
    const s12 = await buildNafsAutomatic(repo, g6, { codes: ["MOE.S12"], total: 2, seed: "d5" });
    assert.ok(s12.questionIds.length === 2 && s12.questionIds.every((id) => idx.get(id)!.standard === "MOE.S12"));
    // the NAFS simulation with "Easy" only
    const sim = await buildNafsSimulation(repo, g6, { settings: { questions: 5, passages: 1, perPassageMin: 1 }, difficulty: 1, seed: "d6" });
    assert.ok(sim.questionIds.length > 0 && sim.questionIds.every((id) => idx.get(id)!.difficulty === 1));
    assert.match(read("src/components/nafs/test-builder.tsx"), /"Mixed"/);
  });
});

describe("C + D. the teacher's center and the student's NAFS icon", () => {
  test("teacher tabs in order + About NAFS link; Home summary; bubble sheets under Marking", async () => {
    assert.deepEqual(CENTER_TABS.map((x) => x.label), ["Home", "Adaptive practice", "Create test", "Question bank", "Marking", "Reports"]);
    for (const x of CENTER_TABS) assert.ok(hasAr(x.label), x.label);
    const page = read("src/app/teacher/nafs/page.tsx");
    assert.match(page, /tab=about/); assert.match(page, /canSeeNafs\(repo, actor\)/);
    assert.match(read("src/components/nafs/marking-tab.tsx"), /<SheetsTab/);
    assert.match(read("src/components/nafs/reports-tab.tsx"), /Adaptive practice results/);
    const h = await nafsHomeSummary(repo, g6);
    assert.ok(h.openPractice >= 1);
    assert.equal(h.byDifficulty[1] + h.byDifficulty[2] + h.byDifficulty[3], h.questions);
    assert.ok(h.questions >= 20 + 12 + 3);
    assert.equal(typeof h.waiting, "number");
    await assert.rejects(nafsHomeSummary(repo, other), ForbiddenError);
  });

  test("the student NAFS icon only for Grade 6 students; three parts; NAFS left My Tests; home card", async () => {
    assert.equal((await studentMenuFlags(repo, student.studentId!)).nafs, true);
    assert.equal((await studentMenuFlags(repo, g4student.studentId!)).nafs, false);
    assert.ok(navItemsFor("STUDENT", { nafs: true }).some((i) => i.href === "/student/nafs" && i.label === "NAFS"));
    assert.ok(!navItemsFor("STUDENT", { nafs: false }).some((i) => i.href === "/student/nafs"));
    const page = read("src/app/student/nafs/page.tsx");
    for (const p of ["My practice", "My tests", "My results"]) { assert.ok(page.includes(`"${p}"`), p); assert.ok(hasAr(p), p); }
    assert.match(page, /inGrade6Class\(repo/);
    assert.ok(!read("src/app/student/tests/page.tsx").includes("myNafsTests"), "the NAFS section left My Tests");
    const home = await studentHome(repo, student);
    assert.ok(home.nafsToDo >= 1, "practice to do → the home NAFS card");
    assert.ok(home.notices.some((n) => n.href === "/student/nafs"));
    assert.ok(hasAr("NAFS: {n} to do"));
  });
});
