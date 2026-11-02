/**
 * ✏️ "Update answer choices from files" (Admin → Questions → Answer-length check): applies the rewrite manifests
 * data/questions/option-rewrites/*.json to the questions already in the database.
 *
 *   manifest  an array of { stem, correct, replace: [{ old, new }, …] } — the WRONG choices' old and new texts of one
 *             question (the correct choice is never in `replace` and is never changed).
 *   match     a question whose normalized stem (trim, spaces collapsed) equals `stem` AND whose CORRECT choice's
 *             normalized text equals `correct`; then each `replace` pair changes that question's WRONG choice whose
 *             normalized text equals `old` into `new`. Nothing else is touched: not the correct choice, the isCorrect
 *             flags, the order / letters, rationales, statistics or students' answers (they keep the letter).
 *
 * Where the questions are (see the report of this change):
 *   QuestionOption   every bank question — the Question Bank, Curriculum Map, NAFS (booklets, practice sets, the NAFS
 *                    bank: NafsBankItem → Question) and ReadMaster (ReadMasterQuestion → Question) — phase "question"
 *   RRQuestion       ReadRise articles' questions (options JSON array + answer letter) — phase "readrise"
 *   files only       Learn lessons (data/learn) and the ReadRise placement test (data/readrise/placement.json) are read
 *                    from the data files at run time: nothing to update here.
 *
 * Bounded and resumable like Load new questions: the page calls ONE short chunk per request (a page of ≤ 500 question
 * ids, their choices read only for the questions whose stem is in a manifest), first to PREVIEW (counts per source +
 * examples, nothing written), then to APPLY. The apply's place is kept per school (SchoolSetting), so a stopped run goes
 * on from there; running it again changes nothing (a choice already reading `new` is "already up to date").
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { Repo, Row } from "../seeding/repo";
import { assertCan, ForbiddenError, type Actor } from "../auth/rbac";
import { audit } from "../audit";
import { IdleBox } from "../cache/idle";
import { schoolSkillIndex } from "../questions/skill-questions";
import { hashQuestions, saveHashes } from "../questions/dedupe-hash";

const s = (v: unknown) => String(v ?? "");
/** the manifests' text match: trim + spaces collapsed (case and punctuation kept) */
export const normText = (v: unknown): string => s(v).replace(/\s+/g, " ").trim();

// ------------------------------------------------------------------ the manifest files

let dirOverride: string | null = null;
/** Tests: read the manifests from another folder; null = data/questions/option-rewrites. */
export function useRewriteDir(dir: string | null): void { dirOverride = dir; box.clear(); }
export const rewriteDir = (): string => dirOverride ?? join(process.cwd(), "data", "questions", "option-rewrites");

export interface RewriteEntry { n: number; stem: string; correct: string; replace: { old: string; new: string }[] }
export interface Manifest {
  dir: string; present: boolean; files: string[]; entries: number; sig: string;
  problems: string[];
  byStem: Map<string, RewriteEntry[]>;
}
const box = new IdleBox<Manifest>("admin.option-rewrites");

function signature(dir: string): { files: string[]; sig: string } {
  if (!existsSync(dir)) return { files: [], sig: "" };
  let files: string[] = [];
  try { files = readdirSync(dir).filter((f) => f.endsWith(".json")).sort(); } catch { return { files: [], sig: "" }; }
  return { files, sig: files.map((f) => { try { const st = statSync(join(dir, f)); return `${f}:${st.size}:${Math.round(st.mtimeMs)}`; } catch { return f; } }).join("|") };
}

/** Pure: checks one manifest's JSON; the good entries are added to `out` (numbered from out.next). */
export function parseManifest(raw: unknown, file: string, out: { byStem: Map<string, RewriteEntry[]>; next: number; problems: string[] }): number {
  if (!Array.isArray(raw)) { out.problems.push(`${file}: not a list of questions`); return 0; }
  let added = 0, bad = 0;
  for (const r of raw) {
    const e = (r ?? {}) as Record<string, unknown>;
    const stem = normText(e.stem), correct = normText(e.correct);
    const pairs = (Array.isArray(e.replace) ? e.replace : [])
      .map((p) => ({ old: normText((p as Record<string, unknown>)?.old), new: normText((p as Record<string, unknown>)?.new) }))
      // the correct choice is never changed, and no wrong choice becomes the correct one's words
      .filter((p) => p.old && p.new && p.old !== correct && p.new !== correct);
    if (!stem || !correct || !pairs.length) { bad++; continue; }
    const entry: RewriteEntry = { n: out.next++, stem, correct, replace: pairs };
    (out.byStem.get(stem) ?? out.byStem.set(stem, []).get(stem)!).push(entry);
    added++;
  }
  if (bad) out.problems.push(`${file}: ${bad} entr${bad === 1 ? "y" : "ies"} skipped (no stem, no correct answer or nothing to replace)`);
  return added;
}

/** The manifests (kept in memory while used; re-read when a file changes; released when idle). */
export function readManifest(dir: string = rewriteDir()): Manifest {
  const { files, sig } = signature(dir);
  const hit = box.get();
  if (hit && hit.dir === dir && hit.sig === sig) return hit;
  const out = { byStem: new Map<string, RewriteEntry[]>(), next: 0, problems: [] as string[] };
  for (const f of files) {
    try { parseManifest(JSON.parse(readFileSync(join(dir, f), "utf8")), f, out); }
    catch (e) { out.problems.push(`${f}: not valid JSON (${(e as Error).message.slice(0, 120)})`); }
  }
  return box.set({ dir, present: existsSync(dir), files, entries: out.next, sig, problems: out.problems.slice(0, 20), byStem: out.byStem });
}

// ------------------------------------------------------------------ one question's plan (pure)

export interface PlanChoice { text: string; correct: boolean }
export interface QuestionPlan {
  /** the manifest entries this question matched */
  entries: number[];
  /** the wrong choices to change (their position in `choices`) */
  changes: { index: number; old: string; new: string }[];
  /** pairs whose old text is not there and whose new text is not there either */
  missing: number;
}

/** Pure: what a manifest does to one question (null = no entry matches its stem + correct answer). */
export function planQuestion(stem: unknown, choices: readonly PlanChoice[], byStem: Map<string, RewriteEntry[]>): QuestionPlan | null {
  const list = byStem.get(normText(stem));
  if (!list?.length) return null;
  const correctTexts = new Set(choices.filter((c) => c.correct).map((c) => normText(c.text)));
  const entries = list.filter((e) => correctTexts.has(e.correct));
  if (!entries.length) return null;
  const now = choices.map((c) => normText(c.text));
  const changes: QuestionPlan["changes"] = [];
  let missing = 0;
  for (const e of entries) for (const p of e.replace) {
    const i = choices.findIndex((c, k) => !c.correct && now[k] === p.old && !changes.some((x) => x.index === k));
    if (i >= 0) {
      // never two choices with the same words
      if (now.some((t, k) => k !== i && t === p.new)) { missing++; continue; }
      changes.push({ index: i, old: choices[i].text, new: p.new });
      now[i] = p.new;
    } else if (!choices.some((c, k) => !c.correct && now[k] === p.new)) missing++;
  }
  return { entries: entries.map((e) => e.n), changes, missing };
}

// ------------------------------------------------------------------ chunks

export const SOURCES = ["BANK", "MAP", "NAFS", "READMASTER", "READRISE"] as const;
export type RewriteSource = (typeof SOURCES)[number];
export const SOURCE_LABEL: Record<RewriteSource, string> = { BANK: "Question Bank", MAP: "Curriculum Map", NAFS: "NAFS", READMASTER: "ReadMaster", READRISE: "ReadRise" };
export interface SourceCounts { matched: number; toChange: number; upToDate: number; notFound: number; options: number }
export const zeroCounts = (): SourceCounts => ({ matched: 0, toChange: 0, upToDate: 0, notFound: 0, options: 0 });
export interface RewriteExample { source: RewriteSource; id: string; stem: string; old: string; new: string }
export type Phase = "question" | "readrise";
export interface RewriteCursor { phase: Phase; after: string | null }
export interface RewriteChunk {
  counts: Partial<Record<RewriteSource, SourceCounts>>;
  examples: RewriteExample[];
  /** the manifest entries matched in this chunk (the page counts the entries never found) */
  entries: number[];
  scanned: number;
  next: RewriteCursor | null;
  /** apply: choices changed in this chunk */
  changed: number;
}

/** question ids per request: a preview only reads ids + stems (and choices of the matched ones); an apply also writes */
export const PREVIEW_TAKE = 500;
export const APPLY_TAKE = 200;
const PROGRESS_KEY = "option-rewrites.apply";

function schoolOf(actor: Actor): string {
  assertCan(actor, "questions:edit");
  if (actor.role !== "SCHOOL_ADMIN" && actor.role !== "SUPER_ADMIN") throw new ForbiddenError("Only an admin can update answer choices.");
  if (!actor.schoolId) throw new ForbiddenError("No school.");
  return actor.schoolId;
}

const optArray = (v: unknown): string[] => {
  let x = v;
  if (typeof x === "string") { try { x = JSON.parse(x); } catch { return []; } }
  return Array.isArray(x) ? x.map(s) : [];
};

async function readriseArticleIds(repo: Repo, schoolId: string): Promise<string[]> {
  const [platform, own] = await Promise.all([
    repo.findMany("RRArticle", { schoolId: null, deletedAt: null }, { select: ["id"] }),
    repo.findMany("RRArticle", { schoolId, deletedAt: null }, { select: ["id"] }),
  ]);
  return [...platform, ...own].map((a) => s(a.id));
}

/** The source of each of these bank questions: NAFS > ReadMaster > Curriculum Map > Question Bank. */
export async function bankSources(repo: Repo, schoolId: string, ids: readonly string[]): Promise<Map<string, RewriteSource>> {
  const out = new Map<string, RewriteSource>(ids.map((id) => [id, "BANK" as RewriteSource]));
  for (let i = 0; i < ids.length; i += 500) {
    const part = ids.slice(i, i + 500);
    const [nafs, rm, map] = await Promise.all([
      repo.findMany("NafsBankItem", { schoolId, questionId: { in: part } }, { select: ["questionId"] }),
      repo.findMany("ReadMasterQuestion", { questionId: { in: part } }, { select: ["questionId"] }),
      repo.findMany("QuestionMapLink", { questionId: { in: part } }, { select: ["questionId"] }),
    ]);
    for (const r of map) out.set(s(r.questionId), "MAP");
    for (const r of rm) out.set(s(r.questionId), "READMASTER");
    for (const r of nafs) out.set(s(r.questionId), "NAFS");
  }
  return out;
}

/**
 * ONE chunk of the preview (`apply` false: nothing is written) or of the apply. `cursor` null = from the start.
 * Returns the counts of this chunk and the next cursor (null = finished).
 */
export async function rewriteChunk(repo: Repo, actor: Actor, opts: { apply: boolean; cursor: RewriteCursor | null; take?: number }): Promise<RewriteChunk> {
  const schoolId = schoolOf(actor);
  const m = readManifest();
  const out: RewriteChunk = { counts: {}, examples: [], entries: [], scanned: 0, next: null, changed: 0 };
  if (!m.entries) return out;
  const take = Math.max(1, Math.min(opts.take ?? (opts.apply ? APPLY_TAKE : PREVIEW_TAKE), 500));
  const cur: RewriteCursor = opts.cursor ?? { phase: "question", after: null };
  const add = (src: RewriteSource, f: (c: SourceCounts) => void) => f(out.counts[src] ?? (out.counts[src] = zeroCounts()));
  const tally = (src: RewriteSource, id: string, stem: string, plan: QuestionPlan) => {
    out.entries.push(...plan.entries);
    add(src, (c) => { c.matched++; if (plan.changes.length) { c.toChange++; c.options += plan.changes.length; } else if (!plan.missing) c.upToDate++; if (plan.missing) c.notFound++; });
    for (const ch of plan.changes) if (out.examples.length < 10) out.examples.push({ source: src, id, stem: stem.slice(0, 300), old: ch.old, new: ch.new });
  };

  if (cur.phase === "question") {
    const sidx = await schoolSkillIndex(repo, schoolId);
    const skillIds = [...sidx.ids];
    const page = skillIds.length
      ? await repo.findMany("Question", { skillId: { in: skillIds }, deletedAt: null, ...(cur.after ? { id: { gt: cur.after } } : {}) }, { select: ["id", "stem"], orderBy: [{ field: "id", dir: "asc" }], take })
      : [];
    out.scanned = page.length;
    out.next = page.length === take ? { phase: "question", after: s(page[page.length - 1].id) } : { phase: "readrise", after: null };
    // only questions whose stem is in a manifest need their choices
    const cand = page.filter((q) => m.byStem.has(normText(q.stem)));
    if (cand.length) {
      const ids = cand.map((q) => s(q.id));
      const choiceRows = await repo.findMany("QuestionOption", { questionId: { in: ids } }, { select: ["id", "questionId", "text", "isCorrect", "order"] });
      const byQ = new Map<string, Row[]>();
      for (const o of choiceRows) (byQ.get(s(o.questionId)) ?? byQ.set(s(o.questionId), []).get(s(o.questionId))!).push(o);
      const plans = cand.map((q) => {
        const os = (byQ.get(s(q.id)) ?? []).sort((a, b) => Number(a.order) - Number(b.order));
        return { q, os, plan: planQuestion(q.stem, os.map((o) => ({ text: s(o.text), correct: o.isCorrect === true || o.isCorrect === 1 })), m.byStem) };
      }).filter((x) => x.plan);
      const src = plans.length ? await bankSources(repo, schoolId, plans.map((x) => s(x.q.id))) : new Map<string, RewriteSource>();
      const changedIds: string[] = [];
      for (const { q, os, plan } of plans) {
        tally(src.get(s(q.id)) ?? "BANK", s(q.id), s(q.stem), plan!);
        if (!opts.apply || !plan!.changes.length) continue;
        for (const ch of plan!.changes) { await repo.updateMany("QuestionOption", { id: s(os[ch.index].id) }, { text: ch.new }); out.changed++; }
        changedIds.push(s(q.id));
      }
      // 👯 the content fingerprint includes the choices: kept right for the changed questions
      if (changedIds.length) { try { await saveHashes(repo, await hashQuestions(repo, changedIds)); } catch { /* the nightly backfill fixes it */ } }
    }
    return out;
  }

  // ReadRise: the platform library's articles and the school's own
  const articleIds = await readriseArticleIds(repo, schoolId);
  const page = articleIds.length
    ? await repo.findMany("RRQuestion", { articleId: { in: articleIds }, ...(cur.after ? { id: { gt: cur.after } } : {}) }, { select: ["id", "stem", "options", "answer"], orderBy: [{ field: "id", dir: "asc" }], take })
    : [];
  out.scanned = page.length;
  out.next = page.length === take ? { phase: "readrise", after: s(page[page.length - 1].id) } : null;
  for (const q of page) {
    if (!m.byStem.has(normText(q.stem))) continue;
    const options = optArray(q.options);
    const k = "ABCD".indexOf(s(q.answer).toUpperCase());
    const plan = planQuestion(q.stem, options.map((t, i) => ({ text: t, correct: i === k })), m.byStem);
    if (!plan) continue;
    tally("READRISE", s(q.id), s(q.stem), plan);
    if (!opts.apply || !plan.changes.length) continue;
    const next = [...options];
    for (const ch of plan.changes) next[ch.index] = ch.new;
    await repo.updateMany("RRQuestion", { id: s(q.id) }, { options: next });
    out.changed += plan.changes.length;
  }
  return out;
}

// ------------------------------------------------------------------ status, apply progress, finish

export interface ApplyProgress { sig: string; cursor: RewriteCursor | null; scanned: number; changed: number; startedAt: string; byName: string }
export interface RewriteStatus {
  dir: string; present: boolean; files: string[]; entries: number; problems: string[];
  /** questions to go through: bank questions of the school + ReadRise questions */
  totals: { question: number; readrise: number };
  /** an apply that stopped before the end (with the same manifests) */
  progress: ApplyProgress | null;
}

async function readProgress(repo: Repo, schoolId: string): Promise<ApplyProgress | null> {
  const row = (await repo.findMany("SchoolSetting", { schoolId, key: PROGRESS_KEY }, { take: 1 }))[0];
  let v: unknown = row?.value;
  if (typeof v === "string") { try { v = JSON.parse(v); } catch { v = null; } }
  return v && typeof v === "object" && (v as ApplyProgress).sig !== undefined ? (v as ApplyProgress) : null;
}
async function writeProgress(repo: Repo, schoolId: string, userId: string, value: ApplyProgress | null): Promise<void> {
  const v = value ?? { sig: "", cursor: null, scanned: 0, changed: 0, startedAt: "", byName: "" };
  await repo.upsert("SchoolSetting", { schoolId, key: PROGRESS_KEY }, { schoolId, key: PROGRESS_KEY, value: v, updatedBy: userId }, { value: v, updatedBy: userId });
}

export async function rewriteStatus(repo: Repo, actor: Actor): Promise<RewriteStatus> {
  const schoolId = schoolOf(actor);
  const m = readManifest();
  const sidx = await schoolSkillIndex(repo, schoolId);
  const skillIds = [...sidx.ids];
  const articleIds = await readriseArticleIds(repo, schoolId);
  const [question, readrise, progress] = await Promise.all([
    skillIds.length ? repo.count("Question", { skillId: { in: skillIds }, deletedAt: null }) : Promise.resolve(0),
    articleIds.length ? repo.count("RRQuestion", { articleId: { in: articleIds } }) : Promise.resolve(0),
    readProgress(repo, schoolId).catch(() => null),
  ]);
  return { dir: m.dir, present: m.present, files: m.files, entries: m.entries, problems: m.problems, totals: { question, readrise }, progress: progress && progress.sig && progress.sig === m.sig && progress.cursor ? progress : null };
}

/** APPLY one chunk: from the kept place (or the start), keeps the next place; audit-logged when it starts. */
export async function applyChunk(repo: Repo, actor: Actor, opts: { restart?: boolean; byName?: string } = {}): Promise<RewriteChunk & { progress: ApplyProgress | null }> {
  const schoolId = schoolOf(actor);
  const m = readManifest();
  if (!m.entries) return { counts: {}, examples: [], entries: [], scanned: 0, next: null, changed: 0, progress: null };
  let p = opts.restart ? null : await readProgress(repo, schoolId);
  if (!p || p.sig !== m.sig || !p.cursor) {
    p = { sig: m.sig, cursor: { phase: "question", after: null }, scanned: 0, changed: 0, startedAt: new Date().toISOString(), byName: s(opts.byName) };
    await audit(repo, { actorId: actor.userId, action: "questions.options.rewrite.start", entityType: "School", entityId: schoolId, after: { files: m.files, entries: m.entries } });
  }
  const r = await rewriteChunk(repo, actor, { apply: true, cursor: p.cursor });
  const next: ApplyProgress = { ...p, cursor: r.next, scanned: p.scanned + r.scanned, changed: p.changed + r.changed };
  await writeProgress(repo, schoolId, actor.userId, r.next ? next : null);
  return { ...r, progress: r.next ? next : null };
}

/** The end of an apply (the page sends its totals): audit-logged. */
export async function finishApply(repo: Repo, actor: Actor, totals: { changed: number; matched: number; scanned: number; counts: Partial<Record<RewriteSource, SourceCounts>> }): Promise<void> {
  const schoolId = schoolOf(actor);
  const m = readManifest();
  await audit(repo, { actorId: actor.userId, action: "questions.options.rewrite", entityType: "School", entityId: schoolId, after: { files: m.files, entries: m.entries, changed: totals.changed, matched: totals.matched, scanned: totals.scanned, bySource: totals.counts } });
}
