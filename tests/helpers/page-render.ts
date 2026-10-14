/**
 * ⚡ Renders a real page (src/app/** /page.tsx) on the server side, outside Next.js, to measure what one navigation
 * costs: the server time until the whole page (every streamed section) is ready and the number of database calls.
 *
 *   - next/headers, next/navigation, next/cache, next/server, next/link, next/dynamic, next/font, server-only: small
 *     stand-ins (cookies and headers come from the request below; redirect / notFound throw as in Next.js);
 *   - the app's database (src/lib/db.ts + PrismaRepo) is the test school's in-memory SQLite, through a MeasuringRepo;
 *   - React `cache()` memoises per request, as React Server Components do;
 *   - "use client" modules are not run: like the RSC renderer, their props are walked (server components and promises
 *     inside them are rendered/awaited) and their size counted (≈ what the browser is sent).
 *
 * Import this module FIRST (before any src/ module) so every page module sees the stand-ins. Test data only — never a
 * real database or real students.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import type { Repo } from "../../src/server/seeding/repo";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const Module = require("module") as { _resolveFilename: (...a: unknown[]) => string; _extensions: Record<string, (m: { exports: unknown }, f: string) => void>; _cache: Record<string, unknown> };
// eslint-disable-next-line @typescript-eslint/no-require-imports
const React = require("react") as typeof import("react") & Record<string, unknown>;

const ROOT = join(__dirname, "..", "..");
// as in the Next.js server, a stray rejected promise of background work is logged, never fatal
export const unhandled: string[] = [];
process.on("unhandledRejection", (e) => { unhandled.push(String((e as Error)?.message ?? e).slice(0, 200)); });
process.env.DATABASE_URL ??="mysql://perf:perf@localhost:3306/perf";
process.env.APP_SECRET ??= "perf-harness-secret-0123456789abcdef0123456789";
process.env.APP_URL ??= "http://localhost:3000";

// ── the request ──────────────────────────────────────────────────────────────────────────────────────────────────
interface Req { cookies: Map<string, string>; headers: Headers; memo: Map<unknown, unknown>; after: (() => unknown)[] }
const als = new AsyncLocalStorage<Req>();
const req = (): Req => { const r = als.getStore(); if (!r) throw new Error("outside a request"); return r; };

/** React.cache as in React Server Components: one result per request and arguments (objects by identity). */
function requestCache<A extends unknown[], R>(fn: (...a: A) => R): (...a: A) => R {
  return (...args: A): R => {
    const r = als.getStore();
    if (!r) return fn(...args);
    let node = r.memo.get(fn) as Map<unknown, unknown> | undefined;
    if (!node) { node = new Map(); r.memo.set(fn, node); }
    for (const a of args) {
      let next = node.get(a) as Map<unknown, unknown> | undefined;
      if (!next) { next = new Map(); node.set(a, next); }
      node = next;
    }
    if (node.has(RESULT)) return node.get(RESULT) as R;
    const v = fn(...args);
    node.set(RESULT, v);
    return v;
  };
}
const RESULT = Symbol("result");
React.cache = requestCache as never;
// JSX in src/ compiles to React.createElement here (tsconfig "jsx": "preserve" → classic runtime outside Next.js)
(globalThis as Record<string, unknown>).React ??= React;

// ── stand-ins for Next.js modules ───────────────────────────────────────────────────────────────────────────────
const CLIENT = Symbol.for("perf.client");
type Stub = ((props: Record<string, unknown>) => unknown) & { [CLIENT]?: string };
const clientStub = (name: string): Stub => { const f: Stub = (p) => p?.children ?? null; f[CLIENT] = name; return f; };

class Redirect extends Error { digest: string; constructor(public to: string) { super(`NEXT_REDIRECT ${to}`); this.digest = `NEXT_REDIRECT;replace;${to};307;`; } }
class NotFound extends Error { digest = "NEXT_HTTP_ERROR_FALLBACK;404"; constructor() { super("NEXT_NOT_FOUND"); } }
export const isRedirect = (e: unknown): e is Redirect => e instanceof Redirect;
export const isNotFound = (e: unknown): e is NotFound => e instanceof NotFound;

function cookieStore() {
  const c = req().cookies;
  return { get: (n: string) => (c.has(n) ? { name: n, value: c.get(n)! } : undefined), has: (n: string) => c.has(n), getAll: () => [...c].map(([name, value]) => ({ name, value })), set: () => undefined, delete: () => undefined, toString: () => "" };
}
const thenable = <T extends object>(v: T) => Object.assign(Promise.resolve(v), v);

const harnessRepo: { current: Repo | null } = { current: null };
/** One stable object (module caches are keyed by the repo, as the app's single PrismaRepo) → the current repo. */
const repoProxy = new Proxy({} as Repo, {
  get(_t, k) {
    const cur = harnessRepo.current as unknown as Record<string | symbol, unknown> | null;
    if (!cur) throw new Error("page-render: no database set");
    const v = cur[k];
    return typeof v === "function" ? (v as (...a: unknown[]) => unknown).bind(cur) : v;
  },
});

const STUBS: Record<string, unknown> = {
  "server-only": {},
  "client-only": {},
  "next/headers": {
    cookies: () => thenable(cookieStore()),
    headers: () => { const h = req().headers; return Object.assign(Promise.resolve(h), { get: (n: string) => h.get(n), has: (n: string) => h.has(n) }); },
    draftMode: () => thenable({ isEnabled: false }),
  },
  "next/navigation": {
    redirect: (to: string) => { throw new Redirect(to); },
    permanentRedirect: (to: string) => { throw new Redirect(to); },
    notFound: () => { throw new NotFound(); },
    forbidden: () => { throw new NotFound(); },
    unauthorized: () => { throw new Redirect("/login"); },
    useRouter: () => ({ push() {}, replace() {}, refresh() {}, back() {}, prefetch() {} }),
    usePathname: () => "/", useSearchParams: () => new URLSearchParams(), useParams: () => ({}), useSelectedLayoutSegment: () => null,
    RedirectType: { push: "push", replace: "replace" },
  },
  "next/cache": { revalidatePath() {}, revalidateTag() {}, unstable_noStore() {}, unstable_cache: <F>(fn: F) => fn, unstable_expireTag() {} },
  "next/server": {
    after: (fn: () => unknown) => { const r = als.getStore(); if (r) r.after.push(fn); else setImmediate(() => void fn()); },
    connection: async () => undefined,
    NextResponse: class { static json(b: unknown) { return b; } static redirect(u: unknown) { return u; } static next() { return null; } },
  },
  "next/link": { __esModule: true, default: clientStub("next/link") },
  "next/image": { __esModule: true, default: clientStub("next/image") },
  "next/script": { __esModule: true, default: clientStub("next/script") },
  "next/dynamic": { __esModule: true, default: () => clientStub("next/dynamic") },
  "next/font/google": new Proxy({}, { get: (_t, k) => (k === "__esModule" ? false : () => ({ className: "", variable: "", style: {} })) }),
};
const DB_FILES: Record<string, unknown> = {
  [join(ROOT, "src/lib/db.ts")]: { db: {} },
  // the app builds its one PrismaRepo at import (src/server/auth/next.ts): it becomes the measured test database
  [join(ROOT, "src/server/db/prisma-repo.ts")]: { PrismaRepo: function PrismaRepo() { return repoProxy; } },
};

const origResolve = Module._resolveFilename;
Module._resolveFilename = function (this: unknown, request: unknown, ...rest: unknown[]) {
  const r = String(request);
  if (r in STUBS) return `perf-stub:${r}`;
  const file = origResolve.call(this, request, ...rest);
  return file;
};
for (const [k, v] of Object.entries(STUBS)) Module._cache[`perf-stub:${k}`] = { id: k, filename: k, loaded: true, exports: v, children: [], paths: [] };
for (const [f, v] of Object.entries(DB_FILES)) Module._cache[f] = { id: f, filename: f, loaded: true, exports: v, children: [], paths: [] };

/** "use client" modules: exports become client references (never run on the server, as in Next.js). */
const USE_CLIENT = /^\s*(?:(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/)\s*)*["']use client["']/;
function clientExports(file: string, src: string): Record<string, unknown> {
  const out: Record<string, unknown> = { __esModule: true };
  const add = (n: string) => { out[n] = clientStub(`${file.replace(ROOT + "/", "")}#${n}`); };
  for (const m of src.matchAll(/export\s+(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/g)) add(m[1]);
  for (const m of src.matchAll(/export\s+(?:const|let|var|class)\s+([A-Za-z_$][\w$]*)/g)) add(m[1]);
  for (const m of src.matchAll(/export\s*\{([^}]*)\}/g)) for (const part of m[1].split(",")) { const n = part.trim().split(/\s+as\s+/).pop()?.trim(); if (n && !n.startsWith("type ")) add(n); }
  if (/export\s+default\b/.test(src)) add("default");
  return out;
}
for (const ext of [".tsx", ".ts", ".jsx"]) {
  const orig = Module._extensions[ext];
  if (!orig) continue;
  Module._extensions[ext] = (m, file) => {
    if (file.startsWith(join(ROOT, "src"))) {
      const src = readFileSync(file, "utf8");
      if (USE_CLIENT.test(src)) { m.exports = clientExports(file, src); return; }
    }
    return orig(m, file);
  };
}

// ── the renderer ────────────────────────────────────────────────────────────────────────────────────────────────
export interface RenderStats { components: number; clientProps: number; clientBytes: number }

const isElement = (v: unknown): v is { type: unknown; props: Record<string, unknown> } => !!v && typeof v === "object" && "$$typeof" in (v as object) && "props" in (v as object);
const isThenable = (v: unknown): v is PromiseLike<unknown> => !!v && (typeof v === "object" || typeof v === "function") && typeof (v as { then?: unknown }).then === "function";
const sizeOf = (v: unknown): number => {
  try { return JSON.stringify(v, (_k, x) => (isElement(x) ? "$el" : typeof x === "function" ? "$fn" : typeof x === "bigint" ? Number(x) : x instanceof Map || x instanceof Set ? [...x] : isThenable(x) ? "$p" : x))?.length ?? 0; } catch { return 0; }
};

async function walk(node: unknown, st: RenderStats, depth = 0): Promise<void> {
  if (node == null || typeof node === "boolean" || typeof node === "string" || typeof node === "number" || typeof node === "bigint") return;
  if (depth > 400) return;
  if (isThenable(node)) return walk(await node, st, depth + 1);
  if (Array.isArray(node)) { await Promise.all(node.map((n) => walk(n, st, depth + 1))); return; }
  if (!isElement(node)) {
    if (typeof node === "object" && Symbol.iterator in (node as object) && !(node instanceof Map)) return walk([...(node as Iterable<unknown>)], st, depth + 1);
    return;
  }
  const { type, props } = node;
  if (typeof type === "string" || typeof type === "symbol") return walk(props.children, st, depth + 1);
  if (typeof type === "function") {
    const client = (type as Stub)[CLIENT];
    if (client) {
      st.clientProps++;
      st.clientBytes += sizeOf(props);
      await walkData(props, st, depth + 1, 0);
      return;
    }
    if ((type as { prototype?: { isReactComponent?: unknown } }).prototype?.isReactComponent) return; // class components: client only here
    st.components++;
    return walk(await (type as (p: unknown) => unknown)(props), st, depth + 1);
  }
  if (type && typeof type === "object") {
    const t = type as { type?: unknown; render?: (p: unknown, r: unknown) => unknown; _payload?: unknown; _init?: (p: unknown) => unknown };
    if (t.type) return walk({ ...node, type: t.type }, st, depth + 1); // memo
    if (t.render) { st.components++; return walk(await t.render(props, null), st, depth + 1); } // forwardRef
    return walk(props.children, st, depth + 1); // context providers, lazy (client)
  }
}

/** Props of a client component: server elements in them are rendered and promises awaited (RSC serialises both). */
async function walkData(v: unknown, st: RenderStats, depth: number, level: number): Promise<void> {
  if (v == null || typeof v !== "object" || level > 6) { if (isThenable(v)) await walkData(await v, st, depth, level + 1); return; }
  if (isElement(v)) return walk(v, st, depth);
  if (isThenable(v)) return walkData(await v, st, depth, level + 1);
  if (Array.isArray(v)) { if (v.length > 2000) return; await Promise.all(v.map((x) => walkData(x, st, depth, level + 1))); return; }
  if (Object.getPrototypeOf(v) === Object.prototype) await Promise.all(Object.values(v as object).map((x) => walkData(x, st, depth, level + 1)));
}

export interface RequestInit { path: string; search?: string; cookies?: Record<string, string> }

/** Runs `fn` as one request (its own React cache, cookies, headers); `after()` work is collected, not run. */
export async function inRequest<T>(r: RequestInit, fn: () => Promise<T>): Promise<{ value: T; after: (() => unknown)[] }> {
  const headers = new Headers({ "x-pathname": r.path, "x-search": r.search ?? "", host: "localhost:3000", "user-agent": "perf-harness" });
  const store: Req = { cookies: new Map(Object.entries(r.cookies ?? {})), headers, memo: new Map(), after: [] };
  const value = await als.run(store, fn);
  return { value, after: store.after };
}

export interface PageResult { ms: number; stats: RenderStats; outcome: "ok" | "redirect" | "notFound" | "error"; detail?: string }

/**
 * Renders one page component (and its generateMetadata) as one request: what a client navigation to it costs on the
 * server. `segments` = layouts between the role frame and the page, if any (rendered too).
 */
export async function renderPage(load: () => Record<string, unknown>, r: RequestInit & { params?: Record<string, string>; searchParams?: Record<string, string> }): Promise<PageResult & { after: (() => unknown)[] }> {
  const st: RenderStats = { components: 0, clientProps: 0, clientBytes: 0 };
  const mod = load();
  const Page = mod.default as (p: unknown) => unknown;
  const props = { params: Promise.resolve(r.params ?? {}), searchParams: Promise.resolve(r.searchParams ?? {}) };
  const t0 = performance.now();
  let outcome: PageResult["outcome"] = "ok", detail: string | undefined;
  const { after } = await inRequest(r, async () => {
    try {
      const gm = mod.generateMetadata as ((p: unknown) => Promise<unknown>) | undefined;
      await Promise.all([gm ? gm(props) : null, walk((React.createElement as (...a: unknown[]) => unknown)(Page as never, props as never), st)]);
    } catch (e) {
      if (isRedirect(e)) { outcome = "redirect"; detail = e.to; }
      else if (isNotFound(e)) outcome = "notFound";
      else { outcome = "error"; detail = String((e as Error)?.stack ?? e).split("\n").slice(0, 3).join(" | "); }
    }
  }).catch((e) => { outcome = "error"; detail = String(e); return { after: [] as (() => unknown)[] }; });
  return { ms: performance.now() - t0, stats: st, outcome, detail, after };
}

/** Renders any element tree (a layout, AppShell) as one request. */
export async function renderTree(el: unknown, r: RequestInit): Promise<{ ms: number; stats: RenderStats }> {
  const st: RenderStats = { components: 0, clientProps: 0, clientBytes: 0 };
  const t0 = performance.now();
  await inRequest(r, () => walk(el, st));
  return { ms: performance.now() - t0, stats: st };
}

/** The database every page module talks to (through src/server/auth/next.ts `repo`). */
export function useDatabase(repo: Repo): void { harnessRepo.current = repo; }
export { React };
