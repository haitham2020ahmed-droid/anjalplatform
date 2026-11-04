/**
 * 👪 Family reports with the admin's approval.
 *
 * The teacher prepares a report for one student — the platform writes it (AUTO: MAP, Diagnostic, ReadRise level,
 * reading fluency, the Fluency Coach plan, Writing (approved grades only), practice, strengths, next steps, help at
 * home — family-sections.ts; never level or tier wording: the student sees it too) or the teacher writes it (MANUAL,
 * from a short template) — then reads it, edits it and sends it for approval. Every school admin is notified; an admin approves it (the student
 * and the parents are notified and see it in the Family Report) or returns it to the teacher with a note.
 *
 * Sharing the progress report or the Diagnostic report with the family goes the same way for a teacher (PROGRESS /
 * DIAGNOSTIC: a snapshot to approve; approval shares the live report). Admins approve their own reports at once.
 * No student data leaves the platform: everything here is built from the school's own records.
 */
import type { Repo, Row } from "../seeding/repo";
import { assertCan, ForbiddenError, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import { assertClassAccess } from "../teacher/assignments";
import { readableClasses } from "../teacher/coordinators";
import { studentNames } from "../insights/student-data";
import { fluencyGoalWords, fluencyPlanSection, gradeGoalWords, hasLevelWords, readRiseSection, writingSection } from "./family-sections";
import { homeTopicFor } from "./family-week-words";
import { pctChange } from "../../lib/report-summary";

const s = (v: unknown) => String(v ?? "");
const d = (v: unknown): Date | null => (v instanceof Date ? v : v ? new Date(s(v)) : null);
const day = (v: unknown) => d(v)?.toISOString().slice(0, 10) ?? null;
const json = <T>(v: unknown, fb: T): T => { if (v === null || v === undefined) return fb; if (typeof v === "string") { try { return JSON.parse(v) as T; } catch { return fb; } } return v as T; };

export type ReportKind = "AUTO" | "MANUAL" | "PROGRESS" | "DIAGNOSTIC" | "MONTHLY";
export type ReportStatus = "DRAFT" | "PENDING" | "RETURNED" | "APPROVED" | "WITHDRAWN";
export interface ReportSection { heading: string; icon: string; lines: string[] }
/** `ar`: the Arabic copy of the summary and sections the platform wrote (the monthly report); the teacher's message is shared. */
export interface FamilyContent { summary: string; sections: ReportSection[]; message: string; ar?: { summary: string; sections: ReportSection[] } | null }
export interface FamilyReportRow {
  id: string; studentId: string; studentName: string; className: string; grade: number; kind: ReportKind; title: string; status: ReportStatus;
  content: FamilyContent; refId: string | null; author: string; createdById: string; createdAt: string; submittedAt: string | null;
  reviewedAt: string | null; reviewer: string | null; reviewNote: string | null; seenByParentAt: string | null; seenByStudentAt: string | null;
}
export const KIND_LABEL: Record<ReportKind, string> = { AUTO: "Prepared by the platform", MANUAL: "Written by the teacher", PROGRESS: "Progress report", DIAGNOSTIC: "Diagnostic report", MONTHLY: "Monthly report" };
const isAdmin = (a: Actor) => a.role === "SCHOOL_ADMIN" || a.role === "SUPER_ADMIN";
const MAX_LINES = 12, MAX_LINE = 400;

/** The student's class and grade; staff must teach (or coordinate) the class. */
async function studentInfo(repo: Repo, actor: Actor, studentId: string, write: boolean): Promise<{ st: Row; classId: string | null; className: string; grade: number }> {
  const st = await repo.findUnique("Student", { id: studentId });
  if (!st || s(st.schoolId) !== s(actor.schoolId)) throw new ForbiddenError("Student not found.");
  const m = (await repo.findMany("ClassMembership", { studentId, leftAt: null }))[0];
  const klass = m ? await repo.findUnique("Class", { id: m.classId }) : null;
  const grade = Number((st.gradeId ? await repo.findUnique("Grade", { id: st.gradeId }) : null)?.level ?? 0);
  if (actor.role === "TEACHER") {
    if (!klass) throw new ValidationError("This student is not in a class.");
    if (write) await assertClassAccess(repo, actor, s(klass.id));
    else if (!(await readableClasses(repo, actor)).some((c) => c.id === klass.id)) throw new ForbiddenError("This student is not in your classes.");
  } else if (!isAdmin(actor)) throw new ForbiddenError();
  return { st, classId: klass ? s(klass.id) : null, className: s(klass?.name), grade };
}

function cleanSections(list: unknown): ReportSection[] {
  return (Array.isArray(list) ? list as Partial<ReportSection>[] : []).slice(0, 12).map((x) => ({
    heading: s(x?.heading).trim().slice(0, 120), icon: s(x?.icon).trim().slice(0, 8) || "•",
    lines: (Array.isArray(x?.lines) ? x.lines : []).map((l) => s(l).replace(/\s+/g, " ").trim().slice(0, MAX_LINE)).filter(Boolean).slice(0, MAX_LINES),
  })).filter((x) => x.heading || x.lines.length);
}
function clean(c: Partial<FamilyContent>): FamilyContent {
  const out: FamilyContent = { summary: s(c.summary).trim().slice(0, 2000), sections: cleanSections(c.sections), message: s(c.message).trim().slice(0, 2000) };
  if (c.ar && typeof c.ar === "object") out.ar = { summary: s(c.ar.summary).trim().slice(0, 2000), sections: cleanSections(c.ar.sections) };
  return out;
}
/** The content in the reader's language: the Arabic copy when there is one (the teacher's message as written). */
export function contentIn(c: FamilyContent, lang: string): FamilyContent {
  return lang === "ar" && c.ar && (c.ar.summary || c.ar.sections.length) ? { summary: c.ar.summary, sections: c.ar.sections, message: c.message } : c;
}

// ------------------------------------------------------------------ what the platform writes (AUTO)

const DESCRIPTOR: Record<string, string> = { Low: "Low", LoAvg: "Low Average", Avg: "Average", HiAvg: "High Average", High: "High" };

/** The latest MAP term of each subject: RIT, percentile, growth and the instructional areas (strongest first). */
async function mapLines(repo: Repo, studentId: string): Promise<{ lines: string[]; weakest: string[]; strongest: string[] }> {
  const rows = await repo.findMany("MapResult", { studentId });
  const lines: string[] = [], weakest: string[] = [], strongest: string[] = [];
  for (const [label, re] of [["Reading", /read/i], ["Language Usage", /language/i]] as const) {
    const mine = rows.filter((r) => re.test(s(r.subject)));
    const overall = mine.filter((r) => !r.goalName).sort((a, b) => (d(b.testDate)?.getTime() ?? 0) - (d(a.testDate)?.getTime() ?? 0))[0];
    if (!overall) continue;
    const term = s(overall.termName);
    const pct = overall.achievementPercentile !== null && overall.achievementPercentile !== undefined ? `, percentile ${s(overall.achievementPercentile)}` : "";
    const proj = overall.projectedGrowth !== null && overall.projectedGrowth !== undefined ? ` · Spring goal ${Number(overall.rit) + Number(overall.projectedGrowth)}` : "";
    // % improvement, alongside the RIT points (never a bare discouraging negative %): the same before/after this
    // growth already compares (the previous test's RIT = this RIT minus the point change) — no new comparison point.
    const growthPts = overall.observedGrowth !== null && overall.observedGrowth !== undefined ? Number(overall.observedGrowth) : null;
    const growthPct = growthPts !== null ? pctChange(Number(overall.rit), Number(overall.rit) - growthPts) : null;
    const growPctText = growthPct !== null && growthPct > 0 ? ` (+${growthPct}% — great progress!)` : growthPts !== null ? " (holding steady)" : "";
    const grow = overall.observedGrowth !== null && overall.observedGrowth !== undefined ? ` · growth ${Number(overall.observedGrowth) >= 0 ? "+" : ""}${s(overall.observedGrowth)} RIT${growPctText}${overall.metProjectedGrowth ? ` (${/yes/i.test(s(overall.metProjectedGrowth)) ? "met" : "is working toward"} the projected growth)` : ""}` : "";
    lines.push(`${label} (${term}): RIT ${s(overall.rit)}${pct}${proj}${grow}.`);
    // areas: one line per instructional area (several platform goals may hold the same area score)
    const areas = new Map<string, { rit: number; descriptor: string | null }>();
    for (const g of mine.filter((r) => r.goalName && s(r.termName) === term)) {
      const name = s(g.goalName).split(":")[0].trim();
      if (!areas.has(name)) areas.set(name, { rit: Number(g.rit), descriptor: g.descriptor ? s(g.descriptor) : null });
    }
    const list = [...areas].sort((a, b) => b[1].rit - a[1].rit);
    if (list.length) {
      lines.push(`${label} areas: ${list.map(([n, v]) => `${n} ${v.rit}${v.descriptor ? ` (${DESCRIPTOR[v.descriptor] ?? v.descriptor})` : ""}`).join(" · ")}.`);
      strongest.push(list[0][0]);
      if (list.length > 1) weakest.push(list[list.length - 1][0]);
    }
  }
  return { lines, weakest, strongest };
}

export async function autoContent(repo: Repo, actor: Actor, studentId: string, now = new Date()): Promise<FamilyContent> {
  const { parentReport } = await import("../insights/parent-report");
  const { studentDiagnosticReport } = await import("../diagnostic/report");
  const { coachSummary } = await import("../fluency/coach");
  const st = await repo.findUnique("Student", { id: studentId });
  const grade = Number((st?.gradeId ? await repo.findUnique("Grade", { id: st.gradeId }) : null)?.level ?? 0);
  const [p, map, diag, flu, writing, readrise, plan] = await Promise.all([
    parentReport(repo, actor, studentId, now),
    mapLines(repo, studentId),
    studentDiagnosticReport(repo, actor, studentId).catch(() => null),
    coachSummary(repo, studentId),
    writingSection(repo, studentId),
    readRiseSection(repo, studentId, now),
    fluencyPlanSection(repo, studentId, grade, now),
  ]);
  const first = p.name.split(" ")[0];
  const sections: ReportSection[] = [];
  if (map.lines.length) sections.push({ heading: "MAP Growth", icon: "📈", lines: map.lines });
  if (diag) sections.push({ heading: "Diagnostic test", icon: "📝", lines: [
    `${diag.title}: ${diag.pct}% · ${gradeGoalWords(diag.level)}${diag.readingLevel ? ` · reading level ${diag.readingLevel}` : ""}.`,
    ...(diag.strengths.length ? [`Strong in: ${diag.strengths.slice(0, 3).join(", ")}.`] : []),
    ...(diag.needs.length ? [`To work on: ${diag.needs.slice(0, 3).map((x) => x.label).join(", ")}.`] : []),
  ] });
  if (readrise) sections.push(readrise);
  if (flu.latest) sections.push({ heading: "Reading fluency", icon: "🎙️", lines: [
    `${flu.latest.wcpm} words correct per minute (${flu.latest.date}) · ${fluencyGoalWords(flu.latest.level)}.`,
  ] });
  if (plan) sections.push(plan);
  if (writing) sections.push(writing);
  sections.push({ heading: "Practice on the platform", icon: "💻", lines: [
    `${p.practice.answers} answers${p.practice.accuracy !== null ? `, ${p.practice.accuracy}% correct` : ""} · ${p.practice.minutesMonth} minutes this month.`,
    `Tasks: ${p.practice.tasksDone} done${p.practice.tasksLate ? `, ${p.practice.tasksLate} late` : ""}.`,
    ...(p.completed.length ? [`Skills completed: ${p.completed.slice(0, 6).join(", ")}${p.completed.length > 6 ? ` and ${p.completed.length - 6} more` : ""}.`] : []),
  ] });
  const strengths = [...new Set([...p.strengths, ...map.strongest])].filter(Boolean).slice(0, 4);
  if (strengths.length) sections.push({ heading: "Strengths", icon: "⭐", lines: strengths });
  const next = [...new Set([...p.practiseNext, ...map.weakest, ...(diag?.needs ?? []).map((x) => x.label)])].filter(Boolean).slice(0, 4);
  if (next.length) sections.push({ heading: "Next steps", icon: "🎯", lines: next });
  sections.push({ heading: "How to help at home", icon: "🏠", lines: [
    "Read together for 15 minutes every day and ask: “What was it mostly about? How do you know?”",
    "15 minutes on the platform (“Today’s plan”) a few times a week.",
    // the Fluency Coach plan has its own two home ideas
    ...(!plan && flu.latest && flu.latest.level === "BELOW" ? ["Let your child read a short page aloud twice: the second reading is smoother and faster."] : []),
    // r+1: ONE concrete, actionable activity for the student's single weakest skill/area (not just its name) —
    // the same keyword-matched home activities the weekly family report already uses (family-week-words.ts).
    ...(next.length ? [homeTopicFor(next[0]).activity] : []),
  ] });
  // the student reads this report too: never level / tier wording about them
  const safe = (x: string) => !hasLevelWords(x);
  return clean({ summary: p.summary.en.replace(/^[^ ]+/, first), sections: sections.map((x) => ({ ...x, lines: x.lines.filter(safe) })), message: "" });
}

export function manualTemplate(name: string): FamilyContent {
  return { summary: `${name.split(" ")[0]} …`, message: "", sections: [
    { heading: "Strengths", icon: "⭐", lines: [""] },
    { heading: "Next steps", icon: "🎯", lines: [""] },
    { heading: "How to help at home", icon: "🏠", lines: [""] },
  ] };
}

// ------------------------------------------------------------------ the flow

function view(r: Row, names: Map<string, { name: string }>, users: Map<string, string>, info: { className: string; grade: number }): FamilyReportRow {
  return {
    id: s(r.id), studentId: s(r.studentId), studentName: names.get(s(r.studentId))?.name ?? "Student", className: info.className, grade: info.grade,
    kind: s(r.kind) as ReportKind, title: s(r.title), status: s(r.status) as ReportStatus, content: clean(json<Partial<FamilyContent>>(r.content, {})),
    refId: r.refId ? s(r.refId) : null, author: users.get(s(r.createdById)) ?? "", createdById: s(r.createdById), createdAt: day(r.createdAt)!, submittedAt: day(r.submittedAt),
    reviewedAt: day(r.reviewedAt), reviewer: r.reviewedById ? users.get(s(r.reviewedById)) ?? null : null, reviewNote: r.reviewNote ? s(r.reviewNote) : null,
    seenByParentAt: day(r.seenByParentAt), seenByStudentAt: day(r.seenByStudentAt),
  };
}

async function views(repo: Repo, rows: Row[]): Promise<FamilyReportRow[]> {
  const ids = [...new Set(rows.map((r) => s(r.studentId)))];
  const names = await studentNames(repo, ids);
  const uids = [...new Set(rows.flatMap((r) => [s(r.createdById), s(r.reviewedById)]).filter(Boolean))];
  const users = new Map((uids.length ? await repo.findMany("User", { id: { in: uids } }, { select: ["id", "displayName"] }) : []).map((u) => [s(u.id), s(u.displayName)]));
  const mem = ids.length ? await repo.findMany("ClassMembership", { studentId: { in: ids }, leftAt: null }, { select: ["studentId", "classId"] }) : [];
  const classes = mem.length ? await repo.findMany("Class", { id: { in: [...new Set(mem.map((m) => s(m.classId)))] } }, { select: ["id", "name"] }) : [];
  const sts = ids.length ? await repo.findMany("Student", { id: { in: ids } }, { select: ["id", "gradeId"] }) : [];
  const grades = sts.length ? await repo.findMany("Grade", { id: { in: [...new Set(sts.map((x) => s(x.gradeId)))] } }, { select: ["id", "level"] }) : [];
  const info = (id: string) => {
    const m = mem.find((x) => s(x.studentId) === id);
    const g = grades.find((x) => x.id === sts.find((y) => y.id === id)?.gradeId);
    return { className: s(classes.find((c) => c.id === m?.classId)?.name), grade: Number(g?.level ?? 0) };
  };
  return rows.map((r) => view(r, names, users, info(s(r.studentId))));
}

async function load(repo: Repo, actor: Actor, id: string): Promise<Row> {
  const r = await repo.findUnique("FamilyReport", { id });
  if (!r || s(r.schoolId) !== s(actor.schoolId)) throw new ForbiddenError("Report not found.");
  return r;
}

/** Teacher (or admin): a new draft, written by the platform or from the template. */
export async function createFamilyReport(repo: Repo, actor: Actor, input: { studentId: string; kind: "AUTO" | "MANUAL" }, now = new Date()): Promise<string> {
  assertCan(actor, "assignments:create");
  await studentInfo(repo, actor, input.studentId, true);
  const name = (await studentNames(repo, [input.studentId])).get(input.studentId)?.name ?? "Student";
  // r87: autoContent pulls MAP, Diagnostic, ReadRise, the Fluency Coach plan and Writing together through several
  // dynamic imports; an edge case in any one of them used to throw past this action's catch (which only knows
  // ValidationError/ForbiddenError) and take down the whole "Prepare it for me" button with an unhandled error.
  const content = input.kind === "AUTO"
    ? await autoContent(repo, actor, input.studentId, now).catch(() => { throw new ValidationError("Could not prepare the report automatically this time. Try “I will write it” instead, or try again in a moment."); })
    : manualTemplate(name);
  const title = `${input.kind === "AUTO" ? "Progress report" : "A note from the teacher"} · ${name} · ${now.toISOString().slice(0, 10)}`;
  const r = await repo.create("FamilyReport", { schoolId: s(actor.schoolId), studentId: input.studentId, kind: input.kind, title, content, refId: null, status: "DRAFT", createdById: actor.userId, createdAt: now, updatedAt: now });
  return s(r.id);
}

function canEdit(actor: Actor, r: Row): boolean {
  return ["DRAFT", "RETURNED"].includes(s(r.status)) && (isAdmin(actor) || s(r.createdById) === actor.userId) || isAdmin(actor) && s(r.status) === "PENDING";
}

/** Save the teacher's edits (a draft, a returned report; an admin may also edit one waiting for approval). */
export async function saveFamilyReport(repo: Repo, actor: Actor, id: string, input: { title?: string; content: Partial<FamilyContent> }, now = new Date()): Promise<void> {
  assertCan(actor, "assignments:create");
  const r = await load(repo, actor, id);
  await studentInfo(repo, actor, s(r.studentId), true);
  if (!canEdit(actor, r)) throw new ValidationError(s(r.status) === "PENDING" ? "This report is waiting for approval: withdraw it to edit it." : "This report can no longer be edited.");
  const content = clean(input.content);
  if (!content.summary && !content.sections.some((x) => x.lines.length) && !content.message) throw new ValidationError("The report is empty.");
  // the Arabic copy the platform wrote is kept while the English it was written from is unchanged (the teacher's
  // note is shared by both); once the teacher rewrites the report, the family reads the teacher's own words
  const before = clean(json<Partial<FamilyContent>>(r.content, {}));
  if (!content.ar && before.ar && before.summary === content.summary && JSON.stringify(before.sections) === JSON.stringify(content.sections)) content.ar = before.ar;
  const title = s(input.title ?? r.title).trim().slice(0, 191) || s(r.title);
  await repo.updateMany("FamilyReport", { id }, { title, content, updatedAt: now });
}

export async function adminUsers(repo: Repo, schoolId: string): Promise<string[]> {
  return (await repo.findMany("User", { schoolId, role: "SCHOOL_ADMIN", isActive: true }, { select: ["id"] })).map((u) => s(u.id));
}
async function familyUsers(repo: Repo, studentId: string): Promise<{ student: string | null; parents: string[] }> {
  const st = await repo.findUnique("Student", { id: studentId });
  const links = await repo.findMany("ParentStudent", { studentId });
  const parents = links.length ? (await repo.findMany("Parent", { id: { in: links.map((p) => p.parentId) } }, { select: ["userId"] })).map((p) => s(p.userId)) : [];
  return { student: st?.userId ? s(st.userId) : null, parents };
}

/** Send for approval: every school admin is notified. An admin's own report is approved at once. */
export async function submitFamilyReport(repo: Repo, actor: Actor, id: string, now = new Date()): Promise<ReportStatus> {
  assertCan(actor, "assignments:create");
  const r = await load(repo, actor, id);
  await studentInfo(repo, actor, s(r.studentId), true);
  if (!["DRAFT", "RETURNED"].includes(s(r.status))) throw new ValidationError("This report was already sent.");
  if (!isAdmin(actor) && s(r.createdById) !== actor.userId) throw new ForbiddenError("Only its author can send this report.");
  const c = clean(json<Partial<FamilyContent>>(r.content, {}));
  if (r.kind === "MANUAL" && (!c.sections.some((x) => x.lines.length) || /…$/.test(c.summary) && c.summary.length < 20)) throw new ValidationError("Write the report first (the summary and at least one section).");
  // the monthly report: the teacher reads it and adds a note before it goes to the admin
  if (r.kind === "MONTHLY" && !isAdmin(actor) && !c.message) throw new ValidationError("Add your note to the family first (Message to the family), then send it.");
  await repo.updateMany("FamilyReport", { id }, { status: "PENDING", submittedAt: now, reviewNote: null, updatedAt: now });
  if (isAdmin(actor)) { await reviewFamilyReport(repo, actor, id, { approve: true }, now); return "APPROVED"; }
  const name = (await studentNames(repo, [s(r.studentId)])).get(s(r.studentId))?.name ?? "a student";
  const teacher = s((await repo.findUnique("User", { id: actor.userId }))?.displayName) || "A teacher";
  const admins = await adminUsers(repo, s(r.schoolId));
  if (admins.length) await repo.createMany("Notification", admins.map((userId) => ({ userId, type: "REPORT_APPROVAL", title: "📨 A family report to approve", body: `${teacher} sent a report about ${name} for approval.`, link: `/admin/report-approvals/${id}`, readAt: null, createdAt: now })));
  return "PENDING";
}

/** The author takes a report back before it is reviewed. */
export async function withdrawFamilyReport(repo: Repo, actor: Actor, id: string, now = new Date()): Promise<void> {
  assertCan(actor, "assignments:create");
  const r = await load(repo, actor, id);
  if (s(r.createdById) !== actor.userId && !isAdmin(actor)) throw new ForbiddenError();
  if (s(r.status) !== "PENDING") throw new ValidationError("Only a report waiting for approval can be withdrawn.");
  await repo.updateMany("FamilyReport", { id }, { status: "DRAFT", submittedAt: null, updatedAt: now });
}

/** Admin: approve (the family is notified and sees it) or return to the teacher with a note. */
export async function reviewFamilyReport(repo: Repo, actor: Actor, id: string, input: { approve: boolean; note?: string | null }, now = new Date()): Promise<void> {
  if (!isAdmin(actor)) throw new ForbiddenError("Only a school admin approves family reports.");
  const r = await load(repo, actor, id);
  if (s(r.status) !== "PENDING") throw new ValidationError("This report is not waiting for approval.");
  const note = s(input.note).trim().slice(0, 1000) || null;
  const studentId = s(r.studentId);
  if (!input.approve) {
    if (!note) throw new ValidationError("Write a note for the teacher: what should change?");
    await repo.updateMany("FamilyReport", { id }, { status: "RETURNED", reviewedById: actor.userId, reviewedAt: now, reviewNote: note, updatedAt: now });
    await repo.create("Notification", { userId: s(r.createdById), type: "TEACHER_FEEDBACK", title: "↩️ A family report was returned", body: note, link: `/teacher/family-reports/${id}`, readAt: null, createdAt: now });
    return;
  }
  await repo.updateMany("FamilyReport", { id }, { status: "APPROVED", reviewedById: actor.userId, reviewedAt: now, reviewNote: note, updatedAt: now });
  const content = clean(json<Partial<FamilyContent>>(r.content, {}));
  const kind = s(r.kind) as ReportKind;
  // the live reports: approval shares them
  if (kind === "PROGRESS") {
    const { setReportShared } = await import("../insights/parent-report");
    await setReportShared(repo, s(r.schoolId), studentId, true, content.message || null, s(r.createdById), now);
  } else if (kind === "DIAGNOSTIC" && r.refId) {
    const rows = await repo.findMany("DiagnosticScore", { diagnosticId: s(r.refId), studentId });
    for (const x of rows) await repo.updateMany("DiagnosticScore", { id: x.id }, { sharedAt: now, ...(content.message ? { teacherNote: content.message } : {}) });
  }
  const fam = await familyUsers(repo, studentId);
  const link = kind === "PROGRESS" ? null : kind === "DIAGNOSTIC" ? null : `/family-report/${id}`;
  const notes = [
    ...(fam.student ? [{ userId: fam.student, type: "PARENT_PROGRESS", title: kind === "DIAGNOSTIC" ? "📊 Your Diagnostic report is ready" : "📄 A new report from your teacher", body: "Open Family Report and show it to your family!", link: link ?? (kind === "DIAGNOSTIC" ? "/student/family/diagnostic" : "/student/family/teacher-report"), readAt: null, createdAt: now }] : []),
    ...(kind === "PROGRESS" ? [] : fam.parents).map((userId) => ({ userId, type: "PARENT_PROGRESS", title: "📄 A new report about your child", body: "The school shared a report: progress, strengths and how to help at home.", link: link ?? (kind === "DIAGNOSTIC" ? `/parent/diagnostic/${studentId}` : `/parent/report/${studentId}`), readAt: null, createdAt: now })),
    { userId: s(r.createdById), type: "TEACHER_FEEDBACK", title: "✅ Your family report was approved", body: `It is now with the family.${note ? ` Note: ${note}` : ""}`, link: `/teacher/family-reports/${id}`, readAt: null, createdAt: now },
  ].filter((n) => n.userId !== actor.userId || n.type !== "TEACHER_FEEDBACK");
  if (notes.length) await repo.createMany("Notification", notes);
}

/** Teacher's PROGRESS / DIAGNOSTIC share → a report waiting for approval (one open request per student and report). */
export async function requestShareApproval(repo: Repo, actor: Actor, input: { studentId: string; kind: "PROGRESS" | "DIAGNOSTIC"; refId?: string | null; note?: string | null }, now = new Date()): Promise<string> {
  assertCan(actor, "assignments:create");
  await studentInfo(repo, actor, input.studentId, true);
  const name = (await studentNames(repo, [input.studentId])).get(input.studentId)?.name ?? "Student";
  let content: FamilyContent;
  if (input.kind === "PROGRESS") content = { ...(await autoContent(repo, actor, input.studentId, now)), message: s(input.note).trim() };
  else {
    const { studentDiagnosticReport } = await import("../diagnostic/report");
    const r = await studentDiagnosticReport(repo, actor, input.studentId, input.refId ?? null);
    if (!r) throw new ValidationError(`${name} has no Diagnostic result yet.`);
    content = clean({ summary: `${r.title}: ${r.pct}% · ${gradeGoalWords(r.level)}.`, message: s(input.note ?? r.note).trim(), sections: [
      { heading: "Strengths", icon: "⭐", lines: r.strengths },
      { heading: "To work on", icon: "🎯", lines: r.needs.map((x) => `${x.label} (${x.pct}%): ${x.tip}`) },
      { heading: "Areas", icon: "📊", lines: r.strands.map((x) => `${x.label}: ${x.pct}%`) },
    ] });
  }
  const open = (await repo.findMany("FamilyReport", { studentId: input.studentId, kind: input.kind, status: "PENDING" })).find((x) => s(x.refId) === s(input.refId ?? ""));
  const title = `${input.kind === "PROGRESS" ? "Progress report" : "Diagnostic report"} · ${name}`;
  let id: string;
  if (open) { id = s(open.id); await repo.updateMany("FamilyReport", { id }, { content, title, createdById: actor.userId, updatedAt: now, submittedAt: now }); return id; }
  const row = await repo.create("FamilyReport", { schoolId: s(actor.schoolId), studentId: input.studentId, kind: input.kind, title, content, refId: input.refId ?? null, status: "DRAFT", createdById: actor.userId, createdAt: now, updatedAt: now });
  id = s(row.id);
  await submitFamilyReport(repo, actor, id, now);
  return id;
}

// ------------------------------------------------------------------ lists and the report itself

/** Staff: one report (and mark it seen when the family opens it). */
export async function familyReport(repo: Repo, actor: Actor, id: string, now = new Date()): Promise<FamilyReportRow> {
  const r = await load(repo, actor, id);
  const studentId = s(r.studentId);
  if (actor.role === "PARENT" || actor.role === "STUDENT") {
    const mine = actor.role === "PARENT" ? actor.parentChildIds?.has(studentId) : actor.studentId === studentId;
    if (!mine || s(r.status) !== "APPROVED") throw new ForbiddenError("Report not found.");
    const field = actor.role === "PARENT" ? "seenByParentAt" : "seenByStudentAt";
    if (!r[field]) await repo.updateMany("FamilyReport", { id }, { [field]: now });
  } else await studentInfo(repo, actor, studentId, false);
  return (await views(repo, [r]))[0];
}

/** Teacher: the reports of my students (or one student); admin: every report of the school. */
export async function staffFamilyReports(repo: Repo, actor: Actor, opts: { studentId?: string; status?: ReportStatus } = {}): Promise<FamilyReportRow[]> {
  assertCan(actor, "reports:read");
  let ids: string[] | null = null;
  if (opts.studentId) { await studentInfo(repo, actor, opts.studentId, false); ids = [opts.studentId]; }
  else if (actor.role === "TEACHER") {
    const classes = await readableClasses(repo, actor);
    ids = classes.length ? [...new Set((await repo.findMany("ClassMembership", { classId: { in: classes.map((c) => c.id) }, leftAt: null }, { select: ["studentId"] })).map((m) => s(m.studentId)))] : [];
  } else if (!isAdmin(actor)) throw new ForbiddenError();
  const where: Record<string, unknown> = { schoolId: s(actor.schoolId), ...(opts.status ? { status: opts.status } : {}), ...(ids ? { studentId: { in: ids } } : {}) };
  if (ids && !ids.length) return [];
  const rows = (await repo.findMany("FamilyReport", where)).filter((r) => s(r.status) !== "WITHDRAWN")
    .filter((r) => actor.role !== "TEACHER" || s(r.status) === "APPROVED" || s(r.createdById) === actor.userId || !!opts.studentId)
    .sort((a, b) => (d(b.updatedAt)?.getTime() ?? 0) - (d(a.updatedAt)?.getTime() ?? 0));
  return views(repo, rows);
}

/** Admin: the reports waiting for approval (oldest first). */
export async function pendingApprovals(repo: Repo, actor: Actor): Promise<FamilyReportRow[]> {
  if (!isAdmin(actor)) throw new ForbiddenError();
  const rows = (await repo.findMany("FamilyReport", { schoolId: s(actor.schoolId), status: "PENDING" })).sort((a, b) => (d(a.submittedAt)?.getTime() ?? 0) - (d(b.submittedAt)?.getTime() ?? 0));
  return views(repo, rows);
}
/** Admin: this month's MONTHLY drafts the teacher has not sent for approval yet (oldest first). The nightly job
 *  (monthly-report.ts) now notifies every admin as soon as these are created, not only once a teacher submits
 *  them, so an admin can open and approve one directly from here without waiting on the teacher. */
export async function draftMonthlyReports(repo: Repo, actor: Actor): Promise<FamilyReportRow[]> {
  if (!isAdmin(actor)) throw new ForbiddenError();
  const rows = (await repo.findMany("FamilyReport", { schoolId: s(actor.schoolId), status: "DRAFT", kind: "MONTHLY" })).sort((a, b) => (d(a.createdAt)?.getTime() ?? 0) - (d(b.createdAt)?.getTime() ?? 0));
  return views(repo, rows);
}
export async function pendingCount(repo: Repo, schoolId: string): Promise<number> {
  return repo.count("FamilyReport", { schoolId, status: "PENDING" });
}

/** The family: the approved reports of the child (newest first). */
export async function approvedForFamily(repo: Repo, actor: Actor, studentId: string): Promise<FamilyReportRow[]> {
  const mine = actor.role === "PARENT" ? actor.parentChildIds?.has(studentId) : actor.role === "STUDENT" ? actor.studentId === studentId : false;
  if (!mine) throw new ForbiddenError("Student not found.");
  const rows = (await repo.findMany("FamilyReport", { studentId, status: "APPROVED" })).filter((r) => ["AUTO", "MANUAL", "MONTHLY"].includes(s(r.kind)))
    .sort((a, b) => (d(b.reviewedAt)?.getTime() ?? 0) - (d(a.reviewedAt)?.getTime() ?? 0));
  return views(repo, rows);
}
