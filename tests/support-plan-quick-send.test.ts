/**
 * 🛟 r86: Support plan's "Send as-is" fast path (src/app/teacher/plans/editor-actions.ts's quickSendSupportPlanAction).
 * It is a thin "use server" wrapper — createDraft(program RTI, one student, "Struggling skill" sections) then
 * sendPlan(..., null) — and both of those already have full unit coverage elsewhere (tests/plan-editor.test.ts).
 * This file exercises exactly that same chain the action takes (since "use server" + redirect() needs a real
 * Next.js request, which this harness doesn't have — the same limitation documented in admin-learning-engine.test.ts
 * for runEngineNowAction), confirms the action requires the same ACCESS gate as every other plan-editor action by
 * reading its source, and confirms the Support plan page only renders the new button when there's a real skill to
 * build from (never an empty/useless "Send as-is").
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { demoDatabase, ROOT } from "./helpers/db";
import { DEMO_SCHOOL_CODE } from "../src/server/seeding/demo";
import { loadBank } from "../src/server/seeding/load-files";
import { seedQuestions } from "../src/server/seeding/questions";
import { resolveActor } from "../src/server/auth/actor";
import { ForbiddenError, type Actor } from "../src/server/auth/rbac";
import { ValidationError } from "../src/server/curriculum-admin";
import { createDraft, loadPlan, sendPlan } from "../src/server/plans/editor";
import { studentSkillPlans } from "../src/server/curriculum-map/plans";
import { UI_STRINGS } from "../src/i18n/en";
import { ar } from "../src/i18n/ar";

const s = (v: unknown) => String(v ?? "");
const NOW = new Date("2027-01-10T08:00:00Z");
const read = (f: string) => readFileSync(join(ROOT, f), "utf8");

describe("🛟 Support plan · Send as-is (r86)", () => {
  let repo: SqliteRepo;
  let t4: Actor, t5: Actor;
  let class4 = "";
  let kids: string[] = [];
  let skillA = "";

  before(async () => {
    ({ repo } = await demoDatabase({ classesPerGrade: 1, studentsPerClass: 5 }));
    await seedQuestions(repo, { schoolCode: DEMO_SCHOOL_CODE, bank: loadBank(ROOT) });
    const qs = (await repo.findMany("Question", { status: "UNDER_REVIEW" })).filter((q) => /^G4-/.test(s(q.externalRef)));
    await repo.updateMany("Question", { id: { in: qs.map((q) => q.id) } }, { status: "PUBLISHED" });
    const actorFor = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);
    t4 = await actorFor("demo.teacher.4a"); t5 = await actorFor("demo.teacher.5a");
    const t = await repo.findUnique("Teacher", { userId: t4.userId });
    class4 = s((await repo.findMany("ClassTeacher", { teacherId: t!.id }))[0].classId);
    kids = (await repo.findMany("ClassMembership", { classId: class4, leftAt: null })).map((m) => s(m.studentId)).sort();
    const mc = s((await repo.findMany("QuestionType", { code: "MULTIPLE_CHOICE" }))[0].id);
    const qs4 = (await repo.findMany("Question", { status: "PUBLISHED" }, { select: ["skillId", "externalRef"] })).filter((q) => s(q.externalRef).startsWith("G4-"));
    skillA = [...new Set(qs4.map((q) => s(q.skillId)))][0];
    const t0 = new Date("2026-01-01T00:00:00Z");
    for (let i = 0; i < 20; i++) {
      const q = await repo.create("Question", { skillId: skillA, typeId: mc, stem: `Quick-send test question ${i}: which word fits?`, content: {}, difficultyLevel: 2 + (i % 5), irtB: 0, status: "PUBLISHED", createdAt: t0, updatedAt: t0 });
      for (const [j, o] of ["A", "B", "C"].entries()) await repo.create("QuestionOption", { questionId: q.id, label: o, text: `Word ${o}${i}`, isCorrect: j === 0, order: j });
    }
  });

  test("the action requires the same assignments:create gate every other plan-editor action uses", () => {
    const src = read("src/app/teacher/plans/editor-actions.ts");
    assert.match(src, /export async function quickSendSupportPlanAction\(f: FormData\) \{\s*\n\s*const a = await requireActor\(ACCESS\)/);
    // ACCESS itself: TEACHER/SCHOOL_ADMIN + assignments:create — shared by every action in this file
    assert.match(src, /const ACCESS: Parameters<typeof requireActor>\[0\] = \{ roles: \["TEACHER", "SCHOOL_ADMIN"\], permission: "assignments:create" \}/);
  });

  test("the same chain the action runs (createDraft program RTI, one student, 'Struggling skill' sections → sendPlan with no source chosen) sends immediately", async () => {
    const planId = await createDraft(repo, t4, { classId: class4, program: "RTI", studentIds: [kids[0]], sections: [{ skillId: skillA, count: 10, reason: "Struggling skill" }], suggested: true }, NOW);
    const before = await loadPlan(repo, t4, planId);
    assert.equal(before.status, "DRAFT");
    assert.equal(before.program, "RTI");
    assert.deepEqual(before.planStudents, [kids[0]]);
    // RTI's own program resolves the required "source" on its own — no explicit source needed from the teacher,
    // which is exactly why this fast path can skip the Preview/Send step that asks for one on a CUSTOM plan.
    const r = await sendPlan(repo, t4, planId, NOW, null);
    assert.ok(r.sections >= 1 && r.students === 1);
    const after = await loadPlan(repo, t4, planId);
    assert.equal(after.status, "SENT");
    const studentActor = await resolveActor(repo, (await repo.findUnique("User", { id: s((await repo.findUnique("Student", { id: kids[0] }))!.userId) }))!);
    const plans = await studentSkillPlans(repo, studentActor);
    assert.ok(plans.some((p) => s(p.id) === planId), "the student sees it in My Plans right away — no separate preview step was needed");
  });

  test("a foreign teacher can't build the same quick-send plan for another teacher's class (createDraft's own class-access check)", async () => {
    await assert.rejects(createDraft(repo, t5, { classId: class4, program: "RTI", studentIds: [kids[1]], sections: [{ skillId: skillA, count: 10, reason: "Struggling skill" }], suggested: true }, NOW), ForbiddenError);
  });

  test("sending the same draft twice is refused the second time (claims the draft once), matching the normal Send button's behaviour", async () => {
    const planId = await createDraft(repo, t4, { classId: class4, program: "RTI", studentIds: [kids[2]], sections: [{ skillId: skillA, count: 10, reason: "Struggling skill" }], suggested: true }, NOW);
    await sendPlan(repo, t4, planId, NOW, null);
    await assert.rejects(sendPlan(repo, t4, planId, NOW, null), ValidationError);
  });

  test("the Support plan page only renders 'Send as-is' when there is at least one struggling skill to build the plan from", () => {
    const src = read("src/app/teacher/plans/support/page.tsx");
    assert.match(src, /\{ids\.length > 0 && \(\s*\n\s*<form action=\{quickSendSupportPlanAction\}/);
  });

  test("i18n: 'Send as-is' and its caption exist in English and have a non-empty Arabic translation", () => {
    for (const key of ["Send as-is", "Sends right away, no review"] as const) {
      assert.ok(UI_STRINGS.includes(key), `${key} is in UI_STRINGS`);
      assert.ok(ar[key] && ar[key].trim().length, `${key} has an Arabic translation`);
    }
  });
});
