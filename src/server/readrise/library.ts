/**
 * 🚀 ReadRise — the article library as staff see it.
 *
 *   PLATFORM articles (schoolId null) are visible to every school unless the school hides them
 *   (SchoolSetting "readrise.hidden" = JSON array of article ids). SCHOOL articles belong to one school.
 *   Teachers see published articles plus their own drafts; admins see all of their school's articles.
 *   Publishing needs questions:publish; a teacher without it imports a DRAFT and an admin publishes.
 */
import type { Repo, Row } from "../seeding/repo";
import { assertCan, can, ForbiddenError, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import { audit } from "../audit";
import { BANDS, LEVEL_TOLERANCE, type ArticleJson, type BandJson } from "./import";
import { targetWords, type RRBand } from "./level";
import { modelVersion } from "../cache/bank-version";
import { sweptWeakValue } from "../cache/idle";

export const HIDDEN_KEY = "readrise.hidden";
const s = (v: unknown) => String(v ?? "");
const isAdmin = (a: Actor) => a.role === "SCHOOL_ADMIN" || a.role === "SUPER_ADMIN";
const isStaff = (a: Actor) => a.role === "TEACHER" || isAdmin(a);
const json = <T>(v: unknown, fallback: T): T => {
  if (typeof v === "string") { try { return JSON.parse(v) as T; } catch { return fallback; } }
  return (v ?? fallback) as T;
};

/** Platform article ids this school has hidden. */
export async function hiddenArticleIds(repo: Repo, schoolId: string | null): Promise<Set<string>> {
  if (!schoolId) return new Set();
  const row = (await repo.findMany("SchoolSetting", { schoolId, key: HIDDEN_KEY }))[0];
  const v = json<unknown>(row?.value, []);
  const ids = Array.isArray(v) ? v : v && typeof v === "object" && Array.isArray((v as { ids?: unknown }).ids) ? (v as { ids: unknown[] }).ids : [];
  return new Set(ids.map(String));
}

export type Source = "PLATFORM" | "SCHOOL";
export interface LibraryFilters { topic?: string; status?: string; source?: string; q?: string }
export interface LibraryItem {
  id: string; code: string; title: string; topic: string; summary: string | null; status: string; source: Source;
  hidden: boolean; mine: boolean; versions: number; levelWarnings: number; updatedAt: string; canEdit: boolean;
}

/** May this actor change (publish, delete, edit Lexile) this article? Platform articles: only a super admin. */
export function canManage(actor: Actor, a: Row): boolean {
  if (!isStaff(actor)) return false;
  if (a.schoolId === null || a.schoolId === undefined) return actor.role === "SUPER_ADMIN";
  if (s(a.schoolId) !== actor.schoolId && actor.role !== "SUPER_ADMIN") return false;
  return isAdmin(actor) || s(a.createdById) === actor.userId;
}

/** Can this actor open this article (scope + status + hidden)? */
export function canView(actor: Actor, a: Row, hidden: Set<string>): boolean {
  if (!isStaff(actor) || a.deletedAt) return false;
  if (a.schoolId === null || a.schoolId === undefined) return isAdmin(actor) || (a.status === "PUBLISHED" && !hidden.has(s(a.id)));
  if (s(a.schoolId) !== actor.schoolId && actor.role !== "SUPER_ADMIN") return false;
  return isAdmin(actor) || a.status === "PUBLISHED" || s(a.createdById) === actor.userId;
}

/** the article columns the list shows and checks (not the poll text) */
const LIST_COLUMNS = ["id", "schoolId", "code", "title", "topic", "summary", "status", "createdById", "updatedAt", "deletedAt"] as const;

type VersionStats = Map<string, { versions: number; levelWarnings: number }>;
/** Per article: how many versions, and how many whose measured level is off the target (the list's warning). */
async function versionStats(repo: Repo, ids: string[]): Promise<VersionStats> {
  const out: VersionStats = new Map();
  if (!ids.length) return out;
  for (const v of await repo.findMany("RRVersion", { articleId: { in: ids } }, { select: ["articleId", "level", "estLevel"] })) {
    const k = s(v.articleId), c = out.get(k) ?? { versions: 0, levelWarnings: 0 };
    c.versions++;
    if (Math.abs(Number(v.estLevel) - Number(v.level)) > LEVEL_TOLERANCE) c.levelWarnings++;
    out.set(k, c);
  }
  return out;
}

const platformCache = sweptWeakValue<{ v: string; at: number; p: Promise<{ rows: Row[]; stats: VersionStats }> }>("readrise.library.platformCache", 2 * 60_000);
/**
 * ⚡ The platform library's list rows and version stats: the same for every school, so kept in memory per data
 * source until a write to RRArticle / RRVersion in this process (import, publish, delete, a new library file) and for
 * at most a minute (another process may change them). Rows are shared: callers never change them.
 */
function platformList(repo: Repo): Promise<{ rows: Row[]; stats: VersionStats }> {
  const v = modelVersion("RRArticle", "RRVersion"), hit = platformCache.get(repo);
  if (hit && hit.v === v && Date.now() - hit.at < 60_000) return hit.p;
  const p = (async () => {
    const rows = await repo.findMany("RRArticle", { schoolId: null, deletedAt: null }, { select: LIST_COLUMNS });
    return { rows, stats: await versionStats(repo, rows.map((a) => s(a.id))) };
  })();
  platformCache.set(repo, { v, at: Date.now(), p });
  p.catch(() => { if (platformCache.get(repo)?.p === p) platformCache.delete(repo); });
  return p;
}

/** Every article this actor can see, with the filters (topic, status, source, search). */
export async function listLibrary(repo: Repo, actor: Actor, f: LibraryFilters = {}): Promise<{ items: LibraryItem[]; topics: string[] }> {
  if (!isStaff(actor)) throw new ForbiddenError("Only teachers and admins can open the ReadRise library.");
  assertCan(actor, "questions:read");
  const [hidden, platform, school] = await Promise.all([
    hiddenArticleIds(repo, actor.schoolId),
    platformList(repo),
    actor.schoolId ? repo.findMany("RRArticle", { schoolId: actor.schoolId, deletedAt: null }, { select: LIST_COLUMNS }) : Promise.resolve([] as Row[]),
  ]);
  const all = [...platform.rows, ...school].filter((a) => canView(actor, a, hidden));
  const schoolStats = await versionStats(repo, all.filter((a) => a.schoolId).map((a) => s(a.id)));
  const topics = [...new Set(all.map((a) => s(a.topic)))].sort();
  const q = (f.q ?? "").trim().toLowerCase();
  const items = all.map((a): LibraryItem => {
    const vs = (a.schoolId ? schoolStats : platform.stats).get(s(a.id)) ?? { versions: 0, levelWarnings: 0 };
    return {
      id: s(a.id), code: s(a.code), title: s(a.title), topic: s(a.topic), summary: a.summary ? s(a.summary) : null, status: s(a.status),
      source: a.schoolId ? "SCHOOL" : "PLATFORM", hidden: hidden.has(s(a.id)), mine: s(a.createdById) === actor.userId,
      versions: vs.versions, levelWarnings: vs.levelWarnings,
      updatedAt: new Date(a.updatedAt as string | Date).toISOString(), canEdit: canManage(actor, a),
    };
  }).filter((i) =>
    (!f.topic || i.topic === f.topic) && (!f.status || i.status === f.status) && (!f.source || i.source === f.source)
    && (!q || i.title.toLowerCase().includes(q) || i.code.toLowerCase().includes(q) || (i.summary ?? "").toLowerCase().includes(q)),
  ).sort((x, y) => (x.source === y.source ? 0 : x.source === "SCHOOL" ? -1 : 1) || x.code.localeCompare(y.code, undefined, { numeric: true }));
  return { items, topics };
}

export interface ArticleDetail {
  id: string; code: string; title: string; topic: string; summary: string | null; poll: string; status: string; source: Source;
  hidden: boolean; canEdit: boolean; canPublish: boolean; canHide: boolean; createdById: string | null;
  versions: { id: string; level: number; title: string; body: string; wordCount: number; estLevel: number; officialLexile: number | null; target: { min: number; max: number }; levelOk: boolean }[];
  bands: Record<RRBand, {
    keyWords: { word: string; partOfSpeech?: string; definition: string; example: string }[];
    questions: { id: string; number: number; stem: string; options: string[]; answer: string; skill: string; rationale: Record<string, string> | null }[];
    prompt: string; checklist: string[];
  }>;
}

async function loadArticle(repo: Repo, id: string): Promise<Row> {
  const a = await repo.findUnique("RRArticle", { id });
  if (!a || a.deletedAt) throw new ValidationError("This article does not exist.");
  return a;
}

/** One article with all 12 versions, key words, questions and prompts per band. */
export async function articleDetail(repo: Repo, actor: Actor, id: string): Promise<ArticleDetail> {
  const a = await loadArticle(repo, id);
  const hidden = await hiddenArticleIds(repo, actor.schoolId);
  if (!canView(actor, a, hidden)) throw new ForbiddenError("You cannot open this article.");
  const [versions, questions, prompts] = await Promise.all([
    repo.findMany("RRVersion", { articleId: id }), repo.findMany("RRQuestion", { articleId: id }), repo.findMany("RRPrompt", { articleId: id }),
  ]);
  const bands = Object.fromEntries(BANDS.map((b) => {
    const p = prompts.find((x) => x.band === b);
    return [b, {
      keyWords: json(p?.keyWords, [] as ArticleDetail["bands"][RRBand]["keyWords"]),
      questions: questions.filter((q) => q.band === b).sort((x, y) => Number(x.number) - Number(y.number)).map((q) => ({
        id: s(q.id), number: Number(q.number), stem: s(q.stem), options: json(q.options, [] as string[]), answer: s(q.answer), skill: s(q.skill), rationale: json(q.rationale, null as Record<string, string> | null),
      })),
      prompt: s(p?.prompt), checklist: json(p?.checklist, [] as string[]),
    }];
  })) as ArticleDetail["bands"];
  const manage = canManage(actor, a);
  return {
    id, code: s(a.code), title: s(a.title), topic: s(a.topic), summary: a.summary ? s(a.summary) : null, poll: s(a.pollStatement), status: s(a.status),
    source: a.schoolId ? "SCHOOL" : "PLATFORM", hidden: hidden.has(id), canEdit: manage, canPublish: manage && can(actor, "questions:publish"),
    canHide: !a.schoolId && isAdmin(actor) && !!actor.schoolId, createdById: a.createdById ? s(a.createdById) : null,
    versions: versions.sort((x, y) => Number(x.level) - Number(y.level)).map((v) => ({
      id: s(v.id), level: Number(v.level), title: s(v.title), body: s(v.body), wordCount: Number(v.wordCount), estLevel: Number(v.estLevel),
      officialLexile: v.officialLexile === null || v.officialLexile === undefined ? null : Number(v.officialLexile),
      target: targetWords(Number(v.level)), levelOk: Math.abs(Number(v.estLevel) - Number(v.level)) <= LEVEL_TOLERANCE,
    })),
    bands,
  };
}

/** Publish or unpublish an article the actor manages (needs questions:publish). */
export async function setArticleStatus(repo: Repo, actor: Actor, id: string, status: "DRAFT" | "PUBLISHED", now = new Date()): Promise<void> {
  const a = await loadArticle(repo, id);
  if (!canManage(actor, a)) throw new ForbiddenError(a.schoolId ? "You can only change your own articles." : "Platform articles are managed by the platform. You can hide one for your school instead.");
  if (!can(actor, "questions:publish")) throw new ForbiddenError("Publishing needs the questions:publish permission. Ask an admin to publish this article.");
  if (status !== "DRAFT" && status !== "PUBLISHED") throw new ValidationError("Unknown status.");
  if (status === "PUBLISHED") {
    const [v, q, p] = await Promise.all([repo.count("RRVersion", { articleId: id }), repo.count("RRQuestion", { articleId: id }), repo.count("RRPrompt", { articleId: id })]);
    if (v !== 12 || q !== 24 || p !== 3) throw new ValidationError("This article is incomplete (12 versions, 24 questions and 3 prompts are needed). Import it again.");
  }
  await repo.updateMany("RRArticle", { id }, { status, updatedAt: now });
  await audit(repo, { actorId: actor.userId, action: status === "PUBLISHED" ? "readrise.article.publish" : "readrise.article.unpublish", entityType: "RRArticle", entityId: id, before: { status: a.status }, after: { status }, at: now });
}

/** Hide or show a PLATFORM article for the admin's school. */
export async function setArticleHidden(repo: Repo, actor: Actor, id: string, hide: boolean, now = new Date()): Promise<void> {
  if (!isAdmin(actor) || !actor.schoolId) throw new ForbiddenError("Only a school admin can hide platform articles.");
  const a = await loadArticle(repo, id);
  if (a.schoolId) throw new ValidationError("Only platform articles can be hidden. Unpublish or delete your school's own article instead.");
  const set = await hiddenArticleIds(repo, actor.schoolId);
  if (hide) set.add(id); else set.delete(id);
  const value = [...set];
  await repo.upsert("SchoolSetting", { schoolId: actor.schoolId, key: HIDDEN_KEY }, { value, updatedBy: actor.userId, updatedAt: now }, { value, updatedBy: actor.userId, updatedAt: now });
  await audit(repo, { actorId: actor.userId, action: hide ? "readrise.article.hide" : "readrise.article.unhide", entityType: "RRArticle", entityId: id, at: now });
}

/** Soft delete an article the actor manages (school articles only; platform ones can be hidden). */
export async function deleteArticle(repo: Repo, actor: Actor, id: string, now = new Date()): Promise<void> {
  const a = await loadArticle(repo, id);
  if (!a.schoolId && actor.role !== "SUPER_ADMIN") throw new ForbiddenError("Platform articles cannot be deleted by a school. Hide it instead.");
  if (!canManage(actor, a)) throw new ForbiddenError("You can only delete your own articles.");
  await repo.updateMany("RRArticle", { id }, { deletedAt: now, status: "DRAFT", updatedAt: now });
  await repo.deleteMany("RRClassArticle", { articleId: id });
  await audit(repo, { actorId: actor.userId, action: "readrise.article.delete", entityType: "RRArticle", entityId: id, before: { code: a.code, status: a.status }, at: now });
}

/** Store (or clear) the official Lexile of one version — only from a licensed analyzer. */
export async function setOfficialLexile(repo: Repo, actor: Actor, versionId: string, value: number | null, now = new Date()): Promise<void> {
  const v = await repo.findUnique("RRVersion", { id: versionId });
  if (!v) throw new ValidationError("This version does not exist.");
  const a = await loadArticle(repo, s(v.articleId));
  if (!canManage(actor, a)) throw new ForbiddenError("You can only edit your own articles.");
  if (value !== null && (!Number.isInteger(value) || value < 0 || value > 2000)) throw new ValidationError("Official Lexile must be a whole number from 0 to 2000.");
  await repo.updateMany("RRVersion", { id: versionId }, { officialLexile: value });
  await repo.updateMany("RRArticle", { id: a.id }, { updatedAt: now });
  await audit(repo, { actorId: actor.userId, action: "readrise.version.lexile", entityType: "RRVersion", entityId: versionId, before: { officialLexile: v.officialLexile ?? null }, after: { officialLexile: value }, at: now });
}

/** Published articles the actor may assign (visible, published, not hidden). */
export async function assignableArticles(repo: Repo, actor: Actor): Promise<{ id: string; code: string; title: string; topic: string }[]> {
  const { items } = await listLibrary(repo, actor, { status: "PUBLISHED" });
  return items.filter((i) => !i.hidden).map((i) => ({ id: i.id, code: i.code, title: i.title, topic: i.topic }));
}

/** An article in the import format (data/readrise/FORMAT.md): download, edit, import again (school copies need a non-"RR-" code). */
export function articleToJson(d: ArticleDetail): ArticleJson {
  const band = (b: RRBand): BandJson => ({
    keyWords: d.bands[b].keyWords.map((k) => ({ word: k.word, partOfSpeech: k.partOfSpeech ?? "", definition: k.definition, example: k.example })),
    questions: d.bands[b].questions.map((q) => {
      const r = q.rationale ?? {};
      const wrong = Object.fromEntries(Object.entries(r).filter(([L]) => L !== q.answer));
      return { stem: q.stem, options: q.options, answer: q.answer, skill: q.skill, ...(r[q.answer] ? { why: r[q.answer] } : {}), ...(Object.keys(wrong).length ? { wrong } : {}) };
    }),
    prompt: d.bands[b].prompt, checklist: d.bands[b].checklist,
  });
  return {
    code: d.code, title: d.title, topic: d.topic, summary: d.summary ?? "", poll: d.poll,
    versions: d.versions.map((v) => ({ level: v.level, title: v.title, text: v.body, ...(v.officialLexile !== null ? { officialLexile: v.officialLexile } : {}) })),
    bands: { LOW: band("LOW"), MID: band("MID"), HIGH: band("HIGH") },
  };
}
