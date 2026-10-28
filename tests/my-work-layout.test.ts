/**
 * 📋 My Work, organised (Oct 2026 restructure): exactly 3 sections — This week (open) / Needs Catch-up (collapsed)
 * / Extra Practice (collapsed) — plus a minimal "Done" footer line, small type headers (Skills, Tests, Reading,
 * Learn, MAP, NAFS…), compact cards, at most 6 per group with "Show all", a small FIXED-size progress ring (never
 * a long bar that grows with the count), calm and mobile-first, and no level words for students.
 * Pure rows and a static render — no database.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ROOT } from "./helpers/db";
import { groupMyWork, SHOW_FIRST, sectionOf, typeOf, CATCHUP_DAYS, type WorkRowLike } from "../src/lib/my-work-groups";
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
const DAY = 86_400_000;
const LEVEL_WORDS = /\b(Approaching|Meeting|Exceeding|Below Level|On Level|Above Level)\b/;
type Row = WorkRowLike & { skill: string; href: string; action: "Start" | "Continue" | "Review"; skillId: string | null; source: string; note: null; reteach?: boolean };
let n = 0;
const row = (o: Partial<Row>): Row => ({ assignmentId: `a${++n}`, skill: `Work ${n}`, status: "Not started", overdue: false, dueAt: null, sourceKey: "CURRICULUM", kind: undefined, href: `/x/${n}`, action: "Start", skillId: null, source: "Curriculum", note: null, ...o });

describe("📋 My Work groups", () => {
  test("sectionOf: not-done untagged work is 'This week' regardless of due date; CATCHUP_DAYS+ since assigned → Needs Catch-up; finished → Done", () => {
    assert.equal(CATCHUP_DAYS, 10);
    assert.equal(sectionOf(row({ dueAt: "2026-10-15T20:59:59Z" }), NOW), "THIS_WEEK");
    assert.equal(sectionOf(row({ overdue: true, dueAt: "2026-10-01T00:00:00Z" }), NOW), "THIS_WEEK", "overdue, but no stale assigned date — still This week");
    assert.equal(sectionOf(row({ dueAt: "2026-12-20T00:00:00Z" }), NOW), "THIS_WEEK", "far-future due date — no more separate Later bucket");
    assert.equal(sectionOf(row({}), NOW), "THIS_WEEK", "no due date at all");
    assert.equal(sectionOf(row({ assignedAt: new Date(NOW.getTime() - 10 * DAY).toISOString() }), NOW), "CATCHUP");
    assert.equal(sectionOf(row({ assignedAt: new Date(NOW.getTime() - 9 * DAY).toISOString() }), NOW), "THIS_WEEK", "9 days — not yet");
    assert.equal(sectionOf(row({ status: "Done", overdue: true }), NOW), "DONE");
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
      ...Array.from({ length: 9 }, () => row({})),
      ...Array.from({ length: 3 }, () => row({ kind: "TEST" })),
      ...Array.from({ length: 4 }, () => row({ kind: "LEARN" })),
      ...Array.from({ length: 8 }, () => row({ status: "Done" })),
    ];
    const [thisWeek, catchup, done] = groupMyWork(rows, NOW);
    assert.deepEqual([thisWeek.section, catchup.section, done.section], ["THIS_WEEK", "CATCHUP", "DONE"]);
    assert.deepEqual([thisWeek.total, catchup.total, done.total], [16, 0, 8]);
    const skills = thisWeek.types.find((t) => t.type === "SKILLS")!;
    assert.equal(skills.first.length, SHOW_FIRST); assert.equal(skills.more.length, 3);
    assert.deepEqual(skills.rows.map((r) => r.assignmentId), rows.slice(0, 9).map((r) => r.assignmentId), "order kept");
    assert.deepEqual(thisWeek.types.map((t) => t.type), ["SKILLS", "TESTS", "LEARN"]);
    assert.equal(done.types[0].first.length, 6);
    const all = [thisWeek, catchup, done].flatMap((g) => g.types.flatMap((t) => t.rows.map((r) => r.assignmentId)));
    assert.equal(all.length, rows.length); assert.equal(new Set(all).size, rows.length);
  });

  test("the page: 3 sections (This week open, Needs Catch-up collapsed), Done folded as a minimal footer, Show all, a small fixed ring — never a long bar", async () => {
    const { MyWorkGroups, WorkRing } = await comp();
    const t = makeT("en");
    const rows = [
      ...Array.from({ length: 40 }, () => row({ skill: "Main idea" })),
      row({ assignmentId: "stale", skill: "Stale skill", assignedAt: new Date(NOW.getTime() - 15 * DAY).toISOString() }),
      row({ status: "Done", skill: "Commas" }),
    ];
    const html = renderToStaticMarkup(React.createElement(MyWorkGroups, { rows: rows as never, t, now: NOW }));
    assert.match(html, /data-section="THIS_WEEK"[^]*?open/, "This week starts open");
    assert.match(html, /data-section="CATCHUP"/, "Needs Catch-up section is present");
    assert.doesNotMatch(html.match(/data-section="CATCHUP"[^]{0,400}/)?.[0] ?? "", /\bopen\b/, "Needs Catch-up starts collapsed");
    assert.match(html, /<details id="my-work-done"/, "Done is folded");
    assert.doesNotMatch(html.match(/<details id="my-work-done"[^]{0,200}/)?.[0] ?? "", /\bopen\b/, "Done starts collapsed");
    assert.match(html, /Show all \(40\)/);
    assert.equal((html.match(/data-testid="my-work-row"/g) ?? []).length, 42, "every row is still there (40 This week + 1 catch-up + 1 done)");
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

  test("Extra Practice: a tagged row shows under its own section, never in This week/Needs Catch-up/Done", async () => {
    const { MyWorkGroups } = await comp();
    const t = makeT("en");
    const rows = [row({ skill: "Tagged", tab: "EXTRA_PRACTICE" as never }), row({ skill: "Normal" })];
    const html = renderToStaticMarkup(React.createElement(MyWorkGroups, { rows: rows as never, t, now: NOW }));
    assert.match(html, /data-testid="work-tab" data-tab="EXTRA_PRACTICE"/);
    assert.match(html, /Extra Practice/);
  });

  test("the Done footer reads as a minor afterthought, not a 4th equal section (no shared card styling with the 3 main sections)", async () => {
    const { MyWorkGroups } = await comp();
    const t = makeT("en");
    const rows = [row({ status: "Done" }), row({})];
    const html = renderToStaticMarkup(React.createElement(MyWorkGroups, { rows: rows as never, t, now: NOW }));
    const doneBlock = html.match(/<details id="my-work-done"[^]*?<\/details>/)?.[0] ?? "";
    assert.doesNotMatch(doneBlock, /bg-amber-50|bg-sky-50|rounded-2xl p-3 ring-1/, "no colored card background like the main sections / tabs");
    assert.match(doneBlock, /✓/, "a plain checkmark, not a full-weight icon badge");
  });

  test("no level words for students; labels in English and Arabic", async () => {
    const { MyWorkGroups } = await comp();
    for (const f of ["src/components/student/my-work-groups.tsx", "src/lib/my-work-groups.ts", "src/app/student/work/page.tsx"]) assert.doesNotMatch(read(f), LEVEL_WORDS, f);
    const html = renderToStaticMarkup(React.createElement(MyWorkGroups, { rows: [row({ skill: "Commas" })] as never, t: makeT("ar"), now: NOW }));
    assert.doesNotMatch(html, LEVEL_WORDS);
    for (const w of ["This week", "Needs Catch-up", "Skills", "Tests", "Reading", "Learn", "MAP", "NAFS", "Other", "Writing", "Extra Practice"]) {
      assert.ok((UI_STRINGS as readonly string[]).includes(w), w); assert.ok((ar as Record<string, string>)[w], w);
    }
  });
});
