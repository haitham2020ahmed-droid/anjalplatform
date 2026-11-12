/**
 * 🛡️ ReadRise round 10 — the one-time correction after the update (owner, 11 Nov 2026: "make it all automatic").
 * Runs once per school through the startup job runner (jobs/startup.ts → READRISE_ROUND10_JOB). Nothing is deleted.
 *
 *  1. MAP Lexiles that cannot belong to their Reading RIT (e.g. 1725L for a Grade 5 reader) are cleared
 *     (engine.ts lexileFitsRit) — the RIT stays.
 *  2. Every placed student (source PLACEMENT) is kept within MAP_BAND of a MAP Lexile from the last 6 months
 *     (engine.ts alignReadRiseToMap: a "MAP check", which starts the probation of the next first tries).
 *  3. No recent MAP: a level that came straight from a placement (the last change is the placement) and is above the
 *     grade cap (the grade's "Meets" top + 150) is brought down to it ("Placement check") — the probation and the
 *     articles then move the reader to the right level. A level earned by articles is left alone.
 *  4. A student whose placement ended at the OLD ceiling (1400, finished before the scale went to 1600 on
 *     21 Oct 2026) gets a new placement test (an admin-type reset: it never uses up the teacher's retake).
 */
import type { Repo } from "../seeding/repo";
import { RETAKE_REASON, alignReadRiseToMap, clampEngine, lexileFitsRit, recentMapLexile, recordLevelChange, s, toDate } from "./engine";
import { gradeCapAchieve } from "./placement";
import { ADMIN_RESET_TAG } from "./placement-reset";
import type { JobDef } from "../jobs/runner";

/** Placements finished before this date could not go above 1400 (the old top of the scale). */
export const SCALE_1600_DATE = new Date("2026-10-21T12:00:00+03:00");
export const ROUND10_RETAKE_WHY = "the test ended at the old top of the scale (1400) before the scale went to 1600";

export interface Round10Report { lexilesCleared: number; mapChecked: number; capped: number; retakes: number; students: number }

async function gradeOf(repo: Repo, studentId: string): Promise<number | null> {
  const st = await repo.findUnique("Student", { id: studentId });
  const g = st?.gradeId ? await repo.findUnique("Grade", { id: s(st.gradeId) }) : null;
  const n = g ? Number(g.level) : NaN;
  return Number.isFinite(n) && n >= 1 && n <= 12 ? n : null;
}

/** The correction for ONE school (idempotent: a second run changes nothing). */
export async function round10School(repo: Repo, schoolId: string, now = new Date()): Promise<Round10Report> {
  const rep: Round10Report = { lexilesCleared: 0, mapChecked: 0, capped: 0, retakes: 0, students: 0 };
  const rrs = await repo.findMany("RRStudent", { schoolId }, { select: ["studentId", "level", "source", "schoolId"] });
  const ids = rrs.map((r) => s(r.studentId));
  // 1. impossible Lexiles (this school's students with a ReadRise row; the import checks every new file)
  for (let i = 0; i < ids.length; i += 200) {
    const rows = await repo.findMany("MapResult", { studentId: { in: ids.slice(i, i + 200) }, lexile: { not: null }, goalName: null }, { select: ["id", "lexile", "rit", "subject"] });
    const bad = rows.filter((m) => /read/i.test(s(m.subject)) && !lexileFitsRit(Number(m.lexile), m.rit === null || m.rit === undefined ? null : Number(m.rit)));
    if (bad.length) { await repo.updateMany("MapResult", { id: { in: bad.map((m) => s(m.id)) } }, { lexile: null }); rep.lexilesCleared += bad.length; }
  }
  for (const rr of rrs) {
    if (s(rr.source) !== "PLACEMENT") continue;
    const studentId = s(rr.studentId);
    rep.students++;
    // 2. MAP check
    if ((await alignReadRiseToMap(repo, studentId, now)) !== null) { rep.mapChecked++; continue; }
    const changes = (await repo.findMany("RRLevelChange", { studentId }, { select: ["reason", "createdAt"] })).sort((a, b) => toDate(a.createdAt).getTime() - toDate(b.createdAt).getTime());
    const last = changes.filter((c) => !s(c.reason).startsWith(RETAKE_REASON)).pop();
    const level = Number(rr.level);
    // 3. no recent MAP: a placement-only level above the grade cap
    if ((await recentMapLexile(repo, studentId, now)) === null && last && s(last.reason).startsWith("Placement")) {
      const cap = gradeCapAchieve(await gradeOf(repo, studentId));
      if (cap !== null && level > cap) {
        const to = clampEngine(cap);
        if (await repo.updateMany("RRStudent", { studentId, level: rr.level }, { level: to })) {
          await recordLevelChange(repo, { studentId, schoolId: s(rr.schoolId), from: level, to, reason: `Placement check: no MAP Lexile, so the placement result (${level}) was brought down to the grade's first-level limit (${to}); strong articles move it up`, now });
          rep.capped++;
          continue;
        }
      }
    }
    // 4. the old 1400 ceiling
    if (level === 1400) {
      const pls = (await repo.findMany("RRPlacement", { studentId, completedAt: { not: null }, result: { not: null } }, { select: ["completedAt", "result"] })).sort((a, b) => toDate(b.completedAt).getTime() - toDate(a.completedAt).getTime());
      const open = await repo.count("RRPlacement", { studentId, completedAt: null });
      const already = changes.some((c) => s(c.reason).includes(ROUND10_RETAKE_WHY));
      if (!open && !already && pls[0] && Number(pls[0].result) >= 1400 && toDate(pls[0].completedAt).getTime() < SCALE_1600_DATE.getTime()) {
        await recordLevelChange(repo, { studentId, schoolId: s(rr.schoolId), from: level, to: level, reason: `${RETAKE_REASON} ${ADMIN_RESET_TAG}: ${ROUND10_RETAKE_WHY}`, now });
        rep.retakes++;
      }
    }
  }
  return rep;
}

/** The startup job (one batch per school: a school has at most a few hundred ReadRise students). */
export const READRISE_ROUND10_JOB: JobDef<string> = {
  name: "readrise-round10",
  version: "r10",
  async step(repo, schoolId, _cursor, _state, now) {
    const r = await round10School(repo, schoolId, now);
    return { cursor: null, done: true, progress: { ...r } };
  },
};
