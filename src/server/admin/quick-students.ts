/**
 * ⚡ Quick add students: paste the names of a class (one per line) → accounts with a username made from the
 * name, a student number (when the school has none) and a temporary password — printed as sign-in cards.
 *
 * The same name → username rule is used by the roster template the platform team builds from a school list,
 * so a student keeps the same username whichever way they were added.
 */
import { assertCan, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import type { Repo } from "../seeding/repo";
import { createUser, schoolOf } from "./users";

const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));
const JOIN = new Set(["al", "el", "bin", "bint", "abu", "abd", "ibn", "bu"]);
const ascii = (v: string) => v.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").trim();

/** “Abdulaziz Abdullah Al Mulhim” → [“abdulaziz.almulhim”, “abdulaziz.abdullah.almulhim”]; then numbers are added. */
export function usernameCandidates(name: string): string[] {
  const t = ascii(name).split(/\s+/).filter(Boolean);
  if (!t.length) return [];
  // family names: “Al Mulhim” → “almulhim”
  const words: string[] = [];
  for (let i = 0; i < t.length; i++) {
    if (JOIN.has(t[i]) && i + 1 < t.length && i > 0) { words.push(t[i] + t[i + 1]); i++; } else words.push(t[i]);
  }
  const cut = (v: string) => v.slice(0, 40).replace(/[._-]+$/, "");
  const first = words[0], last = words[words.length - 1];
  const out = words.length === 1 ? [first.length >= 3 ? first : `${first}.student`] : [`${first}.${last}`];
  if (words.length >= 3) out.push(`${first}.${words[1]}.${last}`);
  return out.map(cut).filter((u) => /^[a-z0-9][a-z0-9._-]{2,39}$/.test(u));
}

/** A free username for this name (taken: usernames already used, lower case). */
export function pickUsername(name: string, taken: Set<string>): string {
  const c = usernameCandidates(name);
  const base = c[0] ?? "student";
  for (const u of c) if (!taken.has(u)) { taken.add(u); return u; }
  for (let k = 2; ; k++) { const u = `${base.slice(0, 37)}${k}`; if (!taken.has(u)) { taken.add(u); return u; } }
}

/** Student numbers for students who have none: AJ26-001, AJ26-002 … (after the highest one already used). */
export function nextNumbers(used: string[], n: number, year: number): string[] {
  const prefix = `AJ${String(year % 100).padStart(2, "0")}-`;
  let max = 0;
  for (const u of used) { const m = u.match(/^AJ\d{2}-(\d+)$/i); if (m && u.toUpperCase().startsWith(prefix)) max = Math.max(max, Number(m[1])); }
  const usedSet = new Set(used.map((x) => x.toUpperCase()));
  const out: string[] = [];
  while (out.length < n) { max++; const v = `${prefix}${String(max).padStart(3, "0")}`; if (!usedSet.has(v)) out.push(v); }
  return out;
}

export interface QuickLine { name: string; number: string | null }
/** One student per line: “Name” or “Name, number” (comma, tab or semicolon). Empty lines are skipped. */
export function parseQuickLines(text: string): QuickLine[] {
  return s(text).split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => {
    const parts = l.split(/\t|;|,/).map((x) => x.trim()).filter(Boolean);
    const num = parts.length > 1 && /^[A-Za-z0-9][A-Za-z0-9-]{0,31}$/.test(parts[parts.length - 1]) && /\d/.test(parts[parts.length - 1]) ? parts.pop()! : null;
    return { name: parts.join(" ").replace(/^\d+[.)-]\s*/, "").replace(/\s+/g, " ").trim(), number: num };
  }).filter((x) => x.name);
}

export interface QuickResult { created: { name: string; username: string; number: string; password: string }[]; skipped: { name: string; reason: string }[]; className: string }

/** Adds the pasted students to one class (admin). A name already in the class is skipped (no duplicates). */
export async function quickAddStudents(repo: Repo, actor: Actor, input: { classId: string; text: string }, now = new Date()): Promise<QuickResult> {
  assertCan(actor, "students:manage");
  const schoolId = schoolOf(actor);
  const klass = await repo.findUnique("Class", { id: input.classId });
  if (!klass || s(klass.schoolId) !== schoolId || klass.deletedAt) throw new ValidationError("Choose a class.");
  const grade = Number((await repo.findUnique("Grade", { id: klass.gradeId }))?.level ?? 0);
  const lines = parseQuickLines(input.text);
  if (!lines.length) throw new ValidationError("Paste at least one student name (one per line).");
  if (lines.length > 60) throw new ValidationError("Add at most 60 students at a time (one class).");
  const [users, students, members] = await Promise.all([
    repo.findMany("User", {}, { select: ["id", "username", "displayName"] }),
    repo.findMany("Student", { schoolId }, { select: ["id", "userId", "studentNumber"] }),
    repo.findMany("ClassMembership", { classId: input.classId, leftAt: null }, { select: ["studentId"] }),
  ]);
  const taken = new Set(users.map((u) => s(u.username).toLowerCase()));
  const key = (n: string) => ascii(n).split(/\s+/).sort().join(" ");
  const inClass = new Set(members.map((m) => {
    const st = students.find((x) => x.id === m.studentId); const u = st && users.find((x) => x.id === st.userId);
    return u ? key(s(u.displayName)) : "";
  }));
  const fresh = nextNumbers(students.map((x) => s(x.studentNumber)), lines.filter((l) => !l.number).length, now.getUTCFullYear());
  const usedNumbers = new Set(students.map((x) => s(x.studentNumber).toUpperCase()));
  const out: QuickResult = { created: [], skipped: [], className: s(klass.name) };
  for (const l of lines) {
    if (inClass.has(key(l.name))) { out.skipped.push({ name: l.name, reason: "already in this class" }); if (!l.number) fresh.shift(); continue; }
    const number = l.number ?? fresh.shift()!;
    if (usedNumbers.has(number.toUpperCase())) { out.skipped.push({ name: l.name, reason: `student number ${number} is already used` }); continue; }
    const username = pickUsername(l.name, taken);
    try {
      const r = await createUser(repo, actor, { role: "STUDENT", username, displayName: l.name, studentNumber: number, gradeLevel: grade, classId: input.classId }, now);
      usedNumbers.add(number.toUpperCase()); inClass.add(key(l.name));
      out.created.push({ name: l.name, username, number, password: r.temporaryPassword });
    } catch (e) {
      if (e instanceof ValidationError) { out.skipped.push({ name: l.name, reason: e.message }); continue; }
      throw e;
    }
  }
  return out;
}
