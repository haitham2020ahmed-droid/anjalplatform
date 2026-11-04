/**
 * 🗺️ r79: renders every MAP page / tab on the MAP fixture (tests/helpers/map-school.ts) and counts its database calls
 * and rows — first visit (empty caches) and the next visit some minutes later. Used by tests/r79-map-speed.test.ts
 * (and `npx tsx tests/helpers/map-measure.ts` prints the table). In-memory SQLite only.
 */
import { inRequest, isRedirect, renderPage } from "./page-render";
import { join } from "node:path";
import { freshStats } from "../../scripts/perf/measuring-repo";
import { clearCaches } from "../../src/server/cache/idle";
import { ROOT } from "./db";
import type { MapSchool } from "./map-school";

export interface Measured { calls: number; rows: number; outcome: string; detail?: string; byModel: string; to?: string }
export interface View { name: string; file: string; path: string; params?: Record<string, string>; sp?: Record<string, string>; admin?: boolean }

export const settle = () => new Promise((r) => setTimeout(r, 30));

/** Runs fn as if `ms` had passed (the caches' clocks read Date.now). */
export async function later<T>(ms: number, fn: () => Promise<T>): Promise<T> {
  const real = Date.now;
  Date.now = () => real() + ms;
  try { return await fn(); } finally { Date.now = real; }
}

const top = (m: MapSchool["b"]["S"]["m"]) => [...m.stats.byModel].sort((a, b) => b[1].rows - a[1].rows).slice(0, 8).map(([k, v]) => `${k} ${v.calls}/${v.rows}`).join(", ");

export async function renderView(M: MapSchool, v: View): Promise<Measured> {
  await settle();
  const m = M.b.S.m;
  m.stats = freshStats();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const r = await renderPage(() => require(join(ROOT, v.file)) as Record<string, unknown>, { path: v.path, cookies: v.admin ? M.adminCookie : M.cookie, params: v.params, searchParams: v.sp });
  const out: Measured = { calls: m.stats.calls, rows: m.stats.rows, outcome: r.outcome, detail: r.detail, byModel: top(m) };
  for (const f of r.after) await Promise.resolve(f()).catch(() => null);
  return out;
}

/** A Server Action as one request (the teacher's cookies): its redirect target, or what it returned / threw. */
export async function runAction(M: MapSchool, file: string, name: string, args: unknown[], admin = false): Promise<Measured & { value?: unknown; error?: unknown }> {
  await settle();
  const m = M.b.S.m;
  m.stats = freshStats();
  let to: string | undefined, error: unknown = null, value: unknown;
  await inRequest({ path: "/teacher/map-center", cookies: admin ? M.adminCookie : M.cookie }, async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require(join(ROOT, file)) as Record<string, (...a: unknown[]) => Promise<unknown>>;
    try { value = await mod[name](...args); } catch (e) { if (isRedirect(e)) to = e.to; else error = e; }
  });
  return { calls: m.stats.calls, rows: m.stats.rows, outcome: error ? "error" : to ? "redirect" : "ok", detail: error ? String((error as Error)?.message ?? error) : undefined, byModel: top(m), to, value, error };
}

const C = "src/app/teacher/map-center/page.tsx";
export function views(M: MapSchool): View[] {
  const c0 = M.classIds[0], st = M.studentIds[0];
  const center = (name: string, sp: Record<string, string>, admin = false): View => ({ name, file: C, path: "/teacher/map-center", sp, admin });
  return [
    center("results", { tab: "results" }),
    center("results (class 2)", { tab: "results", classId: M.classIds[1] }),
    center("results LANGUAGE", { tab: "results", classId: c0, subject: "LANGUAGE" }),
    center("test", { tab: "test", classId: c0 }),
    center("year", { tab: "year", classId: c0 }),
    center("year preview", { tab: "year", classId: c0, preview: "1" }),
    center("reports", { tab: "reports", classId: c0 }),
    center("reports overview", { tab: "reports", view: "overview", classId: c0 }),
    center("plan (individual)", { tab: "plan", classId: c0 }),
    center("plan group: class", { tab: "plan", mode: "group", classId: c0, who: "class" }),
    center("admin results", { tab: "results", classId: c0 }, true),
    center("admin overview", { tab: "reports", view: "overview", classId: c0 }, true),
    { name: "test page (auto)", file: "src/app/teacher/map-center/test/[id]/page.tsx", path: `/teacher/map-center/test/${M.autoTest}`, params: { id: M.autoTest } },
    { name: "test page (manual)", file: "src/app/teacher/map-center/test/[id]/page.tsx", path: `/teacher/map-center/test/${M.manualTest}`, params: { id: M.manualTest } },
    { name: "map-entry", file: "src/app/teacher/map-entry/page.tsx", path: "/teacher/map-entry", sp: { classId: c0 } },
    { name: "map-rit", file: "src/app/teacher/map-rit/page.tsx", path: "/teacher/map-rit", sp: { classId: c0 } },
    { name: "map-plans (redirect)", file: "src/app/teacher/map-plans/page.tsx", path: "/teacher/map-plans", sp: { classId: c0 } },
    { name: "map-reports (redirect)", file: "src/app/teacher/map-reports/page.tsx", path: "/teacher/map-reports", sp: { classId: c0 } },
    { name: "map-test (redirect)", file: "src/app/teacher/map-test/page.tsx", path: "/teacher/map-test", sp: {} },
    { name: "report: profile", file: "src/app/map-report/profile/[studentId]/page.tsx", path: `/map-report/profile/${st}`, params: { studentId: st } },
    { name: "report: study plan", file: "src/app/map-report/study-plan/[studentId]/page.tsx", path: `/map-report/study-plan/${st}`, params: { studentId: st }, sp: { subject: "READING" } },
    { name: "report: family", file: "src/app/map-report/family/[studentId]/page.tsx", path: `/map-report/family/${st}`, params: { studentId: st } },
    { name: "report: class profile", file: "src/app/map-report/class/[classId]/profile/page.tsx", path: `/map-report/class/${c0}/profile`, params: { classId: c0 } },
    { name: "report: class groups", file: "src/app/map-report/class/[classId]/groups/page.tsx", path: `/map-report/class/${c0}/groups`, params: { classId: c0 } },
  ];
}

export async function measureAll(M: MapSchool, opts: { laterMs?: number } = {}): Promise<{ v: View; cold: Measured; warm: Measured }[]> {
  const out: { v: View; cold: Measured; warm: Measured }[] = [];
  for (const v of views(M)) {
    clearCaches();
    const cold = await renderView(M, v);
    const warm = await later(opts.laterMs ?? 4 * 60_000, () => renderView(M, v));
    out.push({ v, cold, warm });
  }
  return out;
}

export function table(rows: { v: View; cold: Measured; warm: Measured }[]): string {
  const w = Math.max(...rows.map((r) => r.v.name.length));
  return rows.map(({ v, cold, warm }) => `${v.name.padEnd(w)}  first ${String(cold.calls).padStart(4)} calls ${String(cold.rows).padStart(6)} rows · later ${String(warm.calls).padStart(4)} calls ${String(warm.rows).padStart(6)} rows  ${cold.outcome}${cold.detail ? " " + cold.detail.slice(0, 100) : ""}   [${warm.byModel}]`).join("\n");
}

/** Debug: every database call of one view (model, rows, where it came from). */
async function trace(M: MapSchool, name: string, warm: boolean): Promise<void> {
  const v = views(M).find((x) => x.name === name)!;
  Error.stackTraceLimit = 80;
  clearCaches();
  if (warm) await renderView(M, v);
  const m = M.b.S.m as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>;
  const orig: Record<string, (...a: unknown[]) => Promise<unknown>> = {};
  for (const k of ["findMany", "findUnique", "count", "groupCount"]) {
    orig[k] = m[k];
    m[k] = async (...a: unknown[]) => {
      const where = (new Error().stack ?? "").split("\n").filter((l) => l.includes("/src/") && !l.includes("seeding/repo") && !l.includes("server/db/")).slice(0, 3).map((l) => l.replace(/.*\/src\//, "").replace(/\)$/, "")).join(" < ");
      const r = await orig[k].apply(M.b.S.m, a);
      console.log(`${k} ${String(a[0])} ${Array.isArray(r) ? r.length : r ? 1 : 0}  ${where}`);
      return r;
    };
  }
  try { await later(4 * 60_000, () => renderView(M, v)); } finally { Object.assign(m, orig); }
}

if (require.main === module) {
  void (async () => {
    const { mapSchool } = await import("./map-school");
    const t0 = Date.now();
    const M = await mapSchool();
    console.log(`fixture ${Date.now() - t0} ms`);
    if (process.env.TRACE) { await trace(M, process.env.TRACE, process.env.WARM === "1"); process.exit(0); }
    console.log(table(await measureAll(M)));
    process.exit(0);
  })();
}
