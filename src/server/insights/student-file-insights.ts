/**
 * 🗂️ The new parts of the ONE student file (/teacher/students/[id]) read together, sharing their reads:
 *   strands       the language profile (language-strands.ts)
 *   mistake       the main mistake in plain words (error-patterns.ts)
 *   rootCauses    the real gap underneath (error-patterns.ts, the prerequisite graph)
 *   readRise      the ReadRise level journey (placement → every change) for the growth chart — "ReadRise level"
 *   peer          the student against the class (teachers / admins only — never shown to students or parents)
 *   followUp      alerts and what was done, comments to the student (the parent reads them), private notes
 * Access: the caller (the student page) has already checked the student; peer re-checks the class.
 * One read per table: the grade's skills and prerequisites, the mastery rows, the latest 300 answers, fluency,
 * writing; the class rows for the comparison; the ReadRise rows when the student was placed.
 */
import type { Repo, Row } from "../seeding/repo";
import type { Actor } from "../auth/rbac";
import { isHiddenSkill } from "../skills/master";
import { safeIfBehind } from "../db/schema-errors";
import { masteredSkills } from "../reports/mastered-count";
import { buildGraph } from "../graph/knowledge-graph";
import { buildStrands, type StrandRow } from "./language-strands";
import { errorSentenceFor, rootCausesFrom, statesFrom, type ErrorSentence, type RootCause } from "./error-patterns";
import { studentPeer, type PeerRow } from "./class-compare";
import { ALERT_INFO, type AlertKind } from "./alerts";
import { loadStudentGrowth, type HistoryEvent } from "../readrise/growth-report";

const s = (v: unknown) => String(v ?? "");
const time = (v: unknown) => (v instanceof Date ? v.getTime() : v ? new Date(s(v)).getTime() : 0);
const DAY = 86_400_000;

export interface StudentFileInsights {
  strands: StrandRow[];
  mistake: ErrorSentence | null;
  rootCauses: RootCause[];
  readRise: { placed: boolean; level: number | null; startLevel: number | null; history: HistoryEvent[] } | null;
  peer: PeerRow | null;
  alerts: { id: string; title: string; icon: string; detail: string; status: string; action: string | null; date: string }[];
}

export async function studentFileInsights(repo: Repo, actor: Actor, studentId: string, o: { classId: string | null; name: string; now?: Date }): Promise<StudentFileInsights> {
  const now = o.now ?? new Date();
  const st = await repo.findUnique("Student", { id: studentId });
  const curricula = st?.gradeId ? await repo.findMany("Curriculum", { gradeId: s(st.gradeId), deletedAt: null }, { select: ["id"] }) : [];
  const [gradeSkills, mastery, recent, fluency, writing, alerts, peer, growth] = await Promise.all([
    curricula.length ? repo.findMany("Skill", { curriculumId: { in: curricula.map((c) => s(c.id)) }, deletedAt: null }, { select: ["id", "name", "code", "category", "domain", "sequence", "isActive"] }) : Promise.resolve([] as Row[]),
    repo.findMany("StudentSkillMastery", { studentId }, { select: ["skillId", "score", "attempts", "isMastered"] }),
    repo.findMany("QuestionAttempt", { studentId }, { select: ["skillId", "isCorrect", "misconception", "rapidGuess", "createdAt"], orderBy: [{ field: "createdAt", dir: "desc" }], take: 300 }),
    repo.findMany("FluencyPractice", { studentId }, { select: ["mode", "wcpm", "level", "createdAt"] }).catch(() => [] as Row[]),
    safeIfBehind("student-file.strands-writing", repo.findMany("WritingSubmission", { studentId, status: "SCORED" }, { select: ["scorePct"] }), [] as Row[]),
    repo.findMany("StudentAlert", { studentId }, { select: ["id", "kind", "detail", "status", "action", "createdAt"] }),
    o.classId ? studentPeer(repo, actor, o.classId, studentId, o.name, now).catch(() => null) : Promise.resolve(null),
    loadStudentGrowth(repo, studentId, now).catch(() => null),
  ]);
  const ids = gradeSkills.map((k) => s(k.id));
  const known = new Set(ids);
  const extraIds = [...new Set(mastery.map((r) => s(r.skillId)).filter((id) => !known.has(id)))];
  const [edges, extra] = await Promise.all([
    ids.length ? repo.findMany("SkillPrerequisite", { skillId: { in: ids } }) : Promise.resolve([] as Row[]),
    extraIds.length ? repo.findMany("Skill", { id: { in: extraIds } }, { select: ["id", "name", "code", "category", "domain", "sequence", "isActive"] }) : Promise.resolve([] as Row[]),
  ]);
  const skills = [...gradeSkills, ...extra].filter((k) => k.isActive !== false && k.isActive !== 0 && !isHiddenSkill(k.code))
    .map((k) => ({ id: s(k.id), name: s(k.name), code: s(k.code), category: s(k.category), domain: s(k.domain), sequence: Number(k.sequence ?? 0) }));
  const mastered = (await masteredSkills(repo, [studentId], skills.map((k) => k.id), { rows: mastery.map((r) => ({ ...r, studentId })) })).get(studentId) ?? new Set<string>();
  const cut = now.getTime() - 28 * DAY;
  const strands = buildStrands({ skills, mastery, mastered, attempts: recent.filter((a) => time(a.createdAt) >= cut), fluency, writing, now });
  const wrong = recent.filter((a) => !(a.isCorrect === true || a.isCorrect === 1) && time(a.createdAt) >= now.getTime() - 60 * DAY);
  const graph = buildGraph(gradeSkills.filter((k) => !isHiddenSkill(k.code)), edges);
  return {
    strands,
    mistake: errorSentenceFor(studentId, o.name, wrong),
    rootCauses: rootCausesFrom(graph, statesFrom(mastery.filter((m) => graph.nodes.has(s(m.skillId))), recent), 3),
    readRise: growth ? { placed: growth.placed, level: growth.level, startLevel: growth.startLevel, history: growth.history } : null,
    peer,
    alerts: alerts.filter((a) => s(a.status) !== "MERGED").sort((a, b) => time(b.createdAt) - time(a.createdAt)).slice(0, 12).map((a) => {
      const info = ALERT_INFO[s(a.kind) as AlertKind];
      return { id: s(a.id), title: info?.title ?? s(a.kind), icon: info?.icon ?? "•", detail: s(a.detail), status: s(a.status), action: a.action ? s(a.action) : null, date: new Date(time(a.createdAt)).toISOString().slice(0, 10) };
    }),
  };
}
