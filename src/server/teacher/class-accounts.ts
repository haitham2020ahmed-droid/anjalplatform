/**
 * 👥 The class teacher's student accounts (Teacher Home quick buttons, UI reorg Phase 3).
 *
 *   addClassStudent        Add Student: the username only (a full name is optional); password = username
 *   planClassRoster        Upload Roster, step 1: read the file (names + usernames), validate, preview — nothing written
 *   applyClassRoster       Upload Roster, step 2: the same file (SHA-256) again, only when it has no errors; all or nothing
 *   classAccounts          Download Accounts: Student Name | Username | Password (the password is shown only when it IS
 *                          the username; otherwise "set by admin / reset to show")
 *   resetToUsername        sets one student's password back to their username (own students only)
 *
 * Rules: only the class's own teacher (or the school admin) — checked on the server for every call
 * (assertClassAccess); students are only ever added to THAT class. The owner asked that a student added by the
 * teacher signs in with password = username, whatever the school-wide setting. Reuses the admin pieces: the
 * username/name rules (users.ts), the file reader (roster-import.ts), the student-number series (quick-students.ts).
 */
import { createHash } from "node:crypto";
import { toCsv } from "../../imports/csv";
import { workbookXlsx } from "../../imports/questions/template-files";
import { audit } from "../audit";
import { hashPassword, verifyPassword } from "../auth/password";
import { revokeAllSessions } from "../auth/sessions";
import { ForbiddenError, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import type { Repo, Row } from "../seeding/repo";
import { cleanName, cleanUsername } from "../admin/users";
import { readRosterFile } from "../admin/roster-import";
import { nextNumbers } from "../admin/quick-students";
import { assertClassAccess } from "./assignments";

const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));
/** One class at a time. */
export const MAX_CLASS_ROSTER_ROWS = 80;
export const CLASS_ROSTER_COLUMNS = ["student_name", "username"] as const;
/** Shown instead of a password that is not the username (it is stored only as a hash). */
export const PASSWORD_HIDDEN = "set by admin / reset to show";

function staffOnly(actor: Actor) {
  if (actor.role !== "TEACHER" && actor.role !== "SCHOOL_ADMIN" && actor.role !== "SUPER_ADMIN") throw new ForbiddenError("Only the class teacher or the admin can do this.");
}

/** The class, if this actor is its teacher (or the school's admin). */
export async function ownClass(repo: Repo, actor: Actor, classId: string): Promise<Row> {
  staffOnly(actor);
  if (!classId) throw new ValidationError("Choose a class.");
  return assertClassAccess(repo, actor, classId);
}

/** Free student numbers (AJ26-001 …) for new students: only this year's series is read, not the whole table. */
async function freshNumbers(repo: Repo, schoolId: string, n: number, now: Date): Promise<string[]> {
  const prefix = `AJ${String(now.getUTCFullYear() % 100).padStart(2, "0")}-`;
  const used = await repo.findMany("Student", { schoolId, studentNumber: { contains: prefix } }, { select: ["studentNumber"] });
  return nextNumbers(used.map((x) => s(x.studentNumber)), n, now.getUTCFullYear());
}

interface NewStudent { username: string; name: string; number: string; hash: string }

async function createStudents(repo: Repo, actor: Actor, klass: Row, list: NewStudent[], now: Date, via: string): Promise<{ userId: string; studentId: string; username: string }[]> {
  const schoolId = s(klass.schoolId);
  const out = await repo.transaction(async (tx) => {
    const made: { userId: string; studentId: string; username: string }[] = [];
    for (const x of list) {
      const u = await tx.create("User", { username: x.username, displayName: x.name, email: null, role: "STUDENT", schoolId, passwordHash: x.hash, mustChangePassword: false, isActive: true, createdAt: now, updatedAt: now });
      const st = await tx.create("Student", { userId: u.id, schoolId, gradeId: klass.gradeId, studentNumber: x.number, createdAt: now });
      await tx.create("ClassMembership", { classId: klass.id, studentId: st.id, joinedAt: now });
      made.push({ userId: s(u.id), studentId: s(st.id), username: x.username });
    }
    return made;
  });
  for (const m of out) await audit(repo, { actorId: actor.userId, action: "user.create", entityType: "User", entityId: m.userId, after: { username: m.username, role: "STUDENT", classId: s(klass.id), via, password: "username" }, at: now });
  return out;
}

async function takenUsernames(repo: Repo, usernames: string[]): Promise<Set<string>> {
  const out = new Set<string>();
  for (let i = 0; i < usernames.length; i += 200) {
    const part = usernames.slice(i, i + 200);
    if (part.length) for (const u of await repo.findMany("User", { username: { in: part } }, { select: ["username"] })) out.add(s(u.username).toLowerCase());
  }
  return out;
}

// ------------------------------------------------------------------ Add Student

export interface AddedStudent { userId: string; studentId: string; name: string; username: string; password: string; className: string }

/** Add Student: username only (password = username, no forced change); the full name is optional. */
export async function addClassStudent(repo: Repo, actor: Actor, input: { classId: string; username: string; name?: string | null }, now = new Date()): Promise<AddedStudent> {
  const klass = await ownClass(repo, actor, input.classId);
  const username = cleanUsername(input.username);
  const name = s(input.name).trim() ? cleanName(input.name, "Student name") : username;
  if ((await takenUsernames(repo, [username])).size) throw new ValidationError(`Username "${username}" is already taken.`);
  const [number] = await freshNumbers(repo, s(klass.schoolId), 1, now);
  const [made] = await createStudents(repo, actor, klass, [{ username, name, number, hash: await hashPassword(username) }], now, "teacher.add");
  return { ...made, name, password: username, className: s(klass.name) };
}

// ------------------------------------------------------------------ Upload Roster

export interface ClassRosterLine { line: number; name: string; username: string; password: string }
export interface ClassRosterProblem { line: number; column: string; message: string }
export interface ClassRosterPlan { sha256: string; className: string; lines: ClassRosterLine[]; problems: ClassRosterProblem[] }

/** The template: Student Name | Username (fictional examples — replace them with your class). */
export function classRosterTemplateCsv(): string {
  return toCsv([["Student Name", "Username"], ["Sample Student One", "sample.one"], ["Sample Student Two", "sample.two"]]);
}

const HEADER_NAME = new Set(["student_name", "name", "display_name", "full_name", "student"]);
const HEADER_USER = new Set(["username", "user_name", "login", "user"]);

/** Step 1 — validate and preview (nothing is written). */
export async function planClassRoster(repo: Repo, actor: Actor, classId: string, fileName: string, bytes: Uint8Array): Promise<ClassRosterPlan> {
  const klass = await ownClass(repo, actor, classId);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const rows = readRosterFile(fileName, bytes).filter((r) => r.some((c) => s(c).trim()));
  if (rows.length < 2) throw new ValidationError("The file has no student rows. Download the template for the columns.");
  if (rows.length - 1 > MAX_CLASS_ROSTER_ROWS) throw new ValidationError(`Upload at most ${MAX_CLASS_ROSTER_ROWS} students at a time (one class).`);
  const header = rows[0].map((h) => s(h).trim().toLowerCase().replace(/[\s-]+/g, "_"));
  const iName = header.findIndex((h) => HEADER_NAME.has(h)), iUser = header.findIndex((h) => HEADER_USER.has(h));
  if (iName < 0 || iUser < 0) throw new ValidationError(`Missing column(s): ${[iName < 0 ? "Student Name" : "", iUser < 0 ? "Username" : ""].filter(Boolean).join(", ")}. Download the template for the columns.`);
  const problems: ClassRosterProblem[] = [];
  const lines: ClassRosterLine[] = [];
  const seen = new Map<string, number>();
  rows.slice(1).forEach((r, i) => {
    const line = i + 2;
    const before = problems.length;
    let name = "", username = "";
    const rawName = s(r[iName]).trim(), rawUser = s(r[iUser]).trim();
    if (!rawName) problems.push({ line, column: "Student Name", message: "Student name is missing." });
    else { try { name = cleanName(rawName, "Student name"); } catch (e) { problems.push({ line, column: "Student Name", message: (e as Error).message }); } }
    if (!rawUser) problems.push({ line, column: "Username", message: "Username is missing." });
    else { try { username = cleanUsername(rawUser); } catch (e) { problems.push({ line, column: "Username", message: (e as Error).message }); } }
    if (username && seen.has(username)) problems.push({ line, column: "Username", message: `Duplicate username: also on line ${seen.get(username)}.` });
    if (username && !seen.has(username)) seen.set(username, line);
    if (problems.length === before) lines.push({ line, name, username, password: username });
  });
  const taken = await takenUsernames(repo, lines.map((l) => l.username));
  for (const l of lines) if (taken.has(l.username)) problems.push({ line: l.line, column: "Username", message: `Username "${l.username}" is already taken.` });
  problems.sort((a, b) => a.line - b.line);
  const bad = new Set(problems.map((p) => p.line));
  return { sha256, className: s(klass.name), lines: lines.filter((l) => !bad.has(l.line)), problems };
}

/** Step 2 — save: the same file, checked again; nothing is saved while any row has an error. */
export async function applyClassRoster(repo: Repo, actor: Actor, classId: string, fileName: string, bytes: Uint8Array, expectedSha256: string, now = new Date()): Promise<{ created: number; className: string; accounts: ClassRosterLine[] }> {
  const plan = await planClassRoster(repo, actor, classId, fileName, bytes);
  if (plan.sha256 !== expectedSha256) throw new ValidationError("The file changed since the preview. Preview it again.");
  if (plan.problems.length) throw new ValidationError(`Fix the ${plan.problems.length} row error(s) first: nothing was saved.`);
  if (!plan.lines.length) throw new ValidationError("No students to add.");
  const klass = await ownClass(repo, actor, classId);
  const numbers = await freshNumbers(repo, s(klass.schoolId), plan.lines.length, now);
  const list: NewStudent[] = [];
  for (let i = 0; i < plan.lines.length; i += 4) {
    const part = plan.lines.slice(i, i + 4);
    const hashes = await Promise.all(part.map((l) => hashPassword(l.username)));
    part.forEach((l, k) => list.push({ username: l.username, name: l.name, number: numbers[i + k], hash: hashes[k] }));
  }
  await createStudents(repo, actor, klass, list, now, "teacher.roster");
  return { created: list.length, className: plan.className, accounts: plan.lines };
}

// ------------------------------------------------------------------ Download Accounts

export interface AccountRow { userId: string; studentId: string; name: string; username: string; number: string; password: string | null }
export interface ClassAccounts { classId: string; className: string; grade: number; schoolName: string; rows: AccountRow[] }

/**
 * The class's student accounts. A password is shown only when it is exactly the username (checked against the
 * stored hash, 4 at a time); any other password is never readable and shows as "set by admin / reset to show".
 */
export async function classAccounts(repo: Repo, actor: Actor, classId: string): Promise<ClassAccounts> {
  const klass = await ownClass(repo, actor, classId);
  const [members, grade, school] = await Promise.all([
    repo.findMany("ClassMembership", { classId, leftAt: null }, { select: ["studentId"] }),
    repo.findUnique("Grade", { id: klass.gradeId }),
    repo.findUnique("School", { id: klass.schoolId }),
  ]);
  const students = members.length ? await repo.findMany("Student", { id: { in: members.map((m) => s(m.studentId)) } }, { select: ["id", "userId", "studentNumber"] }) : [];
  const users = students.length ? await repo.findMany("User", { id: { in: students.map((x) => s(x.userId)) }, role: "STUDENT", deletedAt: null }, { select: ["id", "username", "displayName", "passwordHash", "isActive"] }) : [];
  const userOf = new Map(users.filter((u) => u.isActive !== false && u.isActive !== 0).map((u) => [s(u.id), u]));
  const live = students.filter((x) => userOf.has(s(x.userId)));
  const rows: AccountRow[] = [];
  for (let i = 0; i < live.length; i += 4) {
    const part = live.slice(i, i + 4);
    const same = await Promise.all(part.map((x) => { const u = userOf.get(s(x.userId))!; return u.passwordHash ? verifyPassword(s(u.username), s(u.passwordHash)).catch(() => false) : Promise.resolve(false); }));
    part.forEach((x, k) => { const u = userOf.get(s(x.userId))!; rows.push({ userId: s(u.id), studentId: s(x.id), name: s(u.displayName), username: s(u.username), number: s(x.studentNumber), password: same[k] ? s(u.username) : null }); });
  }
  rows.sort((a, b) => a.name.localeCompare(b.name));
  return { classId, className: s(klass.name), grade: Number(grade?.level ?? 0), schoolName: s(school?.name), rows };
}

/** Sets one of the teacher's own students' password back to their username (signs them out everywhere). */
export async function resetToUsername(repo: Repo, actor: Actor, classId: string, studentId: string, now = new Date()): Promise<{ username: string }> {
  const klass = await ownClass(repo, actor, classId);
  const member = (await repo.findMany("ClassMembership", { classId: klass.id, studentId, leftAt: null }, { select: ["studentId"] }))[0];
  if (!member) {
    await audit(repo, { actorId: actor.userId, action: "user.password.reset.denied", entityType: "Student", entityId: studentId, at: now });
    throw new ForbiddenError("This student is not in your class.");
  }
  const st = (await repo.findUnique("Student", { id: studentId }))!;
  const u = await repo.findUnique("User", { id: st.userId });
  if (!u || u.role !== "STUDENT") throw new ForbiddenError("Student not found.");
  await repo.updateMany("User", { id: u.id, role: "STUDENT" }, { passwordHash: await hashPassword(s(u.username)), mustChangePassword: false, failedLogins: 0, lockedUntil: null, passwordChangedAt: now });
  await revokeAllSessions(repo, s(u.id));
  await audit(repo, { actorId: actor.userId, action: "user.password.reset", entityType: "User", entityId: s(u.id), after: { to: "username", via: "teacher.accounts" }, at: now });
  return { username: s(u.username) };
}

// ------------------------------------------------------------------ files

/** Excel: one sheet "Accounts" with Student Name | Username | Password. */
export function accountsXlsx(a: ClassAccounts): Uint8Array {
  return workbookXlsx([{ name: "Accounts", headerStyle: true, freeze: true, widths: [34, 26, 30], rows: [["Student Name", "Username", "Password"], ...a.rows.map((r) => [r.name, r.username, r.password ?? PASSWORD_HIDDEN])] }]);
}

/** The roster template as Excel (same columns as the CSV). */
export function classRosterTemplateXlsx(): Uint8Array {
  return workbookXlsx([{ name: "Roster", headerStyle: true, freeze: true, widths: [34, 26], rows: [["Student Name", "Username"], ["Sample Student One", "sample.one"], ["Sample Student Two", "sample.two"]] }]);
}

/** A file name part from a class name ("4A" → "4A"; anything else → "_"). */
export const fileSafe = (v: string) => v.replace(/[^A-Za-z0-9-]+/g, "_").slice(0, 40) || "class";
