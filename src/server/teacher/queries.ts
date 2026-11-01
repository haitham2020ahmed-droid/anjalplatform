/**
 * Teacher dashboard read models. Every function checks access first:
 * a teacher sees only classes they teach (and students currently enrolled);
 * a school admin sees their school. Batched queries; no per-student loops over the DB.
 */
import { proficiencyLabel } from "../../adaptive/diagnostic";
import { isHiddenSkill } from "../skills/master";
import { starBook, starMastered, starNeedsHelp, starWord, type StarBook } from "../skills/star-read";
import type { StarStatus, StarView } from "../skills/status";
import { DOMAIN_LABEL, latestDiagnostic, type DiagnosticSummary } from "../assessment/diagnostic";
import { canAccessStudent, ForbiddenError, type Actor } from "../auth/rbac";
import type { Repo, Row } from "../seeding/repo";
import { assertClassAccess } from "./assignments";
import { practiceStats } from "../insights/student-data";
import { NEXT_ACTION, type RuleCode } from "./interventions";

const num = (v: unknown) => Number(v ?? 0);
const ms = (v: unknown) => (v instanceof Date ? v : new Date(String(v))).getTime();

/**
 * ⭐ The keys of the hidden "Unclassified (Curriculum Map)" holder skill among the started keys of a star book (never
 * listed or counted, I-18). One small read (only grade-bound "solo:" keys can be the holder).
 */
export async function hiddenStarKeys(repo: Repo, book: StarBook): Promise<Set<string>> {
  const solo = new Set<string>();
  for (const m of book.byKey.values()) for (const k of m.keys()) if (k.startsWith("solo:")) solo.add(k);
  if (!solo.size) return new Set();
  const rows = await repo.findMany("Skill", { id: { in: [...solo].map((k) => k.slice(5)) } }, { select: ["id", "code"] });
  return new Set(rows.filter((k) => isHiddenSkill(k.code)).map((k) => `solo:${String(k.id)}`));
}
/** A student's started stars (one per skill KEY, the hidden holder left out). */
export function startedStars(book: StarBook, studentId: string, hidden: ReadonlySet<string> = new Set()): StarView[] {
  return [...(book.byKey.get(studentId)?.values() ?? [])].filter((v) => v.status !== "NOT_STARTED" && !hidden.has(v.key));
}
/** The star cell a teacher table shows (icon + tooltip data). */
export interface StarCell { status: StarStatus; score: number; level: number; answered: number; needsSupport: boolean; masteredAt: string | null; reviewDueAt: string | null }
export const starCell = (v: StarView): StarCell => ({ status: v.status, score: v.score, level: v.level, answered: v.answered, needsSupport: v.needsSupport, masteredAt: v.masteredAt, reviewDueAt: v.reviewDueAt });

/**
 * The answer value of a stored attempt. Practice stores { value }; older Review-my-mistakes rows stored the raw answer
 * (readiness C-2), so both shapes are read. Never throws.
 */
/** Skill display names: when the same name appears for two grades, each gets its grade (“Make Inferences · G5”). */
export function withGradeSuffix(rows: Row[]): { id: string; name: string }[] {
  const count = new Map<string, number>();
  for (const k of rows) count.set(String(k.name), (count.get(String(k.name)) ?? 0) + 1);
  return rows.map((k) => {
    const g = String(k.code ?? "").match(/^G(\d+)\./i)?.[1];
    return { id: String(k.id), name: (count.get(String(k.name)) ?? 0) > 1 && g ? `${String(k.name)} · G${g}` : String(k.name) };
  });
}

export function answerValue(response: unknown): unknown {
  if (response && typeof response === "object" && !Array.isArray(response) && "value" in (response as Record<string, unknown>)) return (response as { value?: unknown }).value;
  return response;
}
export function answerText(v: unknown): string {
  if (v === undefined || v === null) return "";
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return String(v);
  try { return (JSON.stringify(v) ?? "").slice(0, 60); } catch { return ""; }
}

export type GroupName = "Intervention" | "Developing" | "Meeting" | "Advanced";

/**
 * Automatic grouping from an ability θ (0 = grade level) when available, otherwise average mastery of
 * practised skills. Callers pass the CURRENT skill θ (weighted by recent answers) and fall back to the
 * placement (GLOBAL) θ, which is frozen at the diagnostic.
 */
export function groupFor(globalTheta: number | null, avgMastery: number | null): GroupName | null {
  if (globalTheta !== null) {
    if (globalTheta < -1) return "Intervention";
    if (globalTheta < -0.35) return "Developing";
    if (globalTheta <= 0.75) return "Meeting";
    return "Advanced";
  }
  if (avgMastery === null) return null;
  if (avgMastery < 40) return "Intervention";
  if (avgMastery < 60) return "Developing";
  if (avgMastery < 85) return "Meeting";
  return "Advanced";
}

export interface StudentRow {
  studentId: string;
  name: string;
  group: GroupName | null;
  placement: string | null;
  /** ⭐ the average star score (StarView.score, 0–100) over the skills this student started (null: none started) */
  avgMastery: number | null;
  /** ⭐ skills mastered, counted by skill KEY (the Student Skills grid's number) */
  skillsMastered: number;
  answered: number;
  accuracyPct: number | null;
  minutes: number;
  lastActive: string | null;
  openAlerts: number;
}

export interface ClassOverview {
  classId: string;
  className: string;
  grade: number;
  kpis: { students: number; activeStudents: number; questions: number; accuracyPct: number | null; avgMastery: number | null; minutes: number; skillsMastered: number; needSupport: number;
    /** ⭐ the class's started student × skill-key pairs by star (⭐ / ◐ / 🔄) */
    stars: { mastered: number; inProgress: number; needsReview: number } };
  groups: Record<GroupName, string[]>;
  students: StudentRow[];
  /** ⭐ by skill KEY over the students who started it: fewer than half ⭐ (reteach) / half or more ⭐ (strong).
   *  avgMastery = the average star score; mastered = ⭐ students; needsHelp = 🔄 or ◐ needing support */
  weakSkills: OverviewSkill[];
  strongSkills: OverviewSkill[];
  hardQuestions: { questionId: string; ref: string; stem: string; skill: string; attempts: number; accuracyPct: number }[];
  alerts: { id: string; studentId: string; message: string; rule: string; createdAt: string; nextAction: string }[];
}

export interface OverviewSkill { skillId: string; key: string; name: string; avgMastery: number; students: number; mastered: number; needsHelp: number }

async function classStudents(repo: Repo, classId: string) {
  const members = await repo.findMany("ClassMembership", { classId, leftAt: null }, { select: ["studentId"] });
  const students = members.length ? await repo.findMany("Student", { id: { in: members.map((m) => m.studentId) } }, { select: ["id", "userId"] }) : [];
  const users = students.length ? await repo.findMany("User", { id: { in: students.map((s) => s.userId) } }, { select: ["id", "displayName"] }) : [];
  const name = new Map(users.map((u) => [String(u.id), String(u.displayName)]));
  return students.map((s) => ({ id: String(s.id), name: name.get(String(s.userId)) ?? "Student" }));
}

export async function classOverview(repo: Repo, actor: Actor, classId: string, range: { from: Date; to: Date }): Promise<ClassOverview> {
  const klass = await assertClassAccess(repo, actor, classId);
  const [gradeRow, studs] = await Promise.all([repo.findUnique("Grade", { id: klass.gradeId }), classStudents(repo, classId)]);
  const grade = gradeRow!;
  const ids = studs.map((s) => s.id);
  // only the columns this page uses, and only the attempts inside the range (performance)
  // ⭐ statuses come from the ONE star system (SkillStatus by skill key), one batched read for the class
  const [book, attempts, globals, alerts, practice, studentAlerts] = await Promise.all([
    starBook(repo, ids, String(klass.schoolId ?? "")),
    ids.length ? repo.findMany("QuestionAttempt", { studentId: { in: ids }, createdAt: { gte: range.from, lte: range.to } }, { select: ["studentId", "questionId", "createdAt", "isCorrect", "responseMs"] }) : Promise.resolve([] as Row[]),
    ids.length ? repo.findMany("StudentAbility", { studentId: { in: ids }, scope: "GLOBAL" }, { select: ["studentId", "theta"] }) : Promise.resolve([] as Row[]),
    ids.length ? repo.findMany("InterventionAlert", { studentId: { in: ids }, resolvedAt: null }, { select: ["id", "studentId", "message", "ruleCode", "createdAt"] }) : Promise.resolve([] as Row[]),
    // current ability: θ on the skills practised in the last 30 days, weighted by answers (null under 10 answers)
    ids.length ? practiceStats(repo, ids, range.to) : Promise.resolve(new Map<string, { recentTheta: number | null }>()),
    // open alerts = the Alerts page (StudentAlert OPEN), so the class report, dashboards and Alerts page agree (I-3)
    ids.length ? repo.findMany("StudentAlert", { studentId: { in: ids }, status: "OPEN" }, { select: ["studentId"] }) : Promise.resolve([] as Row[]),
  ]);
  // placement = the latest Diagnostic Test level (readiness I-17); the older global ability label otherwise
  const diag = ids.length ? await repo.findMany("DiagnosticScore", { studentId: { in: ids } }, { select: ["studentId", "level", "pct", "completedAt"] }) : [];
  const diagOf = new Map<string, Row>();
  for (const x of diag) { const cur = diagOf.get(String(x.studentId)); if (!cur || ms(x.completedAt) > ms(cur.completedAt)) diagOf.set(String(x.studentId), x); }
  const DIAG_LEVEL: Record<string, string> = { ABOVE: "Exceeding the standard", ON: "Meeting the standard", BELOW: "Approaching the standard" };
  const inRange = attempts.filter((a) => ms(a.createdAt) <= range.to.getTime());
  const hidden = await hiddenStarKeys(repo, book);
  const byQ = new Map<string, Row[]>();
  for (const a of inRange) (byQ.get(String(a.questionId)) ?? byQ.set(String(a.questionId), []).get(String(a.questionId))!).push(a);
  const hardIds = [...byQ].filter(([, v]) => v.length >= 5).map(([id, v]) => ({ id, acc: v.filter((x) => x.isCorrect).length / v.length, n: v.length })).sort((a, b) => a.acc - b.acc).slice(0, 5);
  const qrows = hardIds.length ? await repo.findMany("Question", { id: { in: hardIds.map((h) => h.id) } }, { select: ["id", "externalRef", "stem", "skillId"] }) : [];
  const qSkillIds = [...new Set(qrows.map((q) => String(q.skillId)))];
  const qSkills = new Map((qSkillIds.length ? await repo.findMany("Skill", { id: { in: qSkillIds } }, { select: ["id", "name", "code"] }) : []).map((k) => [String(k.id), isHiddenSkill(k.code) ? "" : book.nameOf(book.keyOf(String(k.id)))] as [string, string]));

  // rows grouped by student once (Update 42B: each student used to scan every answer of the class)
  const group = (rows: Row[], keep: (r: Row) => boolean = () => true) => { const m = new Map<unknown, Row[]>(); for (const r of rows) if (keep(r)) { const k = r.studentId; const l = m.get(k); if (l) l.push(r); else m.set(k, [r]); } return m; };
  const attemptsOf = group(inRange), alertsOf = group(studentAlerts);
  const globalOf = new Map<unknown, Row>(); for (const x of globals) if (!globalOf.has(x.studentId)) globalOf.set(x.studentId, x);
  const students: StudentRow[] = studs.map((s) => {
    const m = startedStars(book, s.id, hidden);
    const a = attemptsOf.get(s.id) ?? [];
    const g = globalOf.get(s.id);
    const avg = m.length ? m.reduce((t, x) => t + x.score, 0) / m.length : null;
    let last: number | null = null; for (const x of a) { const t = ms(x.createdAt); if (last === null || t > last) last = t; }
    return {
      studentId: s.id, name: s.name,
      group: groupFor(practice.get(s.id)?.recentTheta ?? (g ? num(g.theta) : null), avg),
      placement: diagOf.has(s.id) ? (DIAG_LEVEL[String(diagOf.get(s.id)!.level)] ?? null) : g ? proficiencyLabel(num(g.theta)) : null,
      avgMastery: avg === null ? null : Math.round(avg),
      skillsMastered: m.filter(starMastered).length,
      answered: a.length,
      accuracyPct: a.length ? Math.round((100 * a.filter((x) => x.isCorrect).length) / a.length) : null,
      minutes: Math.round(a.reduce((t, x) => t + num(x.responseMs), 0) / 60_000),
      lastActive: last ? new Date(last).toISOString() : null,
      openAlerts: alertsOf.get(s.id)?.length ?? 0,
    };
  }).sort((x, y) => x.name.localeCompare(y.name));

  const groups: Record<GroupName, string[]> = { Intervention: [], Developing: [], Meeting: [], Advanced: [] };
  for (const s of students) if (s.group) groups[s.group].push(s.name);

  // ⭐ by skill KEY (every copy of a skill is one skill), over the students who started it; the hidden skill is left out (I-18)
  const byKey = new Map<string, StarView[]>();
  for (const s of studs) for (const v of startedStars(book, s.id, hidden)) (byKey.get(v.key) ?? byKey.set(v.key, []).get(v.key)!).push(v);
  const skillAvg: OverviewSkill[] = [...byKey].filter(([, v]) => v.length >= 3).map(([key, v]) => ({
    skillId: v.find((x) => x.skillId)?.skillId ?? book.ix.skillsOf.get(key)?.[0] ?? key, key, name: book.nameOf(key),
    avgMastery: Math.round(v.reduce((a, x) => a + x.score, 0) / v.length), students: v.length,
    mastered: v.filter(starMastered).length, needsHelp: v.filter(starNeedsHelp).length,
  }));
  // reteach = fewer than half of them ⭐ (🔄 / needing support first, then the lowest star score); strong = half or
  // more ⭐ (most ⭐ first). The two lists never overlap.
  const weakSkills = skillAvg.filter((x) => 2 * x.mastered < x.students)
    .sort((a, b) => b.needsHelp / b.students - a.needsHelp / a.students || a.mastered / a.students - b.mastered / b.students || a.avgMastery - b.avgMastery).slice(0, 5);
  const strongSkills = skillAvg.filter((x) => 2 * x.mastered >= x.students).sort((a, b) => b.mastered / b.students - a.mastered / a.students || b.avgMastery - a.avgMastery).slice(0, 5);

  const hardQuestions = hardIds.map((h) => {
    const q = qrows.find((x) => x.id === h.id)!;
    return { questionId: h.id, ref: String(q.externalRef ?? q.id), stem: String(q.stem).slice(0, 140), skill: qSkills.get(String(q.skillId)) ?? "", attempts: h.n, accuracyPct: Math.round(h.acc * 100) };
  });

  const answered = inRange.length;
  const withM = students.filter((s) => s.avgMastery !== null);
  return {
    classId, className: String(klass.name), grade: num(grade.level),
    kpis: {
      students: students.length, activeStudents: students.filter((s) => s.answered > 0).length, questions: answered,
      accuracyPct: answered ? Math.round((100 * inRange.filter((a) => a.isCorrect).length) / answered) : null,
      avgMastery: withM.length ? Math.round(withM.reduce((t, s) => t + (s.avgMastery ?? 0), 0) / withM.length) : null,
      minutes: students.reduce((t, s) => t + s.minutes, 0),
      skillsMastered: students.reduce((t, s) => t + s.skillsMastered, 0),
      needSupport: students.filter((s) => s.group === "Intervention" || s.openAlerts > 0).length,
      stars: {
        mastered: [...byKey.values()].reduce((t, l) => t + l.filter(starMastered).length, 0),
        inProgress: [...byKey.values()].reduce((t, l) => t + l.filter((v) => v.status === "IN_PROGRESS").length, 0),
        needsReview: [...byKey.values()].reduce((t, l) => t + l.filter((v) => v.status === "NEEDS_REVIEW").length, 0),
      },
    },
    groups, students, weakSkills, strongSkills, hardQuestions,
    alerts: alerts.sort((a, b) => ms(b.createdAt) - ms(a.createdAt)).map((a) => ({
      id: String(a.id), studentId: String(a.studentId), message: String(a.message), rule: String(a.ruleCode),
      createdAt: new Date(ms(a.createdAt)).toISOString(), nextAction: NEXT_ACTION[a.ruleCode as RuleCode] ?? "",
    })),
  };
}

export interface MasteryGrid {
  /** one column per skill KEY of the unit (copies of a skill are one column, the Student Skills name) */
  skills: { skillId: string; key: string; name: string }[];
  /** ⭐ the student's star of each column (null = ☆ not started) */
  rows: { studentId: string; name: string; cells: (StarCell | null)[] }[];
}

/** Students × skills star grid for one unit (the same stars as Student Skills). */
export async function masteryGrid(repo: Repo, actor: Actor, classId: string, unitId: string): Promise<MasteryGrid> {
  const klass = await assertClassAccess(repo, actor, classId);
  const [unit, curs, unitLinks, studs] = await Promise.all([
    repo.findUnique("Unit", { id: unitId }),
    repo.findMany("Curriculum", { gradeId: klass.gradeId, isActive: true }),
    repo.findMany("UnitSkill", { unitId }),
    classStudents(repo, classId),
  ]);
  const cur = curs[0];
  if (!unit || unit.curriculumId !== cur.id) throw new ForbiddenError("That unit is not in this class's book.");
  const links = unitLinks.sort((a, b) => num(a.order) - num(b.order));
  const [skillRows, book] = await Promise.all([
    links.length ? repo.findMany("Skill", { id: { in: links.map((l) => l.skillId) } }, { select: ["id", "name", "code"] }) : Promise.resolve([] as Row[]),
    starBook(repo, studs.map((s) => s.id), String(klass.schoolId ?? "")),
  ]);
  const hiddenIds = new Set(skillRows.filter((k) => isHiddenSkill(k.code)).map((k) => String(k.id)));
  const skills: MasteryGrid["skills"] = [];
  for (const l of links) {
    const id = String(l.skillId);
    if (hiddenIds.has(id)) continue;
    const key = book.keyOf(id);
    if (!skills.some((k) => k.key === key)) skills.push({ skillId: id, key, name: book.nameOf(key) || String(skillRows.find((k) => k.id === l.skillId)?.name ?? "") });
  }
  return {
    skills,
    rows: studs.sort((a, b) => a.name.localeCompare(b.name)).map((s) => ({
      studentId: s.id, name: s.name,
      cells: skills.map((k) => { const v = book.ofKey(s.id, k.key); return v.status === "NOT_STARTED" ? null : starCell(v); }),
    })),
  };
}

export interface StudentDetail {
  studentId: string;
  name: string;
  studentNumber: string;
  grade: number;
  className: string | null;
  placement: DiagnosticSummary | null;
  /** ⭐ one row per started skill KEY (the Student Skills name): score = the star score, band = the star word,
   *  attempts / accuracy = the practice answers that count for the star */
  skills: { skillId: string; key: string; name: string; score: number; band: string; star: StarCell; attempts: number; accuracyPct: number; lastPracticed: string | null }[];
  recent: { at: string; skill: string; ref: string; stem: string; correct: boolean; seconds: number; rapid: boolean; answer: string }[];
  decisions: { at: string; reasonCode: string; reason: string; fromTheta: number; toTheta: number; difficulty: number | null; correct: boolean | null; masteryBefore: number | null; masteryAfter: number | null }[];
  alerts: { id: string; message: string; rule: string; nextAction: string; evidence: unknown }[];
  domains: { label: string; level: string }[];
}

export async function studentDetail(repo: Repo, actor: Actor, studentId: string): Promise<StudentDetail> {
  const st = await repo.findUnique("Student", { id: studentId });
  if (!st || !canAccessStudent(actor, { studentId, schoolId: String(st.schoolId) })) throw new ForbiddenError("You do not have access to this student.");
  // everything independent is loaded in parallel; history is read as a bounded, newest-first page
  const [user, grade, members, book, attempts, logs, alerts, domains, placement] = await Promise.all([
    repo.findUnique("User", { id: st.userId }),
    repo.findUnique("Grade", { id: st.gradeId }),
    repo.findMany("ClassMembership", { studentId, leftAt: null }),
    starBook(repo, [studentId], String(st.schoolId)),
    // only what the page shows: the 20 latest answers and 30 latest engine decisions (not the full history)
    repo.findMany("QuestionAttempt", { studentId }, { select: ["id", "skillId", "questionId", "createdAt", "response", "isCorrect", "responseMs", "rapidGuess"], orderBy: [{ field: "createdAt", dir: "desc" }], take: 20 }),
    repo.findMany("AdaptiveDecisionLog", { studentId }, { select: ["id", "createdAt", "reasonCode", "reason", "previousTheta", "newTheta", "questionDifficulty", "responseCorrect", "masteryBefore", "masteryAfter"], orderBy: [{ field: "createdAt", dir: "desc" }], take: 30 }),
    repo.findMany("InterventionAlert", { studentId, resolvedAt: null }),
    repo.findMany("StudentAbility", { studentId }),
    latestDiagnostic(repo, studentId),
  ]);
  const member = members[0];
  const skillIds = [...new Set(attempts.map((a) => String(a.skillId)))];
  const recentA = attempts.sort((a, b) => ms(b.createdAt) - ms(a.createdAt)).slice(0, 20);
  const [klass, skillRows, qs, hidden] = await Promise.all([
    member ? repo.findUnique("Class", { id: member.classId }) : Promise.resolve(null),
    skillIds.length ? repo.findMany("Skill", { id: { in: skillIds } }, { select: ["id", "name", "code"] }) : Promise.resolve([] as Row[]),
    recentA.length ? repo.findMany("Question", { id: { in: recentA.map((a) => a.questionId) } }, { select: ["id", "externalRef", "stem"] }) : Promise.resolve([] as Row[]),
    hiddenStarKeys(repo, book),
  ]);
  // the hidden “Unclassified (Curriculum Map)” skill is not listed (I-18); a name used in two grades gets “· G5” (S-13)
  const visible = skillRows.filter((k) => !isHiddenSkill(k.code));
  const skillName = new Map(withGradeSuffix(visible).map((k) => [k.id, k.name]));
  return {
    studentId, name: String(user!.displayName), studentNumber: String(st.studentNumber), grade: num(grade!.level), className: klass ? String(klass.name) : null,
    placement,
    // ⭐ one row per started skill KEY, the same stars and names as Student Skills (lowest star score first)
    skills: startedStars(book, studentId, hidden).sort((a, b) => a.score - b.score || book.nameOf(a.key).localeCompare(book.nameOf(b.key))).map((v) => ({
      skillId: v.skillId ?? book.ix.skillsOf.get(v.key)?.[0] ?? v.key, key: v.key, name: book.nameOf(v.key), score: v.score, band: starWord(v), star: starCell(v),
      attempts: v.answered, accuracyPct: v.answered ? Math.round((100 * v.correct) / v.answered) : 0, lastPracticed: v.updatedAt,
    })),
    recent: recentA.map((a) => {
      const q = qs.find((x) => x.id === a.questionId);
      const v = answerValue(a.response);
      return {
        at: new Date(ms(a.createdAt)).toISOString(), skill: skillName.get(String(a.skillId)) ?? "", ref: String(q?.externalRef ?? a.questionId), stem: String(q?.stem ?? "").slice(0, 120),
        correct: Boolean(a.isCorrect), seconds: Math.round(num(a.responseMs) / 1000), rapid: Boolean(a.rapidGuess), answer: answerText(v),
      };
    }),
    decisions: logs.sort((a, b) => ms(b.createdAt) - ms(a.createdAt)).slice(0, 30).map((l) => ({
      at: new Date(ms(l.createdAt)).toISOString(), reasonCode: String(l.reasonCode), reason: String(l.reason),
      fromTheta: Math.round(num(l.previousTheta) * 100) / 100, toTheta: Math.round(num(l.newTheta) * 100) / 100,
      difficulty: l.questionDifficulty === null || l.questionDifficulty === undefined ? null : num(l.questionDifficulty),
      correct: l.responseCorrect === null || l.responseCorrect === undefined ? null : Boolean(l.responseCorrect),
      masteryBefore: l.masteryBefore === null || l.masteryBefore === undefined ? null : Math.round(num(l.masteryBefore)),
      masteryAfter: l.masteryAfter === null || l.masteryAfter === undefined ? null : Math.round(num(l.masteryAfter)),
    })),
    alerts: alerts.map((a) => ({ id: String(a.id), message: String(a.message), rule: String(a.ruleCode), nextAction: NEXT_ACTION[a.ruleCode as RuleCode] ?? "", evidence: a.evidence })),
    domains: domains.filter((d) => String(d.scope).startsWith("DOMAIN:")).map((d) => ({ label: DOMAIN_LABEL[String(d.domain)] ?? String(d.domain), level: proficiencyLabel(num(d.theta)) })),
  };
}

/** Classes this actor teaches (teacher) or all classes of the school (admin). */
export async function teacherClasses(repo: Repo, actor: Actor): Promise<{ classId: string; name: string; grade: number; students: number; openAlerts: number }[]> {
  let classes: Row[] = [];
  if (actor.role === "TEACHER") {
    const t = await repo.findUnique("Teacher", { userId: actor.userId });
    const links = t ? await repo.findMany("ClassTeacher", { teacherId: t.id }) : [];
    classes = links.length ? await repo.findMany("Class", { id: { in: links.map((l) => l.classId) }, deletedAt: null }) : [];
  } else if (actor.role === "SCHOOL_ADMIN" || actor.role === "SUPER_ADMIN") {
    classes = await repo.findMany("Class", actor.role === "SUPER_ADMIN" ? { deletedAt: null } : { schoolId: actor.schoolId, deletedAt: null });
  } else throw new ForbiddenError("Teachers and admins only.");
  const [grades, members] = await Promise.all([
    classes.length ? repo.findMany("Grade", { id: { in: [...new Set(classes.map((c) => c.gradeId))] } }) : Promise.resolve([] as Row[]),
    classes.length ? repo.findMany("ClassMembership", { classId: { in: classes.map((c) => c.id) }, leftAt: null }, { select: ["classId", "studentId"] }) : Promise.resolve([] as Row[]),
  ]);
  const alerts = members.length ? await repo.findMany("StudentAlert", { studentId: { in: members.map((m) => m.studentId) }, status: "OPEN" }, { select: ["studentId"] }) : [];
  return classes.map((c) => {
    const sids = new Set(members.filter((m) => m.classId === c.id).map((m) => String(m.studentId)));
    return { classId: String(c.id), name: String(c.name), grade: num(grades.find((g) => g.id === c.gradeId)?.level), students: sids.size, openAlerts: alerts.filter((a) => sids.has(String(a.studentId))).length };
  }).sort((a, b) => a.name.localeCompare(b.name));
}
