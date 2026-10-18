/**
 * 👀 "Preview as student" for everything a teacher sends to students: each item has a preview that draws the
 * student's OWN page / component (with a chosen student's data), a Download button, never records an attempt or an
 * answer, and shows no level words to the student. Demo school in memory — never a real database or student data.
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { generateDDL, parseSchema } from "../scripts/db/schema-ddl";
import { SqliteRepo } from "../scripts/db/sqlite-repo";
import { hashPassword } from "../src/server/auth/password";
import { seedCurriculum } from "../src/server/seeding/curriculum";
import { DEMO_SCHOOL_CODE, seedDemoSchool } from "../src/server/seeding/demo";
import { loadBank, loadCurriculumInput } from "../src/server/seeding/load-files";
import { seedQuestions } from "../src/server/seeding/questions";
import { resolveActor } from "../src/server/auth/actor";
import { ForbiddenError, type Actor } from "../src/server/auth/rbac";
import { assignTest } from "../src/server/tests/assessments";
import { assignedTestPreview, ITEM_PREVIEW, PREVIEW_ITEMS, previewStudentFor } from "../src/server/student/preview-as";
import { exitTicketForStudentPreview } from "../src/server/teacher/classroom";
import { saveStudentPreview } from "../src/server/tests/student-preview";
import { previewWork } from "../src/server/teacher/preview";
import { ar } from "../src/i18n/ar";

const ROOT = join(__dirname, "..");
const s = (v: unknown) => String(v ?? "");
const read = (f: string) => readFileSync(join(ROOT, f), "utf8");
/** what a student must never read about themselves */
const LEVEL_WORDS = /\b(Below|On Level|Above|Approaching|Meeting|Exceeding|Mastered|Developing|Needs support|Tier)\b/;

async function database(): Promise<SqliteRepo> {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  const schema = parseSchema(join(ROOT, "prisma/schema.prisma"));
  db.exec(generateDDL(schema, "sqlite"));
  const repo = new SqliteRepo(db, schema);
  await seedCurriculum(repo, loadCurriculumInput(ROOT, DEMO_SCHOOL_CODE, "Demo International School"));
  await seedDemoSchool(repo, { passwordHash: await hashPassword("Demo-Password-2026"), classesPerGrade: 2, studentsPerClass: 2 });
  return repo;
}

/** the student pages that draw a preview: studentPage(?preview=) + the read-only PreviewFrame */
const STUDENT_PAGES = [
  ...new Set(PREVIEW_ITEMS.map((x) => x.page)),
  "src/app/student/plans/[planId]/page.tsx", "src/app/student/exit/[ticketId]/page.tsx", "src/app/student/writing/[taskId]/page.tsx", "src/app/student/tests/[assignmentId]/page.tsx",
];

describe("👀 Preview as student", () => {
  let repo: SqliteRepo; let teacher: Actor; let otherTeacher: Actor; let classId = ""; let mine: string[] = []; let others: string[] = []; let qids: string[] = [];

  before(async () => {
    repo = await database();
    await seedQuestions(repo, { schoolCode: DEMO_SCHOOL_CODE, bank: loadBank(ROOT) });
    const g4 = (await repo.findMany("Question", { status: "UNDER_REVIEW" })).filter((q) => s(q.externalRef).startsWith("G4-"));
    await repo.updateMany("Question", { id: { in: g4.map((q) => q.id) } }, { status: "PUBLISHED" });
    teacher = await resolveActor(repo, (await repo.findUnique("User", { username: "demo.teacher.4a" }))!);
    otherTeacher = await resolveActor(repo, (await repo.findUnique("User", { username: "demo.teacher.4b" }))!);
    const t = await repo.findUnique("Teacher", { userId: teacher.userId });
    classId = s((await repo.findMany("ClassTeacher", { teacherId: t!.id }))[0].classId);
    mine = (await repo.findMany("ClassMembership", { classId, leftAt: null })).map((m) => s(m.studentId));
    others = (await repo.findMany("ClassMembership", { leftAt: null })).map((m) => s(m.studentId)).filter((id) => !mine.includes(id));
    const mcType = (await repo.findMany("QuestionType", { code: "MULTIPLE_CHOICE" }))[0];
    qids = (await repo.findMany("Question", { status: "PUBLISHED", typeId: mcType.id, deletedAt: null })).filter((q) => s(q.externalRef).startsWith("G4-") && !q.passageId).map((q) => s(q.id)).sort().slice(0, 6);
  });

  test("every teacher → student item has a preview on the student's own page, with the student component", () => {
    assert.ok(PREVIEW_ITEMS.length >= 10);
    for (const k of ["tests", "plans", "progress", "family", "teacher-report", "diagnostic", "nafs", "map", "comments", "writing"]) assert.ok(PREVIEW_ITEMS.some((x) => x.key === k), k);
    for (const it of PREVIEW_ITEMS) {
      assert.ok(existsSync(join(ROOT, it.page)), it.page);
      assert.ok(read(it.page).includes(it.component), `${it.page} draws ${it.component}`);
      assert.match(it.href("S1"), /preview=S1/);
    }
    for (const f of STUDENT_PAGES) {
      const src = read(f);
      assert.ok(src.includes('await studentPage((await searchParams).preview, () => requireActor({ roles: ["STUDENT"] }))') || src.includes('await studentPage(sp.preview, () => requireActor({ roles: ["STUDENT"] }))'), `${f}: the student page itself, with ?preview= (students only otherwise)`);
      assert.match(src, /<PreviewFrame preview=\{preview\}>/, `${f}: read-only frame`);
      assert.doesNotMatch(src, /^export (const|function|async function) (?!default)(?!metadata)/m, `${f}: page files export only Next fields`);
    }
    // one record: the teacher's own pages link the student's page of that record
    assert.match(read("src/app/teacher/assessments/[testId]/page.tsx"), /ITEM_PREVIEW\.test\(/);
    assert.match(read("src/app/teacher/assessments/[testId]/page.tsx"), /ITEM_PREVIEW\.testReview\(/);
    assert.match(read("src/app/teacher/exit/[ticketId]/page.tsx"), /ITEM_PREVIEW\.exit\(/);
    assert.match(read("src/app/teacher/writing/task/[taskId]/page.tsx"), /ITEM_PREVIEW\.writing\(/);
    assert.match(read("src/app/teacher/writing/page.tsx"), /ITEM_PREVIEW\.writing\(/);
    assert.match(read("src/components/plans/editor-ui.tsx"), /\/student\/plans\/\$\{encodeURIComponent\(v\.id\)\}\?preview=/);
    assert.match(read("src/app/teacher/family-reports/[id]/page.tsx"), /view=family&preview=/);
    assert.match(read("src/app/teacher/students/[studentId]/page.tsx"), /\/teacher\/student-view\?student=/);
    assert.match(read("src/app/teacher/student-view/page.tsx"), /PREVIEW_ITEMS\.map/, "the hub: a student selector and every item");
    assert.equal(ITEM_PREVIEW.plan("P1", "S1"), "/student/plans/P1?preview=S1");
    // the test preview = the quiz player itself (preview mode) + every question in the same component for print
    const tp = read("src/components/tests/student-test-preview.tsx");
    assert.match(tp, /<QuizPlayer [^\n]*preview=\{questions\} \/>/);
    assert.match(tp, /<QuizQuestion /);
    assert.match(read("src/app/quiz/[assignmentId]/quiz-player.tsx"), /<QuizQuestion /, "the student's player draws the same question component");
    assert.match(read("src/app/teacher/preview/page.tsx"), /<StudentTestPreview /);
  });

  test("Download on every preview; read-only frame", () => {
    const frame = read("src/components/student/preview-frame.tsx");
    assert.match(frame, /<PrintButton \/>/, "⬇ Download PDF / 🖨 Print (the plan preview's print layout)");
    assert.match(frame, /\binert\b/, "nothing on the page acts");
    assert.match(read("src/app/teacher/preview/page.tsx"), /<PrintButton \/>/);
    assert.match(read("src/components/student/study-plan.tsx"), /<PrintButton label=\{preview \? "Download"/, "the plan preview keeps its Download");
    for (const k of ["Preview as student", "Preview as student: {name}", "Close preview", "This is exactly what the student sees. Read only: nothing is answered, sent or saved.", "End of the preview"]) assert.ok(ar[k as keyof typeof ar], `Arabic: ${k}`);
  });

  test("access: a teacher previews only their own students; students never preview", async () => {
    const p = await previewStudentFor(repo, teacher, mine[0]);
    assert.equal(p.actor.role, "STUDENT");
    assert.equal(p.actor.studentId, mine[0]);
    assert.ok(p.name);
    await assert.rejects(previewStudentFor(repo, teacher, others[0]), ForbiddenError, "another teacher's student");
    await assert.rejects(previewStudentFor(repo, p.actor, mine[1]), ForbiddenError, "a student cannot preview");
    const gate = read("src/server/auth/student-page.ts");
    assert.match(gate, /previewStudentFor\(repo, actor/);
    assert.match(gate, /const actor = await requireStudent\(\);\n\s*if \(actor\.role !== "STUDENT"\)/, "without a preview: students only, as before");
    assert.match(gate, /if \(sid && staff\)/, "only staff can preview");
  });

  test("a test: the student's own version and order, nothing started, answered or recorded", async () => {
    const r = await assignTest(repo, teacher, { source: "CURRICULUM", classId, type: "WEEKLY_QUIZ", title: "Quiz 3", levelMode: "SAME", shuffle: true, questions: { SAME: qids } });
    const count = async () => [await repo.count("QuestionAttempt", {}), await repo.count("PracticeSession", {}), await repo.count("AssignmentStudent", { status: "COMPLETED" })];
    const before = await count();
    const a = await assignedTestPreview(repo, teacher, r.testId, mine[1]);
    const b = await assignedTestPreview(repo, teacher, r.testId, mine[0]);
    assert.equal(a.studentId, mine[1]);
    assert.equal(a.questions.length, qids.length);
    assert.deepEqual([...a.questions.map((q) => q.questionId)].sort(), [...qids].sort());
    assert.ok(a.questions.map((q) => q.questionId).join() !== qids.join() || b.questions.map((q) => q.questionId).join() !== qids.join(), "shuffled per student");
    for (const q of a.questions) assert.ok(!JSON.stringify(q).includes("\"correct\""), "no answer key reaches the preview player");
    assert.deepEqual(await count(), before, "a preview never writes an attempt, a session or a result");
    await assert.rejects(assignedTestPreview(repo, otherTeacher, r.testId, mine[0]), ForbiddenError);
    // a level test: the student's set title has "(Approaching)" — the preview shows the test's own name only
    const lv = await assignTest(repo, teacher, { source: "CURRICULUM", classId, type: "WEEKLY_QUIZ", title: "Quiz 4", levelMode: "LEVEL", questions: { BELOW: qids.slice(0, 2), ON: qids.slice(2, 4), ABOVE: qids.slice(4, 6) } });
    const p = await assignedTestPreview(repo, teacher, lv.testId, mine[0]);
    assert.doesNotMatch(p.title, LEVEL_WORDS);
    assert.equal(p.questions.length, 2);
    // the builder's preview (before assigning) also gives the student-format questions
    const id = await saveStudentPreview(repo, teacher, { title: "Draft", levelMode: "SAME", questions: { SAME: qids.slice(0, 3) } });
    const v = await previewWork(repo, teacher, { test: id });
    assert.equal(v.student?.length, 3);
    assert.ok(v.student!.every((q) => !JSON.stringify(q).includes("\"correct\"")));
    assert.deepEqual(await count(), before);
  });

  test("an exit ticket: the same questions the student gets; nothing answered", async () => {
    const t = await repo.create("ExitTicket", { schoolId: teacher.schoolId, classId, createdById: teacher.userId, title: "Today", questionIds: qids.slice(0, 3), status: "CLOSED", createdAt: new Date() });
    const st = (await previewStudentFor(repo, teacher, mine[0])).actor;
    const before = await repo.count("ExitTicketAnswer", {});
    const v = await exitTicketForStudentPreview(repo, st, s(t.id));
    assert.equal(v?.questions.length, 3);
    assert.equal(await repo.count("ExitTicketAnswer", {}), before);
    const other = await previewStudentFor(repo, otherTeacher, others[0]);
    assert.equal(await exitTicketForStudentPreview(repo, other.actor, s(t.id)), null, "another class's ticket is not shown");
    assert.match(read("src/app/student/exit/[ticketId]/page.tsx"), /preview=\{Boolean\(preview\)\}/);
    const set = read("src/components/learn/question-set.tsx");
    assert.match(set, /if \(preview\) return;/, "the set cannot be sent in a preview");
    assert.match(set, /disabled=\{preview \|\| /);
  });

  test("the quiz player's preview never calls the server; no level words in the preview frame", () => {
    const qp = read("src/app/quiz/[assignmentId]/quiz-player.tsx");
    const branch = qp.slice(qp.indexOf("if (preview) {"), qp.indexOf("setPending(true)"));
    assert.ok(branch.includes("return;"), "the preview branch returns first");
    assert.doesNotMatch(branch, /submitQuizAnswerAction/);
    for (const f of ["src/components/student/preview-frame.tsx", "src/components/tests/student-test-preview.tsx", "src/app/student/exit/[ticketId]/page.tsx"]) assert.doesNotMatch(read(f), LEVEL_WORDS, f);
    for (const it of PREVIEW_ITEMS) assert.doesNotMatch(it.label, LEVEL_WORDS, it.label);
    const previewStrings = qp.slice(qp.indexOf("if (!q && preview)"), qp.indexOf("if (!q && view.isTest)"));
    assert.doesNotMatch(previewStrings, LEVEL_WORDS);
  });
});
