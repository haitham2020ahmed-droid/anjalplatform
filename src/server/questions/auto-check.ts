/**
 * 🧹 Question Check — automatic (Update 55): published questions with a DEFINITE error are hidden from students
 * by themselves (moved to "waiting for review" with the reason kept in tags.autoHidden), so no student meets a
 * broken question. Only certain errors hide a question:
 *   - no question text;
 *   - a Multiple Choice question without exactly one correct answer;
 *   - a Multi-Select question without a correct answer;
 *   - fewer than two choices, an empty choice, or two identical choices;
 *   - wording that certainly needs a reading passage ("according to the passage", "in paragraph 3") with none attached.
 * Doubtful cases (answers that look wrong from students' results) stay in Alerts for a person to decide.
 * Light: questions are read in pages of 500 (id, text, type) and their choices in one query per page.
 * Fixing a hidden question and approving it (Approve and publish) brings it back.
 */
import type { Repo, Row } from "../seeding/repo";
import { ForbiddenError, type Actor } from "../auth/rbac";
import { audit } from "../audit";
import { definitelyNeedsPassage } from "../../lib/passage-detect";

const s = (v: unknown) => String(v ?? "");
const PAGE = 500;
// identical choices only: case and punctuation are kept (capitalization and punctuation questions differ by them)
const norm = (t: string) => t.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, " ").trim();

export interface AutoHidden { id: string; stem: string; problem: string; at: string }

/** The definite problem of one question (or null), from its text, type and choices. */
export function definiteProblem(q: { stem: unknown; type: string; hasPassage?: boolean }, options: { text: unknown; isCorrect: unknown }[]): string | null {
  if (!s(q.stem).trim()) return "The question has no text.";
  if (q.hasPassage === false && definitelyNeedsPassage(s(q.stem))) return "It refers to a reading passage, but no passage is attached.";
  // (True / False keeps its answer as a value, not choices: only its text is checked)
  if (q.type !== "MULTIPLE_CHOICE" && q.type !== "MULTI_SELECT") return null;
  if (options.length < 2) return "It has fewer than two answer choices.";
  if (options.some((o) => !s(o.text).trim())) return "An answer choice is empty.";
  const seen = new Set<string>();
  for (const o of options) { const k = norm(s(o.text)); if (seen.has(k)) return "Two answer choices are the same."; seen.add(k); }
  const correct = options.filter((o) => o.isCorrect === true || o.isCorrect === 1 || o.isCorrect === "1").length;
  if (q.type === "MULTI_SELECT") return correct ? null : "No answer choice is marked correct.";
  if (correct === 0) return "No answer choice is marked correct.";
  if (correct > 1) return "More than one answer choice is marked correct.";
  return null;
}

const tagsOf = (q: Row): Record<string, unknown> => {
  const t = q.tags;
  if (t && typeof t === "object") return t as Record<string, unknown>;
  if (typeof t === "string") { try { return JSON.parse(t) as Record<string, unknown>; } catch { return {}; } }
  return {};
};

async function schoolSkills(repo: Repo, schoolId: string): Promise<string[]> {
  const grades = await repo.findMany("Grade", { schoolId }, { select: ["id"] });
  const curs = grades.length ? await repo.findMany("Curriculum", { gradeId: { in: grades.map((g) => g.id) } }, { select: ["id"] }) : [];
  return curs.length ? (await repo.findMany("Skill", { curriculumId: { in: curs.map((c) => c.id) } }, { select: ["id"] })).map((k) => s(k.id)) : [];
}

/**
 * Checks every published question of the school; hides those with a definite error.
 * In parts (the Load new questions page): `after` = the last id checked before, `pages` = at most so many pages of
 * 500 this call; `next` is the id to go on from, or null when every question was checked.
 */
export async function autoHideBroken(repo: Repo, actor: Actor, now = new Date(), part: { after?: string | null; pages?: number } = {}): Promise<{ checked: number; hidden: AutoHidden[]; next: string | null }> {
  if (actor.role !== "SCHOOL_ADMIN" && actor.role !== "SUPER_ADMIN") throw new ForbiddenError("Admins run the question check.");
  const skills = await schoolSkills(repo, actor.schoolId!);
  if (!skills.length) return { checked: 0, hidden: [], next: null };
  const types = new Map((await repo.findMany("QuestionType", {}, { select: ["id", "code"] })).map((t) => [s(t.id), s(t.code)]));
  const hidden: AutoHidden[] = [];
  let checked = 0, after = part.after ?? null, pages = 0, next: string | null = null;
  for (;;) {
    if (part.pages && pages >= part.pages) { next = after; break; }
    // by id (hidden questions leave the PUBLISHED list, so an id cursor never skips one)
    const page = await repo.findMany("Question", { skillId: { in: skills }, status: "PUBLISHED", deletedAt: null, ...(after ? { id: { gt: after } } : {}) }, { select: ["id", "stem", "typeId", "tags", "passageId"], orderBy: [{ field: "id", dir: "asc" }], take: PAGE });
    if (!page.length) break;
    pages++; checked += page.length; after = s(page[page.length - 1].id);
    const pIds = [...new Set(page.map((q) => s(q.passageId)).filter(Boolean))];
    const [opts, passages] = await Promise.all([
      repo.findMany("QuestionOption", { questionId: { in: page.map((q) => q.id) } }, { select: ["questionId", "text", "isCorrect"] }),
      pIds.length ? repo.findMany("ReadingPassage", { id: { in: pIds } }, { select: ["id", "body"] }) : Promise.resolve([] as Row[]),
    ]);
    const withBody = new Set(passages.filter((p) => s(p.body).trim()).map((p) => s(p.id)));
    const byQ = new Map<string, Row[]>();
    for (const o of opts) byQ.set(s(o.questionId), [...(byQ.get(s(o.questionId)) ?? []), o]);
    for (const q of page) {
      const problem = definiteProblem({ stem: q.stem, type: types.get(s(q.typeId)) ?? "", hasPassage: withBody.has(s(q.passageId)) }, (byQ.get(s(q.id)) ?? []) as { text: unknown; isCorrect: unknown }[]);
      if (!problem) continue;
      const at = now.toISOString();
      await repo.updateMany("Question", { id: q.id, status: "PUBLISHED" }, { status: "UNDER_REVIEW", updatedAt: now, tags: { ...tagsOf(q), autoHidden: { problem, at } } });
      hidden.push({ id: s(q.id), stem: s(q.stem).slice(0, 200), problem, at });
    }
    if (page.length < PAGE) break;
  }
  if (hidden.length) await audit(repo, { actorId: actor.userId, action: "question.autohide", entityType: "Question", entityId: null, after: { hidden: hidden.length, checked }, at: now });
  return { checked, hidden, next };
}

/** Questions the check hid that are still waiting (fixed and approved ones leave the list). */
export async function listAutoHidden(repo: Repo, actor: Actor): Promise<AutoHidden[]> {
  if (actor.role !== "SCHOOL_ADMIN" && actor.role !== "SUPER_ADMIN") throw new ForbiddenError("Admins see hidden questions.");
  const skills = await schoolSkills(repo, actor.schoolId!);
  if (!skills.length) return [];
  const rows = await repo.findMany("Question", { skillId: { in: skills }, status: "UNDER_REVIEW", deletedAt: null }, { select: ["id", "stem", "tags"] });
  return rows.map((q) => ({ q, h: tagsOf(q).autoHidden as { problem?: string; at?: string } | undefined })).filter((x) => x.h?.problem)
    .map(({ q, h }) => ({ id: s(q.id), stem: s(q.stem).slice(0, 200), problem: s(h!.problem), at: s(h!.at) }));
}
