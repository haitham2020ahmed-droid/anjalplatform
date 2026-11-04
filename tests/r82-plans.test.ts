/**
 * 📤 r82 plans (owner: "when it sends the plan it STOPS"): a plan for 30 students × 10 skills is sent in one batch —
 *   - the editor's Send (an RTI draft "Struggling skills", every part with its lesson), the program pages' Send
 *     (sendProgramPlan) and the Plans wizard (assignPlan) finish within a small database budget (before r82: every
 *     skill was a full assign — 15–19 calls — and every student × part lesson invite ~8 more, one after another);
 *   - each student gets each part ONCE; pressing Send twice never assigns twice;
 *   - the source follows the plan (RTI / NAFS / MAP / Curriculum), a custom plan needs the teacher's choice;
 *   - any failure comes back as a message on the page (never a thrown error = never a frozen button).
 * 📋 The student's Plans page: in the menu and on Home (EN / AR), every live plan sent to THIS student grouped by
 *   type, cancelled / withdrawn / draft never shown, no level or RTI words, Continue + PDF links.
 * In-memory SQLite only — never a real database or real students.
 */
import { unhandled, inRequest, isRedirect, useDatabase } from "./helpers/page-render";
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { MeasuringRepo, freshStats } from "../scripts/perf/measuring-repo";
import { demoDatabase, ROOT } from "./helpers/db";
import { DEMO_SCHOOL_CODE } from "../src/server/seeding/demo";
import { loadBank } from "../src/server/seeding/load-files";
import { seedQuestions } from "../src/server/seeding/questions";
import { resolveActor } from "../src/server/auth/actor";
import { createSession } from "../src/server/auth/sessions";
import { DEFAULT_AUTH } from "../src/server/auth/config";
import type { Actor } from "../src/server/auth/rbac";
import { ValidationError } from "../src/server/curriculum-admin";
import { countQuestionsOfSkills } from "../src/server/questions/skill-questions";
import { createDraft, sendPlan, withdrawPlan } from "../src/server/plans/editor";
import { sendProgramPlan } from "../src/server/plans/send";
import { assignPlan } from "../src/server/plans/wizard";
import { clearCaches } from "../src/server/cache/idle";
import { planSource } from "../src/server/plans/batch-send";
import { SOURCE_REQUIRED } from "../src/server/assign/source";
import { cardTitle, studentPlans, studentPlanTitle } from "../src/server/student/my-plans";
import { navItemsFor } from "../src/components/nav-items";
import { STUDENT_HOME_TILES } from "../src/components/student/home-tiles-data";
import { UI_STRINGS } from "../src/i18n/en";
import { ar } from "../src/i18n/ar";

const s = (v: unknown) => String(v ?? "");
const read = (f: string) => readFileSync(join(ROOT, f), "utf8");
const NOW = new Date("2027-01-10T08:00:00Z");

let repo: SqliteRepo, m: MeasuringRepo;
let teacher: Actor, cookie: Record<string, string>;
let classId = "", kids: string[] = [], skills: string[] = [];

before(async () => {
  ({ repo } = await demoDatabase({ classesPerGrade: 1, studentsPerClass: 30 }));
  await seedQuestions(repo, { schoolCode: DEMO_SCHOOL_CODE, bank: loadBank(ROOT) });
  const pending = await repo.findMany("Question", { status: "UNDER_REVIEW" }, { select: ["id"] });
  await repo.updateMany("Question", { id: { in: pending.map((q) => q.id) } }, { status: "PUBLISHED" });
  const u = (await repo.findUnique("User", { username: "demo.teacher.4a" }))!;
  teacher = await resolveActor(repo, u);
  cookie = { ela_session: (await createSession(repo, u, { ...DEFAULT_AUTH, sessionTtlMinutes: 24 * 60, idleMinutes: 24 * 60 })).token };
  const t = (await repo.findUnique("Teacher", { userId: u.id }))!;
  classId = s((await repo.findMany("ClassTeacher", { teacherId: t.id }))[0].classId);
  kids = (await repo.findMany("ClassMembership", { classId, leftAt: null })).map((x) => s(x.studentId)).sort();
  assert.equal(kids.length, 30);
  const cur = (await repo.findMany("Curriculum", {})).find((c) => s(c.name).startsWith("Grade 4"))!;
  const all = (await repo.findMany("Skill", { curriculumId: cur.id, deletedAt: null }, { select: ["id", "code"] })).filter((k) => !s(k.code).includes(".grammar."));
  const counts = await countQuestionsOfSkills(repo, s(teacher.schoolId), all.map((k) => s(k.id)));
  skills = all.map((k) => s(k.id)).filter((id) => (counts.get(id) ?? 0) >= 12).sort().slice(0, 10);
  assert.equal(skills.length, 10, "ten Grade 4 skills with questions");
  m = new MeasuringRepo(repo);
  useDatabase(m);
});

/** Runs fn on the measuring repo: database calls and server time (with `latency` ms per call, as on Render). */
async function measure<T>(fn: (r: MeasuringRepo) => Promise<T>, latency = 0): Promise<{ value: T; calls: number; rows: number; ms: number }> {
  clearCaches();
  m.stats = freshStats();
  m.latency = latency;
  const t0 = performance.now();
  try {
    const value = await fn(m);
    return { value, calls: m.stats.calls, rows: m.stats.rows, ms: Math.round(performance.now() - t0) };
  } finally { m.latency = 0; }
}

/** An RTI draft like the Suggested plan "Struggling skills (mastery under 60 after 5 or more answers)": 10 parts, each with its lesson. */
const rtiDraft = () => createDraft(repo, teacher, {
  classId, program: "RTI", studentIds: null, title: "Struggling skills",
  sections: skills.map((skillId) => ({ skillId, count: 10, lesson: true, level: "BELOW" as const, reason: "Struggling skill" })), suggested: true,
}, NOW);

/** (student, skill) → how many live assignments of that skill the student has. */
async function perStudentSkill(): Promise<Map<string, number>> {
  const as = await repo.findMany("Assignment", { classId, deletedAt: null }, { select: ["id", "skillId"] });
  const links = await repo.findMany("AssignmentStudent", { assignmentId: { in: as.map((a) => a.id) } }, { select: ["assignmentId", "studentId"] });
  const skillOf = new Map(as.map((a) => [s(a.id), s(a.skillId)]));
  const out = new Map<string, number>();
  for (const l of links) { const k = `${s(l.studentId)}|${skillOf.get(s(l.assignmentId))}`; out.set(k, (out.get(k) ?? 0) + 1); }
  return out;
}
const clean = async () => {
  const as = await repo.findMany("Assignment", { classId }, { select: ["id"] });
  if (as.length) await repo.updateMany("Assignment", { id: { in: as.map((a) => a.id) } }, { deletedAt: NOW });
};

/** Budgets for one Send of 30 students × 10 skills (before r82: see the r82 commit; measured after r82 plus room). */
const BUDGET = { editor: 45, program: 30, wizard: 45 };

describe("📤 r82 Send: 30 students × 10 skills in one batch", () => {
  test("the editor's Send (RTI draft with lessons): within budget, a few seconds at 5 ms per call, each student gets each part once", async () => {
    await clean();
    const planId = await rtiDraft();
    const r = await measure((x) => sendPlan(x, teacher, planId, NOW, ""), 5);
    console.log(`editor Send: ${r.calls} calls, ${r.rows} rows, ${r.ms} ms at 5 ms per call`);
    assert.equal(r.value.sections, 10);
    assert.equal(r.value.students, 30);
    assert.ok(r.calls <= BUDGET.editor, `editor Send: ${r.calls} calls (budget ${BUDGET.editor})`);
    assert.ok(r.ms < 5000, `editor Send: ${r.ms} ms`);
    const per = await perStudentSkill();
    assert.equal(per.size, 300);
    assert.ok([...per.values()].every((n) => n === 1), "each student gets each part once");
    // r74 + owner r82: an RTI plan's work is RTI work (no source chosen)
    const as = await repo.findMany("Assignment", { classId, deletedAt: null }, { select: ["source", "program", "track"] });
    assert.ok(as.every((a) => a.source === "RTI" && a.program === "RTI"), "RTI plan → source RTI");
    const plan = (await repo.findUnique("SkillPlan", { id: planId }))!;
    assert.equal(plan.status, "SENT");
    assert.equal((await repo.findMany("SkillPlanItem", { planId })).length, 10);
    // lessons: one run per student and skill that has a lesson (never twice)
    const runs = await repo.findMany("LessonRun", { studentId: { in: kids } }, { select: ["studentId", "skillId"] });
    assert.equal(new Set(runs.map((x) => `${x.studentId}|${x.skillId}`)).size, runs.length, "one lesson run per student and skill");
    assert.ok(runs.length >= 30 && runs.length % 30 === 0, `the lessons were opened for every student (${runs.length})`);
    // one notification per student for the whole plan (not one per part)
    const users = (await repo.findMany("Student", { id: { in: kids } }, { select: ["userId"] })).map((x) => s(x.userId));
    const notes = await repo.findMany("Notification", { userId: { in: users }, link: `/student/plans/${planId}` });
    assert.equal(notes.length, 30);
  });

  test("Send twice (or two presses at once): never assigns twice, the second press says it was sent", async () => {
    await clean();
    const planId = await rtiDraft();
    const [a, b] = await Promise.allSettled([sendPlan(repo, teacher, planId, NOW, ""), sendPlan(repo, teacher, planId, NOW, "")]);
    const ok = [a, b].filter((x) => x.status === "fulfilled");
    assert.equal(ok.length, 1, "one of two presses sends");
    const no = [a, b].find((x) => x.status === "rejected") as PromiseRejectedResult;
    assert.ok(no.reason instanceof ValidationError, String(no.reason));
    await assert.rejects(sendPlan(repo, teacher, planId, NOW, ""), ValidationError);
    const per = await perStudentSkill();
    assert.ok([...per.values()].every((n) => n === 1), "still once each");
  });

  test("the program pages' Send (sendProgramPlan) and the Plans wizard: within budget, once each, twice = once", async () => {
    await clean();
    const picks = skills.flatMap((skillId) => kids.map((studentId) => ({ studentId, skillId })));
    const r = await measure((x) => sendProgramPlan(x, teacher, { classId, program: "RTI", title: "Support", picks }, NOW), 5);
    console.log(`program Send: ${r.calls} calls, ${r.rows} rows, ${r.ms} ms at 5 ms per call`);
    assert.ok(r.calls <= BUDGET.program, `program Send: ${r.calls} calls (budget ${BUDGET.program})`);
    assert.equal(r.value.skills, 10); assert.equal(r.value.students, 30);
    // the same Send again (a double press that got through): the same plan, nothing new
    const again = await sendProgramPlan(repo, teacher, { classId, program: "RTI", title: "Support", picks }, NOW);
    assert.equal(again.planId, r.value.planId);
    assert.ok([...(await perStudentSkill()).values()].every((n) => n === 1));
    const src = await repo.findMany("Assignment", { id: { in: r.value.assignmentIds } }, { select: ["source"] });
    assert.ok(src.every((a) => a.source === "RTI"));

    await clean();
    const w = await measure((x) => assignPlan(x, teacher, { classId, studentIds: [], type: "CUSTOM", skillIds: skills, title: "My custom plan", source: "CURRICULUM" }, NOW), 5);
    console.log(`wizard Send: ${w.calls} calls, ${w.rows} rows, ${w.ms} ms at 5 ms per call`);
    assert.ok(w.calls <= BUDGET.wizard, `wizard Send: ${w.calls} calls (budget ${BUDGET.wizard})`);
    assert.equal(w.value.skills, 10); assert.equal(w.value.students, 30);
    const w2 = await assignPlan(repo, teacher, { classId, studentIds: [], type: "CUSTOM", skillIds: skills, title: "My custom plan", source: "CURRICULUM" }, NOW);
    assert.equal(w2.planId, w.value.planId, "twice = once");
    assert.ok([...(await perStudentSkill()).values()].every((n) => n === 1));
    assert.ok((await repo.findMany("Assignment", { id: { in: w.value.assignmentIds } }, { select: ["source"] })).every((a) => a.source === "CURRICULUM"), "custom: the teacher's choice");
  });
});

describe("📤 r82 Send: the right source, and a message whatever happens", () => {
  test("the source follows the plan: RTI / MAP / Curriculum / NAFS plans are that program's work; custom needs the teacher's choice", async () => {
    assert.equal(planSource("RTI", ""), "RTI");
    assert.equal(planSource("MAP", "GRAMMAR"), "MAP", "a program plan's work is that program's");
    assert.equal(planSource("NAFS", null), "NAFS");
    assert.equal(planSource("CURRICULUM", undefined), "CURRICULUM");
    assert.equal(planSource(null, "grammar"), "GRAMMAR", "custom: the teacher's choice");
    assert.equal(planSource(null, ""), null, "custom without a choice: refused");
    await clean();
    const mapDraft = await createDraft(repo, teacher, { classId, program: "MAP", studentIds: [kids[0], kids[1]], sections: [{ skillId: skills[0], count: 5 }] }, NOW);
    await sendPlan(repo, teacher, mapDraft, NOW, "");
    const a = await repo.findMany("Assignment", { classId, deletedAt: null }, { select: ["source", "program", "track"] });
    assert.ok(a.length && a.every((x) => x.source === "MAP" && x.program === "MAP" && x.track === "MAP"));
    const custom = await createDraft(repo, teacher, { classId, program: null, studentIds: [kids[2]], sections: [{ skillId: skills[1], count: 5 }] }, NOW);
    await assert.rejects(sendPlan(repo, teacher, custom, NOW, ""), (e: Error) => e instanceof ValidationError && e.message === SOURCE_REQUIRED);
    assert.equal((await repo.findUnique("SkillPlan", { id: custom }))!.status, "DRAFT", "nothing sent");
    const r = await sendPlan(repo, teacher, custom, NOW, "GRAMMAR");
    assert.equal(r.students, 1);
    await assert.rejects(sendProgramPlan(repo, teacher, { classId, program: null, picks: [{ studentId: kids[0], skillId: skills[2] }] }, NOW), (e: Error) => e.message === SOURCE_REQUIRED);
    // the pages: a program plan shows its source (no select); only a custom plan asks
    for (const f of ["src/components/plans/editor-ui.tsx", "src/components/plans/plan-builder.tsx"]) assert.match(read(f), /program \? <PlanSourceFixed t=\{t\} program=\{[^}]+\} \/> : <SourceSelect /, f);
  });

  test("the editor's Send button: pending state, success message with the counts, any failure → a message (never a frozen button)", async () => {
    const ui = read("src/components/plans/editor-ui.tsx");
    assert.match(ui, /<PendingButton className=\{`\$\{BTN_MAIN\} px-8 text-lg`\} label="Send" pendingLabel="Sending…"/);
    assert.match(read("src/components/plans/plan-builder.tsx"), /<PendingButton formAction=\{p\.send\}[^>]*label="Send" pendingLabel="Sending…"/);
    await clean();
    const run = async (planId: string) => {
      let to = "";
      await inRequest({ path: `/teacher/plans/${planId}`, cookies: cookie }, async () => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const mod = require(join(ROOT, "src/app/teacher/plans/editor-actions.ts")) as Record<string, (f: FormData) => Promise<void>>;
        const f = new FormData(); f.append("planId", planId); f.append("step", "what"); f.append("source", "");
        try { await mod.sendPlanAction(f); } catch (e) { if (isRedirect(e)) to = e.to; else throw e; }
      });
      return Object.fromEntries(new URL(to, "http://x").searchParams).msg ?? "";
    };
    // the database fails in the middle of the send: a message, the draft stays a draft (claim released), nothing assigned
    const broken = await rtiDraft();
    const orig = repo.createMany.bind(repo);
    repo.createMany = async (model: string, rows: Record<string, unknown>[]) => { if (model === "AssignmentStudent") throw new Error("Connection lost (P1017)"); return orig(model, rows); };
    let msg: string;
    try { msg = await run(broken); } finally { repo.createMany = orig; }
    assert.equal(msg, "⚠️ Something went wrong — try again");
    const row = (await repo.findUnique("SkillPlan", { id: broken }))!;
    assert.equal(row.status, "DRAFT"); assert.equal(row.sentAt, null, "the claim is released: Send works again");
    assert.equal((await repo.findMany("Assignment", { classId, deletedAt: null })).length, 0, "nothing half-made");
    // then it works: the success message says how many parts and students
    assert.equal(await run(broken), "Sent: 10 part(s) to 30 student(s). They see it in My Plans and My Work.");
    // pressing again: a message, never an error page
    assert.equal(await run(broken), "⚠️ This plan was sent already. Your changes reach the students as you make them.");
    // the other plan actions: any failure → the friendly message (action-guard)
    for (const f of ["src/app/teacher/plans/actions.ts", "src/app/teacher/rti-plan/actions.ts", "src/app/teacher/plans/editor-actions.ts"]) assert.match(read(f), /failureMessage\(/, f);
  });
});

// ------------------------------------------------------------------ 📋 the student's Plans page

describe("📋 r82 My Plans (student): in the menu and on Home, every live plan of mine by type", () => {
  test("the menu and Home: My Plans (📋, AR خططي) — the page is no longer a redirect", () => {
    const items = navItemsFor("STUDENT", { nafs: false });
    const plans = items.find((i) => i.href === "/student/plans");
    assert.ok(plans, "in the student menu");
    assert.equal(plans!.icon, "📋"); assert.equal(plans!.label, "My Plans"); assert.equal(ar["My Plans"], "خططي");
    assert.ok(STUDENT_HOME_TILES.some((x) => x.href === "/student/plans" && x.label === "My Plans"), "a Home tile");
    assert.doesNotMatch(read("src/app/student/plans/page.tsx"), /redirect\(/);
    for (const k of ["Curriculum Map", "MAP plan", "Custom plan", "Extra practice plan", "NAFS plan", "Other plans", "From {name}", "Open the plan", "Every plan your teacher sent you", "Full curriculum map · Grade {n}"]) {
      assert.ok((UI_STRINGS as readonly string[]).includes(k), k); assert.match(ar[k as keyof typeof ar], /[؀-ۿ]/, k);
    }
    assert.equal(ar["Extra practice plan"], "خطة تدريب إضافي");
    assert.equal(new Set(UI_STRINGS).size, UI_STRINGS.length, "no duplicate interface strings");
  });

  test("grouped by type; only my plans; withdrawn, cancelled, paused and draft plans never show; no level / RTI words; Continue + PDF", async () => {
    await clean();
    const me = kids[0];
    const student = await resolveActor(repo, (await repo.findUnique("User", { id: s((await repo.findUnique("Student", { id: me }))!.userId) }))!);
    const tRow = (await repo.findUnique("Teacher", { userId: teacher.userId }))!;
    // an RTI plan for the class (default title "Support Plan · <class>"), sent from the editor
    const rti = await createDraft(repo, teacher, { classId, program: "RTI", studentIds: null, sections: skills.slice(0, 3).map((skillId) => ({ skillId, count: 5 })) }, NOW);
    await sendPlan(repo, teacher, rti, NOW, "");
    // a MAP plan for me and kids[1]; a custom plan only for kids[1] (not mine)
    const map = await sendProgramPlan(repo, teacher, { classId, program: "MAP", title: "Reading growth", picks: [me, kids[1]].map((studentId) => ({ studentId, skillId: skills[3] })), dueAt: new Date("2027-02-01T23:59:59Z") }, NOW);
    const notMine = await sendProgramPlan(repo, teacher, { classId, program: null, source: "CURRICULUM", title: "Only for Kid 1", picks: [{ studentId: kids[1], skillId: skills[4] }] }, NOW);
    // a withdrawn plan, a cancelled plan, a draft, a paused plan
    const gone = await sendProgramPlan(repo, teacher, { classId, program: null, source: "GRAMMAR", title: "Withdrawn plan", picks: [{ studentId: me, skillId: skills[5] }] }, NOW);
    await withdrawPlan(repo, teacher, gone.planId, NOW);
    const cancelled = await sendProgramPlan(repo, teacher, { classId, program: null, source: "GRAMMAR", title: "Cancelled plan", picks: [{ studentId: me, skillId: skills[6] }] }, NOW);
    await repo.create("AssignmentCancel", { schoolId: teacher.schoolId, kind: "PLAN", refId: cancelled.planId, classId, studentId: null, keys: [`plan:${cancelled.planId}`, ...cancelled.assignmentIds], title: "Cancelled plan", cancelledById: teacher.userId, cancelledAt: NOW, restoredAt: null });
    await createDraft(repo, teacher, { classId, program: null, title: "A draft", sections: [{ skillId: skills[7], count: 5 }] }, NOW);
    const paused = await sendProgramPlan(repo, teacher, { classId, program: null, source: "GRAMMAR", title: "Paused plan", picks: [{ studentId: me, skillId: skills[8] }] }, NOW);
    await repo.updateMany("SkillPlan", { id: paused.planId }, { status: "PAUSED" });
    // a MAP plan of mine (MapPlan), a NAFS practice for my class, the Full curriculum map sent to my class
    const mp = await repo.create("MapPlan", { schoolId: teacher.schoolId, classId, studentId: me, subject: "READING", term: "Fall 2026", status: "SENT", items: [], assignmentIds: [], createdById: teacher.userId, createdAt: NOW, updatedAt: NOW, sentAt: NOW });
    const np = await repo.create("NafsPractice", { schoolId: teacher.schoolId, createdById: tRow.id, title: "NAFS practice: main idea", targets: ["NAFS.RC.MAIN"], classId, studentIds: null, createdAt: NOW });
    await repo.create("SchoolSetting", { schoolId: teacher.schoolId, key: `curriculumMap.pdf:${classId}`, value: { grade: 4, sentAt: NOW.toISOString(), sentById: teacher.userId }, updatedAt: NOW });
    // I finished one part of the RTI plan
    const rtiItems = (await repo.findMany("SkillPlanItem", { planId: rti })).sort((a, b) => Number(a.order) - Number(b.order));
    const aidsOf = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : JSON.parse(s(v)));
    await repo.updateMany("AssignmentStudent", { assignmentId: aidsOf(rtiItems[0].assignmentIds)[0], studentId: me }, { status: "COMPLETED", progress: 1 });

    const r = await measure((x) => studentPlans(x, student, { lang: "en" }, NOW));
    console.log(`My Plans: ${r.calls} calls, ${r.rows} rows`);
    assert.ok(r.calls <= 30, `light: ${r.calls} calls`);
    const groups = r.value;
    assert.deepEqual(groups.map((g) => g.type), ["CURRICULUM", "MAP", "RTI", "NAFS"]);
    const all = groups.flatMap((g) => g.plans);
    const keys = all.map((p) => p.key);
    for (const k of [`plan:${rti}`, `plan:${map.planId}`, `mapplan:${s(mp.id)}`, `nafs:${s(np.id)}`, "map-pdf:4"]) assert.ok(keys.includes(k), k);
    for (const hiddenId of [notMine.planId, gone.planId, cancelled.planId, paused.planId]) assert.ok(!keys.includes(`plan:${hiddenId}`), `hidden: ${hiddenId}`);
    assert.ok(!all.some((p) => p.title === "A draft"), "a draft never shows");
    // RTI → "Extra practice plan" (never RTI / Tier / Support / level words)
    const rtiCard = all.find((p) => p.key === `plan:${rti}`)!;
    assert.equal(rtiCard.type, "RTI"); assert.equal(rtiCard.title, "Extra practice plan"); assert.equal(rtiCard.tr, true);
    assert.equal(groups.find((g) => g.type === "RTI")!.label, "Extra practice plan");
    for (const p of all) assert.doesNotMatch(`${p.title} ${p.suffix ?? ""}`, /\bRTI\b|\bTier\b|Support|Below|Above|Approaching|Exceeding/);
    // progress, teacher, dates, Continue to the next step, PDF
    assert.equal(rtiCard.total, 3); assert.equal(rtiCard.done, 1);
    assert.equal(rtiCard.continueHref, `/student/plans/${rti}/open/${s(rtiItems[1].id)}`, "Continue opens the next step");
    assert.equal(rtiCard.pdfHref, `/student/plans/${rti}?print=1`);
    assert.equal(rtiCard.teacher, s((await repo.findUnique("User", { id: teacher.userId }))!.displayName));
    const mapCard = all.find((p) => p.key === `plan:${map.planId}`)!;
    assert.equal(mapCard.type, "MAP"); assert.equal(mapCard.dueAt, "2027-02-01"); assert.equal(mapCard.date, "2027-01-10");
    assert.equal(all.find((p) => p.key === `mapplan:${s(mp.id)}`)!.pdfHref, `/map-plan/${s(mp.id)}?print=1`);
    assert.equal(all.find((p) => p.key === `nafs:${s(np.id)}`)!.continueHref, `/student/nafs/practice/${s(np.id)}`);
    assert.match(all.find((p) => p.key === "map-pdf:4")!.pdfHref!, /^\/api\/curriculum-map-pdf\?grade=4&copy=student&lang=en&print=1$/);
    // kids[1] sees the plan sent only to them
    const other = await resolveActor(repo, (await repo.findUnique("User", { id: s((await repo.findUnique("Student", { id: kids[1] }))!.userId) }))!);
    const theirs = (await studentPlans(repo, other, {}, NOW)).flatMap((g) => g.plans).map((p) => p.key);
    assert.ok(theirs.includes(`plan:${notMine.planId}`));
    assert.equal(studentPlanTitle("RTI Plan · 4A · Tier 2"), "Extra practice plan · 4A");
    assert.deepEqual(cardTitle("Support Plan · 4A", "RTI"), { title: "Extra practice plan", tr: true, suffix: "4A" });
  });

  test("the page: groups, cards with Continue and Download PDF, no level or RTI words; the plan opens ready to print", () => {
    const page = read("src/app/student/plans/page.tsx");
    assert.match(page, /studentPlans\(repo, actor/);
    assert.match(page, /data-testid="plan-continue"/); assert.match(page, /data-testid="plan-pdf"/);
    assert.match(page, /t\("\{done\} of \{total\} done"/);
    assert.doesNotMatch(page, /\bRTI\b|\bTier\b|Below|Above|Approaching|Exceeding/);
    assert.match(read("src/app/student/plans/[planId]/page.tsx"), /print === "1" && !preview && <AutoPrint \/>/);
    assert.deepEqual(unhandled, []);
  });
});
