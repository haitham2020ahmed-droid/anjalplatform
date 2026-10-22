/**
 * 📚 "Curriculum Map questions" — a question source of the test builder (Assessments → New test).
 *
 *   Grade → Unit → Text Set / Selection (title + key words from lesson-details.json) → its sections.
 *
 * The sections are the Curriculum Map places that accept questions — attachmentNodes() — with their own
 * category / categoryLabel, so a new kind of section (e.g. "Review") shows up here by itself; nothing is hard-coded.
 * A teacher sees only the grades of their own classes (teacherMapGrades); admins see every grade.
 *
 * Light by design: the tree carries only counts (one grade at a time); a section's questions are read only when it
 * is opened, a page at a time (stem preview, type, level). Only questions a test can use are counted and listed:
 * published, not deleted, marked by the platform (no short answers).
 *
 * Duplicates: one test never holds the same question twice, nor two questions with the same text and answer
 * (contentKey) — rejected with a clear message (assertNoDuplicateQuestions).
 */
import type { Repo, Row } from "../seeding/repo";
import { assertCan, ForbiddenError, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import { attachmentNodes, type AttachmentNode } from "../curriculum-map/questions";
import { teacherMapGrades } from "../curriculum-map/view";
import { lessonAt, lessonDetail, fixName } from "../curriculum-map/lesson-details";
import { fromDifficulty } from "../curriculum-map/leveled-run";
import { correctAnswerText, loadQuestionItems, type PracticeItem } from "../practice/items";
import type { QLevel } from "./question-source";

const s = (v: unknown) => String(v ?? "");
export const SECTION_PAGE = 20;
/** at most this many questions in one test (the test cap, MAX_TEST_QUESTIONS) */
export const MAX_PICKS = 60;
const LEVEL_TITLE: Record<QLevel, string> = { BELOW: "Approaching", ON: "Meeting", ABOVE: "Exceeding" };
/** the usual order of the map's categories; any other (new) category follows them, by name */
const CATEGORY_ORDER: Record<string, number> = { CONCEPT_VOCABULARY: 1, ANALYZE_CRAFT_AND_STRUCTURE: 2, RESPOND_TO_READING: 3 };
const LEVEL_ORDER: Record<string, number> = { BELOW: 1, ON: 2, ABOVE: 3 };

export interface MapSourceSection { code: string; category: string; label: string; level: QLevel | null; count: number }
export interface MapSourceSet { code: string; kind: string; number: number; heading: string; title: string; genre: string | null; keyWords: string[]; count: number; sections: MapSourceSection[] }
export interface MapSourceUnit { unit: number; title: string; count: number; sets: MapSourceSet[] }
export interface MapSourceTree { grades: number[]; grade: number | null; units: MapSourceUnit[] }
export interface MapSourceQuestion { id: string; stem: string; type: string; typeLabel: string; level: QLevel; passageTitle: string | null; contentKey: string; section: string; code: string; skill?: string; usedBefore?: boolean }
export interface MapSectionPage {
  code: string; label: string; total: number; page: number; pages: number;
  types: { code: string; label: string; count: number }[]; levels: { level: QLevel; count: number }[];
  questions: MapSourceQuestion[];
}

function staff(actor: Actor): void {
  if (actor.role !== "TEACHER" && actor.role !== "SCHOOL_ADMIN" && actor.role !== "SUPER_ADMIN") throw new ForbiddenError("Only teachers can build tests.");
  if (!actor.schoolId) throw new ForbiddenError("No school.");
  assertCan(actor, "questions:read");
}

/** "2- Analyze Craft and Structure" → "Analyze Craft and Structure" */
export const sectionTitle = (label: string): string => s(label).replace(/^\s*\d+\s*-\s*/, "").trim();
const sectionLabel = (n: AttachmentNode): string => [sectionTitle(n.categoryLabel), n.level ? LEVEL_TITLE[n.level] : null].filter(Boolean).join(" · ");
const setCode = (n: AttachmentNode): string => n.code.split(".").slice(0, 3).join(".");
/**
 * 🔁 fix (Oct 2026, "خليها باسم الدرس مثل skill plan"): the curated lesson name (same lookup/source as
 * lesson-details.ts#unitCards and mapSourceTree's own `title` just below), used wherever a Text Set/Selection used
 * to print its raw, generic `heading` ("Text Set 1: Narrative Nonfiction") in a question/section list — falls back
 * to the raw heading when this Text Set has no entry yet in the curated file (lesson-details.json).
 */
const setHeading = (n: Pick<AttachmentNode, "grade" | "sharedRead" | "setTitle" | "unitTitle" | "heading">): string =>
  (lessonDetail(n.grade, n.sharedRead) ?? lessonDetail(n.grade, n.setTitle) ?? lessonAt(n.grade, n.unitTitle, n.heading))?.name ?? n.heading;

/** The places the actor may use: a teacher's own grades only. */
export async function allowedNodes(repo: Repo, actor: Actor): Promise<AttachmentNode[]> {
  const own = await teacherMapGrades(repo, actor);
  return (await attachmentNodes(repo, actor.schoolId!)).filter((n) => !own || own.has(n.grade));
}

/** Question ids of these places that a test can use (published, not deleted, auto-marked), with their place. */
export async function usableLinks(repo: Repo, nodeIds: string[]): Promise<{ nodeId: string; q: Row }[]> {
  if (!nodeIds.length) return [];
  const links: Row[] = [];
  for (let i = 0; i < nodeIds.length; i += 300) links.push(...(await repo.findMany("QuestionMapLink", { nodeId: { in: nodeIds.slice(i, i + 300) } }, { select: ["nodeId", "questionId"] })));
  const ids = [...new Set(links.map((l) => s(l.questionId)))];
  const qs: Row[] = [];
  for (let i = 0; i < ids.length; i += 500) qs.push(...(await repo.findMany("Question", { id: { in: ids.slice(i, i + 500) }, status: "PUBLISHED", deletedAt: null }, { select: ["id", "typeId", "difficultyLevel"] })));
  const types = qs.length ? await repo.findMany("QuestionType", { id: { in: [...new Set(qs.map((q) => s(q.typeId)))] } }, { select: ["id", "code", "name", "isAutoScored"] }) : [];
  const auto = new Map(types.filter((t) => t.code !== "SHORT_ANSWER" && t.isAutoScored !== false && t.isAutoScored !== 0).map((t) => [s(t.id), t]));
  const byId = new Map(qs.filter((q) => auto.has(s(q.typeId))).map((q) => [s(q.id), { ...q, typeCode: s(auto.get(s(q.typeId))!.code), typeName: s(auto.get(s(q.typeId))!.name) }]));
  return links.flatMap((l) => { const q = byId.get(s(l.questionId)); return q ? [{ nodeId: s(l.nodeId), q }] : []; });
}

/** The grades the actor can browse (a teacher: their classes' grades; admin: all with a map). */
export async function mapSourceGrades(repo: Repo, actor: Actor): Promise<number[]> {
  staff(actor);
  return [...new Set((await allowedNodes(repo, actor)).map((n) => n.grade))].sort((a, b) => a - b);
}

/** One grade's units → text sets / selections → sections, with question counts (a grade outside the teacher's own falls back to their first grade). */
export async function mapSourceTree(repo: Repo, actor: Actor, grade?: number | null): Promise<MapSourceTree> {
  staff(actor);
  const nodes = await allowedNodes(repo, actor);
  const grades = [...new Set(nodes.map((n) => n.grade))].sort((a, b) => a - b);
  const g = grades.includes(Number(grade)) ? Number(grade) : grades[0] ?? null;
  if (g === null) return { grades, grade: null, units: [] };
  const mine = nodes.filter((n) => n.grade === g);
  const count = new Map<string, Set<string>>();
  for (const l of await usableLinks(repo, mine.map((n) => n.id))) { const c = count.get(l.nodeId) ?? new Set<string>(); c.add(s(l.q.id)); count.set(l.nodeId, c); }
  const units = new Map<number, MapSourceUnit>();
  const sets = new Map<string, MapSourceSet>();
  for (const n of mine) {
    let u = units.get(n.unit);
    if (!u) { u = { unit: n.unit, title: n.unitTitle, count: 0, sets: [] }; units.set(n.unit, u); }
    const key = setCode(n);
    let set = sets.get(key);
    if (!set) {
      const d = lessonDetail(g, n.sharedRead) ?? lessonDetail(g, n.setTitle) ?? lessonAt(g, n.unitTitle, n.heading);
      const title = d?.name ?? fixName(s(n.sharedRead ?? n.setTitle).replace(/^[“"']+|[”"']+$/g, "").trim());
      set = { code: key, kind: n.setKind, number: n.setNumber, heading: n.heading || n.setTitle, title, genre: d?.genre ?? n.genre, keyWords: d?.vocabulary ?? [], count: 0, sections: [] };
      sets.set(key, set);
      u.sets.push(set);
    }
    const c = count.get(n.id)?.size ?? 0;
    set.sections.push({ code: n.code, category: s(n.category), label: sectionLabel(n), level: n.level, count: c });
    set.count += c; u.count += c;
  }
  for (const set of sets.values()) set.sections.sort((a, b) => (CATEGORY_ORDER[a.category] ?? 50) - (CATEGORY_ORDER[b.category] ?? 50) || (CATEGORY_ORDER[a.category] ? 0 : a.label.localeCompare(b.label)) || (LEVEL_ORDER[a.level ?? ""] ?? 0) - (LEVEL_ORDER[b.level ?? ""] ?? 0));
  const list = [...units.values()].sort((a, b) => a.unit - b.unit);
  for (const u of list) u.sets.sort((a, b) => a.number - b.number);
  return { grades, grade: g, units: list };
}

const norm = (v: unknown) => s(v).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
/** Same question for a test: the same passage, the same question text and the same answer. */
export function contentKey(it: PracticeItem): string {
  let answer = "";
  try { answer = correctAnswerText(it); } catch { answer = ""; }
  return `${norm(it.passageTitle)}|${norm(s(it.passageText).slice(0, 120))}|${norm(it.stem)}|${norm(answer)}`;
}

/** One section's questions, a page at a time, filtered by type and level. `all`: every match (up to MAX_PICKS), for "Select all in section". */
export async function mapSectionQuestions(repo: Repo, actor: Actor, input: { code: string; page?: number; type?: string | null; level?: string | null; all?: boolean }): Promise<MapSectionPage> {
  staff(actor);
  const code = s(input.code).trim().toUpperCase();
  const node = (await attachmentNodes(repo, actor.schoolId!)).find((n) => n.code.toUpperCase() === code);
  if (!node) throw new ValidationError("That section is not on the Curriculum Map.");
  const own = await teacherMapGrades(repo, actor);
  if (own && !own.has(node.grade)) throw new ForbiddenError("The Curriculum Map of this grade is not one of your classes' grades.");
  const rows = (await usableLinks(repo, [node.id])).map((l) => l.q).sort((a, b) => (s(a.id) < s(b.id) ? -1 : s(a.id) > s(b.id) ? 1 : 0));
  const levelOf = (q: Row): QLevel => (node.level ?? fromDifficulty(Number(q.difficultyLevel ?? 4))) as QLevel;
  const types = new Map<string, { code: string; label: string; count: number }>();
  const levels = new Map<QLevel, number>();
  for (const q of rows) {
    const t = types.get(s(q.typeCode)) ?? { code: s(q.typeCode), label: s(q.typeName) || s(q.typeCode), count: 0 };
    t.count++; types.set(t.code, t);
    levels.set(levelOf(q), (levels.get(levelOf(q)) ?? 0) + 1);
  }
  const type = s(input.type).toUpperCase(), level = s(input.level).toUpperCase();
  const match = rows.filter((q) => (!type || type === "ALL" || s(q.typeCode) === type) && (!level || level === "ALL" || levelOf(q) === level));
  const pages = Math.max(1, Math.ceil(match.length / SECTION_PAGE));
  const page = Math.max(1, Math.min(pages, Math.round(Number(input.page) || 1)));
  const slice = input.all ? match.slice(0, MAX_PICKS) : match.slice((page - 1) * SECTION_PAGE, page * SECTION_PAGE);
  const items = await loadQuestionItems(repo, slice.map((q) => s(q.id)));
  const label = `${setHeading(node)} · ${sectionLabel(node)}`;
  const questions = slice.flatMap((q) => {
    const it = items.find((x) => x.questionId === s(q.id));
    return it ? [{ id: s(q.id), stem: s(it.stem).slice(0, 220), type: s(q.typeCode), typeLabel: s(q.typeName) || s(q.typeCode), level: levelOf(q), passageTitle: it.passageTitle ?? null, contentKey: contentKey(it), section: label, code: node.code }] : [];
  });
  return {
    code: node.code, label, total: match.length, page, pages,
    types: [...types.values()].sort((a, b) => a.label.localeCompare(b.label)),
    levels: (["BELOW", "ON", "ABOVE"] as QLevel[]).filter((l) => levels.has(l)).map((l) => ({ level: l, count: levels.get(l)! })),
    questions,
  };
}

/**
 * The picker rows of chosen questions (e.g. a saved draft's Curriculum Map picks), in the given order.
 * `limit` (default MAX_PICKS = 60): how many of `ids` to describe. 🐛 fix (Oct 2026, "التنظيم"): the Review screens
 * (review-control.ts) store and assign up to MAX_REVIEW (1000) questions, but this always silently truncated what
 * it showed the teacher to the first 60 — so a Review past 60 questions looked incomplete/unorganized on screen
 * even though every question was really there. Review now passes MAX_REVIEW here; every other caller (Assessments,
 * search, generation, …) keeps the default 60 unchanged.
 */
export async function describePicks(repo: Repo, actor: Actor, ids: string[], limit: number = MAX_PICKS): Promise<MapSourceQuestion[]> {
  staff(actor);
  const list = [...new Set((ids ?? []).map(s).filter(Boolean))].slice(0, limit);
  if (!list.length) return [];
  const [items, qs] = await Promise.all([loadQuestionItems(repo, list), repo.findMany("Question", { id: { in: list } }, { select: ["id", "typeId", "difficultyLevel", "skillId"] })]);
  const [types, skills] = qs.length ? await Promise.all([
    repo.findMany("QuestionType", { id: { in: [...new Set(qs.map((q) => s(q.typeId)))] } }, { select: ["id", "code", "name"] }),
    repo.findMany("Skill", { id: { in: [...new Set(qs.map((q) => s(q.skillId)))] } }, { select: ["id", "name"] }),
  ]) : [[], []];
  const links = await repo.findMany("QuestionMapLink", { questionId: { in: list } }, { select: ["questionId", "nodeId"] });
  const nodes = await attachmentNodes(repo, actor.schoolId!);
  // ⚡ lookups by id (the map has hundreds of places)
  const first = <T,>(rows: readonly T[], key: (r: T) => string) => { const m = new Map<string, T>(); for (const r of rows) { const k = key(r); if (!m.has(k)) m.set(k, r); } return m; };
  const itemOf = first(items, (x) => x.questionId), qOf = first(qs, (x) => s(x.id)), typeOf = first(types, (x) => s(x.id)), skillOf = first(skills, (k) => s(k.id));
  const nodeOf = first(nodes, (x) => x.id), linkOf = first(links, (l) => s(l.questionId));
  return list.flatMap((id) => {
    const it = itemOf.get(id);
    const q = qOf.get(id);
    if (!it || !q) return [];
    const t = typeOf.get(s(q.typeId));
    const n = nodeOf.get(s(linkOf.get(id)?.nodeId));
    const skill = s(skillOf.get(s(q.skillId))?.name);
    return [{ id, stem: s(it.stem).slice(0, 220), type: s(t?.code), typeLabel: s(t?.name ?? t?.code), level: (n?.level ?? fromDifficulty(Number(q.difficultyLevel ?? 4))) as QLevel, passageTitle: it.passageTitle ?? null, contentKey: contentKey(it), section: n ? `${setHeading(n)} · ${sectionLabel(n)}` : skill ? `🧩 ${skill}` : "", code: n?.code ?? "", skill }];
  });
}

/**
 * 🆕 r92 Review Builder ("اقترح اسئله لم تستخدم من قبل علي نفس الدرس"): which of these questions have already
 * been ASSIGNED to students before, in a past Review (⭐ Assign on a Review place) anywhere in this school — not
 * just sitting in a draft Review nobody has sent yet. "Used" = the question was part of a published TEACHER_QUIZ
 * Assessment that a non-deleted, CURRICULUM-track Assignment actually sent out. The candidate ids are already
 * scoped to one lesson/skill by the caller (sharedQuestions/setsQuestionIds/skillAddableIds), so this alone is
 * enough to tell "new" from "used before" for that lesson — no extra schema needed.
 */
export async function usedQuestionIds(repo: Repo, ids: string[]): Promise<Set<string>> {
  const list = [...new Set((ids ?? []).map(s).filter(Boolean))];
  if (!list.length) return new Set();
  const aqs = await repo.findMany("AssessmentQuestion", { questionId: { in: list } }, { select: ["questionId", "assessmentId"] });
  if (!aqs.length) return new Set();
  const assessmentIds = [...new Set(aqs.map((a) => s(a.assessmentId)))];
  const quizzes = await repo.findMany("Assessment", { id: { in: assessmentIds }, type: "TEACHER_QUIZ" }, { select: ["id"] });
  if (!quizzes.length) return new Set();
  const quizIds = new Set(quizzes.map((a) => s(a.id)));
  const sent = await repo.findMany("Assignment", { assessmentId: { in: [...quizIds] }, track: "CURRICULUM", deletedAt: null }, { select: ["assessmentId"] });
  const sentIds = new Set(sent.map((a) => s(a.assessmentId)));
  if (!sentIds.size) return new Set();
  const used = new Set<string>();
  for (const aq of aqs) if (sentIds.has(s(aq.assessmentId))) used.add(s(aq.questionId));
  return used;
}

/**
 * ❌ No duplicate content in one test: the same question twice, or two questions with the same text and answer,
 * is rejected with a clear message naming both positions.
 */
export async function assertNoDuplicateQuestions(repo: Repo, ids: string[]): Promise<void> {
  const list = (ids ?? []).map(s).filter(Boolean);
  const seen = new Map<string, number>();
  list.forEach((id, i) => {
    if (seen.has(id)) throw new ValidationError(`Question ${i + 1} is the same question as question ${seen.get(id)! + 1}. Remove one of them.`);
    seen.set(id, i);
  });
  const items = await loadQuestionItems(repo, list);
  const keyOf = new Map(items.map((it) => [it.questionId, contentKey(it)]));
  const byKey = new Map<string, number>();
  list.forEach((id, i) => {
    const k = keyOf.get(id);
    if (!k) return;
    if (byKey.has(k)) throw new ValidationError(`Question ${i + 1} has the same text and answer as question ${byKey.get(k)! + 1}. Remove one of them.`);
    byKey.set(k, i);
  });
}

/** Removes from `auto` (platform-chosen) questions any that repeat a question already chosen (same id or same text and answer). */
export async function withoutRepeats(repo: Repo, chosen: string[], auto: string[]): Promise<string[]> {
  if (!auto.length) return auto;
  const items = await loadQuestionItems(repo, [...new Set([...chosen, ...auto])]);
  const keyOf = new Map(items.map((it) => [it.questionId, contentKey(it)]));
  const ids = new Set(chosen), keys = new Set(chosen.map((id) => keyOf.get(id)).filter(Boolean) as string[]);
  const out: string[] = [];
  for (const id of auto) {
    const k = keyOf.get(id);
    if (ids.has(id) || (k && keys.has(k))) continue;
    ids.add(id); if (k) keys.add(k);
    out.push(id);
  }
  return out;
}
