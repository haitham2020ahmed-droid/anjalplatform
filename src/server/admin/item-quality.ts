/**
 * 🔬 Question quality from the students' own answers (data-driven content decisions). Questions with enough
 * answers are flagged when their real difficulty does not fit their level, when they are guessed, or when an
 * option is never chosen.
 */
import type { Repo } from "../seeding/repo";
import { assertCan, type Actor } from "../auth/rbac";

const s = (v: unknown) => String(v ?? "");
export const MIN_ANSWERS = 20;
export type ItemFlag = "TOO_EASY" | "TOO_HARD" | "GUESSED" | "UNUSED_OPTION";
export interface ItemRow { id: string; stem: string; place: string | null; level: string | null; answers: number; correctPct: number; rapidPct: number; flags: ItemFlag[]; unused: string[] }

/** Only recent answers count: keeps the scan bounded and reflects the questions as they are now. */
export const WINDOW_DAYS = 180;

export async function itemQuality(repo: Repo, actor: Actor, minAnswers = MIN_ANSWERS, now = new Date()): Promise<{ rows: ItemRow[]; checked: number }> {
  assertCan(actor, "questions:read");
  const students = await repo.findMany("Student", { schoolId: actor.schoolId }, { select: ["id"] });
  if (!students.length) return { rows: [], checked: 0 };
  const since = new Date(now.getTime() - WINDOW_DAYS * 86_400_000);
  const studentIds = students.map((x) => x.id);
  // pass 1: per-question counts from the small columns only (no response JSON)
  const atts = await repo.findMany("QuestionAttempt", { studentId: { in: studentIds }, createdAt: { gte: since } }, { select: ["questionId", "isCorrect", "rapidGuess"] });
  const byQ = new Map<string, { n: number; correct: number; rapid: number; chosen: Set<string> }>();
  for (const a of atts) {
    const k = s(a.questionId);
    let c = byQ.get(k); if (!c) byQ.set(k, (c = { n: 0, correct: 0, rapid: 0, chosen: new Set() }));
    c.n++; if (a.isCorrect) c.correct++; if (a.rapidGuess) c.rapid++;
  }
  const ids = [...byQ].filter(([, v]) => v.n >= minAnswers).map(([k]) => k);
  if (!ids.length) return { rows: [], checked: 0 };
  const [qs, opts, links] = await Promise.all([
    repo.findMany("Question", { id: { in: ids }, status: "PUBLISHED" }, { select: ["id", "stem", "difficultyLevel"] }),
    repo.findMany("QuestionOption", { questionId: { in: ids } }, { select: ["questionId", "label"] }),
    repo.findMany("QuestionMapLink", { questionId: { in: ids } }, { select: ["questionId", "nodeId"] }),
  ]);
  // pass 2: the response only for multiple-choice questions with enough answers to judge unused options
  const optCount = new Map<string, number>();
  for (const o of opts) optCount.set(s(o.questionId), (optCount.get(s(o.questionId)) ?? 0) + 1);
  const mcIds = qs.map((q) => s(q.id)).filter((id) => (byQ.get(id)?.n ?? 0) >= 30 && (optCount.get(id) ?? 0) >= 3);
  if (mcIds.length) {
    const resp = await repo.findMany("QuestionAttempt", { questionId: { in: mcIds }, studentId: { in: studentIds }, createdAt: { gte: since } }, { select: ["questionId", "response"] });
    for (const r of resp) byQ.get(s(r.questionId))?.chosen.add(s((r.response as Record<string, unknown> | null)?.value).toUpperCase());
  }
  const nodes = links.length ? await repo.findMany("CurriculumMapNode", { id: { in: [...new Set(links.map((l) => s(l.nodeId)))] } }, { select: ["id", "code", "level"] }) : [];
  const rows: ItemRow[] = [];
  for (const q of qs) {
    const a = byQ.get(s(q.id))!;
    const n = a.n, correctPct = Math.round((100 * a.correct) / n), rapidPct = Math.round((100 * a.rapid) / n);
    const node = nodes.find((x) => x.id === links.find((l) => s(l.questionId) === s(q.id))?.nodeId);
    const level = node?.level ? s(node.level) : Number(q.difficultyLevel) >= 5 ? "ABOVE" : Number(q.difficultyLevel) <= 3 ? "BELOW" : "ON";
    const flags: ItemFlag[] = [];
    if (correctPct >= (level === "ABOVE" ? 90 : 95)) flags.push("TOO_EASY");
    if (correctPct <= (level === "BELOW" ? 30 : 20)) flags.push("TOO_HARD");
    if (rapidPct >= 40) flags.push("GUESSED");
    // options nobody chose (multiple choice), once there are enough answers to tell
    const chosen = a.chosen;
    const labels = opts.filter((o) => s(o.questionId) === s(q.id)).map((o) => s(o.label).toUpperCase());
    const unused = n >= 30 && labels.length >= 3 ? labels.filter((l) => !chosen.has(l)) : [];
    if (unused.length) flags.push("UNUSED_OPTION");
    if (flags.length) rows.push({ id: s(q.id), stem: s(q.stem), place: node ? s(node.code) : null, level, answers: n, correctPct, rapidPct, flags, unused });
  }
  rows.sort((x, y) => y.flags.length - x.flags.length || y.answers - x.answers);
  return { rows, checked: qs.length };
}
