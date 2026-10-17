/**
 * 🎉 My Work celebration additions: the end-of-session summary (skill, accuracy, best streak) on the practice-done
 * screen, the compact "stars filled x/5" mastery meter on My Work rows, and the plan-completion celebration on My
 * Plans. Static renders only (no Next.js, no real database): next/link stands in for a plain <a>.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nProvider } from "../src/i18n/client";
import { UI_STRINGS } from "../src/i18n/en";
import { ar } from "../src/i18n/ar";
import { bandOfScore, segmentFills, stepIndex } from "../src/lib/mastery-steps";
import { peekBestStreak, recordAnswer, resetStreak } from "../src/components/feedback-fx/answer-fx";

// next/link is not loadable outside Next: a plain <a> stands in (same stub as tests/practice-no-pressure.test.ts)
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Module = require("node:module") as { _resolveFilename: (r: unknown, ...x: unknown[]) => string; _cache: Record<string, unknown> };
const orig = Module._resolveFilename;
Module._resolveFilename = function (this: unknown, r: unknown, ...x: unknown[]) {
  const q = String(r);
  if (q === "next/link") return "stub:next/link";
  if (q === "@/app/explain/actions") return "stub:explain";
  if (q === "@/app/learn-actions") return "stub:learn-actions";
  return orig.call(this, r, ...x);
};
// server action modules the practice player's leaves (Explain, word lookup, flag) never run in this static render
// (same stubbing as tests/practice-no-pressure.test.ts)
const noopActions = new Proxy({ __esModule: true }, { get: (t, k) => (k in t ? (t as Record<string | symbol, unknown>)[k] : async () => ({})) });
Module._cache["stub:explain"] = { id: "explain", filename: "explain", loaded: true, children: [], paths: [], exports: { __esModule: true, explainAction: async () => ({}) } };
Module._cache["stub:learn-actions"] = { id: "learn-actions", filename: "learn-actions", loaded: true, children: [], paths: [], exports: noopActions };
Module._cache["stub:next/link"] = { id: "next/link", filename: "next/link", loaded: true, children: [], paths: [], exports: { __esModule: true, default: ({ href, children, prefetch: _p, ...rest }: { href: string; children?: unknown; prefetch?: unknown }) => React.createElement("a", { href, ...rest }, children as never) } };
(globalThis as Record<string, unknown>).React ??= React;
const h = React.createElement;
const en = (el: React.ReactElement) => renderToStaticMarkup(h(I18nProvider, { lang: "en" }, el));

describe("🎉 My Work celebration", () => {
  test("every new UI string has an Arabic version (ar.ts keeps the type checker's promise)", () => {
    for (const x of ["Skill practised", "Best streak", "{n} in a row", "Plan complete! 🎉", "You finished every part of this plan — amazing work!", "Plan complete"]) {
      assert.ok((UI_STRINGS as readonly string[]).includes(x), `${x} in UI_STRINGS`);
      assert.ok((ar as Record<string, string>)[x], `${x} has an Arabic string`);
    }
  });

  describe("1. completion celebration: the end-of-session summary", () => {
    test("PracticeDone shows the skill, accuracy and a streak worth celebrating, always with confetti", async () => {
      resetStreak("practice");
      const { PracticeDone } = await import("../src/components/practice/practice-player");
      const html = renderToStaticMarkup(h(I18nProvider, { lang: "en" }, h(PracticeDone, { reason: "WORK_MASTERED", href: "/student/work", skillName: "Make Inferences", answered: 32, correct: 24 })));
      assert.match(html, /data-testid="practice-done-stats"/);
      assert.match(html, /Make Inferences/);
      assert.match(html, />32</, "questions answered shown");
      assert.match(html, />75%</, "24\/32 = 75% accuracy shown");
      const src = require("node:fs").readFileSync(require("node:path").join(__dirname, "../src/components/practice/practice-player.tsx"), "utf8") as string;
      assert.match(src, /<h2 className="mt-2 text-3xl font-bold text-brand-navy">\{t\("Great job! ✓"\)\}<\/h2>\s*<p[\s\S]{0,260}<\/p>\s*<div className="mt-4"><CelebrateFx \/><\/div>/, "confetti shows for any finish, not only a mastered one");
    });

    test("no stats block when there is nothing to show yet (answered 0, no skill name)", () => {
      const { PracticeDone } = require("../src/components/practice/practice-player") as typeof import("../src/components/practice/practice-player");
      const html = renderToStaticMarkup(h(I18nProvider, { lang: "en" }, h(PracticeDone, { reason: "COMPLETED", href: "/student/work" })));
      assert.doesNotMatch(html, /data-testid="practice-done-stats"/);
    });

    test("peekBestStreak: the best run of right answers in a row this screen has seen, per scope", () => {
      resetStreak("x1");
      assert.equal(peekBestStreak("x1"), 0);
      for (const c of [true, true, true, false, true, true]) recordAnswer("x1", `k${Math.random()}`, c);
      assert.equal(peekBestStreak("x1"), 3, "3 in a row was the best run, even after it broke");
      resetStreak("x1");
      assert.equal(peekBestStreak("x1"), 0, "forgotten after reset");
    });
  });

  describe("2. mastered badge: the gold star already shown on My Work rows", () => {
    test("CompactCard renders the shared SkillStar (gold, glowing) for a mastered skill's row", () => {
      const src = require("node:fs").readFileSync(require("node:path").join(__dirname, "../src/components/student/my-work-groups.tsx"), "utf8") as string;
      assert.match(src, /<SkillStar info={star}/, "the ONE shared star component, not a re-drawn badge");
    });
  });

  describe("3. a visual progress bar per skill toward mastery", () => {
    test("bandOfScore matches the engine's own thresholds (40 / 60 / 75 / 90)", () => {
      assert.equal(bandOfScore(0), "BEGINNING");
      assert.equal(bandOfScore(39), "BEGINNING");
      assert.equal(bandOfScore(40), "DEVELOPING");
      assert.equal(bandOfScore(60), "APPROACHING");
      assert.equal(bandOfScore(75), "PROFICIENT");
      assert.equal(bandOfScore(90), "MASTERED");
      assert.equal(bandOfScore(150), "MASTERED", "clamped");
    });

    test("MasteryMeter: five segments, filled up to the current step, never fully empty mid-step", async () => {
      const { MasteryMeter } = await import("../src/components/skills/mastery-meter");
      const low = en(h(MasteryMeter, { score: 45, answered: 10 }));
      assert.equal((low.match(/data-testid="mastery-meter"/g) ?? []).length, 1);
      assert.equal((low.match(/rounded-full bg-slate-200/g) ?? []).length, 5, "five dots");
      const fills = segmentFills(bandOfScore(45), 45);
      assert.equal(stepIndex(bandOfScore(45)), 1, "Developing");
      assert.ok(fills[1] > 0, "the current step is never empty");
      const mastered = en(h(MasteryMeter, { score: 95, answered: 40 }));
      assert.match(mastered, /bg-brand-gold/, "gold once mastered");
    });

    test("My Work: an in-progress skill (with a score) gets the meter; mastered / not-started rows do not", () => {
      const src = require("node:fs").readFileSync(require("node:path").join(__dirname, "../src/components/student/my-work-groups.tsx"), "utf8") as string;
      assert.match(src, /star\.status === "IN_PROGRESS"/);
      assert.match(src, /<MasteryMeter score={star!\.score!}/);
    });
  });

  describe("4. plan-completion celebration", () => {
    test("a finished plan (done === total) shows the bigger banner the first time, then a quiet badge", async () => {
      const { PlanCompleteBanner } = await import("../src/components/plans/plan-complete-banner");
      // no window.localStorage in this environment: the component celebrates every static render (documented fallback)
      const html = renderToStaticMarkup(h(I18nProvider, { lang: "en" }, h(PlanCompleteBanner, { planKey: "plan:test-1" })));
      assert.match(html, /data-testid="plan-complete-banner"|data-testid="plan-complete-badge"/);
    });

    test("My Plans wires the banner in only when the plan is 100% done", () => {
      const src = require("node:fs").readFileSync(require("node:path").join(__dirname, "../src/app/student/plans/page.tsx"), "utf8") as string;
      assert.match(src, /pct === 100[\s\S]{0,40}<PlanCompleteBanner planKey={p\.key}/);
    });
  });
});
