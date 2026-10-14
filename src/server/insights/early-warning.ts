/**
 * 🚨 Early warning (Reports, teacher AND admin): in one screen, the most important level movements of each student
 * across every measure the platform already stores — level group, skill average (weekly accuracy), ReadRise level,
 * MAP RIT, progress checks, weekly checks, test scores, fluency WCPM, NAFS results and writing scores — with the
 * pattern of each (rise, drop, sudden drop, swinging, flat) and the student's severity (Urgent · Watch · Good news).
 *
 * Built ON the alert engine (alerts.ts), not beside it:
 *  - an Urgent student becomes ONE open alert of kind EARLY_WARNING through the existing 3-hourly scan, so the
 *    teacher gets the scan's single notification (no spam) and the alert closes itself when it is no longer urgent;
 *  - "Mark handled" is the alert follow-up (handleAlert): a handled student leaves the list until the situation
 *    changes (another signature) or HANDLED_QUIET_DAYS pass;
 *  - INVALID_TEST alerts count for "invalid tests repeatedly".
 * The school is read 50 students at a time with a fixed number of queries per round (grouped counts, `in` lists,
 * only the needed columns) and the result is cached for 3 hours, like the scan. New / optional tables are read
 * through safeIfBehind. Staff only.
 */
import type { Repo, Row } from "../seeding/repo";
import { assertCan, ForbiddenError, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import { readableClasses } from "../teacher/coordinators";
import { countGroups } from "../db/group-count";
import { safeIfBehind } from "../db/schema-errors";
import { isHiddenSkill } from "../skills/master";
import { readRisePlaced } from "../readrise/engine";
import { mapSummaries, studentNames } from "./student-data";
import {
  DAY, DROPS, INVALID_WINDOW_DAYS, MAX_POINTS, MEASURES, MEASURE_KEYS, MIN_TEST_QUESTIONS, MIN_WEEK_ANSWERS, MOVES_DAYS, SCAN_CACHE_MS,
  SERIES_DAYS, SEVERITY_ORDER, SKILL_WEEKS, UNHANDLED_DAYS, detectPattern, groupName, judge,
  type MeasureFinding, type MeasureKey, type Pattern, type Point, type Severity,
} from "./early-warning-rules";

const s = (v: unknown) => String(v ?? "");
const time = (v: unknown) => (v instanceof Date ? v.getTime() : v === null || v === undefined || v === "" ? NaN : new Date(s(v)).getTime());
const json = (v: unknown): Record<string, unknown> => { if (!v) return {}; if (typeof v === "string") { try { return JSON.parse(v) as Record<string, unknown>; } catch { return {}; } } return v as Record<string, unknown>; };
const RANK: Record<string, number> = { BELOW: 0, ON: 1, ABOVE: 2 };
/** The alert kind (StudentAlert.kind) of the early warning. */
export const EW_KIND = "EARLY_WARNING";
/** Students per round of the school's read. */
export const EW_CHUNK = 50;

export interface MeasureTrend { key: MeasureKey; label: string; points: { at: string; v: number }[]; pattern: Pattern; direction: "UP" | "DOWN" | null; min: number; max: number }
export interface WarningRow {
  studentId: string; name: string; classId: string; className: string; grade: number;
  severity: Severity; rules: string[]; reason: string; signature: string; measures: MeasureTrend[];
}
export interface GroupMove { studentId: string; name: string; classId: string; className: string; from: string; to: string; up: boolean; at: string }
interface SchoolScan { at: number; rows: WarningRow[]; moves: GroupMove[] }

// ------------------------------------------------------------------ the school's read (chunked, bounded)

const cache = new WeakMap<object, Map<string, SchoolScan>>();
/** Forget the cached scan (tests, or after a big import). */
export function clearEarlyWarningCache(repo: Repo, schoolId?: string): void { if (schoolId) cache.get(repo)?.delete(schoolId); else cache.delete(repo); }

/** The school's early-warning rows (every student with Urgent / Watch / Good news), cached SCAN_CACHE_MS. */
export async function schoolEarlyWarning(repo: Repo, schoolId: string, now = new Date(), fresh = false): Promise<SchoolScan> {
  let byRepo = cache.get(repo);
  if (!byRepo) cache.set(repo, (byRepo = new Map()));
  const hit = byRepo.get(schoolId);
  if (!fresh && hit && now.getTime() - hit.at < SCAN_CACHE_MS && now.getTime() >= hit.at) return hit;
  const scan = await readSchool(repo, schoolId, now);
  byRepo.set(schoolId, scan);
  return scan;
}

async function readSchool(repo: Repo, schoolId: string, now: Date): Promise<SchoolScan> {
  const classes = await repo.findMany("Class", { schoolId, deletedAt: null }, { select: ["id", "name", "gradeId"] });
  if (!classes.length) return { at: now.getTime(), rows: [], moves: [] };
  const members = await repo.findMany("ClassMembership", { classId: { in: classes.map((c) => c.id) }, leftAt: null }, { select: ["studentId", "classId"] });
  const grades = await repo.findMany("Grade", { id: { in: [...new Set(classes.map((c) => s(c.gradeId)))] } }, { select: ["id", "level"] });
  const classById = new Map(classes.map((c) => [s(c.id), c]));
  const gradeOfClass = new Map(classes.map((c) => [s(c.id), Number(grades.find((g) => g.id === c.gradeId)?.level ?? 0)]));
  const classOf = new Map(members.map((m) => [s(m.studentId), s(m.classId)]));
  const ids = [...classOf.keys()];
  const rows: WarningRow[] = [], moves: GroupMove[] = [];
  for (let i = 0; i < ids.length; i += EW_CHUNK) {
    const r = await readChunk(repo, now, ids.slice(i, i + EW_CHUNK), classOf, classById, gradeOfClass);
    rows.push(...r.rows); moves.push(...r.moves);
  }
  rows.sort(rowOrder);
  moves.sort((a, b) => b.at.localeCompare(a.at) || a.name.localeCompare(b.name));
  return { at: now.getTime(), rows, moves };
}
const rowOrder = (a: WarningRow, b: WarningRow) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || b.rules.length - a.rules.length || a.className.localeCompare(b.className) || a.name.localeCompare(b.name);

/** Reads one round of students: a FIXED number of queries whatever the round's size (no query per student). */
async function readChunk(repo: Repo, now: Date, ids: string[], classOf: Map<string, string>, classById: Map<string, Row>, gradeOfClass: Map<string, number>): Promise<{ rows: WarningRow[]; moves: GroupMove[] }> {
  const t = now.getTime();
  const since = new Date(t - SERIES_DAYS * DAY);
  const classIds = [...new Set(ids.map((id) => classOf.get(id) ?? ""))].filter(Boolean);
  const gradeOf = new Map(ids.map((id) => [id, gradeOfClass.get(classOf.get(id) ?? "") ?? 0]));
  const series = new Map<string, Map<MeasureKey, Point[]>>();
  const add = (id: string, k: MeasureKey, at: number, v: number) => {
    if (!Number.isFinite(at) || !Number.isFinite(v)) return;
    const m = series.get(id) ?? series.set(id, new Map()).get(id)!;
    (m.get(k) ?? m.set(k, []).get(k)!).push({ at, v });
  };
  const pct = (c: number, n: number) => Math.round((100 * c) / n);

  // skill average: careful answers per week (grouped counts: 2 per week)
  const weeks = await Promise.all(Array.from({ length: SKILL_WEEKS }, (_, k) => {
    const where = { studentId: { in: ids }, rapidGuess: false, unreliable: false, createdAt: { gte: new Date(t - (k + 1) * 7 * DAY), lt: new Date(t - k * 7 * DAY) } };
    return Promise.all([countGroups(repo, "QuestionAttempt", "studentId", where), countGroups(repo, "QuestionAttempt", "studentId", { ...where, isCorrect: true })]);
  }));
  const answered14 = new Map<string, number>();
  weeks.forEach(([all, right], k) => {
    for (const [id, n] of all) {
      if (k < 2) answered14.set(id, (answered14.get(id) ?? 0) + n);
      if (n >= MIN_WEEK_ANSWERS) add(id, "SKILLS", t - k * 7 * DAY, pct(right.get(id) ?? 0, n));
    }
  });

  const [levelLogs, mapRows, maps, weekly, fluency, nafs, writing, rrChanges, rrStudents, rrActive, checkRows, testRows, students, declining, invalid, lastAnswer] = await Promise.all([
    repo.findMany("AuditLog", { entityType: "Student", entityId: { in: ids }, action: "level.change", createdAt: { gte: since } }, { select: ["entityId", "before", "after", "createdAt"] }),
    repo.findMany("MapResult", { studentId: { in: ids }, goalName: null, testDate: { gte: new Date(t - 400 * DAY) } }, { select: ["studentId", "rit", "testDate", "subject"] }),
    mapSummaries(repo, ids, "READING", gradeOf),
    repo.findMany("WeeklyCheck", { studentId: { in: ids }, completedAt: { gte: since } }, { select: ["studentId", "correct", "total", "completedAt"] }),
    repo.findMany("FluencyCheck", { studentId: { in: ids }, checkedAt: { gte: since } }, { select: ["studentId", "wcpm", "checkedAt"] }),
    safeIfBehind("early-warning.nafs", () => repo.findMany("NafsResult", { studentId: { in: ids }, submittedAt: { gte: since } }, { select: ["studentId", "points", "maxPoints", "submittedAt"] }), [] as Row[]),
    safeIfBehind("early-warning.writing", () => repo.findMany("WritingSubmission", { studentId: { in: ids }, scorePct: { not: null } }, { select: ["studentId", "scorePct", "returnedAt", "scoredAt", "submittedAt"] }), [] as Row[]),
    safeIfBehind("early-warning.readrise", () => repo.findMany("RRLevelChange", { studentId: { in: ids }, createdAt: { gte: since } }, { select: ["studentId", "fromLevel", "toLevel", "createdAt"] }), [] as Row[]),
    safeIfBehind("early-warning.readrise", () => repo.findMany("RRStudent", { studentId: { in: ids } }, { select: ["studentId", "level", "placedAt", "source"] }), [] as Row[]),
    safeIfBehind("early-warning.readrise", () => countGroups(repo, "RRRun", "studentId", { studentId: { in: ids }, completedAt: { gte: new Date(t - 28 * DAY) }, firstTry: true }), new Map<string, number>()),
    safeIfBehind("early-warning.checks", () => repo.findMany("ProgressCheck", { classId: { in: classIds }, createdAt: { gte: since } }, { select: ["assignmentId"] }), [] as Row[]),
    repo.findMany("Assignment", { classId: { in: classIds }, testId: { not: null }, deletedAt: null, createdAt: { gte: since } }, { select: ["id"] }),
    repo.findMany("Student", { id: { in: ids } }, { select: ["id", "createdAt"] }),
    repo.findMany("StudentLevelState", { studentId: { in: ids }, declining: true }, { select: ["studentId"] }),
    repo.findMany("StudentAlert", { studentId: { in: ids }, kind: "INVALID_TEST", createdAt: { gte: new Date(t - INVALID_WINDOW_DAYS * DAY) } }, { select: ["studentId"] }),
    // the last answer before the 14 days (only for students without an answer in them: "no practice since …")
    repo.findMany("StudentSkillMastery", { studentId: { in: ids }, lastPracticedAt: { not: null } }, { select: ["studentId", "lastPracticedAt"] }),
  ]);

  // level group (overall level changes)
  const moves: GroupMove[] = [];
  const names = await studentNames(repo, ids);
  for (const l of [...levelLogs].sort((a, b) => time(a.createdAt) - time(b.createdAt))) {
    const a = json(l.after), b = json(l.before);
    if (a.outcome !== "CHANGED" || (a.category && a.category !== "OVERALL")) continue;
    const from = RANK[s(b.level)], to = RANK[s(a.level)];
    if (to === undefined) continue;
    const id = s(l.entityId), at = time(l.createdAt);
    const pts = series.get(id)?.get("LEVEL");
    if (from !== undefined && !pts?.length) add(id, "LEVEL", at - 1, from);
    add(id, "LEVEL", at, to);
    if (from !== undefined && from !== to && at >= t - MOVES_DAYS * DAY) {
      const cid = classOf.get(id) ?? "";
      moves.push({ studentId: id, name: names.get(id)?.name ?? "Student", classId: cid, className: s(classById.get(cid)?.name), from: groupName(from), to: groupName(to), up: to > from, at: new Date(at).toISOString() });
    }
  }
  for (const r of mapRows) if (/read/i.test(s(r.subject))) add(s(r.studentId), "MAP", time(r.testDate), Number(r.rit));
  for (const w of weekly) if (Number(w.total) >= MIN_TEST_QUESTIONS) add(s(w.studentId), "WEEKLY", time(w.completedAt), pct(Number(w.correct), Number(w.total)));
  for (const f of fluency) add(s(f.studentId), "FLUENCY", time(f.checkedAt), Number(f.wcpm));
  for (const r of nafs) if (Number(r.maxPoints) > 0) add(s(r.studentId), "NAFS", time(r.submittedAt), pct(Number(r.points), Number(r.maxPoints)));
  for (const w of writing) { const at = time(w.returnedAt ?? w.scoredAt ?? w.submittedAt); if (at >= since.getTime()) add(s(w.studentId), "WRITING", at, Number(w.scorePct)); }
  // ReadRise level: the placement, then every change
  const rrBy = new Map<string, Row[]>();
  for (const c of rrChanges) (rrBy.get(s(c.studentId)) ?? rrBy.set(s(c.studentId), []).get(s(c.studentId))!).push(c);
  const rrFlatSince = new Map<string, number>();
  // only real levels (after the placement or set by a teacher): a first visit's working start is not a level
  for (const st of rrStudents.filter((r) => readRisePlaced(r))) {
    const id = s(st.studentId), list = (rrBy.get(id) ?? []).sort((a, b) => time(a.createdAt) - time(b.createdAt));
    if (list.length) add(id, "READRISE", time(list[0].createdAt) - 1, Number(list[0].fromLevel));
    else add(id, "READRISE", Math.max(time(st.placedAt), since.getTime()), Number(st.level));
    for (const c of list) add(id, "READRISE", time(c.createdAt), Number(c.toLevel));
    rrFlatSince.set(id, list.length ? time(list[list.length - 1].createdAt) : time(st.placedAt));
  }
  // progress checks and teacher tests: the student's finished set of each
  const checkIds = new Set(checkRows.map((c) => s(c.assignmentId)));
  const setIds = [...checkIds, ...testRows.map((a) => s(a.id))];
  const sessions = setIds.length ? await repo.findMany("PracticeSession", { assignmentId: { in: setIds }, studentId: { in: ids }, endedAt: { not: null } }, { select: ["studentId", "assignmentId", "correctCount", "questionCount", "endedAt"] }) : [];
  for (const x of sessions) if (Number(x.questionCount) >= MIN_TEST_QUESTIONS) add(s(x.studentId), checkIds.has(s(x.assignmentId)) ? "CHECKS" : "TESTS", time(x.endedAt), pct(Number(x.correctCount), Number(x.questionCount)));

  const declSet = new Set(declining.map((d) => s(d.studentId)));
  const invalidBy = new Map<string, number>();
  for (const a of invalid) invalidBy.set(s(a.studentId), (invalidBy.get(s(a.studentId)) ?? 0) + 1);
  const lastPractice = new Map<string, number>();
  for (const m of lastAnswer) { const id = s(m.studentId), at = time(m.lastPracticedAt); if (at > (lastPractice.get(id) ?? 0)) lastPractice.set(id, at); }
  const createdAt = new Map(students.map((x) => [s(x.id), time(x.createdAt)]));

  const rows: WarningRow[] = [];
  for (const id of ids) {
    const per = series.get(id) ?? new Map<MeasureKey, Point[]>();
    const findings: MeasureFinding[] = [];
    for (const k of MEASURE_KEYS) {
      const pts = (per.get(k) ?? []).sort((a, b) => a.at - b.at);
      if (!pts.length) continue;
      const result = detectPattern(pts, MEASURES[k], t, k === "READRISE" ? { active: (rrActive.get(id) ?? 0) >= 2, flatSince: rrFlatSince.get(id) ?? null } : {});
      findings.push({ key: k, points: pts.slice(-MAX_POINTS), result });
    }
    const m = maps.get(id);
    const mapRisk = Boolean(m?.latest && (m.status === "AT_RISK" || m.status === "MISSED" || (m.latest.percentile !== null && m.latest.percentile < 21)));
    const recent = answered14.get(id) ?? 0;
    const last = recent > 0 ? t : lastPractice.get(id) ?? null;
    const isNew = (createdAt.get(id) ?? 0) > t - 14 * DAY;
    const v = judge(findings, { daysSincePractice: last === null ? null : Math.floor((t - last) / DAY), isNew, mapRisk, declining: declSet.has(id), invalidTests: invalidBy.get(id) ?? 0 }, t);
    if (!v.severity) continue;
    const cid = classOf.get(id) ?? "";
    rows.push({
      studentId: id, name: names.get(id)?.name ?? "Student", classId: cid, className: s(classById.get(cid)?.name), grade: gradeOfClass.get(cid) ?? 0,
      severity: v.severity, rules: v.rules, reason: v.reason, signature: v.signature,
      measures: findings.map((f) => ({ key: f.key, label: MEASURES[f.key].label, points: f.points.map((p) => ({ at: new Date(p.at).toISOString(), v: p.v })), pattern: f.result.pattern, direction: f.result.direction, min: MEASURES[f.key].min, max: MEASURES[f.key].max })),
    });
  }
  return { rows, moves };
}

// ------------------------------------------------------------------ the scan: one open alert per Urgent student

/** Urgent students as alert findings for the 3-hourly scan (alerts.ts): one per student, keyed by its situation. */
export async function urgentFindings(repo: Repo, schoolId: string, now: Date, week: string): Promise<{ studentId: string; classId: string; kind: typeof EW_KIND; key: string; detail: string }[]> {
  const scan = await schoolEarlyWarning(repo, schoolId, now, true);
  return scan.rows.filter((r) => r.severity === "URGENT").map((r) => ({ studentId: r.studentId, classId: r.classId, kind: EW_KIND, key: `${EW_KIND}|URGENT|${r.signature}|${week}`, detail: `🔴 Urgent: ${r.reason}`.slice(0, 500) }));
}
/** The situation an early-warning alert was about (its key: EARLY_WARNING|SEVERITY|signature|week). */
export const keyParts = (key: unknown) => { const p = s(key).split("|"); return { severity: p[1] ?? "", signature: p[2] ?? "" }; };

// ------------------------------------------------------------------ the page (teacher: a class · admin: the school)

export interface EwFilter { classId?: string | null; gradeId?: string | null; teacherId?: string | null; severity?: Severity | null }
export interface EwRow extends WarningRow {
  alertId: string | null; openDays: number | null;
  lastAction: { text: string; by: string; date: string } | null;
  practiceSkillId: string | null;
}
export interface EarlyWarningView {
  isAdmin: boolean;
  classes: { id: string; name: string; gradeId: string; grade: number }[];
  grades: { id: string; level: number }[];
  teachers: { id: string; name: string }[];
  classId: string | null;
  rows: EwRow[];
  counts: Record<Severity, number>;
  /** measures that drop most across the students shown */
  dropping: { key: MeasureKey; label: string; students: number }[];
  moves: GroupMove[];
  /** admin: per class */
  byClass: { classId: string; className: string; teachers: string; urgent: number; watch: number; good: number; unhandled7: number }[];
  /** admin: urgent alerts not handled for UNHANDLED_DAYS+ days */
  unhandled: { alertId: string; studentId: string; name: string; className: string; detail: string; days: number }[];
  handledHidden: number;
  scannedAt: string;
}

const staffOnly = (actor: Actor) => {
  assertCan(actor, "reports:read");
  if (actor.role !== "TEACHER" && actor.role !== "SCHOOL_ADMIN" && actor.role !== "SUPER_ADMIN") throw new ForbiddenError();
};

/** The early-warning view this person may see: a teacher → one of their (readable) classes; the admin → the school, filtered. */
export async function earlyWarning(repo: Repo, actor: Actor, f: EwFilter = {}, now = new Date()): Promise<EarlyWarningView> {
  staffOnly(actor);
  const isAdmin = actor.role === "SCHOOL_ADMIN" || actor.role === "SUPER_ADMIN";
  const schoolId = s(actor.schoolId);
  // the alert scan (at most every 3 h) refreshes the school's early warning and raises the Urgent alerts
  const { scanAlerts } = await import("./alerts");
  await scanAlerts(repo, schoolId, now);
  const [scan, readable] = await Promise.all([schoolEarlyWarning(repo, schoolId, now), readableClasses(repo, actor)]);
  const gradeRows = await repo.findMany("Grade", { id: { in: [...new Set(readable.map((c) => s(c.gradeId)))] } }, { select: ["id", "level"] });
  const classes = readable.map((c) => ({ id: s(c.id), name: s(c.name), gradeId: s(c.gradeId), grade: Number(gradeRows.find((g) => g.id === c.gradeId)?.level ?? 0) })).sort((a, b) => a.grade - b.grade || a.name.localeCompare(b.name));
  // class teachers (admin filter and the per-class table)
  const ct = isAdmin && classes.length ? await repo.findMany("ClassTeacher", { classId: { in: classes.map((c) => c.id) } }, { select: ["classId", "teacherId"] }) : [];
  const tRows = ct.length ? await repo.findMany("Teacher", { id: { in: [...new Set(ct.map((c) => s(c.teacherId)))] } }, { select: ["id", "userId"] }) : [];
  const tUsers = tRows.length ? await repo.findMany("User", { id: { in: tRows.map((x) => s(x.userId)) } }, { select: ["id", "displayName"] }) : [];
  const teacherName = new Map(tRows.map((x) => [s(x.id), s(tUsers.find((u) => u.id === x.userId)?.displayName)]));
  const teachers = [...teacherName].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));

  let shownClasses: string[];
  let classId: string | null = null;
  if (!isAdmin) {
    if (f.classId && !classes.some((c) => c.id === f.classId)) throw new ForbiddenError("You cannot open this class.");
    classId = f.classId || classes[0]?.id || null;
    shownClasses = classId ? [classId] : [];
  } else {
    shownClasses = classes.filter((c) => (!f.classId || c.id === f.classId) && (!f.gradeId || c.gradeId === f.gradeId) && (!f.teacherId || ct.some((x) => x.classId === c.id && x.teacherId === f.teacherId))).map((c) => c.id);
    classId = f.classId && shownClasses.includes(f.classId) ? f.classId : null;
  }
  const inScope = new Set(shownClasses);
  let rows = scan.rows.filter((r) => inScope.has(r.classId));

  // the alert follow-up: open alerts (to handle) and recently handled situations (they leave the list)
  const sIds = rows.map((r) => r.studentId);
  const { HANDLED_QUIET_DAYS } = await import("./alerts");
  const [ewAlerts, handledAny, notes] = sIds.length ? await Promise.all([
    repo.findMany("StudentAlert", { studentId: { in: sIds }, kind: EW_KIND }, { select: ["id", "studentId", "key", "status", "handledAt", "createdAt"] }),
    repo.findMany("StudentAlert", { studentId: { in: sIds }, status: "HANDLED", handledById: { not: null } }, { select: ["studentId", "action", "handledAt", "handledById"] }),
    repo.findMany("TeacherNote", { studentId: { in: sIds }, createdAt: { gte: new Date(now.getTime() - SERIES_DAYS * DAY) } }, { select: ["studentId", "body", "authorId", "createdAt"] }),
  ]) : [[], [], []] as Row[][];
  const quiet = now.getTime() - HANDLED_QUIET_DAYS * DAY;
  const hidden = new Set(ewAlerts.filter((a) => a.status === "HANDLED" && time(a.handledAt) >= quiet).map((a) => `${s(a.studentId)}|${keyParts(a.key).signature}`));
  const before = rows.length;
  rows = rows.filter((r) => !hidden.has(`${r.studentId}|${r.signature}`));
  const handledHidden = before - rows.length;
  const openBy = new Map(ewAlerts.filter((a) => a.status === "OPEN").map((a) => [s(a.studentId), a]));
  const authorIds = [...new Set([...handledAny.map((h) => s(h.handledById)), ...notes.map((n) => s(n.authorId))])].filter(Boolean);
  const authors = authorIds.length ? await repo.findMany("User", { id: { in: authorIds } }, { select: ["id", "displayName"] }) : [];
  const who = (id: unknown) => s(authors.find((u) => u.id === id)?.displayName);
  const lastBy = new Map<string, { text: string; by: string; date: string; at: number }>();
  const keep = (id: string, x: { text: string; by: string; at: number }) => { const cur = lastBy.get(id); if (!cur || x.at > cur.at) lastBy.set(id, { ...x, date: new Date(x.at).toISOString().slice(0, 10) }); };
  for (const h of handledAny) keep(s(h.studentId), { text: s(h.action), by: who(h.handledById), at: time(h.handledAt) });
  for (const n of notes) keep(s(n.studentId), { text: `📝 ${s(n.body)}`, by: who(n.authorId), at: time(n.createdAt) });
  // assign practice: the weakest skill practised (never the hidden "Unclassified" skill)
  const weak = sIds.length ? await repo.findMany("StudentSkillMastery", { studentId: { in: sIds }, score: { lt: 60 }, attempts: { gte: 3 } }, { select: ["studentId", "skillId", "score"] }) : [];
  const skillCodes = weak.length ? await repo.findMany("Skill", { id: { in: [...new Set(weak.map((w) => s(w.skillId)))] } }, { select: ["id", "code"] }) : [];
  const hiddenSkill = new Set(skillCodes.filter((k) => isHiddenSkill(k.code)).map((k) => s(k.id)));
  const weakest = new Map<string, { skillId: string; score: number }>();
  for (const w of weak) { if (hiddenSkill.has(s(w.skillId))) continue; const cur = weakest.get(s(w.studentId)); if (!cur || Number(w.score) < cur.score) weakest.set(s(w.studentId), { skillId: s(w.skillId), score: Number(w.score) }); }

  const out: EwRow[] = rows.filter((r) => !f.severity || r.severity === f.severity).map((r) => {
    const open = openBy.get(r.studentId);
    const last = lastBy.get(r.studentId);
    return { ...r, alertId: open ? s(open.id) : null, openDays: open ? Math.floor((now.getTime() - time(open.createdAt)) / DAY) : null, lastAction: last ? { text: last.text.slice(0, 200), by: last.by, date: last.date } : null, practiceSkillId: weakest.get(r.studentId)?.skillId ?? null };
  });
  const counts: Record<Severity, number> = { URGENT: 0, WATCH: 0, GOOD: 0 };
  for (const r of rows) counts[r.severity]++;
  const dropCount = new Map<MeasureKey, number>();
  for (const r of rows) for (const m of r.measures) if (DROPS.includes(m.pattern)) dropCount.set(m.key, (dropCount.get(m.key) ?? 0) + 1);
  const dropping = [...dropCount].map(([key, students]) => ({ key, label: MEASURES[key].label, students })).sort((a, b) => b.students - a.students || MEASURE_KEYS.indexOf(a.key) - MEASURE_KEYS.indexOf(b.key));
  const moves = scan.moves.filter((m) => inScope.has(m.classId));

  let byClass: EarlyWarningView["byClass"] = [], unhandled: EarlyWarningView["unhandled"] = [];
  if (isAdmin) {
    const old = await repo.findMany("StudentAlert", { schoolId, kind: EW_KIND, status: "OPEN", createdAt: { lte: new Date(now.getTime() - UNHANDLED_DAYS * DAY) } }, { select: ["id", "studentId", "classId", "detail", "createdAt"] });
    const oldIn = old.filter((a) => inScope.has(s(a.classId)));
    const oldNames = await studentNames(repo, [...new Set(oldIn.map((a) => s(a.studentId)))]);
    unhandled = oldIn.map((a) => ({ alertId: s(a.id), studentId: s(a.studentId), name: oldNames.get(s(a.studentId))?.name ?? "Student", className: s(classes.find((c) => c.id === a.classId)?.name), detail: s(a.detail), days: Math.floor((now.getTime() - time(a.createdAt)) / DAY) })).sort((a, b) => b.days - a.days || a.name.localeCompare(b.name));
    byClass = classes.filter((c) => inScope.has(c.id)).map((c) => {
      const mine = rows.filter((r) => r.classId === c.id);
      return { classId: c.id, className: c.name, teachers: ct.filter((x) => x.classId === c.id).map((x) => teacherName.get(s(x.teacherId)) ?? "").filter(Boolean).join(", "), urgent: mine.filter((r) => r.severity === "URGENT").length, watch: mine.filter((r) => r.severity === "WATCH").length, good: mine.filter((r) => r.severity === "GOOD").length, unhandled7: unhandled.filter((u) => u.className === c.name).length };
    });
  }
  return { isAdmin, classes, grades: gradeRows.map((g) => ({ id: s(g.id), level: Number(g.level) })).sort((a, b) => a.level - b.level), teachers, classId, rows: out, counts, dropping, moves, byClass, unhandled, handledHidden, scannedAt: new Date(scan.at).toISOString() };
}

/**
 * "Mark handled" from the early-warning list: the student's open EARLY_WARNING alert is handled with the existing
 * follow-up (handleAlert); a Watch / Good-news student (no alert yet) gets one, handled at once. The student leaves
 * the list until the situation changes.
 */
export async function handleEarlyWarning(repo: Repo, actor: Actor, studentId: string, action: string, now = new Date()): Promise<void> {
  staffOnly(actor);
  const text = s(action).trim();
  if (text.length < 3) throw new ValidationError("Write in a few words what you did (e.g. “Talked with the student”, “Called the parent”).");
  const scan = await schoolEarlyWarning(repo, s(actor.schoolId), now);
  const row = scan.rows.find((r) => r.studentId === studentId);
  if (!row) throw new ValidationError("This student is not on the early-warning list any more.");
  const isAdmin = actor.role === "SCHOOL_ADMIN" || actor.role === "SUPER_ADMIN";
  if (!isAdmin && !(await readableClasses(repo, actor)).some((c) => s(c.id) === row.classId)) throw new ForbiddenError("Not your student.");
  const { handleAlert, weekKey } = await import("./alerts");
  const open = (await repo.findMany("StudentAlert", { studentId, kind: EW_KIND, status: "OPEN" }, { select: ["id"] }))[0];
  let id = open ? s(open.id) : "";
  if (!id) {
    const key = `${EW_KIND}|${row.severity}|${row.signature}|${weekKey(now)}`;
    const had = (await repo.findMany("StudentAlert", { studentId, key }, { select: ["id"] }))[0];
    id = had ? s(had.id) : s((await repo.create("StudentAlert", { schoolId: actor.schoolId, classId: row.classId || null, studentId, kind: EW_KIND, key, detail: `${row.severity === "GOOD" ? "🟢 Good news" : "🟠 Watch"}: ${row.reason}`.slice(0, 500), status: "OPEN", createdAt: now })).id);
  }
  await handleAlert(repo, actor, id, text, false, now);
}

/** Admin home: urgent early warnings not handled for UNHANDLED_DAYS+ days (one count query). */
export async function urgentUnhandledCount(repo: Repo, schoolId: string, now = new Date()): Promise<number> {
  return safeIfBehind("early-warning.count", () => repo.count("StudentAlert", { schoolId, kind: EW_KIND, status: "OPEN", createdAt: { lte: new Date(now.getTime() - UNHANDLED_DAYS * DAY) } }), 0);
}

