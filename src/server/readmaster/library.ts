/**
 * 📚 The ReadMaster library, Grades 4–5 (platform-provided ORIGINAL content, like the ReadRise library).
 *
 *   data/readmaster/library-g4-g5.json: one article per Curriculum Map lesson (Text Set) of Grades 4 and 5 — 36 in
 *   all — each with Below / On / Above versions and 5 multiple-choice questions per version. The texts were written
 *   for Al-Anjal from the school's own lesson summaries (lesson-details.json); only the titles match the lesson names.
 *
 *   ensureReadMasterLibrary  creates the missing articles of a school (matched by code: G4-U1-L1 → RM-G4-U1-TS1, so
 *                            the page groups them by Unit and their questions go on the Text Set of the map), one
 *                            article at a time, through the same service functions as the import (questions also go
 *                            to the Question Bank), and publishes them. Idempotent: complete articles are skipped; an
 *                            article left half-made by an interrupted run is completed.
 *   autoLoadReadMasterLibrary  the lazy first load: a school with no ReadMaster article gets the library once, in the
 *                            background, the first time /student/readmaster or /admin/readmaster opens. A school
 *                            setting (LIBRARY_KEY) records RUNNING / DONE / ERROR so it never runs twice.
 */
import type { Repo, Row } from "../seeding/repo";
import { ForbiddenError, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import type { Level } from "../curriculum-map/lexile";
import { addVersionQuestion, gradeSkills, LEVELS, saveArticle, saveVersion, setArticleStatus, shortStandard } from "./service";

export const LIBRARY_KEY = "readmaster.library.g4g5";
export const LIBRARY_LABEL = "Load the ReadMaster library (Grades 4–5)";
const s = (v: unknown) => String(v ?? "");

export interface LibraryQuestion { stem: string; options: string[]; correct: "A" | "B" | "C" | "D"; why: string; standard?: string }
export interface LibraryVersion { lexile: number; body: string; questions: LibraryQuestion[] }
export interface LibraryArticle {
  code: string; grade: number; unit: number; lesson: number; title: string; genre: string; skill: string; standard: string; topic: string;
  versions: Record<Level, LibraryVersion>;
}

/**
 * The library file, read when a load runs and RELEASED after it (Update 46, memory): read from disk and parsed for
 * this call only — nothing keeps it, so the parsed articles are garbage once the load has finished. (A bundled
 * `import()` of the JSON stays in the module cache for the life of the server.) The bundled copy is the fallback
 * where the data folder is not shipped (the Docker image).
 */
export async function libraryArticles(): Promise<LibraryArticle[]> {
  try {
    const { readFile } = await import("node:fs/promises");
    const { join } = await import("node:path");
    const raw = JSON.parse(await readFile(join(process.cwd(), "data", "readmaster", "library-g4-g5.json"), "utf8")) as { articles?: LibraryArticle[] };
    if (Array.isArray(raw.articles)) return raw.articles;
  } catch { /* not on disk here: the bundled copy */ }
  const mod = (await import("../../../data/readmaster/library-g4-g5.json")) as unknown as { default?: { articles: LibraryArticle[] }; articles?: LibraryArticle[] };
  return (mod.default?.articles ?? mod.articles ?? []) as LibraryArticle[];
}

/** G4-U1-L1 → RM-G4-U1-TS1: the ReadMaster code the page groups by Unit and the map places on its Text Set. */
export const libraryCode = (code: string): string => `RM-${s(code).toUpperCase().replace(/-L(\d+)$/, "-TS$1")}`;

export interface LibraryResult { articles: number; created: number; completed: number; skipped: number; versions: number; questions: number; published: number; errors: string[] }

/** A staff actor of the school to write as (its first active admin; else any admin of the platform). */
export async function libraryActor(repo: Repo, schoolId: string): Promise<Actor> {
  const admins = await repo.findMany("User", { schoolId, role: "SCHOOL_ADMIN" }, { select: ["id", "isActive"] });
  const u = admins.find((x) => x.isActive !== false) ?? admins[0] ?? (await repo.findMany("User", { role: "SUPER_ADMIN" }, { select: ["id"] }))[0];
  if (!u) throw new ForbiddenError("No school admin account to create the ReadMaster library with.");
  return { userId: s(u.id), role: "SCHOOL_ADMIN", schoolId };
}

/**
 * Creates the missing library articles of a school and publishes them. Memory-light: one article at a time; an
 * error in one article is recorded and the next one is tried. `only` limits the run to some codes (tests).
 */
export async function ensureReadMasterLibrary(repo: Repo, schoolId: string, opts: { actor?: Actor; only?: string[]; now?: Date } = {}): Promise<LibraryResult> {
  const actor = opts.actor ?? (await libraryActor(repo, schoolId));
  if (actor.schoolId !== schoolId) throw new ForbiddenError("Wrong school.");
  const all = await libraryArticles();
  const list = opts.only?.length ? all.filter((a) => opts.only!.includes(a.code)) : all;
  const out: LibraryResult = { articles: list.length, created: 0, completed: 0, skipped: 0, versions: 0, questions: 0, published: 0, errors: [] };
  // the full stored code of each Common Core standard (questions' own standards, e.g. L.4.4.a)
  const fullStd = new Map((await repo.findMany("Standard", {}, { select: ["code"] })).map((x) => [shortStandard(s(x.code)).toUpperCase(), s(x.code)]));
  const skillsByGrade = new Map<number, { id: string; name: string }[]>();
  for (const a of list) {
    try {
      const r = await ensureOne(repo, actor, a, fullStd, skillsByGrade, opts.now ?? new Date());
      out[r.kind]++; out.versions += r.versions; out.questions += r.questions; out.published += r.published ? 1 : 0;
    } catch (e) {
      out.errors.push(`${a.code} ${a.title}: ${(e as Error).message}`);
    }
  }
  return out;
}

async function ensureOne(repo: Repo, actor: Actor, a: LibraryArticle, fullStd: Map<string, string>, skillsByGrade: Map<number, { id: string; name: string }[]>, now: Date): Promise<{ kind: "created" | "completed" | "skipped"; versions: number; questions: number; published: boolean }> {
  const code = libraryCode(a.code);
  const existing = (await repo.findMany("ReadMasterArticle", { schoolId: actor.schoolId, code }))[0];
  let articleId: string;
  let kind: "created" | "completed";
  if (existing) {
    articleId = s(existing.id);
    if (await isComplete(repo, articleId, a)) {
      // complete but never published (a run stopped before the last step): publish it now
      if (s(existing.status) !== "PUBLISHED") { await publishLibraryArticle(repo, actor, articleId); return { kind: "skipped", versions: 0, questions: 0, published: true }; }
      return { kind: "skipped", versions: 0, questions: 0, published: false };
    }
    kind = "completed";
  } else {
    if (!skillsByGrade.has(a.grade)) skillsByGrade.set(a.grade, await gradeSkills(repo, actor.schoolId!, a.grade));
    const skill = skillsByGrade.get(a.grade)!.find((k) => k.name.toLowerCase() === a.skill.toLowerCase());
    const input = { code, title: a.title, topic: a.genre, grade: a.grade, skillId: skill?.id ?? null, skillName: a.skill, standard: a.standard };
    try { articleId = await saveArticle(repo, actor, input, now); }
    catch (e) {
      // a standard missing from this database never blocks the article: it is saved without one
      if (!(e instanceof ValidationError) || !/standard/i.test(e.message)) throw e;
      articleId = await saveArticle(repo, actor, { ...input, standard: null }, now);
    }
    kind = "created";
  }
  let versions = 0, questions = 0;
  for (const level of LEVELS) {
    const v = a.versions[level];
    if (!v) continue;
    let ver: Row | undefined = (await repo.findMany("ReadMasterVersion", { articleId, level }))[0];
    if (!ver) { await saveVersion(repo, actor, articleId, level, { lexile: v.lexile, body: v.body }); versions++; ver = (await repo.findMany("ReadMasterVersion", { articleId, level }))[0]; }
    const versionId = s(ver!.id);
    const links = await repo.findMany("ReadMasterQuestion", { versionId }, { select: ["questionId"] });
    const have = new Set(links.length ? (await repo.findMany("Question", { id: { in: links.map((l) => l.questionId) } }, { select: ["stem"] })).map((q) => stemKey(s(q.stem))) : []);
    for (const q of v.questions) {
      if (have.has(stemKey(q.stem))) continue;
      const std = q.standard ? fullStd.get(q.standard.toUpperCase()) ?? null : null;
      await addVersionQuestion(repo, actor, versionId, {
        stem: q.stem, whyCorrect: q.why, standardCode: std,
        options: q.options.map((text, i) => ({ label: "ABCD"[i], text, correct: "ABCD"[i] === q.correct, rationale: null })),
      });
      have.add(stemKey(q.stem)); questions++;
    }
  }
  await publishLibraryArticle(repo, actor, articleId);
  return { kind, versions, questions, published: true };
}

/**
 * The library is platform content the owner asked to show on ReadMaster: published through the normal path, and if
 * that path refuses (e.g. the actor found for the school may not publish), set to PUBLISHED directly.
 */
async function publishLibraryArticle(repo: Repo, actor: Actor, articleId: string): Promise<void> {
  try { await setArticleStatus(repo, actor, articleId, "PUBLISHED"); }
  catch { await repo.updateMany("ReadMasterArticle", { id: articleId }, { status: "PUBLISHED" }); }
  const left = await repo.findUnique("ReadMasterArticle", { id: articleId });
  if (left && s(left.status) !== "PUBLISHED") await repo.updateMany("ReadMasterArticle", { id: articleId }, { status: "PUBLISHED" });
}

const stemKey = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Every level of the article has its text and all its questions. */
async function isComplete(repo: Repo, articleId: string, a: LibraryArticle): Promise<boolean> {
  const vers = await repo.findMany("ReadMasterVersion", { articleId }, { select: ["id", "level"] });
  for (const level of LEVELS) {
    const want = a.versions[level]?.questions.length ?? 0;
    const v = vers.find((x) => x.level === level);
    if (!v) return false;
    if ((await repo.count("ReadMasterQuestion", { versionId: v.id })) < want) return false;
  }
  return true;
}

// ------------------------------------------------------------------ the once-per-school state

export type LibraryState = { status: "NONE" } | { status: "RUNNING"; at: string } | { status: "DONE"; at: string; result: LibraryResult } | { status: "ERROR"; at: string; error: string; result?: LibraryResult };

export async function libraryState(repo: Repo, schoolId: string): Promise<LibraryState> {
  const row = (await repo.findMany("SchoolSetting", { schoolId, key: LIBRARY_KEY }))[0];
  let v: unknown = row?.value ?? null;
  if (typeof v === "string") { try { v = JSON.parse(v); } catch { v = null; } }
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const st = s(o.status);
  if (st === "RUNNING" || st === "DONE" || st === "ERROR") return o as unknown as LibraryState;
  return { status: "NONE" };
}

async function saveState(repo: Repo, schoolId: string, value: LibraryState, by: string | null): Promise<void> {
  const row = { value: value as unknown as Record<string, unknown>, updatedBy: by, updatedAt: new Date() };
  await repo.upsert("SchoolSetting", { schoolId, key: LIBRARY_KEY }, { schoolId, key: LIBRARY_KEY, ...row }, row);
}

/** Schools whose library load was started by this process and has not finished yet. */
const startedHere = new Set<string>();

/** A run that has not finished after this long is considered dead (the process restarted): it may start again. */
const STALE_MS = 30 * 60_000;

/** Runs the loader and records the outcome (DONE, or ERROR with the first problems). */
export async function runLibraryLoad(repo: Repo, schoolId: string, opts: { actor?: Actor; only?: string[] } = {}): Promise<LibraryResult> {
  const actor = opts.actor ?? (await libraryActor(repo, schoolId));
  await saveState(repo, schoolId, { status: "RUNNING", at: new Date().toISOString() }, actor.userId);
  try {
    const result = await ensureReadMasterLibrary(repo, schoolId, { actor, only: opts.only });
    await saveState(repo, schoolId, result.errors.length
      ? { status: "ERROR", at: new Date().toISOString(), error: result.errors.slice(0, 3).join(" · "), result }
      : { status: "DONE", at: new Date().toISOString(), result }, actor.userId);
    return result;
  } catch (e) {
    await saveState(repo, schoolId, { status: "ERROR", at: new Date().toISOString(), error: (e as Error).message }, actor.userId).catch(() => undefined);
    throw e;
  }
}

/**
 * The lazy first load: a school with NO ReadMaster article and no recorded run gets the library, in the background
 * (the page is not kept waiting; it shows "being added" until the articles appear). Returns the current state.
 */
export async function autoLoadReadMasterLibrary(repo: Repo, schoolId: string | null | undefined, now = new Date()): Promise<LibraryState> {
  if (!schoolId) return { status: "NONE" };
  const state = await libraryState(repo, schoolId);
  // nothing published yet (the library never loaded, failed, or only drafts exist): load it again, at most every
  // 30 minutes (the loader is idempotent: finished articles are skipped, half-made ones completed, all published)
  const published = await repo.count("ReadMasterArticle", { schoolId, status: "PUBLISHED" });
  if (published > 0) return state;
  if (state.status === "RUNNING" && now.getTime() - new Date(state.at).getTime() < STALE_MS) return state;
  if ((state.status === "DONE" || state.status === "ERROR") && now.getTime() - new Date(state.at).getTime() < 30 * 60_000) return state;
  let actor: Actor;
  try { actor = await libraryActor(repo, schoolId); }
  catch (e) { const err: LibraryState = { status: "ERROR", at: now.toISOString(), error: (e as Error).message }; await saveState(repo, schoolId, err, null); return err; }
  const running: LibraryState = { status: "RUNNING", at: now.toISOString() };
  // once per school in this process too: two pages opened at the same moment both read "NONE" before either saved
  // RUNNING — only the first starts the load (Update 46)
  if (startedHere.has(schoolId)) return running;
  startedHere.add(schoolId);
  try { await saveState(repo, schoolId, running, actor.userId); } catch (e) { startedHere.delete(schoolId); throw e; }
  const { runAfterResponse } = await import("../lib/after-response");
  const { runHeavy } = await import("../monitoring/memory");
  runAfterResponse("readmaster.library", () => runHeavy(() => runLibraryLoad(repo, schoolId, { actor })).catch(() => undefined).finally(() => startedHere.delete(schoolId)));
  return running;
}
