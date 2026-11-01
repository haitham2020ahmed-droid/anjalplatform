/**
 * 🗂️ Data meetings (class or grade team): the platform prepares a snapshot of what changed since the last meeting —
 * tier moves, level moves, the 3 weakest skills, open alerts, intervention results, overdue progress checks — and
 * the team records its decisions (who · what · how · owner · review date) and notes. Scoped to the school; a
 * teacher sees the classes they teach or coordinate.
 */
import type { Repo, Row } from "../seeding/repo";
import { ForbiddenError, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import { assertClassRead, readableClasses } from "../teacher/coordinators";
import { studentNames } from "../insights/student-data";
import { tierCounts, tierRows } from "./views";
import { audit } from "../audit";
import type { Tier } from "./rules";
import { starBook, starMastered, starNeedsReview } from "../skills/star-read";
import { earnedStar, improvedBy } from "../insights/interventions";
import { hiddenStarKeys } from "../teacher/queries";

const DAY = 86_400_000;
const s = (v: unknown) => String(v ?? "");
const d = (v: unknown): Date | null => (v === null || v === undefined || v === "" ? null : v instanceof Date ? v : new Date(String(v)));
const day = (v: unknown) => d(v)?.toISOString().slice(0, 10) ?? "";
const json = <T,>(v: unknown, def: T): T => { if (v === null || v === undefined) return def; if (typeof v === "string") { try { return JSON.parse(v) as T; } catch { return def; } } return v as T; };
/** without an earlier meeting, the snapshot looks back this far */
export const DEFAULT_LOOKBACK_DAYS = 30;
export const MAX_DECISIONS = 20;

export interface MeetingScope { classId?: string | null; gradeLevel?: number | null }
interface ResolvedScope { schoolId: string; classId: string | null; gradeLevel: number | null; classIds: string[]; studentIds: string[]; label: string }

async function resolveScope(repo: Repo, actor: Actor, scope: MeetingScope): Promise<ResolvedScope> {
  if (actor.role !== "TEACHER" && actor.role !== "SCHOOL_ADMIN" && actor.role !== "SUPER_ADMIN") throw new ForbiddenError("Staff only.");
  if (scope.classId) {
    const k = await assertClassRead(repo, actor, scope.classId);
    const ids = (await repo.findMany("ClassMembership", { classId: k.id, leftAt: null }, { select: ["studentId"] })).map((m) => s(m.studentId));
    return { schoolId: s(k.schoolId), classId: s(k.id), gradeLevel: null, classIds: [s(k.id)], studentIds: ids, label: `Class ${s(k.name)}` };
  }
  const g = Number(scope.gradeLevel);
  if (!Number.isInteger(g) || g < 1 || g > 12) throw new ValidationError("Choose a class or a grade.");
  if (!actor.schoolId) throw new ForbiddenError("No school.");
  const grades = (await repo.findMany("Grade", { schoolId: actor.schoolId }, { select: ["id", "level"] })).filter((x) => Number(x.level) === g).map((x) => s(x.id));
  let classes = (await readableClasses(repo, actor)).filter((c) => grades.includes(s(c.gradeId)) && s(c.schoolId) === actor.schoolId);
  if (actor.role === "SCHOOL_ADMIN" || actor.role === "SUPER_ADMIN") classes = grades.length ? await repo.findMany("Class", { schoolId: actor.schoolId, gradeId: { in: grades }, deletedAt: null }) : [];
  if (!classes.length) throw new ForbiddenError("You do not teach a class in this grade.");
  const ids = [...new Set((await repo.findMany("ClassMembership", { classId: { in: classes.map((c) => s(c.id)) }, leftAt: null }, { select: ["studentId"] })).map((m) => s(m.studentId)))];
  return { schoolId: actor.schoolId, classId: null, gradeLevel: g, classIds: classes.map((c) => s(c.id)), studentIds: ids, label: `Grade ${g} team` };
}

export interface MeetingSnapshot {
  label: string; since: string; preparedOn: string; students: number;
  tiers: Record<Tier, number>;
  tierMoves: { name: string; from: number; to: number; source: string; date: string; reason: string }[];
  levelMoves: { name: string; from: string | null; to: string; date: string }[];
  /** ⭐ the 3 weakest skills by skill KEY (copies are one): of the students who started it, how many are not ⭐ and how
   *  many 🔄 need review. A key everyone has ⭐ is never listed. (Snapshots saved before the stars carry
   *  avgMastery / studentsBelow60 instead.) */
  weakSkills: { skillId: string; name: string; started?: number; notMastered?: number; needsReview?: number; avgMastery?: number; studentsBelow60?: number }[];
  alerts: { total: number; byKind: Record<string, number> };
  interventions: { title: string; skill: string; improved: number; total: number; avgChange: number; endedOn: string }[];
  overdueChecks: { name: string; tier: number; due: string }[];
  refer: string[];
}

async function lastMeeting(repo: Repo, sc: ResolvedScope): Promise<Row | null> {
  const rows = await repo.findMany("DataMeeting", { schoolId: sc.schoolId, ...(sc.classId ? { classId: sc.classId } : { classId: null, gradeLevel: sc.gradeLevel }) }, { orderBy: [{ field: "heldOn", dir: "desc" }], take: 1 });
  return rows[0] ?? null;
}

async function buildSnapshot(repo: Repo, sc: ResolvedScope, now: Date): Promise<MeetingSnapshot> {
  const prev = await lastMeeting(repo, sc);
  const since = d(prev?.heldOn) ?? new Date(now.getTime() - DEFAULT_LOOKBACK_DAYS * DAY);
  const ids = sc.studentIds;
  const empty: MeetingSnapshot = { label: sc.label, since: day(since), preparedOn: day(now), students: 0, tiers: { 1: 0, 2: 0, 3: 0 }, tierMoves: [], levelMoves: [], weakSkills: [], alerts: { total: 0, byKind: {} }, interventions: [], overdueChecks: [], refer: [] };
  if (!ids.length) return empty;
  const [rows, names, moves, levelLogs, book, alerts, ivs] = await Promise.all([
    tierRows(repo, ids, now), studentNames(repo, ids),
    repo.findMany("TierChange", { studentId: { in: ids }, source: { in: ["AUTO", "TEACHER"] }, createdAt: { gte: since } }, { select: ["studentId", "fromTier", "toTier", "source", "reason", "createdAt"] }),
    repo.findMany("AuditLog", { entityType: "Student", entityId: { in: ids }, action: "level.change", createdAt: { gte: since } }, { select: ["entityId", "before", "after", "createdAt"] }),
    starBook(repo, ids, sc.schoolId),
    repo.findMany("StudentAlert", { studentId: { in: ids }, status: "OPEN" }, { select: ["kind"] }),
    repo.findMany("Intervention", { classId: { in: sc.classIds }, status: "DONE", evaluatedAt: { gte: since } }),
  ]);
  const name = (id: string) => names.get(id)?.name ?? "Student";
  // ⭐ the 3 weakest skills by skill KEY: of the students (3+, or the whole group when smaller) who started it, the
  // largest share without ⭐, then the most 🔄, then the lowest star score; a key everyone has ⭐ is never listed
  const per = new Map<string, { started: number; notMastered: number; review: number; score: number; skillId: string }>();
  const hidden = await hiddenStarKeys(repo, book);
  for (const id of ids) for (const v of book.byKey.get(id)?.values() ?? []) {
    if (v.status === "NOT_STARTED" || hidden.has(v.key)) continue;
    const e = per.get(v.key) ?? { started: 0, notMastered: 0, review: 0, score: 0, skillId: v.skillId ?? book.ix.skillsOf.get(v.key)?.[0] ?? v.key };
    e.started++; e.score += v.score; if (!starMastered(v)) e.notMastered++; if (starNeedsReview(v)) e.review++;
    per.set(v.key, e);
  }
  const weak = [...per.entries()].filter(([, e]) => e.started >= Math.min(3, ids.length) && e.notMastered > 0)
    .sort(([, a], [, b]) => b.notMastered / b.started - a.notMastered / a.started || b.review - a.review || a.score / a.started - b.score / b.started).slice(0, 3);
  const skillIds = [...new Set(ivs.map((i) => s(i.skillId)))];
  const skillName = skillIds.length ? new Map((await repo.findMany("Skill", { id: { in: skillIds } }, { select: ["id", "name"] })).map((k) => [s(k.id), s(k.name)])) : new Map<string, string>();
  const byKind: Record<string, number> = {};
  for (const a of alerts) byKind[s(a.kind)] = (byKind[s(a.kind)] ?? 0) + 1;
  return {
    label: sc.label, since: day(since), preparedOn: day(now), students: ids.length, tiers: tierCounts(rows),
    tierMoves: moves.sort((a, b) => (d(b.createdAt)?.getTime() ?? 0) - (d(a.createdAt)?.getTime() ?? 0)).slice(0, 50).map((m) => ({ name: name(s(m.studentId)), from: Number(m.fromTier), to: Number(m.toTier), source: s(m.source), date: day(m.createdAt), reason: s(m.reason).slice(0, 300) })),
    levelMoves: levelLogs.slice(0, 50).map((l) => ({ name: name(s(l.entityId)), from: (json<Record<string, unknown>>(l.before, {}).level as string | undefined) ?? null, to: s(json<Record<string, unknown>>(l.after, {}).level), date: day(l.createdAt) })),
    weakSkills: weak.map(([key, e]) => ({ skillId: e.skillId, name: book.nameOf(key), started: e.started, notMastered: e.notMastered, needsReview: e.review })),
    alerts: { total: alerts.length, byKind },
    interventions: ivs.map((iv) => {
      const base = json<Record<string, number>>(iv.baseline, {}), res = json<Record<string, number>>(iv.result, {});
      const sids = json<string[]>(iv.studentIds, []);
      const ch = sids.map((id) => Number(res[id] ?? base[id] ?? 0) - Number(base[id] ?? 0));
      // improved = earned the ⭐ during the group, or the score rose 5+ (interventions.ts); stars of group members
      // outside this scope's students read as ☆ (not earned)
      const improved = sids.filter((id, i) => improvedBy(earnedStar(book, id, s(iv.skillId), iv.startedAt, iv.evaluatedAt ?? iv.endsAt), ch[i])).length;
      return { title: s(iv.title), skill: skillName.get(s(iv.skillId)) ?? "Skill", improved, total: sids.length, avgChange: ch.length ? Math.round(ch.reduce((a, b) => a + b, 0) / ch.length) : 0, endedOn: day(iv.evaluatedAt) };
    }),
    overdueChecks: rows.filter((r) => r.tier >= 2 && r.overdue).map((r) => ({ name: r.name, tier: r.tier, due: r.nextCheck ?? "" })),
    refer: rows.filter((r) => r.refer).map((r) => r.name),
  };
}

/** The snapshot for a class or a grade team (what changed since the last meeting of the same group). */
export async function dataMeetingSnapshot(repo: Repo, actor: Actor, scope: MeetingScope, now = new Date()): Promise<MeetingSnapshot> {
  return buildSnapshot(repo, await resolveScope(repo, actor, scope), now);
}

export interface Decision { who: string; what: string; how: string; owner: string; reviewOn: string | null }

function cleanDecisions(list: Partial<Decision>[]): Decision[] {
  const t = (v: unknown, n: number) => s(v).replace(/\s+/g, " ").trim().slice(0, n);
  const out = list.map((x) => ({ who: t(x.who, 300), what: t(x.what, 500), how: t(x.how, 500), owner: t(x.owner, 120), reviewOn: /^\d{4}-\d{2}-\d{2}$/.test(s(x.reviewOn)) ? s(x.reviewOn) : null })).filter((x) => x.who || x.what || x.how);
  if (out.length > MAX_DECISIONS) throw new ValidationError(`At most ${MAX_DECISIONS} decisions per meeting.`);
  for (const x of out) if (!x.what) throw new ValidationError("Each decision needs a “what” (the support or action).");
  return out;
}

/** Saves a meeting: the snapshot prepared now, the decisions and the notes. */
export async function saveDataMeeting(repo: Repo, actor: Actor, input: MeetingScope & { heldOn?: string | Date | null; decisions: Partial<Decision>[]; notes?: string | null }, now = new Date()): Promise<string> {
  const sc = await resolveScope(repo, actor, input);
  const decisions = cleanDecisions(input.decisions ?? []);
  const notes = s(input.notes).trim().slice(0, 5000) || null;
  if (!decisions.length && !notes) throw new ValidationError("Record at least one decision or a note.");
  const held = input.heldOn ? d(input.heldOn) : now;
  if (!held || Number.isNaN(held.getTime())) throw new ValidationError("Give the meeting date.");
  const snapshot = await buildSnapshot(repo, sc, now);
  const row = await repo.create("DataMeeting", { schoolId: sc.schoolId, classId: sc.classId, gradeLevel: sc.gradeLevel, heldOn: held, createdById: actor.userId, snapshot, decisions, notes, createdAt: now });
  await audit(repo, { actorId: actor.userId, action: "data_meeting.save", entityType: "DataMeeting", entityId: s(row.id), after: { classId: sc.classId, gradeLevel: sc.gradeLevel, decisions: decisions.length } });
  return s(row.id);
}

export interface MeetingView { id: string; heldOn: string; label: string; createdBy: string; decisions: Decision[]; notes: string | null; snapshot: MeetingSnapshot }

/** Past meetings the actor may see (their school; a teacher: their classes and the grades they teach), newest first. */
export async function listDataMeetings(repo: Repo, actor: Actor, scope: MeetingScope = {}, limit = 30): Promise<MeetingView[]> {
  if (!actor.schoolId || (actor.role !== "TEACHER" && actor.role !== "SCHOOL_ADMIN" && actor.role !== "SUPER_ADMIN")) throw new ForbiddenError("Staff only.");
  let rows = await repo.findMany("DataMeeting", { schoolId: actor.schoolId, ...(scope.classId ? { classId: scope.classId } : scope.gradeLevel ? { gradeLevel: Number(scope.gradeLevel) } : {}) }, { orderBy: [{ field: "heldOn", dir: "desc" }], take: 200 });
  if (actor.role === "TEACHER") {
    const classes = await readableClasses(repo, actor);
    const grades = classes.length ? await repo.findMany("Grade", { id: { in: [...new Set(classes.map((c) => s(c.gradeId)))] } }, { select: ["level"] }) : [];
    const cls = new Set(classes.map((c) => s(c.id))), lv = new Set(grades.map((g) => Number(g.level)));
    rows = rows.filter((r) => (r.classId ? cls.has(s(r.classId)) : lv.has(Number(r.gradeLevel))));
  }
  rows = rows.slice(0, limit);
  const users = rows.length ? new Map((await repo.findMany("User", { id: { in: [...new Set(rows.map((r) => s(r.createdById)))] } }, { select: ["id", "displayName"] })).map((u) => [s(u.id), s(u.displayName)])) : new Map<string, string>();
  return rows.map((r) => {
    const snap = json<MeetingSnapshot>(r.snapshot, {} as MeetingSnapshot);
    return { id: s(r.id), heldOn: day(r.heldOn), label: snap.label ?? (r.classId ? "Class" : `Grade ${s(r.gradeLevel)} team`), createdBy: users.get(s(r.createdById)) ?? "", decisions: json<Decision[]>(r.decisions, []), notes: r.notes ? s(r.notes) : null, snapshot: snap };
  });
}
