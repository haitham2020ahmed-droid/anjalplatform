/**
 * 📝 The beginning-of-year Diagnostic Test (one test for placement and diagnosis): a fixed set of ~50 questions per
 * grade covering every strand (Literature, Informational, Vocabulary, Grammar & Conventions) and every standard the
 * bank has, mixed in difficulty. The admin builds it, reviews it (swap any question), opens it for a window; every
 * student of the grade takes the same test, without feedback. When a student finishes, the result is analysed by
 * standard and strand, and it sets their level (Above / On / Below) — the starting point of everything adaptive.
 */
import type { Repo, Row } from "../seeding/repo";
import { assertCan, ForbiddenError, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import { attachmentNodes } from "../curriculum-map/questions";
import { notifyTeachers, recordLevel } from "../curriculum-map/student-level";
import { areaOfCategory, areaOfStandard, STRAND_QUOTA, type Area, type Strand } from "./standards";

const s = (v: unknown) => String(v ?? "");
const d = (v: unknown) => (v instanceof Date ? v : v ? new Date(s(v)) : null);
export const DIAGNOSTIC_SIZE = 50;
export const DEFAULT_BANDS = { above: 85, on: 65 };
const MANUAL = new Set(["SHORT_ANSWER"]);

/** "2026-2027" from August on, else "2025-2026". */
export const schoolYear = (now = new Date()) => { const y = now.getUTCFullYear(); return now.getUTCMonth() >= 7 ? `${y}-${y + 1}` : `${y - 1}-${y}`; };
const bandsOf = (t: Row | null) => { const b = (typeof t?.bands === "string" ? JSON.parse(s(t.bands)) : t?.bands) as { above?: number; on?: number } | null; return { above: Number(b?.above) || DEFAULT_BANDS.above, on: Number(b?.on) || DEFAULT_BANDS.on }; };
export const levelForPct = (pct: number, bands = DEFAULT_BANDS): "ABOVE" | "ON" | "BELOW" => (pct >= bands.above ? "ABOVE" : pct >= bands.on ? "ON" : "BELOW");
/** a stable pseudo-random order (no Math.random): the same pool gives the same test */
const hash = (x: string) => { let h = 2166136261; for (let i = 0; i < x.length; i++) { h ^= x.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

async function gradeRow(repo: Repo, schoolId: string, grade: number): Promise<Row> {
  const g = (await repo.findMany("Grade", { schoolId, level: grade }))[0];
  if (!g) throw new ValidationError(`Grade ${grade} does not exist.`);
  return g;
}

export interface PoolQuestion { id: string; area: Area; level: number; passageId: string | null; placement: boolean }

/** Every published, auto-marked question of the grade (its curriculum skills and its Curriculum Map), with its reporting area. */
export async function diagnosticPool(repo: Repo, schoolId: string, grade: number): Promise<PoolQuestion[]> {
  const g = await gradeRow(repo, schoolId, grade);
  const curs = await repo.findMany("Curriculum", { gradeId: g.id }, { select: ["id"] });
  const skills = curs.length ? await repo.findMany("Skill", { curriculumId: { in: curs.map((c) => c.id) }, deletedAt: null }, { select: ["id", "category", "code"] }) : [];
  const nodes = (await attachmentNodes(repo, schoolId)).filter((n) => n.grade === grade);
  const links = nodes.length ? await repo.findMany("QuestionMapLink", { nodeId: { in: nodes.map((n) => n.id) } }, { select: ["questionId", "nodeId"] }) : [];
  const nodeOf = new Map(links.map((l) => [s(l.questionId), nodes.find((n) => n.id === l.nodeId)]));
  const bySkill = skills.length ? await repo.findMany("Question", { skillId: { in: skills.map((k) => k.id) }, status: "PUBLISHED", deletedAt: null }, { select: ["id", "skillId", "standardId", "typeId", "difficultyLevel", "passageId"] }) : [];
  const onMap = links.length ? await repo.findMany("Question", { id: { in: [...new Set(links.map((l) => s(l.questionId)))] }, status: "PUBLISHED", deletedAt: null }, { select: ["id", "skillId", "standardId", "typeId", "difficultyLevel", "passageId"] }) : [];
  const all = new Map<string, Row>(); for (const q of [...bySkill, ...onMap]) all.set(s(q.id), q);
  const qs = [...all.values()];
  if (!qs.length) return [];
  const types = await repo.findMany("QuestionType", { id: { in: [...new Set(qs.map((q) => s(q.typeId)))] } }, { select: ["id", "code", "isAutoScored"] });
  const manual = new Set(types.filter((t) => MANUAL.has(s(t.code)) || t.isAutoScored === false || t.isAutoScored === 0).map((t) => s(t.id)));
  const skillIds = [...new Set(qs.map((q) => s(q.skillId)))];
  const [allSkills, stdLinks, uses] = await Promise.all([
    repo.findMany("Skill", { id: { in: skillIds } }, { select: ["id", "category", "code"] }),
    repo.findMany("SkillStandard", { skillId: { in: skillIds } }, { select: ["skillId", "standardId"] }),
    repo.findMany("QuestionUse", { questionId: { in: qs.map((q) => s(q.id)) }, use: "PLACEMENT" }, { select: ["questionId"] }),
  ]);
  const stdIds = [...new Set([...qs.map((q) => s(q.standardId)).filter(Boolean), ...stdLinks.map((l) => s(l.standardId))])];
  const stds = stdIds.length ? await repo.findMany("Standard", { id: { in: stdIds } }, { select: ["id", "code"] }) : [];
  const codeOf = new Map(stds.map((x) => [s(x.id), s(x.code)]));
  const placement = new Set(uses.map((u) => s(u.questionId)));
  const out: PoolQuestion[] = [];
  for (const q of qs) {
    if (manual.has(s(q.typeId))) continue;
    const node = nodeOf.get(s(q.id));
    const sk = allSkills.find((k) => k.id === q.skillId);
    // the question's own standard, else its skill's (of this grade first), else the category / the map place
    const own = q.standardId ? areaOfStandard(codeOf.get(s(q.standardId)) ?? "") : null;
    const viaSkill = own ? null : stdLinks.filter((l) => l.skillId === q.skillId).map((l) => areaOfStandard(codeOf.get(s(l.standardId)) ?? "")).filter((a): a is Area => !!a).sort((a, b) => Number(b.code.split(".")[1] === String(grade)) - Number(a.code.split(".")[1] === String(grade)))[0];
    const area = own ?? viaSkill ?? (node ? areaOfCategory(node.category === "CONCEPT_VOCABULARY" ? "VOCABULARY" : "READING", grade, `${node.genre ?? ""} ${node.heading}`) : areaOfCategory(s(sk?.category), grade));
    if (area.strand === "WRITE") continue;
    out.push({ id: s(q.id), area, level: Number(q.difficultyLevel) || 4, passageId: q.passageId ? s(q.passageId) : null, placement: placement.has(s(q.id)) });
  }
  return out;
}

/**
 * Picks the test: each strand gets its share, spread over its standards in turn, each standard over a mix of
 * difficulty (On level most, then easier and harder). Questions marked “Placement” are preferred. Questions of the
 * same passage stay together; the order is Literature → Informational → Vocabulary → Grammar & Conventions.
 */
export function pickDiagnostic(pool: PoolQuestion[], size = DIAGNOSTIC_SIZE, seed = "diagnostic"): string[] {
  const strands: Strand[] = ["LIT", "INFO", "VOCAB", "LANG", "FOUND"];
  const total = Object.values(STRAND_QUOTA).reduce((a, b) => a + b, 0);
  const quota = new Map<Strand, number>(strands.map((st) => [st, Math.round((STRAND_QUOTA[st] / total) * size)]));
  const avail = (st: Strand) => pool.filter((q) => q.area.strand === st).length;
  // a strand without enough questions gives its places to the others
  let spare = 0;
  for (const st of strands) { const q = quota.get(st)!; if (avail(st) < q) { spare += q - avail(st); quota.set(st, avail(st)); } }
  while (spare > 0) { const more = strands.filter((st) => avail(st) > quota.get(st)!); if (!more.length) break; for (const st of more) { if (!spare) break; quota.set(st, quota.get(st)! + 1); spare--; } }
  const LEVEL_ORDER = [4, 3, 5, 4, 2, 6, 4, 3, 5, 1, 7];
  const chosen: PoolQuestion[] = [];
  for (const st of strands) {
    const want = quota.get(st)!;
    const inStrand = pool.filter((q) => q.area.strand === st);
    const byStd = new Map<string, PoolQuestion[]>();
    for (const q of inStrand.sort((a, b) => Number(b.placement) - Number(a.placement) || hash(seed + a.id) - hash(seed + b.id))) byStd.set(q.area.code, [...(byStd.get(q.area.code) ?? []), q]);
    const codes = [...byStd.keys()].sort();
    const used = new Map<string, number>();
    let picked = 0, guard = 0;
    while (picked < want && guard++ < want * 20) {
      for (const code of codes) {
        if (picked >= want) break;
        const list = byStd.get(code)!; if (!list.length) continue;
        const k = used.get(code) ?? 0; used.set(code, k + 1);
        const target = LEVEL_ORDER[k % LEVEL_ORDER.length];
        const best = list.reduce((b, q) => (Math.abs(q.level - target) < Math.abs(b.level - target) || (Math.abs(q.level - target) === Math.abs(b.level - target) && Number(q.placement) > Number(b.placement)) ? q : b), list[0]);
        list.splice(list.indexOf(best), 1); chosen.push(best); picked++;
      }
      if (codes.every((c) => !byStd.get(c)!.length)) break;
    }
  }
  // passages together, strands in order, easier first inside a strand
  const order = new Map(strands.map((st, i) => [st, i]));
  const passageRank = new Map<string, number>();
  for (const q of chosen) if (q.passageId) passageRank.set(q.passageId, Math.min(passageRank.get(q.passageId) ?? 99, q.level));
  return chosen.sort((a, b) => order.get(a.area.strand)! - order.get(b.area.strand)!
    || (a.passageId ? passageRank.get(a.passageId)! : a.level) - (b.passageId ? passageRank.get(b.passageId)! : b.level)
    || s(a.passageId).localeCompare(s(b.passageId)) || a.level - b.level || a.id.localeCompare(b.id)).map((q) => q.id);
}

function assertAdmin(actor: Actor) {
  assertCan(actor, "assignments:create");
  if (actor.role !== "SCHOOL_ADMIN" && actor.role !== "SUPER_ADMIN") throw new ForbiddenError("Only the school admin builds and opens the Diagnostic Test.");
}

/** Builds (or rebuilds, while still a draft) the grade's Diagnostic for this school year. */
export async function buildDiagnostic(repo: Repo, actor: Actor, input: { grade: number; size?: number }, now = new Date()): Promise<{ id: string; questions: number; byStrand: Record<string, number> }> {
  assertAdmin(actor);
  const schoolId = s(actor.schoolId);
  const year = schoolYear(now);
  const size = Math.max(20, Math.min(60, Math.round(input.size ?? DIAGNOSTIC_SIZE)));
  const pool = await diagnosticPool(repo, schoolId, input.grade);
  const ids = pickDiagnostic(pool, size, `${schoolId}:${input.grade}:${year}`);
  if (ids.length < 20) throw new ValidationError(`Grade ${input.grade} has only ${ids.length} published questions that the platform can mark. Add questions first (at least 20; 50 is best).`);
  const existing = (await repo.findMany("DiagnosticTest", { schoolId, grade: input.grade, year }))[0];
  if (existing && s(existing.status) !== "DRAFT") throw new ValidationError("This year’s Diagnostic is already open or closed; it cannot be rebuilt.");
  const title = `Diagnostic Test · Grade ${input.grade} · ${year}`;
  let id: string;
  if (existing) {
    id = s(existing.id);
    await repo.deleteMany("AssessmentQuestion", { assessmentId: existing.assessmentId });
    await repo.createMany("AssessmentQuestion", ids.map((questionId, order) => ({ assessmentId: existing.assessmentId, questionId, order, points: 1 })));
    await repo.updateMany("Assessment", { id: existing.assessmentId }, { maxQuestions: ids.length });
  } else {
    const set = await repo.create("Assessment", { title, type: "DIAGNOSTIC", isAdaptive: false, maxQuestions: ids.length, status: "PUBLISHED", createdById: actor.userId, createdAt: now });
    await repo.createMany("AssessmentQuestion", ids.map((questionId, order) => ({ assessmentId: set.id, questionId, order, points: 1 })));
    id = s((await repo.create("DiagnosticTest", { schoolId, grade: input.grade, year, title, assessmentId: set.id, status: "DRAFT", bands: DEFAULT_BANDS, createdById: actor.userId, createdAt: now })).id);
  }
  const byStrand: Record<string, number> = {};
  for (const q of pool.filter((p) => ids.includes(p.id))) byStrand[q.area.strand] = (byStrand[q.area.strand] ?? 0) + 1;
  return { id, questions: ids.length, byStrand };
}

async function testRow(repo: Repo, actor: Actor, id: string): Promise<Row> {
  const t = await repo.findUnique("DiagnosticTest", { id });
  if (!t || s(t.schoolId) !== s(actor.schoolId)) throw new ForbiddenError("Diagnostic not found.");
  return t;
}

/** Swaps one question for another of the same standard (else the same strand) that is not in the test yet. */
export async function swapDiagnosticQuestion(repo: Repo, actor: Actor, id: string, questionId: string): Promise<string> {
  assertAdmin(actor);
  const t = await testRow(repo, actor, id);
  if (s(t.status) !== "DRAFT") throw new ValidationError("The test is open: questions can no longer change.");
  const rows = await repo.findMany("AssessmentQuestion", { assessmentId: t.assessmentId });
  const row = rows.find((r) => s(r.questionId) === questionId);
  if (!row) throw new ValidationError("This question is not in the test.");
  const pool = await diagnosticPool(repo, s(t.schoolId), Number(t.grade));
  const inTest = new Set(rows.map((r) => s(r.questionId)));
  const me = pool.find((p) => p.id === questionId);
  const free = pool.filter((p) => !inTest.has(p.id));
  const next = free.filter((p) => me && p.area.code === me.area.code).sort((a, b) => Math.abs(a.level - (me?.level ?? 4)) - Math.abs(b.level - (me?.level ?? 4)) || a.id.localeCompare(b.id))[0]
    ?? free.filter((p) => me && p.area.strand === me.area.strand).sort((a, b) => a.id.localeCompare(b.id))[0];
  if (!next) throw new ValidationError("No other question of this standard is free. Add questions to the bank first.");
  await repo.updateMany("AssessmentQuestion", { assessmentId: t.assessmentId, questionId }, { questionId: next.id });
  return next.id;
}

/** Opens the test for every class of the grade (one assignment per class, all with the same questions). */
export async function openDiagnostic(repo: Repo, actor: Actor, id: string, input: { opensAt?: Date | null; closesAt?: Date | null; above?: number; on?: number } = {}, now = new Date()): Promise<{ classes: number; students: number }> {
  assertAdmin(actor);
  const t = await testRow(repo, actor, id);
  if (s(t.status) === "CLOSED") throw new ValidationError("This test is closed.");
  const above = Math.max(50, Math.min(100, Math.round(input.above ?? bandsOf(t).above))), on = Math.max(20, Math.min(above - 1, Math.round(input.on ?? bandsOf(t).on)));
  const g = await gradeRow(repo, s(t.schoolId), Number(t.grade));
  const classes = await repo.findMany("Class", { schoolId: t.schoolId, gradeId: g.id, deletedAt: null });
  let students = 0, made = 0;
  for (const c of classes) {
    if (await ensureClassAssignment(repo, t, c, actor.userId, input.opensAt ?? null, input.closesAt ?? null, now)) made++;
    students += await repo.count("ClassMembership", { classId: c.id, leftAt: null });
  }
  await repo.updateMany("DiagnosticTest", { id }, { status: "OPEN", opensAt: input.opensAt ?? now, closesAt: input.closesAt ?? null, bands: { above, on } });
  // dates of the class assignments follow the test
  const aids = (await repo.findMany("Assignment", { assessmentId: t.assessmentId }, { select: ["id"] })).map((a) => a.id);
  if (aids.length) await repo.updateMany("Assignment", { id: { in: aids } }, { startAt: input.opensAt ?? null, dueAt: input.closesAt ?? null });
  return { classes: made, students };
}

/** The class's assignment of the test (made once); new students are added. Returns true when it was made now. */
async function ensureClassAssignment(repo: Repo, t: Row, klass: Row, actorUserId: string | null, opensAt: Date | null, closesAt: Date | null, now: Date): Promise<boolean> {
  const existing = (await repo.findMany("Assignment", { classId: klass.id, assessmentId: t.assessmentId, deletedAt: null }))[0];
  const members = (await repo.findMany("ClassMembership", { classId: klass.id, leftAt: null }, { select: ["studentId"] })).map((m) => s(m.studentId));
  if (existing) {
    const have = new Set((await repo.findMany("AssignmentStudent", { assignmentId: existing.id }, { select: ["studentId"] })).map((x) => s(x.studentId)));
    const add = members.filter((m) => !have.has(m));
    if (add.length) await repo.createMany("AssignmentStudent", add.map((studentId) => ({ assignmentId: existing.id, studentId, status: "NOT_STARTED", progress: 0 })));
    return false;
  }
  const lead = (await repo.findMany("ClassTeacher", { classId: klass.id }, { select: ["teacherId", "isLead"] })).sort((a, b) => Number(Boolean(b.isLead)) - Number(Boolean(a.isLead)))[0];
  if (!lead || !members.length) return false;
  const a = await repo.create("Assignment", { classId: klass.id, createdById: lead.teacherId, title: s(t.title), target: "ASSESSMENT", track: "CURRICULUM", assessmentId: t.assessmentId, startAt: opensAt, dueAt: closesAt, note: "Beginning-of-year Diagnostic Test", createdAt: now });
  await repo.createMany("AssignmentStudent", members.map((studentId) => ({ assignmentId: a.id, studentId, status: "NOT_STARTED", progress: 0 })));
  const users = await repo.findMany("Student", { id: { in: members } }, { select: ["userId"] });
  await repo.createMany("Notification", users.map((u) => ({ userId: u.userId, type: "NEW_ASSIGNMENT", title: "📝 Your Diagnostic Test is ready", body: `${s(t.title)}: about ${DIAGNOSTIC_SIZE} questions. Take your time and do your best — there is no score shown until your teacher shares your report.`, link: `/quiz/${s(a.id)}`, readAt: null, createdAt: now })));
  void actorUserId;
  return true;
}

export async function closeDiagnostic(repo: Repo, actor: Actor, id: string): Promise<void> {
  assertAdmin(actor);
  await testRow(repo, actor, id);
  await repo.updateMany("DiagnosticTest", { id }, { status: "CLOSED" });
}

export interface DiagnosticSummary { id: string; grade: number; year: string; title: string; status: string; questions: number; opensAt: string | null; closesAt: string | null; bands: { above: number; on: number }; students: number; finished: number }

/** The school's Diagnostic tests (admin: all; teacher: their grades). */
export async function listDiagnostics(repo: Repo, actor: Actor): Promise<DiagnosticSummary[]> {
  assertCan(actor, "reports:read");
  if (actor.role === "STUDENT" || actor.role === "PARENT") throw new ForbiddenError();
  const tests = await repo.findMany("DiagnosticTest", { schoolId: actor.schoolId });
  const out: DiagnosticSummary[] = [];
  for (const t of tests.sort((a, b) => s(b.year).localeCompare(s(a.year)) || Number(a.grade) - Number(b.grade))) {
    const aids = (await repo.findMany("Assignment", { assessmentId: t.assessmentId, deletedAt: null }, { select: ["id"] })).map((a) => a.id);
    const students = aids.length ? await repo.count("AssignmentStudent", { assignmentId: { in: aids } }) : 0;
    out.push({ id: s(t.id), grade: Number(t.grade), year: s(t.year), title: s(t.title), status: s(t.status), questions: await repo.count("AssessmentQuestion", { assessmentId: t.assessmentId }), opensAt: d(t.opensAt)?.toISOString().slice(0, 10) ?? null, closesAt: d(t.closesAt)?.toISOString().slice(0, 10) ?? null, bands: bandsOf(t), students, finished: await repo.count("DiagnosticScore", { diagnosticId: t.id }) });
  }
  return out;
}

export interface ReviewQuestion { id: string; n: number; stem: string; area: Area; level: number; type: string }
/** The questions of the test for the admin to review, with their standard and level. */
export async function diagnosticQuestions(repo: Repo, actor: Actor, id: string): Promise<{ test: DiagnosticSummary; questions: ReviewQuestion[]; byStrand: { strand: Strand; n: number }[]; byStandard: { code: string; label: string; n: number }[] }> {
  assertCan(actor, "reports:read");
  const t = await testRow(repo, actor, id);
  const test = (await listDiagnostics(repo, actor)).find((x) => x.id === id)!;
  const rows = (await repo.findMany("AssessmentQuestion", { assessmentId: t.assessmentId })).sort((a, b) => Number(a.order) - Number(b.order));
  const pool = new Map((await diagnosticPool(repo, s(t.schoolId), Number(t.grade))).map((p) => [p.id, p]));
  const qs = rows.length ? await repo.findMany("Question", { id: { in: rows.map((r) => s(r.questionId)) } }, { select: ["id", "stem", "typeId", "difficultyLevel"] }) : [];
  const types = await repo.findMany("QuestionType", {}, { select: ["id", "name", "code"] });
  const questions = rows.map((r, i) => {
    const q = qs.find((x) => x.id === r.questionId);
    const p = pool.get(s(r.questionId));
    return { id: s(r.questionId), n: i + 1, stem: s(q?.stem).replace(/\s+/g, " ").slice(0, 160), area: p?.area ?? areaOfCategory("READING", Number(t.grade)), level: Number(q?.difficultyLevel ?? 4), type: s(types.find((x) => x.id === q?.typeId)?.name ?? "") };
  });
  const strandCount = new Map<Strand, number>(); const stdCount = new Map<string, { label: string; n: number }>();
  for (const q of questions) { strandCount.set(q.area.strand, (strandCount.get(q.area.strand) ?? 0) + 1); const x = stdCount.get(q.area.code) ?? { label: q.area.label, n: 0 }; x.n++; stdCount.set(q.area.code, x); }
  return { test, questions, byStrand: [...strandCount].map(([strand, n]) => ({ strand, n })), byStandard: [...stdCount].map(([code, v]) => ({ code, ...v })).sort((a, b) => a.code.localeCompare(b.code)) };
}

/** The open Diagnostic of the student's grade: their assignment (added if they joined late) and whether they finished. */
export async function myDiagnostic(repo: Repo, actor: Actor, now = new Date()): Promise<{ id: string; title: string; href: string; status: "TODO" | "STARTED" | "DONE"; answered: number; total: number; shared: boolean } | null> {
  if (actor.role !== "STUDENT" || !actor.studentId) return null;
  const m = (await repo.findMany("ClassMembership", { studentId: actor.studentId, leftAt: null }))[0];
  const klass = m ? await repo.findUnique("Class", { id: m.classId }) : null;
  const g = klass ? await repo.findUnique("Grade", { id: klass.gradeId }) : null;
  if (!klass || !g) return null;
  const t = (await repo.findMany("DiagnosticTest", { schoolId: klass.schoolId, grade: Number(g.level), status: "OPEN" })).sort((a, b) => s(b.year).localeCompare(s(a.year)))[0];
  if (!t) return null;
  const res = (await repo.findMany("DiagnosticScore", { diagnosticId: t.id, studentId: actor.studentId }))[0];
  await ensureClassAssignment(repo, t, klass, null, d(t.opensAt), d(t.closesAt), now);
  const a = (await repo.findMany("Assignment", { classId: klass.id, assessmentId: t.assessmentId, deletedAt: null }))[0];
  if (!a) return null;
  const total = await repo.count("AssessmentQuestion", { assessmentId: t.assessmentId });
  const ses = (await repo.findMany("PracticeSession", { studentId: actor.studentId, assignmentId: a.id, mode: "TEACHER_QUIZ" }))[0];
  const answered = ses ? await repo.count("QuestionAttempt", { sessionId: ses.id }) : 0;
  return { id: s(t.id), title: s(t.title), href: `/quiz/${s(a.id)}`, status: res ? "DONE" : answered ? "STARTED" : "TODO", answered, total, shared: Boolean(res?.sharedAt) };
}

/**
 * Called when a student answers the last question of a Diagnostic: scores it by standard and strand, writes the
 * result, sets the student's level (source PLACEMENT) and tells the teacher. Safe to call twice.
 */
export async function recordDiagnosticResult(repo: Repo, assessmentId: string, assignmentId: string, studentId: string, sessionId: string, now = new Date()): Promise<Row | null> {
  const t = (await repo.findMany("DiagnosticTest", { assessmentId }))[0];
  if (!t) return null;
  const done = (await repo.findMany("DiagnosticScore", { diagnosticId: t.id, studentId }))[0];
  if (done) return done;
  const order = (await repo.findMany("AssessmentQuestion", { assessmentId })).map((r) => s(r.questionId));
  const attempts = await repo.findMany("QuestionAttempt", { sessionId }, { select: ["questionId", "isCorrect", "rapidGuess", "responseMs", "createdAt"] });
  const answered = new Map<string, Row>(); for (const a of attempts) if (!answered.has(s(a.questionId))) answered.set(s(a.questionId), a);
  if (order.some((id) => !answered.has(id))) return null;
  const pool = new Map((await diagnosticPool(repo, s(t.schoolId), Number(t.grade))).map((p) => [p.id, p]));
  const stdMap = new Map<string, { code: string; label: string; strand: Strand; anchor: string; correct: number; total: number }>();
  const strandMap = new Map<Strand, { correct: number; total: number }>();
  let correct = 0;
  for (const id of order) {
    const ok = Boolean(answered.get(id)!.isCorrect); if (ok) correct++;
    const area = pool.get(id)?.area ?? areaOfCategory("READING", Number(t.grade));
    const x = stdMap.get(area.code) ?? { ...area, correct: 0, total: 0 }; x.total++; if (ok) x.correct++; stdMap.set(area.code, x);
    const y = strandMap.get(area.strand) ?? { correct: 0, total: 0 }; y.total++; if (ok) y.correct++; strandMap.set(area.strand, y);
  }
  const pct = Math.round((1000 * correct) / Math.max(1, order.length)) / 10;
  const level = levelForPct(pct, bandsOf(t));
  const times = attempts.map((a) => d(a.createdAt)!.getTime());
  const minutes = Math.round(attempts.reduce((m, a) => m + Math.min(Number(a.responseMs ?? 0), 300_000), 0) / 60_000) || Math.round((Math.max(...times) - Math.min(...times)) / 60_000);
  const rapid = attempts.filter((a) => a.rapidGuess).length;
  const row = await repo.create("DiagnosticScore", {
    diagnosticId: t.id, studentId, assignmentId, correct, total: order.length, pct, level,
    byStandard: [...stdMap.values()].sort((a, b) => a.code.localeCompare(b.code)), byStrand: [...strandMap].map(([strand, v]) => ({ strand, ...v })),
    rapid, minutes, completedAt: now, sharedAt: null, teacherNote: null,
  });
  await recordLevel(repo, { studentId, level, source: "PLACEMENT", reason: `Diagnostic Test ${pct}%`, answers: order.length, now });
  const name = s((await repo.findUnique("User", { id: (await repo.findUnique("Student", { id: studentId }))?.userId }))?.displayName) || "A student";
  await notifyTeachers(repo, studentId, `📝 ${name} finished the Diagnostic`, `${correct}/${order.length} (${pct}%) · ${level.charAt(0)}${level.slice(1).toLowerCase()} Level.${rapid >= order.length * 0.3 ? ` ⚡ ${rapid} answers were too fast — the result may be lower than their real level.` : ""}`, now);
  return row;
}

/** The assessment id when this set is a Diagnostic Test (else null). */
export async function diagnosticOfAssessment(repo: Repo, assessmentId: string): Promise<string | null> {
  if (!assessmentId) return null;
  return (await repo.findMany("DiagnosticTest", { assessmentId }, { select: ["id"] })).length ? assessmentId : null;
}
