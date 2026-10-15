/**
 * 🖨 r85: the printed-QR pages as REQUESTS (the page modules themselves, demo school in memory): the student's name
 * list and code page never carry the class code; the code post signs in (same-origin, short session cookie) or comes
 * back with the error; the teacher's print card shows the code to the class's own teacher only; the weekly prints
 * (family week of a class, MAP Year plan) carry the QR + code by default and leave them out with signin=0.
 */
import { inRequest, React, useDatabase } from "./helpers/page-render";
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { demoDatabase, ROOT } from "./helpers/db";
import { resolveActor } from "../src/server/auth/actor";
import type { Actor } from "../src/server/auth/rbac";
import { DEFAULT_AUTH } from "../src/server/auth/config";
import { createSession } from "../src/server/auth/sessions";
import { sessionCookieName } from "../src/server/auth/http";
import { printQrPanel, turnOnPrintQr } from "../src/server/auth/class-print-qr";
import { exportFamilyWeek } from "../src/server/reports/family-week-pdf";
import { yearPlanDoc } from "../src/server/reports/year-plan-pdf";
import { renderHtml } from "../src/reports/html";

const CLIENT = Symbol.for("perf.client");
const isEl = (v: unknown): v is { type: unknown; props: Record<string, unknown> } => !!v && typeof v === "object" && "$$typeof" in (v as object) && "props" in (v as object);
const isThen = (v: unknown): v is PromiseLike<unknown> => !!v && typeof (v as { then?: unknown }).then === "function";

/** Every string a page sends (server-rendered text and attributes, and every client component's props). */
async function collect(node: unknown, out: string[], depth = 0): Promise<void> {
  if (node == null || typeof node === "boolean" || depth > 300) return;
  if (typeof node === "string" || typeof node === "number") { out.push(String(node)); return; }
  if (isThen(node)) return collect(await node, out, depth + 1);
  if (Array.isArray(node)) { for (const n of node) await collect(n, out, depth + 1); return; }
  if (!isEl(node)) { if (typeof node === "object") for (const v of Object.values(node as object)) await collect(v, out, depth + 1); return; }
  const { type, props } = node;
  if (typeof type === "function" && !(type as unknown as Record<symbol, unknown>)[CLIENT] && !(type as { prototype?: { isReactComponent?: unknown } }).prototype?.isReactComponent) {
    return collect(await (type as (p: unknown) => unknown)(props), out, depth + 1);
  }
  for (const v of Object.values(props)) await collect(v, out, depth + 1); // host elements and client components: all props
}

async function page(file: string, params: Record<string, string>, searchParams: Record<string, string>, cookies: Record<string, string> = {}): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require(join(ROOT, file)) as { default: (p: unknown) => unknown };
  const out: string[] = [];
  await inRequest({ path: "/x", cookies }, async () => {
    await collect((React as unknown as { createElement: (...a: unknown[]) => unknown }).createElement(mod.default as never, { params: Promise.resolve(params), searchParams: Promise.resolve(searchParams) } as never), out);
  });
  return out.join("\n");
}

let repo: SqliteRepo, teacherA: Actor, teacherB: Actor, c4a: string;
const NOW = new Date("2026-10-14T09:00:00Z");
const cookieFor = async (username: string) => {
  const u = (await repo.findUnique("User", { username }))!;
  const s = await createSession(repo, u, DEFAULT_AUTH, {});
  return { [sessionCookieName(false)]: s.token };
};

before(async () => {
  ({ repo } = await demoDatabase());
  useDatabase(repo);
  const actor = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);
  teacherA = await actor("demo.teacher.4a");
  teacherB = await actor("demo.teacher.4b");
  c4a = String((await repo.findMany("Class", { name: "DEMO 4A" }))[0].id);
  await turnOnPrintQr(repo, teacherA, c4a);
});

describe("🖨 the student's pages never carry the class code", () => {
  test("the name list: that class's names, links to the code page; no code", async () => {
    const v = await printQrPanel(repo, teacherA, c4a);
    const token = v.path!.replace("/qr/c/", "");
    const html = await page("src/app/qr/c/[token]/page.tsx", { token }, {});
    assert.match(html, /DEMO 4A/);
    assert.ok(html.includes(`/qr/c/${token}`), "names open the code page");
    assert.ok(!html.includes(v.code!), "the class code is not on the name list");
    const m = await repo.findMany("ClassMembership", { classId: c4a, leftAt: null });
    const sid = String(m[0].studentId);
    const codePage = await page("src/app/qr/c/[token]/page.tsx", { token }, { s: sid });
    assert.match(codePage, /\/qr\/c\/signin/, "the code form posts to the fixed address");
    assert.ok(codePage.includes(sid));
    assert.ok(!codePage.includes(v.code!), "the class code is not on the code page");
    const dead = await page("src/app/qr/c/[token]/page.tsx", { token: "A".repeat(43) }, {});
    assert.match(dead, /does not work now/);
  });
});

describe("🔢 the code post", () => {
  test("same-origin only; wrong code → back with the error; right code → the student's short session cookie", async () => {
    const v = await printQrPanel(repo, teacherA, c4a);
    const token = v.path!.replace("/qr/c/", "");
    const m = await repo.findMany("ClassMembership", { classId: c4a, leftAt: null });
    const sid = String(m[1].studentId);
    // the harness's NextResponse is a plain Response: give it Next's `cookies.set` (recorded here)
    const set: { name: string; value: string; opts: Record<string, unknown> }[] = [];
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { NextResponse } = require("next/server") as { NextResponse: { prototype: object } };
    if (!Object.getOwnPropertyDescriptor(NextResponse.prototype, "cookies")) Object.defineProperty(NextResponse.prototype, "cookies", { get: () => ({ set: (name: string, value: string, opts: Record<string, unknown>) => set.push({ name, value, opts }) }) });
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const route = require(join(ROOT, "src/app/qr/c/signin/route.ts")) as { POST: (r: Request) => Promise<Response> };
    const post = (code: string, origin = "http://localhost:3000") => route.POST(new Request("http://localhost:3000/qr/c/signin", {
      method: "POST", headers: { origin, host: "localhost:3000", "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ key: token, studentId: sid, code }).toString(),
    }));
    assert.equal((await post(v.code!, "https://evil.example")).status, 403, "cross-site blocked");
    const bad = await post(v.code === "0000" ? "1111" : "0000");
    assert.equal(bad.status, 303);
    assert.match(String(bad.headers.get("location")), new RegExp(`^/qr/c/${token}\\?s=${sid}&e=WRONG_CODE$`));
    const ok = await post(v.code!);
    assert.equal(ok.status, 303);
    assert.equal(ok.headers.get("location"), "/student");
    assert.equal(set.length, 1, "one session cookie");
    assert.equal(set[0].opts.httpOnly, true);
    const exp = new Date(String(set[0].opts.expires)).getTime();
    assert.ok(exp > Date.now() && exp <= Date.now() + 3 * 3_600_000 + 60_000, "a short session (3 hours at most)");
    const sess = (await repo.findMany("Session", { userId: (await repo.findUnique("Student", { id: sid }))!.userId }));
    assert.ok(sess.length >= 1, "a normal student session");
  });
});

describe("🧑‍🏫 the teacher's card and the weekly prints", () => {
  test("the print card: the class's own teacher sees the code; another teacher does not", async () => {
    const v = await printQrPanel(repo, teacherA, c4a);
    const mine = await page("src/app/teacher/class-signin/print/page.tsx", {}, { classId: c4a }, await cookieFor("demo.teacher.4a"));
    assert.ok(mine.includes(v.code!), "the code on the card");
    assert.match(mine, /Scan → tap your name → type the class code/);
    assert.match(mine, /امسح الرمز/, "the Arabic steps too");
    const other = await page("src/app/teacher/class-signin/print/page.tsx", {}, { classId: c4a }, await cookieFor("demo.teacher.4b"));
    assert.ok(!other.includes(v.code!), "another teacher: no code");
  });

  test("family week of a class: QR + code by default; signin=0 or a student's own copy: none", async () => {
    const v = await printQrPanel(repo, teacherA, c4a);
    const pages: string[] = [];
    const deps = { repo, fontDir: join(ROOT, "assets/fonts"), brandingDir: join(ROOT, "assets/branding"), now: () => NOW,
      pdf: { render: async (html: string) => { pages.push(html); return new TextEncoder().encode("%PDF-1.7 fake"); }, close: async () => undefined } };
    await exportFamilyWeek(deps, teacherA, { classId: c4a, lang: "en" });
    const text = (h: string) => h.replace(/<[^>]+>/g, "");
    assert.ok(text(pages[0]).includes(`Class code: ${v.code}`), "the code in the header");
    assert.match(pages[0], /data-class-signin="1"><svg/);
    await exportFamilyWeek(deps, teacherA, { classId: c4a, lang: "en", signin: false });
    assert.ok(!pages[1].includes("data-class-signin"), "signin=0 → off");
    const st = (await repo.findMany("ClassMembership", { classId: c4a, leftAt: null }))[0];
    const stUser = (await repo.findUnique("Student", { id: st.studentId }))!;
    const student = await resolveActor(repo, (await repo.findUnique("User", { id: stUser.userId }))!);
    await exportFamilyWeek(deps, student, { studentId: String(st.studentId), lang: "en" });
    assert.ok(!pages[2].includes("data-class-signin") && !text(pages[2]).includes(`Class code`), "a student's own copy: never");
    const c4b = String((await repo.findMany("Class", { name: "DEMO 4B" }))[0].id);
    await exportFamilyWeek(deps, teacherB, { classId: c4b, lang: "en" });
    const b = await printQrPanel(repo, teacherB, c4b);
    assert.ok(text(pages[3]).includes(`Class code: ${b.code}`), "another class: its own QR + code");
    assert.ok(text(pages[3]).includes("DEMO 4B") && !text(pages[3]).includes("DEMO 4A"));
  });

  test("MAP Year plan: QR + code in the header by default; signin=0 → none", async () => {
    const v = await printQrPanel(repo, teacherA, c4a);
    const on = renderHtml(await yearPlanDoc({ repo, brandingDir: "/nonexistent", now: () => NOW }, teacherA, c4a), { fontCss: "", fontStack: "sans-serif" });
    assert.ok(on.replace(/<[^>]+>/g, "").includes(`Class code: ${v.code}`));
    const off = renderHtml(await yearPlanDoc({ repo, brandingDir: "/nonexistent", now: () => NOW }, teacherA, c4a, { signin: false }), { fontCss: "", fontStack: "sans-serif" });
    assert.ok(!off.includes("data-class-signin"));
  });
});
