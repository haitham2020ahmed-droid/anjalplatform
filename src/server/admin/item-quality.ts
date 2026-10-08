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

export async function itemQuality(repo: Repo, actor: Actor, minAnswers = MIN_ANSWERS): Promise<{ rows: ItemRow[]; checked: number }> {
  assertCan(actor, "questions:read");
  const students = await repo.findMany("Student", { schoolId: actor.schoolId }, { select: ["id"] });
  if (!students.length) return { rows: [], checked: 0 };
  const atts = await repo.findMany("QuestionAttempt", { studentId: { in: students.map((x) => x.id) } }, { select: ["questionId", "isCorrect", "rapidGuess", "response"] });
  const byQ = new Map<string, typeof atts>();
  for (const a of atts) { const k = s(a.questionId); if (!byQ.has(k)) byQ.set(k, []); byQ.get(k)!.push(a); }
  const ids = [...byQ].filter(([, v]) => v.length >= minAnswers).map(([k]) => k);
  if (!ids.length) return { rows: [], checked: 0 };
  const [qs, opts, links] = await Promise.all([
    repo.findMany("Question", { id: { in: ids }, status: "PUBLISHED" }, { select: ["id", "stem", "difficultyLevel"] }),
    repo.findMany("QuestionOption", { questionId: { in: ids } }, { select: ["questionId", "label"] }),
    repo.findMany("QuestionMapLink", { questionId: { in: ids } }, { select: ["questionId", "nodeId"] }),
  ]);
  const nodes = links.length ? await repo.findMany("CurriculumMapNode", { id: { in: [...new Set(links.map((l) => s(l.nodeId)))] } }, { select: ["id", "code", "level"] }) : [];
  const rows: ItemRow[] = [];
  for (const q of qs) {
    const a = byQ.get(s(q.id))!;
    const n = a.length, correctPct = Math.round((100 * a.filter((x) => x.isCorrect).length) / n), rapidPct = Math.round((100 * a.filter((x) => x.rapidGuess).length) / n);
    const node = nodes.find((x) => x.id === links.find((l) => s(l.questionId) === s(q.id))?.nodeId);
    const level = node?.level ? s(node.level) : Number(q.difficultyLevel) >= 5 ? "ABOVE" : Number(q.difficultyLevel) <= 3 ? "BELOW" : "ON";
    const flags: ItemFlag[] = [];
    if (correctPct >= (level === "ABOVE" ? 90 : 95)) flags.push("TOO_EASY");
    if (correctPct <= (level === "BELOW" ? 30 : 20)) flags.push("TOO_HARD");
    if (rapidPct >= 40) flags.push("GUESSED");
    // options nobody chose (multiple choice), once there are enough answers to tell
    const chosen = new Set(a.map((x) => s((x.response as Record<string, unknown> | null)?.value).toUpperCase()));
    const labels = opts.filter((o) => s(o.questionId) === s(q.id)).map((o) => s(o.label).toUpperCase());
    const unused = n >= 30 && labels.length >= 3 ? labels.filter((l) => !chosen.has(l)) : [];
    if (unused.length) flags.push("UNUSED_OPTION");
    if (flags.length) rows.push({ id: s(q.id), stem: s(q.stem), place: node ? s(node.code) : null, level, answers: n, correctPct, rapidPct, flags, unused });
  }
  rows.sort((x, y) => y.flags.length - x.flags.length || y.answers - x.answers);
  return { rows, checked: qs.length };
}
