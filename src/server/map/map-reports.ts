/**
 * 📑 MAP reports, built from the MAP results, the Learning Continuum and the platform's own practice:
 *   - Personal Study Plan (one student, one subject): for each goal area the student's RIT, then
 *     Reinforce (band below) · Develop (their band) · Introduce (band above) from the continuum, every statement
 *     with the platform skills that practise it and the student's status in each (mastered / practising / new).
 *     Without a continuum: the platform's skills of the student's RIT range (MAP Skill Plan).
 *   - Family Report (one student): achievement (percentile, descriptor) and growth for each subject, the RIT
 *     history against the national average, the Spring goal, and the student's practice on the platform.
 *   - Group Study Plan (one class, one subject): students of the same RIT band together, what to develop, the
 *     linked skills with how many of the group have mastered each.
 * Access: the class's teachers and coordinators, admins, the student themself, their parent (once the teacher
 * has shared the student's report).
 */
import type { Repo, Row } from "../seeding/repo";
import { assertCan, ForbiddenError, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import { assertClassAccess } from "../teacher/assignments";
import { assertClassRead, readableClasses } from "../teacher/coordinators";
import { assignQuestions } from "../teacher/assign";
import { classMembers, studentNames } from "../insights/student-data";
import { isReportShared } from "../insights/parent-report";
import { bandOf, seasonOf, type Season } from "./rit";
import { groupOf, groupPools, GROUPS, mapProfiles, type GroupKey, type MapProfile, type Subject } from "./map-plan";
import { continuumFor, continuumIndex, groupOfGoal, hasContinuum, skillsFor, type ContinuumIndex, type ContinuumView, type Stage } from "./continuum";
import { buildRanges, skillPlan } from "./skill-plan";
import { GROWTH_SD, normFor, pctOfZ } from "./norm-tables";

const s = (v: unknown) => String(v ?? "");
const time = (v: unknown) => new Date(v instanceof Date ? v.toISOString() : s(v)).getTime();
export const DESCRIPTOR_NAME: Record<string, string> = { Low: "Low", LoAvg: "Low Average", Avg: "Average", HiAvg: "High Average", High: "High" };
const descriptor = (pct: number | null) => (pct === null ? null : DESCRIPTOR_NAME[bandOf(pct)]);

// ------------------------------------------------------------------ the student and access

export interface ReportStudent { id: string; name: string; first: string; number: string; grade: number; className: string; classId: string | null; school: string; logoUrl: string | null }

export async function reportStudent(repo: Repo, actor: Actor, studentId: string): Promise<ReportStudent> {
  const st = await repo.findUnique("Student", { id: studentId });
  if (!st || (s(st.schoolId) !== s(actor.schoolId) && actor.role !== "SUPER_ADMIN") || st.deletedAt) throw new ForbiddenError("Student not found.");
  const m = (await repo.findMany("ClassMembership", { studentId, leftAt: null }))[0];
  const klass = m ? await repo.findUnique("Class", { id: m.classId }) : null;
  if (actor.role === "STUDENT") { if (actor.studentId !== studentId) throw new ForbiddenError("Student not found."); }
  else if (actor.role === "PARENT") {
    if (!actor.parentChildIds?.has(studentId)) throw new ForbiddenError("Student not found.");
    if (!(await isReportShared(repo, s(st.schoolId), studentId))) throw new ForbiddenError("The teacher has not shared this report yet.");
  } else if (actor.role === "TEACHER") {
    if (!klass || !(await readableClasses(repo, actor)).some((c) => c.id === klass.id)) throw new ForbiddenError("This student is not in your classes.");
  } else if (actor.role !== "SCHOOL_ADMIN" && actor.role !== "SUPER_ADMIN") throw new ForbiddenError();
  const [u, g, school] = await Promise.all([repo.findUnique("User", { id: st.userId }), st.gradeId ? repo.findUnique("Grade", { id: st.gradeId }) : null, repo.findUnique("School", { id: st.schoolId })]);
  const name = s(u?.displayName) || "Student";
  return { id: studentId, name, first: name.split(" ")[0], number: s(st.studentNumber), grade: Number(g?.level ?? 0), className: s(klass?.name), classId: klass ? s(klass.id) : null, school: s(school?.name), logoUrl: school?.logoUrl ? s(school.logoUrl) : null };
}

// ------------------------------------------------------------------ Personal Study Plan

export type SkillStatus = "MASTERED" | "PRACTISING" | "NEW";
export interface PlanSkillRef { id: string; name: string; status: SkillStatus; score: number | null }
export interface PlanStatement { text: string; standards: string[]; skills: PlanSkillRef[] }
export interface PlanTopic { name: string; statements: PlanStatement[] }
export interface PlanStage { key: "REINFORCE" | "DEVELOP" | "INTRODUCE"; title: string; range: string; topics: PlanTopic[]; total: number; shown: number }
export interface StudyArea { group: GroupKey; name: string; icon: string; rit: number | null; fromGoal: boolean; percentile: number | null; descriptor: string | null; focus: boolean; stages: PlanStage[]; skillsMastered: number; skillsLinked: number }
export interface StudyPlanDoc { student: ReportStudent; subject: Subject; term: string | null; overall: { rit: number; percentile: number | null; descriptor: string | null; projection: number | null } | null; areas: StudyArea[]; source: "CONTINUUM" | "SKILLS"; full: boolean }

const STAGE_TITLE = { REINFORCE: "Reinforce", DEVELOP: "Develop", INTRODUCE: "Introduce" } as const;
type Mastery = Map<string, { score: number; mastered: boolean; attempts: number }>;
const refOf = (k: { id: string; name: string }, m: Mastery): PlanSkillRef => {
  const x = m.get(k.id);
  return { id: k.id, name: k.name, status: x?.mastered ? "MASTERED" : x && x.attempts > 0 ? "PRACTISING" : "NEW", score: x ? Math.round(x.score) : null };
};

/** The `limit` most needed items (lowest need first), taken in turn from every topic so each one is covered;
 *  returns their indexes (the original order is kept by the caller). */
export function pickBalanced<T>(list: T[], topicOf: (x: T) => string, need: (x: T) => number, limit: number): Set<number> {
  const ranked = list.map((x, i) => ({ x, i })).sort((a, b) => need(a.x) - need(b.x) || a.i - b.i);
  const queues = new Map<string, number[]>();
  for (const y of ranked) queues.set(topicOf(y.x), [...(queues.get(topicOf(y.x)) ?? []), y.i]);
  const keep = new Set<number>();
  while (keep.size < limit && [...queues.values()].some((q) => q.length)) for (const q of queues.values()) { const i = q.shift(); if (i !== undefined && keep.size < limit) keep.add(i); }
  return keep;
}

/** Stage → topics; `limit` keeps the statements the student most needs (linked skills not mastered first). */
function stageOf(key: PlanStage["key"], st: Stage | null, m: Mastery, limit: number | null, grade = 0): PlanStage | null {
  if (!st) return null;
  let list = st.statements.map((x) => ({ topic: x.topic, text: x.text, standards: x.standards, skills: x.skills.map((k) => refOf(k, m)) }));
  const total = list.length;
  if (limit !== null && list.length > limit) {
    // first: statements of the student's grade (± 1) whose skills are not mastered yet
    const nearGrade = (x: (typeof list)[number]) => x.standards.some((c) => { const g = Number(c.split(".")[1]); return Number.isFinite(g) && Math.abs(g - grade) <= 1; });
    const need = (x: (typeof list)[number]) => (grade && !nearGrade(x) ? 3 : 0) + (x.skills.length ? (x.skills.every((k) => k.status === "MASTERED") ? 2 : 0) : 1);
    const keep = pickBalanced(list, (x) => x.topic, need, limit);
    list = list.filter((_, i) => keep.has(i));
  }
  const topics: PlanTopic[] = [];
  for (const x of list) { let t = topics.find((y) => y.name === x.topic); if (!t) { t = { name: x.topic, statements: [] }; topics.push(t); } t.statements.push({ text: x.text, standards: x.standards, skills: x.skills }); }
  return { key, title: STAGE_TITLE[key], range: `RIT ${st.label}`, topics, total, shown: list.length };
}

async function masteryOf(repo: Repo, studentIds: string[]): Promise<Map<string, Mastery>> {
  const rows = studentIds.length ? await repo.findMany("StudentSkillMastery", { studentId: { in: studentIds } }, { select: ["studentId", "skillId", "score", "isMastered", "attempts"] }) : [];
  const out = new Map<string, Mastery>();
  for (const r of rows) { const m = out.get(s(r.studentId)) ?? new Map(); m.set(s(r.skillId), { score: Number(r.score), mastered: Boolean(r.isMastered), attempts: Number(r.attempts) }); out.set(s(r.studentId), m); }
  return out;
}

/** The RIT used for a goal area: its goal-area RIT, else the overall RIT. */
const areaRit = (p: MapProfile | undefined, g: GroupKey) => { const a = p?.areas.find((x) => x.group === g); return a?.rit !== null && a?.rit !== undefined ? { rit: a.rit, fromGoal: true, pct: a.percentile, desc: a.descriptor } : p?.overall ? { rit: p.overall.rit, fromGoal: false, pct: p.overall.percentile, desc: p.overall.descriptor } : null; };

export async function studyPlan(repo: Repo, actor: Actor, studentId: string, subject: Subject, opts: { full?: boolean; student?: ReportStudent; index?: ContinuumIndex; mastery?: Mastery; profile?: MapProfile } = {}): Promise<StudyPlanDoc> {
  const student = opts.student ?? (await reportStudent(repo, actor, studentId));
  const schoolId = s((await repo.findUnique("Student", { id: studentId }))?.schoolId);
  const p = opts.profile ?? (await mapProfiles(repo, schoolId, [studentId], subject)).get(studentId);
  const m = opts.mastery ?? (await masteryOf(repo, [studentId])).get(studentId) ?? new Map();
  const useContinuum = opts.index ? true : await hasContinuum(repo, subject);
  const ix = useContinuum ? opts.index ?? (await continuumIndex(repo, schoolId, student.grade, subject)) : null;
  const full = Boolean(opts.full);
  const groups = GROUPS.filter((g) => g.subject === subject);
  const ritList = groups.map((g) => areaRit(p, g.key)?.rit ?? 999);
  const minRit = Math.min(...ritList);
  const areas: StudyArea[] = [];
  for (const g of groups) {
    const r = areaRit(p, g.key);
    const area: StudyArea = { group: g.key, name: g.name, icon: g.icon, rit: r?.rit ?? null, fromGoal: Boolean(r?.fromGoal), percentile: r?.pct ?? null, descriptor: r?.desc ? DESCRIPTOR_NAME[r.desc] ?? r.desc : null, focus: Boolean(r && (r.desc === "Low" || r.desc === "LoAvg" || (r.fromGoal && r.rit === minRit))), stages: [], skillsMastered: 0, skillsLinked: 0 };
    if (r) {
      if (ix && ix.rows.some((x) => groupOfGoal(s(x.goalArea)) === g.key)) {
        const v: ContinuumView = continuumFor(ix, g.key, r.rit);
        area.stages = [stageOf("REINFORCE", v.reinforce, m, full ? null : 6, student.grade), stageOf("DEVELOP", v.develop, m, full ? null : 18, student.grade), stageOf("INTRODUCE", v.introduce, m, full ? null : 6, student.grade)].filter((x): x is PlanStage => Boolean(x));
      } else {
        // no continuum yet: the platform's skills of the student's RIT range
        const range = (await buildRanges(repo, schoolId, student.grade, g.key)).find((x) => r.rit >= x.low && r.rit <= x.high);
        if (range) area.stages = [{ key: "DEVELOP", title: "Develop", range: `RIT ${range.label}`, total: range.skills, shown: range.skills, topics: range.areas.map((a) => ({ name: a.name, statements: a.topics.flatMap((t) => t.skills.map((k) => ({ text: k.name, standards: [], skills: [refOf(k, m)] }))) })) }];
      }
      const linked = new Map<string, PlanSkillRef>();
      for (const st of area.stages.filter((x) => x.key === "DEVELOP")) for (const t of st.topics) for (const x of t.statements) for (const k of x.skills) linked.set(k.id, k);
      area.skillsLinked = linked.size; area.skillsMastered = [...linked.values()].filter((k) => k.status === "MASTERED").length;
    }
    areas.push(area);
  }
  // weakest first: focus areas, then lower RIT
  areas.sort((a, b) => Number(b.focus) - Number(a.focus) || (a.rit ?? 999) - (b.rit ?? 999));
  return { student, subject, term: p?.term ?? null, overall: p?.overall ? { rit: p.overall.rit, percentile: p.overall.percentile, descriptor: descriptor(p.overall.percentile), projection: p.fall?.projection ?? null } : null, areas, source: ix ? "CONTINUUM" : "SKILLS", full };
}

/** Every student of a class (one PDF): the continuum, the profiles and mastery are loaded once. */
export async function classStudyPlans(repo: Repo, actor: Actor, classId: string, subject: Subject, full = false): Promise<{ className: string; docs: StudyPlanDoc[] }> {
  assertCan(actor, "reports:read");
  const klass = await assertClassRead(repo, actor, classId);
  const ids = await classMembers(repo, classId);
  const grade = Number((await repo.findUnique("Grade", { id: klass.gradeId }))?.level ?? 0);
  const [profiles, mastery, cont] = await Promise.all([mapProfiles(repo, actor.schoolId!, ids, subject), masteryOf(repo, ids), hasContinuum(repo, subject)]);
  const index = cont ? await continuumIndex(repo, actor.schoolId!, grade, subject) : undefined;
  const docs: StudyPlanDoc[] = [];
  for (const id of ids) {
    if (!profiles.get(id)?.overall) continue;
    docs.push(await studyPlan(repo, actor, id, subject, { full, index, mastery: mastery.get(id) ?? new Map(), profile: profiles.get(id) }));
  }
  docs.sort((a, b) => a.student.name.localeCompare(b.student.name));
  return { className: s(klass.name), docs };
}

// ------------------------------------------------------------------ Family Report

export interface FamilyPoint { term: string; label: string; season: Season; grade: number; rit: number | null; national: number | null; nationalExact: boolean }
export interface FamilySubject {
  subject: Subject; name: string;
  latest: { rit: number; term: string; grade: number; percentile: number | null; percentileFromFile: boolean; descriptor: string | null } | null;
  points: FamilyPoint[];
  growth: { from: string; to: string; rit: number; expected: number; percentile: number; descriptor: string; projected: boolean } | null;
  goal: { target: number; term: string } | null;
  areas: { name: string; icon: string; rit: number; descriptor: string | null }[];
}
export interface FamilyDoc { student: ReportStudent; term: string | null; subjects: FamilySubject[]; practice: { answers: number; accuracy: number | null; minutes: number; mastered: number; days: number } }

const shortLabel = (term: string, season: Season) => { const y = term.match(/(\d{4})/)?.[1] ?? ""; return `${season[0]}${season.slice(1).toLowerCase()} '${y.slice(2)}`; };
const yearOf = (term: string, date: unknown) => Number(term.match(/(\d{4})/)?.[1] ?? new Date(time(date)).getUTCFullYear());
/** The school year a term belongs to (Fall 2025, Winter 2026 and Spring 2026 are all 2025). */
const schoolYear = (season: Season, year: number) => (season === "FALL" ? year : year - 1);

export async function familyReport(repo: Repo, actor: Actor, studentId: string, now = new Date(), opts: { student?: ReportStudent } = {}): Promise<FamilyDoc> {
  const student = opts.student ?? (await reportStudent(repo, actor, studentId));
  const results = await repo.findMany("MapResult", { studentId });
  const syNow = now.getUTCMonth() + 1 >= 8 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
  const subjects: FamilySubject[] = [];
  const schoolId = s((await repo.findUnique("Student", { id: studentId }))?.schoolId);
  for (const subject of ["READING", "LANGUAGE"] as const) {
    const isSubj = (v: unknown) => (subject === "READING" ? /read/i : /language/i).test(s(v));
    const overall = results.filter((r) => isSubj(r.subject) && !r.goalName).sort((a, b) => time(a.testDate) - time(b.testDate));
    if (!overall.length) continue;
    // one point per term (the latest test of the term)
    const byTerm = new Map<string, Row>();
    for (const r of overall) byTerm.set(s(r.termName) || shortLabel("", seasonOf(null, r.testDate)), r);
    const rows = [...byTerm.values()].sort((a, b) => time(a.testDate) - time(b.testDate)).slice(-6);
    const points: FamilyPoint[] = [];
    for (const r of rows) {
      const season = seasonOf(r.termName, r.testDate), y = yearOf(s(r.termName), r.testDate);
      const grade = student.grade - (syNow - schoolYear(season, y));
      const n = await normFor(repo, subject, grade, season);
      points.push({ term: s(r.termName), label: shortLabel(s(r.termName) || String(y), season), season, grade, rit: Number(r.rit), national: n ? Math.round(n.mean) : null, nationalExact: Boolean(n?.exact) });
    }
    const last = rows[rows.length - 1], lp = points[points.length - 1];
    const ln = await normFor(repo, subject, lp.grade, lp.season);
    const fromFile = last.achievementPercentile !== null && last.achievementPercentile !== undefined;
    const pct = fromFile ? Number(last.achievementPercentile) : ln ? pctOfZ((Number(last.rit) - ln.mean) / ln.sd) : null;
    // growth: from the latest Fall before the latest test
    let growth: FamilySubject["growth"] = null;
    const startIdx = [...points.keys()].reverse().find((i) => i < points.length - 1 && points[i].season === "FALL");
    if (startIdx !== undefined) {
      const a = points[startIdx], aRow = rows[startIdx];
      const within = schoolYear(a.season, yearOf(a.term, aRow.testDate)) === schoolYear(lp.season, yearOf(lp.term, last.testDate));
      const na = await normFor(repo, subject, a.grade, a.season);
      const projected = within && lp.season === "SPRING" && aRow.projectedGrowth !== null && aRow.projectedGrowth !== undefined;
      const expected = projected ? Number(aRow.projectedGrowth) : na && ln ? ln.mean - na.mean : null;
      if (expected !== null) {
        const g = Number(last.rit) - Number(aRow.rit);
        const gp = pctOfZ((g - expected) / (within ? GROWTH_SD.withinYear : GROWTH_SD.fallToFall));
        growth = { from: a.term, to: lp.term, rit: g, expected: Math.round(expected * 10) / 10, percentile: gp, descriptor: DESCRIPTOR_NAME[bandOf(gp)], projected };
      }
    }
    // the Spring goal of this school year
    const fallNow = [...rows].reverse().find((r) => seasonOf(r.termName, r.testDate) === "FALL" && schoolYear("FALL", yearOf(s(r.termName), r.testDate)) === syNow);
    const goal = fallNow && fallNow.projectedGrowth !== null && fallNow.projectedGrowth !== undefined ? { target: Number(fallNow.rit) + Number(fallNow.projectedGrowth), term: `Spring ${syNow + 1}` } : null;
    const prof = (await mapProfiles(repo, schoolId, [studentId], subject)).get(studentId);
    subjects.push({
      subject, name: subject === "READING" ? "Reading" : "Language Usage",
      latest: { rit: Number(last.rit), term: lp.term, grade: lp.grade, percentile: pct, percentileFromFile: fromFile, descriptor: descriptor(pct) },
      points, growth, goal,
      areas: (prof?.areas ?? []).filter((a) => a.rit !== null).map((a) => ({ name: a.name, icon: a.icon, rit: a.rit!, descriptor: a.descriptor ? DESCRIPTOR_NAME[a.descriptor] : null })),
    });
  }
  // practice on the platform, last 30 days
  const since = new Date(now.getTime() - 30 * 86_400_000);
  const [att, mast] = await Promise.all([
    repo.findMany("QuestionAttempt", { studentId, createdAt: { gte: since } }, { select: ["isCorrect", "responseMs", "createdAt"] }),
    repo.count("StudentSkillMastery", { studentId, isMastered: true }),
  ]);
  const days = new Set(att.map((a) => new Date(time(a.createdAt)).toISOString().slice(0, 10))).size;
  const term = subjects.map((x) => x.latest?.term).filter(Boolean).sort().pop() ?? null;
  return { student, term, subjects, practice: { answers: att.length, accuracy: att.length ? Math.round((att.filter((a) => a.isCorrect).length / att.length) * 100) : null, minutes: Math.round(att.reduce((t, a) => t + Number(a.responseMs ?? 0), 0) / 60000), mastered: mast, days } };
}

export async function classFamilyReports(repo: Repo, actor: Actor, classId: string, now = new Date()): Promise<{ className: string; docs: FamilyDoc[] }> {
  assertCan(actor, "reports:read");
  const klass = await assertClassRead(repo, actor, classId);
  const ids = await classMembers(repo, classId);
  const docs: FamilyDoc[] = [];
  for (const id of ids) { const d = await familyReport(repo, actor, id, now); if (d.subjects.length) docs.push(d); }
  docs.sort((a, b) => a.student.name.localeCompare(b.student.name));
  return { className: s(klass.name), docs };
}

// ------------------------------------------------------------------ Group Study Plan

export interface GroupBand {
  key: string; range: string; low: number; high: number;
  students: { id: string; name: string; rit: number; fromGoal: boolean }[];
  topics: { name: string; statements: { text: string; standards: string[]; skills: { id: string; name: string; mastered: number }[] }[] }[];
  skillIds: string[]; reinforceRange: string | null; introduceRange: string | null; total: number; shown: number;
}
export interface GroupArea { group: GroupKey; name: string; icon: string; bands: GroupBand[] }
export interface GroupPlanDoc { classId: string; className: string; grade: number; subject: Subject; term: string | null; areas: GroupArea[]; noScores: string[]; source: "CONTINUUM" | "SKILLS"; canAssign: boolean; full: boolean }

export async function groupStudyPlan(repo: Repo, actor: Actor, classId: string, subject: Subject, full = false): Promise<GroupPlanDoc> {
  assertCan(actor, "reports:read");
  const klass = await assertClassRead(repo, actor, classId);
  let canAssign = true; try { await assertClassAccess(repo, actor, classId); } catch { canAssign = false; }
  const grade = Number((await repo.findUnique("Grade", { id: klass.gradeId }))?.level ?? 0);
  const ids = await classMembers(repo, classId);
  const [names, profiles, mastery, cont] = await Promise.all([studentNames(repo, ids), mapProfiles(repo, actor.schoolId!, ids, subject), masteryOf(repo, ids), hasContinuum(repo, subject)]);
  const ix = cont ? await continuumIndex(repo, actor.schoolId!, grade, subject) : null;
  const scored = ids.filter((id) => profiles.get(id)?.overall);
  const areas: GroupArea[] = [];
  for (const g of GROUPS.filter((x) => x.subject === subject)) {
    const buckets = new Map<string, GroupBand>();
    if (ix && ix.rows.some((x) => groupOfGoal(s(x.goalArea)) === g.key)) {
      for (const id of scored) {
        const r = areaRit(profiles.get(id), g.key)!;
        const v = continuumFor(ix, g.key, r.rit);
        if (!v.develop) continue;
        const key = v.develop.label;
        let b = buckets.get(key);
        if (!b) {
          b = { key, range: `RIT ${v.develop.label}`, low: v.develop.low, high: v.develop.high, students: [], topics: [], skillIds: [], reinforceRange: v.reinforce ? `RIT ${v.reinforce.label}` : null, introduceRange: v.introduce ? `RIT ${v.introduce.label}` : null, total: v.develop.statements.length, shown: v.develop.statements.length };
          let stmts = v.develop.statements;
          if (!full && stmts.length > 14) {
            const near = (x: (typeof stmts)[number]) => x.standards.some((c) => { const gg = Number(c.split(".")[1]); return Number.isFinite(gg) && Math.abs(gg - grade) <= 1; });
            const keep = pickBalanced(stmts, (x) => x.topic, (x) => (near(x) ? 0 : 3) + (x.skills.length ? 0 : 1), 14);
            stmts = stmts.filter((_, i) => keep.has(i));
            b.shown = stmts.length;
          }
          for (const x of stmts) {
            let t = b.topics.find((y) => y.name === x.topic); if (!t) { t = { name: x.topic, statements: [] }; b.topics.push(t); }
            t.statements.push({ text: x.text, standards: x.standards, skills: x.skills.map((k) => ({ id: k.id, name: k.name, mastered: 0 })) });
            for (const k of x.skills) if (!b.skillIds.includes(k.id)) b.skillIds.push(k.id);
          }
          buckets.set(key, b);
        }
        b.students.push({ id, name: names.get(id)?.name ?? "Student", rit: r.rit, fromGoal: r.fromGoal });
      }
    } else {
      const sp = await skillPlan(repo, actor, { grade, group: g.key, classId });
      for (const r of sp.ranges.filter((x) => x.students.length)) {
        const b: GroupBand = { key: r.label, range: `RIT ${r.label}`, low: r.low, high: r.high, total: r.skills, shown: r.skills, students: r.students.map((x) => ({ ...x, fromGoal: false })), topics: r.areas.map((a) => ({ name: a.name, statements: a.topics.flatMap((t) => t.skills.map((k) => ({ text: k.name, standards: [], skills: [{ id: k.id, name: k.name, mastered: 0 }] }))) })), skillIds: r.areas.flatMap((a) => a.topics.flatMap((t) => t.skills.map((k) => k.id))), reinforceRange: null, introduceRange: null };
        buckets.set(b.key, b);
      }
    }
    // how many of the group have mastered each linked skill
    for (const b of buckets.values()) {
      for (const t of b.topics) for (const x of t.statements) for (const k of x.skills) k.mastered = b.students.filter((st) => mastery.get(st.id)?.get(k.id)?.mastered).length;
      b.students.sort((a, c) => a.rit - c.rit || a.name.localeCompare(c.name));
    }
    areas.push({ group: g.key, name: g.name, icon: g.icon, bands: [...buckets.values()].sort((a, c) => a.low - c.low) });
  }
  const term = scored.map((id) => profiles.get(id)!.term).find(Boolean) ?? null;
  return { classId, className: s(klass.name), grade, subject, term, areas, noScores: ids.filter((id) => !profiles.get(id)?.overall).map((id) => names.get(id)?.name ?? "Student"), source: ix ? "CONTINUUM" : "SKILLS", canAssign, full };
}

/** Sends a group its practice: the ticked skills, questions of the band and the band above (widened when too few). */
export async function assignGroupSkills(repo: Repo, actor: Actor, input: { classId: string; group: GroupKey; low: number; high: number; skillIds: string[]; studentIds: string[]; count?: number; dueAt?: Date | null; title?: string }, now = new Date()): Promise<{ assignmentId: string; questions: number; students: number }> {
  assertCan(actor, "assignments:create");
  const klass = await assertClassAccess(repo, actor, input.classId);
  if (!input.skillIds.length) throw new ValidationError("Tick at least one skill.");
  const members = new Set(await classMembers(repo, input.classId));
  const studentIds = input.studentIds.filter((x) => members.has(x));
  if (!studentIds.length) throw new ValidationError("Tick at least one student.");
  const grade = Number((await repo.findUnique("Grade", { id: klass.gradeId }))?.level ?? 0);
  const pool = ((await groupPools(repo, actor.schoolId!, grade)).pools.get(input.group) ?? []).filter((q) => input.skillIds.includes(q.skillId));
  let lo = input.low, hi = input.high + 10, qs = pool.filter((q) => q.rit >= lo && q.rit <= hi);
  for (let w = 0; w < 4 && qs.length < 8; w++) { lo -= 10; hi += 10; qs = pool.filter((q) => q.rit >= lo && q.rit <= hi); }
  if (qs.length < 3) qs = pool;
  if (qs.length < 3) throw new ValidationError("Not enough questions for these skills yet (3 or more needed).");
  const a = await assignQuestions(repo, actor, { classId: input.classId, studentIds, questionIds: qs.map((q) => q.id), title: input.title ?? `MAP group · ${groupOf(input.group).name} · RIT ${input.low}–${input.high}`, exactTitle: true, track: "MAP", adaptive: { maxQuestions: Math.max(5, Math.min(input.count ?? 15, qs.length)) }, dueAt: input.dueAt ?? null }, now);
  return { assignmentId: a.assignmentId, questions: qs.length, students: studentIds.length };
}

/** For the hub: which reports a class can make now. */
export async function reportsHub(repo: Repo, actor: Actor, classId: string): Promise<{ className: string; students: { id: string; name: string; reading: number | null; language: number | null }[]; continuum: { READING: boolean; LANGUAGE: boolean } }> {
  assertCan(actor, "reports:read");
  const klass = await assertClassRead(repo, actor, classId);
  const ids = await classMembers(repo, classId);
  const [names, read, lang, cr, cl] = await Promise.all([studentNames(repo, ids), mapProfiles(repo, actor.schoolId!, ids, "READING"), mapProfiles(repo, actor.schoolId!, ids, "LANGUAGE"), hasContinuum(repo, "READING"), hasContinuum(repo, "LANGUAGE")]);
  return { className: s(klass.name), students: ids.map((id) => ({ id, name: names.get(id)?.name ?? "Student", reading: read.get(id)?.overall?.rit ?? null, language: lang.get(id)?.overall?.rit ?? null })).sort((a, b) => a.name.localeCompare(b.name)), continuum: { READING: cr, LANGUAGE: cl } };
}

export { skillsFor };
