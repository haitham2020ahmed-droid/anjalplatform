/**
 * 👥 Reports audit 8 Nov 2026: POSSIBLE duplicate students. A class can hold the same child twice — e.g. "Jalawi" and
 * "BIN FAISAL, JALAWI" (a roster or MAP file in "LAST, FIRST" form added a second account). Every report then counts
 * the class wrong ("10 of 40 active" for a class of 28). This lists, per class, pairs whose names look alike — every
 * word of the shorter name matches a word of the longer one (case, commas, hyphens and small spelling differences such
 * as Hussien/Hussein, Moayad/Moayyed ignored) — with each account's answers and last sign-in, so the admin can archive
 * the empty one (reversible: Restore brings it back). Nothing is changed here.
 *
 * 🩹 Nov 2026 fix (found while chasing a "MAP plan not showing" report): the "likely extra" pick used to look only
 * at QuestionAttempt answers. A duplicate made by a MAP roster/CDF import can carry the real MapResult rows (the
 * student's actual NWEA scores) while having zero practice answers — the old heuristic then pointed the admin at
 * archiving exactly that account, silently losing the child's MAP history and leaving every MAP plan/report tied to
 * an empty shell. Now an account holding MapResult rows is never the one marked "likely extra" while the other side
 * has none; answers-only still decides when neither (or both) side has MAP rows.
 */
import { ForbiddenError, type Actor } from "../auth/rbac";
import type { Repo } from "../seeding/repo";
import { countGroups } from "../db/group-count";

const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));

/** The words of a name: lower case, commas / hyphens / dots removed ("Al-Salman" → "alsalman"). */
export function nameWords(name: string): string[] {
  return s(name).normalize("NFKC").toLowerCase().replace(/[-'’.]/g, "").replace(/[,_/]+/g, " ").split(/\s+/).filter(Boolean);
}
function close(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.min(a.length, b.length) < 5) return false;
  // edit distance ≤ 2 (small spelling differences)
  const m = a.length, n = b.length;
  if (Math.abs(m - n) > 2) return false;
  let prev = Array.from({ length: n + 1 }, (_x, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n] <= 2;
}
/** Every word of the shorter name matches a different word of the longer one. */
export function looksLikeSameName(x: string, y: string): boolean {
  const a = nameWords(x), b = nameWords(y);
  if (!a.length || !b.length) return false;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  const used = new Set<number>();
  for (const w of short) {
    const i = long.findIndex((v, k) => !used.has(k) && close(w, v));
    if (i < 0) return false;
    used.add(i);
  }
  return true;
}

export interface DupAccount { studentId: string; name: string; username: string; answers: number; /** 🩹 Nov 2026: real NWEA MAP import rows (MapResult) on this account */ mapScores: number; lastLogin: string | null }
export interface DupPair { classId: string; className: string; a: DupAccount; b: DupAccount; /** the likely extra account, if exactly one (see the MapResult-aware note above) */ empty: string | null }

export async function possibleDuplicateStudents(repo: Repo, actor: Actor): Promise<DupPair[]> {
  if (actor.role !== "SCHOOL_ADMIN" && actor.role !== "SUPER_ADMIN") throw new ForbiddenError("Only a school admin can do this.");
  if (!actor.schoolId) throw new ForbiddenError("Choose a school first.");
  const classes = await repo.findMany("Class", { schoolId: actor.schoolId, deletedAt: null }, { select: ["id", "name"] });
  if (!classes.length) return [];
  const mem = await repo.findMany("ClassMembership", { classId: { in: classes.map((c) => s(c.id)) }, leftAt: null }, { select: ["classId", "studentId"] });
  const sids = [...new Set(mem.map((m) => s(m.studentId)))];
  if (!sids.length) return [];
  const students = await repo.findMany("Student", { id: { in: sids }, deletedAt: null }, { select: ["id", "userId"] });
  const users = await repo.findMany("User", { id: { in: students.map((x) => s(x.userId)) } }, { select: ["id", "displayName", "username", "lastLoginAt"] });
  const uOf = new Map(users.map((u) => [s(u.id), u]));
  const acc = new Map<string, DupAccount>(students.map((st): [string, DupAccount] => {
    const u = uOf.get(s(st.userId));
    const last = u?.lastLoginAt ? new Date(u.lastLoginAt instanceof Date ? u.lastLoginAt.getTime() : String(u.lastLoginAt)) : null;
    return [s(st.id), { studentId: s(st.id), name: s(u?.displayName), username: s(u?.username), answers: 0, mapScores: 0, lastLogin: last && !Number.isNaN(last.getTime()) ? last.toISOString().slice(0, 10) : null }];
  }));
  const pairs: DupPair[] = [];
  for (const c of classes) {
    const list = mem.filter((m) => s(m.classId) === s(c.id)).map((m) => acc.get(s(m.studentId))).filter((x): x is DupAccount => Boolean(x && x.name));
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      if (looksLikeSameName(list[i].name, list[j].name)) pairs.push({ classId: s(c.id), className: s(c.name), a: { ...list[i] }, b: { ...list[j] }, empty: null });
    }
  }
  if (!pairs.length) return [];
  const ids = [...new Set(pairs.flatMap((p) => [p.a.studentId, p.b.studentId]))];
  const counts = new Map<string, number>();
  const mapCounts = new Map<string, number>();
  for (let i = 0; i < ids.length; i += 1000) {
    const part = ids.slice(i, i + 1000);
    for (const [id, n] of await countGroups(repo, "QuestionAttempt", "studentId", { studentId: { in: part } })) counts.set(id, n);
    for (const [id, n] of await countGroups(repo, "MapResult", "studentId", { studentId: { in: part } })) mapCounts.set(id, n);
  }
  for (const p of pairs) {
    p.a.answers = counts.get(p.a.studentId) ?? 0; p.b.answers = counts.get(p.b.studentId) ?? 0;
    p.a.mapScores = mapCounts.get(p.a.studentId) ?? 0; p.b.mapScores = mapCounts.get(p.b.studentId) ?? 0;
    // 🩹 Nov 2026: an account with real MAP import rows is never flagged "likely extra" while the other side has
    // none — losing a child's actual NWEA scores is worse than losing a practice-answers-only duplicate. Only when
    // neither (or both) side has MapResult rows does the plain answers-count heuristic decide, as before.
    p.empty = p.a.mapScores > 0 && p.b.mapScores === 0 ? p.b.studentId
      : p.b.mapScores > 0 && p.a.mapScores === 0 ? p.a.studentId
      : p.a.answers === 0 && p.b.answers > 0 ? p.a.studentId
      : p.b.answers === 0 && p.a.answers > 0 ? p.b.studentId
      : null;
  }
  return pairs.sort((x, y) => x.className.localeCompare(y.className) || x.a.name.localeCompare(y.a.name));
}
