/**
 * ⚡ Every page route on the speed-test school: server time and database calls of a navigation to it (first visit and
 * the next visit), rendered for real by tests/helpers/page-render.ts. Used by tests/perf-budgets.test.ts and by
 * `npx tsx scripts/perf/measure-routes.ts` (the before/after table). Test data only (in-memory SQLite).
 */
import { renderPage, renderTree, useDatabase, React } from "./page-render";
import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { performance } from "node:perf_hooks";
import { freshStats } from "../../scripts/perf/measuring-repo";
import { speedSchool, type SpeedSchool } from "./speed-school";
import { ROOT } from "./db";
import { createSession } from "../../src/server/auth/sessions";
import { DEFAULT_AUTH } from "../../src/server/auth/config";
import { holdAfterResponse } from "../../src/server/lib/after-response";

export interface RouteRow { route: string; file: string; role: string; coldMs: number; coldCalls: number; warmMs: number; warmCalls: number; clientKB: number; outcome: string; detail?: string }

export function pageFiles(): string[] {
  const out: string[] = [];
  const visit = (d: string) => {
    for (const n of readdirSync(d)) {
      const p = join(d, n);
      if (statSync(p).isDirectory()) visit(p);
      else if (n === "page.tsx") out.push(relative(ROOT, p));
    }
  };
  visit(join(ROOT, "src/app"));
  return out.sort();
}

export const routeOf = (file: string) => "/" + file.replace(/^src\/app\/?/, "").replace(/\/?page\.tsx$/, "").replace(/\([^)]+\)\/?/g, "");

const STUDENT_PREFIX = ["/student", "/practice", "/quiz", "/game", "/games", "/play", "/skill", "/explain", "/learn"];
const roleOf = (route: string) =>
  route.startsWith("/admin") ? "admin" : route.startsWith("/parent") ? "parent"
  : STUDENT_PREFIX.some((p) => route === p || route.startsWith(p + "/")) ? "student" : "teacher";

export interface Bench { S: SpeedSchool; cookies: Record<string, Record<string, string>>; params: Record<string, string> }

/** The speed-test school with a signed-in session per role and sample values for the dynamic segments. */
export async function bench(opts: { bigBank?: number } = {}): Promise<Bench> {
  const S = await speedSchool({ bigBank: opts.bigBank });
  useDatabase(S.m);
  const cookies: Record<string, Record<string, string>> = {};
  const parentUser = (await S.repo.findMany("User", { role: "PARENT" }, { take: 1 }))[0];
  const users: Record<string, Record<string, unknown>> = {
    admin: (await S.repo.findUnique("User", { id: S.admin.userId }))!,
    teacher: (await S.repo.findUnique("User", { id: S.teacher.userId }))!,
    student: (await S.repo.findUnique("User", { id: S.student.userId }))!,
    parent: parentUser,
  };
  for (const [role, u] of Object.entries(users)) {
    const { token } = await createSession(S.repo, u, { ...DEFAULT_AUTH, sessionTtlMinutes: 24 * 60, idleMinutes: 24 * 60 });
    cookies[role] = { ela_session: token };
  }
  const skill = (await S.repo.findMany("Question", { status: "PUBLISHED" }, { select: ["skillId"], take: 1 }))[0];
  const params: Record<string, string> = { classId: S.classId, studentId: String(S.student.studentId), skillId: String(skill?.skillId ?? ""), userId: S.student.userId };
  return { S, cookies, params };
}

/** One route, first visit then next visit (after-response work runs between them, never inside the timing). */
export async function measureRoute(b: Bench, file: string, extra: { role?: string; searchParams?: Record<string, string> } = {}): Promise<RouteRow | null> {
  const route = routeOf(file);
  const names = [...route.matchAll(/\[([^\]]+)\]/g)].map((m) => m[1]);
  if (names.some((n) => !b.params[n])) return null;
  const params = Object.fromEntries(names.map((n) => [n, b.params[n]]));
  const path = route.replace(/\[([^\]]+)\]/g, (_m, n: string) => b.params[n]);
  const role = extra.role ?? roleOf(route);
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const load = () => require(join(ROOT, file)) as Record<string, unknown>;
  const once = async () => {
    b.S.m.stats = freshStats();
    const release = holdAfterResponse();
    const r = await renderPage(load, { path, cookies: b.cookies[role], params, searchParams: extra.searchParams });
    const calls = b.S.m.stats.calls;
    for (const f of r.after) await Promise.resolve(f()).catch(() => null);
    await release();
    return { ...r, calls };
  };
  load(); // module load is a one-time cost of the process, not of a navigation
  const c = await once();
  const w = await once();
  return { route, file, role, coldMs: Math.round(c.ms), coldCalls: c.calls, warmMs: Math.round(w.ms), warmCalls: w.calls, clientKB: Math.round(w.stats.clientBytes / 102.4) / 10, outcome: w.outcome, detail: w.detail };
}

/**
 * The frame around a page for one role. `page` = what each navigation adds (AppShell inside the page);
 * `layout` = the section layout's frame (SectionFrame), drawn when the section is entered, not on each navigation
 * (absent before the frame moved into the layouts).
 */
export async function measureFrame(b: Bench, role: string, path: string, part: "page" | "layout" = "page"): Promise<{ ms: number; calls: number; clientKB: number }> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const shell = require(join(ROOT, "src/components/app-shell")) as Record<string, ((p: unknown) => unknown) | undefined>;
  const C = part === "layout" ? shell.SectionFrame : shell.AppShell;
  if (!C) return { ms: 0, calls: 0, clientKB: 0 };
  b.S.m.stats = freshStats();
  const t = performance.now();
  const r = await renderTree((React.createElement as (...a: unknown[]) => unknown)(C as never, { name: "Demo", children: null } as never), { path, cookies: b.cookies[role] });
  return { ms: Math.round(performance.now() - t), calls: b.S.m.stats.calls, clientKB: Math.round(r.stats.clientBytes / 102.4) / 10 };
}

export function routeTable(rows: RouteRow[]): string {
  const w = Math.max(10, ...rows.map((r) => r.route.length));
  return [`${"route".padEnd(w)}  role     first ms calls  next ms calls  client KB  outcome`,
    ...rows.map((r) => `${r.route.padEnd(w)}  ${r.role.padEnd(7)}  ${String(r.coldMs).padStart(8)} ${String(r.coldCalls).padStart(5)}  ${String(r.warmMs).padStart(7)} ${String(r.warmCalls).padStart(5)}  ${String(r.clientKB).padStart(9)}  ${r.outcome}${r.detail ? " " + r.detail.slice(0, 120) : ""}`)].join("\n");
}
