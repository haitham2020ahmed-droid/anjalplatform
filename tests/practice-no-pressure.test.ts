/**
 * 🌿 r67 item 4 — no pressure for the student in practice: no visible timer, a progress bar that shows how close the
 * student is to mastery (the engine's mastery %), never "question 23 of 50"; "fail" / "failed" never shown; no level
 * words. Plus the calm guessing messages (rendered, not only stored).
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nProvider } from "../src/i18n/client";
import type { Feedback, PracticeView } from "../src/server/practice/session";
import type { ClientQuestion } from "../src/server/practice/items";
import { ROOT } from "./helpers/db";

// next/link is not loadable outside Next: a plain <a> stands in for the static render (as tests/my-work-layout.test.ts)
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Module = require("node:module") as { _resolveFilename: (r: unknown, ...x: unknown[]) => string; _cache: Record<string, unknown> };
const orig = Module._resolveFilename;
Module._resolveFilename = function (this: unknown, r: unknown, ...x: unknown[]) { return r === "next/link" ? "stub:next/link" : r === "@/app/explain/actions" ? "stub:explain" : orig.call(this, r, ...x); };
// the "Explain" server action (a Next.js server module) is not part of this static render
Module._cache["stub:explain"] = { id: "explain", filename: "explain", loaded: true, children: [], paths: [], exports: { __esModule: true, explainAction: async () => ({}) } };
Module._cache["stub:next/link"] = { id: "next/link", filename: "next/link", loaded: true, children: [], paths: [], exports: { __esModule: true, default: ({ href, children, prefetch: _p, ...rest }: { href: string; children?: unknown; prefetch?: unknown }) => React.createElement("a", { href, ...rest }, children as never) } };
(globalThis as Record<string, unknown>).React ??= React; // the classic JSX of the components under tsx
const frame = () => import("../src/components/practice/practice-frame");
const h = React.createElement;
const q: ClientQuestion = { questionId: "q1", type: "MULTIPLE_CHOICE", stem: "Which clue tells why the author wrote it?", level: 4, passage: null, image: null, options: [{ label: "A", text: "To inform" }, { label: "B", text: "To persuade" }], hasHint: false };
const view = (over: Partial<PracticeView> = {}): PracticeView => ({
  sessionId: "s1", skillId: "k1", skillName: "Author's Purpose", question: q, answered: 23, correct: 15, mastery: 64, band: "APPROACHING", ended: false, endReason: null,
  work: { assignmentId: "a1", completion: "IN_PROGRESS", answered: 23, of: 30, correct: 15, accuracy: 65 }, ...over,
});
const feedback = (over: Partial<Feedback> = {}): Feedback => ({
  correct: false, credit: 0, yourAnswer: "B. To persuade", correctAnswer: "A. To inform", whyCorrect: "It gives facts.", whyYoursIsWrong: "It does not try to convince.", tip: "Look for facts.",
  rapidGuess: false, masteryBefore: 64, masteryAfter: 63, band: "APPROACHING", xp: 0, next: { hasQuestion: true, endReason: null, routeToSkillId: null, routeToSkillName: null }, ...over,
});
const html = async (v: PracticeView, fb: Feedback | null = null) => { const { PracticeFrame } = await frame(); return renderToStaticMarkup(h(I18nProvider, { lang: "en" }, h(PracticeFrame, {
  view: v, shownQuestion: q, value: null, onChange: () => {}, feedback: fb, ready: false, pending: false, error: null, onCheck: () => {}, onNext: () => {}, unitHref: "/student/map", onFinish: () => {},
}))); };
const render = async (v: PracticeView, fb: Feedback | null = null) => (await html(v, fb)).replace(/<[^>]+>/g, " ").replace(/&#x27;|&apos;/g, "'").replace(/\s+/g, " ");

describe("no pressure in practice", () => {
  test("no 'question x of 30/50' — the bar shows closeness to mastery (the engine's %)", async () => {
    const text = await render(view());
    assert.doesNotMatch(text, /\b23 of (30|50)\b|\bof 30\b|\bof 50\b/, text);
    const markup = await html(view());
    assert.match(markup, /role="progressbar"[^>]*aria-valuenow="64"/, "the progress bar carries the mastery %");
    assert.doesNotMatch(markup, /role="timer"/, "no visible timer");
  });

  test("no level words, never 'fail'", async () => {
    const { endText } = await frame();
    for (const fb of [null, feedback(), feedback({ guess: { action: "SLOW_DOWN", waitMs: 3000 } }), feedback({ guess: { action: "PAUSE", waitMs: 3000 } }), feedback({ goalDone: "MAX", next: { hasQuestion: true, endReason: null, routeToSkillId: null, routeToSkillName: null } })]) {
      const text = await render(view(), fb);
      assert.doesNotMatch(text, /\bfail(ed|ure|ing)?\b/i, text);
      assert.doesNotMatch(text, /\b(Below|On|Above) Level\b|\bApproaching\b|\bMeeting\b|\bExceeding\b/, text);
    }
    for (const r of ["COMPLETED", "POOL_EXHAUSTED", "SKILL_FINISHED", "WORK_MASTERED", "STUDENT_EXIT", "PREREQ_ROUTE"]) assert.doesNotMatch(endText(r), /fail/i);
  });

  test("the calm guessing messages: take your time; a break with the progress saved (no Next button)", async () => {
    const slow = await render(view(), feedback({ guess: { action: "SLOW_DOWN", waitMs: 3000 } }));
    assert.match(slow, /Take your time 😊 there's no rush — read the question carefully/);
    assert.match(slow, /Next question/);
    const pause = await render(view(), feedback({ guess: { action: "PAUSE", waitMs: 3000 } }));
    assert.match(pause, /Looks like you need a break — your progress is saved/);
    assert.doesNotMatch(pause, /Next question/, "the student takes a break");
    assert.match(pause, /Back to my skills/);
    // the 30–50 rule outside assigned work (the MAP plan): Done, and the student chooses
    const done = await render(view({ work: undefined }), feedback({ goalDone: "MAX" }));
    assert.match(done, /this work is Done/);
    assert.match(done, /Stop for now/);
    assert.match(done, /Keep practising/);
  });

  test("the practice screens' source: no timer, no 'x of 30' counter, no 'fail'", () => {
    for (const f of ["src/components/practice/practice-frame.tsx", "src/components/practice/practice-player.tsx", "src/components/practice/feedback-panel.tsx"]) {
      const src = readFileSync(join(ROOT, f), "utf8");
      assert.doesNotMatch(src, /role="timer"|Time left/, f);
      assert.doesNotMatch(src, /\{view\.work\.answered\} of \{view\.work\.of\}/, f);
      assert.doesNotMatch(src.replace(/\/\/.*|\/\*[\s\S]*?\*\//g, ""), />[^<{]*\bfail(ed)?\b/i, f);
    }
  });
});
