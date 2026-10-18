/**
 * 🧡 Needs help: a question a student answered wrong TWICE (two wrong answers on the same question, from any source:
 * practice, tests, ReadMaster, ReadRise, Question of the Day) shows its skill as "a skill this student needs help with".
 * Access: a teacher sees only the students of their own classes; admins see the school. Read only.
 */
import type { Repo } from "../seeding/repo";
import { ForbiddenError, type Actor } from "../auth/rbac";
import { accessibleClasses } from "./assign";
import { studentNames } from "../insights/student-data";
import { answerEvents, RR_PREFIX, skillNames } from "../second-chance/service";
import { TtlCache } from "../lib/ttl-cache";
import { modelVersion } from "../cache/bank-version";

const s = (v: unknown) => String(v ?? "");

/** two wrong answers on the same question */
export const REPEAT_WRONG = 2;

export interface HelpSkill { skillId: string; name: string; count: number; sample: string; assignable: boolean }
export interface HelpStudent { studentId: string; name: string; classId: string; skills: HelpSkill[] }

export async function repeatedMistakes(repo: Repo, actor: Actor, opts: { classId?: string; studentId?: string } = {}, now = new Date()): Promise<HelpStudent[]> {
  if (actor.role !== "TEACHER" && actor.role !== "SCHOOL_ADMIN" && actor.role !== "SUPER_ADMIN") throw new ForbiddenError("Teachers and admins only.");
  const classes = await accessibleClasses(repo, actor);
  let picked = classes;
  if (opts.classId) {
    picked = classes.filter((c) => s(c.id) === opts.classId);
    if (!picked.length) throw new ForbiddenError("You do not teach this class.");
  }
  const classOf = new Map<string, string>();
  const cids = picked.map((c) => s(c.id));
  const members = cids.length ? await repo.findMany("ClassMembership", { classId: cids.length === 1 ? cids[0] : { in: cids }, leftAt: null }, { select: ["classId", "studentId"] }) : [];
  for (const m of members) if (!classOf.has(s(m.studentId))) classOf.set(s(m.studentId), s(m.classId));
  let ids = [...classOf.keys()];
  if (opts.studentId) {
    if (!classOf.has(opts.studentId)) throw new ForbiddenError("This student is not in your classes.");
    ids = [opts.studentId];
  }
  if (!ids.length) return [];

  const events = await answerEvents(repo, ids, { now, wrongOnly: true });
  // student → question → wrong count (and the question's skill)
  const per = new Map<string, Map<string, { skill: string; n: number }>>();
  for (const e of events) {
    if (e.correct) continue;
    const m = per.get(e.studentId) ?? new Map<string, { skill: string; n: number }>();
    const v = m.get(e.key) ?? { skill: e.skillKey, n: 0 };
    v.n++;
    m.set(e.key, v);
    per.set(e.studentId, m);
  }
  const rows: { studentId: string; skills: Map<string, string[]> }[] = [];
  for (const [sid, m] of per) {
    const skills = new Map<string, string[]>();
    for (const [key, v] of m) if (v.n >= REPEAT_WRONG && v.skill) skills.set(v.skill, [...(skills.get(v.skill) ?? []), key]);
    if (skills.size) rows.push({ studentId: sid, skills });
  }
  if (!rows.length) return [];

  const allSkills = [...new Set(rows.flatMap((r) => [...r.skills.keys()]))];
  const samples = [...new Set(rows.flatMap((r) => [...r.skills.values()].map((k) => k[0])))];
  const bankSamples = samples.filter((k) => !k.startsWith(RR_PREFIX));
  const rrSamples = samples.filter((k) => k.startsWith(RR_PREFIX)).map((k) => k.slice(RR_PREFIX.length));
  const [names, people, qs, rq] = await Promise.all([
    skillNames(repo, allSkills),
    studentNames(repo, rows.map((r) => r.studentId)),
    bankSamples.length ? repo.findMany("Question", { id: { in: bankSamples } }, { select: ["id", "stem"] }) : Promise.resolve([]),
    rrSamples.length ? repo.findMany("RRQuestion", { id: { in: rrSamples } }, { select: ["id", "stem"] }) : Promise.resolve([]),
  ]);
  const stem = new Map<string, string>([...qs.map((q) => [s(q.id), s(q.stem)] as const), ...rq.map((q) => [RR_PREFIX + s(q.id), s(q.stem)] as const)]);
  return rows.map((r) => ({
    studentId: r.studentId,
    name: people.get(r.studentId)?.name ?? "Student",
    classId: classOf.get(r.studentId) ?? "",
    skills: [...r.skills].map(([skillId, keys]) => ({
      skillId, name: names.get(skillId) || "Other questions", count: keys.length,
      sample: (stem.get(keys[0]) ?? "").replace(/\s+/g, " ").slice(0, 160), assignable: !skillId.startsWith(RR_PREFIX),
    })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
  })).sort((a, b) => b.skills.length - a.skills.length || a.name.localeCompare(b.name));
}

/**
 * ⚡ "My Students" asks for this badge on every page load; underneath, repeatedMistakes() re-scans every
 * QuestionAttempt/QotdAnswer/RRRun/PracticeSession row of the teacher's (or whole school's) students just to
 * count skills, every single time. Cache it for a few seconds per actor scope, same pattern (and models) as
 * studentsInScope() above — any new attempt/answer is seen at once by the next load once the cache expires.
 */
const HELP_CACHE_MS = 15_000;
const helpCache = new WeakMap<object, TtlCache<Record<string, number>>>();

/** studentId → the number of skills they need help with (for the badge on My Students). */
export async function needsHelpCounts(repo: Repo, actor: Actor, now = new Date()): Promise<Record<string, number>> {
  const key = `${actor.role}|${actor.schoolId}|${actor.userId}|${modelVersion("QuestionAttempt", "QotdAnswer", "RRRun", "PracticeSession", "ClassMembership", "Student", "User")}`;
  let c = helpCache.get(repo);
  if (!c) helpCache.set(repo, (c = new TtlCache(HELP_CACHE_MS, 200)));
  return c.getOrLoad(key, async () => Object.fromEntries((await repeatedMistakes(repo, actor, {}, now)).map((r) => [r.studentId, r.skills.length])));
}
