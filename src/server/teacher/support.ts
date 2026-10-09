/**
 * 🛟 Support for the students who need it, built from the data: fluency checks (WCPM), small groups (from the
 * Diagnostic's weak standards and the parts of the curriculum plan where students are stuck), a ready
 * mini-lesson for each group, and class transfer (admin).
 */
import type { Repo, Row } from "../seeding/repo";
import { assertCan, ForbiddenError, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import { assertClassAccess } from "./assignments";
import { readableClasses } from "./coordinators";
import { studentNames } from "../insights/student-data";
import { prescriptionFor, WCPM_BENCHMARK } from "../diagnostic/standards";
import { audit } from "../audit";
import { loadQuestionItems } from "../practice/items";

const s = (v: unknown) => String(v ?? "");
const d = (v: unknown) => (v instanceof Date ? v : v ? new Date(s(v)) : null);
const json = <T>(v: unknown, dflt: T): T => { if (v === null || v === undefined || v === "") return dflt; if (typeof v !== "string") return v as T; try { return JSON.parse(v) as T; } catch { return dflt; } };

// ------------------------------------------------------------------ 🔊 fluency

export interface FluencyRow { id: string; name: string; latest: { wcpm: number; accuracy: number | null; date: string; source: string } | null; history: { wcpm: number; date: string }[] }
export async function classFluency(repo: Repo, actor: Actor, classId: string): Promise<{ className: string; grade: number; benchmark: number; rows: FluencyRow[] }> {
  assertCan(actor, "reports:read");
  const klass = await assertClassAccess(repo, actor, classId);
  const grade = Number((await repo.findUnique("Grade", { id: klass.gradeId }))?.level ?? 0);
  const ids = (await repo.findMany("ClassMembership", { classId, leftAt: null }, { select: ["studentId"] })).map((m) => s(m.studentId));
  const [names, checks] = await Promise.all([studentNames(repo, ids), ids.length ? repo.findMany("FluencyCheck", { studentId: { in: ids } }) : Promise.resolve([] as Row[])]);
  const rows = ids.map((id) => {
    const mine = checks.filter((c) => s(c.studentId) === id).sort((a, b) => (d(b.checkedAt)?.getTime() ?? 0) - (d(a.checkedAt)?.getTime() ?? 0));
    const l = mine[0];
    return { id, name: names.get(id)?.name ?? "Student", latest: l ? { wcpm: Number(l.wcpm), accuracy: l.accuracy === null || l.accuracy === undefined ? null : Number(l.accuracy), date: d(l.checkedAt)!.toISOString().slice(0, 10), source: s(l.source) } : null, history: mine.slice(0, 6).reverse().map((c) => ({ wcpm: Number(c.wcpm), date: d(c.checkedAt)!.toISOString().slice(0, 10) })) };
  }).sort((a, b) => a.name.localeCompare(b.name));
  return { className: s(klass.name), grade, benchmark: WCPM_BENCHMARK[grade] ?? 120, rows };
}

export async function saveFluency(repo: Repo, actor: Actor, classId: string, entries: { studentId: string; wcpm: number; accuracy?: number | null; note?: string | null }[], now = new Date()): Promise<number> {
  assertCan(actor, "assignments:create");
  await assertClassAccess(repo, actor, classId);
  const members = new Set((await repo.findMany("ClassMembership", { classId, leftAt: null }, { select: ["studentId"] })).map((m) => s(m.studentId)));
  let n = 0;
  for (const e of entries) {
    if (!members.has(e.studentId)) throw new ForbiddenError("This student is not in the class.");
    const w = Math.round(Number(e.wcpm));
    if (!Number.isFinite(w) || w < 0 || w > 400) throw new ValidationError("Words correct per minute must be a number from 0 to 400.");
    const acc = e.accuracy === null || e.accuracy === undefined || String(e.accuracy) === "" ? null : Math.round(Number(e.accuracy));
    if (acc !== null && (acc < 0 || acc > 100)) throw new ValidationError("Accuracy is a percentage from 0 to 100.");
    await repo.create("FluencyCheck", { studentId: e.studentId, wcpm: w, accuracy: acc, note: e.note ? s(e.note).slice(0, 500) : null, source: "TEACHER", checkedById: actor.userId, checkedAt: now });
    n++;
  }
  return n;
}

// ------------------------------------------------------------------ 🛟 support groups

export interface SupportGroup { key: string; kind: "STANDARD" | "STUCK" | "FLUENCY"; title: string; code: string; why: string; students: { id: string; name: string; detail: string }[]; lessonHref: string }

/** Small groups for a class: weak Diagnostic standards (2+ students under 60%), stuck plan parts, low fluency. */
export async function supportGroups(repo: Repo, actor: Actor, classId: string): Promise<{ className: string; grade: number; groups: SupportGroup[] }> {
  assertCan(actor, "reports:read");
  const klass = await assertClassAccess(repo, actor, classId);
  const grade = Number((await repo.findUnique("Grade", { id: klass.gradeId }))?.level ?? 0);
  const ids = (await repo.findMany("ClassMembership", { classId, leftAt: null }, { select: ["studentId"] })).map((m) => s(m.studentId));
  const names = await studentNames(repo, ids);
  const nm = (id: string) => names.get(id)?.name ?? "Student";
  const groups: SupportGroup[] = [];
  // 1. the latest Diagnostic of each student, by standard
  const results = ids.length ? await repo.findMany("DiagnosticScore", { studentId: { in: ids } }) : [];
  const latest = new Map<string, Row>();
  for (const r of results.sort((a, b) => (d(a.completedAt)?.getTime() ?? 0) - (d(b.completedAt)?.getTime() ?? 0))) latest.set(s(r.studentId), r);
  const byStd = new Map<string, { label: string; anchor: string; students: { id: string; pct: number }[] }>();
  for (const [id, r] of latest) for (const x of json<{ code: string; label: string; anchor: string; correct: number; total: number }[]>(r.byStandard, [])) {
    const pct = x.total ? Math.round((100 * x.correct) / x.total) : 0;
    if (pct >= 60) continue;
    const g = byStd.get(x.code) ?? { label: x.label, anchor: x.anchor, students: [] }; g.students.push({ id, pct }); byStd.set(x.code, g);
  }
  for (const [code, g] of [...byStd].sort((a, b) => b[1].students.length - a[1].students.length)) {
    if (g.students.length < 2) continue;
    groups.push({ key: `std-${code}`, kind: "STANDARD", title: g.label, code, why: "Under 60% on this standard in the Diagnostic Test", students: g.students.sort((a, b) => a.pct - b.pct).map((x) => ({ id: x.id, name: nm(x.id), detail: `${x.pct}%` })), lessonHref: `/teacher/groups/lesson?classId=${classId}&code=${encodeURIComponent(code)}` });
  }
  // 2. stuck in a part of the curriculum plan (40+ answers without reaching the goal)
  const plan = (await repo.findMany("SkillPlan", { classId, kind: "CURRICULUM" }))[0];
  if (plan) {
    const items = await repo.findMany("SkillPlanItem", { planId: plan.id });
    const target = Number(plan.targetCorrect) || 20;
    for (const it of items) {
      const aids = json<string[]>(it.assignmentIds, []);
      if (!aids.length) continue;
      const ses = await repo.findMany("PracticeSession", { assignmentId: { in: aids }, mode: "TEACHER_QUIZ" }, { select: ["studentId", "questionCount", "correctCount", "goalReachedAt"] });
      const stuck = ses.filter((x) => !x.goalReachedAt && Number(x.questionCount) >= 40 && Number(x.correctCount) < target && ids.includes(s(x.studentId)));
      if (!stuck.length) continue;
      const [unit = "", , ...rest] = s(it.label).split(" · ");
      groups.push({ key: `stuck-${s(it.id)}`, kind: "STUCK", title: `${rest.join(" · ")} (${unit.replace(/^(Unit \d+).*/, "$1")})`, code: s(it.code), why: `Stuck: 40+ answers without ${target} correct`, students: stuck.map((x) => ({ id: s(x.studentId), name: nm(s(x.studentId)), detail: `${Number(x.correctCount)}/${target} after ${Number(x.questionCount)}` })), lessonHref: `/teacher/groups/lesson?classId=${classId}&place=${encodeURIComponent(s(it.code))}` });
    }
  }
  // 3. fluency well below the benchmark
  const bench = WCPM_BENCHMARK[grade] ?? 120;
  const flu = ids.length ? await repo.findMany("FluencyCheck", { studentId: { in: ids } }) : [];
  const low = ids.map((id) => ({ id, c: flu.filter((f) => s(f.studentId) === id).sort((a, b) => (d(b.checkedAt)?.getTime() ?? 0) - (d(a.checkedAt)?.getTime() ?? 0))[0] })).filter((x) => x.c && Number(x.c.wcpm) < bench * 0.75);
  if (low.length) groups.push({ key: "fluency", kind: "FLUENCY", title: "Reading Fluency", code: `RF.${grade}.4`, why: `Under 75% of the Grade ${grade} benchmark (${bench} WCPM)`, students: low.map((x) => ({ id: x.id, name: nm(x.id), detail: `${Number(x.c!.wcpm)} WCPM` })), lessonHref: `/teacher/groups/lesson?classId=${classId}&code=${encodeURIComponent(`RF.${grade}.4`)}` });
  return { className: s(klass.name), grade, groups };
}

export interface MiniLesson { title: string; code: string; grade: number; className: string; objective: string; iDo: string; weDo: string[]; youDo: string; exitTicket: { stem: string; options: string[]; answer: string }[]; students: { name: string; detail: string }[] }

/** 📄 A 20–30 minute mini-lesson for a group: I do / We do / You do, and an exit ticket from the bank. */
export async function miniLesson(repo: Repo, actor: Actor, classId: string, input: { code?: string | null; place?: string | null }): Promise<MiniLesson> {
  const sg = await supportGroups(repo, actor, classId);
  const group = sg.groups.find((g) => (input.place ? g.kind === "STUCK" && g.code === input.place : g.code === input.code));
  const code = input.code ?? "";
  const m = code.match(/^(RL|RI|L|RF|W)\.\d+\.(\d+)/);
  const p = prescriptionFor(m ? `${m[1]}.${m[2]}` : "RI.1");
  // exit ticket: 3 published multiple-choice questions of this standard (or this place)
  let qids: string[] = [];
  if (input.place) {
    const grades = await repo.findMany("Grade", { schoolId: actor.schoolId }, { select: ["id"] });
    const nodes = (await repo.findMany("CurriculumMapNode", { gradeId: { in: grades.map((g) => g.id) } }, { select: ["id", "code"] })).filter((n) => s(n.code) === input.place || s(n.code).startsWith(`${input.place}.`));
    qids = nodes.length ? (await repo.findMany("QuestionMapLink", { nodeId: { in: nodes.map((n) => n.id) } }, { select: ["questionId"] })).map((l) => s(l.questionId)) : [];
  } else if (code) {
    const stds = (await repo.findMany("Standard", {}, { select: ["id", "code"] })).filter((x) => s(x.code).replace(/^CCSS\.ELA-LITERACY\./i, "").toUpperCase().startsWith(code.toUpperCase()));
    qids = stds.length ? (await repo.findMany("Question", { standardId: { in: stds.map((x) => x.id) }, status: "PUBLISHED", deletedAt: null }, { select: ["id"] })).map((q) => s(q.id)) : [];
  }
  const mc = (await repo.findMany("QuestionType", { code: "MULTIPLE_CHOICE" }, { select: ["id"] }))[0];
  const qs = qids.length && mc ? (await repo.findMany("Question", { id: { in: qids.slice(0, 200) }, status: "PUBLISHED", typeId: mc.id, passageId: null }, { select: ["id", "difficultyLevel"] })).sort((a, b) => Math.abs(Number(a.difficultyLevel) - 4) - Math.abs(Number(b.difficultyLevel) - 4) || s(a.id).localeCompare(s(b.id))).slice(0, 3) : [];
  const items = qs.length ? await loadQuestionItems(repo, qs.map((q) => s(q.id))) : [];
  const exitTicket = items.filter((it) => it.options?.length).map((it) => ({ stem: it.stem, options: it.options!.map((o) => `${o.label}. ${o.text}`), answer: it.options!.filter((o) => o.correct).map((o) => o.label).join(", ") }));
  return {
    title: group?.title ?? (code || "Small-group lesson"), code: code || s(input.place), grade: sg.grade, className: sg.className,
    objective: p.objective, iDo: p.activities[0], weDo: p.activities.slice(1), youDo: "Students answer 3–5 questions of this skill on their own (the exit ticket below, or the skill’s part of the curriculum plan at their level).",
    exitTicket, students: group?.students.map((x) => ({ name: x.name, detail: x.detail })) ?? [],
  };
}

// ------------------------------------------------------------------ 🔁 class transfer

/** Admin: the class moves to another teacher with all its data (assignments, plans, reports stay with the class). */
export async function transferClass(repo: Repo, actor: Actor, classId: string, toTeacherId: string, keepPrevious = false, now = new Date()): Promise<void> {
  assertCan(actor, "classes:manage");
  const klass = await repo.findUnique("Class", { id: classId });
  if (!klass || s(klass.schoolId) !== s(actor.schoolId)) throw new ForbiddenError("Class not found.");
  const to = await repo.findUnique("Teacher", { id: toTeacherId });
  const toUser = to ? await repo.findUnique("User", { id: to.userId }) : null;
  if (!to || !toUser || s(toUser.schoolId) !== s(actor.schoolId)) throw new ValidationError("Choose a teacher of this school.");
  const before = await repo.findMany("ClassTeacher", { classId });
  if (!keepPrevious) await repo.deleteMany("ClassTeacher", { classId });
  else await repo.updateMany("ClassTeacher", { classId }, { isLead: false });
  if (!keepPrevious || !before.some((x) => s(x.teacherId) === toTeacherId)) await repo.upsert("ClassTeacher", { classId, teacherId: toTeacherId }, { isLead: true }, { classId, teacherId: toTeacherId, isLead: true });
  else await repo.updateMany("ClassTeacher", { classId, teacherId: toTeacherId }, { isLead: true });
  // plans the class's students open later are made as from the new teacher
  await repo.updateMany("SkillPlan", { classId }, { createdById: to.userId });
  await audit(repo, { actorId: actor.userId, action: "class.transfer", entityType: "Class", entityId: classId, before: { teachers: before.map((x) => s(x.teacherId)) }, after: { teacher: toTeacherId, keepPrevious }, at: now });
  await repo.create("Notification", { userId: to.userId, type: "INTERVENTION_ALERT", title: `👥 ${s(klass.name)} is now your class`, body: "Its students, assignments, plans and reports are all in My Classes.", link: `/teacher/classes/${classId}`, readAt: null, createdAt: now });
}

/** The teachers an admin can move a class to. */
export async function schoolTeachers(repo: Repo, actor: Actor): Promise<{ id: string; name: string }[]> {
  assertCan(actor, "classes:manage");
  const users = await repo.findMany("User", { schoolId: actor.schoolId, role: "TEACHER" }, { select: ["id", "displayName", "isActive"] });
  const ts = users.length ? await repo.findMany("Teacher", { userId: { in: users.map((u) => u.id) } }, { select: ["id", "userId"] }) : [];
  return ts.map((t) => ({ id: s(t.id), name: s(users.find((u) => u.id === t.userId)?.displayName) })).sort((a, b) => a.name.localeCompare(b.name));
}

export { readableClasses };
