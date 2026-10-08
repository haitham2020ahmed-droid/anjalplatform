/**
 * 🚨 Intervention board: every student who needs attention now, from MAP and from the platform itself.
 *   URGENT      MAP percentile ≤ 10 (Reading or Language)
 *   RETEST      MAP rapid guessing ≥ 30% (NWEA: the score may not reflect the student)
 *   BEGINNER    Lexile BR (Beginning Reader)
 *   NOT_TESTED  no MAP score in the latest term
 *   GUESSING    platform: ≥ 30% of the last 30 days' answers were rapid guesses (10+ answers)
 *   INACTIVE    platform: no answer for 10 days
 */
import type { Repo } from "../seeding/repo";
import { assertCan, type Actor } from "../auth/rbac";
import { accessibleClasses } from "./assign";

const s = (v: unknown) => String(v ?? "");
const t = (v: unknown) => new Date(v instanceof Date ? v.toISOString() : s(v)).getTime();
export type Flag = "URGENT" | "RETEST" | "BEGINNER" | "NOT_TESTED" | "GUESSING" | "INACTIVE";
export interface InterventionRow { studentId: string; name: string; className: string; classId: string; flags: { flag: Flag; detail: string }[] }

export async function interventionBoard(repo: Repo, actor: Actor, now = new Date()): Promise<{ rows: InterventionRow[]; counts: Record<Flag, number>; term: string | null }> {
  assertCan(actor, "assignments:create");
  const classes = await accessibleClasses(repo, actor);
  const members = classes.length ? await repo.findMany("ClassMembership", { classId: { in: classes.map((c) => c.id) }, leftAt: null }, { select: ["classId", "studentId"] }) : [];
  const ids = [...new Set(members.map((m) => s(m.studentId)))];
  const counts: Record<Flag, number> = { URGENT: 0, RETEST: 0, BEGINNER: 0, NOT_TESTED: 0, GUESSING: 0, INACTIVE: 0 };
  if (!ids.length) return { rows: [], counts, term: null };
  const since = new Date(now.getTime() - 30 * 86_400_000);
  const [students, results, attempts] = await Promise.all([
    repo.findMany("Student", { id: { in: ids } }, { select: ["id", "userId"] }),
    repo.findMany("MapResult", { studentId: { in: ids } }),
    repo.findMany("QuestionAttempt", { studentId: { in: ids }, createdAt: { gte: since } }, { select: ["studentId", "rapidGuess", "createdAt"] }),
  ]);
  const users = await repo.findMany("User", { id: { in: students.map((x) => x.userId) } }, { select: ["id", "displayName"] });
  const overall = results.filter((r) => !r.goalName);
  const latest = overall.sort((a, b) => t(b.testDate) - t(a.testDate))[0];
  const term: string | null = latest ? s(latest.termName) : null;
  const rows: InterventionRow[] = [];
  for (const sid of ids) {
    const st = students.find((x) => x.id === sid); const name = s(users.find((u) => u.id === st?.userId)?.displayName);
    const m = members.find((x) => s(x.studentId) === sid)!; const klass = classes.find((c) => c.id === m.classId)!;
    const mine = overall.filter((r) => s(r.studentId) === sid && s(r.termName) === s(term));
    const flags: InterventionRow["flags"] = [];
    for (const r of mine) {
      const subj = /read/i.test(s(r.subject)) ? "Reading" : "Language";
      if (r.achievementPercentile !== null && r.achievementPercentile !== undefined && Number(r.achievementPercentile) <= 10) flags.push({ flag: "URGENT", detail: `${subj} ${r.achievementPercentile}th percentile (RIT ${r.rit})` });
      if (r.rapidGuessPct !== null && r.rapidGuessPct !== undefined && Number(r.rapidGuessPct) >= 30) flags.push({ flag: "RETEST", detail: `${subj}: rapid guessing ${r.rapidGuessPct}%` });
      if (/read/i.test(s(r.subject)) && r.lexile !== null && r.lexile !== undefined && Number(r.lexile) === 0) flags.push({ flag: "BEGINNER", detail: "Lexile BR (Beginning Reader)" });
    }
    if (term) { const has = (re: RegExp) => mine.some((r) => re.test(s(r.subject))); const miss = [!has(/read/i) && "Reading", !has(/language/i) && "Language"].filter(Boolean); if (miss.length) flags.push({ flag: "NOT_TESTED", detail: `No ${term} score: ${miss.join(" + ")}` }); }
    const att = attempts.filter((a) => s(a.studentId) === sid);
    const rapid = att.filter((a) => a.rapidGuess).length;
    if (att.length >= 10 && rapid / att.length >= 0.3) flags.push({ flag: "GUESSING", detail: `Platform: ${Math.round((100 * rapid) / att.length)}% of ${att.length} answers were rapid guesses` });
    const last = att.reduce((x, a) => Math.max(x, t(a.createdAt)), 0);
    if (!last || now.getTime() - last > 10 * 86_400_000) flags.push({ flag: "INACTIVE", detail: last ? `No practice for ${Math.floor((now.getTime() - last) / 86_400_000)} days` : "No practice in the last 30 days" });
    for (const f of new Set(flags.map((f) => f.flag))) counts[f]++;
    if (flags.length) rows.push({ studentId: sid, name, className: s(klass.name), classId: s(klass.id), flags });
  }
  const weight: Record<Flag, number> = { URGENT: 6, RETEST: 5, BEGINNER: 4, GUESSING: 3, NOT_TESTED: 2, INACTIVE: 1 };
  rows.sort((a, b) => b.flags.reduce((n, f) => n + weight[f.flag], 0) - a.flags.reduce((n, f) => n + weight[f.flag], 0) || a.name.localeCompare(b.name));
  return { rows, counts, term };
}
