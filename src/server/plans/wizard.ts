/**
 * 🗂️ Plans — ONE place for every plan (UI reorg, Phase 4).
 *
 *   Step 1 Who   → one student, a group (chosen students) or the whole class (the teacher's OWN class)
 *   Step 2 Type  → MAP (Learning Continuum, from MAP scores) · NAFS (general prep plan from the NAFS areas, or
 *                  personalized after a NAFS practice test) · Curriculum (skills of a unit's lessons) · RTI (weekly
 *                  skills for students in Tier 2/3) · Custom (any skills, any grade)
 *   Step 3       → preview, add / remove skills, then Assign
 *
 * Reuses what exists: each skill becomes a normal skill assignment (assignSkill → My Work, adaptive practice at the
 * student's level, statuses, notifications, reports) with the plan's source as Assignment.track; the plan itself is
 * a SkillPlan (kind MAP / NAFS / UNIT / RTI / CUSTOM) whose items point at those assignments, so it shows in the
 * student's My Plans (studentSkillPlans) and the teacher's plan list. Per-student plans (MAP, RTI, personal NAFS)
 * assign each skill only to the students who need it: one plan, each student sees their own items.
 *
 * Access: the class must be the teacher's own (assertClassAccess; admin any class of the school); skills may come
 * from ANY grade of the school.
 */
import { skillsMatching } from "../questions/skill-questions";
import type { Repo, Row } from "../seeding/repo";
import { audit } from "../audit";
import { assertCan, ForbiddenError, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import { isGrammarCode } from "../grammar/grammar";
import { accessibleClasses, assertSchoolSkill, assignSkill, NO_CURRICULUM_MESSAGE, type Track } from "../teacher/assign";
import { assertClassAccess } from "../teacher/assignments";
import { autoItems, bandSettings, groupPools, mapProfiles, type GroupKey, type Subject } from "../map/map-plan";
import { continuumFor, continuumIndex } from "../map/continuum";
import { studentSkillPlans } from "../curriculum-map/plans";
import { assignedSkills } from "../student/assigned";
import { tagProgram, type Program } from "./program";
import { nafsAreaList as sharedNafsAreaList, nafsAreaSkills, publishedQuestionCounts } from "./nafs-areas";
import { SOURCE_LABEL, sourceOfPlanKind, sourceOfWork, type SourceKey, type SourceLabel } from "../../lib/source-tags";

const s = (v: unknown) => String(v ?? "");

export type PlanType = "MAP" | "NAFS" | "CURRICULUM" | "RTI" | "CUSTOM";
export const PLAN_TYPES: { type: PlanType; label: string; icon: string; text: string }[] = [
  { type: "MAP", label: "MAP Plan", icon: "🗺️", text: "Built from each student's MAP scores (Learning Continuum)." },
  { type: "NAFS", label: "NAFS Plan", icon: "🇸🇦", text: "General NAFS practice from the NAFS areas." },
  { type: "CURRICULUM", label: "Curriculum Plan", icon: "📘", text: "The skills of a unit's lessons." },
  { type: "RTI", label: "RTI Plan", icon: "🧩", text: "This week's skills for students in RTI (Tier 2 and 3)." },
  { type: "CUSTOM", label: "Custom", icon: "✏️", text: "Pick any skills, from any grade." },
];
export const planTypeOf = (v: unknown): PlanType | null => (PLAN_TYPES.some((t) => t.type === v) ? (v as PlanType) : null);
const KIND: Record<PlanType, string> = { MAP: "MAP", NAFS: "NAFS", CURRICULUM: "UNIT", RTI: "RTI", CUSTOM: "CUSTOM" };
const LABEL: Record<PlanType, string> = { MAP: "MAP Plan", NAFS: "NAFS Plan", CURRICULUM: "Curriculum Plan", RTI: "RTI Plan", CUSTOM: "Custom Plan" };
/** The program a plan type is sent under (Assignment.program); a custom plan belongs to no program. */
const PROGRAM_OF_TYPE: Record<PlanType, Program | null> = { MAP: "MAP", NAFS: "NAFS", CURRICULUM: "CURRICULUM", RTI: "RTI", CUSTOM: null };
/** most skills one plan may assign at once (each is one assignment) */
export const MAX_PLAN_SKILLS = 40;

// ------------------------------------------------------------------ step 1: classes, students, grades

export interface WizardClass { id: string; name: string; grade: number; gradeName: string; students: { id: string; name: string }[]; noCurriculum: boolean }
export interface WizardGrade { level: number; name: string; skills: number; curriculumIds: string[] }
export interface WizardContext { classes: WizardClass[]; klass: WizardClass | null; grades: WizardGrade[]; message: string | null }

async function names(repo: Repo, studentIds: string[]): Promise<Map<string, string>> {
  if (!studentIds.length) return new Map();
  const st = await repo.findMany("Student", { id: { in: studentIds } }, { select: ["id", "userId"] });
  const users = st.length ? await repo.findMany("User", { id: { in: st.map((x) => x.userId) } }, { select: ["id", "displayName"] }) : [];
  const nameOf = new Map(users.map((u) => [s(u.id), s(u.displayName)]));
  return new Map(st.map((x) => [s(x.id), nameOf.get(s(x.userId)) || "Student"]));
}

/** Every grade of the school with its number of active skills (content is open to every teacher). */
export async function schoolGrades(repo: Repo, schoolId: unknown): Promise<WizardGrade[]> {
  const grades = (await repo.findMany("Grade", { schoolId }, { select: ["id", "level", "name"] })).sort((a, b) => Number(a.level) - Number(b.level));
  const curs = grades.length ? await repo.findMany("Curriculum", { gradeId: { in: grades.map((g) => g.id) }, isActive: true }, { select: ["id", "gradeId"] }) : [];
  const count = new Map<string, number>();
  if (curs.length) for (const k of await repo.findMany("Skill", { curriculumId: { in: curs.map((c) => c.id) }, deletedAt: null, isActive: true }, { select: ["curriculumId"] })) count.set(s(k.curriculumId), (count.get(s(k.curriculumId)) ?? 0) + 1);
  return grades.map((g) => {
    const mine = curs.filter((c) => s(c.gradeId) === s(g.id)).map((c) => s(c.id));
    return { level: Number(g.level), name: s(g.name), curriculumIds: mine, skills: mine.reduce((n, id) => n + (count.get(id) ?? 0), 0) };
  });
}

/** The teacher's own classes (admin: every class of the school) with their students; the chosen class first. */
export async function plansWizardContext(repo: Repo, actor: Actor, classId?: string | null): Promise<WizardContext> {
  assertCan(actor, "assignments:read");
  const classes = await accessibleClasses(repo, actor);
  const grades = await schoolGrades(repo, actor.schoolId);
  const gradeRows = classes.length ? await repo.findMany("Grade", { id: { in: [...new Set(classes.map((c) => s(c.gradeId)))] } }, { select: ["id", "level", "name"] }) : [];
  const levelOf = new Map(gradeRows.map((g) => [s(g.id), Number(g.level)]));
  const nameOfGrade = new Map(gradeRows.map((g) => [s(g.id), s(g.name)]));
  const sorted = [...classes].sort((a, b) => (levelOf.get(s(a.gradeId)) ?? 0) - (levelOf.get(s(b.gradeId)) ?? 0) || s(a.name).localeCompare(s(b.name)));
  const chosen = (classId ? sorted.find((c) => s(c.id) === classId) : null) ?? sorted[0] ?? null;
  if (classId && !sorted.some((c) => s(c.id) === classId)) throw new ForbiddenError("You do not teach this class.");
  const out: WizardClass[] = sorted.map((c) => ({ id: s(c.id), name: s(c.name), grade: levelOf.get(s(c.gradeId)) ?? 0, gradeName: nameOfGrade.get(s(c.gradeId)) ?? "", students: [], noCurriculum: (grades.find((g) => g.level === levelOf.get(s(c.gradeId)))?.skills ?? 0) === 0 }));
  let klass: WizardClass | null = null;
  if (chosen) {
    const members = await repo.findMany("ClassMembership", { classId: chosen.id, leftAt: null }, { select: ["studentId"] });
    const nm = await names(repo, members.map((m) => s(m.studentId)));
    klass = out.find((c) => c.id === s(chosen.id))!;
    klass.students = [...nm].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }
  return { classes: out, klass, grades, message: klass?.noCurriculum ? NO_CURRICULUM_MESSAGE : null };
}

/** Search the master skills list of EVERY grade of the school (one result per skill, with its grade). */
export async function searchSkillsAnyGrade(repo: Repo, actor: Actor, q: string, limit = 30): Promise<{ id: string; name: string; grade: number; grammar: boolean; questions: number }[]> {
  assertCan(actor, "curriculum:read");
  const text = s(q).replace(/\s+/g, " ").trim().slice(0, 80);
  if (!text || !actor.schoolId) return [];
  // ONE question bank: the shared search (skill names, codes and the questions' text; one row per skill family,
  // pooled counts), never limited to the class's grade
  const hits = await skillsMatching(repo, s(actor.schoolId), text);
  return hits.slice(0, Math.max(1, Math.min(60, limit))).map((k) => ({ id: k.id, name: k.name, grade: k.grade, grammar: (k.familyKey ?? "").startsWith("grammar:"), questions: k.questions }))
    .sort((a, b) => Number(b.questions > 0) - Number(a.questions > 0) || a.name.localeCompare(b.name));
}

// ------------------------------------------------------------------ step 2/3: the proposal

export interface ProposedSkill { id: string; name: string; code: string; grade: number; grammar: boolean; track: Track; reason: string; studentIds: string[]; questions: number }
export interface PlanProposal {
  type: PlanType; classId: string; className: string; title: string;
  /** who the plan is for (after step 1) */
  students: { id: string; name: string }[];
  skills: ProposedSkill[];
  /** e.g. students without MAP scores, students not in RTI */
  notes: string[];
  /** the grade the skills were taken from (Curriculum / NAFS), and the units of that grade (Curriculum) */
  skillGrade: number | null;
  units: { id: string; number: number; title: string }[];
  unitId: string | null;
}

export interface ProposeInput {
  classId: string;
  /** empty / undefined = the whole class */
  studentIds?: string[];
  type: PlanType;
  /** Curriculum / NAFS / MAP: take the skills from this grade (default: the class's grade, or the nearest grade with a curriculum) */
  grade?: number | null;
  /** Curriculum: the unit (default the first) */
  unitId?: string | null;
  /** MAP: Reading (default) or Language Usage */
  subject?: Subject;
  /** NAFS: the areas (default all) and skills per area (default 2) */
  areas?: string[] | null;
  perArea?: number;
  /** MAP: skills per focus area (default 2) */
  perGroup?: number;
  /** Custom: the chosen skills */
  skillIds?: string[];
}

/** The grade to take skills from: the one asked for; else the class's grade if it has skills; else the nearest grade that has. */
function pickGrade(grades: WizardGrade[], classGrade: number, asked?: number | null): WizardGrade | null {
  if (asked !== undefined && asked !== null) { const g = grades.find((x) => x.level === Number(asked)); if (g) return g; }
  const own = grades.find((x) => x.level === classGrade && x.skills > 0);
  if (own) return own;
  const withSkills = grades.filter((x) => x.skills > 0).sort((a, b) => Math.abs(a.level - classGrade) - Math.abs(b.level - classGrade) || b.level - a.level);
  return withSkills[0] ?? null;
}

async function classAndStudents(repo: Repo, actor: Actor, classId: string, studentIds?: string[]): Promise<{ klass: Row; grade: number; recipients: string[]; all: string[]; nameOf: Map<string, string> }> {
  if (!classId) throw new ValidationError("Choose a class.");
  const klass = await assertClassAccess(repo, actor, classId);
  const members = (await repo.findMany("ClassMembership", { classId: klass.id, leftAt: null }, { select: ["studentId"] })).map((m) => s(m.studentId));
  const chosen = [...new Set((studentIds ?? []).filter(Boolean))];
  for (const id of chosen) if (!members.includes(id)) throw new ForbiddenError("You can only assign work to students in this class.");
  const recipients = chosen.length ? chosen : members;
  if (!recipients.length) throw new ValidationError("This class has no students yet.");
  const grade = Number((await repo.findUnique("Grade", { id: klass.gradeId }))?.level ?? 0);
  return { klass, grade, recipients, all: members, nameOf: await names(repo, recipients) };
}

/** Skill rows (any grade of the school) with grade, grammar flag and question counts. */
async function skillRows(repo: Repo, schoolId: unknown, skillIds: string[]): Promise<Map<string, { id: string; name: string; code: string; grade: number; grammar: boolean; questions: number }>> {
  const ids = [...new Set(skillIds.filter(Boolean))];
  const out = new Map<string, { id: string; name: string; code: string; grade: number; grammar: boolean; questions: number }>();
  if (!ids.length) return out;
  const skills = await repo.findMany("Skill", { id: { in: ids } }, { select: ["id", "name", "code", "curriculumId", "deletedAt", "isActive"] });
  const curs = skills.length ? await repo.findMany("Curriculum", { id: { in: [...new Set(skills.map((k) => s(k.curriculumId)))] } }, { select: ["id", "gradeId"] }) : [];
  const grades = curs.length ? await repo.findMany("Grade", { id: { in: [...new Set(curs.map((c) => s(c.gradeId)))] } }, { select: ["id", "level", "schoolId"] }) : [];
  const counts = await publishedQuestionCounts(repo, s(schoolId), ids);
  for (const k of skills) {
    if (k.deletedAt || k.isActive === false) continue;
    const g = grades.find((x) => x.id === curs.find((c) => c.id === k.curriculumId)?.gradeId);
    if (!g || s(g.schoolId) !== s(schoolId)) continue; // another school's skill: never offered
    out.set(s(k.id), { id: s(k.id), name: s(k.name), code: s(k.code), grade: Number(g.level), grammar: isGrammarCode(k.code), questions: counts.get(s(k.id)) ?? 0 });
  }
  return out;
}

/** Skills by id (this school, any grade) for the wizard's “added skills” list. */
export async function skillsByIds(repo: Repo, actor: Actor, skillIds: string[]): Promise<{ id: string; name: string; grade: number; grammar: boolean; questions: number }[]> {
  assertCan(actor, "curriculum:read");
  const rows = await skillRows(repo, actor.schoolId, skillIds.slice(0, MAX_PLAN_SKILLS));
  return [...rows.values()].map((k) => ({ id: k.id, name: k.name, grade: k.grade, grammar: k.grammar, questions: k.questions }));
}

/** The source tag of a skill in a plan: a grammar skill in a Curriculum / Custom plan is Grammar work. */
function trackFor(type: PlanType, grammar: boolean): Track {
  if (type === "MAP") return "MAP";
  if (type === "NAFS") return "NAFS";
  if (type === "RTI") return "RTI";
  if (grammar) return "GRAMMAR";
  return type === "CUSTOM" ? "CUSTOM" : "CURRICULUM";
}

/** What the plan would assign (changes nothing). Recomputed on the server again when the teacher presses Assign. */
export async function proposePlan(repo: Repo, actor: Actor, input: ProposeInput): Promise<PlanProposal> {
  assertCan(actor, "assignments:create");
  const type = planTypeOf(input.type);
  if (!type) throw new ValidationError("Choose a plan type.");
  const { klass, grade, recipients, nameOf } = await classAndStudents(repo, actor, input.classId, input.studentIds);
  const grades = await schoolGrades(repo, klass.schoolId);
  const notes: string[] = [];
  const wanted = new Map<string, { studentIds: Set<string>; reason: string }>();
  const want = (skillId: string, studentIds: string[], reason: string) => {
    const w = wanted.get(skillId) ?? { studentIds: new Set<string>(), reason };
    for (const id of studentIds) w.studentIds.add(id);
    wanted.set(skillId, w);
  };
  let skillGrade: number | null = null;
  let units: PlanProposal["units"] = [];
  let unitId: string | null = null;
  const ownGrade = grades.find((g) => g.level === grade);
  if (!ownGrade || ownGrade.skills === 0) notes.push(`${NO_CURRICULUM_MESSAGE}.`);

  if (type === "CUSTOM") {
    for (const id of (input.skillIds ?? []).slice(0, MAX_PLAN_SKILLS)) want(id, recipients, "Chosen by the teacher");
  } else if (type === "CURRICULUM") {
    const g = pickGrade(grades, grade, input.grade);
    if (!g) notes.push("No grade has a curriculum yet. Use Custom to pick skills.");
    else {
      skillGrade = g.level;
      const unitRows = g.curriculumIds.length ? (await repo.findMany("Unit", { curriculumId: { in: g.curriculumIds }, deletedAt: null })).filter((u) => u.isActive !== false).sort((a, b) => Number(a.number) - Number(b.number)) : [];
      units = unitRows.map((u) => ({ id: s(u.id), number: Number(u.number), title: s(u.title) }));
      const unit = unitRows.find((u) => s(u.id) === input.unitId) ?? unitRows[0];
      if (!unit) notes.push(`Grade ${g.level} has no units yet.`);
      else {
        unitId = s(unit.id);
        const links = (await repo.findMany("UnitSkill", { unitId: unit.id })).sort((a, b) => Number(a.order) - Number(b.order));
        for (const l of links) want(s(l.skillId), recipients, `Unit ${s(unit.number)}: ${s(unit.title)}`);
      }
    }
  } else if (type === "NAFS") {
    const g = pickGrade(grades, grade, input.grade);
    if (!g) notes.push("No grade has skills yet. Use Custom to pick skills.");
    else {
      skillGrade = g.level;
      const per = Math.max(1, Math.min(5, Math.round(input.perArea ?? 2)));
      for (const a of await nafsAreaSkills(repo, s(klass.schoolId), g.curriculumIds, input.areas)) {
        if (!a.skills.length) { notes.push(`NAFS area “${a.name}” has no Grade ${g.level} skill yet.`); continue; }
        for (const k of a.skills.slice(0, per)) want(k.id, recipients, `NAFS: ${a.name}`);
      }
    }
  } else if (type === "MAP") {
    const subject: Subject = input.subject === "LANGUAGE" ? "LANGUAGE" : "READING";
    const g = pickGrade(grades, grade, input.grade);
    if (!g) notes.push("No grade has skills yet. Use Custom to pick skills.");
    else {
      skillGrade = g.level;
      const per = Math.max(1, Math.min(5, Math.round(input.perGroup ?? 2)));
      const profiles = await mapProfiles(repo, s(klass.schoolId), recipients, subject);
      const bands = await bandSettings(repo, s(klass.schoolId));
      const [pk, ix, mastery] = await Promise.all([
        groupPools(repo, s(klass.schoolId), g.level),
        continuumIndex(repo, s(klass.schoolId), g.level, subject),
        repo.findMany("StudentSkillMastery", { studentId: { in: recipients } }, { select: ["studentId", "skillId", "score"] }),
      ]);
      const poolSkills = (grp: GroupKey) => [...new Set((pk.pools.get(grp) ?? []).map((q) => q.skillId))];
      const noScores: string[] = [];
      for (const id of recipients) {
        const p = profiles.get(id);
        if (!p?.term) { noScores.push(nameOf.get(id) ?? "Student"); continue; }
        const items = autoItems(p, new Map(), bands);
        const m = new Map(mastery.filter((x) => s(x.studentId) === id).map((x) => [s(x.skillId), Number(x.score)]));
        for (const it of items) {
          const rit = it.rit ?? it.low;
          // Learning Continuum first: the skills of the statements to Develop at this RIT, then to Reinforce
          const view = continuumFor(ix, it.group, rit);
          const fromContinuum = [...(view.develop?.statements ?? []), ...(view.reinforce?.statements ?? [])].flatMap((st) => st.skills.map((k) => k.id));
          // then the area's skills with questions, weakest mastery first
          const fromPool = poolSkills(it.group).sort((a, b) => (m.get(a) ?? -1) - (m.get(b) ?? -1));
          const picked = [...new Set([...fromContinuum, ...fromPool])].slice(0, per);
          for (const k of picked) want(k, [id], `MAP: ${groupName(it.group)} (RIT ${rit})`);
        }
      }
      if (noScores.length) notes.push(`No MAP ${subject === "READING" ? "Reading" : "Language Usage"} scores yet (left out): ${noScores.join(", ")}. Upload MAP scores first.`);
    }
  } else if (type === "RTI") {
    const tiers = await repo.findMany("StudentTier", { studentId: { in: recipients } }, { select: ["studentId", "tier", "focusSkillId"] });
    const inRti = tiers.filter((t) => Number(t.tier) >= 2);
    const out = recipients.filter((id) => !inRti.some((t) => s(t.studentId) === id));
    if (out.length) notes.push(`Not in RTI (left out): ${out.map((id) => nameOf.get(id) ?? "Student").join(", ")}.`);
    const noFocus = inRti.filter((t) => !t.focusSkillId).map((t) => s(t.studentId));
    const noData: string[] = [];
    const weakest = noFocus.length ? await repo.findMany("StudentSkillMastery", { studentId: { in: noFocus } }, { select: ["studentId", "skillId", "score", "attempts"] }) : [];
    for (const t of inRti) {
      const id = s(t.studentId);
      if (t.focusSkillId) { want(s(t.focusSkillId), [id], `RTI Tier ${t.tier}: focus skill`); continue; }
      const w = weakest.filter((x) => s(x.studentId) === id && Number(x.attempts) > 0).sort((a, b) => Number(a.score) - Number(b.score))[0];
      if (w) want(s(w.skillId), [id], `RTI Tier ${t.tier}: weakest skill`);
      else noData.push(id);
    }
    if (noData.length) {
      // no focus skill and no practice yet: the core reading skills (whole bank, any grade) as a start
      for (const q of ["central idea", "make inferences", "context clues"]) {
        const hit = (await skillsMatching(repo, s(klass.schoolId), q)).find((k) => k.questions > 0);
        if (hit) want(hit.id, noData, "RTI: a core reading skill to start (no practice data yet)");
      }
      notes.push(`${noData.length} student(s) in RTI have no focus skill or practice yet: the core reading skills are suggested. Change them if you like.`);
    }
  }

  const rows = await skillRows(repo, klass.schoolId, [...wanted.keys()]);
  const skills: ProposedSkill[] = [...wanted].filter(([id]) => rows.has(id)).map(([id, w]) => {
    const k = rows.get(id)!;
    return { ...k, track: trackFor(type, k.grammar), reason: w.reason, studentIds: [...w.studentIds].sort() };
  }).slice(0, MAX_PLAN_SKILLS);
  const className = s(klass.name);
  return {
    type, classId: s(klass.id), className,
    title: `${LABEL[type]} · ${className}`,
    students: recipients.map((id) => ({ id, name: nameOf.get(id) ?? "Student" })).sort((a, b) => a.name.localeCompare(b.name)),
    skills, notes, skillGrade, units, unitId,
  };
}

const GROUP_NAME: Record<string, string> = { LIT: "Literary Text", INFO: "Informational Text", VOCAB: "Vocabulary", GRAMMAR: "Grammar and Usage", MECH: "Mechanics", WRITING: "Writing" };
const groupName = (g: string) => GROUP_NAME[g] ?? g;

// ------------------------------------------------------------------ assign

export interface AssignPlanInput extends ProposeInput {
  title?: string | null;
  /** the proposed skills to keep (null/undefined = all) */
  keep?: string[] | null;
  /** extra skills (any grade) for every student of the plan */
  add?: string[];
  dueAt?: Date | null;
  startAt?: Date | null;
  note?: string | null;
}

export interface AssignPlanResult { planId: string; skills: number; students: number; assignmentIds: string[]; notes: string[] }

/** Builds the plan again on the server, applies the teacher's edits and assigns it. */
export async function assignPlan(repo: Repo, actor: Actor, input: AssignPlanInput, now = new Date()): Promise<AssignPlanResult> {
  assertCan(actor, "assignments:create");
  const p = await proposePlan(repo, actor, input);
  const keep = input.keep ? new Set(input.keep.map(String)) : null;
  const skills = p.skills.filter((k) => !keep || keep.has(k.id));
  const extra = [...new Set((input.add ?? []).map(String).filter(Boolean))].filter((id) => !skills.some((k) => k.id === id));
  if (extra.length) {
    for (const id of extra) await assertSchoolSkill(repo, actor.schoolId, id); // any grade of THIS school
    const rows = await skillRows(repo, actor.schoolId, extra);
    for (const id of extra) {
      const k = rows.get(id);
      if (k) skills.push({ ...k, track: trackFor(p.type, k.grammar), reason: "Added by the teacher", studentIds: p.students.map((x) => x.id) });
    }
  }
  // a skill with no questions never goes into a plan: it is left out, and the teacher is told
  if (skills.length) {
    const { countQuestionsOfSkills } = await import("../questions/skill-questions");
    const counts = await countQuestionsOfSkills(repo, s(actor.schoolId), skills.map((k) => k.id));
    const empty = skills.filter((k) => !(counts.get(k.id) ?? 0));
    for (const k of empty) { p.notes.push(`${k.name}: This skill has no questions yet.`); skills.splice(skills.indexOf(k), 1); }
  }
  if (!skills.length) throw new ValidationError(p.notes.length ? `Nothing to assign. ${p.notes.join(" ")}` : "Choose at least one skill.");
  if (skills.length > MAX_PLAN_SKILLS) throw new ValidationError(`A plan can have at most ${MAX_PLAN_SKILLS} skills.`);
  const klass = await assertClassAccess(repo, actor, p.classId);
  const grade = Number((await repo.findUnique("Grade", { id: klass.gradeId }))?.level ?? 0);
  const classSize = await repo.count("ClassMembership", { classId: klass.id, leftAt: null });
  const title = (s(input.title).replace(/\s+/g, " ").trim() || p.title).slice(0, 191);
  const note = s(input.note).replace(/\s+/g, " ").trim().slice(0, 1000) || null;
  const plan = await repo.create("SkillPlan", { schoolId: klass.schoolId, classId: klass.id, title, kind: KIND[p.type], targetCorrect: null, gradeLevel: grade, note, createdById: actor.userId, createdAt: now });
  const assignmentIds: string[] = [];
  const students = new Set<string>();
  try {
    let order = 0;
    for (const k of skills) {
      const whole = k.studentIds.length === classSize;
      const r = await assignSkill(repo, actor, { classId: p.classId, skillId: k.id, studentIds: whole ? undefined : k.studentIds, track: k.track, dueAt: input.dueAt ?? null, startAt: input.startAt ?? null, note: note ?? `${LABEL[p.type]}: ${title}` }, now);
      assignmentIds.push(r.assignmentId);
      for (const id of k.studentIds) students.add(id);
      await repo.create("SkillPlanItem", { planId: plan.id, code: k.code.slice(0, 80), label: `${LABEL[p.type]} · Grade ${k.grade} · ${k.name}`.slice(0, 255), assignmentIds: [r.assignmentId], order: order++ });
    }
    await tagProgram(repo, assignmentIds, PROGRAM_OF_TYPE[p.type]);
  } catch (e) {
    // nothing half-made: remove the plan and the assignments made so far
    if (assignmentIds.length) await repo.updateMany("Assignment", { id: { in: assignmentIds } }, { deletedAt: now });
    await repo.deleteMany("SkillPlanItem", { planId: plan.id });
    await repo.deleteMany("SkillPlan", { id: plan.id });
    throw e;
  }
  await audit(repo, { actorId: actor.userId, action: "plan.assign", entityType: "SkillPlan", entityId: s(plan.id), after: { type: p.type, classId: p.classId, skills: skills.length, students: students.size }, at: now });
  return { planId: s(plan.id), skills: skills.length, students: students.size, assignmentIds, notes: p.notes };
}

// ------------------------------------------------------------------ NAFS (b): personalized after a practice test

export interface SkillResult { studentId: string; skillId: string; correct: number; total: number }

/**
 * NAFS Plan (b): after a NAFS practice test, each student gets the skills they missed (below `threshold` %, default
 * 70) as a personal NAFS plan in My Plans and My Work (tag NAFS). Hook for the Assessments phase: call it after a test
 * is marked. `testId` is the test's Assignment id or Assessment id. Results are read from the answers given for that
 * test (QuestionAttempt.skillId), or passed in as generic per-skill results.
 * `testId` may also be a teacher-built test (Assessments, TeacherTest id): all its level versions count as one test.
 * Only the class's teacher (or an admin) may do it; students outside the test's class are ignored.
 */
export async function personalizeNafsPlanFromResults(repo: Repo, actor: Actor, input: { testId: string; results?: SkillResult[]; threshold?: number; dueAt?: Date | null }, now = new Date()): Promise<{ plans: { classId: string; planId: string; skills: number; students: number }[]; studentsWithGaps: number }> {
  assertCan(actor, "assignments:create");
  const testId = s(input.testId);
  if (!testId) throw new ValidationError("Choose a test.");
  // the test: one Assignment, the Assignments of one Assessment, or the Assignments of a teacher-built test
  // (Assessments: one per level version) — grouped by class so each class gets ONE personal NAFS plan
  const byId = await repo.findUnique("Assignment", { id: testId });
  let tests = byId && !byId.deletedAt ? [byId] : await repo.findMany("Assignment", { assessmentId: testId, deletedAt: null });
  const built = tests.length ? null : await repo.findUnique("TeacherTest", { id: testId });
  if (built && !built.deletedAt && s(built.schoolId) === s(actor.schoolId)) tests = await repo.findMany("Assignment", { testId, deletedAt: null });
  if (!tests.length) throw new ValidationError("Test not found.");
  const threshold = Math.max(1, Math.min(100, input.threshold ?? 70));
  const out: { classId: string; planId: string; skills: number; students: number }[] = [];
  let withGaps = 0;
  const byClass = new Map<string, Row[]>();
  for (const t of tests) byClass.set(s(t.classId), [...(byClass.get(s(t.classId)) ?? []), t]);
  for (const [classId, sets] of byClass) {
    await assertClassAccess(repo, actor, classId); // own class only
    const setIds = sets.map((t) => s(t.id));
    const testTitle = s(built?.title) || s(sets[0].title);
    const takers = new Set((await repo.findMany("AssignmentStudent", { assignmentId: { in: setIds } }, { select: ["studentId"] })).map((r) => s(r.studentId)));
    let results: SkillResult[];
    if (input.results) results = input.results.filter((r) => takers.has(s(r.studentId)));
    else {
      const sessions = await repo.findMany("PracticeSession", { assignmentId: { in: setIds } }, { select: ["id", "studentId"] });
      const studentOf = new Map(sessions.map((x) => [s(x.id), s(x.studentId)]));
      const attempts: Row[] = [];
      const sIds = sessions.map((x) => s(x.id));
      for (let i = 0; i < sIds.length; i += 300) attempts.push(...(await repo.findMany("QuestionAttempt", { sessionId: { in: sIds.slice(i, i + 300) } }, { select: ["sessionId", "skillId", "isCorrect"] })));
      const agg = new Map<string, SkillResult>();
      for (const a of attempts) {
        const st = studentOf.get(s(a.sessionId));
        if (!st || !takers.has(st) || !a.skillId) continue;
        const key = `${st}|${s(a.skillId)}`;
        const r = agg.get(key) ?? { studentId: st, skillId: s(a.skillId), correct: 0, total: 0 };
        r.total++; if (a.isCorrect) r.correct++;
        agg.set(key, r);
      }
      results = [...agg.values()];
    }
    const missed = new Map<string, string[]>(); // skill → students
    const gapStudents = new Set<string>();
    for (const r of results) {
      if (!(Number(r.total) > 0) || (100 * Number(r.correct)) / Number(r.total) >= threshold) continue;
      missed.set(s(r.skillId), [...(missed.get(s(r.skillId)) ?? []), s(r.studentId)]);
      gapStudents.add(s(r.studentId));
    }
    if (!missed.size) continue;
    withGaps += gapStudents.size;
    const rows = await skillRows(repo, actor.schoolId, [...missed.keys()]);
    const skillIds = [...missed.keys()].filter((id) => rows.has(id)).slice(0, MAX_PLAN_SKILLS);
    if (!skillIds.length) continue;
    const klass = await assertClassAccess(repo, actor, classId);
    const grade = Number((await repo.findUnique("Grade", { id: klass.gradeId }))?.level ?? 0);
    const title = `NAFS Plan (personal) · ${testTitle}`.slice(0, 191);
    const plan = await repo.create("SkillPlan", { schoolId: klass.schoolId, classId: klass.id, title, kind: "NAFS", targetCorrect: null, gradeLevel: grade, note: `Skills missed in ${testTitle}`.slice(0, 1000), createdById: actor.userId, createdAt: now });
    let order = 0;
    const students = new Set<string>();
    const sent: string[] = [];
    for (const id of skillIds) {
      const k = rows.get(id)!;
      const who = [...new Set(missed.get(id)!)];
      const r = await assignSkill(repo, actor, { classId: s(klass.id), skillId: id, studentIds: who, track: "NAFS", dueAt: input.dueAt ?? null, note: `NAFS practice: you missed this skill in ${testTitle}.`.slice(0, 1000) }, now);
      for (const x of who) students.add(x);
      sent.push(r.assignmentId);
      await repo.create("SkillPlanItem", { planId: plan.id, code: k.code.slice(0, 80), label: `NAFS Plan · Grade ${k.grade} · ${k.name}`.slice(0, 255), assignmentIds: [r.assignmentId], order: order++ });
    }
    await tagProgram(repo, sent, "NAFS");
    await audit(repo, { actorId: actor.userId, action: "plan.nafs_personal", entityType: "SkillPlan", entityId: s(plan.id), after: { testId, skills: skillIds.length, students: students.size }, at: now });
    out.push({ classId: s(klass.id), planId: s(plan.id), skills: skillIds.length, students: students.size });
  }
  return { plans: out, studentsWithGaps: withGaps };
}

// ------------------------------------------------------------------ student side (for the home pages)

export type WorkStatus = "Not started" | "In progress" | "Done";
export interface MyWorkItem {
  assignmentId: string;
  /** null for a set of questions the teacher chose */
  skillId: string | null;
  skill: string;
  source: SourceLabel;
  sourceKey: SourceKey;
  status: WorkStatus;
  overdue: boolean;
  dueAt: string | null;
  /** opens the questions directly at the student's level (adaptive practice), or the set; Done → the report */
  href: string;
  action: "Start" | "Continue" | "Review";
  /** the teacher's note (e.g. "Reteach: Weekly Quiz – Week 6") */
  note?: string | null;
}

/**
 * My Work: ONE row per skill (a skill assigned twice shows once, the most urgent), with its source tag
 * (Curriculum / MAP / NAFS / RTI / Grammar / Custom), status and Start link. Work that starts later is left out.
 */
export async function myWorkItems(repo: Repo, actor: Actor, now = new Date()): Promise<MyWorkItem[]> {
  const view = await assignedSkills(repo, actor, now);
  const rank = { OVERDUE: 0, IN_PROGRESS: 1, NOT_STARTED: 2, COMPLETED: 3 } as const;
  const out: MyWorkItem[] = [];
  const seen = new Map<string, number>();
  for (const i of view.items) {
    if (i.startsLater) continue;
    const status: WorkStatus = i.status === "COMPLETED" ? "Done" : i.status === "NOT_STARTED" ? "Not started" : i.status === "OVERDUE" && i.progress === 0 ? "Not started" : "In progress";
    const key = sourceOfWork(i.track, Boolean(i.grammar));
    const row: MyWorkItem = {
      assignmentId: i.assignmentId, skillId: i.kind === "skill" ? i.skillId : null, skill: i.skill, source: SOURCE_LABEL[key], sourceKey: key,
      status, overdue: i.status === "OVERDUE", dueAt: i.dueAt,
      href: status === "Done" ? `/student/assignments/${i.assignmentId}/report` : i.kind === "skill" ? `/practice/${i.skillId}` : `/quiz/${i.assignmentId}`,
      action: status === "Done" ? "Review" : status === "Not started" ? "Start" : "Continue",
      note: i.note,
    };
    const dedupe = i.kind === "skill" ? `skill:${i.skillId}` : `set:${i.assignmentId}`;
    const at = seen.get(dedupe);
    if (at === undefined) { seen.set(dedupe, out.length); out.push(row); continue; }
    const prev = view.items.find((x) => x.assignmentId === out[at].assignmentId)!;
    if (rank[i.status] < rank[prev.status]) out[at] = row;
  }
  return out;
}

export interface MyPlan { id: string; title: string; kind: string; source: SourceLabel; sourceKey: SourceKey; parts: number; done: number; href: string }

/** My Plans: every plan assigned to the student (MAP, NAFS, Curriculum, RTI, Custom) with its source tag. */
export async function myPlans(repo: Repo, actor: Actor): Promise<MyPlan[]> {
  const plans = await studentSkillPlans(repo, actor);
  return plans.map((p) => {
    const key = sourceOfPlanKind(p.kind);
    return { id: p.id, title: p.title, kind: p.kind, source: SOURCE_LABEL[key], sourceKey: key, parts: p.places, done: p.done, href: `/student/plans/${p.id}` };
  });
}

/** The NAFS areas the general plan uses: the admin-edited list (active areas, in the admin's order). */
export const nafsAreaList = (repo: Repo) => sharedNafsAreaList(repo);
