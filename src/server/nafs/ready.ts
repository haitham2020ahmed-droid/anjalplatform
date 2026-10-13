/**
 * 🇸🇦 Are the NAFS tables in the database? (The update's `npx prisma db push` may not have run on the server.)
 * Menus hide the NAFS entries and the NAFS pages say "The database needs an update" until they are. One tiny read per
 * NAFS table (the newest columns named, at most one row each), shared by every request: kept 10 minutes once ready,
 * asked again after a minute while not ready (so `db push` shows up without a restart).
 */
import type { Repo } from "../seeding/repo";
import { schemaGap, noteSchemaGap } from "../db/schema-errors";

/** Each NAFS table with the columns added last (a read naming them fails when the table or a column is missing). */
const PROBES: [string, string[]][] = [
  ["NafsSkill", ["code", "process"]],
  ["NafsSkillFamily", ["nafsCode", "familyId"]],
  ["NafsBankItem", ["id", "difficulty", "standard", "booklet", "bookletN"]],
  ["NafsTest", ["id", "mode", "marks"]],
  ["NafsTestClass", ["id", "timeLimitMin", "studentIds"]],
  ["NafsResult", ["id", "texts", "writtenScores"]],
  ["NafsPractice", ["id", "targets"]],
  ["NafsPracticeRun", ["id", "state"]],
  ["NafsPracticeAnswer", ["id", "target"]],
];

const READY_MS = 10 * 60_000;
const NOT_READY_MS = 60_000;
/** One answer per server process (the app has one database; tests that drop tables call resetNafsReady). */
const st: { last: { ok: boolean; at: number } | null; busy: Promise<boolean> | null } = { last: null, busy: null };

async function probe(repo: Repo): Promise<boolean> {
  try {
    await Promise.all(PROBES.map(([m, select]) => repo.findMany(m, {}, { select, take: 1 })));
    return true;
  } catch (e) {
    const g = schemaGap(e);
    if (!g) throw e;
    noteSchemaGap("nafs", g);
    return false;
  }
}

/** True when every NAFS table (and its newest columns) exists. Another kind of failure counts as ready (unchanged). */
export async function nafsReady(repo: Repo, now = Date.now()): Promise<boolean> {
  const last = st.last;
  if (last && now - last.at < (last.ok ? READY_MS : NOT_READY_MS) && now >= last.at) return last.ok;
  if (st.busy) return st.busy;
  const s = st;
  const p = probe(repo).catch(() => true).then((ok) => { s.last = { ok, at: Date.now() }; return ok; }).finally(() => { s.busy = null; });
  s.busy = p;
  return p;
}

/** Tests: ask the database again next time. */
export function resetNafsReady(): void { st.last = null; st.busy = null; }
