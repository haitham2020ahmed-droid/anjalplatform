import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import { ForbiddenError, type Actor } from "../src/server/auth/rbac";
import { workbookXlsx } from "../src/imports/questions/template-files";
import { analyzeImport, commitImportChunk } from "../src/server/admin/question-import";
import { ensureGrammarSkills, grammarCode, grammarLibrary, grammarTable, grammarView, readGrammarWorkbook } from "../src/server/grammar/grammar";
import { assignSkillByLevel } from "../src/server/teacher/skill-assign";
import { assignSkill } from "../src/server/teacher/assign";
import { assignedSkills, isAssignedSkill } from "../src/server/student/assigned";
import { loadSkillItems } from "../src/server/practice/items";
import { curriculumMapPdfData } from "../src/server/curriculum-map/map-pdf";
import { demoDatabase } from "./helpers/db";

const Q_HEAD = ["grade", "lesson_id", "unit", "week", "lesson_number", "lesson_title", "skill_id", "skill", "skill_kind", "question_id", "level", "rit_band_approx", "type", "map_area", "ccss", "passage", "question", "option_A", "option_B", "option_C", "option_D", "answer", "answer_letter", "accepted_answers", "explanation", "source"];
const q = (skill: string, n: number, level: string, type: string, stem: string, opts: string[], answer: string, letter: string, passage = "") =>
  ["4", skill.slice(0, 7), "1", skill.includes("W2") ? "2" : "1", "", "", skill, "", "", `${skill}-Q${n}`, level, "", type, "", "L.4.1f", passage, stem, ...[0, 1, 2, 3].map((i) => opts[i] ?? ""), answer, letter, "", `Because ${answer} is right.`, "Book"];

function grammarFile(): Uint8Array {
  const rows: string[][] = [Q_HEAD];
  // skill 1: 12 multiple choice, every answer on A in the file
  const W = ["dog", "teacher", "river", "farmer", "pilot", "baker", "rabbit", "doctor", "painter", "sailor", "singer", "miner"];
  const V = ["ran home", "smiled warmly", "flooded the valley", "planted corn", "landed safely", "sold fresh rolls", "hid underground", "helped patients", "mixed bright colors", "crossed the ocean", "won a prize", "found gold"];
  for (let i = 1; i <= 12; i++) rows.push(q("G4-U1W1-S1", i, ["Below", "On", "Above"][i % 3], "mcq", `Which group of words about the ${W[i - 1]} is a complete sentence?`, [`The ${W[i - 1]} ${V[i - 1]}.`, `${V[i - 1]} yesterday.`, `The tired ${W[i - 1]}.`, `Near the ${W[i - 1]}.`], `The ${W[i - 1]} ${V[i - 1]}.`, "A"));
  // skill 2: true/false and a 3-choice fill-in, one with a passage
  rows.push(q("G4-U1W1-S2", 1, "Below", "true_false", "This is a question: Are we there yet?", ["True", "False"], "True", ""));
  rows.push(q("G4-U1W1-S2", 2, "On", "fill_blank", "Choose the word: The baker _____ bread.", ["bakes", "very", "under"], "bakes", "A"));
  rows.push(q("G4-U1W2-S1", 1, "Above", "mcq", "Which sentence in the paragraph has a capital-letter mistake?", ["Sentence 1", "Sentence 2", "Sentence 3", "Sentence 4"], "Sentence 2", "B", "(1) We went home. (2) then we ate. (3) It was late. (4) We slept."));
  return workbookXlsx([
    { name: "Questions", rows, widths: [10] },
    { name: "Skills", widths: [10], rows: [["grade", "lesson_id", "lesson_title", "skill_id", "skill", "skill_kind", "ccss", "rule_summary"],
      ["4", "G4-U1W1", "Sentences", "G4-U1W1-S1", "Sentences and Sentence Fragments", "Grammar & Usage", "L.4.1f, W.4.5", "A sentence shows a complete thought."],
      ["4", "G4-U1W1", "Sentences", "G4-U1W1-S2", "Four Types of Sentences", "Grammar & Usage", "L.4.1f", "Statements, questions, commands, exclamations."],
      ["4", "G4-U1W2", "Capital Letters", "G4-U1W2-S1", "Capital Letters", "Mechanics", "L.4.2a", "Begin every sentence with a capital letter."]] },
    { name: "Lessons", widths: [10], rows: [["grade", "lesson_id", "unit", "week", "lesson_number", "title"], ["4", "G4-U1W1", "1", "1", "", "Sentences and Types of Sentences"], ["4", "G4-U1W2", "1", "2", "", "Capitalization"]] },
  ]);
}

describe("🔤 Grammar: one bank, real skills, assigned and practised like every skill", () => {
  let repo: SqliteRepo; let admin: Actor; let teacher: Actor; let student: Actor; let classId: string;
  const actorFor = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);
  before(async () => {
    ({ repo } = await demoDatabase());
    [admin, teacher] = await Promise.all(["demo.admin", "demo.teacher.4a"].map(actorFor));
  });

  test("the file becomes Grade 4 skills (with standards and a MAP Language goal) and its questions go through the normal import", async () => {
    const wb = readGrammarWorkbook(grammarFile());
    await assert.rejects(ensureGrammarSkills(repo, teacher, wb, 4), ForbiddenError, "only admins load the bank");
    const r = await ensureGrammarSkills(repo, admin, wb, 4);
    assert.deepEqual([r.created, r.updated, r.skills], [3, 0, 3]);
    const again = await ensureGrammarSkills(repo, admin, wb, 4);
    assert.deepEqual([again.created, again.updated], [0, 3], "loading again updates, never duplicates");
    const sk = (await repo.findMany("Skill", { code: grammarCode(4, "G4-U1W2-S1") }))[0];
    assert.equal(sk.category, "MECHANICS");
    const fam = (await repo.findUnique("SkillFamily", { id: sk.familyId }))!;
    assert.equal((await repo.findUnique("MapGoalArea", { id: fam.mapGoalAreaId }))?.code, "LANG_MECHANICS");

    const table = grammarTable(wb, 4);
    assert.equal(table.length, 16);
    const col = (h: string) => table[0].indexOf(h);
    const s1 = table.slice(1).filter((x) => x[col("Skill")] === grammarCode(4, "G4-U1W1-S1"));
    assert.deepEqual([...new Set(s1.map((x) => x[col("Correct Answer")]))].sort(), ["A", "B", "C", "D"], "the correct letter is spread over A–D");
    const order = s1.map((x) => x[col("Correct Answer")]).join("");
    assert.notEqual(order, "ABCDABCDABCD", "a shuffled order, never a fixed A-B-C-D pattern");
    for (const l of "ABCD") assert.equal(order.split(l).length - 1, 3, "each letter equally often");
    for (const x of s1) assert.match(x[col(`Option ${x[col("Correct Answer")]}`)], /^The (dog|teacher|river|farmer|pilot|baker|rabbit|doctor|painter|sailor|singer|miner) (?!\w+\.$)/, "the right text moves with its letter");
    assert.deepEqual(table.slice(1).map((x) => x[col("Question Type")]).slice(12), ["True/False", "Multiple Choice", "Multiple Choice"]);

    const jobId = await analyzeImport(repo, admin, { fileName: "Grammar Grade 4.xlsx", bytes: new Uint8Array([1]), target: "BANK", table });
    const job = (await repo.findUnique("ImportJob", { id: jobId }))!;
    assert.deepEqual([Number(job.validRows), Number(job.errorRows)], [15, 0], JSON.stringify(job.errors));
    let last; do last = await commitImportChunk(repo, admin, jobId, { publish: true }); while (!last.done);
    assert.equal(last.counts.imported, 15);
  });

  test("the 🔤 Grammar page: Unit → Week → Skill with the questions of each level", async () => {
    const v = await grammarView(repo, admin, { grade: 4 });
    assert.ok(v.loaded);
    assert.deepEqual(v.units.map((u) => [u.unit, u.weeks.map((w) => [w.week, w.title, w.skills.length])]), [[1, [[1, "Sentences and Types of Sentences", 2], [2, "Capitalization", 1]]]]);
    const first = v.units[0].weeks[0].skills[0];
    assert.deepEqual(first.counts, { below: 4, on: 4, above: 4, total: 12 });
    assert.deepEqual(first.standards.slice(0, 2), ["L.4.1.F", "W.4.5"]);
    assert.equal(v.totals.questions, 15);
    const tv = await grammarView(repo, teacher);
    assert.ok(tv.classId && tv.students.length > 0 && tv.grade === 4, "the teacher sees their class and its students");
    classId = tv.classId!;
  });

  test("⭐ Assign: the grammar skill appears in the student's assigned work and can be practised", async () => {
    const skillId = (await repo.findMany("Skill", { code: grammarCode(4, "G4-U1W1-S1") }))[0].id as string;
    const tv = await grammarView(repo, teacher, { classId });
    const r = await assignSkill(repo, teacher, { source: "CURRICULUM", classId, skillId, studentIds: [tv.students[0].id] });
    assert.equal(r.students, 1);
    const st = (await repo.findUnique("Student", { id: tv.students[0].id }))!;
    student = await resolveActor(repo, (await repo.findUnique("User", { id: st.userId }))!);
    const mine = (await assignedSkills(repo, student)).items.find((i) => i.skillId === skillId)!;
    assert.deepEqual([mine.skill, mine.grammar, mine.track], ["Sentences and Sentence Fragments", true, "CURRICULUM"]);
    assert.ok(await isAssignedSkill(repo, student, skillId));
    assert.equal((await loadSkillItems(repo, skillId)).length, 12, "every published question is ready for adaptive practice");
    assert.equal((await grammarView(repo, teacher, { classId })).units[0].weeks[0].skills[0].openAssignments, 1);
  });

  test("🗺️ linked into the Curriculum Map itself, in the book's own unit order", async () => {
    // Grades 4–5 (Wonders: unit + week known): both G4-U1W1 (week 1) and G4-U1W2 (week 2) land on Unit 1's
    // Text Set 1 (weeks 1–2) — the same Text Set already loaded from grade-4.json's own reading skills.
    const d4 = (await curriculumMapPdfData(repo, admin.schoolId!, 4))!;
    const names = (u: number, s: number) => d4.units[u - 1].sections[s - 1].skills.filter((k) => k.group === "grammar").map((k) => k.name);
    for (const n of ["Capital Letters", "Four Types of Sentences", "Sentences and Sentence Fragments"]) assert.ok(names(1, 1).includes(n), `${n}: Unit 1 / Text Set 1 (weeks 1–2)`);
    for (const n of ["Capital Letters", "Four Types of Sentences", "Sentences and Sentence Fragments"]) assert.ok(!names(1, 2).includes(n), `${n}: not Text Set 2`);

    // Grade 6 (StudySync: no unit/week, only a sequence) — the same relative position among the grade's
    // selections, in unit order: lesson 1 of 4 -> the grade's 1st selection, lesson 4 of 4 -> its last.
    const Q_HEAD6 = ["grade", "lesson_id", "unit", "week", "lesson_number", "lesson_title", "skill_id", "skill", "skill_kind", "question_id", "level", "rit_band_approx", "type", "map_area", "ccss", "passage", "question", "option_A", "option_B", "option_C", "option_D", "answer", "answer_letter", "accepted_answers", "explanation", "source"];
    const q6 = (skillId: string, n: number) => ["6", skillId, "", "", String(n), "", skillId, "", "", `${skillId}-Q${n}`, "On", "", "mcq", "", "L.6.1a", "", "Pick the correct form.", "Right.", "Wrong.", "", "", "Right.", "A", "", "Because it's right.", "Book"];
    const rows6: string[][] = [Q_HEAD6];
    for (let i = 1; i <= 6; i++) rows6.push(q6(`G6-L${i}-S1`, i));
    const wb6 = readGrammarWorkbook(workbookXlsx([
      { name: "Questions", rows: rows6, widths: [10] },
      { name: "Skills", widths: [10], rows: [["grade", "lesson_id", "lesson_title", "skill_id", "skill", "skill_kind", "ccss"],
        ...Array.from({ length: 4 }, (_, i) => ["6", `G6-L${i + 1}`, `Lesson ${i + 1}`, `G6-L${i + 1}-S1`, `Grammar skill ${i + 1}`, "Grammar & Usage", "L.6.1a"])] },
      { name: "Lessons", widths: [10], rows: [["grade", "lesson_id", "unit", "week", "lesson_number", "title"],
        ...Array.from({ length: 4 }, (_, i) => ["6", `G6-L${i + 1}`, "0", "0", String(i + 1), `Lesson ${i + 1}`])] },
    ]));
    await ensureGrammarSkills(repo, admin, wb6, 6);
    const d6 = (await curriculumMapPdfData(repo, admin.schoolId!, 6))!;
    const all6 = d6.units.flatMap((u) => u.sections);
    const unitOf = (name: string) => d6.units.find((u) => u.sections.some((x) => x.skills.some((k) => k.name === name)))!.number;
    assert.equal(unitOf("Grammar skill 1"), d6.units[0].number, "the first grammar lesson -> the grade's first selection's unit");
    assert.equal(unitOf("Grammar skill 4"), d6.units[d6.units.length - 1].number, "the last grammar lesson -> the grade's last selection's unit");
    // in order: later grammar lessons never land on an earlier selection than an earlier one did
    const posOf = (name: string) => all6.findIndex((x) => x.skills.some((k) => k.name === name));
    for (let i = 1; i <= 3; i++) assert.ok(posOf(`Grammar skill ${i}`) <= posOf(`Grammar skill ${i + 1}`), `lesson ${i} before lesson ${i + 1}`);
  });

  test("🔤 one library: every grammar lesson in one list for every teacher; any lesson goes to any class", async () => {
    const lib = await grammarLibrary(repo, teacher);
    assert.ok(["Sentences and Sentence Fragments", "Four Types of Sentences", "Capital Letters"].every((n) => lib.lessons.some((l) => l.name === n)), "all the lessons, no grade or unit split");
    assert.deepEqual((await grammarLibrary(repo, admin)).lessons.map((l) => l.id), lib.lessons.map((l) => l.id), "the same list for everyone");
    // a Grade 4 lesson to a class of another grade (grammar only)
    const skillId = (await repo.findMany("Skill", { code: grammarCode(4, "G4-U1W2-S1") }))[0].id as string;
    const t5 = await resolveActor(repo, (await repo.findUnique("User", { username: "demo.teacher.5a" }))!).catch(() => null);
    if (t5) {
      const c5 = (await grammarView(repo, t5, {})).classId;
      if (c5) { const r = await assignSkillByLevel(repo, t5, { source: "CURRICULUM", classId: c5, skillId, mode: "AUTOMATIC" }); assert.ok(r.groups.some((g) => g.students > 0)); }
    }
  });
});

