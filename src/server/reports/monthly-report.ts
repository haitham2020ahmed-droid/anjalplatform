/**
 * 📅 The monthly family report (owner: generated automatically at month end, the TEACHER reviews it and adds a
 * note, then the ADMIN approves; only then the family sees it). It is ONE more kind ("MONTHLY") of the existing
 * family reports (family-reports.ts) — the same drafts, the same "send for approval", the same admin approval page
 * (/admin/report-approvals), the same family view (/family-report/[id], printable / PDF). No second system.
 *
 *   monthlyContent   one student's month in a positive tone: skills mastered, effort (days, minutes, answers),
 *                    reading (ReadRise articles, the Fluency Coach), next steps with one home activity each — in
 *                    English AND Arabic (content.ar), never a level word (Below / On / Above, tier, RTI, Lexile).
 *   generateMonthly  at month end (the daily job, in the first 7 days of the new month; idempotent: one MONTHLY
 *                    report per student and month, refId = "YYYY-MM") a DRAFT per student of every class, authored
 *                    by the class's teacher, who is notified once per class. A teacher can also prepare their class's
 *                    reports from Family Reports.
 * Bounded: per class a fixed number of batched reads.
 */
import type { Repo, Row } from "../seeding/repo";
import { ForbiddenError, type Actor } from "../auth/rbac";
import { assertClassAccess } from "../teacher/assignments";
import { isHiddenSkill } from "../skills/master";
import { hideLevels } from "../../lib/hide-levels";
import { translate, type Lang } from "../../i18n";
import { homeTopicFor } from "./family-week-words";
import { hasLevelWords } from "./family-words";
import { masteredSkills } from "./mastered-count";
import { adminUsers, type FamilyContent, type ReportSection } from "./family-reports";

const s = (v: unknown) => String(v ?? "");
const time = (v: unknown) => (v instanceof Date ? v.getTime() : v ? new Date(s(v)).getTime() : 0);
const DAY = 86_400_000;
// r97 fix: the same class of bug family-week.ts documents and corrects ("weekStart() returns Sunday 00:00
// Riyadh time as a UTC instant… a raw UTC read is one day early for ~3h/day"). monthSpan's boundaries used raw
// Date.UTC(year, month, 1) with no Riyadh offset, so practice in the ~3-hour window around local midnight on a
// month-boundary day could be attributed to the wrong month in this parent-facing report.
const RIYADH = 3 * 3_600_000;
export const MONTHLY = "MONTHLY";

export interface MonthSpan { key: string; from: Date; to: Date; label: string }
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** The month a report covers: in the first 7 days (Riyadh calendar date) of a month, the month that just ended;
 * else the current month. */
export function monthToReport(now: Date): MonthSpan {
  const local = new Date(now.getTime() + RIYADH);
  const y = local.getUTCFullYear(), m = local.getUTCMonth();
  const [yy, mm] = local.getUTCDate() <= 7 ? (m === 0 ? [y - 1, 11] : [y, m - 1]) : [y, m];
  return monthSpan(yy, mm);
}
/** `year`/`month` are Riyadh calendar components; the returned `from`/`to` are the UTC instants of Riyadh
 * midnight on the 1st of this month and the 1st of the next, matching weekStart()'s convention. */
export function monthSpan(year: number, month: number): MonthSpan {
  const from = new Date(Date.UTC(year, month, 1) - RIYADH), to = new Date(Date.UTC(year, month + 1, 1) - RIYADH);
  return { key: `${year}-${String(month + 1).padStart(2, "0")}`, from, to, label: `${MONTHS[month]} ${year}` };
}

export interface MonthFacts {
  name: string; mastered: string[]; days: number; minutes: number; answers: number; accuracy: number | null;
  articles: string[]; fluencyReadings: number; next: string[];
}

/** Pure: the report in one language (interface templates through translate; names and titles stay as they are). */
export function monthlyLang(f: MonthFacts, lang: Lang): { summary: string; sections: ReportSection[] } {
  const t = (x: string, v?: Record<string, string | number>) => translate(lang, x, v);
  const first = f.name.trim().split(/\s+/)[0] || "Your child";
  const summary = f.mastered.length
    ? t("{name} had a great month: {n} new skills mastered and {days} days of practice. Well done!", { name: first, n: f.mastered.length, days: f.days })
    : f.days ? t("{name} practised on {days} days this month and is working towards the next skill. Every step counts!", { name: first, days: f.days })
      : t("A new month is a fresh start: a few minutes of practice a day will help {name} grow.", { name: first });
  const sections: ReportSection[] = [];
  sections.push({ heading: t("Skills mastered this month"), icon: "⭐", lines: f.mastered.length ? f.mastered.slice(0, 8).map((k) => hideLevels(k)) : [t("Working towards the next skill.")] });
  sections.push({ heading: t("Effort"), icon: "💪", lines: [
    t("{days} days of practice · {minutes} minutes · {answers} answers", { days: f.days, minutes: f.minutes, answers: f.answers }),
    ...(f.accuracy !== null && f.accuracy >= 70 ? [t("Most answers were right ({pct}%).", { pct: f.accuracy })] : f.answers ? [t("Every answer is practice: mistakes help us learn.")] : []),
  ] });
  const reading = [
    ...(f.articles.length ? [t("{n} articles read in ReadRise", { n: f.articles.length }), ...f.articles.slice(0, 3).map((x) => hideLevels(x))] : []),
    ...(f.fluencyReadings ? [t("{n} read-aloud practices with the Fluency Coach", { n: f.fluencyReadings })] : []),
  ];
  if (reading.length) sections.push({ heading: t("Reading"), icon: "📚", lines: reading });
  const topics = f.next.map((k) => homeTopicFor(k)).filter((x, i, a) => a.findIndex((y) => y.key === x.key) === i).slice(0, 2);
  if (!topics.length) topics.push(homeTopicFor("reading"));
  sections.push({ heading: t("Next steps"), icon: "🎯", lines: topics.map((x) => t(x.title)) });
  sections.push({ heading: t("How to help at home"), icon: "🏠", lines: topics.map((x) => t(x.activity)) });
  // the student reads it too: never a level word
  return { summary, sections: sections.map((x) => ({ ...x, lines: x.lines.filter((l) => !hasLevelWords(l)) })) };
}

/** Pure: the full content (English + Arabic copy, empty teacher note). */
export function monthlyContent(f: MonthFacts): FamilyContent {
  const en = monthlyLang(f, "en"), ar = monthlyLang(f, "ar");
  return { summary: en.summary, sections: en.sections, message: "", ar };
}

/** The facts of a month for these students (one class). */
export async function monthFacts(repo: Repo, ids: string[], span: MonthSpan): Promise<Map<string, MonthFacts>> {
  const out = new Map<string, MonthFacts>();
  if (!ids.length) return out;
  const inMonth = (v: unknown) => { const t = time(v); return t >= span.from.getTime() && t < span.to.getTime(); };
  const range = { gte: span.from, lt: span.to };
  const [students, stars, attempts, sessions, runs, fluency, open] = await Promise.all([
    repo.findMany("Student", { id: { in: ids } }, { select: ["id", "userId"] }),
    repo.findMany("StudentSkillMastery", { studentId: { in: ids }, masteredAt: range }, { select: ["studentId", "skillId", "masteredAt"] }),
    repo.findMany("QuestionAttempt", { studentId: { in: ids }, createdAt: range }, { select: ["studentId", "isCorrect", "createdAt", "unreliable"], take: 40000 }),
    repo.findMany("PracticeSession", { studentId: { in: ids }, startedAt: range }, { select: ["studentId", "activeMs", "startedAt"] }),
    repo.findMany("RRRun", { studentId: { in: ids }, completedAt: range }, { select: ["studentId", "articleId", "completedAt"] }).catch(() => [] as Row[]),
    repo.findMany("FluencyPractice", { studentId: { in: ids }, createdAt: range }, { select: ["studentId", "createdAt"] }).catch(() => [] as Row[]),
    repo.findMany("StudentSkillMastery", { studentId: { in: ids }, isMastered: false }, { select: ["studentId", "skillId", "score", "attempts"], orderBy: [{ field: "score", dir: "asc" }], take: ids.length * 12 }),
  ]);
  const [users, skills, arts] = await Promise.all([
    students.length ? repo.findMany("User", { id: { in: students.map((x) => s(x.userId)) } }, { select: ["id", "displayName"] }) : Promise.resolve([] as Row[]),
    (stars.length || open.length) ? repo.findMany("Skill", { id: { in: [...new Set([...stars, ...open].map((r) => s(r.skillId)))] } }, { select: ["id", "name", "code"] }) : Promise.resolve([] as Row[]),
    runs.length ? repo.findMany("RRArticle", { id: { in: [...new Set(runs.map((r) => s(r.articleId)))] } }, { select: ["id", "title"] }).catch(() => [] as Row[]) : Promise.resolve([] as Row[]),
  ]);
  const userName = new Map(users.map((u) => [s(u.id), s(u.displayName)]));
  const skillName = new Map(skills.filter((k) => !isHiddenSkill(k.code)).map((k) => [s(k.id), s(k.name)]));
  const title = new Map(arts.map((a) => [s(a.id), s(a.title)]));
  // stars counted with the reports' one "mastered" rule (mastered-count.ts) among the skills that changed this month
  const stillMastered = await masteredSkills(repo, ids, [...new Set(stars.map((r) => s(r.skillId)))]);
  for (const st of students) {
    const id = s(st.id);
    const a = attempts.filter((x) => s(x.studentId) === id), ss = sessions.filter((x) => s(x.studentId) === id && inMonth(x.startedAt));
    const days = new Set([...a.map((x) => new Date(time(x.createdAt)).toISOString().slice(0, 10)), ...ss.filter((x) => Number(x.activeMs) > 0).map((x) => new Date(time(x.startedAt)).toISOString().slice(0, 10))]).size;
    // r85 audit: "unreliable" (a whole session flagged for too many guesses) is kept OUT of the accuracy % only —
    // the "days/minutes/answers" effort counts below still count every answer, guessed or not, since those are
    // meant to reflect effort, not performance.
    const reliable = a.filter((x) => !x.unreliable);
    const ok = reliable.filter((x) => x.isCorrect === true || x.isCorrect === 1).length;
    out.set(id, {
      name: userName.get(s(st.userId)) || "Student",
      mastered: [...new Set(stars.filter((r) => s(r.studentId) === id && stillMastered.get(id)?.has(s(r.skillId))).map((r) => skillName.get(s(r.skillId)) ?? "").filter(Boolean))],
      days, minutes: Math.round(ss.reduce((t, x) => t + Math.min(Number(x.activeMs ?? 0), 3 * 3_600_000), 0) / 60_000), answers: a.length, accuracy: reliable.length >= 10 ? Math.round((100 * ok) / reliable.length) : null,
      articles: [...new Set(runs.filter((r) => s(r.studentId) === id).map((r) => title.get(s(r.articleId)) ?? "").filter(Boolean))],
      fluencyReadings: fluency.filter((r) => s(r.studentId) === id).length,
      next: open.filter((r) => s(r.studentId) === id && Number(r.attempts ?? 0) > 0).map((r) => skillName.get(s(r.skillId)) ?? "").filter(Boolean).slice(0, 4),
    });
  }
  return out;
}

/**
 * The month's DRAFT reports of one class (author: the class's teacher). Idempotent: a student who already has a
 * MONTHLY report for the month is skipped. Returns how many were created.
 */
async function classMonthly(repo: Repo, klass: Row, authorId: string, span: MonthSpan, now: Date): Promise<number> {
  const ids = [...new Set((await repo.findMany("ClassMembership", { classId: s(klass.id), leftAt: null }, { select: ["studentId"] })).map((m) => s(m.studentId)))];
  if (!ids.length) return 0;
  const done = new Set((await repo.findMany("FamilyReport", { studentId: { in: ids }, kind: MONTHLY, refId: span.key }, { select: ["studentId", "status"] })).filter((r) => s(r.status) !== "WITHDRAWN").map((r) => s(r.studentId)));
  const todo = ids.filter((id) => !done.has(id));
  if (!todo.length) return 0;
  const facts = await monthFacts(repo, todo, span);
  const rows = todo.filter((id) => facts.has(id)).map((id) => {
    const f = facts.get(id)!;
    return { schoolId: s(klass.schoolId), studentId: id, kind: MONTHLY, title: `Monthly report · ${f.name} · ${span.label}`, content: monthlyContent(f), refId: span.key, status: "DRAFT", createdById: authorId, createdAt: now, updatedAt: now };
  });
  if (!rows.length) return 0;
  await repo.createMany("FamilyReport", rows);
  await repo.create("Notification", { userId: authorId, type: "REPORT_APPROVAL", title: "📅 Monthly family reports to review", body: `${rows.length} report(s) for ${s(klass.name)} (${span.label}) are ready. Read each one, add your note, then send it for approval.`, link: `/teacher/family-reports?${new URLSearchParams({ status: "DRAFT", classId: s(klass.id) })}`, readAt: null, createdAt: now });
  // 🔔 dual-notify: every school admin hears about these drafts AT THE SAME TIME as the teacher (not only once
  // the teacher submits them), so a draft the teacher never acts on is still found and approved — admins can open
  // it straight from "Reports to Approve" (its new "Drafts" tab) and approve it themselves (report-approvals/actions.ts).
  const admins = await adminUsers(repo, s(klass.schoolId));
  if (admins.length) await repo.createMany("Notification", admins.map((userId) => ({ userId, type: "REPORT_APPROVAL", title: "📅 Monthly family reports ready to review", body: `${rows.length} draft report(s) for ${s(klass.name)} (${span.label}) are ready. The teacher has not sent them yet — you can open and approve them now from Reports to Approve.`, link: "/admin/report-approvals?tab=drafts", readAt: null, createdAt: now })));
  return rows.length;
}

/** The first teacher (user id) of each class. */
async function classTeachers(repo: Repo, classIds: string[]): Promise<Map<string, string>> {
  const links = classIds.length ? await repo.findMany("ClassTeacher", { classId: { in: classIds } }, { select: ["classId", "teacherId"] }) : [];
  const teachers = links.length ? await repo.findMany("Teacher", { id: { in: [...new Set(links.map((l) => s(l.teacherId)))] } }, { select: ["id", "userId"] }) : [];
  const userOf = new Map(teachers.map((t) => [s(t.id), s(t.userId)]));
  const out = new Map<string, string>();
  for (const l of links) if (!out.has(s(l.classId)) && userOf.get(s(l.teacherId))) out.set(s(l.classId), userOf.get(s(l.teacherId))!);
  return out;
}

/** The daily job: in the first 7 days of a month, the month that ended, for every class of the school. */
export async function generateMonthlyReports(repo: Repo, schoolId: string, now = new Date()): Promise<number> {
  if (now.getUTCDate() > 7) return 0;
  const span = monthToReport(now);
  const classes = await repo.findMany("Class", { schoolId, deletedAt: null }, { select: ["id", "name", "schoolId"] });
  const teacherOf = await classTeachers(repo, classes.map((c) => s(c.id)));
  let n = 0;
  for (const c of classes) { const author = teacherOf.get(s(c.id)); if (author) n += await classMonthly(repo, c, author, span, now); }
  return n;
}

/** A teacher (or the admin) prepares the month's reports of one class now (the same drafts as the job). */
export async function prepareMonthlyReports(repo: Repo, actor: Actor, classId: string, now = new Date()): Promise<number> {
  if (actor.role !== "TEACHER" && actor.role !== "SCHOOL_ADMIN" && actor.role !== "SUPER_ADMIN") throw new ForbiddenError();
  const klass = await assertClassAccess(repo, actor, classId);
  const author = actor.role === "TEACHER" ? actor.userId : (await classTeachers(repo, [classId])).get(classId) ?? actor.userId;
  return classMonthly(repo, klass, author, monthToReport(now), now);
}

/** Days left before the job writes next month's reports (for the Family Reports hint). */
export const daysToMonthEnd = (now: Date) => Math.max(0, Math.ceil((monthSpan(now.getUTCFullYear(), now.getUTCMonth()).to.getTime() - now.getTime()) / DAY));
