/**
 * 📥 Learn lessons into a school (like the NAFS booklets): each valid lesson file becomes ONE LearnLesson row of the
 * school (its metadata for lists, and the admin's Hide). Loading again adds nothing (idempotent by code); a changed
 * file updates its row; an invalid file is skipped and reported (file + problems). The lesson text itself is never
 * copied into the database: pages read it from the files (src/server/learn/files.ts).
 *
 * Runs from Admin → Load new questions (pack "Learn lessons") and in the background the first time a Learn page opens
 * after the lesson files changed (ensureLearnLessons — never blocks the page).
 */
import type { Repo } from "../seeding/repo";
import { lessonSignature, readLessons } from "./files";

const s = (v: unknown) => String(v ?? "");
export const LEARN_SETTING = "learn.lessons";
/** lessons registered per chunk of the "Learn lessons" pack */
export const LEARN_PER_CHUNK = 60;

export interface LearnLoad { lessons: number; added: number; updated: number; skipped: number; invalid: { file: string; problems: string[] }[] }

/** Registers (or updates) the given lesson codes for one school; the others are left alone. */
export async function loadLessonsInto(repo: Repo, schoolId: string, codes: string[] | null, now = new Date()): Promise<{ added: number; updated: number; skipped: number }> {
  const r = readLessons();
  const list = [...r.valid.values()].filter((l) => !codes || codes.includes(l.code));
  if (!list.length) return { added: 0, updated: 0, skipped: 0 };
  const have = new Map((await repo.findMany("LearnLesson", { schoolId, code: { in: list.map((l) => l.code) } }, { select: ["id", "code", "fileHash"] })).map((x) => [s(x.code), x]));
  const meta = (l: (typeof list)[number]) => ({ title: l.title.slice(0, 191), subject: l.subject, goalArea: l.goalArea, subtopic: l.subtopic.slice(0, 191) || null, standards: l.standards, families: l.families, skillNames: l.skillNames, fileHash: l.hash });
  const fresh = list.filter((l) => !have.has(l.code));
  if (fresh.length) await repo.createMany("LearnLesson", fresh.map((l) => ({ schoolId, code: l.code, ...meta(l), hidden: false, loadedAt: now, updatedAt: now })));
  let updated = 0, skipped = 0;
  for (const l of list) {
    const row = have.get(l.code);
    if (!row) continue;
    if (s(row.fileHash) === l.hash) { skipped++; continue; }
    await repo.updateMany("LearnLesson", { id: row.id }, { ...meta(l), updatedAt: now });
    updated++;
  }
  return { added: fresh.length, updated, skipped };
}

/** Loads every valid lesson file (invalid files skipped and reported) and notes the folder's signature. */
export async function loadLearnLessons(repo: Repo, schoolId: string, byUserId: string | null, now = new Date()): Promise<LearnLoad> {
  const r = readLessons();
  const done = await loadLessonsInto(repo, schoolId, null, now);
  const value = { sig: r.sig, at: now.toISOString(), ...done, invalid: r.invalid };
  await repo.upsert("SchoolSetting", { schoolId, key: LEARN_SETTING }, { schoolId, key: LEARN_SETTING, value, updatedBy: byUserId }, { value, updatedBy: byUserId });
  return { lessons: r.valid.size, ...done, invalid: r.invalid };
}

/** How many valid lesson files there are and how many the school has registered. */
export async function learnCount(repo: Repo, schoolId: string): Promise<{ lessons: number; inBank: number; files: number; invalid: number }> {
  const r = readLessons();
  const codes = [...r.valid.keys()];
  const inBank = codes.length ? await repo.count("LearnLesson", { schoolId, code: { in: codes } }) : 0;
  return { lessons: codes.length, inBank, files: r.files.length, invalid: r.invalid.length };
}

const running = new Map<string, Promise<LearnLoad | null>>();
/** schoolId → the folder signature already checked by this process (no database read while nothing changed) */
const checked = new Map<string, string>();
/** Tests: forget what was checked. */
export function resetLearnEnsure(): void { checked.clear(); running.clear(); }

/**
 * When a Learn page opens: if the lesson files changed since this school's last load, register them IN THE
 * BACKGROUND (the caller does not wait; one run per school at a time; errors — e.g. the tables not created yet — are
 * logged, never shown).
 */
export function ensureLearnLessons(repo: Repo, schoolId: string | null | undefined): Promise<LearnLoad | null> {
  if (!schoolId) return Promise.resolve(null);
  const sig = lessonSignature();
  if (!sig || checked.get(schoolId) === sig) return Promise.resolve(null);
  const busy = running.get(schoolId);
  if (busy) return busy;
  const p = (async () => {
    const row = (await repo.findMany("SchoolSetting", { schoolId, key: LEARN_SETTING }, { select: ["value"], take: 1 }))[0];
    let v: unknown = row?.value; if (typeof v === "string") { try { v = JSON.parse(v); } catch { v = null; } }
    const r = (v as { sig?: string } | null)?.sig === sig ? null : await loadLearnLessons(repo, schoolId, null);
    checked.set(schoolId, sig);
    return r;
  })().catch((e) => { console.error("learn lessons", e); return null; }).finally(() => running.delete(schoolId));
  running.set(schoolId, p);
  return p;
}
