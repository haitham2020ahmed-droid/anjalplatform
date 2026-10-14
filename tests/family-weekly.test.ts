/**
 * 👪 The weekly family report (no new role): the student's "For my family" page this week (tasks, minutes, ReadRise
 * articles, lessons, tests with released scores, 2–3 things to practise at home with one home activity each, the
 * teacher's note), English + Arabic, no level words; the teacher's class view (preview each, note per student,
 * Download PDF one / all — one file, a page per student). Demo school in memory — never a real database.
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { demoDatabase, ROOT } from "./helpers/db";
import { publishGrade4Bank, simulatePractice } from "./helpers/practice";
import { resolveActor } from "../src/server/auth/actor";
import { ForbiddenError, type Actor } from "../src/server/auth/rbac";
import { ValidationError } from "../src/server/curriculum-admin";
import { familyWeek, familyWeeks, saveFamilyWeekNote, NOTE_MAX } from "../src/server/reports/family-week";
import { HOME_TOPICS, homeTopicFor } from "../src/server/reports/family-week-words";
import { familyWeekArticle, familyWeekDocument } from "../src/reports/family-week-html";
import { exportFamilyWeek } from "../src/server/reports/family-week-pdf";
import { FamilyWeekPage } from "../src/components/reports/family-week";
import { assignTest } from "../src/server/tests/assessments";
import { makeT } from "../src/i18n";
import { UI_STRINGS } from "../src/i18n/en";
import { ar } from "../src/i18n/ar";

const s = (v: unknown) => String(v ?? "");
const NOW = new Date("2026-10-14T12:00:00Z"); // a Wednesday: the school week started on Sunday 11 October
const LEVEL_WORDS = /\b(Below|Above|On Level|Approaching|Meeting|Exceeding|Tier|RTI)\b/;
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

describe("👪 weekly family report", () => {
  let repo: SqliteRepo; let teacher: Actor; let other: Actor; let admin: Actor; let student: Actor; let classmate: Actor;
  let classId: string; let sid: string;

  before(async () => {
    ({ repo } = await demoDatabase({ classesPerGrade: 2, studentsPerClass: 3 }));
    await publishGrade4Bank(repo);
    const actor = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);
    teacher = await actor("demo.teacher.4a"); other = await actor("demo.teacher.4b"); admin = await actor("demo.admin");
    const t = (await repo.findUnique("Teacher", { userId: teacher.userId }))!;
    classId = s((await repo.findMany("ClassTeacher", { teacherId: t.id }))[0].classId);
    const ms = await repo.findMany("ClassMembership", { classId, leftAt: null });
    const users = await Promise.all(ms.map(async (m) => (await repo.findUnique("User", { id: (await repo.findUnique("Student", { id: m.studentId }))!.userId }))!));
    student = await resolveActor(repo, users[0]); classmate = await resolveActor(repo, users[1]);
    sid = student.studentId!;
    // practice this week (Monday) on a skill with questions; some answers wrong
    const cur4 = (await repo.findMany("Curriculum", {})).find((c) => s(c.name).startsWith("Grade 4"))!;
    const skill = (await repo.findMany("Skill", { curriculumId: cur4.id }, { select: ["id", "code", "name"] })).find((k) => /main idea/i.test(s(k.name))) ?? (await repo.findMany("Skill", { curriculumId: cur4.id }))[0];
    await simulatePractice(repo, [s(users[0].username)], [{ date: "2026-10-12", skill: s(skill.code) }], 9);
    await repo.updateMany("PracticeSession", { studentId: sid }, { activeMs: 25 * 60_000 });
    // a task finished this week (its title carries a level word for the teacher), and one from last week
    const tRow = (await repo.findUnique("Teacher", { userId: teacher.userId }))!;
    const a1 = await repo.create("Assignment", { classId, createdById: tRow.id, title: "Main Idea practice (Approaching)", target: "SKILL", skillId: skill.id, createdAt: NOW });
    const a2 = await repo.create("Assignment", { classId, createdById: tRow.id, title: "Old task", target: "SKILL", skillId: skill.id, createdAt: NOW });
    await repo.create("AssignmentStudent", { assignmentId: a1.id, studentId: sid, status: "COMPLETED", progress: 1, completedAt: new Date("2026-10-13T09:00:00Z") });
    await repo.create("AssignmentStudent", { assignmentId: a2.id, studentId: sid, status: "COMPLETED", progress: 1, completedAt: new Date("2026-10-08T09:00:00Z") });
    // a ReadRise article and a lesson this week
    const art = await repo.create("RRArticle", { code: "FW-1", title: "Turtles of the Red Sea", topic: "Animals", pollStatement: "Turtles are amazing.", status: "PUBLISHED", createdAt: NOW, updatedAt: NOW });
    await repo.create("RRRun", { studentId: sid, schoolId: student.schoolId, articleId: art.id, versionLevel: 600, band: "B", step: "DONE", readSeconds: 300, score: 80, levelBefore: 600, startedAt: new Date("2026-10-12T10:00:00Z"), completedAt: new Date("2026-10-12T10:10:00Z") });
    await repo.create("LessonRun", { studentId: sid, schoolId: student.schoolId, skillId: skill.id, phase: "DONE", log: [], startedAt: new Date("2026-10-13T10:00:00Z"), finishedAt: new Date("2026-10-13T10:20:00Z"), updatedAt: NOW });
    // a teacher test finished this week: 2 of 3 right
    const qs = (await repo.findMany("Question", { skillId: skill.id, status: "PUBLISHED" }, { select: ["id"], take: 3 })).map((q) => s(q.id));
    const r = await assignTest(repo, teacher, { classId, type: "QUIZ", title: "Quiz 1 (Below Level)", levelMode: "SAME", questions: { SAME: qs } }, new Date("2026-10-12T07:00:00Z"));
    const ta = (await repo.findMany("Assignment", { testId: r.testId }))[0];
    await repo.updateMany("AssignmentStudent", { assignmentId: ta.id, studentId: sid }, { status: "COMPLETED", completedAt: new Date("2026-10-13T11:00:00Z") });
    await repo.create("PracticeSession", { studentId: sid, skillId: skill.id, mode: "TEACHER_QUIZ", assignmentId: ta.id, correctCount: 2, questionCount: 3, startedAt: new Date("2026-10-13T10:50:00Z") });
    // NAFS: one test released, one held back
    for (const [title, released] of [["NAFS practice A", true], ["NAFS practice B", false]] as const) {
      const nt = await repo.create("NafsTest", { schoolId: student.schoolId, createdById: teacher.userId, title, mode: "AUTO", questionIds: [], createdAt: NOW, updatedAt: NOW });
      await repo.create("NafsTestClass", { testId: nt.id, classId, createdById: teacher.userId, releasedAt: released ? new Date("2026-10-13T12:00:00Z") : null, createdAt: NOW });
      await repo.create("NafsResult", { testId: nt.id, classId, studentId: sid, source: "ONLINE", answers: [], correct: 7, points: 7, maxPoints: 10, submittedAt: new Date("2026-10-13T08:00:00Z"), updatedAt: NOW });
    }
  });

  test("the student's own week: tasks, minutes, articles, lessons, released tests, practise at home — no level words", async () => {
    const w = await familyWeek(repo, student, sid, NOW);
    assert.equal(w.week, "2026-10-11");
    assert.deepEqual(w.tasks, ["Main Idea practice"], "this week's tasks only, level word removed");
    assert.ok(w.minutes >= 25, `minutes ${w.minutes}`);
    assert.deepEqual(w.articles, ["Turtles of the Red Sea"]);
    assert.equal(w.lessons.length, 1);
    const quiz = w.tests.find((x) => x.kind === "TEST")!;
    assert.equal(quiz.title, "Quiz 1");
    assert.equal(quiz.pct, 67);
    assert.ok(w.tests.some((x) => x.title === "NAFS practice A" && x.pct === 70), "released NAFS result");
    assert.ok(!w.tests.some((x) => x.title === "NAFS practice B"), "a NAFS result not released yet is not shown");
    assert.ok(w.practise.length >= 2 && w.practise.length <= 3);
    for (const p of w.practise) assert.ok(p.title && p.activity);
    for (const lang of ["en", "ar"] as const) assert.doesNotMatch(text(familyWeekArticle(w, makeT(lang), lang)), LEVEL_WORDS);
  });

  test("access: the student only their own; the class teacher and the admin; another teacher never", async () => {
    await assert.rejects(familyWeek(repo, classmate, sid, NOW), ForbiddenError);
    await assert.rejects(familyWeek(repo, other, sid, NOW), ForbiddenError);
    await assert.rejects(familyWeeks(repo, other, classId, NOW), ForbiddenError);
    await assert.rejects(saveFamilyWeekNote(repo, other, { studentId: sid, note: "x" }, NOW), ForbiddenError);
    await assert.rejects(saveFamilyWeekNote(repo, student, { studentId: sid, note: "x" }, NOW), ForbiddenError);
    assert.equal((await familyWeek(repo, admin, sid, NOW)).studentId, sid);
  });

  test("the teacher's note: saved per student per week, shown on the page, removed when emptied", async () => {
    await assert.rejects(saveFamilyWeekNote(repo, teacher, { studentId: sid, note: "x".repeat(NOTE_MAX + 1) }, NOW), ValidationError);
    await saveFamilyWeekNote(repo, teacher, { studentId: sid, note: "أحسنت هذا الأسبوع! Great reading." }, NOW);
    await saveFamilyWeekNote(repo, teacher, { studentId: sid, note: "أحسنت هذا الأسبوع! Great reading this week." }, NOW);
    assert.equal(await repo.count("FamilyWeekNote", { studentId: sid }), 1, "one note per student per week");
    const w = await familyWeek(repo, student, sid, NOW);
    assert.equal(w.note, "أحسنت هذا الأسبوع! Great reading this week.");
    assert.equal((await familyWeek(repo, student, sid, new Date("2026-10-19T12:00:00Z"))).note, null, "next week starts without a note");
    const html = familyWeekArticle(w, makeT("en"), "en");
    assert.ok(html.includes("A note from my teacher") && html.includes("Great reading this week."));
  });

  test("the class: a page per student (sorted); the document in English and Arabic; the screen shows the same words", async () => {
    const b = await familyWeeks(repo, teacher, classId, NOW);
    assert.equal(b.items.length, await repo.count("ClassMembership", { classId, leftAt: null }));
    assert.deepEqual(b.items.map((x) => x.name), [...b.items.map((x) => x.name)].sort((x, y) => x.localeCompare(y)));
    const fonts = { css: "", stack: "sans-serif" };
    const en = familyWeekDocument(b.items, makeT("en"), "en", fonts);
    assert.equal((en.match(/<article class="fw-page"/g) ?? []).length, b.items.length, "a page per student");
    assert.match(en, /break-before:page/);
    const arDoc = familyWeekDocument(b.items, makeT("ar"), "ar", fonts);
    assert.match(arDoc, /<html lang="ar" dir="rtl">/);
    assert.ok(arDoc.includes("لعائلتي: هذا الأسبوع") && arDoc.includes("أشياء للتدرّب عليها في البيت"));
    assert.ok(arDoc.includes("<bdi>Turtles of the Red Sea</bdi>"), "English titles isolated inside Arabic");
    assert.doesNotMatch(text(arDoc), LEVEL_WORDS);
    // the screen component and the PDF HTML say the same things
    const w = b.items.find((x) => x.studentId === sid)!;
    for (const lang of ["en", "ar"] as const) {
      const t = makeT(lang);
      const screen = text(renderToStaticMarkup(React.createElement(FamilyWeekPage, { w, t, lang })));
      const pdf = text(familyWeekArticle(w, t, lang));
      for (const k of ["For my family: this week", "Things to practise at home", "Tasks I finished", "My tests", ...w.practise.map((p) => p.activity)]) {
        assert.ok(screen.includes(t(k).replace(/&/g, "&amp;").split("“")[0]) && pdf.includes(t(k).split("“")[0]), `${lang}: ${k}`);
      }
    }
  });

  test("Download PDF: one student or the whole class in ONE file, audited; a student never gets the class", async () => {
    const pages: string[] = [];
    const deps = { repo, fontDir: join(ROOT, "assets/fonts"), brandingDir: join(ROOT, "assets/branding"), now: () => NOW,
      pdf: { render: async (html: string) => { pages.push(html); return new TextEncoder().encode("%PDF-1.7 fake"); }, close: async () => undefined } };
    const one = await exportFamilyWeek(deps, student, { studentId: sid, lang: "ar" });
    assert.equal(one.contentType, "application/pdf");
    assert.match(one.filename, /^family-week_.+_2026-10-11_ar\.pdf$/);
    const all = await exportFamilyWeek(deps, teacher, { classId, lang: "en" });
    assert.match(all.filename, /^family-week_class-/);
    assert.equal((pages[1].match(/<article class="fw-page"/g) ?? []).length, (await familyWeeks(repo, teacher, classId, NOW)).items.length);
    assert.ok(pages[1].includes("@font-face"), "fonts embedded (no network)");
    await assert.rejects(exportFamilyWeek(deps, student, { classId, lang: "en" }), ForbiddenError);
    assert.ok(await repo.count("AuditLog", { action: "report.export", entityType: "FamilyWeek" }) >= 2);
  });

  test("practise-at-home topics: simple words with an activity, every one in Arabic; pages and links in place", () => {
    assert.equal(homeTopicFor("Main Idea and Key Details").key, "main-idea");
    assert.equal(homeTopicFor("Context Clues").key, "words");
    assert.equal(homeTopicFor("Subject-Verb Agreement").key, "sentences");
    assert.equal(homeTopicFor("Something else").key, "reading");
    for (const x of HOME_TOPICS) for (const k of [x.title, x.activity]) {
      assert.ok((UI_STRINGS as readonly string[]).includes(k), k);
      assert.ok(ar[k as keyof typeof ar] && ar[k as keyof typeof ar] !== k, `Arabic: ${k}`);
      assert.doesNotMatch(k, LEVEL_WORDS);
    }
    const read = (f: string) => readFileSync(join(ROOT, f), "utf8");
    const student = read("src/app/student/reports/page.tsx");
    assert.match(student, /familyWeek\(repo, actor, id\)/);
    assert.match(student, /<FamilyWeekPage /);
    assert.match(student, /\/api\/family-week\?lang=/);
    const page = read("src/app/teacher/family-reports/this-week/page.tsx");
    assert.match(page, /requireActor\(\{ roles: \["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"\]/);
    assert.match(page, /saveFamilyWeekNoteAction/);
    assert.match(page, /Download all \(one PDF\)/);
    assert.equal((page.match(/^export /gm) ?? []).length, 2, "the page file exports only Next page fields");
    assert.match(read("src/app/teacher/family-reports/page.tsx"), /\/teacher\/family-reports\/this-week/);
    assert.match(read("prisma/schema.prisma"), /model FamilyWeekNote \{[\s\S]*@@unique\(\[studentId, week\]\)/);
  });
});
