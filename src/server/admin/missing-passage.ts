/**
 * 🧾 Questions that need a missing passage (owner, r68): their wording depends on a passage, story, text, poem, chart
 * or picture that is not attached (src/lib/missing-passage.ts). They are removed from the platform by the admin delete
 * rule as a SOFT delete (question-delete.ts deleteQuestions { soft: true }): hidden everywhere — bank, practice pools,
 * tests and sets not started — with every student answer kept and the row still there for an admin to bring back.
 *
 *   missingPassagePage    one batch of the school's bank (by id), for the Fix stuck questions job and the list
 *   listMissingPassage    the list the admin sees first (Question Bank → “Remove questions that need a missing passage”)
 *   removeMissingPassage  the one-click action: checks each again, then soft-deletes them in batches
 *
 * A question carries its own text when it has a passage with text, a picture, or content with 40+ words (a hot-text
 * passage, the rows of a grid …). Reads are batched; nothing is held for the whole bank.
 */
import type { Repo, Row } from "../seeding/repo";
import { assertCan, ForbiddenError, type Actor } from "../auth/rbac";
import { missingPassageReason, needsMissingPassage } from "../../lib/missing-passage";
import { isHiddenSkill } from "../skills/master";

const s = (v: unknown) => String(v ?? "");
export const SCAN_BATCH = 150;
const LIST_CAP = 500;

export interface NoPassageItem { id: string; stem: string; reason: string; status: string; skill: string; grade: number }

function adminSchool(actor: Actor): string {
  if (actor.role !== "SCHOOL_ADMIN" && actor.role !== "SUPER_ADMIN") throw new ForbiddenError("Only a school admin can remove questions.");
  assertCan(actor, "questions:publish");
  if (!actor.schoolId) throw new ForbiddenError("Choose a school first.");
  return actor.schoolId;
}

interface Skills { ids: string[]; name: Map<string, string>; grade: Map<string, number> }
async function schoolSkills(repo: Repo, schoolId: string): Promise<Skills> {
  const grades = await repo.findMany("Grade", { schoolId }, { select: ["id", "level"] });
  const curs = grades.length ? await repo.findMany("Curriculum", { gradeId: { in: grades.map((g) => g.id) } }, { select: ["id", "gradeId"] }) : [];
  const all = curs.length ? await repo.findMany("Skill", { curriculumId: { in: curs.map((c) => c.id) } }, { select: ["id", "name", "code", "curriculumId"] }) : [];
  const lvl = new Map(curs.map((c) => [s(c.id), Number(grades.find((g) => g.id === c.gradeId)?.level ?? 0)]));
  return { ids: all.map((k) => s(k.id)), name: new Map(all.map((k) => [s(k.id), isHiddenSkill(k.code) ? "Not under a skill" : s(k.name)])), grade: new Map(all.map((k) => [s(k.id), lvl.get(s(k.curriculumId)) ?? 0])) };
}

/** Words of every text inside a question's content (a hot-text passage, grid rows, matching pairs …). */
function contentWords(content: unknown): number {
  let v: unknown = content;
  if (typeof content === "string") { try { v = JSON.parse(content); } catch { return content.split(/\s+/).filter(Boolean).length; } }
  let n = 0;
  const walk = (x: unknown, depth: number): void => {
    if (depth > 6 || n >= 40) return;
    if (typeof x === "string") { n += x.split(/\s+/).filter(Boolean).length; return; }
    if (Array.isArray(x)) { for (const y of x) walk(y, depth + 1); return; }
    if (x && typeof x === "object") for (const [k, y] of Object.entries(x)) if (!/^(?:correct|answer|answers|key|accepted|explanation|why|rationale|feedback|hint)$/i.test(k)) walk(y, depth + 1);
  };
  walk(v, 0);
  return n;
}

/** The questions of one page (pure but for the passage lookup): those that need a missing passage, with the reason. */
export async function checkQuestions(repo: Repo, page: Row[]): Promise<{ q: Row; reason: string }[]> {
  const pids = [...new Set(page.map((q) => s(q.passageId)).filter(Boolean))];
  const withText = new Set(pids.length ? (await repo.findMany("ReadingPassage", { id: { in: pids } }, { select: ["id", "body"] })).filter((p) => s(typeof p.body === "string" ? p.body : JSON.stringify(p.body ?? "")).replace(/["\[\]{}]/g, "").trim().length > 20).map((p) => s(p.id)) : []);
  const out: { q: Row; reason: string }[] = [];
  for (const q of page) {
    const hit = needsMissingPassage(s(q.stem), { passage: Boolean(q.passageId && withText.has(s(q.passageId))) || contentWords(q.content) >= 40, image: Boolean(q.imageId) });
    if (hit) out.push({ q, reason: missingPassageReason(hit) });
  }
  return out;
}

/** One batch of the school's live bank (not deleted), by id. */
export async function missingPassagePage(repo: Repo, schoolId: string, after: string | null, take = SCAN_BATCH, sk?: Skills): Promise<{ items: NoPassageItem[]; next: string | null; processed: number }> {
  const skills = sk ?? (await schoolSkills(repo, schoolId));
  if (!skills.ids.length) return { items: [], next: null, processed: 0 };
  const page = await repo.findMany("Question", { skillId: { in: skills.ids }, deletedAt: null, ...(after ? { id: { gt: after } } : {}) },
    { select: ["id", "stem", "passageId", "imageId", "content", "status", "skillId"], orderBy: [{ field: "id", dir: "asc" }], take });
  if (!page.length) return { items: [], next: null, processed: 0 };
  const items = (await checkQuestions(repo, page)).map(({ q, reason }) => ({ id: s(q.id), stem: s(q.stem).replace(/\s+/g, " ").slice(0, 200), reason, status: s(q.status), skill: skills.name.get(s(q.skillId)) ?? "", grade: skills.grade.get(s(q.skillId)) ?? 0 }));
  return { items, next: page.length < take ? null : s(page[page.length - 1].id), processed: page.length };
}

/** The list the admin sees before removing (first LIST_CAP, and how many in all). */
export async function listMissingPassage(repo: Repo, actor: Actor): Promise<{ items: NoPassageItem[]; total: number }> {
  const schoolId = adminSchool(actor);
  const sk = await schoolSkills(repo, schoolId);
  const items: NoPassageItem[] = [];
  let total = 0, after: string | null = null;
  for (let guard = 0; guard < 10_000; guard++) {
    const r: Awaited<ReturnType<typeof missingPassagePage>> = await missingPassagePage(repo, schoolId, after, SCAN_BATCH, sk);
    total += r.items.length;
    for (const x of r.items) if (items.length < LIST_CAP) items.push(x);
    if (!r.next) break;
    after = r.next;
  }
  return { items: items.sort((a, b) => a.grade - b.grade || a.skill.localeCompare(b.skill) || a.stem.localeCompare(b.stem)), total };
}

export const WHY_REMOVED = "needs a passage / picture that is not attached (r68)";

/**
 * Soft-deletes these questions when each STILL needs a missing passage (checked again here; anything else is skipped).
 * Batches of 100 through the admin delete rule; open flags leave Flagged Questions.
 */
export async function removeMissingPassage(repo: Repo, actor: Actor, ids: string[], now = new Date()): Promise<{ removed: number; skipped: number }> {
  const schoolId = adminSchool(actor);
  const { deleteQuestions } = await import("./question-delete");
  const sk = await schoolSkills(repo, schoolId);
  const mine = new Set(sk.ids);
  let removed = 0, skipped = 0;
  const unique = [...new Set(ids.map(s).filter(Boolean))];
  for (let i = 0; i < unique.length; i += 100) {
    const part = unique.slice(i, i + 100);
    const rows = (await repo.findMany("Question", { id: { in: part }, deletedAt: null }, { select: ["id", "stem", "passageId", "imageId", "content", "status", "skillId"] })).filter((q) => mine.has(s(q.skillId)));
    const hits = (await checkQuestions(repo, rows)).map((x) => s(x.q.id));
    skipped += part.length - hits.length;
    if (hits.length) removed += (await deleteQuestions(repo, actor, hits, now, { soft: true, why: WHY_REMOVED })).deleted;
  }
  return { removed, skipped };
}

/** Every question of the school that needs a missing passage, removed (the one-click action without a list). */
export async function removeAllMissingPassage(repo: Repo, actor: Actor, now = new Date()): Promise<{ removed: number }> {
  const schoolId = adminSchool(actor);
  const sk = await schoolSkills(repo, schoolId);
  let removed = 0, after: string | null = null;
  for (let guard = 0; guard < 10_000; guard++) {
    const r: Awaited<ReturnType<typeof missingPassagePage>> = await missingPassagePage(repo, schoolId, after, SCAN_BATCH, sk);
    if (r.items.length) removed += (await removeMissingPassage(repo, actor, r.items.map((x) => x.id), now)).removed;
    if (!r.next) break;
    after = r.next;
  }
  return { removed };
}
