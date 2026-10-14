/**
 * 🛠 Admin question tools (owner r67, items 1–6 and 8): delete any question (answered ones hidden everywhere, answers
 * kept), "Make a new version" (bug), Edit anyway, flags (who / why / unflag), Auto-classify (bug), the "Sort them" link
 * and its count (bug), the School Analytics dashboard, line icons and no dead links. In-memory SQLite only.
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import { ForbiddenError, type Actor } from "../src/server/auth/rbac";
import { deleteQuestions } from "../src/server/admin/question-delete";
import { editPublishedAsNewVersion, getQuestion, openRevisionOf, publishQuestions, reviseQuestion, updateDraft } from "../src/server/admin/questions";
import { bankBanners, bankStatusCounts, flagQuestionsForReview, flagsOfQuestion, listBankPage, unflagQuestions } from "../src/server/admin/questions-list";
import { reportQuestionProblem, flagQuestion } from "../src/server/teacher/classroom";
import { autoClassify, setQuestionMapNode, unclassifiedQuestions, unclassifiedSkillId } from "../src/server/curriculum-map/questions";
import { parseCurriculumMap } from "../src/server/curriculum-map/source";
import { seedCurriculumMap } from "../src/server/curriculum-map/seed";
import { unclassifiedCount } from "../src/server/admin/stuck-questions";
import { schoolDashboard } from "../src/server/analytics/school-dashboard";
import { loadSkillItems } from "../src/server/practice/items";
import { DELETED_OWNER } from "../src/server/questions/private-copies";
import { demoDatabase, ROOT } from "./helpers/db";
import { publishGrade4Bank } from "./helpers/practice";

const read = (f: string) => readFileSync(join(ROOT, f), "utf8");
const s = (v: unknown) => String(v ?? "");

describe("🛠 admin question tools", () => {
  let repo: SqliteRepo;
  let admin: Actor, teacher: Actor, studentActor: Actor;
  let studentId: string, classId: string, teacherRowId: string;
  const answer = async (questionId: string, correct = false, at = new Date()) => {
    const q = (await repo.findUnique("Question", { id: questionId }))!;
    const sess = await repo.create("PracticeSession", { studentId, skillId: q.skillId, mode: "ADAPTIVE_PRACTICE", startedAt: at });
    await repo.create("QuestionAttempt", { studentId, sessionId: sess.id, questionId, skillId: q.skillId, response: "A", isCorrect: correct, responseMs: 20_000, difficultyB: 0, createdAt: at });
  };
  const published = async (n: number, skip = 0) => (await repo.findMany("Question", { status: "PUBLISHED", deletedAt: null }, { select: ["id", "skillId"], orderBy: [{ field: "id", dir: "asc" }], take: n, skip }));

  before(async () => {
    ({ repo } = await demoDatabase());
    await publishGrade4Bank(repo);
    const actorFor = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);
    admin = await actorFor("demo.admin");
    teacher = await actorFor("demo.teacher.4a");
    teacherRowId = s((await repo.findUnique("Teacher", { userId: teacher.userId }))!.id);
    classId = s((await repo.findMany("ClassTeacher", { teacherId: teacherRowId }))[0].classId);
    studentId = s((await repo.findMany("ClassMembership", { classId }))[0].studentId);
    studentActor = await resolveActor(repo, (await repo.findUnique("User", { id: (await repo.findUnique("Student", { id: studentId }))!.userId }))!);
    await seedCurriculumMap(repo, parseCurriculumMap(read("data/curriculum-map/source.txt")), { schoolId: admin.schoolId! });
  });

  // ------------------------------------------------------------------ 1. delete any question
  test("1 · admin deletes an ANSWERED question: gone from the whole platform and from sets not started; answers stay", async () => {
    const [q, other] = await published(2);
    const qid = s(q.id);
    await answer(qid, true);
    const node = (await repo.findMany("CurriculumMapNode", { acceptsQuestions: true }, { take: 1 }))[0];
    await setQuestionMapNode(repo, qid, s(node.id), admin.userId);
    await repo.create("QuestionUse", { questionId: qid, use: "PLACEMENT", createdAt: new Date() });
    // two sets of the class: one nobody started, one a student started
    const fresh = await repo.create("Assignment", { classId, createdById: teacherRowId, title: "Fresh", target: "SKILL", questionIds: [qid, s(other.id)], createdAt: new Date() });
    const started = await repo.create("Assignment", { classId, createdById: teacherRowId, title: "Started", target: "SKILL", questionIds: [qid, s(other.id)], createdAt: new Date() });
    await repo.create("AssignmentStudent", { assignmentId: fresh.id, studentId, status: "NOT_STARTED" });
    await repo.create("AssignmentStudent", { assignmentId: started.id, studentId, status: "IN_PROGRESS" });
    const before = await bankStatusCounts(repo, admin, { status: "ALL" });

    await assert.rejects(deleteQuestions(repo, teacher, [qid]), ForbiddenError, "teachers keep today's rules (request a deletion)");
    const r = await deleteQuestions(repo, admin, [qid]);
    assert.deepEqual([r.deleted, r.hidden, r.skipped.length], [1, 1, 0], "deleted (hidden) — no longer refused with “Archive it instead”");

    const row = (await repo.findUnique("Question", { id: qid }))!;
    assert.ok(row.deletedAt, "hard-hidden state");
    assert.equal(row.status, "ARCHIVED");
    assert.equal(row.privateToId, DELETED_OWNER);
    assert.equal(await repo.count("QuestionAttempt", { questionId: qid }), 1, "students' past answers stay in their records");
    assert.equal(await repo.count("Question", { id: qid, status: "ARCHIVED" }), 1, "a read by id (history, reports) still finds it");
    assert.equal(await repo.count("Question", { status: "ARCHIVED", deletedAt: { not: null } }), 0, "every shared read (lists, counts, pools) skips it");
    const after = await bankStatusCounts(repo, admin, { status: "ALL", q: "zz-no-cache" }).then(() => listBankPage(repo, admin, { status: "ALL", q: qid }));
    assert.equal(after.total, 0, "not found in the bank list, even by its id");
    assert.ok(!(await loadSkillItems(repo, s(q.skillId))).some((i) => i.questionId === qid), "out of practice / adaptive pools");
    assert.equal(await repo.count("QuestionMapLink", { questionId: qid }), 0, "off the Curriculum Map");
    assert.equal(await repo.count("QuestionUse", { questionId: qid }), 0, "no Placement / MAP use");
    assert.deepEqual((await repo.findUnique("Assignment", { id: fresh.id }))!.questionIds, [s(other.id)], "removed from the set nobody started");
    assert.deepEqual((await repo.findUnique("Assignment", { id: started.id }))!.questionIds, [qid, s(other.id)], "a started set keeps its questions");
    assert.ok(before.ALL > 0);
    await assert.rejects(getQuestion(repo, admin, qid), /not found/i, "its page is gone");

    // an unanswered question is still deleted for real
    const [plain] = await published(1, 5);
    assert.deepEqual(await deleteQuestions(repo, admin, [s(plain.id)]), { deleted: 1, hidden: 0, skipped: [] });
    assert.equal(await repo.findUnique("Question", { id: plain.id }), null);
  });

  test("1 · the bulk Delete and the page say what happens (confirm mentions students' answers)", () => {
    const list = read("src/app/admin/questions/question-list.tsx");
    assert.match(list, /Students' past answers stay in their records/);
    const page = read("src/app/admin/questions/[questionId]/page.tsx");
    assert.match(page, /Students' past answers stay in their records/);
    assert.doesNotMatch(page, /Only possible while no student has answered it/);
  });

  // ------------------------------------------------------------------ 2. Make a new version (bug)
  test("2 · BUG “Make a new version”: the new draft is reachable and opens in its editor; publishing it replaces the old one everywhere", async () => {
    const [q, other] = await published(2, 10);
    const qid = s(q.id);
    await answer(qid);
    const fresh = await repo.create("Assignment", { classId, createdById: teacherRowId, title: "Fresh 2", target: "SKILL", questionIds: [qid, s(other.id)], createdAt: new Date() });
    await repo.create("AssignmentStudent", { assignmentId: fresh.id, studentId, status: "NOT_STARTED" });
    const node = (await repo.findMany("CurriculumMapNode", { acceptsQuestions: true }, { take: 1, skip: 1 }))[0];
    await setQuestionMapNode(repo, qid, s(node.id), admin.userId);

    const d0 = await getQuestion(repo, admin, qid);
    assert.equal(d0.canEdit, false, "answered: not editable in place");
    const newId = await reviseQuestion(repo, admin, qid);
    // the bug: the old page had no way to reach the draft (and the action only said “New version created.”)
    const d1 = await getQuestion(repo, admin, qid);
    assert.equal(d1.openRevision, newId, "the published question links to its new version");
    assert.equal(await openRevisionOf(repo, qid), newId);
    assert.equal(await reviseQuestion(repo, admin, qid), newId, "pressing again opens the same draft");
    const step = read("src/app/admin/actions.ts");
    assert.match(step, /goTo\(`\/admin\/questions\/\$\{made\}\?msg=/, "the action lands in the new draft's editor");
    const draft = await getQuestion(repo, admin, newId);
    assert.equal(draft.status, "DRAFT");
    assert.equal(draft.canEdit, true, "the admin can edit the new version");
    assert.equal(draft.input.stem, d0.input.stem, "with the current content");
    // moved to another skill while editing: still found as the open version
    await updateDraft(repo, admin, newId, { ...draft.input, stem: `${draft.input.stem} (revised)` });
    assert.equal(await openRevisionOf(repo, qid), newId);

    const p = await publishQuestions(repo, admin, [newId]);
    assert.deepEqual(p.published, [newId], JSON.stringify(p.skipped));
    const old = (await repo.findUnique("Question", { id: qid }))!;
    assert.equal(old.status, "ARCHIVED", "the old version is archived");
    assert.equal((old.tags as { replacedBy?: string }).replacedBy, newId, "and linked to the one that replaced it");
    assert.equal((await getQuestion(repo, admin, qid)).replacedBy, newId);
    assert.deepEqual((await repo.findUnique("Assignment", { id: fresh.id }))!.questionIds, [newId, s(other.id)], "the new version takes its place in sets not started");
    assert.equal(await repo.count("QuestionMapLink", { questionId: qid }), 0);
    assert.equal(await repo.count("QuestionMapLink", { questionId: newId }), 1, "and on the Curriculum Map");
    assert.equal(await repo.count("QuestionAttempt", { questionId: qid }), 1, "answers stay with the old wording");
  });

  test("2 · Edit anyway: an admin's change of an answered question is saved and published as a new version", async () => {
    const [q] = await published(1, 20);
    const qid = s(q.id);
    await answer(qid);
    const d = await getQuestion(repo, admin, qid);
    assert.equal(d.canEditAnyway, true);
    assert.equal((await getQuestion(repo, teacher, qid)).canEditAnyway, false, "teachers keep their rules");
    await assert.rejects(editPublishedAsNewVersion(repo, teacher, qid, d.input), ForbiddenError);
    const newId = await editPublishedAsNewVersion(repo, admin, qid, { ...d.input, stem: `${d.input.stem} — clearer` });
    const n = (await repo.findUnique("Question", { id: newId }))!;
    assert.equal(n.status, "PUBLISHED");
    assert.match(s(n.stem), /clearer$/);
    assert.equal((await repo.findUnique("Question", { id: qid }))!.status, "ARCHIVED");
    assert.match(read("src/app/admin/questions/save-actions.ts"), /editPublishedAsNewVersion/, "the editor's Save uses it for answered questions");
  });

  // ------------------------------------------------------------------ 3. flags
  test("3 · flags: who flagged and why; Unflag one or many", async () => {
    const [a, b] = await published(2, 30);
    await flagQuestion(repo, studentActor, s(a.id), "UNCLEAR", "I do not get it");
    await reportQuestionProblem(repo, teacher, s(a.id), "WRONG_ANSWER", "B is also right");
    await flagQuestionsForReview(repo, admin, [s(b.id)], "check wording");
    const who = await flagsOfQuestion(repo, admin, s(a.id));
    assert.equal(who.length, 2);
    assert.ok(who.some((f) => f.role === "STUDENT" && f.note === "I do not get it" && /not clear/.test(f.reason) && f.by !== "—"), JSON.stringify(who));
    assert.ok(who.some((f) => f.role === "TEACHER" && /answer is wrong/.test(f.reason)));
    const page = await listBankPage(repo, admin, { status: "ALL", q: s(a.id) });
    assert.equal(page.rows[0].flags, 2, "the list shows the open flags");
    assert.deepEqual(await unflagQuestions(repo, admin, [s(a.id), s(b.id)]), { cleared: 2 });
    assert.equal(await repo.count("QuestionFlag", { questionId: { in: [s(a.id), s(b.id)] }, status: "OPEN" }), 0);
    assert.equal((await flagsOfQuestion(repo, admin, s(a.id))).length, 2, "the history of who flagged stays");
    await assert.rejects(unflagQuestions(repo, teacher, [s(a.id)]), ForbiddenError);
  });

  // ------------------------------------------------------------------ 4. Auto-classify (bug)
  test("4 · BUG Auto-classify: by map place when there is no standard, and never stops on a switched-off skill", async () => {
    const hidden = await unclassifiedSkillId(repo, admin.schoolId!, 4);
    // a question with NO standard, placed on a Curriculum Map place whose lesson names a skill
    const nodes = (await repo.findMany("CurriculumMapNode", { acceptsQuestions: true }, { select: ["id", "code"] })).filter((n) => /^G4\.U1\.TS1\.ACS\.ON$/.test(s(n.code)));
    const [q1, q2] = await published(2, 40);
    await repo.updateMany("Question", { id: q1.id }, { skillId: hidden, standardId: null });
    await setQuestionMapNode(repo, s(q1.id), s(nodes[0].id), admin.userId);
    // a question whose standard's only same-grade skill is switched off
    const q2row = (await repo.findUnique("Question", { id: q2.id }))!;
    const links = await repo.findMany("SkillStandard", { standardId: q2row.standardId });
    const offSkill = s(links[0].skillId);
    for (const l of links) await repo.updateMany("Skill", { id: l.skillId }, { isActive: false });
    await repo.updateMany("Question", { id: q2.id }, { skillId: hidden });
    await answer(s(q1.id), true);

    const r = await autoClassify(repo, admin.schoolId!, admin.userId);
    const after1 = (await repo.findUnique("Question", { id: q1.id }))!;
    assert.notEqual(s(after1.skillId), hidden, "classified by its Curriculum Map place (the old button looked at the standard only: nothing happened)");
    assert.ok(r.classified >= 1, JSON.stringify(r));
    assert.equal(s((await repo.findMany("QuestionAttempt", { questionId: q1.id }))[0].skillId), s(after1.skillId), "its answers moved with it");
    assert.equal(s((await repo.findUnique("Question", { id: q2.id }))!.skillId), hidden, "a switched-off skill is never used — and the run did not stop with an error");
    assert.equal(r.left, await unclassifiedCount(repo, admin.schoolId!), "how many remain");
    for (const l of links) await repo.updateMany("Skill", { id: l.skillId }, { isActive: true });
    assert.ok(offSkill);
    // the page runs it in batches with progress and the per-row picker saves row by row
    const actions = read("src/app/admin/questions/unclassified/actions.ts");
    assert.match(actions, /classifyStep\(/);
    assert.match(actions, /for \(const it of items/);
    assert.match(read("src/app/admin/questions/unclassified/auto-classify.tsx"), /progressbar/);
  });

  // ------------------------------------------------------------------ 5. “Sort them” (bug)
  test("5 · BUG “Sort them”: the link opens the classify view at once, and its count matches the banner", async () => {
    const hidden = await unclassifiedSkillId(repo, admin.schoolId!, 4);
    const [a, b] = await published(2, 50);
    await repo.updateMany("Question", { id: { in: [a.id, b.id] } }, { skillId: hidden });
    await repo.updateMany("Question", { id: b.id }, { status: "ARCHIVED" });
    // archived questions on the hidden skill made the two numbers differ (3,510 on the bank, 4,044 on the classify page)
    const banner = (await bankBanners(repo, admin)).unclassified;
    const page = await unclassifiedQuestions(repo, admin.schoolId!, { page: 1, per: 50 });
    assert.equal(page.total, banner, "the same number on both pages");
    assert.equal(banner, await unclassifiedCount(repo, admin.schoolId!));
    assert.ok(page.rows.length <= 50, "one page of 50, read by the database (it used to draw thousands of rows and pickers)");
    assert.ok(!page.rows.some((r) => r.id === s(b.id)), "archived ones are not in it");
    const bank = read("src/app/admin/questions/page.tsx");
    assert.match(bank, /href="\/admin\/questions\/unclassified"/);
    const view = read("src/app/admin/questions/unclassified/page.tsx");
    assert.match(view, /per: PER/);
    assert.match(read("src/app/admin/questions/unclassified/loading.tsx"), /Skeleton/, "instant feedback after the click");
  });

  // ------------------------------------------------------------------ 6. School Analytics dashboard
  test("6 · School Analytics: one dashboard page (KPIs, charts, class cards, standards lowest first, small downloads)", async () => {
    const period = { name: "SCHOOL_YEAR" as const, label: "This school year", from: new Date(Date.now() - 200 * 86_400_000), to: new Date(Date.now() + 86_400_000) };
    const d = await schoolDashboard(repo, admin, period);
    assert.ok(d.kpis.students > 0 && d.kpis.answers > 0 && d.kpis.activeWeek >= 1, JSON.stringify(d.kpis));
    assert.equal(d.weeks.length, 10);
    assert.ok(d.classes.length > 0 && d.classes.every((c) => c.classId && c.grade > 0));
    for (let i = 1; i < d.standards.length; i++) assert.ok(d.standards[i - 1].accuracy <= d.standards[i].accuracy, "lowest first");
    await assert.rejects(schoolDashboard(repo, teacher, period), ForbiddenError);
    const page = read("src/app/admin/analytics/page.tsx");
    assert.match(page, /schoolDashboard\(/);
    assert.match(page, /data-testid="kpis"/);
    assert.match(page, /data-testid="class-cards"/);
    assert.doesNotMatch(page, /<ReportDownloads|role="tab"|<details/, "no tabs or nested sections; downloads as small buttons");
  });

  // ------------------------------------------------------------------ 8. icons and links
  test("8 · admin question pages: line icons (no emoji), and every link goes to a page that exists", () => {
    const files: string[] = [];
    const walk = (d: string) => { for (const f of readdirSync(join(ROOT, d))) { const p = `${d}/${f}`; if (statSync(join(ROOT, p)).isDirectory()) walk(p); else if (p.endsWith(".tsx")) files.push(p); } };
    walk("src/app/admin/questions");
    files.push("src/app/admin/question-flags/page.tsx", "src/app/admin/question-review/page.tsx", "src/app/admin/item-quality/page.tsx", "src/app/admin/bank-gaps/page.tsx", "src/app/admin/analytics/page.tsx", "src/components/admin/fix-report.tsx");
    const emoji = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{26FF}\u{2B50}\u{2B06}\u{2B07}\u{2705}\u{274C}\u{270F}\u{2728}\u{2795}]/u;
    const pages = new Set<string>();
    const walkPages = (d: string) => { for (const f of readdirSync(join(ROOT, d))) { const p = `${d}/${f}`; if (statSync(join(ROOT, p)).isDirectory()) walkPages(p); else if (f === "page.tsx" || f === "route.ts") pages.add(d.replace(/^src\/app/, "").replace(/\/\([^)]+\)/g, "") || "/"); } };
    walkPages("src/app");
    const exists = (href: string) => { const h = href.split(/[?#]/)[0]; return pages.has(h) || [...pages].some((p) => p.includes("[") && new RegExp(`^${p.replace(/\[[^\]]+\]/g, "[^/]+")}$`).test(h)); };
    const bad: string[] = [];
    for (const f of files) {
      read(f).split("\n").forEach((l, i) => {
        const t = l.trim();
        if (/^(\/\/|\*|\/\*|\{\/\*)/.test(t)) return;
        if (emoji.test(l)) bad.push(`${f}:${i + 1} emoji`);
        for (const m of l.matchAll(/href=(?:\{`|")(\/[^"`]*)/g)) if (!exists(m[1].replace(/\$\{[^}]+\}/g, "x"))) bad.push(`${f}:${i + 1} ${m[1]}`);
      });
    }
    assert.deepEqual(bad, []);
    assert.match(read("src/app/admin/questions/bank-tabs.tsx"), /<LineIcon name=\{x\.icon\}/);
    assert.match(read("src/components/page-header.tsx"), /isLineIcon\(icon\)/, "page headers draw line icons");
  });
});
