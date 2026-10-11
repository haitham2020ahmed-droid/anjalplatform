/**
 * 📖 "My report" inside each reading program (ReadMaster, Fluency Coach; ReadRise uses its own summary): the
 * student's OWN numbers only (the page passes actor.studentId), in plain words — no Below / On / Above about the
 * student. Bounded reads (the newest rows only). Read only.
 */
import type { Repo, Row } from "../seeding/repo";

const s = (v: unknown) => String(v ?? "");
const time = (v: unknown) => (v instanceof Date ? v.getTime() : v ? new Date(s(v)).getTime() : 0);
const day = (v: unknown) => new Date(time(v)).toISOString().slice(0, 10);
/** newest rows read for a report (keeps memory small) */
export const REPORT_ROWS = 200;

export interface ReadMasterMyReport {
  articles: number; avgPct: number | null; lexileStart: number | null; lexileNow: number | null; growth: number | null;
  recent: { articleId: string; title: string; pct: number; date: string; practice: boolean }[];
}

/** ReadMaster: articles read, average score, my Lexile from my first counted read to now, my last reads. */
export async function readMasterMyReport(repo: Repo, studentId: string): Promise<ReadMasterMyReport> {
  const rows: Row[] = await repo.findMany("ReadMasterAttempt", { studentId }, { select: ["articleId", "correct", "total", "lexileBefore", "lexileAfter", "practice", "createdAt"], orderBy: [{ field: "createdAt", dir: "desc" }], take: REPORT_ROWS });
  const counted = rows.filter((r) => !r.practice);
  const pct = (r: Row) => (Number(r.total) ? Math.round((100 * Number(r.correct)) / Number(r.total)) : 0);
  const recentRows = rows.slice(0, 5);
  const arts = recentRows.length ? await repo.findMany("ReadMasterArticle", { id: { in: [...new Set(recentRows.map((r) => s(r.articleId)))] } }, { select: ["id", "title"] }) : [];
  const oldest = counted[counted.length - 1], newest = counted[0];
  const lexileStart = oldest ? Number(oldest.lexileBefore) : null, lexileNow = newest ? Number(newest.lexileAfter) : null;
  return {
    articles: new Set(rows.map((r) => s(r.articleId))).size,
    avgPct: counted.length ? Math.round(counted.reduce((n, r) => n + pct(r), 0) / counted.length) : null,
    lexileStart, lexileNow, growth: lexileStart !== null && lexileNow !== null ? lexileNow - lexileStart : null,
    recent: recentRows.map((r) => ({ articleId: s(r.articleId), title: s(arts.find((a) => a.id === r.articleId)?.title) || "ReadMaster", pct: pct(r), date: day(r.createdAt), practice: Boolean(r.practice) })),
  };
}

export interface FluencyMyReport { checks: { wcpm: number; accuracy: number; date: string }[]; latest: number | null; first: number | null; growth: number | null; goal: number | null; readings14: number }

/** Fluency Coach: my 1-minute checks (words correct per minute) over time, my goal, my readings in 2 weeks. */
export async function fluencyMyReport(repo: Repo, studentId: string, now = new Date()): Promise<FluencyMyReport> {
  const rows: Row[] = await repo.findMany("FluencyPractice", { studentId }, { select: ["mode", "wcpm", "accuracy", "plan", "createdAt"], orderBy: [{ field: "createdAt", dir: "desc" }], take: REPORT_ROWS });
  const checks = rows.filter((r) => s(r.mode) === "MINUTE").slice(0, 8).reverse().map((r) => ({ wcpm: Number(r.wcpm), accuracy: Number(r.accuracy), date: day(r.createdAt) }));
  let goal: number | null = null;
  for (const r of rows) {
    try { const p = typeof r.plan === "string" ? JSON.parse(r.plan) : r.plan; if (p && Number.isFinite(Number(p.goal)) && Number(p.goal) > 0) { goal = Number(p.goal); break; } } catch { /* not a plan */ }
  }
  const first = checks[0]?.wcpm ?? null, latest = checks[checks.length - 1]?.wcpm ?? null;
  return { checks, latest, first, growth: first !== null && latest !== null && checks.length > 1 ? latest - first : null, goal, readings14: rows.filter((r) => time(r.createdAt) >= now.getTime() - 14 * 86_400_000).length };
}
