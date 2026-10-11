/**
 * 🧑‍💼 The Teacher Copilot: answers a teacher's question about ONE class from the class's own data.
 *
 *   classIntelligence   everything about the class in one read: each student's risk (and why), level, path,
 *                       weak foundations (knowledge graph), the class's common misconceptions (last 14 days), MAP
 *                       weakest areas, Weekly Checks, and which interventions worked in the school before
 *   copilotAnswer       the intent of the question ("What should I teach tomorrow?", "Who needs help?", "How should I
 *                       group them?", "What mistakes…?", "How is my class doing?", "Which questions…?") → priorities,
 *                       groups with an activity each, a 15-minute lesson focus, recommended questions, the evidence
 *
 * It never invents: every line comes from a number it shows. No student data leaves the platform.
 */
import { thetaToLevel } from "../../recommendations/recommend";
import { MISCONCEPTION_BY_CODE } from "../../insights/misconceptions";
import type { Actor } from "../auth/rbac";
import type { Repo, Row } from "../seeding/repo";
import { assertClassAccess } from "../teacher/assignments";
import { classGaps } from "../graph/knowledge-graph";
import { groupMisconceptions } from "../insights/misconception-tags";
import { profilesOf } from "../insights/student-profile";
import { interventionImpact } from "../insights/interventions";
import { risksOf, type StudentRisk } from "../predict/risk";

const s = (v: unknown) => String(v ?? "");
const AREA: Record<string, string> = { LIT: "Literary Text", INFO: "Informational Text", VOCAB: "Vocabulary", GRAMMAR: "Grammar and Usage", MECH: "Mechanics", WRITING: "Writing" };

export type Intent = "TOMORROW" | "HELP" | "GROUPS" | "MISTAKES" | "PROGRESS" | "QUESTIONS";
export const PRESETS: { intent: Intent; text: string }[] = [
  { intent: "TOMORROW", text: "What should I teach tomorrow?" },
  { intent: "HELP", text: "Who needs help this week?" },
  { intent: "GROUPS", text: "How should I group my students?" },
  { intent: "MISTAKES", text: "What mistakes are my students making?" },
  { intent: "PROGRESS", text: "How is my class doing?" },
  { intent: "QUESTIONS", text: "Which questions should I give them?" },
];

/** The intent of a free question (keywords; English). */
export function intentOf(q: string): Intent {
  const t = q.toLowerCase();
  if (/\b(group|groups|grouping|differentiat|small group)/.test(t)) return "GROUPS";
  if (/\b(mistake|misconception|wrong|error|confus)/.test(t)) return "MISTAKES";
  if (/\b(who|help|risk|struggl|behind|support|attention|worried)/.test(t)) return "HELP";
  if (/\b(question|quiz|exit ticket|worksheet|practice set|assign)/.test(t)) return "QUESTIONS";
  if (/\b(progress|doing|growth|improv|summary|overview|how is|how are)/.test(t)) return "PROGRESS";
  return "TOMORROW";
}

export interface ClassIntel {
  classId: string; className: string; students: { id: string; name: string }[];
  /** the class grade's active curriculum (skills are looked up inside it) */
  curriculumId?: string | null;
  risks: StudentRisk[]; levels: Record<string, number>;
  gaps: { skillId: string; name: string; students: string[]; unblocks: string[]; avgMastery: number }[];
  misconceptions: { code: string; label: string; fix: string; students: { id: string; count: number }[]; skills: string[] }[];
  weakAreas: { key: string; name: string; students: number }[];
  thetaAvg: number | null;
  weekly: { done: number; avgChange: number | null };
  worked: { skillName: string; improvedPct: number; groups: number }[];
}

export async function classIntelligence(repo: Repo, actor: Actor, classId: string, now = new Date()): Promise<ClassIntel> {
  const klass = await assertClassAccess(repo, actor, classId);
  const ids = (await repo.findMany("ClassMembership", { classId, leftAt: null }, { select: ["studentId"] })).map((m) => s(m.studentId));
  const st = ids.length ? await repo.findMany("Student", { id: { in: ids } }, { select: ["id", "userId"] }) : [];
  const users = st.length ? await repo.findMany("User", { id: { in: st.map((x) => x.userId) } }, { select: ["id", "displayName"] }) : [];
  const students = st.map((x) => ({ id: s(x.id), name: s(users.find((u) => u.id === x.userId)?.displayName ?? "Student") })).sort((a, b) => a.name.localeCompare(b.name));
  const cur = (await repo.findMany("Curriculum", { gradeId: klass.gradeId, isActive: true }))[0];
  const [risks, profiles, mis, cg, worked, weekly, abil] = await Promise.all([
    risksOf(repo, s(klass.schoolId), ids, now), profilesOf(repo, ids), groupMisconceptions(repo, ids, 14, now, 4),
    cur ? classGaps(repo, ids, s(cur.id)) : Promise.resolve(null), interventionImpact(repo, s(klass.schoolId)),
    ids.length ? repo.findMany("WeeklyCheck", { studentId: { in: ids }, createdAt: { gte: new Date(now.getTime() - 14 * 86_400_000) } }, { select: ["ritBefore", "ritAfter", "completedAt"] }) : Promise.resolve([] as Row[]),
    ids.length ? repo.findMany("StudentAbility", { studentId: { in: ids } }, { select: ["scope", "theta", "responses"] }) : Promise.resolve([] as Row[]),
  ]);
  const levels: Record<string, number> = { BELOW: 0, ON: 0, ABOVE: 0, UNKNOWN: 0 };
  const areas = new Map<string, number>();
  for (const id of ids) { const p = profiles.get(id); levels[p?.level ?? "UNKNOWN"] = (levels[p?.level ?? "UNKNOWN"] ?? 0) + 1; if (p?.weakestArea) areas.set(p.weakestArea, (areas.get(p.weakestArea) ?? 0) + 1); }
  const sk = abil.filter((a) => s(a.scope).startsWith("SKILL:"));
  const w = sk.reduce((t, a) => t + Math.max(1, Number(a.responses ?? 1)), 0);
  const done = weekly.filter((x) => x.completedAt && x.ritAfter !== null && x.ritBefore !== null && x.ritAfter !== undefined);
  return {
    classId, className: s(klass.name), students, curriculumId: cur ? s(cur.id) : null, risks: risks.sort((a, b) => b.score - a.score), levels,
    gaps: cg?.gaps ?? [], misconceptions: mis.map((m) => ({ code: m.code, label: m.label, fix: m.fix, students: m.students, skills: m.skills })),
    weakAreas: [...areas.entries()].map(([key, n]) => ({ key, name: AREA[key] ?? key, students: n })).sort((a, b) => b.students - a.students),
    thetaAvg: w ? Math.round((sk.reduce((t, a) => t + Math.max(1, Number(a.responses ?? 1)) * Number(a.theta), 0) / w) * 100) / 100 : null,
    weekly: { done: done.length, avgChange: done.length ? Math.round((done.reduce((t, x) => t + Number(x.ritAfter) - Number(x.ritBefore), 0) / done.length) * 10) / 10 : null },
    worked: worked.filter((x) => x.groups > 0).slice(0, 3),
  };
}

export interface CopilotGroup { name: string; focus: string; studentIds: string[]; students: string[]; activity: string; skillId: string | null }
export interface CopilotAnswer {
  intent: Intent; headline: string; summary: string[];
  priorities: { title: string; why: string }[];
  groups: CopilotGroup[];
  lesson: { focus: string; minutes: number; steps: string[] } | null;
  questions: { id: string; stem: string; level: number }[];
  evidence: string[];
}

/** Questions for a skill near a level, preferring ones whose wrong options carry the misconception. */
async function questionsFor(repo: Repo, skillId: string, level: number, misconception: string | null, n = 5): Promise<{ id: string; stem: string; level: number }[]> {
  const qs = await repo.findMany("Question", { skillId, status: "PUBLISHED", deletedAt: null }, { select: ["id", "stem", "difficultyLevel"] });
  if (!qs.length) return [];
  const withMis = misconception ? new Set((await repo.findMany("QuestionOption", { questionId: { in: qs.map((q) => q.id) }, misconception }, { select: ["questionId"] })).map((o) => s(o.questionId))) : new Set<string>();
  return qs.map((q) => ({ id: s(q.id), stem: s(q.stem).slice(0, 160), level: Number(q.difficultyLevel), score: Math.abs(Number(q.difficultyLevel) - level) - (withMis.has(s(q.id)) ? 1.5 : 0) }))
    .sort((a, b) => a.score - b.score).slice(0, n).map(({ id, stem, level: l }) => ({ id, stem, level: l }));
}

/** Answers the teacher's question for the class. */
export async function copilotAnswer(repo: Repo, intel: ClassIntel, intent: Intent): Promise<CopilotAnswer> {
  const nameOf = (id: string) => intel.students.find((x) => x.id === id)?.name ?? "Student";
  const high = intel.risks.filter((r) => r.level === "HIGH"), medium = intel.risks.filter((r) => r.level === "MEDIUM");
  const gap = intel.gaps[0], mis = intel.misconceptions[0], area = intel.weakAreas[0];
  const lvl = thetaToLevel(intel.thetaAvg ?? 0);
  const evidence = [
    `${intel.students.length} students · ${intel.levels.BELOW} Below · ${intel.levels.ON} On · ${intel.levels.ABOVE} Above Level`,
    `${high.length} at high risk of missing the MAP goal · ${medium.length} at medium risk`,
    ...(gap ? [`Weakest foundation: ${gap.name} (${gap.students.length} students, average mastery ${gap.avgMastery}${gap.unblocks.length ? `, it blocks ${gap.unblocks.slice(0, 3).join(", ")}` : ""})`] : []),
    ...(mis ? [`Most common misconception (14 days): ${mis.label} (${mis.students.length} students)`] : []),
    ...(area ? [`Weakest MAP area for most students: ${area.name} (${area.students})`] : []),
    ...(intel.weekly.done ? [`Weekly Checks (14 days): ${intel.weekly.done} done, average change ${intel.weekly.avgChange !== null && intel.weekly.avgChange >= 0 ? "+" : ""}${intel.weekly.avgChange} RIT`] : []),
  ];
  // priorities: each candidate scored by how many students it reaches and what it unblocks
  const cands: { title: string; why: string; score: number; skillId: string | null; misconception: string | null; students: string[] }[] = [];
  if (gap) cands.push({ title: `Reteach ${gap.name}`, why: `${gap.students.length} students are weak on this foundation; it blocks ${gap.unblocks.length} later skill${gap.unblocks.length === 1 ? "" : "s"}.`, score: gap.students.length * 2 + gap.unblocks.length, skillId: gap.skillId, misconception: null, students: gap.students });
  if (mis) cands.push({ title: `Fix the misconception: ${mis.label.toLowerCase()}`, why: `${mis.students.length} students made this mistake again and again (${mis.skills.slice(0, 2).join(", ")}).`, score: mis.students.length * 1.5, skillId: null, misconception: mis.code, students: mis.students.map((x) => x.id) });
  if (area) cands.push({ title: `Practise ${area.name}`, why: `The weakest MAP instructional area for ${area.students} students.`, score: area.students, skillId: null, misconception: null, students: [] });
  if (high.length) {
    // the most common reasons among them, counted (not one sentence per student)
    const LABEL: Record<string, string> = { lowPractice: "little practice", decliningPractice: "practice going down", slowGrowth: "slow progress", lowAbility: "working below grade level", lowGoalChance: "low chance of the MAP goal", weakFoundations: "weak foundations", guessing: "rapid guessing", weeklyDrop: "a Weekly Check drop", interventionFailed: "an intervention that did not help", noMap: "no MAP score" };
    const c = new Map<string, number>(); for (const r of high) for (const x of r.reasons.slice(0, 3)) c.set(x.key, (c.get(x.key) ?? 0) + 1);
    const top = [...c.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, n]) => `${LABEL[k] ?? k} (${n})`).join(", ");
    const practice = (c.get("lowPractice") ?? 0) + (c.get("decliningPractice") ?? 0) >= high.length / 2;
    cands.push({ title: practice ? "Get the high-risk students practising again" : "Support the high-risk students", why: `${high.length} students at high risk of missing the MAP goal. Main reasons: ${top}.`, score: high.length * 1.2, skillId: null, misconception: null, students: high.map((r) => r.studentId) });
  }
  cands.sort((a, b) => b.score - a.score);
  const top = cands[0];
  // the focus skill: the gap, else a skill where the misconception shows
  let focusSkill: string | null = top?.skillId ?? gap?.skillId ?? null;
  // (skill names repeat across grades: look inside the class's curriculum, live skills only)
  if (!focusSkill && mis && intel.curriculumId) { const sk = await repo.findMany("Skill", { curriculumId: intel.curriculumId, name: { in: mis.skills }, deletedAt: null }, { select: ["id"] }); focusSkill = sk[0] ? s(sk[0].id) : null; }
  const focusName = focusSkill ? s((await repo.findUnique("Skill", { id: focusSkill }))?.name) : top?.title ?? "";
  const misFix = mis ? MISCONCEPTION_BY_CODE.get(mis.code)?.fix ?? "" : "";
  const lesson = focusSkill ? { focus: focusName, minutes: 15, steps: [
    `I do (4 min): model one ${focusName} question aloud and say how you decide.${misFix ? ` ${misFix}` : ""}`,
    "We do (5 min): two questions together — students explain each choice before you reveal.",
    "You do (6 min): 3 questions alone as an exit ticket; collect who still misses it for a small group.",
  ] } : null;
  const questions = focusSkill ? await questionsFor(repo, focusSkill, lvl, mis?.code ?? null) : [];
  // groups: foundation · misconception · practice routine · stretch
  const groups: CopilotGroup[] = [];
  const used = new Set<string>();
  const add = (g: Omit<CopilotGroup, "students" | "skillId"> & { skillId: string | null }) => { const ids = g.studentIds.filter((id) => !used.has(id)); if (ids.length < 2) return; ids.forEach((id) => used.add(id)); groups.push({ ...g, studentIds: ids, students: ids.map(nameOf) }); };
  if (gap) add({ name: `🧱 ${gap.name} group`, focus: gap.name, studentIds: gap.students, activity: `15 minutes on ${gap.name} at an easier level, then one question of ${gap.unblocks[0] ?? "the next skill"}.`, skillId: gap.skillId });
  if (mis) add({ name: "🔍 Misconception group", focus: mis.label, studentIds: mis.students.map((x) => x.id), activity: misFix || "Reteach with a model and two guided questions.", skillId: null });
  add({ name: "⏰ Practice routine", focus: "Daily practice", studentIds: intel.risks.filter((r) => r.reasons.some((x) => x.key === "lowPractice" || x.key === "decliningPractice")).map((r) => r.studentId), activity: "Agree a 10-minute daily routine; check My Next Step together on Sunday.", skillId: null });
  add({ name: "🚀 Stretch", focus: "Challenge", studentIds: intel.risks.filter((r) => r.level === "LOW" && (r.signals.theta ?? 0) >= 0.75).map((r) => r.studentId), activity: "Independent challenge: the Stretch step of their learning path (Above Level questions).", skillId: null });
  const worked = intel.worked[0];
  const summary: string[] = [];
  let headline = "";
  switch (intent) {
    case "TOMORROW":
      headline = top ? `Tomorrow: ${top.title}` : "Tomorrow: keep the current plan";
      summary.push(top ? top.why : "No urgent gap: continue the unit and use My Next Step for practice.");
      if (lesson) summary.push(`Lesson focus: ${lesson.focus} — a 15-minute mini-lesson (below), then the groups.`);
      if (worked) summary.push(`In this school, intervention groups on ${worked.skillName} helped ${worked.improvedPct}% of students.`);
      break;
    case "HELP":
      headline = `${high.length} student${high.length === 1 ? "" : "s"} need${high.length === 1 ? "s" : ""} help now`;
      for (const r of high.slice(0, 8)) summary.push(`${nameOf(r.studentId)} — ${r.score}% risk: ${r.reasons.slice(0, 2).map((x) => x.text).join("; ")}. → ${r.reasons[0]?.action ?? "Check in."}`);
      if (!high.length) summary.push("Nobody is at high risk. Medium risk: " + (medium.slice(0, 5).map((r) => `\u2068${nameOf(r.studentId)}\u2069`).join(", ") || "none") + ".");
      break;
    case "GROUPS":
      headline = `${groups.length} group${groups.length === 1 ? "" : "s"} from today's data`;
      summary.push("Each student is in one group, chosen by what holds them back most.");
      break;
    case "MISTAKES":
      headline = mis ? `Main mistake: ${mis.label}` : "No repeated mistake pattern in the last 14 days";
      for (const m of intel.misconceptions) summary.push(`${m.label} — ${m.students.length} students (${m.skills.slice(0, 2).join(", ")}). 💡 ${m.fix}`);
      break;
    case "PROGRESS":
      headline = `${intel.className}: ${intel.levels.ON + intel.levels.ABOVE} of ${intel.students.length} at or above level`;
      summary.push(...evidence);
      break;
    case "QUESTIONS":
      headline = questions.length ? `${questions.length} questions on ${focusName}` : "No questions found for the focus skill";
      summary.push(`Chosen near level ${lvl} (the class's average ability)${mis ? `, with wrong choices that reveal “${mis.label.toLowerCase()}”` : ""}.`);
      break;
  }
  return { intent, headline, summary, priorities: cands.slice(0, 3).map(({ title, why }) => ({ title, why })), groups, lesson, questions, evidence };
}
