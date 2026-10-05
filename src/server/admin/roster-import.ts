/**
 * Bulk user import from CSV or XLSX (Phase 11).
 *
 * Columns (header row, any order, case-insensitive):
 *   role            STUDENT | TEACHER | PARENT | SCHOOL_ADMIN
 *   username        login name (lowercase letters, digits, . _ -)
 *   display_name    full name (Arabic or English)
 *   student_number  students: school-issued number
 *   grade           students: grade level (4, 5, 6 …)
 *   class           students: their class; teachers: classes taught, separated by ";"
 *   email           optional
 *   title           teachers: optional (Miss, Mr., Ms.)
 *   parent_of       parents: student numbers of their children, separated by ";"
 *   relationship    parents: optional (mother, father, guardian)
 *
 * Two steps, like the Phase 9 results import:
 *   preview  validate every row against the file and the database; nothing is written
 *   apply    the same file (checked by SHA-256) is validated again and, only if there are
 *            no problems, applied in ONE transaction: all rows or none
 * Existing usernames in this school are updated (name, email, class), never given a
 * new password. Classes named in the file that do not exist yet are created in the
 * current academic year (listed in the preview). New users get temporary passwords,
 * returned once as a credentials CSV and stored only as hashes.
 */
import { createHash } from "node:crypto";
import { parseCsv, toCsv } from "../../imports/csv";
import { readXlsx } from "../../imports/xlsx";
import { audit } from "../audit";
import { hashPassword } from "../auth/password";
import { temporaryPassword } from "../auth/passwords-admin";
import { assertCan, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import type { Repo, Row } from "../seeding/repo";
import { cleanName, cleanUsername, MANAGED_ROLES, schoolOf, type ManagedRole } from "./users";

export const ROSTER_COLUMNS = ["role", "username", "display_name", "student_number", "grade", "class", "email", "title", "parent_of", "relationship"] as const;
type Col = (typeof ROSTER_COLUMNS)[number];
export const MAX_ROSTER_ROWS = 3000;

export interface RosterProblem {
  line: number;
  column: string;
  message: string;
}

export interface RosterLine {
  line: number;
  action: "create" | "update";
  role: ManagedRole;
  username: string;
  displayName: string;
  email: string | null;
  studentNumber: string | null;
  grade: number | null;
  classes: string[]; // class names
  title: string | null;
  parentOf: string[]; // student numbers
  relationship: string | null;
  existingUserId: string | null;
}

export interface RosterPlan {
  sha256: string;
  lines: RosterLine[];
  problems: RosterProblem[];
  newClasses: { name: string; grade: number }[];
  summary: { create: number; update: number; byRole: Record<string, number> };
}

const EMAIL = /^[^\s@<>]{1,64}@[^\s@<>]{1,190}\.[A-Za-z]{2,}$/;
const STUDENT_NO = /^[A-Za-z0-9][A-Za-z0-9-]{0,31}$/;
const CLASS_NAME = /^[\p{L}\p{N}][\p{L}\p{N} ._-]{0,19}$/u;

export function readRosterFile(fileName: string, bytes: Uint8Array): string[][] {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".xlsx")) return readXlsx(Buffer.from(bytes));
  if (lower.endsWith(".csv")) return parseCsv(Buffer.from(bytes).toString("utf8"));
  throw new ValidationError("Upload a .csv or .xlsx file.");
}

export function rosterTemplateCsv(): string {
  return toCsv([
    [...ROSTER_COLUMNS],
    ["STUDENT", "s.4001", "Layan Ahmed", "4001", "4", "4A", "", "", "", ""],
    ["TEACHER", "t.huda", "Huda Salem", "", "", "4A;4B", "huda@example.edu.sa", "Miss", "", ""],
    ["PARENT", "p.4001", "Ahmed Ali", "", "", "", "", "", "4001", "father"],
  ]);
}

const split = (v: string) => v.split(/[;،]/).map((x) => x.trim()).filter(Boolean);

export async function planRoster(repo: Repo, actor: Actor, fileName: string, bytes: Uint8Array): Promise<RosterPlan> {
  assertCan(actor, "students:manage");
  assertCan(actor, "teachers:manage");
  assertCan(actor, "classes:manage");
  const schoolId = schoolOf(actor);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const rows = readRosterFile(fileName, bytes);
  if (rows.length < 2) throw new ValidationError("The file has no data rows.");
  if (rows.length - 1 > MAX_ROSTER_ROWS) throw new ValidationError(`Import at most ${MAX_ROSTER_ROWS} rows at a time.`);
  const header = rows[0].map((h) => h.trim().toLowerCase().replace(/[\s-]+/g, "_"));
  const idx = Object.fromEntries(ROSTER_COLUMNS.map((c) => [c, header.indexOf(c)])) as Record<Col, number>;
  const missing = (["role", "username", "display_name"] as Col[]).filter((c) => idx[c] < 0);
  if (missing.length) throw new ValidationError(`Missing column(s): ${missing.join(", ")}. Download the template for the expected columns.`);

  const [users, students, grades, classes, years] = await Promise.all([
    repo.findMany("User", {}),
    repo.findMany("Student", { schoolId }),
    repo.findMany("Grade", { schoolId }),
    repo.findMany("Class", { schoolId }),
    repo.findMany("AcademicYear", { schoolId }),
  ]);
  const currentYear = years.find((y) => y.isCurrent);
  const liveClasses = classes.filter((c) => !c.deletedAt && (!currentYear || c.academicYearId === currentYear.id));
  const gradeLevel = (id: unknown) => Number(grades.find((g) => g.id === id)?.level ?? 0);
  const problems: RosterProblem[] = [];
  const lines: RosterLine[] = [];
  const newClasses = new Map<string, { name: string; grade: number }>(); // key: upper-case name
  const seenUser = new Set<string>(), seenNumber = new Set<string>(), seenEmail = new Set<string>();

  rows.slice(1).forEach((r, i) => {
    const line = i + 2;
    const get = (c: Col) => (idx[c] >= 0 ? String(r[idx[c]] ?? "").trim() : "");
    const bad = (column: Col | "row", message: string) => problems.push({ line, column, message });
    const before = problems.length;
    const role = get("role").toUpperCase() as ManagedRole;
    if (!(MANAGED_ROLES as readonly string[]).includes(role)) bad("role", "Role must be STUDENT, TEACHER, PARENT or SCHOOL_ADMIN.");
    let username = "";
    try { username = cleanUsername(get("username")); } catch (e) { bad("username", (e as Error).message); }
    let displayName = "";
    try { displayName = cleanName(get("display_name"), "Display name"); } catch (e) { bad("display_name", (e as Error).message); }
    if (username && seenUser.has(username)) bad("username", "Username appears more than once in the file.");
    seenUser.add(username);
    const existing = username ? users.find((u) => u.username === username) : undefined;
    if (existing && (existing.schoolId !== schoolId || existing.role === "SUPER_ADMIN")) bad("username", "Username is already used by another account.");
    if (existing && existing.role !== role && (MANAGED_ROLES as readonly string[]).includes(role)) bad("role", `Existing user is a ${String(existing.role)}; roles cannot be changed by import.`);
    const email = get("email").toLowerCase() || null;
    if (email && !EMAIL.test(email)) bad("email", "Email address is not valid.");
    if (email && (seenEmail.has(email) || users.some((u) => u.email === email && u.username !== username))) bad("email", "Email address is already used.");
    if (email) seenEmail.add(email);

    let studentNumber: string | null = null, grade: number | null = null;
    const classNames = split(get("class"));
    for (const c of classNames) if (!CLASS_NAME.test(c)) bad("class", `"${c}" is not a valid class name.`);
    if (role === "STUDENT") {
      studentNumber = get("student_number");
      if (!STUDENT_NO.test(studentNumber)) bad("student_number", "Student number is required (letters, digits and dashes).");
      else if (seenNumber.has(studentNumber)) bad("student_number", "Student number appears more than once in the file.");
      else {
        const other = students.find((s) => s.studentNumber === studentNumber);
        if (other && other.userId !== existing?.id) bad("student_number", `Student number ${studentNumber} belongs to another student.`);
      }
      seenNumber.add(studentNumber);
      grade = Number(get("grade"));
      if (!grades.some((g) => Number(g.level) === grade)) bad("grade", `Grade "${get("grade")}" does not exist in this school.`);
      if (classNames.length > 1) bad("class", "A student belongs to one class.");
      if (existing) {
        const st = students.find((s) => s.userId === existing.id);
        if (st && st.studentNumber !== studentNumber) bad("student_number", "Student numbers cannot be changed by import.");
      }
    }
    if (role === "PARENT" && !split(get("parent_of")).length && !existing) bad("parent_of", "List the student number(s) of this parent's children.");
    if ((role === "PARENT" || role === "SCHOOL_ADMIN") && classNames.length) bad("class", "Only students and teachers have classes.");

    // classes: existing ones must match the student's grade; missing ones are created
    for (const c of classNames) {
      const found = liveClasses.find((x) => String(x.name).toLowerCase() === c.toLowerCase());
      if (found) {
        if (role === "STUDENT" && grade && gradeLevel(found.gradeId) !== grade) bad("class", `Class ${c} is a Grade ${gradeLevel(found.gradeId)} class.`);
      } else if (role === "STUDENT" && grade) {
        const g = newClasses.get(c.toUpperCase());
        if (g && g.grade !== grade) bad("class", `Class ${c} is used for two different grades in this file.`);
        else if (!g) newClasses.set(c.toUpperCase(), { name: c, grade });
      } // teachers may name only existing classes or ones created for students in this file (checked below)
    }
    if (problems.length > before) return;
    lines.push({
      line, action: existing ? "update" : "create", role, username, displayName, email, studentNumber, grade,
      classes: classNames, title: get("title") || null, parentOf: split(get("parent_of")), relationship: get("relationship") || null,
      existingUserId: existing ? String(existing.id) : null,
    });
  });

  if (!currentYear && newClasses.size) problems.push({ line: 1, column: "class", message: "Set up the current academic year before creating classes by import." });
  const knownClass = (c: string) => liveClasses.some((x) => String(x.name).toLowerCase() === c.toLowerCase()) || newClasses.has(c.toUpperCase());
  const numbersInFile = new Set(lines.filter((l) => l.role === "STUDENT").map((l) => l.studentNumber));
  for (const l of lines) {
    if (l.role === "TEACHER") for (const c of l.classes) if (!knownClass(c)) problems.push({ line: l.line, column: "class", message: `Class ${c} does not exist and no student in this file is placed in it.` });
    if (l.role === "PARENT") for (const n of l.parentOf) if (!numbersInFile.has(n) && !students.some((s) => s.studentNumber === n)) problems.push({ line: l.line, column: "parent_of", message: `No student with number ${n}.` });
  }
  problems.sort((a, b) => a.line - b.line);
  const byRole: Record<string, number> = {};
  for (const l of lines.filter((x) => x.action === "create")) byRole[l.role] = (byRole[l.role] ?? 0) + 1;
  return {
    sha256, lines, problems,
    newClasses: [...newClasses.values()],
    summary: { create: lines.filter((l) => l.action === "create").length, update: lines.filter((l) => l.action === "update").length, byRole },
  };
}

export interface RosterResult {
  created: number;
  updated: number;
  classesCreated: number;
  links: number;
  /** username, display name, role, temporary password — for NEW users only; shown once. */
  credentialsCsv: string;
}

export async function applyRoster(repo: Repo, actor: Actor, fileName: string, bytes: Uint8Array, expectedSha256: string, now = new Date()): Promise<RosterResult> {
  const plan = await planRoster(repo, actor, fileName, bytes);
  if (plan.sha256 !== expectedSha256) throw new ValidationError("This is not the file you previewed. Preview it again before importing.");
  if (plan.problems.length) throw new ValidationError(`The file still has ${plan.problems.length} problem(s). Fix them and preview again.`);
  const schoolId = schoolOf(actor);
  // hash passwords before the transaction (scrypt is deliberately slow)
  const creds: [string, string, string, string][] = [];
  const hashes = new Map<string, string>();
  for (const l of plan.lines.filter((x) => x.action === "create")) {
    const temp = temporaryPassword();
    hashes.set(l.username, await hashPassword(temp));
    creds.push([l.username, l.displayName, l.role, temp]);
  }
  const res = await repo.transaction(async (tx) => {
    let classesCreated = 0, links = 0;
    const years = await tx.findMany("AcademicYear", { schoolId });
    const year = years.find((y) => y.isCurrent);
    const grades = await tx.findMany("Grade", { schoolId });
    const classId = new Map<string, string>();
    for (const c of (await tx.findMany("Class", { schoolId })).filter((c) => !c.deletedAt && (!year || c.academicYearId === year.id))) classId.set(String(c.name).toLowerCase(), String(c.id));
    for (const c of plan.newClasses) {
      const g = grades.find((x) => Number(x.level) === c.grade)!;
      const row = await tx.create("Class", { schoolId, gradeId: g.id, academicYearId: year!.id, name: c.name, createdAt: now });
      classId.set(c.name.toLowerCase(), String(row.id));
      classesCreated++;
    }
    const studentIdByNumber = new Map((await tx.findMany("Student", { schoolId })).map((s) => [String(s.studentNumber), String(s.id)]));
    const order: ManagedRole[] = ["SCHOOL_ADMIN", "TEACHER", "STUDENT", "PARENT"];
    for (const l of [...plan.lines].sort((a, b) => order.indexOf(a.role) - order.indexOf(b.role))) {
      let userId = l.existingUserId;
      if (!userId) {
        const u = await tx.create("User", { username: l.username, displayName: l.displayName, email: l.email, role: l.role, schoolId, passwordHash: hashes.get(l.username), mustChangePassword: true, isActive: true, createdAt: now, updatedAt: now });
        userId = String(u.id);
        if (l.role === "TEACHER") await tx.create("Teacher", { userId, schoolId, title: l.title });
        if (l.role === "PARENT") await tx.create("Parent", { userId });
        if (l.role === "STUDENT") {
          const st = await tx.create("Student", { userId, schoolId, gradeId: grades.find((g) => Number(g.level) === l.grade)!.id, studentNumber: l.studentNumber, createdAt: now });
          studentIdByNumber.set(l.studentNumber!, String(st.id));
        }
      } else {
        await tx.updateMany("User", { id: userId }, { displayName: l.displayName, ...(l.email ? { email: l.email } : {}), updatedAt: now });
        if (l.role === "TEACHER" && l.title) await tx.updateMany("Teacher", { userId }, { title: l.title });
      }
      if (l.role === "STUDENT" && l.classes.length) {
        const sid = studentIdByNumber.get(l.studentNumber!)!;
        const target = classId.get(l.classes[0].toLowerCase())!;
        const open = await tx.findMany("ClassMembership", { studentId: sid, leftAt: null });
        if (!(open.length === 1 && open[0].classId === target)) {
          for (const m of open) await tx.updateMany("ClassMembership", { classId: m.classId, studentId: sid }, { leftAt: now });
          if (await tx.findUnique("ClassMembership", { classId: target, studentId: sid })) await tx.updateMany("ClassMembership", { classId: target, studentId: sid }, { leftAt: null, joinedAt: now });
          else await tx.create("ClassMembership", { classId: target, studentId: sid, joinedAt: now });
        }
      }
      if (l.role === "TEACHER") {
        const t = (await tx.findUnique("Teacher", { userId }))!;
        for (const c of l.classes) {
          const cid = classId.get(c.toLowerCase())!;
          if (!(await tx.findUnique("ClassTeacher", { classId: cid, teacherId: t.id }))) await tx.create("ClassTeacher", { classId: cid, teacherId: t.id });
        }
      }
      if (l.role === "PARENT") {
        const p = (await tx.findUnique("Parent", { userId }))!;
        for (const n of l.parentOf) {
          await tx.upsert("ParentStudent", { parentId: p.id, studentId: studentIdByNumber.get(n)! }, { relationship: l.relationship }, l.relationship ? { relationship: l.relationship } : {});
          links++;
        }
      }
    }
    await audit(tx, {
      actorId: actor.userId, action: "roster.import", entityType: "School", entityId: schoolId,
      after: { file: fileName, sha256: plan.sha256, created: plan.summary.create, updated: plan.summary.update, byRole: plan.summary.byRole, classesCreated, links }, at: now,
    });
    return { classesCreated, links };
  });
  return {
    created: plan.summary.create, updated: plan.summary.update, ...res,
    credentialsCsv: toCsv([["username", "display_name", "role", "temporary_password"], ...creds]),
  };
}

export type { Row };
