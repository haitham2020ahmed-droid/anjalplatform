/**
 * UI reorg — integration of the wave-1 pieces (Test School, in-memory database, invented students only):
 *  - Assessments read a skill's questions through Phase 1's shared questionsOfSkill (same bank as search / MAP / NAFS)
 *  - the general NAFS plan is built from the admin-edited NAFS areas and skill → area links
 *  - a NAFS test personalizes each student's NAFS plan (button, and the daily job once all submitted / after the due date)
 *  - Reteach works for skills of another grade (no "not added: other grade" fallback any more)
 *  - every interface string of the wave-1 pages is in the translation file with Arabic; unified verbs
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import { ForbiddenError, type Actor } from "../src/server/auth/rbac";
import { ValidationError } from "../src/server/curriculum-admin";
import { seedTestEnvironment, rightAnswer } from "../src/server/seeding/test-env";
import { teacherRoster } from "../src/server/teacher/assign";
import { assignedSkills } from "../src/server/student/assigned";
import { startQuiz, submitQuizAnswer } from "../src/server/practice/session";
import { loadQuestionItems, type ClientQuestion, type PracticeItem } from "../src/server/practice/items";
import { questionsOfSkill as testQuestions } from "../src/server/tests/question-source";
import { questionsOfSkill as sharedQuestions, LEVEL_OF } from "../src/server/questions/skill-questions";
import { linkNafsFamily, nafsAreas, saveNafsArea } from "../src/server/nafs/nafs-links";
import { nafsAreaList, nafsAreaSkills } from "../src/server/plans/nafs-areas";
import { myPlans, myWorkItems, PLAN_TYPES, proposePlan, schoolGrades } from "../src/server/plans/wizard";
import { KIND_LABEL } from "../src/server/questions/link-review";
import { assignTest, autoPersonalizeNafsTests, builderSkills, personalizeNafsFromTest, previewTest, reteach, testResults, TEST_TYPE_NAME } from "../src/server/tests/assessments";
import { pregenerate } from "../src/server/tts/pregenerate";
import type { TtsEnv } from "../src/server/tts/env";
import { ar } from "../src/i18n/ar";
import { UI_STRINGS } from "../src/i18n";
import { demoDatabase, ROOT } from "./helpers/db";

const AUTO = new Set(["MULTIPLE_CHOICE", "MULTI_SELECT", "DROPDOWN", "TRUE_FALSE"]);
const DAY = 86_400_000;

describe("UI reorg integration — wave 1 pieces work together", () => {
  let repo: SqliteRepo;
  let teacher: Actor, otherTeacher: Actor, student: Actor, classmate: Actor, admin: Actor;
  let classId: string, schoolId: string;
  const items = new Map<string, PracticeItem>();
  before(async () => {
    ({ repo } = await demoDatabase());
    await seedTestEnvironment(repo, { root: process.cwd(), passwordHash: "x".repeat(60), practice: "none" });
    const a = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);
    [teacher, otherTeacher, student, classmate, admin] = await Promise.all(["test.teacher.1", "test.teacher.3", "test.student.005", "test.student.006", "test.admin"].map(a));
    classId = (await teacherRoster(repo, teacher))[0].id;
    schoolId = String(teacher.schoolId);
  });

  async function answerShown(q: ClientQuestion, right: boolean): Promise<unknown> {
    if (!items.has(q.questionId)) for (const it of await loadQuestionItems(repo, [q.questionId])) items.set(it.questionId, it);
    const it = items.get(q.questionId)!;
    if (q.options && it.options) {
      const good = it.options.filter((o) => o.correct).map((o) => o.text);
      const pick = q.options.filter((o) => (right ? good.includes(o.text) : !good.includes(o.text)));
      const labels = right ? pick.map((o) => o.label) : [pick[0].label];
      return it.type === "MULTI_SELECT" ? labels : labels[0];
    }
    if (!right && it.type === "TRUE_FALSE") return !it.answer;
    return rightAnswer(it);
  }
  /** Reading skills of a grade whose published questions are all auto-marked choice questions. */
  async function choiceSkills(grade: number, n: number): Promise<{ skillId: string; name: string }[]> {
    const out: { skillId: string; name: string }[] = [];
    for (const k of await builderSkills(repo, teacher, { filter: "READING", grade })) {
      const qs = await repo.findMany("Question", { skillId: k.id, status: "PUBLISHED", deletedAt: null }, { select: ["id", "typeId"] });
      const types = qs.length ? await repo.findMany("QuestionType", { id: { in: [...new Set(qs.map((q) => q.typeId))] } }) : [];
      if (qs.length >= 4 && qs.every((q) => AUTO.has(String(types.find((t) => t.id === q.typeId)?.code)))) out.push({ skillId: k.id, name: k.name });
      if (out.length === n) break;
    }
    assert.equal(out.length, n, `${n} Grade ${grade} reading skill(s) with choice questions`);
    return out;
  }
  /** The student takes the test: right answers on `rightSkills`, wrong on the others. */
  async function take(who: Actor, assignmentId: string, rightSkills: Set<string>): Promise<void> {
    let v = await startQuiz(repo, who, assignmentId);
    const ids = (await repo.findMany("AssessmentQuestion", { assessmentId: (await repo.findUnique("Assignment", { id: assignmentId }))!.assessmentId })).map((x) => x.questionId);
    const skillOf = new Map((await repo.findMany("Question", { id: { in: ids } })).map((q) => [String(q.id), String(q.skillId)]));
    while (v.question) {
      const r = await submitQuizAnswer(repo, who, { assignmentId, questionId: v.question.questionId, response: await answerShown(v.question, rightSkills.has(skillOf.get(v.question.questionId)!)) });
      v = r.view;
    }
  }
  const setOf = async (testId: string, who: Actor) => String((await repo.findMany("AssignmentStudent", { studentId: who.studentId, assignmentId: { in: (await repo.findMany("Assignment", { testId })).map((a) => a.id) } }))[0].assignmentId);

  test("Assessments take a skill's questions from Phase 1's shared questionsOfSkill (same questions, same levels)", async () => {
    const src = readFileSync(join(ROOT, "src/server/tests/question-source.ts"), "utf8");
    assert.match(src, /from "\.\.\/questions\/skill-questions"/, "the adapter calls the shared function");
    assert.doesNotMatch(src, /repo\.findMany\("Question"/, "no question selection of its own any more");
    const [k] = await choiceSkills(4, 1);
    const mine = await testQuestions(repo, schoolId, k.skillId);
    const shared = await sharedQuestions(repo, schoolId, k.skillId, { take: 1000 });
    assert.ok(mine.length > 0);
    assert.deepEqual(mine.map((q) => q.id).sort(), shared.map((q) => q.id).sort(), "an all-choice skill: exactly the shared set");
    const levelOf = new Map(shared.map((q) => [q.id, q.difficultyLevel >= 5 ? "ABOVE" : LEVEL_OF(q.difficultyLevel)]));
    for (const q of mine) assert.equal(q.level, levelOf.get(q.id), "level from the difficulty (1–3 Below, 4 On, 5–7 Above)");
    for (const lv of ["BELOW", "ON", "ABOVE"] as const) assert.ok((await testQuestions(repo, schoolId, k.skillId, { level: lv })).every((q) => q.level === lv));
    // a skill with hand-marked questions: those never go into a test
    const anySkill = (await repo.findMany("Question", { status: "PUBLISHED", deletedAt: null }, { select: ["skillId", "typeId"] }));
    const manualTypes = new Set((await repo.findMany("QuestionType", {})).filter((t) => t.code === "SHORT_ANSWER" || t.isAutoScored === false || t.isAutoScored === 0).map((t) => String(t.id)));
    const withManual = anySkill.find((q) => manualTypes.has(String(q.typeId)));
    if (withManual) {
      const ids = new Set((await testQuestions(repo, schoolId, String(withManual.skillId))).map((q) => q.id));
      const manualIds = (await repo.findMany("Question", { skillId: withManual.skillId, status: "PUBLISHED", deletedAt: null })).filter((q) => manualTypes.has(String(q.typeId))).map((q) => String(q.id));
      assert.ok(manualIds.every((id) => !ids.has(id)));
    }
    // the preview of a test uses it (count per skill honoured)
    const p = await previewTest(repo, teacher, { skills: [{ skillId: k.skillId, count: 3 }], levelMode: "SAME" });
    assert.equal(p.versions.SAME!.length, 3);
    assert.ok(p.versions.SAME!.every((q) => mine.some((m) => m.id === q.id)));
  });

  test("NAFS plan (general) is built from the admin-edited NAFS areas and skill → area links", async () => {
    const areas = await nafsAreaList(repo);
    assert.deepEqual(areas.map((a) => a.code), ["RC_LIT", "RC_INFO", "VOCAB", "GRAMMAR", "WRITING"], "the admin's list (created once)");
    const p1 = await proposePlan(repo, teacher, { classId, type: "NAFS" });
    assert.ok(p1.skills.length > 0, p1.notes.join(" "));
    const used = areas.filter((a) => p1.skills.some((k) => k.reason === `NAFS: ${a.name}`));
    assert.ok(used.length >= 2, "skills come from several areas, labelled with the admin's area names");
    // the admin renames an area → the plan uses the new name
    const all = await nafsAreas(repo);
    const target = all.find((a) => a.code === used[0].code)!;
    await saveNafsArea(repo, admin, { id: target.id, name: "Stories and Poems (admin)", isActive: true });
    const p2 = await proposePlan(repo, teacher, { classId, type: "NAFS" });
    assert.ok(p2.skills.some((k) => k.reason === "NAFS: Stories and Poems (admin)"));
    // the admin switches it off → its skills leave the general plan
    await saveNafsArea(repo, admin, { id: target.id, name: "Stories and Poems (admin)", isActive: false });
    assert.ok(!(await nafsAreaList(repo)).some((a) => a.code === target.code));
    const p3 = await proposePlan(repo, teacher, { classId, type: "NAFS" });
    assert.ok(!p3.skills.some((k) => k.reason.includes("Stories and Poems")));
    await saveNafsArea(repo, admin, { id: target.id, name: target.name, isActive: true });
    // the admin links a skill family to another area → the skill moves there
    const grade = (await schoolGrades(repo, schoolId)).find((g) => g.level === p1.skillGrade)!;
    const moved = p1.skills.find((k) => k.reason === `NAFS: ${used[0].name}`)!;
    const fam = String((await repo.findUnique("Skill", { id: moved.id }))!.familyId);
    const other = areas.find((a) => a.code !== used[0].code && a.code !== "WRITING")!;
    await linkNafsFamily(repo, admin, fam, other.code);
    const byArea = await nafsAreaSkills(repo, schoolId, grade.curriculumIds);
    assert.ok(byArea.find((a) => a.code === other.code)!.skills.some((k) => k.id === moved.id), "linked by the admin");
    assert.ok(!byArea.find((a) => a.code === used[0].code)!.skills.some((k) => k.id === moved.id));
    // the counts are the shared bank counts
    const counted = byArea.flatMap((a) => a.skills).find((k) => k.id === moved.id)!;
    assert.equal(counted.questions, (await sharedQuestions(repo, schoolId, moved.id, { take: 1000 })).length);
    // the plans page lists the admin's areas (no local list any more)
    assert.doesNotMatch(readFileSync(join(ROOT, "src/app/teacher/plans/page.tsx"), "utf8"), /NAFS_AREAS/);
    assert.doesNotMatch(readFileSync(join(ROOT, "src/server/plans/nafs-areas.ts"), "utf8"), /match: \//, "no local regex list");
  });

  test("a NAFS test personalizes each student's NAFS plan from the skills they missed (once; own classes only)", async () => {
    const [s1, s2] = await choiceSkills(4, 2);
    const p = await previewTest(repo, teacher, { skills: [{ skillId: s1.skillId, count: 3 }, { skillId: s2.skillId, count: 3 }], levelMode: "SAME" });
    const t = await assignTest(repo, teacher, { classId, type: "NAFS", title: "NAFS practice 1", questions: { SAME: p.versions.SAME!.map((x) => x.id) }, studentIds: [student.studentId!, classmate.studentId!] });
    await assert.rejects(personalizeNafsFromTest(repo, teacher, t.testId), ValidationError, "nobody finished yet");
    await take(student, await setOf(t.testId, student), new Set([s1.skillId])); // right on s1, wrong on s2
    await assert.rejects(personalizeNafsFromTest(repo, otherTeacher, t.testId), ForbiddenError, "another teacher's class");
    const r = await personalizeNafsFromTest(repo, teacher, t.testId);
    assert.deepEqual([r.already, r.plans, r.students, r.skills], [false, 1, 1, 1]);
    const plan = (await myPlans(repo, student)).find((x) => x.title === "NAFS Plan (personal) · NAFS practice 1");
    assert.ok(plan, "in the student's My Plans");
    assert.equal(plan!.source, "NAFS");
    const work = await myWorkItems(repo, student);
    assert.equal(work.find((w) => w.skillId === s2.skillId)?.source, "NAFS", "the missed skill is in My Work with the NAFS tag");
    assert.ok(!work.some((w) => w.skillId === s1.skillId && w.source === "NAFS"), "a skill scored 100% is not added");
    assert.ok(!(await myPlans(repo, classmate)).some((x) => x.title.includes("NAFS practice 1")), "not for a student who has not finished");
    assert.equal((await repo.findUnique("TeacherTest", { id: t.testId }))!.nafsPlanAt !== null, true);
    assert.ok((await testResults(repo, teacher, t.testId)).test.nafsPlanAt, "the results page shows it was done");
    assert.equal((await personalizeNafsFromTest(repo, teacher, t.testId)).already, true, "once per test");
    // only NAFS tests
    const w = await assignTest(repo, teacher, { classId, type: "WEEKLY_QUIZ", title: "Quiz X", levelMode: "SAME", questions: { SAME: p.versions.SAME!.slice(0, 2).map((x) => x.id) }, studentIds: [student.studentId!] });
    await assert.rejects(personalizeNafsFromTest(repo, teacher, w.testId), ValidationError);
  });

  test("the daily job personalizes NAFS tests when everyone submitted or the due date passed (bounded, never twice)", async () => {
    const [s1] = await choiceSkills(4, 1);
    const p = await previewTest(repo, teacher, { skills: [{ skillId: s1.skillId, count: 3 }], levelMode: "SAME" });
    const q = { SAME: p.versions.SAME!.map((x) => x.id) };
    const now = new Date();
    // A: everyone (one student) submitted, due date still ahead
    const a = await assignTest(repo, teacher, { classId, type: "NAFS", title: "NAFS practice A", questions: q, studentIds: [classmate.studentId!], dueAt: new Date(now.getTime() + 7 * DAY) });
    await take(classmate, await setOf(a.testId, classmate), new Set());
    // B: nobody submitted yet, due date ahead → waits
    const b = await assignTest(repo, teacher, { classId, type: "NAFS", title: "NAFS practice B", questions: q, studentIds: [student.studentId!, classmate.studentId!], dueAt: new Date(now.getTime() + 3 * DAY) });
    const r1 = await autoPersonalizeNafsTests(repo, schoolId, now);
    assert.ok(r1.personalized >= 1);
    assert.ok((await repo.findUnique("TeacherTest", { id: a.testId }))!.nafsPlanAt, "A done (all submitted)");
    assert.equal((await repo.findUnique("TeacherTest", { id: b.testId }))!.nafsPlanAt ?? null, null, "B waits for the due date");
    assert.ok((await myWorkItems(repo, classmate)).some((x) => x.skillId === s1.skillId && x.source === "NAFS"));
    // B: one student finishes; after the due date the job personalizes it
    await take(student, await setOf(b.testId, student), new Set());
    const r2 = await autoPersonalizeNafsTests(repo, schoolId, new Date(now.getTime() + 4 * DAY));
    assert.ok(r2.personalized >= 1);
    assert.ok((await repo.findUnique("TeacherTest", { id: b.testId }))!.nafsPlanAt);
    const r3 = await autoPersonalizeNafsTests(repo, schoolId, new Date(now.getTime() + 5 * DAY));
    assert.equal(r3.personalized, 0, "never twice");
    // wired into the daily job
    assert.match(readFileSync(join(ROOT, "src/server/insights/daily.ts"), "utf8"), /autoPersonalizeNafsTests\(repo, schoolId, now\)/);
  });

  test("Reteach adds a skill of ANOTHER grade to the student's My Work (cross-grade allowed)", async () => {
    const own = Number((await repo.findUnique("Grade", { id: (await repo.findUnique("Class", { id: classId }))!.gradeId }))!.level);
    const otherGrade = own === 6 ? 5 : 6;
    const [g] = await choiceSkills(otherGrade, 1);
    const p = await previewTest(repo, teacher, { skills: [{ skillId: g.skillId, count: 3 }], levelMode: "SAME" });
    const t = await assignTest(repo, teacher, { classId, type: "CHAPTER_TEST", title: "Cross-grade check", questions: { SAME: p.versions.SAME!.map((x) => x.id) }, studentIds: [student.studentId!] });
    await take(student, await setOf(t.testId, student), new Set());
    const res = await testResults(repo, teacher, t.testId);
    assert.equal(res.skills[0].grade, otherGrade);
    const r = await reteach(repo, teacher, t.testId);
    assert.deepEqual([r.assigned, r.students, r.skipped], [1, 1, []], "nothing left out because of the grade");
    const work = (await assignedSkills(repo, student)).items;
    const added = work.find((i) => i.kind === "skill" && i.skillId === g.skillId);
    assert.ok(added, `the Grade ${otherGrade} skill is in a Grade ${own} student's My Work`);
    assert.equal(String(added!.note), "Reteach: Cross-grade check");
    assert.doesNotMatch(readFileSync(join(ROOT, "src/app/teacher/assessments/actions.ts"), "utf8"), /Not added: /);
  });

  test("pre-generation covers ReadRise texts only when asked (--readrise), counting each level version once", async () => {
    const art = await repo.create("RRArticle", { schoolId: null, code: "integ-rr-1", title: "The Quiet Reef", topic: "Science", pollStatement: "Reefs matter.", status: "PUBLISHED" });
    for (const level of [500, 800]) await repo.create("RRVersion", { articleId: art.id, level, title: "The Quiet Reef", body: `An invented text about a reef at level ${level}. Fish swim near the coral.`, wordCount: 14, estLevel: level });
    const env = {} as TtsEnv;
    const logs: string[] = [];
    const rr = await pregenerate(repo, env, { only: ["readrise"], log: (s) => logs.push(s) });
    assert.ok(rr.texts >= 2 && rr.missing >= 2, "both level versions are counted");
    assert.equal(rr.apply, false, "a dry run by default");
    assert.ok(logs.some((l) => l.startsWith("readrise:")));
    assert.ok(!(await pregenerate(repo, env, { log: (s) => logs.push(`default ${s}`) }).then(() => logs.some((l) => l.startsWith("default readrise:")))), "not in the default run");
  });
});

// ------------------------------------------------------------------ interface language (no database)

const WAVE1 = [
  "src/app/teacher/plans/page.tsx", "src/app/teacher/plans/[planId]/page.tsx", "src/app/teacher/plans/curriculum/page.tsx", "src/app/teacher/plans/actions.ts",
  "src/app/teacher/assessments/page.tsx", "src/app/teacher/assessments/[testId]/page.tsx", "src/app/teacher/assessments/new/page.tsx", "src/app/teacher/assessments/new/test-builder.tsx", "src/app/teacher/assessments/actions.ts",
  "src/app/student/tests/page.tsx", "src/app/student/tests/[assignmentId]/page.tsx", "src/app/admin/tests/page.tsx",
  "src/components/tests/admin-tests-widget.tsx", "src/components/tests/test-review-view.tsx",
  "src/app/admin/nafs-links/page.tsx", "src/app/admin/nafs-links/actions.ts", "src/app/admin/skill-links/page.tsx", "src/app/admin/skill-links/actions.ts",
  "src/components/listen-button.tsx",
];
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const KNOWN = new Set<string>(UI_STRINGS);
const ARABIC = /[؀-ۿ]/;

/** Interface strings a file passes to t()/tr() or to the kit / page-header components (which translate them). */
function interfaceStrings(src: string): string[] {
  const out = new Set<string>();
  const add = (re: RegExp, groups: number[]) => { for (const m of src.matchAll(re)) for (const g of groups) if (m[g] !== undefined) out.add(m[g]); };
  add(/\btr?\(\s*"((?:[^"\\]|\\.)*)"/g, [1]);
  add(/\btr?\([^()]*?\?\s*"((?:[^"\\]|\\.)*)"\s*:\s*"((?:[^"\\]|\\.)*)"\s*[,)]/g, [1, 2]);
  add(/<(?:PageHeader|Section|EmptyState)\b[^>]*?\btitle="([^"]*)"/g, [1]);
  add(/<EmptyState\b[^>]*?\btext="([^"]*)"/g, [1]);
  add(/<EmptyState\b[^>]*?\btext=\{[^}]*?\?\s*"([^"]*)"\s*:\s*"([^"]*)"\s*\}/g, [1, 2]);
  add(/\bback=\{\{[^}]*label: "([^"]*)"/g, [1]);
  add(/\baction=\{\{[^}]*label: "([^"]*)"/g, [1]);
  add(/\bbackLabel="([^"]*)"/g, [1]);
  return [...out];
}

describe("Arabic interface strings for every wave-1 page", () => {
  test("every interface string of the wave-1 pages is in en.ts with an Arabic version", () => {
    const missing: string[] = [];
    for (const f of WAVE1) for (const s of interfaceStrings(read(f))) if (!KNOWN.has(s)) missing.push(`${f}: ${s}`);
    assert.deepEqual(missing, []);
    for (const f of WAVE1) assert.match(read(f), /getT\(\)|useT\(\)/, `${f} uses the translation function`);
  });

  test("no untranslated text left in the JSX of the wave-1 pages", () => {
    const hits: string[] = [];
    for (const f of WAVE1) {
      for (const m of read(f).matchAll(/(?<![=\-])>([^<>{}"`\n=;()]*[A-Za-z]{2}[^<>{}"`\n=;()]*)</g)) {
        const text = m[1].trim();
        if (/^[;:]/.test(text) || /^\s*:/.test(m[1]) || /^(⬇ )?PDF$/.test(text)) continue;
        hits.push(`${f}: ${text}`);
      }
      for (const m of read(f).matchAll(/\b(?:placeholder|aria-label|title)="([A-Za-z][^"]*)"/g)) if (!/<(?:PageHeader|Section|EmptyState)\b[^>]*$/.test(read(f).slice(0, m.index).split("\n").pop() ?? "")) hits.push(`${f}: ${m[1]}`);
    }
    assert.deepEqual(hits, []);
  });

  test("labels the pages translate at run time (plan types, test types, review kinds, player labels, sources)", () => {
    const want = [
      ...PLAN_TYPES.flatMap((p) => [p.label, p.text]), ...Object.values(TEST_TYPE_NAME), ...Object.values(KIND_LABEL),
      "Below Level version", "On Level version", "Above Level version", "All", "Reading", "Grammar", "Vocabulary",
      "Curriculum", "MAP", "NAFS", "RTI", "Custom", "Chosen by the teacher", "Added by the teacher",
      "This grade has no curriculum yet — you can still assign skills from any grade.",
      "Listen", "Stop", "Slow", "Normal", "Follow along", "Voice", "Reading speed",
    ];
    // every ListenButton label anywhere in the app
    const listen = ["src/app/student/readmaster/[articleId]/page.tsx", "src/components/learn/question-set.tsx", "src/components/practice/practice-frame.tsx", "src/app/quiz/[assignmentId]/quiz-player.tsx", "src/components/lessons/lesson-player.tsx", "src/components/game/skill-game.tsx", "src/app/student/respond/[code]/page.tsx", "src/components/readrise/reader.tsx"];
    for (const f of listen) for (const m of read(f).matchAll(/<ListenButton\b[^>]*?\blabel="([^"]*)"/g)) want.push(m[1]);
    const missing = want.filter((s) => !KNOWN.has(s));
    assert.deepEqual(missing, []);
    for (const s of want) if (!["MAP", "RTI"].includes(s)) assert.match(ar[s as keyof typeof ar], ARABIC, s);
  });

  test("the integration section of the translation file is there and every string in it is Arabic", () => {
    const en = read("src/i18n/en.ts");
    const at = en.indexOf("// ---- wave-1 pages (integration)");
    assert.ok(at > 0);
    const keys = [...en.slice(at).matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1]);
    assert.ok(keys.length > 200);
    for (const k of keys) assert.match(ar[k as keyof typeof ar] ?? "", ARABIC, k);
    assert.match(read("src/i18n/ar.ts"), /\/\/ ---- wave-1 pages \(integration\)/);
  });

  test("questions, passages and answers stay English inside the Arabic pages (marked as content)", () => {
    assert.match(read("src/components/tests/test-review-view.tsx"), /data-content lang="en">\{x\.stem\}/);
    assert.match(read("src/app/teacher/assessments/new/test-builder.tsx"), /<span data-content lang="en">\{x\.stem\}<\/span>/);
    assert.match(read("src/components/listen-button.tsx"), /data-content lang="en" dir="ltr"/, "the follow-along words are content");
  });

  test("one word per action: Assign (never Send / Give) on the plan pages", () => {
    for (const f of ["src/app/teacher/plans/curriculum/page.tsx", "src/app/teacher/plans/actions.ts", "src/app/teacher/map-plans/page.tsx", "src/app/teacher/map-plans/actions.ts", "src/components/map/map-ui.tsx", "src/components/plans/curriculum-grid.tsx"]) {
      const visible = read(f).split("\n").filter((l) => !/^\s*(\*|\/\/|\/\*|import )/.test(l)).join("\n");
      assert.doesNotMatch(visible, /[>"'`]\s*(?:📤 |📘 |✓ |✅ )?(Send|Give|Sent)\b/, f);
      assert.doesNotMatch(visible, /\b(plan\(s\) sent|check sent|press Send|not sent yet|send them one set|PDF to send)\b/, f);
    }
  });
});

describe("read-aloud in ReadRise", () => {
  test("the ReadRise reader uses the shared player when the natural audio exists; pre-generation has --readrise", () => {
    const reader = read("src/components/readrise/reader.tsx");
    assert.match(reader, /<ListenButton text=\{articleSpeech\} label="Read aloud" preOnly onAvailability=\{setNatural\} \/>/);
    assert.match(reader, /passageSpeech\(view\.title, view\.body\)/, "the same text the pre-generation hashes");
    assert.match(reader, /canSpeak && !natural/, "the device voice only when no natural audio");
    assert.match(read("scripts/tts/pregenerate.ts"), /--readrise/);
    assert.doesNotMatch(reader, /Lexile/);
  });
});
