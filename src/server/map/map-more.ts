/**
 * 🗺️ MAP, the rest of the picture:
 *   - the class matrix (each student × the six NWEA goal-area groups, band, descriptor, status; retest flag);
 *   - the printable plan document (teacher, the student, the parent);
 *   - the student's own My MAP (Fall results, goal counter, areas in the right order, the plan, MAP work);
 *   - the mid-unit check (a short set at the student's band → estimated RIT now);
 *   - linking the question bank to MAP goal areas (by CCSS standard, reviewed by the admin).
 */
import type { Repo, Row } from "../seeding/repo";
import { assertCan, ForbiddenError, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import { assertClassAccess } from "../teacher/assignments";
import { assertClassRead } from "../teacher/coordinators";
import { assignQuestions } from "../teacher/assign";
import { audit } from "../audit";
import { classMembers, studentNames } from "../insights/student-data";
import { masterSkills } from "../skills/master";
import { bandSettings, estimateRit, estimateRits, groupOf, groupPools, GROUPS, mapProfiles, orderAreas, pickBand, ritBand, type AreaProfile, type GroupKey, type MapProfile, type PlanItem, type Subject } from "./map-plan";

const s = (v: unknown) => String(v ?? "");
const time = (v: unknown) => new Date(v instanceof Date ? v.toISOString() : s(v)).getTime();
const iso = (v: unknown) => (v ? new Date(time(v)).toISOString() : null);
/** NWEA: 30%+ rapid guessing → the score may not show what the student knows; consider a retest. */
export const RETEST_PCT = 30;

// ------------------------------------------------------------------ class matrix

export interface MatrixRow { studentId: string; name: string; number: string; profile: MapProfile; estimate: number | null; retest: boolean; plan: "DRAFT" | "SENT" | null }
export interface MatrixView { className: string; grade: number; subject: Subject; rows: MatrixRow[]; noScores: { id: string; name: string }[]; groups: { key: GroupKey; name: string; icon: string; focus: number; maintain: number; extend: number }[]; canEdit: boolean }

export async function classMatrix(repo: Repo, actor: Actor, classId: string, subject: Subject, now = new Date()): Promise<MatrixView> {
  assertCan(actor, "reports:read");
  const klass = await assertClassRead(repo, actor, classId);
  let canEdit = true; try { await assertClassAccess(repo, actor, classId); } catch { canEdit = false; }
  const grade = Number((await repo.findUnique("Grade", { id: klass.gradeId }))?.level ?? 0);
  const ids = await classMembers(repo, classId);
  const [names, profiles, plans] = await Promise.all([studentNames(repo, ids), mapProfiles(repo, actor.schoolId!, ids, subject), repo.findMany("MapPlan", { classId, subject }, { select: ["studentId", "status", "term"] })]);
  const rows: MatrixRow[] = [];
  const estimates = await estimateRits(repo, await groupPools(repo, actor.schoolId!, grade), ids, subject, now);
  for (const id of ids) {
    const p = profiles.get(id)!;
    if (!p.term) continue;
    const est = estimates.get(id);
    const plan = plans.filter((x) => x.studentId === id && x.term === p.term).map((x) => s(x.status))[0] as MatrixRow["plan"] | undefined;
    rows.push({ studentId: id, name: names.get(id)?.name ?? "Student", number: names.get(id)?.number ?? "", profile: p, estimate: est?.rit ?? null, retest: (p.overall?.rapidGuessPct ?? 0) >= RETEST_PCT, plan: plan ?? null });
  }
  rows.sort((a, b) => (a.profile.overall?.rit ?? 0) - (b.profile.overall?.rit ?? 0) || a.name.localeCompare(b.name));
  const groups = GROUPS.filter((g) => g.subject === subject).map((g) => {
    const st = rows.map((r) => r.profile.areas.find((a) => a.group === g.key)?.status);
    return { key: g.key, name: g.name, icon: g.icon, focus: st.filter((x) => x === "FOCUS").length, maintain: st.filter((x) => x === "MAINTAIN").length, extend: st.filter((x) => x === "EXTEND").length };
  });
  return { className: s(klass.name), grade, subject, rows, noScores: ids.filter((id) => !profiles.get(id)?.term).map((id) => ({ id, name: names.get(id)?.name ?? "Student" })).sort((a, b) => a.name.localeCompare(b.name)), groups, canEdit };
}

// ------------------------------------------------------------------ the plan document (PDF)

export interface PlanDoc {
  id: string; studentId: string; name: string; number: string; className: string; grade: number; subject: Subject; term: string; status: "DRAFT" | "SENT"; sentAt: string | null; dueAt: string | null; note: string | null;
  profile: MapProfile; estimate: number | null;
  items: { group: GroupKey; name: string; icon: string; status: string | null; rit: number | null; band: string; skills: string[]; count: number; assignmentId: string | null; progress: number | null; done: boolean }[];
}

/** May this actor read the student's MAP plan? Teachers/admins of the class, the student, the parent. */
async function assertPlanRead(repo: Repo, actor: Actor, plan: Row): Promise<void> {
  if (s(plan.schoolId) !== s(actor.schoolId) && actor.role !== "SUPER_ADMIN") throw new ForbiddenError("Plan not found.");
  if (actor.role === "STUDENT") { if (actor.studentId !== plan.studentId || plan.status !== "SENT") throw new ForbiddenError("Plan not found."); return; }
  if (actor.role === "PARENT") { if (!actor.parentChildIds?.has(s(plan.studentId)) || plan.status !== "SENT") throw new ForbiddenError("Plan not found."); return; }
  await assertClassRead(repo, actor, s(plan.classId));
}

export async function planDoc(repo: Repo, actor: Actor, planId: string, now = new Date()): Promise<PlanDoc> {
  const r = await repo.findUnique("MapPlan", { id: planId });
  if (!r) throw new ForbiddenError("Plan not found.");
  await assertPlanRead(repo, actor, r);
  return docOf(repo, r, now);
}

async function docOf(repo: Repo, r: Row, now: Date): Promise<PlanDoc> {
  const klass = await repo.findUnique("Class", { id: r.classId });
  const grade = Number((klass ? await repo.findUnique("Grade", { id: klass.gradeId }) : null)?.level ?? 0);
  const subject = s(r.subject) as Subject, studentId = s(r.studentId);
  const [names, profiles, pk, bands] = await Promise.all([studentNames(repo, [studentId]), mapProfiles(repo, s(r.schoolId), [studentId], subject), groupPools(repo, s(r.schoolId), grade), bandSettings(repo, s(r.schoolId))]);
  const aIds = Array.isArray(r.assignmentIds) ? (r.assignmentIds as string[]) : typeof r.assignmentIds === "string" ? (JSON.parse(r.assignmentIds) as string[]) : [];
  const [assignments, rows] = aIds.length ? await Promise.all([repo.findMany("Assignment", { id: { in: aIds } }, { select: ["id", "title"] }), repo.findMany("AssignmentStudent", { assignmentId: { in: aIds }, studentId })]) : [[] as Row[], [] as Row[]];
  const items = (((typeof r.items === "string" ? JSON.parse(r.items) : r.items) ?? []) as PlanItem[]).map((it) => {
    const g = groupOf(it.group);
    const a = assignments.find((x) => s(x.title).endsWith(g.name));
    const st = a ? rows.find((x) => x.assignmentId === a.id) : undefined;
    return { group: it.group, name: g.name, icon: g.icon, status: it.status, rit: it.rit, band: ritBand(it.rit ?? it.low, bands).label, skills: it.skillIds.map((k) => pk.skills.get(k)?.name ?? "").filter(Boolean), count: it.count, assignmentId: a ? s(a.id) : null, progress: st ? Math.round(Number(st.progress) * 100) : null, done: s(st?.status) === "COMPLETED" };
  });
  const est = await estimateRit(repo, s(r.schoolId), studentId, subject, now);
  return { id: s(r.id), studentId, name: names.get(studentId)?.name ?? "Student", number: names.get(studentId)?.number ?? "", className: s(klass?.name), grade, subject, term: s(r.term), status: s(r.status) as "DRAFT" | "SENT", sentAt: iso(r.sentAt), dueAt: iso(r.dueAt), note: r.note ? s(r.note) : null, profile: profiles.get(studentId)!, estimate: est?.rit ?? null, items };
}

/** The student's latest SENT plan per subject (for the student, the parent report). */
export async function sentPlans(repo: Repo, studentId: string, now = new Date()): Promise<PlanDoc[]> {
  const rows = (await repo.findMany("MapPlan", { studentId, status: "SENT" })).sort((a, b) => time(b.sentAt) - time(a.sentAt));
  const out: PlanDoc[] = [];
  for (const subject of ["READING", "LANGUAGE"] as const) { const r = rows.find((x) => x.subject === subject); if (r) out.push(await docOf(repo, r, now)); }
  return out;
}

// ------------------------------------------------------------------ the student's My MAP

export interface MySubject {
  subject: Subject; profile: MapProfile; areas: (AreaProfile & { accuracy: number | null; next: string | null })[]; orderedBy: "MAP" | "PRACTICE";
  goal: { target: number; from: number; now: number; nowIsEstimate: boolean; left: number; reached: boolean } | null; estimate: number | null;
}
export interface MyMap { subjects: MySubject[]; plans: PlanDoc[] }

export async function myMap(repo: Repo, actor: Actor, now = new Date()): Promise<MyMap> {
  if (actor.role !== "STUDENT" || !actor.studentId) throw new ForbiddenError("Students only.");
  const studentId = actor.studentId;
  const st = await repo.findUnique("Student", { id: studentId });
  const grade = Number((st?.gradeId ? await repo.findUnique("Grade", { id: st.gradeId }) : null)?.level ?? 0);
  const [pk, mastery] = await Promise.all([groupPools(repo, actor.schoolId!, grade), repo.findMany("StudentSkillMastery", { studentId }, { select: ["skillId", "attempts", "correct", "score"] })]);
  const subjects: MySubject[] = [];
  for (const subject of ["READING", "LANGUAGE"] as const) {
    const p = (await mapProfiles(repo, actor.schoolId!, [studentId], subject)).get(studentId)!;
    const acc = new Map<GroupKey, number | null>();
    const next = new Map<GroupKey, string | null>();
    for (const g of GROUPS.filter((x) => x.subject === subject)) {
      const skills = [...pk.skills.values()].filter((k) => k.group === g.key).map((k) => k.id);
      const m = mastery.filter((x) => skills.includes(s(x.skillId)) && Number(x.attempts) > 0);
      const a = m.reduce((t, x) => t + Number(x.attempts), 0);
      acc.set(g.key, a ? Math.round((100 * m.reduce((t, x) => t + Number(x.correct), 0)) / a) : null);
      // next skill to practise: the weakest started one, else the first not started
      const score = new Map(mastery.map((x) => [s(x.skillId), Number(x.score)]));
      next.set(g.key, [...skills].sort((x, y) => (score.get(x) ?? -1) - (score.get(y) ?? -1))[0] ?? null);
    }
    const ordered = orderAreas(p, acc).map((a) => ({ ...a, accuracy: acc.get(a.group) ?? null, next: next.get(a.group) ?? null }));
    const est = p.term ? await estimateRit(repo, actor.schoolId!, studentId, subject, now) : null;
    let goal: MySubject["goal"] = null;
    if (p.fall?.projection) {
      const latest = p.overall?.rit ?? p.fall.rit;
      const useEst = est !== null && est.rit > latest;
      const cur = useEst ? est!.rit : latest;
      goal = { target: p.fall.projection, from: p.fall.rit, now: cur, nowIsEstimate: useEst, left: Math.max(0, p.fall.projection - cur), reached: cur >= p.fall.projection };
    }
    subjects.push({ subject, profile: p, areas: ordered, orderedBy: p.hasGoals ? "MAP" : "PRACTICE", goal, estimate: est?.rit ?? null });
  }
  return { subjects, plans: await sentPlans(repo, studentId, now) };
}

// ------------------------------------------------------------------ mid-unit check

/**
 * A short check (12 questions, about 4 per goal-area group of the subject) at each student's band; students of the
 * same band share one set. After it, the estimated RIT (from all careful answers) shows the growth so far.
 */
export async function sendCheck(repo: Repo, actor: Actor, classId: string, subject: Subject, input: { studentIds?: string[]; dueAt?: Date | null } = {}, now = new Date()): Promise<{ sets: number; students: number }> {
  assertCan(actor, "assignments:create");
  const klass = await assertClassAccess(repo, actor, classId);
  const grade = Number((await repo.findUnique("Grade", { id: klass.gradeId }))?.level ?? 0);
  const ids = (input.studentIds?.length ? input.studentIds : await classMembers(repo, classId));
  const members = new Set(await classMembers(repo, classId));
  const [profiles, bands, pk] = await Promise.all([mapProfiles(repo, actor.schoolId!, ids, subject), bandSettings(repo, actor.schoolId), groupPools(repo, actor.schoolId!, grade)]);
  const byBand = new Map<number, string[]>();
  const estimates = await estimateRits(repo, pk, ids, subject, now);
  for (const id of ids) {
    if (!members.has(id)) continue;
    const rit = estimates.get(id)?.rit ?? profiles.get(id)?.overall?.rit;
    if (!rit) continue;
    const b = ritBand(rit, bands);
    byBand.set(b.low, [...(byBand.get(b.low) ?? []), id]);
  }
  if (!byBand.size) throw new ValidationError("No student of this class has a MAP score for this subject yet.");
  let sets = 0, students = 0;
  for (const [low, group] of byBand) {
    const b = ritBand(low, bands), qids: string[] = [];
    for (const g of GROUPS.filter((x) => x.subject === subject)) {
      const pick = pickBand(pk.pools.get(g.key) ?? [], b.low, b.high, bands.size, null, 4);
      const step = Math.max(1, Math.floor(pick.ids.length / 4));
      qids.push(...pick.ids.filter((_, i) => i % step === 0).slice(0, 4));
    }
    if (qids.length < 5) continue;
    await assignQuestions(repo, actor, { classId, studentIds: group, questionIds: qids, title: `MAP check · ${subject === "READING" ? "Reading" : "Language Usage"}`, exactTitle: true, track: "MAP", dueAt: input.dueAt ?? null, note: "A short check: do your best, no hurry." }, now);
    sets++; students += group.length;
  }
  if (!sets) throw new ValidationError("Not enough questions linked to MAP goal areas for this grade yet.");
  await audit(repo, { actorId: actor.userId, action: "map.check.send", entityType: "Class", entityId: classId, after: { sets, students, subject }, at: now });
  return { sets, students };
}

// ------------------------------------------------------------------ question bank ↔ MAP goal areas

/** CCSS code → the platform's MAP goal area (NWEA's own alignment of the reading/language strands). */
export function areaForStandard(code: string): string | null {
  const c = code.replace(/^CCSS\.ELA-LITERACY\./i, "").toUpperCase();
  const m = c.match(/^(RL|RI|RF|L|W|SL)\.(K|\d{1,2})\.(\d{1,2})/);
  if (!m) return null;
  const n = Number(m[3]);
  switch (m[1]) {
    case "RL": return n === 4 ? "VOCAB" : n <= 3 ? "LIT_THEME" : "LIT_STRUCTURE";
    case "RI": return n === 4 ? "VOCAB" : n <= 3 ? "INFO_CENTRAL_IDEA" : "INFO_STRUCTURE";
    case "RF": return n === 3 ? "VOCAB" : null;
    case "L": return n === 1 ? "LANG_GRAMMAR" : n === 2 ? "LANG_MECHANICS" : n === 3 ? "WRITING_STYLE" : "VOCAB";
    case "W": return n <= 3 ? "WRITING_ORG" : n <= 6 ? "WRITING_STYLE" : "WRITING_SUPPORT";
    default: return null;
  }
}

export interface LinkRow { familyId: string; family: string; skills: string[]; grades: number[]; questions: number; areaCode: string | null; suggested: string | null; standard: string | null }

/** Every skill family of the school's skills with its MAP goal area (or none) and the suggestion from its standard. */
export async function mapLinks(repo: Repo, actor: Actor): Promise<{ rows: LinkRow[]; areas: { code: string; name: string; group: string }[] }> {
  assertCan(actor, "curriculum:edit");
  const [fams, areas] = await Promise.all([repo.findMany("SkillFamily", {}), repo.findMany("MapGoalArea", {}, { select: ["id", "code", "name"] })]);
  const master = await masterSkills(repo, actor.schoolId!);
  const skills = master.length ? await repo.findMany("Skill", { id: { in: master.map((k) => k.id) } }, { select: ["id", "name", "familyId"] }) : [];
  const gradeOf = new Map(master.map((k) => [k.id, k.grade]));
  const mySkills = skills;
  const ids = mySkills.map((k) => s(k.id));
  const [links, qs] = ids.length ? await Promise.all([repo.findMany("SkillStandard", { skillId: { in: ids } }), repo.findMany("Question", { skillId: { in: ids }, deletedAt: null }, { select: ["skillId"] })]) : [[] as Row[], [] as Row[]];
  const stds = links.length ? await repo.findMany("Standard", { id: { in: [...new Set(links.map((l) => s(l.standardId)))] } }, { select: ["id", "code"] }) : [];
  const rows: LinkRow[] = [];
  for (const f of fams) {
    const ks = mySkills.filter((k) => k.familyId === f.id);
    if (!ks.length) continue;
    const kIds = ks.map((k) => s(k.id));
    const fl = links.filter((l) => kIds.includes(s(l.skillId))).sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary));
    const codes = fl.map((l) => s(stds.find((x) => x.id === l.standardId)?.code)).filter(Boolean);
    const suggested = codes.map(areaForStandard).find(Boolean) ?? null;
    rows.push({
      familyId: s(f.id), family: s(f.name), skills: [...new Set(ks.map((k) => s(k.name)))].slice(0, 4),
      grades: [...new Set(ks.map((k) => Number(gradeOf.get(s(k.id)) ?? 0)).filter(Boolean))].sort(),
      questions: qs.filter((q) => kIds.includes(s(q.skillId))).length, areaCode: s(areas.find((a) => a.id === f.mapGoalAreaId)?.code) || null, suggested, standard: codes[0]?.replace(/^CCSS\.ELA-LITERACY\./i, "") ?? null,
    });
  }
  rows.sort((a, b) => Number(Boolean(a.areaCode)) - Number(Boolean(b.areaCode)) || b.questions - a.questions || a.family.localeCompare(b.family));
  return { rows, areas: areas.map((a) => ({ code: s(a.code), name: s(a.name), group: GROUPS.find((g) => g.codes.includes(s(a.code)))?.name ?? "" })).sort((a, b) => a.group.localeCompare(b.group) || a.name.localeCompare(b.name)) };
}

/** Admin sets (or clears) the MAP goal area of a skill family: its questions then count for that area. */
export async function linkFamily(repo: Repo, actor: Actor, familyId: string, areaCode: string | null, now = new Date()): Promise<void> {
  assertCan(actor, "curriculum:edit");
  const f = await repo.findUnique("SkillFamily", { id: familyId });
  if (!f) throw new ValidationError("Skill not found.");
  const area = areaCode ? await repo.findUnique("MapGoalArea", { code: areaCode }) : null;
  if (areaCode && !area) throw new ValidationError("Unknown MAP goal area.");
  await repo.updateMany("SkillFamily", { id: familyId }, { mapGoalAreaId: area ? area.id : null });
  await audit(repo, { actorId: actor.userId, action: "map.link", entityType: "SkillFamily", entityId: familyId, before: { mapGoalAreaId: f.mapGoalAreaId ?? null }, after: { area: areaCode }, at: now });
}

/** Applies every suggestion to the skills that have no MAP goal area yet. */
export async function applyLinkSuggestions(repo: Repo, actor: Actor, now = new Date()): Promise<number> {
  const { rows } = await mapLinks(repo, actor);
  let n = 0;
  for (const r of rows) if (!r.areaCode && r.suggested) { await linkFamily(repo, actor, r.familyId, r.suggested, now); n++; }
  return n;
}
