/**
 * 🇸🇦 The NAFS teacher section (fictional demo school only, in-memory database):
 *  - access: Grade 6 teachers and admins; other teachers and students are refused
 *  - the bank holds only questions of the NAFS skills (linked platform skills + the school's own)
 *  - automatic build: the number of questions, the per-skill counts, the "NAFS simulation" blueprint, replace / remove
 *  - editing a platform question makes a school copy (the original never changes)
 *  - grading answers (bubble sheet / typed / online) with the key and the marks
 *  - reports per NAFS skill and PIRLS process, item analysis; AI drafts need review
 *  - the menu: NAFS is its own entry for Grade 6 teachers
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
import { GUIDE_BOOKLET_SIZE, isNafsCode, MOE_AREAS, MOE_STANDARDS, NAFS_SKILLS, PROCESSES, SIMULATION_DEFAULT, SKILL_BY_CODE, standardFor } from "../src/server/nafs/framework";
import { loadNafsQuestions, nafsBankChanged, nafsBankPage, nafsIndex, nafsSkillCounts, nafsStandardCounts, retagNafsQuestion, reviewNafsDraft, saveNafsQuestion, setNafsHidden, usable } from "../src/server/nafs/bank";
import { bookletChoices, buildNafsAutomatic, buildNafsMinistry, buildNafsSimulation, ministryDistribution, replaceNafsQuestion, shareOut } from "../src/server/nafs/build";
import { assignNafsOnline, gradeAnswers, markingQueue, markWrittenAnswer, nafsClasses, saveNafsAnswers, saveNafsTest, getNafsTest, releaseNafsResults, updateNafsAssignment } from "../src/server/nafs/tests";
import { myNafsTests, nafsToDoCount, openBooklet, saveBooklet } from "../src/server/nafs/student";
import { classify, cleanCuts, discrimination, FLAG, itemFlags, nafsAcrossDoc, nafsAcrossReport, nafsReportDoc, nafsTestReport, nafsTrend, roundPct } from "../src/server/nafs/reports";
import { ensureNafsBooklets, loadNafsBooklets, readBooklets, useBookletDir } from "../src/server/nafs/booklets";
import { packOf, runPackChunk } from "../src/server/questions/load-packs";
import { studentHome } from "../src/server/student/student-home";
import { generateNafsDrafts, nafsPrompt } from "../src/server/nafs/ai";
import { assertNoStudentData } from "../src/server/ai/engine";
import { UI_STRINGS } from "../src/i18n/en";
import { ar } from "../src/i18n/ar";
import { demoDatabase } from "./helpers/db";

const ROOT = process.cwd();
const read = (f: string) => readFileSync(join(ROOT, f), "utf8");
const hasAr = (x: string) => (UI_STRINGS as readonly string[]).includes(x) && Boolean((ar as Record<string, string>)[x]);
const s = (v: unknown) => String(v ?? "");

let repo: SqliteRepo;
let g6: Actor, other: Actor, admin: Actor, student: Actor;
let platform: Record<string, string[]> = {};
let grammarQ = "";

async function mcq(skillId: string, passageId: string | null, stem: string, correct = 1): Promise<string> {
  const type = await repo.findUnique("QuestionType", { code: "MULTIPLE_CHOICE" });
  const q = await repo.create("Question", { skillId, passageId, typeId: type!.id, stem, content: {}, difficultyLevel: 4, irtB: 0, status: "PUBLISHED", origin: "DEMO" });
  await repo.createMany("QuestionOption", ["Alpha", "Bravo", "Charlie", "Delta"].map((t, i) => ({ questionId: q.id, label: "ABCD"[i], text: `${t} ${stem.slice(0, 12)}`, isCorrect: i === correct, order: i })));
  return s(q.id);
}

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
  assert.ok(klass.students.length >= 3);
  student = await resolveActor(repo, (await repo.findUnique("User", { id: (await repo.findUnique("Student", { id: klass.students[2].id }))!.userId }))!);
  // a small fictional bank on the school's Grade 6 skills: two passages (literary + informational) and single questions
  const grade = (await repo.findMany("Grade", { schoolId: admin.schoolId, level: 6 }))[0];
  const curs = await repo.findMany("Curriculum", { gradeId: grade.id });
  const skills = await repo.findMany("Skill", { curriculumId: { in: curs.map((c) => c.id) } });
  const fams = await repo.findMany("SkillFamily", {});
  const skillOf = (fam: string) => s(skills.find((k) => k.familyId === fams.find((f) => f.name === fam)?.id)?.id);
  const lit = await repo.create("ReadingPassage", { title: "The Lantern", body: "Para one of a story.\n\nPara two of a story.\n\nPara three.", genre: "Fiction", wordCount: 300, sentenceCount: 20, avgSentenceLength: 15, avgWordLength: 4.5, status: "PUBLISHED" });
  const info = await repo.create("ReadingPassage", { title: "Desert Plants", body: "Para one of an article.\n\nPara two of an article.", genre: "Informational", wordCount: 320, sentenceCount: 22, avgSentenceLength: 14, avgWordLength: 4.8, status: "PUBLISHED" });
  const plan: [string, string | null, number][] = [
    ["Central Idea and Relevant Details", s(lit.id), 3], ["Make Inferences", s(lit.id), 3], ["Synonyms and Antonyms", s(lit.id), 2], ["Author's Purpose", s(lit.id), 1],
    ["Central Idea and Relevant Details", s(info.id), 3], ["Author's Purpose", s(info.id), 3], ["Context Clues", s(info.id), 2],
    ["Synonyms and Antonyms", null, 3], ["Context Clues", null, 2], ["Make Inferences", null, 2],
  ];
  for (const [fam, pid, n] of plan) {
    const id = skillOf(fam);
    assert.ok(id, `Grade 6 skill of ${fam}`);
    for (let k = 0; k < n; k++) (platform[fam] ??= []).push(await mcq(id, pid, `${fam} question ${k + 1} ${pid ? "with passage" : "alone"}?`, k % 4));
  }
  const grammar = skills.find((k) => fams.find((f) => f.id === k.familyId)?.category === "GRAMMAR");
  assert.ok(grammar, "a Grade 6 grammar skill");
  grammarQ = await mcq(s(grammar!.id), null, "Which verb agrees with the subject?");
});

describe("NAFS section", () => {
  test("access: Grade 6 teachers and admins only (others and students are refused)", async () => {
    await nafsBankPage(repo, g6, {});
    await nafsBankPage(repo, admin, {});
    await assert.rejects(nafsBankPage(repo, other, {}), ForbiddenError);
    await assert.rejects(nafsBankPage(repo, student, {}), ForbiddenError);
    await assert.rejects(buildNafsAutomatic(repo, other, { codes: ["NAFS.RC.MAIN"], total: 2 }), ForbiddenError);
    await assert.rejects(saveNafsTest(repo, other, { title: "x", mode: "MANUAL", questionIds: [platform["Context Clues"][0]] }), ForbiddenError);
    // the menu: its own entry for Grade 6 teachers, nothing for the others
    assert.ok(navItemsFor("TEACHER", { nafs: true }).some((i) => i.href === "/teacher/nafs" && i.label === "NAFS"));
    assert.ok(!navItemsFor("TEACHER", { nafs: false }).some((i) => i.href === "/teacher/nafs"));
    assert.match(read("src/app/teacher/nafs/page.tsx"), /assertNafs\(repo, actor\)|canSeeNafs\(repo, actor\)/);
  });

  test("the framework: 14 NAFS skills with stable codes in 4 domains, translated", () => {
    assert.deepEqual(NAFS_SKILLS.map((k) => k.code), ["NAFS.RC.MAIN", "NAFS.RC.DETAIL", "NAFS.RC.IMPLIED", "NAFS.IAE.INFER", "NAFS.IAE.ANALYZE", "NAFS.IAE.EVAL", "NAFS.V.SYNANT", "NAFS.V.NEAR", "NAFS.V.FORMS", "NAFS.V.CONTEXT", "NAFS.P1", "NAFS.P2", "NAFS.P3", "NAFS.P4"]);
    for (const k of NAFS_SKILLS) assert.ok(hasAr(k.name), k.name);
  });

  test("the bank holds only questions of the NAFS skills (linked platform skills), each with a skill and a process", async () => {
    const idx = await nafsIndex(repo, admin.schoolId!);
    const ids = new Set(idx.map((e) => e.id));
    for (const list of Object.values(platform)) for (const id of list) assert.ok(ids.has(id), "linked question is in the bank");
    assert.ok(!ids.has(grammarQ), "a grammar question (no NAFS link) is not in the bank");
    for (const e of idx) { assert.ok(SKILL_BY_CODE.has(e.nafsCode) && SKILL_BY_CODE.get(e.nafsCode)!.domain !== "PIRLS"); assert.ok(PROCESSES.includes(e.process)); }
    assert.equal(idx.find((e) => e.id === platform["Synonyms and Antonyms"][0])?.nafsCode, "NAFS.V.SYNANT");
    assert.equal(idx.find((e) => e.id === platform["Author's Purpose"][0])?.process, "P4");
    const counts = await nafsSkillCounts(repo, g6);
    assert.equal(counts.find((c) => c.code === "NAFS.V.SYNANT")?.questions, 5);
    assert.ok(counts.find((c) => c.code === "NAFS.V.SYNANT")!.families.some((f) => f.name === "Synonyms and Antonyms"));
    const page = await nafsBankPage(repo, g6, { code: "NAFS.V.SYNANT" });
    assert.equal(page.total, 5);
    assert.ok(page.rows.every((r) => r.nafsCode === "NAFS.V.SYNANT"));
  });

  test("automatic build: the count, the per-skill numbers, only the chosen skills, no repeats, passages kept together; replace and remove", async () => {
    const a = await buildNafsAutomatic(repo, g6, { codes: ["NAFS.RC.MAIN", "NAFS.V.SYNANT"], total: 6, seed: "t1" });
    assert.equal(a.questionIds.length, 6);
    assert.equal(new Set(a.questionIds).size, 6, "no repeats");
    const idx = new Map((await nafsIndex(repo, admin.schoolId!)).map((e) => [e.id, e]));
    assert.equal(a.questionIds.filter((id) => idx.get(id)!.nafsCode === "NAFS.RC.MAIN").length, 3);
    assert.equal(a.questionIds.filter((id) => idx.get(id)!.nafsCode === "NAFS.V.SYNANT").length, 3);
    // a passage's questions sit together
    const pids = a.questionIds.map((id) => idx.get(id)!.passageId);
    for (const p of new Set(pids.filter(Boolean))) { const at = pids.map((x, i) => (x === p ? i : -1)).filter((i) => i >= 0); assert.equal(at[at.length - 1] - at[0] + 1, at.length, "contiguous"); }
    const b = await buildNafsAutomatic(repo, g6, { codes: ["NAFS.IAE.EVAL", "NAFS.V.CONTEXT"], perSkill: { "NAFS.IAE.EVAL": 2, "NAFS.V.CONTEXT": 1 }, seed: "t2" });
    assert.equal(b.questionIds.length, 3);
    assert.deepEqual([...new Set(b.questionIds.map((id) => idx.get(id)!.nafsCode))].sort(), ["NAFS.IAE.EVAL", "NAFS.V.CONTEXT"]);
    // replace: another question of the same skill, not in the test
    const r = await replaceNafsQuestion(repo, g6, { questionId: a.questionIds[0], current: a.questionIds });
    assert.ok(!a.questionIds.includes(r));
    assert.equal(idx.get(r)!.nafsCode, idx.get(a.questionIds[0])!.nafsCode);
    // remove / reorder: the teacher saves the list as they left it
    const kept = [r, ...a.questionIds.slice(2)].reverse();
    const id = await saveNafsTest(repo, g6, { title: "Practice 1", mode: "AUTO", questionIds: kept, timeLimitMin: 20 });
    assert.deepEqual((await getNafsTest(repo, g6, id)).questionIds, kept);
    await assert.rejects(buildNafsAutomatic(repo, g6, { codes: ["NAFS.RC.MAIN"], total: 61 }), ValidationError);
    await assert.rejects(saveNafsTest(repo, g6, { title: "Bad", mode: "MANUAL", questionIds: [grammarQ], timeLimitMin: 20 }), ValidationError);
    await assert.rejects(saveNafsTest(repo, g6, { title: "No time", mode: "MANUAL", questionIds: kept }), /Set the time/, "the time is required in every mode");
  });

  test("NAFS simulation preset: the count, a literary and an informational passage, the PIRLS mix as far as the bank allows", async () => {
    assert.deepEqual(SIMULATION_DEFAULT, { questions: 20, minutes: 35, passages: 3, perPassageMin: 5, perPassageMax: 8, vocabularyPct: 20, process: { P1: 20, P2: 30, P3: 30, P4: 20 } });
    assert.deepEqual(shareOut(20, SIMULATION_DEFAULT.process), { P1: 4, P2: 6, P3: 6, P4: 4 });
    const sim = await buildNafsSimulation(repo, g6, { settings: { questions: 16, passages: 2 }, seed: "sim" });
    assert.equal(sim.questionIds.length, 16);
    assert.equal(sim.settings.minutes, 35);
    const qs = await loadNafsQuestions(repo, sim.questionIds);
    const kinds = new Set(qs.map((q) => q.passage?.type).filter(Boolean));
    assert.ok(kinds.has("LIT") && kinds.has("INFO"), "one literary and one informational passage");
    // literary passage first, like the booklet
    assert.equal(qs.find((q) => q.passage)?.passage?.type, "LIT");
    const idx = new Map((await nafsIndex(repo, admin.schoolId!)).map((e) => [e.id, e]));
    assert.ok(sim.questionIds.some((id) => idx.get(id)!.domain === "V"), "vocabulary items");
    // the teacher's numbers: 10 questions, one passage
    const small = await buildNafsSimulation(repo, g6, { settings: { questions: 10, passages: 1 }, seed: "x" });
    assert.equal(small.questionIds.length, 10);
    assert.equal(new Set((await loadNafsQuestions(repo, small.questionIds)).map((q) => q.passage?.id).filter(Boolean)).size, 1);
    // asking for more than the bank has: a note, never a repeat
    const big = await buildNafsSimulation(repo, g6, { settings: { questions: 40 }, seed: "y" });
    assert.equal(new Set(big.questionIds).size, big.questionIds.length);
    assert.ok(big.notes.some((n) => /only/.test(n)));
  });

  test("editing a platform question makes a school copy; the original never changes; hide / show; add a new one", async () => {
    const orig = platform["Context Clues"][0];
    const before0 = await repo.findUnique("Question", { id: orig });
    const r = await saveNafsQuestion(repo, g6, { id: orig, nafsCode: "NAFS.V.CONTEXT", process: "P2", stem: "Which sentence uses the word 'fleeting' correctly?", options: ["A fleeting rock.", "The joy was fleeting.", "He fleeting home.", "Fleeting is blue."], correct: 1 });
    assert.equal(r.copied, true);
    assert.notEqual(r.id, orig);
    assert.equal(s((await repo.findUnique("Question", { id: orig }))!.stem), s(before0!.stem), "the original is unchanged");
    const idx = await nafsIndex(repo, admin.schoolId!);
    assert.equal(idx.find((e) => e.id === orig)?.hidden, true, "the original is hidden in this school's NAFS bank");
    const copy = idx.find((e) => e.id === r.id)!;
    assert.ok(copy.own && copy.copyOfId === orig && !copy.hidden);
    const skill = await repo.findUnique("Skill", { id: (await repo.findUnique("Question", { id: r.id }))!.skillId });
    assert.ok(skill && (skill.isActive === false || skill.isActive === 0), "own questions live on an inactive holding skill (never practised)");
    // editing the copy again changes it in place
    const again = await saveNafsQuestion(repo, g6, { id: r.id, nafsCode: "NAFS.V.CONTEXT", stem: "Which sentence uses 'fleeting' correctly?", options: ["A fleeting rock.", "The joy was fleeting.", "He fleeting home.", "Fleeting is blue."], correct: 1 });
    assert.equal(again.copied, false); assert.equal(again.id, r.id);
    // a new question with a passage
    const n = await saveNafsQuestion(repo, g6, { nafsCode: "NAFS.RC.DETAIL", stem: "According to the text, where did the family go?", options: ["The market", "The beach", "The farm", "The museum"], correct: 1, passageTitle: "A Day Out", passageText: "The family woke up early on Friday.\n\nThey drove to the beach and swam until noon.", textType: "INFO" });
    assert.equal((await loadNafsQuestions(repo, [n.id]))[0].passage?.type, "INFO");
    await setNafsHidden(repo, g6, n.id, true);
    assert.ok((await nafsIndex(repo, admin.schoolId!)).find((e) => e.id === n.id)!.hidden);
    await setNafsHidden(repo, g6, n.id, false);
    await assert.rejects(saveNafsQuestion(repo, g6, { nafsCode: "NAFS.RC.MAIN", stem: "Too few options?", options: ["a", "b", "c"], correct: 0 }), ValidationError);
    await assert.rejects(saveNafsQuestion(repo, g6, { id: grammarQ, nafsCode: "NAFS.RC.MAIN", stem: "Not NAFS", options: ["a", "b", "c", "d"], correct: 0 }), ForbiddenError);
    assert.equal(await repo.count("Question", { id: orig, deletedAt: null }), 1, "nothing deleted");
  });

  test("grading answers with the key and the marks (bubble sheet / typed); online simulation; reports per skill and process", async () => {
    const ids = [platform["Synonyms and Antonyms"][2], platform["Author's Purpose"][3], platform["Make Inferences"][3]]; // keys: 2, 0 (k=3 → 3%4=3)…
    const key = (await loadNafsQuestions(repo, ids)).map((q) => q.correct);
    assert.deepEqual(gradeAnswers([1, 2, 3], [2, 1, 1], [1, null, 0]), { right: [true, false, false], credit: [1, 0, 0], correct: 1, pending: 0, points: 2, maxPoints: 4 });
    const testId = await saveNafsTest(repo, g6, { title: "Sim A", mode: "MANUAL", questionIds: ids, marks: { [ids[0]]: 2 }, timeLimitMin: 35 });
    const klass = (await nafsClasses(repo, g6))[0];
    const [s1, s2] = klass.students;
    const wrong = (k: number) => ((k + 1) % 4) as 0 | 1 | 2 | 3;
    const g1 = await saveNafsAnswers(repo, g6, { testId, studentId: s1.id, answers: key, source: "SHEET" });
    assert.deepEqual({ c: g1.correct, p: g1.points, m: g1.maxPoints }, { c: 3, p: 4, m: 4 });
    const g2 = await saveNafsAnswers(repo, g6, { testId, studentId: s2.id, answers: [key[0], wrong(key[1]), null], source: "TYPED" });
    assert.deepEqual({ c: g2.correct, p: g2.points }, { c: 1, p: 2 });
    await assert.rejects(saveNafsAnswers(repo, g6, { testId, studentId: s1.id, answers: [0, 1] }), ValidationError, "the test's number of answers");
    await assert.rejects(saveNafsAnswers(repo, g6, { testId, studentId: s1.id, answers: [0, 1, 7] }), ValidationError);
    await assert.rejects(saveNafsAnswers(repo, other, { testId, studentId: s1.id, answers: key }), ForbiddenError);
    // online: the student opens the booklet (timer from the first opening), submits; results after release
    await assignNafsOnline(repo, g6, { testId, classId: klass.id });
    const mine = await myNafsTests(repo, student);
    const row = mine.find((x) => x.title === "Sim A")!;
    assert.ok(row);
    assert.notEqual(student.studentId, s1.id);
    const b = await openBooklet(repo, student, row.id);
    assert.equal(b.total, 3); assert.equal(b.minutes, 35); assert.ok(b.endsAt);
    assert.ok(!JSON.stringify(b).includes("correct"), "no key in the booklet");
    assert.ok(!JSON.stringify(b).includes("explanation"), "no explanations in the booklet");
    assert.equal((await saveBooklet(repo, student, { id: row.id, answers: [key[0], null, null], submit: false })).done, false, "kept, not handed in");
    const out = await saveBooklet(repo, student, { id: row.id, answers: [key[0], null, key[2]], submit: true });
    assert.deepEqual(out, { done: true, blanks: 1 });
    // a student of another class cannot open it
    await assert.rejects(openBooklet(repo, await resolveActor(repo, (await repo.findUnique("User", { username: "demo.s1001" }))!), row.id), ForbiddenError);
    assert.equal((await myNafsTests(repo, student)).find((x) => x.id === row.id)!.pct, null, "no score before the teacher releases");
    await releaseNafsResults(repo, g6, { testId, classId: klass.id, release: true });
    const released = (await myNafsTests(repo, student)).find((x) => x.id === row.id)!;
    assert.equal(typeof released.pct, "number");
    for (const w of ["Below", "Approaching", "Meeting", "Exceeding", "Tier"]) assert.ok(!JSON.stringify(released).includes(w));
    // the report: per NAFS skill and PIRLS process, item analysis
    const rep = await nafsTestReport(repo, g6, testId, klass.id);
    assert.ok(rep.taken >= 2);
    const syn = rep.skills.find((k) => k.code === "NAFS.V.SYNANT")!;
    const st1 = rep.students.find((x) => x.id === s1.id)!, st2 = rep.students.find((x) => x.id === s2.id)!;
    assert.equal(st1.pct, 100); assert.equal(st2.pct, 33);
    assert.equal(st1.skills["NAFS.V.SYNANT"], 100); assert.equal(st2.skills["NAFS.IAE.EVAL"], 0);
    assert.ok(typeof syn.pct === "number");
    const p4 = rep.processes.find((p) => p.code === "P4")!;
    assert.equal(p4.questions, 1);
    assert.equal(st1.processes.P4, 100); assert.equal(st2.processes.P4, 0);
    const item2 = rep.items[1];
    assert.equal(item2.counts[wrong(key[1])] >= 1, true, "the distractor s2 chose is counted");
    assert.equal(item2.topWrong, wrong(key[1]));
    assert.ok(rep.items[2].blank >= 1);
    assert.ok((await nafsTrend(repo, g6, klass.id)).some((p) => p.testId === testId));
    const doc = nafsReportDoc(rep, { branding: { name: "Demo", nameAr: null, logo: null }, generatedAt: new Date(), generatedBy: "t" } as never);
    assert.ok(doc.sections.some((x) => x.type === "table" && x.id === "items"));
    // a test with results keeps its questions (make a copy instead)
    await assert.rejects(saveNafsTest(repo, g6, { id: testId, title: "Sim A", mode: "MANUAL", questionIds: ids.slice(0, 2), timeLimitMin: 35 }), ValidationError);
    await assert.rejects(nafsTestReport(repo, other, testId), ForbiddenError);
  });

  test("AI drafts: curriculum data only, saved as drafts the teacher reviews before use", async () => {
    const p = nafsPrompt({ codes: ["NAFS.V.SYNANT"], count: 2, topic: "camels", withPassage: false, textType: null });
    assertNoStudentData(p.user);
    assert.match(p.system, /four options A–D/); assert.match(p.system, /P1 retrieve/);
    const reply = { passage: null, questions: [
      { skill: "NAFS.V.SYNANT", process: "P2", stem: "What is a synonym for 'swift'?", options: ["Slow", "Quick", "Heavy", "Late"], correct: 1, explanation: "Swift means quick." },
      { skill: "NAFS.V.SYNANT", process: "P2", stem: "What is an antonym for 'ancient'?", options: ["Old", "Modern", "Large", "Quiet"], correct: 1, explanation: "Ancient is the opposite of modern." },
    ] };
    const fake = () => ({ complete: async () => JSON.stringify(reply) });
    const r = await generateNafsDrafts(repo, g6, { codes: ["NAFS.V.SYNANT"], count: 2 }, { env: { GEMINI_API_KEY: "AIza-test-key" }, make: { gemini: fake } });
    assert.equal(r.error, undefined); assert.equal(r.ids.length, 2);
    const idx = await nafsIndex(repo, admin.schoolId!);
    const d = idx.find((e) => e.id === r.ids[0])!;
    assert.ok(d.draft && d.own && !usable(d), "a draft is not usable yet");
    await assert.rejects(saveNafsTest(repo, g6, { title: "Draft test", mode: "MANUAL", questionIds: [r.ids[0]], timeLimitMin: 10 }), /draft/i);
    await reviewNafsDraft(repo, g6, r.ids[0], true);
    await reviewNafsDraft(repo, g6, r.ids[1], false);
    nafsBankChanged(repo, admin.schoolId!);
    const after = await nafsIndex(repo, admin.schoolId!);
    assert.ok(usable(after.find((e) => e.id === r.ids[0])!));
    assert.ok(after.find((e) => e.id === r.ids[1])!.hidden, "a rejected draft is hidden, not deleted");
    await saveNafsTest(repo, g6, { title: "With AI", mode: "MANUAL", questionIds: [r.ids[0]], timeLimitMin: 10 });
  });

  test("pages: one center with six tabs; actions check the actor; page files export only page fields; new words translated", () => {
    const page = read("src/app/teacher/nafs/page.tsx");
    const center = read("src/server/nafs/center.ts");
    for (const tab of ["Home", "Dashboard", "Practice", "Tests", "Question bank", "Marking", "Reports"]) { /* owner r67 */ assert.ok(center.includes(`"${tab}"`), tab); assert.ok(hasAr(tab), tab); }
    assert.ok(page.includes('"About NAFS"') && hasAr("About NAFS"), "About NAFS: a small link at the top");
    assert.match(page, /plans\?tab=nafs/, "Make a NAFS plan from these results");
    const actions = read("src/app/teacher/nafs/actions.ts");
    assert.match(actions, /saveNafsAnswers\(repo, actor/);
    assert.ok(!/image|dataUrl|base64|Blob/i.test(actions.split("saveNafsAnswers")[0].slice(-400)), "answers only, never images");
    for (const f of ["src/app/teacher/nafs/page.tsx", "src/app/teacher/nafs/tests/new/page.tsx", "src/app/teacher/nafs/tests/[id]/page.tsx", "src/app/teacher/nafs/tests/[id]/print/page.tsx", "src/app/teacher/nafs/tests/[id]/sheets/page.tsx", "src/app/teacher/nafs/tests/[id]/grade/page.tsx", "src/app/teacher/nafs/question/page.tsx", "src/app/student/nafs/sim/[id]/page.tsx"]) {
      const src = read(f);
      const exported = [...src.matchAll(/^export\s+(?:default\s+)?(?:async\s+)?(?:function|const|let)\s+(\w+)/gm)].map((m) => m[1]);
      for (const name of exported) assert.ok(["metadata", "dynamic", "revalidate"].includes(name) || /^[A-Z]\w*Page$/.test(name), `${f}: exports ${name}`);
    }
  });
});

describe("NAFS: the Ministry guide, model booklets, written answers, online assignment and precise reports", () => {
  let dir = "";
  const fixtures = join(ROOT, "tests", "fixtures", "nafs-booklets");
  let whole: string[] = [];
  let modelTest = "", kiteTest = "";
  let klassId = "";
  const LEVEL_WORDS = ["Below", "Approaching", "Meeting", "Exceeding", "Tier", "Mastered", "Developing", "Needs support"];
  before(() => {
    dir = mkdtempSync(join(tmpdir(), "nafs-booklets-"));
    for (const f of ["NB-901.json", "NB-902.json"]) copyFileSync(join(fixtures, f), join(dir, f));
    // an invalid booklet: skipped with a report, never half-loaded
    writeFileSync(join(dir, "NB-999.json"), JSON.stringify({ code: "NB-999", title: "Broken", kind: "POEM", passage: "Too short.", questions: [{ n: 1, standard: "MOE.S99", type: "MCQ", stem: "Which?", options: ["a", "a"], answer: "E" }] }));
    useBookletDir(dir);
  });
  after(() => useBookletDir(null));

  test("the 13 Ministry standards: stored as data in the guide's order, mapped to NAFS skills and PIRLS processes, Arabic from the guide", async () => {
    assert.deepEqual(MOE_STANDARDS.map((x) => x.code), Array.from({ length: 13 }, (_x, i) => `MOE.S${String(i + 1).padStart(2, "0")}`));
    assert.equal(GUIDE_BOOKLET_SIZE, 35);
    for (const x of MOE_STANDARDS) {
      assert.ok(x.nafs.length && x.nafs.every(isNafsCode), `${x.code} → NAFS skills`);
      assert.ok(x.pirls.length && x.pirls.every((p) => PROCESSES.includes(p)), `${x.code} → PIRLS`);
      assert.ok(hasAr(x.text), x.text);
    }
    for (const a of MOE_AREAS) { assert.ok(hasAr(a.name), a.name); assert.ok(hasAr(a.about), a.about); }
    assert.deepEqual(MOE_STANDARDS.map((x) => x.area), ["VOC", "VOC", "VOC", "CA", "CA", "CA", "CA", "CA", "EV", "EV", "EV", "EV", "EV"]);
    assert.equal((ar as Record<string, string>)["Identifies synonyms and antonyms of words in the text and explains their meanings."], "يحدد مرادفات وأضداد المفردات الواردة في النص ويوضح معانيها");
    assert.equal((ar as Record<string, string>)["Evaluates whether events described by the writer could really happen."], "يقوّم احتمال حقيقة وقوع الأحداث التي وصفها الكاتب والتي من الممكن أن تحدث");
    // automatic only where sure; the teacher's choice wins
    assert.equal(standardFor(null, "NAFS.V.SYNANT"), "MOE.S01");
    assert.equal(standardFor(null, "NAFS.IAE.INFER", "Which of these events could really happen?"), "MOE.S12");
    assert.equal(standardFor(null, "NAFS.IAE.INFER", "Why did Omar smile?"), null);
    assert.equal(standardFor("MOE.S10", "NAFS.V.SYNANT"), "MOE.S10");
    const idx = new Map((await nafsIndex(repo, admin.schoolId!)).map((e) => [e.id, e]));
    assert.equal(idx.get(platform["Synonyms and Antonyms"][0])!.standard, "MOE.S01");
    const inf = platform["Make Inferences"][0];
    assert.equal(idx.get(inf)!.standard, null, "not sure → not set");
    await retagNafsQuestion(repo, g6, inf, "NAFS.RC.IMPLIED", null, new Date(), "MOE.S07");
    assert.equal((await nafsIndex(repo, admin.schoolId!)).find((e) => e.id === inf)!.standard, "MOE.S07", "the teacher changes it");
    const counts = await nafsStandardCounts(repo, g6);
    assert.equal(counts.rows.length, 13);
    assert.ok(counts.rows.find((x) => x.code === "MOE.S01")!.questions >= 5);
    assert.ok(counts.rows.find((x) => x.code === "MOE.S07")!.questions >= 1);
    assert.ok(counts.notSet >= 1);
  });

  test("model booklets: loaded as platform passage + questions, idempotent by code + n, an invalid file skipped with a report", async () => {
    const read = readBooklets();
    assert.deepEqual(read.valid.map((b) => b.code), ["NB-901", "NB-902"]);
    assert.equal(read.invalid[0].file, "NB-999.json");
    assert.ok(read.invalid[0].problems.length >= 3);
    const r = await loadNafsBooklets(repo, admin.schoolId!, admin.userId);
    assert.deepEqual({ booklets: r.booklets, added: r.added, invalid: r.invalid.map((x) => x.file) }, { booklets: 2, added: 35 + 13, invalid: ["NB-999.json"] });
    const again = await loadNafsBooklets(repo, admin.schoolId!, admin.userId);
    assert.deepEqual({ added: again.added, skipped: again.skipped }, { added: 0, skipped: 48 }, "a second run adds nothing");
    assert.equal(await repo.count("NafsBankItem", { schoolId: admin.schoolId, booklet: "NB-901" }), 35);
    const idx = (await nafsIndex(repo, admin.schoolId!)).filter((e) => e.booklet === "NB-901").sort((a, b) => a.bookletN! - b.bookletN!);
    assert.equal(idx.length, 35);
    assert.ok(idx.every((e) => !e.own && !e.hidden && !e.draft && e.standard && e.passageId), "platform content, published, tagged");
    assert.equal(idx[0].standard, "MOE.S01"); assert.equal(idx[34].standard, "MOE.S13");
    assert.deepEqual(idx.filter((e) => e.kind === "WRITTEN").map((e) => e.standard), ["MOE.S03", "MOE.S13"]);
    const p = await repo.findUnique("ReadingPassage", { externalRef: "NAFS-NB-901" });
    assert.equal(p?.status, "PUBLISHED");
    assert.equal(textOf((await loadNafsQuestions(repo, [idx[0].id]))[0].passage?.type), "INFO");
    // the admin's "Load new questions" pack: a file per chunk; the invalid one is reported
    const def = packOf("nafs")!;
    assert.equal(def.title, "NAFS model booklets");
    const c0 = await runPackChunk(repo, admin.schoolId!, def, 0);
    assert.deepEqual({ next: c0.next, total: c0.total, added: c0.added }, { next: 1, total: 3, added: 0 });
    const c2 = await runPackChunk(repo, admin.schoolId!, def, 2);
    assert.match(c2.errors.join(" "), /NB-999\.json: skipped/);
    assert.equal(await ensureNafsBooklets(repo, admin.schoolId!, admin.userId), null, "the background load does nothing when the bank has them");
    const choices = await bookletChoices(repo, g6);
    assert.deepEqual(choices.map((b) => [b.code, b.questions, b.written]), [["NB-901", 35, 2], ["NB-902", 13, 1]]);
  });

  test("Ministry booklet model: the guide's distribution for 35 / 20 / 10, a whole booklet as it is, grouped by standard, written optional", async () => {
    const d35 = ministryDistribution(35), d20 = ministryDistribution(20), d10 = ministryDistribution(10);
    const sum = (d: Record<string, number>) => Object.values(d).reduce((a, b) => a + b, 0);
    assert.deepEqual(MOE_STANDARDS.map((x) => d35[x.code]), [3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 1, 1, 3]);
    assert.deepEqual(MOE_STANDARDS.map((x) => d20[x.code]), [2, 2, 2, 2, 2, 2, 2, 1, 1, 1, 1, 1, 1]);
    assert.deepEqual(MOE_STANDARDS.map((x) => d10[x.code] ?? 0), [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0]);
    assert.deepEqual([sum(d35), sum(d20), sum(d10)], [35, 20, 10]);
    const idx = new Map((await nafsIndex(repo, admin.schoolId!)).map((e) => [e.id, e]));
    const w = await buildNafsMinistry(repo, g6, { settings: { questions: 35, booklet: "NB-901", written: true }, seed: "m" });
    assert.deepEqual(w.questionIds.map((id) => idx.get(id)!.bookletN), Array.from({ length: 35 }, (_x, i) => i + 1), "the whole booklet, as it is");
    whole = w.questionIds;
    const b20 = await buildNafsMinistry(repo, g6, { settings: { questions: 20, written: false }, seed: "m2" });
    assert.equal(b20.questionIds.length, 20);
    const got20: Record<string, number> = {};
    for (const id of b20.questionIds) got20[idx.get(id)!.standard!] = (got20[idx.get(id)!.standard!] ?? 0) + 1;
    assert.deepEqual(got20, d20);
    assert.ok(b20.questionIds.every((id) => idx.get(id)!.kind === "MCQ"), "written answers left out when not wanted");
    // grouped and ordered by the standards inside each passage
    const byP = new Map<string, number[]>();
    for (const id of b20.questionIds) { const e = idx.get(id)!; const l = byP.get(e.passageId ?? "-") ?? []; l.push(Number(e.standard!.slice(5))); byP.set(e.passageId ?? "-", l); }
    for (const l of byP.values()) assert.deepEqual(l, [...l].sort((a, b) => a - b));
    const b10 = await buildNafsMinistry(repo, g6, { settings: { questions: 10, written: true }, seed: "m3" });
    assert.equal(b10.questionIds.length, 10);
    assert.deepEqual(b10.questionIds.filter((id) => idx.get(id)!.kind === "WRITTEN").map((id) => idx.get(id)!.standard), ["MOE.S03"], "the guide's written answer under S03");
  });

  test("assign online to chosen students: they see it (My Tests + home badge), MCQs graded at once, written answers never auto-scored → marking queue", async () => {
    modelTest = await saveNafsTest(repo, g6, { title: "Model booklet NB-901", mode: "MINISTRY", questionIds: whole, timeLimitMin: 45 });
    const klass = (await nafsClasses(repo, g6))[0];
    klassId = klass.id;
    const other = await resolveActor(repo, (await repo.findUnique("User", { id: (await repo.findUnique("Student", { id: klass.students[0].id }))!.userId }))!);
    assert.notEqual(other.studentId, student.studentId);
    await assert.rejects(assignNafsOnline(repo, g6, { testId: modelTest, classId: klass.id, studentIds: ["not-a-student"] }), ValidationError);
    const before0 = await nafsToDoCount(repo, student);
    const r = await assignNafsOnline(repo, g6, { testId: modelTest, classId: klass.id, studentIds: [student.studentId!], timeLimitMin: 40 });
    assert.equal(r.students, 1);
    assert.equal(await nafsToDoCount(repo, student), before0 + 1, "counted on the home badge");
    // NAFS tests live in the NAFS icon (Grade 6): counted on the home NAFS card, not on My Tests
    assert.ok((await studentHome(repo, student)).nafsToDo >= 1);
    assert.equal((await myNafsTests(repo, other)).some((x) => x.title === "Model booklet NB-901"), false, "a student who was not chosen does not see it");
    let row = (await myNafsTests(repo, student)).find((x) => x.title === "Model booklet NB-901")!;
    assert.equal(row.minutes, 40, "the assignment's own time");
    await updateNafsAssignment(repo, g6, { testId: modelTest, classId: klass.id, timeLimitMin: 50, dueAt: new Date(Date.now() + 86_400_000) });
    row = (await myNafsTests(repo, student)).find((x) => x.title === "Model booklet NB-901")!;
    assert.equal(row.minutes, 50); assert.ok(row.dueAt);
    const b = await openBooklet(repo, student, row.id);
    assert.equal(b.minutes, 50);
    assert.equal(b.groups.flatMap((g) => g.questions).filter((q) => q.kind === "WRITTEN").length, 2);
    assert.ok(!/rubric|model answer|"correct"/i.test(JSON.stringify(b)), "no key, model answer or rubric in the booklet");
    const qs = await loadNafsQuestions(repo, whole);
    const key = whole.map((id) => qs.find((q) => q.id === id)!.correct);
    const wIdx = key.map((k, i) => (k < 0 ? i : -1)).filter((i) => i >= 0);
    assert.equal(wIdx.length, 2);
    // a value in a written question's slot is ignored: written answers are never scored automatically
    const answers = key.map((k) => (k < 0 ? 0 : k));
    await saveBooklet(repo, student, { id: row.id, answers, texts: { [wIdx[0]]: "I showed patience while the seeds grew." }, submit: true });
    assert.equal(await nafsToDoCount(repo, student), before0);
    const res = (await repo.findMany("NafsResult", { testId: modelTest, studentId: student.studentId }))[0];
    assert.deepEqual({ correct: Number(res.correct), points: Number(res.points), max: Number(res.maxPoints) }, { correct: 33, points: 33, max: 35 });
    assert.deepEqual(gradeAnswers([-1, 2], [1, 1], [0, 2]), { right: [false, true], credit: [null, 1], correct: 1, pending: 1, points: 1, maxPoints: 2 });
    // the marking queue inside the NAFS section
    let q = await markingQueue(repo, g6, { testId: modelTest });
    assert.equal(q.waiting, 2);
    assert.equal(q.items.find((x) => x.index === wIdx[0])!.text, "I showed patience while the seeds grew.");
    assert.equal(q.items.find((x) => x.index === wIdx[0])!.rubric.length, 3);
    await assert.rejects(markWrittenAnswer(repo, g6, { resultId: s(res.id), index: wIdx[0], score: 3 }), ValidationError);
    await assert.rejects(markWrittenAnswer(repo, g6, { resultId: s(res.id), index: 0, score: 2 }), ValidationError, "an MCQ is not marked by hand");
    await assert.rejects(markWrittenAnswer(repo, other, { resultId: s(res.id), index: wIdx[0], score: 2 }), ForbiddenError);
    let rep = await nafsTestReport(repo, g6, modelTest, klass.id);
    assert.equal(rep.students.find((x) => x.id === student.studentId)!.pending, 2);
    assert.equal(rep.items[wIdx[0]].pct, null, "not counted before marking");
    await markWrittenAnswer(repo, g6, { resultId: s(res.id), index: wIdx[0], score: 2 });
    const g = await markWrittenAnswer(repo, g6, { resultId: s(res.id), index: wIdx[1], score: 1 });
    assert.deepEqual({ points: g.points, pending: g.pending }, { points: 34.5, pending: 0 });
    q = await markingQueue(repo, g6, { testId: modelTest });
    assert.equal(q.waiting, 0);
    assert.equal((await myNafsTests(repo, student)).find((x) => x.id === row.id)!.pct, null, "no score before release");
    await releaseNafsResults(repo, g6, { testId: modelTest, classId: klass.id, release: true });
    const mine = (await myNafsTests(repo, student)).find((x) => x.id === row.id)!;
    assert.equal(mine.pct, 99);
    for (const word of LEVEL_WORDS) assert.ok(!JSON.stringify(mine).includes(word), `students never see "${word}"`);
    // results flow to Reports
    rep = await nafsTestReport(repo, g6, modelTest, klass.id);
    assert.equal(rep.students.find((x) => x.id === student.studentId)!.pct, 99);
    // on paper: a bubble sheet for a classmate; the written answers wait for marking
    await saveNafsAnswers(repo, g6, { testId: modelTest, studentId: klass.students[0].id, answers: key.map((k) => (k < 0 ? null : k)), source: "SHEET" });
    assert.equal((await markingQueue(repo, g6, { testId: modelTest })).waiting, 2);
  });

  test("classification with the teacher's cut-offs, 'Not enough questions' under 2 items, discrimination maths and item flags", async () => {
    assert.equal(classify(80, 2), "MASTERED"); assert.equal(classify(79.99, 2), "DEVELOPING"); assert.equal(classify(50, 3), "DEVELOPING");
    assert.equal(classify(49.9, 3), "SUPPORT"); assert.equal(classify(100, 1), "FEW"); assert.equal(classify(null, 0), "FEW");
    assert.equal(classify(85, 4, { hi: 90, lo: 60 }), "DEVELOPING"); assert.equal(classify(59, 4, { hi: 90, lo: 60 }), "SUPPORT");
    assert.deepEqual(cleanCuts(undefined, undefined), { hi: 80, lo: 50 });
    assert.deepEqual(cleanCuts(70, 90), { hi: 70, lo: 69 });
    assert.deepEqual(cleanCuts("x", ""), { hi: 80, lo: 50 });
    assert.deepEqual([roundPct(1, 3), roundPct(2, 3), roundPct(1, 8), roundPct(0, 0)], [33, 67, 13, null], "nearest whole number, halves up");
    // discrimination: upper vs lower 27%
    assert.deepEqual(discrimination([10, 8, 6, 4, 2], [1, 1, 0, 0, 0]), { d: 1, upper: 1, lower: 0, group: 1 });
    assert.equal(discrimination([10, 8, 6, 4, 2], [0, 1, 1, 1, 1]).d, -1);
    assert.deepEqual(discrimination([9, 8, 7, 6, 5, 4, 3, 2, 1, 0], [1, 1, 0, 1, 0, 1, 0, 0, 1, 0]), { d: 0.33, upper: 0.67, lower: 0.33, group: 3 });
    assert.equal(discrimination([5], [1]).d, null);
    assert.deepEqual(discrimination([10, 8, 6], [1, null, 0]), { d: 1, upper: 1, lower: 0, group: 1 }, "students without a score on the item are left out");
    const f = itemFlags({ pct: 20, d: -0.5, counts: [1, 5, 0, 0], key: 0, blank: 0, answered: 6, kind: "MCQ" });
    assert.ok(f.includes(FLAG.HARD) && f.includes(FLAG.NEG) && f.includes(FLAG.DISTRACTOR));
    // the report: per standard levels with the cut-offs
    const rep80 = await nafsTestReport(repo, g6, modelTest, klassId);
    const rep90 = await nafsTestReport(repo, g6, modelTest, klassId, new Date(), { hi: 90, lo: 60 });
    const me80 = rep80.students.find((x) => x.id === student.studentId)!, me90 = rep90.students.find((x) => x.id === student.studentId)!;
    assert.deepEqual(me80.standards["MOE.S13"], { pct: 83, n: 3, level: "MASTERED" });
    assert.equal(me90.standards["MOE.S13"].level, "DEVELOPING", "the teacher's cut-offs");
    assert.equal(me80.standards["MOE.S11"].level, "FEW", "1 item → Not enough questions");
    assert.equal(rep80.summary.standards.length, 13);
    assert.ok(rep80.items.every((x) => "d" in x && Array.isArray(x.flags)));
    assert.ok(rep80.summary.areas.some((a) => a.key === "VOC") && rep80.summary.texts.some((x) => x.key === "INFO"));
    // a booklet with one question per standard: every cell is "Not enough questions"
    const kite = await buildNafsMinistry(repo, g6, { settings: { questions: 13, booklet: "NB-902", written: true }, seed: "k" });
    kiteTest = await saveNafsTest(repo, g6, { title: "The Lost Kite", mode: "MINISTRY", questionIds: kite.questionIds, timeLimitMin: 30 });
    const kq = await loadNafsQuestions(repo, kite.questionIds);
    const klass = (await nafsClasses(repo, g6)).find((c) => c.id === klassId)!;
    await saveNafsAnswers(repo, g6, { testId: kiteTest, studentId: klass.students[1].id, answers: kite.questionIds.map((id) => { const c = kq.find((x) => x.id === id)!.correct; return c < 0 ? null : c; }), source: "TYPED" });
    const kr = await nafsTestReport(repo, g6, kiteTest, klassId);
    assert.ok(Object.values(kr.students[0].standards).every((c) => c.level === "FEW"));
    // groups needing support → a NAFS plan with the students and the skills
    const weak = await saveNafsTest(repo, g6, { title: "Weak S01", mode: "MANUAL", questionIds: platform["Synonyms and Antonyms"].slice(0, 3), timeLimitMin: 10 });
    const sk = await loadNafsQuestions(repo, platform["Synonyms and Antonyms"].slice(0, 3));
    await saveNafsAnswers(repo, g6, { testId: weak, studentId: klass.students[1].id, answers: sk.map((q) => (q.correct + 1) % 4), source: "TYPED" });
    const wr = await nafsTestReport(repo, g6, weak, klassId);
    const grp = wr.summary.groups.find((x) => x.code === "MOE.S01")!;
    assert.deepEqual(grp.classes[0].support.map((x) => x.id), [klass.students[1].id]);
    assert.match(grp.classes[0].planHref, /^\/teacher\/plans\?tab=nafs&classId=.*&who=group&sid=/);
    assert.ok(wr.summary.weakest.includes("MOE.S01") || wr.summary.standards.length === 1);
  });

  test("across tests, trend, class comparison; Excel sheets per view and the rounding rule; pages tidy and translated", async () => {
    const across = await nafsAcrossReport(repo, g6, klassId);
    assert.ok(across.tests.length >= 3);
    assert.ok(across.summary.standards.length === 13);
    assert.ok(across.students.some((x) => x.id === student.studentId && x.standards["MOE.S01"]));
    const all = await nafsAcrossReport(repo, g6, null);
    assert.ok(all.summary.classCompare.length >= 1);
    const trend = await nafsTrend(repo, g6, klassId);
    assert.ok(trend.some((p) => p.testId === modelTest && p.standards["MOE.S01"] !== null));
    const base = { branding: { name: "Demo", nameAr: null, logo: null }, generatedAt: new Date(), generatedBy: "t" } as never;
    const doc = nafsReportDoc(await nafsTestReport(repo, g6, modelTest, klassId), base);
    const sheets = doc.sections.filter((x) => x.type === "table").map((x) => (x as { id: string }).id);
    for (const id of ["students", "standards", "heat", "levels", "areas", "texts", "skills", "processes", "groups", "compare", "items", "missing"]) assert.ok(sheets.includes(id), id);
    assert.ok(JSON.stringify(doc).includes("rounded to the nearest whole number"));
    assert.ok(nafsAcrossDoc(across, base).sections.some((x) => x.type === "table" && x.id === "tests"));
    // the pages: the Marking tab, the Ministry preset, the plan link, the background booklet load
    const page = read("src/app/teacher/nafs/page.tsx");
    assert.ok(read("src/server/nafs/center.ts").includes('"Marking"') && hasAr("Marking"));
    assert.match(page, /void ensureNafsBooklets\(/, "never awaited: the page does not wait for the booklets");
    assert.match(read("src/components/nafs/reports-tab.tsx"), /Make a NAFS plan for this group/);
    assert.match(read("src/components/nafs/nafs-builder.tsx"), /Number of questions[\s\S]*Time \(minutes\)/); // owner r67: the one builder
    for (const x of ["Ministry booklet model", "Assign to students (online)", "Make a NAFS plan for this group", "Student × standard heat map", "Mastered", "Developing", "Needs support", "Not enough questions", "Short written answer", "NAFS model booklets", "The 13 reading standards", "Number of questions", "Cut-offs"]) assert.ok(hasAr(x), x);
    // students never see level words: the student pages do not use them
    for (const f of ["src/app/student/tests/page.tsx", "src/components/nafs/booklet.tsx", "src/app/student/nafs/sim/[id]/page.tsx"]) for (const w of ["Mastered", "Developing", "Needs support"]) assert.ok(!read(f).includes(w), `${f}: ${w}`);
  });
});

const textOf = (v: unknown) => String(v ?? "");
