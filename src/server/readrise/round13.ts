/**
 * 🧹 ReadRise round 13 — the one-time level check after the question rewrite (owner, 12 Nov 2026: "can we fix the
 * students whose levels went too high, automatically?"). Rounds 11–12 rewrote the article answer choices: before
 * them the correct option was often the longest one, or the wrong ones said "always / never / only", so a reader
 * could guess right and climb by ARTICLES. Round 10 only checked levels that came from a placement; this checks
 * every placed reader once. Nothing is deleted; a teacher can still set any level by hand.
 *
 *  1. LIBRARY_SYNC_JOB (platform-wide, first): the corrected article files are copied into the library — the same
 *     work as the admin "Update articles" button (seed.ts syncLibraryChunk), in chunks, resumable.
 *  2. READRISE_ROUND13_JOB (per school, after it): for every placed reader —
 *     · level above the limit → brought down to it: a MAP Reading Lexile from the last 6 months + MAP_BAND (150),
 *       or, with no recent MAP, the grade cap (the grade's "Meets" top + 150);
 *     · otherwise the level stays and only a "Level check" note is written.
 *     Both are a "Level check" change: the old window (scores on the old, guessable questions) starts again and the
 *     next PROBATION_READS (3) articles confirm the level — one score under 50% → down 100, 25% or lower → down 200
 *     (engine.ts levelDecision); strong articles move it up as usual.
 */
import type { Repo } from "../seeding/repo";
import { LEVEL_CHECK_PREFIX, MAP_BAND, RETAKE_REASON, clampEngine, recentMapLexile, recordLevelChange, s, toDate } from "./engine";
import { gradeCapAchieve } from "./placement";
import { LIBRARY_SYNC_CHUNK, syncLibraryChunk } from "./seed";
import { JobPaused, jobState, type JobDef } from "../jobs/runner";

export const ROUND13_TAG = "the article questions were rewritten (Nov 2026)";

export interface Round13Report { students: number; lowered: number; checked: number; skipped: number }

async function gradeOf(repo: Repo, studentId: string): Promise<number | null> {
  const st = await repo.findUnique("Student", { id: studentId });
  const g = st?.gradeId ? await repo.findUnique("Grade", { id: s(st.gradeId) }) : null;
  const n = g ? Number(g.level) : NaN;
  return Number.isFinite(n) && n >= 1 && n <= 12 ? n : null;
}

/** The highest level the reader may keep after the rewrite (null = nothing to compare with). Pure. */
export function round13Limit(mapLexile: number | null, grade: number | null): { limit: number; why: string } | null {
  if (mapLexile !== null) return { limit: clampEngine(mapLexile + MAP_BAND), why: `the MAP Reading Lexile is ${mapLexile}, so the level may be at most ${MAP_BAND} above it` };
  const cap = gradeCapAchieve(grade);
  return cap === null ? null : { limit: clampEngine(cap), why: `there is no recent MAP Lexile, so the level may be at most the grade's limit` };
}

/** The check for ONE school (idempotent: a reader already checked is skipped). */
export async function round13School(repo: Repo, schoolId: string, now = new Date()): Promise<Round13Report> {
  const rep: Round13Report = { students: 0, lowered: 0, checked: 0, skipped: 0 };
  const rrs = await repo.findMany("RRStudent", { schoolId }, { select: ["studentId", "level", "schoolId"] });
  for (const rr of rrs) {
    const studentId = s(rr.studentId);
    const changes = (await repo.findMany("RRLevelChange", { studentId }, { select: ["reason", "createdAt"] }))
      .filter((c) => !s(c.reason).startsWith(RETAKE_REASON))
      .sort((a, b) => toDate(a.createdAt).getTime() - toDate(b.createdAt).getTime());
    // not placed yet (the placement sets the level) or already checked
    if (!changes.length || rr.level === null || rr.level === undefined) { rep.skipped++; continue; }
    if (changes.some((c) => s(c.reason).includes(ROUND13_TAG))) { rep.skipped++; continue; }
    rep.students++;
    const level = Number(rr.level);
    const lim = round13Limit(await recentMapLexile(repo, studentId, now), await gradeOf(repo, studentId));
    if (lim && level > lim.limit) {
      if (await repo.updateMany("RRStudent", { studentId, level: rr.level }, { level: lim.limit })) {
        await recordLevelChange(repo, { studentId, schoolId: s(rr.schoolId), from: level, to: lim.limit, reason: `${LEVEL_CHECK_PREFIX}: ${ROUND13_TAG} and ${lim.why} (${lim.limit}); the next articles confirm it and strong ones move it up`, now });
        rep.lowered++;
        continue;
      }
    }
    await recordLevelChange(repo, { studentId, schoolId: s(rr.schoolId), from: level, to: level, reason: `${LEVEL_CHECK_PREFIX}: ${ROUND13_TAG}, so the next articles confirm the level (no change now)`, now });
    rep.checked++;
  }
  return rep;
}

/** 📚 Platform-wide (the library has no school): its checkpoint is kept on the first school. */
export const LIBRARY_SYNC_JOB: JobDef<number> = {
  name: "readrise-library-sync",
  version: "r13",
  async schools(repo) { return (await repo.findMany("School", {}, { select: ["id"], orderBy: [{ field: "id", dir: "asc" }], take: 1 })).map((x) => String(x.id)); },
  async step(repo, _schoolId, cursor) {
    const r = await syncLibraryChunk(repo, process.cwd(), cursor ?? 0, LIBRARY_SYNC_CHUNK);
    return { cursor: r.next, done: r.next === null, progress: { scanned: r.scanned, articles: r.articles, added: r.added, problems: r.problems.length } };
  },
};

/** Has the library sync finished? (the level check waits for it: the next articles must use the new questions) */
export async function librarySynced(repo: Repo): Promise<boolean> {
  const ids = await LIBRARY_SYNC_JOB.schools!(repo);
  if (!ids.length) return true;
  const st = await jobState(repo, LIBRARY_SYNC_JOB, ids[0]);
  return !!st && st.version === LIBRARY_SYNC_JOB.version && st.done && !st.error;
}

/** 🧹 The per-school level check (one batch per school: a school has at most a few hundred ReadRise students). */
export const READRISE_ROUND13_JOB: JobDef<string> = {
  name: "readrise-round13",
  version: "r13",
  async step(repo, schoolId, _cursor, _state, now) {
    // not before the new questions are in the library: paused, tried again later (startup.ts retries every 15 min)
    if (!(await librarySynced(repo))) throw new JobPaused("waiting for the ReadRise library sync");
    const r = await round13School(repo, schoolId, now);
    return { cursor: null, done: true, progress: { ...r } };
  },
};
