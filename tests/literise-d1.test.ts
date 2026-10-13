/**
 * Literise D1 "Mashrabiya light" redesign: the day look by default with an optional night look (cookie lr-theme →
 * <html data-theme>, no flash), the crisp vector Al-Anjal school logo, the new sign-in card, line icons in every menu,
 * and the student home (navy hero, ReadRise gauge, week strip, star-badge tiles). Look only: no behaviour changes.
 * Render-only and file checks; the week strip's day logic runs on a tiny in-memory repo.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nProvider } from "../src/i18n/client";
import { makeT } from "../src/i18n";
import { UI_STRINGS } from "../src/i18n/en";
import { ar } from "../src/i18n/ar";
import { SchoolLogo, SchoolMark } from "../src/components/brand/school-logo";
import { SCHOOL_NAME_AR } from "../src/i18n/school-name";
import { THEME_COOKIE, themeCookie, toTheme } from "../src/lib/theme";
import { ThemeToggle } from "../src/components/ui/theme-toggle";
import { ReadRiseGauge } from "../src/components/student/readrise-gauge";
import { STUDENT_HOME_TILES } from "../src/components/student/home-tiles-data";
import { navItemsFor } from "../src/components/nav-items";
import { practiceWeek, weekdayOf } from "../src/server/student/streak";
import type { Repo } from "../src/server/seeding/repo";
import { ROOT } from "./helpers/db";

const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const h = React.createElement;
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");
function files(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) { if (n !== "node_modules") files(p, out); } else out.push(p);
  }
  return out;
}

describe("Al-Anjal school logo (vector)", () => {
  test("the mark: the five blocks traced at 1:1, rounded corners, and 'Since ✦ 1985'", () => {
    const svg = renderToStaticMarkup(h(SchoolMark, {}));
    assert.match(svg, /viewBox="0 0 140 118"/);
    const blocks = [...svg.matchAll(/<polygon points="([^"]+)" fill="([^"]+)" stroke="\2" stroke-width="1.5" stroke-linejoin="round"/g)].map((m) => [m[2], m[1]]);
    assert.deepEqual(blocks, [
      ["#1639b2", "67,3 75,3 79.5,70.5 64.5,70.5"], ["#f4b840", "86,35 119,39.5 119,50 86,50"], ["#86b1f7", "24,60 57.5,55.5 57.5,70.5 24,70.5"],
      ["#49a2b1", "86,60 132.5,55 132.5,70.5 86,70.5"], ["#7f46bd", "9,75.5 81,80.5 81,90.5 9,90.5"],
    ]);
    assert.match(svg, /<text x="70" y="108" text-anchor="middle" font-size="11" font-weight="600" fill="#3352b9"[^>]*>Since ✦ 1985<\/text>/);
  });

  test("full: real text in both languages to the left of the mark, laid out the same in English and Arabic; night ink token", () => {
    for (const lang of ["en", "ar"] as const) {
      const html = renderToStaticMarkup(h(I18nProvider, { lang }, h(SchoolLogo, { size: "sm" })));
      assert.match(html, /^<span role="img" aria-label="Al-Anjal Private Schools, since 1985" dir="ltr"/);
      assert.ok(html.indexOf(SCHOOL_NAME_AR) < html.indexOf("Al-Anjal Private Schools</span>") && html.indexOf("Al-Anjal Private Schools</span>") < html.indexOf("<svg"), "text first, mark on the right");
      assert.match(html, /color:var\(--lr-school-ink\)/);
      assert.doesNotMatch(html, /<img/);
    }
    assert.match(renderToStaticMarkup(h(SchoolLogo, { variant: "mark", className: "h-9 w-auto" })), /^<svg[^>]*class="h-9 w-auto"[^>]*role="img"/);
    assert.match(read("src/app/globals.css"), /--lr-school-ink: #5b5f6b/);
    assert.match(read("src/app/night.css"), /--lr-school-ink: #dfe2fb/);
    const svg = read("public/brand/al-anjal-logo.svg");
    assert.ok(svg.includes(SCHOOL_NAME_AR) && svg.includes("Al-Anjal Private Schools") && svg.includes("Since ✦ 1985"));
  });

  test("used in the top bar and on the sign-in card; the uploaded-logo route is untouched", () => {
    assert.match(read("src/components/app-shell.tsx"), /<SchoolLogo size="sm"/);
    assert.match(read("src/app/login/login-form.tsx"), /<SchoolLogo size="md" \/>/);
    for (const f of ["src/components/app-shell.tsx", "src/app/login/login-form.tsx", "src/app/login/page.tsx"]) assert.doesNotMatch(read(f), /src="\/api\/school-logo"/, f);
    assert.match(read("src/app/api/school-logo/route.ts"), /schoolLogoFor/);
  });
});

describe("day (default) and night", () => {
  test("the cookie decides; unknown = day; the server writes <html data-theme>", () => {
    assert.equal(THEME_COOKIE, "lr-theme");
    assert.equal(toTheme(undefined), "day");
    assert.equal(toTheme("NIGHT"), "day");
    assert.equal(toTheme("night"), "night");
    assert.equal(toTheme("system"), "system");
    assert.equal(themeCookie("night"), "lr-theme=night; Path=/; Max-Age=31536000; SameSite=Lax");
    assert.match(themeCookie("day", true), /; Secure$/);
    assert.match(read("src/app/layout.tsx"), /data-theme=\{theme\}/);
    assert.match(read("src/server/ui/theme.ts"), /cookies\(\)\)\.get\(THEME_COOKIE\)/);
  });

  test("day tokens on :root; night tokens under [data-theme=night] and under system + prefers dark; paper stays day", () => {
    const css = read("src/app/globals.css"), night = read("src/app/night.css");
    for (const v of ["--lr-bg: #f3f6fb", "--lr-surface: #ffffff", "--lr-border: #e3e7f4", "--lr-ink: #232a6e", "--lr-ink-2: #4a5185", "--lr-muted: #5a6090", "--lr-accent: #f2b705", "--lr-teal: #1fa3a3", "--lr-teal-ink: #127a7a"]) assert.ok(css.includes(v), v);
    assert.match(css, /@import "\.\/night\.css";/);
    assert.match(night, /@media screen \{\n:root\[data-theme="night"\] \{/);
    assert.match(night, /@media screen and \(prefers-color-scheme: dark\) \{\n:root\[data-theme="system"\] \{/);
    for (const v of ["--lr-bg: #161b4f", "--lr-ink: #ffffff", "--lr-ink-2: #c9cdf2", "--lr-accent: #ffd24d", "--lr-teal: #2bc4c4", "--lr-reading-bg: #1d2360", "--lr-reading-ink: #e8eafc"]) assert.ok(night.includes(v), v);
    // white text stays white at night; the slate ramp turns dark → light
    assert.match(night, /\[class\*="text-white"\] \{ color: #fff; \}/);
    assert.match(night, /--color-slate-900: #eceefc/);
  });

  test("the sun / moon switch: Day · Night · System, translated", () => {
    const html = renderToStaticMarkup(h(I18nProvider, { lang: "en" }, h(ThemeToggle, { initial: "night" })));
    assert.match(html, /aria-label="Day or night: Night"/);
    assert.deepEqual([...html.matchAll(/aria-pressed="(true|false)"/g)].map((m) => m[1]), ["false", "true", "false"]);
    for (const s of ["Day or night", "Day", "Night", "System"]) assert.ok((UI_STRINGS as readonly string[]).includes(s) && ar[s as keyof typeof ar], s);
    assert.match(read("src/components/app-shell.tsx"), /<ThemeToggle initial=\{theme\} \/>/);
  });
});

describe("fonts and sizes", () => {
  test("Hanken Grotesk / Young Serif / IBM Plex Sans Arabic; calm sizes (page title 28px, body 15px)", () => {
    const css = read("src/app/globals.css");
    assert.match(css, /--text-3xl: 1\.75rem;/);
    assert.match(css, /--text-base: 0\.9375rem;/);
    assert.match(css, /body \{ font-size: 0\.9375rem;/);
    assert.match(css, /h1:not\(\.font-sans\), h2[^{]*\{ font-family: var\(--font-display\)/);
  });
});

describe("mashrabiya pattern only on the sign-in backdrop and the student hero", () => {
  test("nowhere else", () => {
    const hits = [...files(join(ROOT, "src/app")), ...files(join(ROOT, "src/components"))].filter((f) => /\.tsx$/.test(f) && /<pattern /.test(readFileSync(f, "utf8"))).map((f) => relative(ROOT, f)).sort();
    assert.deepEqual(hits, ["src/app/login/page.tsx", "src/app/student/page.tsx"]);
  });
});

describe("menus: calm line icons for every role", () => {
  test("admin, teacher and student menu entries all have a line icon", () => {
    for (const role of ["SCHOOL_ADMIN", "SUPER_ADMIN", "TEACHER", "STUDENT"]) for (const i of navItemsFor(role)) assert.ok(i.line, `${role}: ${i.label}`);
    const nav = read("src/components/ui/side-nav.tsx");
    assert.match(nav, /on \? "bg-brand-navy font-semibold text-white/, "the current page is a navy pill");
    const admin = read("src/app/admin/page.tsx");
    assert.doesNotMatch(admin, /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u, "no emoji on the admin home");
  });
});

describe("student home (D1)", () => {
  test("ReadRise gauge: the level, growth since the start, never 'Lexile'; no level yet → a line that opens ReadRise", () => {
    const t = makeT("en");
    const html = renderToStaticMarkup(h(ReadRiseGauge, { t, lang: "en", level: 760, start: { level: 640, at: "2026-09-02T08:00:00.000Z" } }));
    const words = text(html);
    assert.ok(words.includes("Your ReadRise level") && words.includes("760"));
    assert.ok(words.includes("Up 120 since September"));
    assert.doesNotMatch(words, /Lexile|Below|On level|Above|Tier/i);
    assert.doesNotMatch(text(renderToStaticMarkup(h(ReadRiseGauge, { t, lang: "en", level: 700, start: { level: 700, at: "2026-09-02T08:00:00.000Z" } }))), /Up /, "no growth line without growth");
    const none = text(renderToStaticMarkup(h(ReadRiseGauge, { t, lang: "en", level: null, start: null })));
    assert.ok(none.includes("Read your first ReadRise article to see your level."));
    for (const s of ["Your ReadRise level", "ReadRise level {n}", "Up {n} since {month}", "Up {n} since you started", "Read your first ReadRise article to see your level.", "{n} of {total} days practised", "Read today. Rise tomorrow."]) {
      assert.ok((UI_STRINGS as readonly string[]).includes(s) && ar[s as keyof typeof ar], s);
    }
  });

  test("tiles: 4 per row on a computer, 2 on a phone, each icon on an 8-point-star badge", () => {
    const src = read("src/components/student/home-tiles.tsx");
    assert.match(src, /grid-cols-2[^"]*md:grid-cols-4/);
    assert.match(src, /const STAR = "M26 1 L33 12 L46 9 /);
    assert.match(src, /<path d=\{STAR\} fill=\{x\.star\.bg\} \/>/);
    assert.equal(new Set(STUDENT_HOME_TILES.map((x) => x.star.bg)).size, STUDENT_HOME_TILES.length, "one colour per tile");
  });

  test("the hero: Hello, Today, the next task and the saffron Start / Continue; the page keeps its data", () => {
    const page = read("src/app/student/page.tsx");
    assert.match(page, /className="lr-hero /);
    assert.match(page, /\$\{BTN_ACCENT\} /);
    assert.match(page, /<ReadRiseLevelCard t=\{t\} lang=\{lang\} level=\{h\.readRiseLevel\} start=\{h\.readRiseStart\} \/>/);
    assert.match(page, /<WeekStrip studentId=/);
    assert.doesNotMatch(page, /Lexile|\bTier\b|Below|Above/);
  });

  test("week strip: Sunday → Thursday in Saudi time, practised days from this week's answers and articles", async () => {
    const asked: string[] = [];
    const rows: Record<string, { createdAt: Date }[]> = {
      QuestionAttempt: [{ createdAt: new Date("2026-10-11T22:30:00Z") }],   // Monday 12 Oct, 01:30 in Riyadh
      ReadMasterAttempt: [{ createdAt: new Date("2026-10-13T06:00:00Z") }], // Tuesday 13 Oct
    };
    const repo = { findMany: async (model: string, where: { createdAt: { gte: Date } }) => { asked.push(`${model}>=${where.createdAt.gte.toISOString()}`); return rows[model] ?? []; } } as unknown as Repo;
    const w = await practiceWeek(repo, "s1", new Date("2026-10-13T09:00:00Z"));
    assert.deepEqual(w.days.map((d) => d.date), ["2026-10-11", "2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15"]);
    assert.deepEqual(w.days.map((d) => d.practised), [false, true, true, false, false]);
    assert.deepEqual(w.days.map((d) => d.today), [false, false, true, false, false]);
    assert.deepEqual(w.days.map((d) => d.future), [false, false, false, true, true]);
    assert.deepEqual(asked.sort(), ["QuestionAttempt>=2026-10-10T21:00:00.000Z", "ReadMasterAttempt>=2026-10-10T21:00:00.000Z"], "bounded: from Sunday 00:00 Riyadh");
    assert.equal(weekdayOf(Math.floor((Date.parse("2026-10-11T12:00:00Z") + 3 * 3_600_000) / 86_400_000)), 0, "Sunday");
  });
});

describe("sign-in card (D1)", () => {
  test("one centred card (max 980px) on the pattern backdrop; H1 ≤ 34px; phones stack", () => {
    const page = read("src/app/login/page.tsx");
    assert.match(page, /max-w-\[980px\]/);
    assert.match(page, /md:flex-row/);
    assert.match(read("src/app/login/login-hero.tsx"), /md:text-\[2\.125rem\]/);
    assert.match(read("src/app/login/login-form.tsx"), /<LangSwitch \/>/);
  });
});
