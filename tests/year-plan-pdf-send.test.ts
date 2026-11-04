/**
 * 🗓️ MAP Year plan — share it (owner r68 §C) — in-memory demo school only:
 *   the questions behind each skill (teacher), "Download PDF" for the administration (cover figures, the 40 weeks, the
 *   skills, the legend — the shared report renderer), "Send to students" → a "Year plan" tab on the student's MAP page
 *   with their OWN stars (and "Stop showing"), the teacher's preview = exactly that page as one student; the plan's skills
 *   join My Skills "Not started". Plus the study plan's Full / Short version fix.
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { demoDatabase, ROOT } from "./helpers/db";
import { publishGrade4Bank } from "./helpers/practice";
import { resolveActor } from "../src/server/auth/actor";
import type { Actor } from "../src/server/auth/rbac";
import { firstSunday, WEEKS, type YearWeek } from "../src/server/map/year-plan";
import { sendYearPlan, sentYearPlanSkills, skillQuestionsPreview, studentYearPlan, yearPlanSentAt } from "../src/server/map/year-plan-share";
import { yearPlanDoc } from "../src/server/reports/year-plan-pdf";
import { renderHtml } from "../src/reports/html";
import { skillKeyIndex } from "../src/server/skills/status";
import { mySkills } from "../src/server/skills/my-skills";
import { SHORT_LIMITS, shortenStages, type PlanStage } from "../src/server/map/map-reports";

const s = (v: unknown) => String(v ?? "");
const read = (f: string) => readFileSync(join(ROOT, f), "utf8");

describe("🗓️ Year plan: questions, PDF, send to students, preview", () => {
  let repo: SqliteRepo; let teacher: Actor; let other: Actor; let student: Actor; let schoolId = ""; let classId = ""; let ids: string[] = [];
  let skills: { id: string; name: string; code: string }[] = [];
  const now = new Date("2026-10-13T09:00:00Z");

  before(async () => {
    ({ repo } = await demoDatabase({ classesPerGrade: 2, studentsPerClass: 3 }));
    await publishGrade4Bank(repo);
    teacher = await resolveActor(repo, (await repo.findUnique("User", { username: "demo.teacher.4a" }))!);
    other = await resolveActor(repo, (await repo.findUnique("User", { username: "demo.teacher.4b" }))!);
    schoolId = teacher.schoolId!;
    const t = await repo.findUnique("Teacher", { userId: teacher.userId });
    classId = s((await repo.findMany("ClassTeacher", { teacherId: t!.id }))[0].classId);
    ids = (await repo.findMany("ClassMembership", { classId })).map((m) => s(m.studentId));
    student = await resolveActor(repo, (await repo.findUnique("User", { id: (await repo.findUnique("Student", { id: ids[0] }))!.userId }))!);
    const g = (await repo.findMany("Grade", { schoolId, level: 4 }))[0];
    const cur = (await repo.findMany("Curriculum", { gradeId: g.id }))[0];
    const withQs = new Set((await repo.findMany("Question", { status: "PUBLISHED" }, { select: ["skillId"] })).map((q) => s(q.skillId)));
    skills = (await repo.findMany("Skill", { curriculumId: cur.id }, { select: ["id", "name", "code"] })).filter((k) => withQs.has(s(k.id))).slice(0, 6).map((k) => ({ id: s(k.id), name: s(k.name), code: s(k.code) }));
    const weeks: YearWeek[] = Array.from({ length: WEEKS }, (_, i) => ({ week: i + 1, skills: [0, 1].map((j) => { const k = skills[(i * 2 + j) % skills.length]; return { skillId: k.id, code: k.code, name: k.name, group: j ? "INFO" : "LIT", need: 3, of: 3, rit: 195, ...(i >= 3 ? { review: true } : {}) }; }) }));
    await repo.create("MapYearPlan", { schoolId, classId, startDate: firstSunday(new Date("2026-09-01T00:00:00Z")), weeks, needs: [], createdById: teacher.userId, generatedAt: now, updatedAt: now });
    // the student mastered the first skill
    const key = (await skillKeyIndex(repo, schoolId)).keyOf.get(skills[0].id)!;
    await repo.create("SkillStatus", { studentId: ids[0], skillKey: key, level: 1, status: "MASTERED", skillId: skills[0].id, answered: 34, correct: 30, score: 100, masteredAt: now, createdAt: now, updatedAt: now, history: [] });
  });

  test("🔎 the questions behind a skill: a few with their choices (the right one marked); teachers only", async () => {
    const p = await skillQuestionsPreview(repo, teacher, classId, skills[0].id);
    assert.ok(p.total > 0 && p.questions.length > 0 && p.questions.length <= 5);
    assert.ok(p.questions.every((q) => q.stem.length > 0));
    assert.ok(p.questions.some((q) => q.choices.some((c) => c.correct)), "the right answer is marked for the teacher");
    await assert.rejects(skillQuestionsPreview(repo, student, classId, skills[0].id), /Teachers only|Forbidden|permission|not allowed/i);
    assert.match(read("src/components/map/year-plan-board.tsx"), /yearQuestionsAction\(/);
  });

  test("📤 send to students: a Year plan tab with their own stars; Stop showing takes it back; only the class teacher", async () => {
    assert.equal(await studentYearPlan(repo, student, {}, now), null, "not sent: no tab");
    await assert.rejects(sendYearPlan(repo, other, classId, true, now), /teacher|Forbidden|class/i);
    const r = await sendYearPlan(repo, teacher, classId, true, now);
    assert.ok(r.sentAt && r.students === ids.length);
    assert.ok(await yearPlanSentAt(repo, classId));
    const n = await repo.findMany("Notification", { link: "/student/map?tab=year" });
    assert.equal(n.length, ids.length, "each student is told once");
    const p = await studentYearPlan(repo, student, {}, now);
    assert.ok(p, "the tab appears");
    assert.equal(p!.weeks.length, WEEKS);
    const k0 = p!.weeks.flatMap((w) => w.skills).find((k) => k.skillId === skills[0].id)!;
    assert.equal(k0.status, "MASTERED", "the student's own star");
    assert.match(k0.href, /^\/practice\/.+\?from=map$/);
    assert.equal(p!.weeks.filter((w) => w.current).length, 1, "this week is marked");
    // the teacher's preview = exactly the student's page (as that student)
    const pv = await studentYearPlan(repo, teacher, { classId, asStudent: ids[0] }, now);
    assert.deepEqual(pv!.weeks.map((w) => w.skills.map((k) => [k.skillId, k.status])), p!.weeks.map((w) => w.skills.map((k) => [k.skillId, k.status])));
    const pv2 = await studentYearPlan(repo, teacher, { classId, asStudent: ids[1] }, now);
    assert.equal(pv2!.weeks[0].skills[0].status, "NOT_STARTED", "another student: their own stars");
    // its skills join My Skills ("Not started" = skills of my plans)
    assert.ok((await sentYearPlanSkills(repo, schoolId, [classId])).includes(skills[1].id));
    const ms = await mySkills(repo, ids[1], now);
    assert.ok(ms.groups.NOT_STARTED.flatMap((g) => g.rows).some((x) => x.from.includes("Year plan")), "Year plan skills in My Skills");
    // a second send does not notify again; Stop showing hides the tab
    await sendYearPlan(repo, teacher, classId, true, now);
    assert.equal((await repo.findMany("Notification", { link: "/student/map?tab=year" })).length, ids.length);
    await sendYearPlan(repo, teacher, classId, false, now);
    assert.equal(await studentYearPlan(repo, student, {}, now), null, "Stop showing: gone");
    await sendYearPlan(repo, teacher, classId, true, now);
  });

  test("⬇ the PDF for the administration: cover figures, the 40 weeks, the skills, the legend", async () => {
    const doc = await yearPlanDoc({ repo, brandingDir: "/nonexistent", now: () => now }, teacher, classId);
    assert.equal(doc.title, "MAP Year plan"); assert.equal(doc.accent, "map"); assert.equal(doc.audience, "school");
    assert.ok(doc.meta.some((m) => m.label === "Class") && doc.meta.some((m) => m.label === "Teacher") && doc.meta.some((m) => m.label === "Sent to students"));
    const weeks = doc.sections.find((x) => x.type === "table" && x.id === "weeks") as Extract<typeof doc.sections[number], { type: "table" }>;
    assert.equal(weeks.rows.length, WEEKS);
    assert.match(s(weeks.rows[0].dates), /^\d{4}-\d{2}-\d{2} – \d{4}-\d{2}-\d{2}$/);
    const sk = doc.sections.find((x) => x.type === "table" && x.id === "skills") as Extract<typeof doc.sections[number], { type: "table" }>;
    assert.ok(sk.rows.length >= 1 && sk.rows.some((r) => s(r.mastered).startsWith("1/")), "who mastered each skill");
    assert.ok(doc.sections.some((x) => x.type === "notes" && x.title === "Legend"));
    const html = renderHtml(doc, { fontCss: "", fontStack: "sans-serif" });
    assert.match(html, /MAP Year plan/); assert.match(html, /The 40 weeks/);
    assert.ok(existsSync(join(ROOT, "src/app/api/year-plan-pdf/route.ts")));
    const tab = read("src/app/teacher/map-center/year-tab.tsx");
    for (const x of ["/api/year-plan-pdf", "Send to students", "Preview as students", "Stop showing to students", "StudentYearPlanView"]) assert.ok(tab.includes(x), x);
    assert.match(read("src/app/student/map/page.tsx"), /tab === "year"/, "the student's MAP page has the Year plan tab");
  });

  test("📑 Full / Short version: the Short version keeps the skills NOT mastered yet (by the star); both count the whole plan", () => {
    const st = (key: PlanStage["key"], n: number, masteredEvery: number): PlanStage => ({
      key, title: key, range: "RIT 191–200", total: n, shown: n,
      topics: [{ name: "T", statements: Array.from({ length: n }, (_, i) => ({ text: `S${i}`, standards: ["RL.4.1"], skills: [{ id: `k${i}`, name: `K${i}`, status: i % masteredEvery === 0 ? "MASTERED" : "NEW", score: null }] })) }],
    });
    const short = shortenStages([st("DEVELOP", 30, 2)], 4)[0];
    assert.equal(short.shown, SHORT_LIMITS.DEVELOP); assert.equal(short.total, 30);
    const kept = short.topics.flatMap((t) => t.statements);
    assert.equal(kept.filter((x) => x.skills[0].status !== "MASTERED").length, 15, "every skill still to learn is kept first");
    const full = shortenStages([st("REINFORCE", 4, 2)], 4)[0];
    assert.equal(full.shown, 4, "a stage within the limit is whole");
    const v = read("src/components/map/study-plan-view.tsx");
    assert.match(v, /d\.counts \?\? planStarCount/, "the count is the whole plan's in both versions");
    assert.match(v, /g\.unlinked\.length > 0 && !link/, "students never see the teacher-only unlinked statements");
    const tb = read("src/components/map/report-toolbar.tsx");
    assert.match(tb, /t\("Short version"\)/); assert.match(tb, /t\("Full version \(every statement\)"\)/); assert.match(tb, /aria-current=\{full \? "page"/);
    assert.match(read("src/server/map/map-reports.ts"), /if \(!full\) for \(const a of areas\) a\.stages = shortenStages/);
  });
});
