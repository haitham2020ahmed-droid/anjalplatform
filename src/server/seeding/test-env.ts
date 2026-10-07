/**
 * TEST environment: a separate “Test School” for realistic testing, never mixed with the real school.
 *
 *   1 admin · 6 teachers · 200 students · 6 classes (Grades 4–6, two per grade, existing grades only)
 *   the school's own copy of the curriculum and of the original question bank (data/questions/bank.json)
 *   skill assignments made with the REAL assignment logic (whole class, selected students, one
 *   student; with and without due dates; one assigned two weeks ago and now overdue)
 *   practice done with the REAL adaptive engine, so statuses are genuine:
 *   Not Started · In Progress · Completed · Overdue; notifications come from the real code too
 *
 * Usernames: test.admin, test.teacher.1 … test.teacher.6, test.student.001 … test.student.200.
 * The password comes from the caller (TEST_ACCOUNT_PASSWORD); it is never stored in the code.
 *
 * resetTestEnvironment() removes the Test School and everything that depends on it, following the
 * database relations: required links are deleted, optional links are only cleared, so shared data
 * (standards, books, reading passages, other schools) is never touched.
 */
import { join } from "node:path";
import type { Repo, Row } from "./repo";
import { parseSchema, type Schema } from "../../../scripts/db/schema-ddl";
import { loadBank, loadCurriculumInput } from "./load-files";
import { seedCurriculum } from "./curriculum";
import { seedQuestions } from "./questions";
import { resolveActor } from "../auth/actor";
import { assignSkill } from "../teacher/assign";
import { loadSkillItems, type PracticeItem } from "../practice/items";
import { assignmentUpdatesSettled, startPractice, submitAnswer } from "../practice/session";
import { refreshSkillAssignment, refreshSkillAssignments } from "../teacher/assign";
import { randomBytes } from "node:crypto";
const newId = () => "c" + Date.now().toString(36) + randomBytes(8).toString("hex");

export const TEST_SCHOOL_CODE = "TEST";
export const TEST_CLASS_SIZES = [34, 33, 33, 33, 34, 33]; // 200 students
const DAY = 86_400_000;
const s = (v: unknown) => String(v ?? "");

export interface TestEnvReport { admins: number; teachers: number; students: number; classes: number; questions: number; assignments: number; statuses: Record<string, number>; notifications: number; answers: number }

/** A correct response for any auto-scored item (used to practise like a strong student). */
function rightAnswer(it: PracticeItem): unknown {
  switch (it.type) {
    case "MULTI_SELECT": return it.options!.filter((o) => o.correct).map((o) => o.label);
    case "MULTIPLE_CHOICE": case "DROPDOWN": return it.options!.find((o) => o.correct)!.label;
    case "TRUE_FALSE": return it.answer;
    case "FILL_BLANK": return it.answers![0];
    case "SENTENCE_ORDER": case "WORD_ORDER": return it.sequence;
    case "ERROR_CORRECTION": return it.errorIndex;
    case "MATCHING": return Object.fromEntries(it.pairs!.map((p) => [p.left, p.right]));
    default: throw new Error(`No automatic answer for ${it.type}`);
  }
}

/** Practise a skill for one student: `answers` questions, or until the assignment is completed. */
async function practise(repo: Repo, student: Row, skillId: string, opts: { answers?: number; untilCompleted?: string; start: Date }): Promise<number> {
  const actor = await resolveActor(repo, student);
  const items = new Map((await loadSkillItems(repo, skillId)).map((i) => [i.questionId, i]));
  let clock = opts.start.getTime();
  let view = await startPractice(repo, actor, skillId, new Date(clock));
  let n = 0;
  const limit = opts.answers ?? 40;
  while (n < limit && view.question) {
    const it = items.get(view.question.questionId)!;
    ({ view } = await submitAnswer(repo, actor, { sessionId: view.sessionId, questionId: it.questionId, response: rightAnswer(it) }, new Date((clock += 25_000))));
    n++;
    if (opts.untilCompleted) {
      await assignmentUpdatesSettled();
      const row = (await repo.findMany("AssignmentStudent", { assignmentId: opts.untilCompleted, studentId: actor.studentId! }))[0];
      if (row?.status === "COMPLETED") break;
    }
    if (!view.question && n < limit) view = await startPractice(repo, actor, skillId, new Date((clock += 1000)));
  }
  return n;
}

export async function seedTestEnvironment(repo: Repo, opts: { root: string; passwordHash: string; practice?: "light" | "none"; now?: Date; log?: (m: string) => void }): Promise<TestEnvReport> {
  const now = opts.now ?? new Date();
  const log = opts.log ?? (() => {});
  if (await repo.findUnique("School", { code: TEST_SCHOOL_CODE })) throw new Error("The Test School already exists. Reset it first (reset), then seed again.");

  log("Curriculum (Grades 4–6, the same files as the real school)…");
  await seedCurriculum(repo, loadCurriculumInput(opts.root, TEST_SCHOOL_CODE, "Test School (seed data)"));
  const school = (await repo.findUnique("School", { code: TEST_SCHOOL_CODE }))!;
  await repo.updateMany("School", { id: school.id }, { isDemo: true });
  log("Question bank copy for the Test School…");
  await seedQuestions(repo, { schoolCode: TEST_SCHOOL_CODE, bank: loadBank(opts.root) });
  const grades = (await repo.findMany("Grade", { schoolId: school.id })).sort((a, b) => Number(a.level) - Number(b.level));
  const curricula = await repo.findMany("Curriculum", { gradeId: { in: grades.map((g) => g.id) } });
  const skills = await repo.findMany("Skill", { curriculumId: { in: curricula.map((c) => c.id) } }, { select: ["id", "curriculumId", "sequence"] });
  await repo.updateMany("Question", { skillId: { in: skills.map((k) => k.id) } }, { status: "PUBLISHED", publishedAt: now }); // the bank was reviewed
  const levels = grades.map((g) => Number(g.level));
  if (!levels.length) throw new Error("No grades were created for the Test School.");

  log("Accounts and classes…");
  const year = await repo.upsert("AcademicYear", { schoolId: school.id, name: "TEST year" }, { startDate: new Date(now.getTime() - 120 * DAY), endDate: new Date(now.getTime() + 240 * DAY), isCurrent: true });
  const mkUser = (username: string, displayName: string, role: string) => repo.upsert("User", { username }, { displayName, role, schoolId: school.id, passwordHash: opts.passwordHash, mustChangePassword: false });
  await mkUser("test.admin", "Test Admin", "SCHOOL_ADMIN");
  const classes: { klass: Row; teacherUser: Row; students: Row[] }[] = [];
  // batched inserts: a few dozen queries for 200 students instead of hundreds
  const users: Row[] = [], students: Row[] = [], memberships: Row[] = [];
  let n = 0;
  for (const [i, size] of TEST_CLASS_SIZES.entries()) {
    const grade = grades[Math.floor(i / 2) % grades.length];
    const klass = await repo.create("Class", { academicYearId: year.id, name: `TEST ${grade.level}${"AB"[i % 2]}`, schoolId: school.id, gradeId: grade.id });
    const tUser = await mkUser(`test.teacher.${i + 1}`, `Test Teacher ${i + 1}`, "TEACHER");
    const teacher = await repo.upsert("Teacher", { userId: tUser.id }, { schoolId: school.id });
    await repo.create("ClassTeacher", { classId: klass.id, teacherId: teacher.id });
    const mine: Row[] = [];
    for (let k = 0; k < size; k++) {
      n++;
      const tag = String(n).padStart(3, "0");
      const user = { id: newId(), username: `test.student.${tag}`, displayName: `Test Student ${tag}`, role: "STUDENT", schoolId: school.id, passwordHash: opts.passwordHash, mustChangePassword: false };
      const student = { id: newId(), userId: user.id, schoolId: school.id, gradeId: grade.id, studentNumber: `TEST-${tag}` };
      users.push(user); students.push(student); memberships.push({ classId: klass.id, studentId: student.id });
      mine.push({ ...user, studentId: student.id });
    }
    classes.push({ klass, teacherUser: tUser, students: mine });
  }
  for (const [model, rows] of [["User", users], ["Student", students], ["ClassMembership", memberships]] as const)
    for (let i = 0; i < rows.length; i += 100) await repo.createMany(model, rows.slice(i, i + 100));

  log("Assignments (real assignment logic)…");
  let answers = 0;
  const practiceJobs: (() => Promise<void>)[] = [];
  for (const [ci, c] of classes.entries()) {
    const teacher = await resolveActor(repo, c.teacherUser);
    const cur = curricula.find((x) => x.gradeId === c.klass.gradeId)!;
    const pool: string[] = [];
    for (const k of skills.filter((x) => x.curriculumId === cur.id).sort((a, b) => Number(a.sequence) - Number(b.sequence))) {
      if (pool.length >= 5) break;
      // the bank has 5–7 questions per skill; practice repeats questions when a skill's pool runs out
      if ((await loadSkillItems(repo, s(k.id))).length >= 5) pool.push(s(k.id));
    }
    if (pool.length < 5) throw new Error(`Grade ${c.klass.gradeId}: not enough skills with questions for the test assignments.`);
    const ids = c.students.map((x) => s(x.studentId));
    const assignedAt = new Date(now.getTime() - DAY), longAgo = new Date(now.getTime() - 14 * DAY);
    const whole = await assignSkill(repo, teacher, { classId: s(c.klass.id), skillId: pool[0], dueAt: new Date(now.getTime() + 6 * DAY), note: "Practise until you finish." }, assignedAt);
    await assignSkill(repo, teacher, { classId: s(c.klass.id), skillId: pool[1] }, assignedAt); // no due date
    const sel = await assignSkill(repo, teacher, { classId: s(c.klass.id), skillId: pool[2], studentIds: ids.slice(0, 6), dueAt: new Date(now.getTime() + 3 * DAY) }, assignedAt);
    await assignSkill(repo, teacher, { classId: s(c.klass.id), skillId: pool[3], studentIds: [ids[6]], dueAt: new Date(now.getTime() + 10 * DAY) }, assignedAt);
    const old = await assignSkill(repo, teacher, { classId: s(c.klass.id), skillId: pool[4], dueAt: new Date(now.getTime() - 4 * DAY) }, longAgo); // assigned 2 weeks ago: overdue now
    if (opts.practice === "none") continue;
    // Completed (before the due date) · In progress · Not started · Overdue — all from real practice
    practiceJobs.push(async () => {
      // add each result AFTER it arrives (`answers += await …` would read the total too early when classes run in parallel)
      const add = (k: number) => { answers += k; };
      add(await practise(repo, c.students[0], pool[4], { untilCompleted: old.assignmentId, start: new Date(longAgo.getTime() + 2 * DAY) }));
      add(await practise(repo, c.students[1], pool[0], { untilCompleted: whole.assignmentId, start: new Date(now.getTime() - 12 * 3600_000) }));
      for (const st of c.students.slice(2, 5)) add(await practise(repo, st, pool[0], { answers: 2, start: new Date(now.getTime() - 6 * 3600_000) }));
      add(await practise(repo, c.students[0], pool[2], { answers: 1, start: new Date(now.getTime() - 3 * 3600_000) }));
      for (const a of [whole.assignmentId, sel.assignmentId, old.assignmentId]) await refreshSkillAssignment(repo, (await repo.findUnique("Assignment", { id: a }))!, null, now);
      log(`  practice done in class ${ci + 1}/6`);
    });
  }
  if (practiceJobs.length) log("Practice (real adaptive engine, the 6 classes in parallel)…");
  await Promise.all(practiceJobs.map((job) => job())); // classes are independent
  return { ...(await testEnvironmentReport(repo, now)), answers };
}

/** Counts used by the seed report and the final verification. */
export async function testEnvironmentReport(repo: Repo, now = new Date()): Promise<TestEnvReport> {
  const school = await repo.findUnique("School", { code: TEST_SCHOOL_CODE });
  if (!school) return { admins: 0, teachers: 0, students: 0, classes: 0, questions: 0, assignments: 0, statuses: {}, notifications: 0, answers: 0 };
  const users = await repo.findMany("User", { schoolId: school.id }, { select: ["id", "role"] });
  const classes = await repo.findMany("Class", { schoolId: school.id }, { select: ["id"] });
  const assignments = classes.length ? await repo.findMany("Assignment", { classId: { in: classes.map((c) => c.id) } }) : [];
  await refreshSkillAssignments(repo, assignments, null, now);
  const rows = assignments.length ? await repo.findMany("AssignmentStudent", { assignmentId: { in: assignments.map((a) => a.id) } }, { select: ["status"] }) : [];
  const statuses: Record<string, number> = { NOT_STARTED: 0, IN_PROGRESS: 0, COMPLETED: 0, OVERDUE: 0 };
  for (const r of rows) statuses[s(r.status)]++;
  const grades = await repo.findMany("Grade", { schoolId: school.id }, { select: ["id"] });
  const curricula = grades.length ? await repo.findMany("Curriculum", { gradeId: { in: grades.map((g) => g.id) } }, { select: ["id"] }) : [];
  const skills = curricula.length ? await repo.findMany("Skill", { curriculumId: { in: curricula.map((c) => c.id) } }, { select: ["id"] }) : [];
  return {
    admins: users.filter((u) => u.role === "SCHOOL_ADMIN").length, teachers: users.filter((u) => u.role === "TEACHER").length, students: users.filter((u) => u.role === "STUDENT").length,
    classes: classes.length, questions: skills.length ? await repo.count("Question", { skillId: { in: skills.map((k) => k.id) } }) : 0,
    assignments: assignments.length, statuses, notifications: users.length ? await repo.count("Notification", { userId: { in: users.map((u) => u.id) } }) : 0, answers: 0,
  };
}

// ------------------------------------------------------------------ reset

/** Optional links that still mean “belongs to the test school” (deleted, not just cleared). */
const OWNED_OPTIONAL = new Set(["User.schoolId", "AuditLog.actorId"]);

/**
 * Removes the Test School and everything that depends on it. Walks the schema relations from the
 * School row: rows linked by a REQUIRED foreign key are deleted; rows linked by an OPTIONAL one are
 * only unlinked (set empty), except OWNED_OPTIONAL. Deletes children before parents.
 */
export async function resetTestEnvironment(repo: Repo, schemaPath = join(process.cwd(), "prisma/schema.prisma"), code = TEST_SCHOOL_CODE): Promise<Record<string, number>> {
  const school = await repo.findUnique("School", { code });
  if (!school) return {};
  if (school.isDemo !== true && school.isDemo !== 1) throw new Error(`School ${code} is not marked as test data; refusing to delete it.`);
  const schema: Schema = parseSchema(schemaPath);
  const models = [...schema.models.values()];
  // edges: parent model → (child model, fk field, optional?)
  const edges = new Map<string, { child: string; fk: string; optional: boolean }[]>();
  for (const m of models) for (const f of m.fields) {
    if (!f.relation?.fields.length || f.relation.references[0] !== "id") continue;
    const fk = f.relation.fields[0];
    const fkField = m.fields.find((x) => x.name === fk)!;
    const list = edges.get(f.type) ?? [];
    list.push({ child: m.name, fk, optional: fkField.optional && !OWNED_OPTIONAL.has(`${m.name}.${fk}`) });
    edges.set(f.type, list);
  }
  const doomed = new Map<string, Set<string>>([["School", new Set([s(school.id)])]]);
  const joins: { model: string; fk: string; ids: string[] }[] = []; // tables without a single id column
  const unlink: { model: string; fk: string; ids: string[] }[] = [];
  const queue: [string, string[]][] = [["School", [s(school.id)]]];
  while (queue.length) {
    const [parent, ids] = queue.shift()!;
    for (const e of edges.get(parent) ?? []) {
      const child = schema.models.get(e.child)!;
      for (let i = 0; i < ids.length; i += 500) {
        const part = ids.slice(i, i + 500);
        if (e.optional) { unlink.push({ model: e.child, fk: e.fk, ids: part }); continue; }
        if (child.id.length !== 1) { joins.push({ model: e.child, fk: e.fk, ids: part }); continue; }
        const rows = await repo.findMany(e.child, { [e.fk]: { in: part } }, { select: [child.id[0]] });
        const set = doomed.get(e.child) ?? new Set<string>();
        const fresh = rows.map((r) => s(r[child.id[0]])).filter((id) => !set.has(id));
        if (!fresh.length) continue;
        fresh.forEach((id) => set.add(id));
        doomed.set(e.child, set);
        queue.push([e.child, fresh]);
      }
    }
  }
  // order: a model is deleted only after every model that points at it
  const depth = new Map<string, number>();
  const visit = (m: string, d: number, seen: Set<string>) => {
    if (seen.has(m)) return;
    if ((depth.get(m) ?? -1) >= d) return;
    depth.set(m, d);
    seen.add(m);
    for (const e of edges.get(m) ?? []) if (!e.optional) visit(e.child, d + 1, seen);
    seen.delete(m);
  };
  visit("School", 0, new Set());
  const out: Record<string, number> = {};
  return repo.transaction(async (tx) => {
    for (const u of unlink) await tx.updateMany(u.model, { [u.fk]: { in: u.ids } }, { [u.fk]: null });
    for (const j of joins.sort((a, b) => (depth.get(b.model) ?? 0) - (depth.get(a.model) ?? 0))) out[j.model] = (out[j.model] ?? 0) + (await tx.deleteMany(j.model, { [j.fk]: { in: j.ids } }));
    for (const [m, set] of [...doomed].sort((a, b) => (depth.get(b[0]) ?? 0) - (depth.get(a[0]) ?? 0))) {
      const idf = schema.models.get(m)!.id[0];
      const ids = [...set];
      for (let i = 0; i < ids.length; i += 500) out[m] = (out[m] ?? 0) + (await tx.deleteMany(m, { [idf]: { in: ids.slice(i, i + 500) } }));
    }
    return out;
  });
}
