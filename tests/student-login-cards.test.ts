/**
 * 🪪 The printable student sign-in cards (redesign): a fixed 2 × 4 grid of same-size cards on A4, shared dashed cut
 * lines, cards never split across pages, nothing can run out of a card (2-line names, values that shrink to fit),
 * a clear Username / Password box in a large monospace font, the website, the QR code, and Arabic (RTL) that works.
 * Renders the server component to HTML and checks its structure and CSS. Fake names only.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ACCOUNTS_CSS, CARDS_PER_PAGE, SignInCards, fitClass, siteOf, type AccountEntry } from "../src/components/print/accounts";
import { PRINT_CSS } from "../src/components/print/print-kit";
import { translate } from "../src/i18n";
import { UI_STRINGS } from "../src/i18n/en";
import { ar } from "../src/i18n/ar";

const h = React.createElement;
const count = (s: string, needle: string) => s.split(needle).length - 1;
const LONG_NAME = "Alexandria Maximiliana Konstantinopoulou-Wetherington the Third of Many Names";
const LONG_USER = "a.very.long.username.that.goes.on.and.on.2026";
const pupils = (n: number): AccountEntry[] => Array.from({ length: n }, (_, i) => ({
  userId: `u${i}`, name: i === 0 ? LONG_NAME : i === 1 ? "سارة أحمد عبد الله" : `Test Pupil ${i + 1}`,
  username: i === 0 ? LONG_USER : `pupil.${i + 1}`, number: "", password: i === 2 ? null : i === 0 ? LONG_USER : `pupil.${i + 1}`,
  className: i < 9 ? "4A" : "5B", grade: i < 9 ? 4 : 5,
}));
type T = (x: string, v?: Record<string, string | number>) => string;
const render = (cards: AccountEntry[], t?: T) =>
  renderToStaticMarkup(h(SignInCards, { cards, school: "Demo Primary School", base: "https://anjal.example.com/", ...(t ? { t } : {}) }));
const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const rule = (sel: string) => {
  const m = ACCOUNTS_CSS.match(new RegExp(`(?:^|\\n)${esc(sel)}\\{([^}]*)\\}`));
  assert.ok(m, `rule ${sel}`);
  return m![1];
};

describe("🪪 student sign-in cards: layout on A4", () => {
  test("fixed 2 × 4 grid of 92 × 62 mm cards: 8 per page, fits the A4 printable area (186 × 271 mm)", () => {
    assert.equal(CARDS_PER_PAGE, 8);
    const grid = rule(".pk-cards");
    assert.match(grid, /grid-template-columns:repeat\(2,92mm\)/);
    assert.match(grid, /grid-auto-rows:62mm/);
    const cell = rule(".pk-cardcell");
    assert.match(cell, /width:92mm;height:62mm/);
    assert.ok(2 * 92 <= 186 && 4 * 62 + 12 <= 271, "the grid plus the slim top line fits inside the page margins");
    assert.match(cell, /break-inside:avoid;page-break-inside:avoid/, "a card never splits across pages");
    assert.match(cell, /overflow:hidden/);
    assert.match(rule(".pk-card"), /height:100%;min-width:0;overflow:hidden/);
    assert.match(PRINT_CSS, /\.pk-page\+\.pk-page\{break-before:page/, "each 8 cards start a new page");
  });

  test("cut lines: light dashed borders shared between neighbours (logical sides, so RTL mirrors them)", () => {
    assert.match(rule(".pk-cards"), /border-top:\.3mm dashed #94a3b8;border-inline-start:\.3mm dashed #94a3b8/);
    assert.match(rule(".pk-cardcell"), /border-bottom:\.3mm dashed #94a3b8;border-inline-end:\.3mm dashed #94a3b8/);
  });

  test("print rules and a screen-only phone layout (the narrow rule never applies on paper)", () => {
    assert.match(ACCOUNTS_CSS, /@media print\{\.pk-cardpage\{padding:0\}/);
    assert.match(ACCOUNTS_CSS, /@media screen and \(max-width:820px\)\{\.pk-cards\{grid-template-columns:minmax\(0,92mm\)/);
    assert.doesNotMatch(ACCOUNTS_CSS, /@media \(max-width/, "no width rule that a printed page could trigger");
  });

  test("19 students → 3 pages of 8 + 8 + 3, with page numbers", () => {
    const out = render(pupils(19));
    assert.equal(count(out, 'data-pk="page"'), 3);
    assert.equal(count(out, 'data-pk="card"'), 19);
    assert.equal(count(out, 'class="pk-cardcell"'), 19);
    assert.ok(out.includes("Page 1 of 3") && out.includes("Page 3 of 3"));
    assert.equal(count(render(pupils(5)), "Page "), 0, "one page: no page numbers");
  });
});

describe("🪪 student sign-in cards: inside a card", () => {
  const out = render(pupils(9));
  const s0 = out.indexOf('data-pk="card"');
  const first = out.slice(s0, out.indexOf('data-pk="card"', s0 + 5));

  test("order: platform + school (small) → name → class · grade → Username / Password box → website", () => {
    const at = (x: string) => { const i = first.indexOf(x); assert.ok(i >= 0, x); return i; };
    const order = [at("pk-card-top"), at("Demo Primary School"), at("pk-card-name"), at("pk-card-class"), at('class="pk-cred"'), at(">Username<"), at(">Password<"), at("pk-card-site")];
    assert.deepEqual([...order].sort((a, b) => a - b), order);
    assert.ok(first.includes("4A</bdi> · Grade 4"));
    assert.ok(first.includes('Website: <b dir="ltr">anjal.example.com</b>'), "site without https:// or trailing slash");
    assert.equal(siteOf("https://x.example/"), "x.example");
  });

  test("the name: max 2 lines then …; very long names print smaller; kept in their own direction", () => {
    const name = rule(".pk-card-name");
    assert.match(name, /-webkit-line-clamp:2/);
    assert.match(name, /overflow:hidden/);
    assert.match(name, /overflow-wrap:anywhere/);
    assert.ok(first.includes('class="pk-card-name pk-long" dir="auto"'));
    assert.ok(out.includes('dir="auto" title="سارة أحمد عبد الله"><bdi>سارة أحمد عبد الله</bdi>'));
    assert.match(rule(".pk-card-school"), /text-overflow:ellipsis/);
    assert.match(rule(".pk-card-class"), /text-overflow:ellipsis/);
  });

  test("username and password: large, bold, high-contrast monospace, left-to-right; long values shrink, then wrap to 2 lines", () => {
    const v = rule(".pk-val");
    for (const r of [/font-family:"Consolas"[^;]*monospace/, /slashed-zero/, /font-weight:700/, /color:#000/, /direction:ltr/, /text-overflow:ellipsis/]) assert.match(v, r);
    assert.deepEqual(["pupil.1", "pupil.1234567890", "abcdefghijklmnopqrs", "abcdefghijklmnopqrstuv", LONG_USER].map(fitClass), ["pk-fit-1", "pk-fit-2", "pk-fit-3", "pk-fit-4", "pk-fit-5"]);
    assert.match(rule(".pk-fit-1"), /font-size:19px/);
    assert.match(rule(".pk-fit-5"), /-webkit-line-clamp:2/);
    assert.ok(first.includes(`class="pk-val pk-fit-5" dir="ltr" data-pk="username">${LONG_USER}<`));
    assert.ok(out.includes('class="pk-val pk-fit-1" dir="ltr" data-pk="username">pupil.4<'));
    assert.equal(count(out, 'data-pk="password"'), 8, "no password for the student whose password is not known");
    assert.ok(out.includes('<span class="pk-hidden">ask your teacher</span>'));
  });

  test("one QR code per card (the existing one), never a dir attribute on the SVG", () => {
    assert.equal(count(out, "<svg"), 9);
    assert.ok(out.includes('aria-label="QR code to sign in as pupil.4"'));
    assert.doesNotMatch(out, /<svg[^>]*\sdir=/);
  });
});

describe("🪪 student sign-in cards: Arabic", () => {
  test("every card word is translated; values stay left-to-right inside the RTL card", () => {
    const tAr: T = (x, v) => translate("ar", x, v);
    const out = render(pupils(10), tAr);
    const dict = ar as Record<string, string>;
    for (const w of ["Sign-in cards", "Cut along the dashed lines", "Username", "Password", "Website", "ask your teacher"]) {
      assert.ok((UI_STRINGS as readonly string[]).includes(w), `${w} is a UI string`);
      assert.ok(dict[w], `${w} has Arabic`);
      assert.ok(out.includes(dict[w]), `${w} printed in Arabic`);
    }
    assert.ok(out.includes(tAr("Grade {n}", { n: 4 })));
    assert.equal(count(out, 'dir="ltr" data-pk="username"'), 10);
    assert.doesNotMatch(ACCOUNTS_CSS, /(margin|padding|border)-(left|right)/, "only logical sides, so RTL mirrors the layout");
  });
});
