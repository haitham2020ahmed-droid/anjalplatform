/**
 * ⭐ Round 4 clean-up (owner): before the fix, a ReadRise RE-READ (and a stretch in the SAME question band as the
 * first read — the same questions, answers already shown) also fed the skill stars (SkillEvidence READRISE). Only
 * the first try counts now (first-try.ts). This removes what such runs already fed, then recomputes the touched
 * skills' mastery from what is left (curriculum-map/remap-skills.ts recomputeSkill — the engine's own steps).
 *
 * Called by the admin "Compute skill stars again" path: skills/status-extras.ts recomputeStudents (the STARS_JOB
 * batches of 25 students and migrateSchool), BEFORE the statuses are recomputed. Chunked (500 ids per read/delete)
 * and idempotent: a second run finds nothing left to remove and changes nothing.
 */
import type { Repo, Row } from "../seeding/repo";
import { firstReadBands, isCountedTry } from "./first-try";

const s = (v: unknown) => String(v ?? "");
const CHUNK = 500;

/** Removes the READRISE skill evidence of re-reads / same-band stretches of these students. Returns rows removed. */
export async function purgeRereadEvidence(repo: Repo, studentIds: readonly string[], now = new Date()): Promise<{ removed: number; skills: number }> {
  const ids = [...new Set(studentIds.map(String))];
  let removed = 0, skills = 0;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const part = ids.slice(i, i + CHUNK);
    const ev = await repo.findMany("SkillEvidence", { studentId: { in: part }, source: "READRISE" }, { select: ["id", "studentId", "skillId", "refId"] });
    if (!ev.length) continue;
    const runIds = [...new Set(ev.map((e) => s(e.refId).split(":")[0]).filter(Boolean))];
    const runs: Row[] = [];
    for (let j = 0; j < runIds.length; j += CHUNK) runs.push(...(await repo.findMany("RRRun", { id: { in: runIds.slice(j, j + CHUNK) } }, { select: ["id", "studentId", "articleId", "band", "firstTry", "stretch"] })));
    // the first reads of the stretched articles (their band decides whether the stretch had new questions)
    const stretched = runs.filter((r) => r.stretch === true || r.stretch === 1);
    const base: Row[] = [];
    const arts = [...new Set(stretched.map((r) => s(r.articleId)))];
    for (let j = 0; j < arts.length; j += CHUNK) {
      base.push(...(await repo.findMany("RRRun", { studentId: { in: [...new Set(stretched.map((r) => s(r.studentId)))] }, articleId: { in: arts.slice(j, j + CHUNK) }, stretch: false, firstTry: true }, { select: ["studentId", "articleId", "band", "firstTry", "stretch"] })));
    }
    const bands = firstReadBands(base);
    const byId = new Map(runs.map((r) => [s(r.id), r]));
    const bad = ev.filter((e) => {
      const r = byId.get(s(e.refId).split(":")[0]);
      return !!r && !isCountedTry(r, bands.get(`${s(r.studentId)}|${s(r.articleId)}`));
    });
    if (!bad.length) continue;
    for (let j = 0; j < bad.length; j += CHUNK) removed += await repo.deleteMany("SkillEvidence", { id: { in: bad.slice(j, j + CHUNK).map((e) => e.id) } });
    // the touched skills' mastery from what is left (the engine's own steps)
    const { recomputeSkill } = await import("../curriculum-map/remap-skills");
    for (const pair of new Set(bad.map((e) => `${s(e.studentId)}|${s(e.skillId)}`))) {
      const [studentId, skillId] = pair.split("|");
      await recomputeSkill(repo, studentId, skillId, now);
      skills++;
    }
  }
  return { removed, skills };
}
