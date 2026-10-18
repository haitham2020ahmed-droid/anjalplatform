/**
 * 🗓️ MAP Year plan — sharing it (owner r68 §C):
 *   questions  the teacher opens a skill of the plan and sees the questions behind it (a few, with their choices)
 *   send       "Send to students": the class's students get a "Year plan" tab on their MAP page (student wording, their
 *              OWN stars, a Practise button per skill); "Stop showing" takes it back. The teacher previews exactly that
 *              page (as one student of the class) before sending.
 *   pdf        "Download PDF" for the administration: cover (school, class, grade, teacher, dates), a weeks table (week,
 *              dates, skills, goal area, review), the skills with how many students need them and have mastered them,
 *              and the legend — rendered by the shared report renderer (the same look as every report PDF).
 * Light: the saved plan is ONE row; the stars one batched read (skills/status.ts).
 */
import type { Repo, Row } from "../seeding/repo";
import { assertCan, ForbiddenError, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import { audit } from "../audit";
import { safeIfBehind } from "../db/schema-errors";
import { assertClassAccess } from "../teacher/assignments";
import { assertClassRead } from "../teacher/coordinators";
import { classMembers, studentNames } from "../insights/student-data";
import { statusesOfSkills, type StarStatus } from "../skills/status";
import { skillFamilyIds } from "../questions/skill-questions";
import { groupOf } from "./map-plan";
import { weekDates, yearPlanView, type YearWeek } from "./year-plan";
import { planHref } from "../../lib/plan-links";

const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));
const ms = (v: unknown): number => (v === null || v === undefined || v === "" ? 0 : v instanceof Date ? v.getTime() : new Date(String(v)).getTime() || 0);
const json = <T,>(v: unknown, fb: T): T => { if (v === null || v === undefined || v === "") return fb; if (typeof v === "string") { try { return JSON.parse(v) as T; } catch { return fb; } } return v as T; };
const DAY = 86_400_000;
const RIYADH = 3 * 3_600_000;

async function planRow(repo: Repo, classId: string): Promise<Row | null> {
  return safeIfBehind("map.year-plan.share", async () => (await repo.findMany("MapYearPlan", { classId }, { take: 1 }))[0] ?? null, null);
}

// ------------------------------------------------------------------ send to students

/** "Send to students" (on) or "Stop showing to students" (off). Only the class's teacher. */
export async function sendYearPlan(repo: Repo, actor: Actor, classId: string, on = true, now = new Date()): Promise<{ sentAt: string | null; students: number }> {
  assertCan(actor, "assignments:create");
  if (actor.role !== "TEACHER") throw new ForbiddenError("Only the class teacher can send the Year plan.");
  await assertClassAccess(repo, actor, classId);
  let row = await planRow(repo, classId);
  if (!row) { await yearPlanView(repo, actor, classId, now); row = await planRow(repo, classId); }
  if (!row) throw new ValidationError("Make the Year plan first (it needs MAP scores).");
  if (!json<YearWeek[]>(row.weeks, []).some((w) => w.skills.length)) throw new ValidationError("The Year plan has no skills yet.");
  await repo.updateMany("MapYearPlan", { id: row.id }, on ? { sentAt: now, sentById: actor.userId } : { sentAt: null, sentById: null });
  const ids = await classMembers(repo, classId);
  if (on && !row.sentAt && ids.length) {
    const sts = await repo.findMany("Student", { id: { in: ids } }, { select: ["userId"] });
    if (sts.length) await repo.createMany("Notification", sts.map((x) => ({ userId: x.userId, type: "NEW_ASSIGNMENT", title: "🗓️ Your Year plan is ready", body: "Open MAP → Year plan to see the skills of each week.", link: "/student/map?tab=year", readAt: null, createdAt: now })));
  }
  await audit(repo, { actorId: actor.userId, action: on ? "map.year_plan.send" : "map.year_plan.unsend", entityType: "MapYearPlan", entityId: classId, after: { students: ids.length }, at: now }).catch(() => undefined);
  return { sentAt: on ? now.toISOString() : null, students: ids.length };
}

/** When the plan was sent to the class's students (null: not sent). */
export async function yearPlanSentAt(repo: Repo, classId: string): Promise<string | null> {
  const row = await planRow(repo, classId);
  return row?.sentAt ? new Date(ms(row.sentAt)).toISOString() : null;
}

/** The skill ids of the Year plans SENT to these classes (My Skills "Not started": skills of my own plans). */
export async function sentYearPlanSkills(repo: Repo, schoolId: string, classIds: readonly string[]): Promise<string[]> {
  if (!classIds.length) return [];
  const rows = await safeIfBehind("map.year-plan.sent", () => repo.findMany("MapYearPlan", { schoolId, classId: { in: [...classIds] } }, { select: ["weeks", "sentAt"], take: 10 }), [] as Row[]);
  return [...new Set(rows.filter((r) => r.sentAt).flatMap((r) => json<YearWeek[]>(r.weeks, []).flatMap((w) => w.skills.filter((k) => !k.review).map((k) => s(k.skillId)))))];
}

// ------------------------------------------------------------------ the student's Year plan tab

export interface StudentYearSkill { skillId: string; name: string; area: string; icon: string; review: boolean; status: StarStatus; href: string }
export interface StudentYearWeek { week: number; from: string; to: string; current: boolean; past: boolean; skills: StudentYearSkill[] }
export interface StudentYearPlan { classId: string; className: string; sentAt: string | null; weeks: StudentYearWeek[]; mastered: number; total: number; studentName: string | null }

/**
 * The plan as the student sees it: every week (dates, "This week" marked, past weeks folded on the page), each skill
 * with the student's OWN star and a Practise link. `asStudent`: the teacher's preview of one student of the class.
 */
export async function studentYearPlan(repo: Repo, actor: Actor, opts: { classId?: string; asStudent?: string | null } = {}, now = new Date()): Promise<StudentYearPlan | null> {
  let studentId: string, classId: string;
  if (actor.role === "STUDENT") {
    studentId = s(actor.studentId);
    const m = await repo.findMany("ClassMembership", { studentId, leftAt: null }, { select: ["classId"] });
    const rows = m.length ? await safeIfBehind("map.year-plan.student", () => repo.findMany("MapYearPlan", { classId: { in: m.map((x) => s(x.classId)) } }, { select: ["classId", "sentAt"], take: 10 }), [] as Row[]) : [];
    const sent = rows.filter((r) => r.sentAt).sort((a, b) => ms(b.sentAt) - ms(a.sentAt))[0];
    if (!sent) return null;
    classId = s(sent.classId);
  } else {
    assertCan(actor, "reports:read");
    classId = s(opts.classId);
    await assertClassRead(repo, actor, classId);
    const ids = await classMembers(repo, classId);
    studentId = opts.asStudent && ids.includes(opts.asStudent) ? opts.asStudent : ids[0] ?? "";
  }
  const row = await planRow(repo, classId);
  if (!row) return null;
  if (actor.role === "STUDENT" && !row.sentAt) return null;
  const klass = await repo.findUnique("Class", { id: classId });
  const weeks = json<YearWeek[]>(row.weeks, []);
  const start = new Date(ms(row.startDate));
  const ids = [...new Set(weeks.flatMap((w) => w.skills.map((k) => s(k.skillId))))];
  const stars = studentId && ids.length ? (await statusesOfSkills(repo, s(klass?.schoolId), [studentId], ids)).get(studentId) ?? new Map() : new Map();
  const today = now.getTime();
  const out: StudentYearWeek[] = weeks.map((w) => {
    const d = weekDates(start, w.week);
    const from = Date.parse(`${d.from}T00:00:00Z`) - RIYADH, to = Date.parse(`${d.to}T00:00:00Z`) - RIYADH + 3 * DAY;
    return {
      week: w.week, from: d.from, to: d.to, current: today >= from && today < to, past: today >= to,
      skills: w.skills.map((k) => ({ skillId: s(k.skillId), name: s(k.name), area: groupOf(k.group)?.name ?? "", icon: groupOf(k.group)?.icon ?? "", review: Boolean(k.review), status: (stars.get(s(k.skillId))?.status ?? "NOT_STARTED") as StarStatus, href: `/practice/${encodeURIComponent(s(k.skillId))}?from=map` })),
    };
  });
  const uniq = new Map<string, StarStatus>();
  for (const w of out) for (const k of w.skills) if (!k.review) uniq.set(k.skillId, k.status);
  const name = actor.role === "STUDENT" || !studentId ? null : (await studentNames(repo, [studentId])).get(studentId)?.name ?? null;
  return { classId, className: s(klass?.name), sentAt: row.sentAt ? new Date(ms(row.sentAt)).toISOString() : null, weeks: out, mastered: [...uniq.values()].filter((v) => v === "MASTERED").length, total: uniq.size, studentName: name };
}

// ------------------------------------------------------------------ the questions behind a skill

export interface PreviewQuestion { id: string; stem: string; choices: { text: string; correct: boolean }[]; difficulty: number | null }
/** A few published questions of the skill (any grade's copy of it), with their choices — for the teacher (bounded). */
export async function skillQuestionsPreview(repo: Repo, actor: Actor, classId: string, skillId: string, take = 5): Promise<{ total: number; questions: PreviewQuestion[] }> {
  assertCan(actor, "reports:read");
  if (actor.role === "STUDENT" || actor.role === "PARENT") throw new ForbiddenError("Teachers only.");
  await assertClassRead(repo, actor, classId);
  const fam = [...new Set([skillId, ...(await skillFamilyIds(repo, skillId))])];
  const where = { skillId: { in: fam }, status: "PUBLISHED", deletedAt: null };
  const [total, qs] = await Promise.all([
    repo.count("Question", where),
    repo.findMany("Question", where, { select: ["id", "stem", "difficultyLevel"], orderBy: [{ field: "difficultyLevel", dir: "asc" }], take: Math.max(1, Math.min(10, take)) }),
  ]);
  const opts = qs.length ? await repo.findMany("QuestionOption", { questionId: { in: qs.map((q) => s(q.id)) } }, { select: ["questionId", "text", "isCorrect", "order"] }) : [];
  return {
    total,
    questions: qs.map((q) => ({
      id: s(q.id), stem: s(q.stem).slice(0, 600), difficulty: q.difficultyLevel === null || q.difficultyLevel === undefined ? null : Number(q.difficultyLevel),
      choices: opts.filter((o) => s(o.questionId) === s(q.id)).sort((a, b) => Number(a.order ?? 0) - Number(b.order ?? 0)).map((o) => ({ text: s(o.text).slice(0, 200), correct: Boolean(o.isCorrect) })),
    })),
  };
}

// ------------------------------------------------------------------ the PDF for the administration

/** The Year plan as a report document (cover + weeks table + skills table + legend): rendered to PDF by the caller. */
export async function yearPlanReport(repo: Repo, actor: Actor, classId: string, now = new Date()) {
  const v = await yearPlanView(repo, actor, classId, now);
  const [teacher, sentAt] = await Promise.all([repo.findUnique("User", { id: actor.userId }), yearPlanSentAt(repo, classId)]);
  const skills = new Map<string, { name: string; code: string; area: string; weeks: number[]; need: string; mastered: number }>();
  for (const w of v.weeks) for (const k of w.skills) {
    if (k.review) continue;
    const x = skills.get(k.skillId) ?? { name: k.name, code: k.code, area: groupOf(k.group)?.name ?? "", weeks: [], need: k.of ? `${k.need}/${k.of}` : "", mastered: k.mastered ?? 0 };
    x.weeks.push(w.week); skills.set(k.skillId, x);
  }
  // 🔗 r79: every skill of the PDF is a link (staff copy → the skill page with ⭐ Assign); ids only
  const link = (id: string) => planHref({ kind: "skill", id }, "staff") ?? "";
  return {
    view: v, teacher: s(teacher?.displayName), sentAt,
    weeksRows: v.weeks.map((w) => ({ week: w.week, dates: `${w.from} – ${w.to}`, skills: w.skills.filter((k) => !k.review).map((k) => k.name).join(" · "), skillsLink: w.skills.filter((k) => !k.review).map((k) => link(k.skillId)).join(" "), review: w.skills.filter((k) => k.review).map((k) => k.name).join(" · "), reviewLink: w.skills.filter((k) => k.review).map((k) => link(k.skillId)).join(" "), areas: [...new Set(w.skills.map((k) => groupOf(k.group)?.name ?? ""))].filter(Boolean).join(", ") })),
    skillRows: [...skills.entries()].sort((a, b) => a[1].weeks[0] - b[1].weeks[0]).map(([id, k]) => ({ skill: k.name, skillLink: link(id), code: k.code, area: k.area, weeks: k.weeks.join(", "), need: k.need, mastered: `${k.mastered}/${v.summary.students}` })),
    planLink: planHref({ kind: "year-plan", classId }, "staff") ?? "",
  };
}
