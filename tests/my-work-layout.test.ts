/**
 * 📋 My Work, organised (owner r67): Due this week · Later · Done (folded), small type headers (Skills, Tests,
 * Reading, Learn, MAP, NAFS…), compact cards, at most 6 per group with "Show all", a small FIXED-size progress ring
 * (never a long bar that grows with the count), calm and mobile-first, and no level words for students.
 * Pure rows and a static render — no database.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ROOT } from "./helpers/db";
import { groupMyWork, SHOW_FIRST, timeOf, typeOf, weekEnd, type WorkRowLike } from "../src/lib/my-work-groups";
import { makeT } from "../src/i18n";
import { UI_STRINGS } from "../src/i18n/en";
import { ar } from "../src/i18n/ar";

const read = (f: string) => readFileSync(join(ROOT, f), "utf8");
// next/link is not loadable outside Next: a plain <a> stands in for the static render (as tests/helpers/page-render.ts)
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Module = require("node:module") as { _resolveFilename: (r: unknown, ...x: unknown[]) => string; _cache: Record<string, unknown> };
const orig = Module._resolveFilename;
Module._resolveFilename = function (this: unknown, r: unknown, ...x: unknown[]) { return r === "next/link" ? "stub:next/link" : orig.call(this, r, ...x); };
Module._cache["stub:next/link"] = { id: "next/link", filename: "next/link", loaded: true, children: [], paths: [], exports: { __esModule: true, default: ({ href, children, prefetch: _p, ...rest }: { href: string; children?: unknown; prefetch?: unknown }) => React.createElement("a", { href, ...rest }, children as never) } };
(globalThis as Record<string, unknown>).React ??= React; // the classic JSX of the components under tsx
const comp = () => import("../src/components/student/my-work-groups");
const NOW = new Date("2026-10-13T09:00:00Z"); // a Tuesday
const LEVEL_WORDS = /\b(Approaching|Meeting|Exceeding|Below Level|On Level|Above Level)\b/;
type Row = WorkRowLike & { skill: string; href: string; action: "Start" | "Continue" | "Review"; skillId: string | null; source: string; note: null; reteach?: boolean };
let n = 0;
const row = (o: Partial<Row>): Row => ({ assignmentId: `a${++n}`, skill: `Work ${n}`, status: "Not started", overdue: false, dueAt: null, sourceKey: "CURRICULUM", kind: undefined, href: `/x/${n}`, action: "Start", skillId: null, source: "Curriculum", note: null, ...o });

describe("📋 My Work groups", () => {
  test("time groups: late and due by Saturday → this week; later or no date → Later; finished → Done", () => {
    assert.equal(new Date(weekEnd(NOW)).toISOString(), "2026-10-17T20:59:59.999Z", "Saturday 23:59 Riyadh");
    assert.equal(timeOf(row({ dueAt: "2026-10-15T20:59:59Z" }), NOW), "WEEK");
    assert.equal(timeOf(row({ overdue: true, dueAt: "2026-10-01T00:00:00Z" }), NOW), "WEEK");
    assert.equal(timeOf(row({ dueAt: "2026-10-20T00:00:00Z" }), NOW), "LATER");
    assert.equal(timeOf(row({}), NOW), "LATER");
    assert.equal(timeOf(row({ status: "Done", overdue: true }), NOW), "DONE");
  });

  test("type groups with small headers: Skills, Tests, Reading, Learn, Writing, MAP, NAFS, Other", () => {
    assert.equal(typeOf(row({})), "SKILLS");
    assert.equal(typeOf(row({ sourceKey: "MAP" })), "MAP");
    assert.equal(typeOf(row({ kind: "TEST" })), "TESTS");
    assert.equal(typeOf(row({ kind: "TEST", sourceKey: "NAFS" })), "NAFS");
    assert.equal(typeOf(row({ kind: "MAP_TEST" })), "MAP");
    assert.equal(typeOf(row({ kind: "READRISE" })), "READING");
    assert.equal(typeOf(row({ kind: "LEARN" })), "LEARN");
    assert.equal(typeOf(row({ kind: "WRITING" })), "WRITING");
    assert.equal(typeOf(row({ kind: "NAFS_PRACTICE" })), "NAFS");
    assert.equal(typeOf(row({ kind: "SURVEY" })), "OTHER");
  });

  test("at most 6 per group, the rest under Show all; every row once; My Work order kept", () => {
    const rows = [
      ...Array.from({ length: 9 }, () => row({ dueAt: "2026-10-14T00:00:00Z" })),
      ...Array.from({ length: 3 }, () => row({ kind: "TEST", dueAt: "2026-10-14T00:00:00Z" })),
      ...Array.from({ length: 4 }, () => row({ kind: "LEARN" })),
      ...Array.from({ length: 8 }, () => row({ status: "Done" })),
    ];
    const [week, later, done] = groupMyWork(rows, NOW);
    assert.deepEqual([week.time, later.time, done.time], ["WEEK", "LATER", "DONE"]);
    assert.deepEqual([week.total, later.total, done.total], [12, 4, 8]);
    const skills = week.types.find((t) => t.type === "SKILLS")!;
    assert.equal(skills.first.length, SHOW_FIRST); assert.equal(skills.more.length, 3);
    assert.deepEqual(skills.rows.map((r) => r.assignmentId), rows.slice(0, 9).map((r) => r.assignmentId), "order kept");
    assert.deepEqual(week.types.map((t) => t.type), ["SKILLS", "TESTS"]);
    assert.equal(done.types[0].first.length, 6);
    const all = [week, later, done].flatMap((g) => g.types.flatMap((t) => t.rows.map((r) => r.assignmentId)));
    assert.equal(all.length, rows.length); assert.equal(new Set(all).size, rows.length);
  });

  test("the page: grouped, Done folded, Show all, a small fixed ring — never a long bar", async () => {
    const { MyWorkGroups, WorkRing } = await comp();
    const t = makeT("en");
    const rows = [...Array.from({ length: 40 }, () => row({ dueAt: "2026-10-14T00:00:00Z", skill: "Main idea" })), row({ status: "Done", skill: "Commas" })];
    const html = renderToStaticMarkup(React.createElement(MyWorkGroups, { rows: rows as never, t, now: NOW }));
    assert.match(html, /data-time="WEEK"/); assert.match(html, /<details id="my-work-done"/, "Done is folded");
    assert.match(html, /Show all \(40\)/);
    assert.equal((html.match(/data-testid="my-work-row"/g) ?? []).length, 41, "every row is still there (6 shown, the rest folded)");
    const ring = renderToStaticMarkup(React.createElement(WorkRing, { done: 1, total: 41, label: "1 of 41 done" }));
    assert.match(ring, /h-11 w-11/); assert.match(ring, /width="44"/);
    const ringBig = renderToStaticMarkup(React.createElement(WorkRing, { done: 500, total: 1000, label: "x" }));
    assert.match(ringBig, /width="44"/, "the same size whatever the count");
    const page = read("src/app/student/work/page.tsx");
    assert.match(page, /<WorkRing /); assert.match(page, /<MyWorkGroups /);
    assert.doesNotMatch(page, /bar-track|style=\{\{ width/, "no long progress bar");
    assert.doesNotMatch(read("src/components/student/my-work-groups.tsx"), /style=\{\{ width/);
    assert.doesNotMatch(page, /^export (const|function|async function) (?!metadata|default)/m, "page files export only Next page fields");
  });

  test("no level words for students; labels in English and Arabic", async () => {
    const { MyWorkGroups } = await comp();
    for (const f of ["src/components/student/my-work-groups.tsx", "src/lib/my-work-groups.ts", "src/app/student/work/page.tsx"]) assert.doesNotMatch(read(f), LEVEL_WORDS, f);
    const html = renderToStaticMarkup(React.createElement(MyWorkGroups, { rows: [row({ skill: "Commas" })] as never, t: makeT("ar"), now: NOW }));
    assert.doesNotMatch(html, LEVEL_WORDS);
    for (const w of ["Due this week", "Later", "Skills", "Tests", "Reading", "Learn", "MAP", "NAFS", "Other", "Writing"]) {
      assert.ok((UI_STRINGS as readonly string[]).includes(w), w); assert.ok((ar as Record<string, string>)[w], w);
    }
  });
});
