/**
 * 🖨 Worksheets from chosen questions: a header (name / class / date), each reading passage printed once with its
 * questions, the answer key on a separate page; reorder, two versions (A / B: options and order shuffled), print or
 * save as PDF. Worksheets can be kept and shared with the other English teachers.
 * Also: the safe grading helper shared by exit tickets and “Review my mistakes”.
 */
import type { Repo, Row } from "../seeding/repo";
import { assertCan, ForbiddenError, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import { correctAnswerText, loadQuestionItems, seededShuffle, type PracticeItem } from "../practice/items";
import { normalizeResponse } from "../practice/session";
import { scoreResponse } from "../../imports/questions/validate";
import { masterSkills } from "../skills/master";
import { readableClasses } from "./coordinators";
import { hideLevels } from "../../lib/hide-levels";

const s = (v: unknown) => String(v ?? "");
const time = (v: unknown) => new Date(v instanceof Date ? v.toISOString() : s(v)).getTime();
const LETTERS = "ABCDEFGH";
export const MAX_WORKSHEET = 40;

export interface SheetQuestion { n: number; id: string; type: string; stem: string; options: { label: string; text: string }[]; lines: number; elements: string[]; left: string[]; right: string[]; segments: string[]; image: { url: string; alt: string } | null }
export interface SheetBlock { passage: { title: string; text: string } | null; questions: SheetQuestion[] }
export interface SheetView { title: string; version: "A" | "B"; blocks: SheetBlock[]; key: { n: number; answer: string }[]; count: number; ids: string[] }

function staff(actor: Actor) { assertCan(actor, "questions:read"); if (actor.role === "STUDENT" || actor.role === "PARENT") throw new ForbiddenError("Only staff build worksheets."); }

/** Worksheet layout for these questions (in this order; questions of the same passage are kept together). */
export async function worksheetView(repo: Repo, actor: Actor, input: { ids: string[]; title?: string; version?: "A" | "B" }): Promise<SheetView> {
  staff(actor);
  const ids = [...new Set(input.ids.filter(Boolean))].slice(0, MAX_WORKSHEET);
  if (!ids.length) throw new ValidationError("Choose at least one question.");
  const version = input.version === "B" ? "B" : "A";
  const items = await loadQuestionItems(repo, ids);
  await assertSchoolQuestions(repo, actor, items.map((i) => i.questionId));
  const byId = new Map(items.map((i) => [i.questionId, i]));
  let order = ids.filter((id) => byId.has(id));
  if (version === "B") order = seededShuffle(order, `${order.join(",")}:B`);
  // blocks: a passage once, with all its questions; questions without a passage in between
  const blocks: { passage: { title: string; text: string } | null; items: PracticeItem[] }[] = [];
  for (const id of order) {
    const it = byId.get(id)!;
    if (it.passageText) {
      const b = blocks.find((x) => x.passage?.text === it.passageText);
      if (b) { b.items.push(it); continue; }
      blocks.push({ passage: { title: it.passageTitle ?? "", text: it.passageText }, items: [it] });
    } else {
      const last = blocks[blocks.length - 1];
      if (last && !last.passage) last.items.push(it); else blocks.push({ passage: null, items: [it] });
    }
  }
  let n = 0;
  const key: SheetView["key"] = [];
  const out: SheetBlock[] = blocks.map((b) => ({
    passage: b.passage,
    questions: b.items.map((it) => {
      n++;
      const shuffle = version === "B" && (it.type === "MULTIPLE_CHOICE" || it.type === "MULTI_SELECT" || it.type === "DROPDOWN");
      const opts = it.options ? (shuffle ? seededShuffle(it.options, `${it.questionId}:B`) : it.options) : [];
      const relabeled = opts.map((o, k) => ({ label: LETTERS[k] ?? o.label, text: o.text, correct: o.correct }));
      const answer = relabeled.length ? relabeled.filter((o) => o.correct).map((o) => `${o.label}. ${o.text}`).join("; ") : correctAnswerText(it);
      key.push({ n, answer });
      return {
        n, id: it.questionId, type: s(it.type), stem: it.stem, options: relabeled.map(({ label, text }) => ({ label, text })),
        lines: it.type === "SHORT_ANSWER" ? 4 : it.type === "FILL_BLANK" || it.type === "ERROR_CORRECTION" ? 1 : 0,
        elements: it.sequence ? seededShuffle(it.sequence, `${it.questionId}:${version}`) : [], left: it.pairs?.map((p) => p.left) ?? [], right: it.pairs ? seededShuffle(it.pairs.map((p) => p.right), `${it.questionId}:${version}`) : [],
        segments: it.segments ?? [], image: it.image ? { url: `/api/question-images/${it.image.id}`, alt: it.image.alt || "Picture" } : null,
      };
    }),
  }));
  return { title: hideLevels(s(input.title).trim()) || "Worksheet", version, blocks: out, key, count: n, ids: order };
}

/** Every question must belong to one of the school's skills. */
async function assertSchoolQuestions(repo: Repo, actor: Actor, ids: string[]) {
  if (!ids.length) return;
  const qs = await repo.findMany("Question", { id: { in: ids } }, { select: ["id", "skillId"] });
  const mine = new Set((await masterSkills(repo, actor.schoolId!)).map((k) => k.id));
  if (qs.some((q) => !mine.has(s(q.skillId)))) {
    // questions of hidden holding skills are still the school's: check through the curriculum's grade
    const skills = await repo.findMany("Skill", { id: { in: [...new Set(qs.map((q) => s(q.skillId)))] } }, { select: ["id", "curriculumId"] });
    const cur = await repo.findMany("Curriculum", { id: { in: [...new Set(skills.map((k) => s(k.curriculumId)))] } }, { select: ["id", "gradeId"] });
    const grades = await repo.findMany("Grade", { id: { in: [...new Set(cur.map((c) => s(c.gradeId)))] } }, { select: ["id", "schoolId"] });
    if (grades.some((g) => s(g.schoolId) !== s(actor.schoolId))) throw new ForbiddenError("Question not found.");
  }
}

/** Skills to pick questions from (the grades the teacher teaches; admins: all). */
export async function pickerSkills(repo: Repo, actor: Actor): Promise<{ id: string; name: string; grade: number; kind: string; questions: number }[]> {
  staff(actor);
  const all = await masterSkills(repo, actor.schoolId!, { withQuestionsOnly: true });
  if (actor.role !== "TEACHER") return all.map((k) => ({ id: k.id, name: k.name, grade: k.grade, kind: k.kind, questions: k.questions }));
  const classes = await readableClasses(repo, actor);
  const gr = classes.length ? await repo.findMany("Grade", { id: { in: [...new Set(classes.map((c) => s(c.gradeId)))] } }, { select: ["level"] }) : [];
  const grades = new Set(gr.map((g) => Number(g.level)));
  return all.filter((k) => grades.has(k.grade)).map((k) => ({ id: k.id, name: k.name, grade: k.grade, kind: k.kind, questions: k.questions }));
}

export async function skillQuestions(repo: Repo, actor: Actor, skillId: string): Promise<{ id: string; stem: string; type: string; level: number; passage: string | null }[]> {
  staff(actor);
  if (!(await masterSkills(repo, actor.schoolId!)).some((k) => k.id === skillId)) throw new ForbiddenError("Skill not found.");
  const items = (await loadQuestionItems(repo, (await repo.findMany("Question", { skillId, status: "PUBLISHED", deletedAt: null }, { select: ["id"] })).map((q) => s(q.id))));
  return items.map((i) => ({ id: i.questionId, stem: i.stem.slice(0, 220), type: s(i.type), level: i.level, passage: i.passageTitle })).sort((a, b) => a.level - b.level || a.stem.localeCompare(b.stem));
}

// ------------------------------------------------------------------ kept & shared worksheets

export interface SavedSheet { id: string; title: string; count: number; shared: boolean; mine: boolean; author: string; updatedAt: string }

export async function saveWorksheet(repo: Repo, actor: Actor, input: { id?: string | null; title: string; ids: string[]; shared?: boolean }, now = new Date()): Promise<string> {
  staff(actor);
  const ids = [...new Set(input.ids)].slice(0, MAX_WORKSHEET);
  if (!ids.length) throw new ValidationError("Choose at least one question.");
  await worksheetView(repo, actor, { ids });   // checks the questions
  const title = s(input.title).trim().slice(0, 191) || "Worksheet";
  if (input.id) {
    const w = await repo.findUnique("Worksheet", { id: input.id });
    if (!w || w.createdById !== actor.userId) throw new ForbiddenError("Only the author can change this worksheet.");
    await repo.updateMany("Worksheet", { id: input.id }, { title, questionIds: ids, shared: Boolean(input.shared), updatedAt: now });
    return input.id;
  }
  const w = await repo.create("Worksheet", { schoolId: actor.schoolId!, createdById: actor.userId, title, grade: null, questionIds: ids, shared: Boolean(input.shared), createdAt: now, updatedAt: now });
  return s(w.id);
}

export async function worksheetList(repo: Repo, actor: Actor): Promise<SavedSheet[]> {
  staff(actor);
  const rows = (await repo.findMany("Worksheet", { schoolId: actor.schoolId })).filter((w) => w.createdById === actor.userId || w.shared);
  const users = rows.length ? await repo.findMany("User", { id: { in: [...new Set(rows.map((w) => s(w.createdById)))] } }, { select: ["id", "displayName"] }) : [];
  return rows.map((w) => ({ id: s(w.id), title: s(w.title), count: idsOf(w).length, shared: Boolean(w.shared), mine: w.createdById === actor.userId, author: s(users.find((u) => u.id === w.createdById)?.displayName), updatedAt: new Date(time(w.updatedAt)).toISOString() })).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export const idsOf = (w: Row): string[] => (Array.isArray(w.questionIds) ? (w.questionIds as string[]) : typeof w.questionIds === "string" ? (JSON.parse(w.questionIds) as string[]) : []);

export async function openWorksheet(repo: Repo, actor: Actor, id: string): Promise<{ id: string; title: string; ids: string[]; shared: boolean; mine: boolean }> {
  staff(actor);
  const w = await repo.findUnique("Worksheet", { id });
  if (!w || s(w.schoolId) !== s(actor.schoolId) || (w.createdById !== actor.userId && !w.shared)) throw new ForbiddenError("Worksheet not found.");
  return { id: s(w.id), title: s(w.title), ids: idsOf(w), shared: Boolean(w.shared), mine: w.createdById === actor.userId };
}

export async function deleteWorksheet(repo: Repo, actor: Actor, id: string): Promise<void> {
  const w = await repo.findUnique("Worksheet", { id });
  if (!w || w.createdById !== actor.userId) throw new ForbiddenError("Only the author can delete this worksheet.");
  await repo.deleteMany("Worksheet", { id });
}

// ------------------------------------------------------------------ grading (exit tickets, review)

export interface Graded { questionId: string; correct: boolean; correctAnswer: string; why: string }
export function gradeItems(items: PracticeItem[], responses: Record<string, unknown>): Graded[] {
  return items.map((it) => {
    let ok = false;
    try { ok = scoreResponse(it as never, normalizeResponse(it, responses[it.questionId])) >= 1; } catch { ok = false; }
    return { questionId: it.questionId, correct: ok, correctAnswer: correctAnswerText(it), why: it.explanation.whyCorrect };
  });
}

// ------------------------------------------------------------------ 🎚 the same worksheet in 3 levels

export type SheetLevel = "BELOW" | "ON" | "ABOVE";
export const LEVEL_MARK: Record<SheetLevel, string> = { BELOW: "●", ON: "●●", ABOVE: "●●●" };
export const LEVEL_NAME: Record<SheetLevel, string> = { BELOW: "easier (Below Level)", ON: "On Level", ABOVE: "harder (Above Level)" };
const levelOf = (d: number): SheetLevel => (d <= 3 ? "BELOW" : d >= 5 ? "ABOVE" : "ON");
const LEVEL_CENTER: Record<SheetLevel, number> = { BELOW: 2, ON: 4, ABOVE: 6 };

/**
 * Three sheets from the chosen questions: for every chosen question, a question of the SAME skill at each level
 * (the chosen one itself on its own level; the nearest level when a skill has none at that level). Questions are
 * not repeated within a sheet. Each sheet gets its own answer key; students see only ● / ●● / ●●●.
 */
export async function levelSheets(repo: Repo, actor: Actor, input: { ids: string[]; title?: string }): Promise<{ level: SheetLevel; mark: string; name: string; view: SheetView; filled: number }[]> {
  staff(actor);
  const ids = [...new Set(input.ids.filter(Boolean))].slice(0, MAX_WORKSHEET);
  if (!ids.length) throw new ValidationError("Choose at least one question.");
  const chosen = await repo.findMany("Question", { id: { in: ids } }, { select: ["id", "skillId", "difficultyLevel"] });
  await assertSchoolQuestions(repo, actor, chosen.map((q) => s(q.id)));
  const skillIds = [...new Set(chosen.map((q) => s(q.skillId)))];
  const auto = new Set((await repo.findMany("QuestionType", {}, { select: ["id", "code", "isAutoScored"] })).filter((t) => t.code !== "SHORT_ANSWER" && t.isAutoScored !== false).map((t) => s(t.id)));
  const pool = (await repo.findMany("Question", { skillId: { in: skillIds }, status: "PUBLISHED", deletedAt: null }, { select: ["id", "skillId", "difficultyLevel", "typeId"] })).filter((q) => auto.has(s(q.typeId)));
  const order = ids.map((id) => chosen.find((q) => q.id === id)).filter(Boolean) as Row[];
  const out = [];
  for (const level of ["BELOW", "ON", "ABOVE"] as SheetLevel[]) {
    const used = new Set<string>(); const sheet: string[] = []; let filled = 0;
    for (const q of order) {
      if (levelOf(Number(q.difficultyLevel ?? 4)) === level && !used.has(s(q.id))) { sheet.push(s(q.id)); used.add(s(q.id)); continue; }
      const same = pool.filter((x) => x.skillId === q.skillId && !used.has(s(x.id)) && !ids.includes(s(x.id)))
        .sort((a, b) => Math.abs(Number(a.difficultyLevel) - LEVEL_CENTER[level]) - Math.abs(Number(b.difficultyLevel) - LEVEL_CENTER[level]) || s(a.id).localeCompare(s(b.id)));
      const pick = same.find((x) => levelOf(Number(x.difficultyLevel)) === level) ?? same[0];
      if (pick) { sheet.push(s(pick.id)); used.add(s(pick.id)); filled++; }
      else if (!used.has(s(q.id))) { sheet.push(s(q.id)); used.add(s(q.id)); }
    }
    const view = await worksheetView(repo, actor, { ids: sheet, title: `${s(input.title).trim() || "Worksheet"} ${LEVEL_MARK[level]}` });
    out.push({ level, mark: LEVEL_MARK[level], name: LEVEL_NAME[level], view, filled });
  }
  return out;
}
