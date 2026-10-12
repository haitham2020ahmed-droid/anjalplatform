/**
 * 🧭 Support tiers: what the pages show — a class's tiers, one student's progress graph and tier history, the
 * school summary per grade, and the tier line of the student profile card. Bounded reads only.
 */
import type { Repo, Row } from "../seeding/repo";
import { LOCK_DAYS, lockedAtOf } from "./tiers";
import { canAccessStudent, ForbiddenError, type Actor } from "../auth/rbac";
import { assertClassRead } from "../teacher/coordinators";
import { studentNames } from "../insights/student-data";
import { fluencySeason, wcpmPercentile } from "../fluency/norms";
import { EXPECTED_SHARE, REFER_TEXT, type Tier } from "./rules";

const DAY = 86_400_000;
const s = (v: unknown) => String(v ?? "");
const d = (v: unknown): Date | null => (v === null || v === undefined || v === "" ? null : v instanceof Date ? v : new Date(String(v)));
const day = (v: unknown) => d(v)?.toISOString().slice(0, 10) ?? null;
const json = <T,>(v: unknown, def: T): T => { if (v === null || v === undefined) return def; if (typeof v === "string") { try { return JSON.parse(v) as T; } catch { return def; } } return v as T; };
const asTier = (v: unknown): Tier => (Number(v) === 3 ? 3 : Number(v) === 2 ? 2 : 1);

export interface TierRow {
  studentId: string; name: string; tier: Tier; computed: boolean; since: string | null; reason: string; focusSkill: string | null; focusSkillId?: string | null;
  nextCheck: string | null; overdue: boolean; source: "AUTO" | "TEACHER"; locked: boolean; refer: boolean;
  /** a teacher's lock: the date it is reviewed (LOCK_DAYS after it was set) and, once due, what the rules suggest */
  lockNote: string | null;
}
export interface ClassTiers { classId: string; className: string; grade: number; rows: TierRow[]; counts: Record<Tier, number>; total: number; expected: Record<Tier, number> }

/** Tier rows for students (any order), with the focus skill names. */
export async function tierRows(repo: Repo, ids: string[], now = new Date()): Promise<TierRow[]> {
  if (!ids.length) return [];
  const [rows, names] = await Promise.all([repo.findMany("StudentTier", { studentId: { in: ids } }), studentNames(repo, ids)]);
  const lockedIds = rows.filter((r) => r.locked).map((r) => s(r.studentId));
  const [suggests, lockedAt] = lockedIds.length ? await Promise.all([repo.findMany("TierChange", { studentId: { in: lockedIds }, source: "SUGGEST" }, { select: ["studentId", "toTier", "createdAt"] }), lockedAtOf(repo, lockedIds)]) : [[] as Row[], new Map<string, Date>()];
  const byId = new Map(rows.map((r) => [s(r.studentId), r]));
  const skillIds = [...new Set(rows.map((r) => s(r.focusSkillId)).filter(Boolean))];
  const skills = skillIds.length ? new Map((await repo.findMany("Skill", { id: { in: skillIds } }, { select: ["id", "name"] })).map((k) => [s(k.id), s(k.name)])) : new Map<string, string>();
  return ids.map((id) => {
    const r = byId.get(id);
    const next = r ? d(r.reviewAt) : null;
    return {
      studentId: id, name: names.get(id)?.name ?? "Student", tier: r ? asTier(r.tier) : 1, computed: Boolean(r), since: r ? day(r.since) : null,
      reason: r ? s(r.reason) : "Not computed yet: the daily job sets every student's tier.", focusSkill: r?.focusSkillId ? skills.get(s(r.focusSkillId)) ?? null : null, focusSkillId: r?.focusSkillId ? s(r.focusSkillId) : null,
      nextCheck: next ? next.toISOString().slice(0, 10) : null, overdue: Boolean(next && next.getTime() < now.getTime()),
      source: (s(r?.source) === "TEACHER" ? "TEACHER" : "AUTO") as TierRow["source"], locked: Boolean(r?.locked), refer: s(r?.reason).includes(REFER_TEXT),
      lockNote: r?.locked ? lockNote(r, suggests.filter((x) => s(x.studentId) === id), now, lockedAt.get(id) ?? null) : null,
    };
  }).sort((a, b) => b.tier - a.tier || a.name.localeCompare(b.name));
}

/** “Teacher's tier · review on 2026-12-01”, or once due “Review due: the rules suggest Tier 1 (2026-12-02)”. */
function lockNote(r: Row, suggests: Row[], now: Date, lockedAt: Date | null): string {
  const set = lockedAt ?? d(r.updatedAt) ?? d(r.since) ?? now;
  const due = new Date(set.getTime() + LOCK_DAYS * 86_400_000);
  const last = suggests.filter((x) => (d(x.createdAt)?.getTime() ?? 0) >= set.getTime()).sort((a, b) => (d(b.createdAt)?.getTime() ?? 0) - (d(a.createdAt)?.getTime() ?? 0))[0];
  if (now.getTime() < due.getTime()) return `Teacher's tier · review on ${due.toISOString().slice(0, 10)}`;
  return last ? `Review due: the rules suggest Tier ${Number(last.toTier)} (${day(last.createdAt)}). Your tier stays until you change or unlock it.` : `Review due since ${due.toISOString().slice(0, 10)}: the rules agree with your tier.`;
}

export function tierCounts(rows: { tier: Tier }[]): Record<Tier, number> {
  const c: Record<Tier, number> = { 1: 0, 2: 0, 3: 0 };
  for (const r of rows) c[r.tier]++;
  return c;
}

/** A class's tiers (the class teacher, a grade coordinator, a school admin). */
export async function classTiers(repo: Repo, actor: Actor, classId: string, now = new Date()): Promise<ClassTiers> {
  const klass = await assertClassRead(repo, actor, classId);
  const ids = (await repo.findMany("ClassMembership", { classId, leftAt: null }, { select: ["studentId"] })).map((m) => s(m.studentId));
  const g = await repo.findUnique("Grade", { id: klass.gradeId });
  const rows = await tierRows(repo, ids, now);
  return { classId, className: s(klass.name), grade: Number(g?.level ?? 0), rows, counts: tierCounts(rows), total: rows.length, expected: EXPECTED_SHARE };
}

export interface ProgressPoint { date: string; weekly: number | null; sets: number | null; fluency: number | null }
export interface StudentTierProgress {
  studentId: string; name: string; grade: number; tier: TierRow | null; points: ProgressPoint[];
  history: { date: string; from: number; to: number; source: string; reason: string; by: string | null }[];
  reteach: { date: string; reason: string; outcome: string | null }[];
}

async function assertStudentRead(repo: Repo, actor: Actor, studentId: string): Promise<Row> {
  const st = await repo.findUnique("Student", { id: studentId });
  if (!st || st.deletedAt || actor.role === "STUDENT" || actor.role === "PARENT" || !canAccessStudent(actor, { studentId, schoolId: s(st.schoolId) })) throw new ForbiddenError("Student not found.");
  return st;
}

/** One student's progress graph (Weekly Check %, assigned-set %, fluency percentile; the 80% line is drawn by the page)
 *  and their tier history. Last 180 days, at most 24 dates. */
export async function studentTierProgress(repo: Repo, actor: Actor, studentId: string, now = new Date()): Promise<StudentTierProgress> {
  const st = await assertStudentRead(repo, actor, studentId);
  const from = new Date(now.getTime() - 180 * DAY);
  const [weekly, sessions, flu, changes, names, grade] = await Promise.all([
    repo.findMany("WeeklyCheck", { studentId, completedAt: { gte: from } }, { select: ["correct", "total", "completedAt"] }),
    repo.findMany("PracticeSession", { studentId, mode: "TEACHER_QUIZ", startedAt: { gte: from } }, { select: ["assignmentId", "questionCount", "correctCount", "endedAt"] }),
    repo.findMany("FluencyCheck", { studentId, checkedAt: { gte: from } }, { select: ["wcpm", "percentile", "checkedAt"] }),
    repo.findMany("TierChange", { studentId }, { orderBy: [{ field: "createdAt", dir: "desc" }], take: 60 }),
    studentNames(repo, [studentId]),
    repo.findUnique("Grade", { id: st.gradeId }),
  ]);
  const g = Number(grade?.level ?? 0);
  const weeklyIds = new Set((await repo.findMany("WeeklyCheck", { studentId }, { select: ["assignmentId"] })).map((w) => s(w.assignmentId)));
  const pts = new Map<string, ProgressPoint>();
  const at = (k: string) => { let p = pts.get(k); if (!p) { p = { date: k, weekly: null, sets: null, fluency: null }; pts.set(k, p); } return p; };
  for (const w of weekly) if (Number(w.total) > 0) at(day(w.completedAt)!).weekly = Math.round((100 * Number(w.correct)) / Number(w.total));
  for (const x of sessions) if (x.endedAt && Number(x.questionCount) > 0 && !weeklyIds.has(s(x.assignmentId))) at(day(x.endedAt)!).sets = Math.round((100 * Number(x.correctCount)) / Number(x.questionCount));
  for (const f of flu) { const when = d(f.checkedAt)!; const p = f.percentile !== null && f.percentile !== undefined ? Number(f.percentile) : wcpmPercentile(g, Number(f.wcpm), fluencySeason(when)); if (p !== null) at(when.toISOString().slice(0, 10)).fluency = p; }
  const users = new Map((await repo.findMany("User", { id: { in: [...new Set(changes.map((c) => s(c.changedById)).filter(Boolean))] } }, { select: ["id", "displayName"] })).map((u) => [s(u.id), s(u.displayName)]));
  const tier = (await tierRows(repo, [studentId], now))[0];
  return {
    studentId, name: names.get(studentId)?.name ?? "Student", grade: g, tier: tier.computed ? tier : null,
    points: [...pts.values()].sort((a, b) => a.date.localeCompare(b.date)).slice(-24),
    history: changes.filter((c) => s(c.source) !== "RETEACH").map((c) => ({ date: day(c.createdAt)!, from: Number(c.fromTier), to: Number(c.toTier), source: s(c.source), reason: s(c.reason), by: c.changedById ? users.get(s(c.changedById)) ?? null : null })),
    reteach: changes.filter((c) => s(c.source) === "RETEACH").map((c) => {
      const o = json<Record<string, unknown>>(c.evidence, {}).outcome as { pct?: number; missed?: boolean } | null;
      return { date: day(c.createdAt)!, reason: s(c.reason), outcome: !o ? null : o.missed ? "Re-check not taken" : `Re-check ${o.pct}%${Number(o.pct) >= 80 ? " ✓" : ""}` };
    }),
  };
}

export interface SchoolTierSummary { grades: { grade: number; students: number; counts: Record<Tier, number>; locked: number; overdue: number; refer: number }[]; expected: Record<Tier, number> }

/** School view: tiers per grade (school admins). */
export async function schoolTierSummary(repo: Repo, actor: Actor, now = new Date()): Promise<SchoolTierSummary> {
  if ((actor.role !== "SCHOOL_ADMIN" && actor.role !== "SUPER_ADMIN") || !actor.schoolId) throw new ForbiddenError("School admins only.");
  const [students, grades, tiers] = await Promise.all([
    repo.findMany("Student", { schoolId: actor.schoolId, deletedAt: null }, { select: ["id", "gradeId"] }),
    repo.findMany("Grade", { schoolId: actor.schoolId }, { select: ["id", "level"] }),
    repo.findMany("StudentTier", { schoolId: actor.schoolId }, { select: ["studentId", "tier", "locked", "reviewAt", "reason"] }),
  ]);
  const tierOf = new Map(tiers.map((t) => [s(t.studentId), t]));
  const levelOf = new Map(grades.map((g) => [s(g.id), Number(g.level)]));
  const by = new Map<number, SchoolTierSummary["grades"][number]>();
  for (const st of students) {
    const g = levelOf.get(s(st.gradeId)) ?? 0;
    const e = by.get(g) ?? { grade: g, students: 0, counts: { 1: 0, 2: 0, 3: 0 }, locked: 0, overdue: 0, refer: 0 };
    const t = tierOf.get(s(st.id));
    e.students++; e.counts[t ? asTier(t.tier) : 1]++;
    if (t?.locked) e.locked++;
    if (t && d(t.reviewAt) && d(t.reviewAt)!.getTime() < now.getTime()) e.overdue++;
    if (t && s(t.reason).includes(REFER_TEXT)) e.refer++;
    by.set(g, e);
  }
  return { grades: [...by.values()].sort((a, b) => a.grade - b.grade), expected: EXPECTED_SHARE };
}

/** The tier line of the student profile card (no access check: the page already checked the student). */
export async function tierLine(repo: Repo, studentId: string, now = new Date()): Promise<{ tier: Tier; reason: string; source: "AUTO" | "TEACHER"; locked: boolean; since: string | null; nextCheck: string | null; overdue: boolean } | null> {
  const r = (await tierRows(repo, [studentId], now))[0];
  return r?.computed ? { tier: r.tier, reason: r.reason, source: r.source, locked: r.locked, since: r.since, nextCheck: r.nextCheck, overdue: r.overdue } : null;
}
