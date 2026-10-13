/**
 * Literise rebrand + the new sign-in page: the platform name is Literise (the school stays "Al-Anjal Private
 * Schools"), the accreditation strip is gone everywhere, and the sign-in page keeps posting to /login/submit.
 * The page shows no level words (Below / On level / Above): students see it. Render-only, no database.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nProvider } from "../src/i18n/client";
import { makeT, type Lang } from "../src/i18n";
import { UI_STRINGS } from "../src/i18n/en";
import { ar } from "../src/i18n/ar";
import { LoginForm, SIGN_IN_ROLES } from "../src/app/login/login-form";
import { LoginHero } from "../src/app/login/login-hero";
import { LiteriseLogo, LITERISE } from "../src/components/brand/literise-logo";
import { PLATFORM } from "../src/components/print/tokens";

const ROOT = join(__dirname, "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const h = React.createElement;
function files(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) { if (n !== "node_modules" && n !== "__pycache__") files(p, out); }
    else out.push(p);
  }
  return out;
}
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");
const renderPage = (lang: Lang, props: { error?: string | null; username?: string; next?: string } = {}) =>
  renderToStaticMarkup(h(I18nProvider, { lang }, h("div", null,
    h(LoginHero, { t: makeT(lang) }),
    h(LoginForm, { error: props.error ?? null, username: props.username ?? "", next: props.next ?? "" }))));

describe("sign-in page (Literise)", () => {
  test("Literise name, headline, role tiles; the form posts to the same address with the same fields", () => {
    const html = renderPage("en");
    const words = text(html);
    assert.ok(words.includes("Literise"));
    // Literise D1 (redesign): the navy half says "Read today. Rise tomorrow." and one short line
    assert.ok(words.includes("Read today. Rise tomorrow."));
    assert.ok(words.includes("Reading, writing and vocabulary at the right level for every student."));
    assert.ok(words.includes("Welcome back!") && words.includes("Who's signing in today?"));
    for (const r of ["Student", "Teacher", "Admin"]) assert.match(html, new RegExp(`type="radio"[^>]*value="${r}"`), r);
    const form = html.match(/<form[^>]*>/)![0];
    assert.match(form, /action="\/login\/submit"/);
    assert.match(form, /method="post"/);
    assert.match(html, /name="username"/);
    assert.match(html, /name="password"[^>]*type="password"|type="password"[^>]*name="password"/);
    assert.match(html, /placeholder="Your student username"/, "Student is chosen first");
    assert.ok(words.includes("Let's go"));
    // the button names no role: just "Let's go" with the arrow
    assert.doesNotMatch(words, /Let's go, (Student|Teacher|Admin)/);
    assert.ok(words.includes("Literise · Al-Anjal Private Schools"));
    // the crisp vector school logo (SchoolLogo), not the blurry uploaded image
    assert.match(html, /role="img" aria-label="Al-Anjal Private Schools, since 1985"/);
    assert.doesNotMatch(html, /src="\/api\/school-logo"/);
    assert.ok(existsSync(join(ROOT, "src/app/login/submit/route.ts")));
  });

  test("no level words for students, no accreditation strip, no 'Keep me signed in' (not supported)", () => {
    for (const lang of ["en", "ar"] as Lang[]) {
      const words = text(renderPage(lang));
      assert.doesNotMatch(words, /\bBelow\b|On level|\bAbove\b|\bTier\b|\bRTI\b/i, lang);
      assert.doesNotMatch(words, /NCSEE|Tamayuz|Cognia|Accredit/i, lang);
      assert.doesNotMatch(words, /Keep me signed in/i, lang);
    }
  });

  test("the role tiles only change wording; every role has its own placeholder and help line; one plain \"Let's go\" button", () => {
    assert.deepEqual(SIGN_IN_ROLES.map((r) => r.who), ["Student", "Teacher", "Admin"]);
    assert.equal(new Set(SIGN_IN_ROLES.map((r) => r.placeholder)).size, 3);
    // the tiles never reach the server as a role: the sign-in route reads only username, password and next
    const route = read("src/app/login/submit/route.ts");
    assert.doesNotMatch(route, /signin-as|form\.get\("role"\)/);
  });

  test("existing behaviour kept: error alert, username prefill, game note, hidden next", () => {
    const html = renderPage("en", { error: "Wrong username or password.", username: "s.one", next: "/play/ABC" });
    assert.match(html, /role="alert"[^>]*>Wrong username or password\./);
    assert.match(html, /value="s\.one"/);
    assert.match(html, /type="hidden" name="next" value="\/play\/ABC"/);
    assert.ok(text(html).includes("Sign in to join the game."));
  });

  test("Arabic: every new string is translated and 'Literise' stays in Latin letters", () => {
    const html = renderPage("ar");
    const words = text(html);
    assert.ok(words.includes("Literise"));
    assert.ok(words.includes("مرحبًا بعودتك!"));
    assert.ok(words.includes("اقرأ اليوم، وارتقِ غدًا."));
    assert.ok(words.includes("هيا بنا"));
    const keys = ["Read today. Rise tomorrow.", "Reading, writing and vocabulary at the right level for every student.", "Welcome back!", "Who's signing in today?", "Enter your password", "Al-Anjal Private Schools",
      ...SIGN_IN_ROLES.flatMap((r) => [r.who, r.placeholder, r.help]), "Let's go"];
    for (const k of keys) {
      assert.ok((UI_STRINGS as readonly string[]).includes(k), `en.ts: ${k}`);
      assert.ok((ar as Record<string, string>)[k], `ar.ts: ${k}`);
    }
    for (const v of Object.values(ar)) assert.doesNotMatch(v, /ليتررايز|ليترايز/);
  });
});

describe("Literise brand everywhere the platform names itself", () => {
  test("logo component and static logo files", () => {
    const html = renderToStaticMarkup(h(LiteriseLogo, { tone: "dark" }));
    assert.ok(html.includes(LITERISE));
    assert.equal((html.match(/<rect/g) ?? []).length, 4, "four rising bars");
    for (const f of ["literise-logo-on-light.svg", "literise-logo-on-dark.svg", "literise-mark.svg"]) assert.ok(existsSync(join(ROOT, "public/brand", f)), f);
  });

  test("shell, metadata, manifest, print and offline page say Literise; the school logo stays", () => {
    const shell = read("src/components/app-shell.tsx");
    assert.match(shell, /<LiteriseLogo/);
    assert.match(shell, /<SchoolLogo size="sm"/, "the vector school logo in the top bar");
    assert.ok(existsSync(join(ROOT, "public/brand/al-anjal-logo.svg")), "static school logo for e-mails and PDFs");
    assert.ok(existsSync(join(ROOT, "src/app/api/school-logo/route.ts")), "uploaded logos still served");
    assert.doesNotMatch(shell, /Al-Anjal<br \/>English/);
    assert.match(read("src/app/layout.tsx"), /default: "Literise", template: "%s · Literise"/);
    const manifest = JSON.parse(read("public/manifest.webmanifest"));
    assert.equal(manifest.name, "Literise");
    assert.equal(manifest.short_name, "Literise");
    assert.equal(PLATFORM, "Literise");
    assert.match(read("public/offline.html"), /<title>Offline · Literise<\/title>/);
  });

  test("no 'Al-Anjal English' left as the platform name; no accreditation anywhere", () => {
    const src = [...files(join(ROOT, "src")), ...files(join(ROOT, "public"))].filter((f) => /\.(tsx?|css|html|js|json|webmanifest|svg)$/.test(f));
    const oldName = src.filter((f) => /Al-Anjal English|Al-<i>Anjal<\/i>/.test(readFileSync(f, "utf8"))).map((f) => relative(ROOT, f));
    assert.deepEqual(oldName, []);
    const accred = src.filter((f) => /NCSEE|Tamayuz|Cognia|Accredit/i.test(readFileSync(f, "utf8"))).map((f) => relative(ROOT, f));
    assert.deepEqual(accred, []);
    assert.ok(!existsSync(join(ROOT, "public/brand/ncsee.png")) && !existsSync(join(ROOT, "public/brand/cognia.png")));
  });
});

describe("page files export only Next.js page fields (a stray export breaks next build)", () => {
  const ALLOWED = new Set(["default", "metadata", "generateMetadata", "generateStaticParams", "generateViewport", "viewport", "dynamic", "dynamicParams", "revalidate", "fetchCache", "runtime", "preferredRegion", "maxDuration", "experimental_ppr"]);
  test("every src/app/**/page.tsx and layout.tsx", () => {
    const bad: string[] = [];
    for (const f of files(join(ROOT, "src/app")).filter((x) => /\/(page|layout)\.tsx?$/.test(x))) {
      const s = readFileSync(f, "utf8");
      for (const m of s.matchAll(/^export\s+(?:async\s+)?(?:const|let|var|function|class|type|interface|enum)\s+(\w+)/gm)) {
        if (/^export\s+(type|interface)\b/.test(m[0])) continue;
        if (!ALLOWED.has(m[1])) bad.push(`${relative(ROOT, f)}: ${m[1]}`);
      }
      for (const m of s.matchAll(/^export\s*\{([^}]*)\}/gm)) for (const n of m[1].split(",").map((x) => x.trim().split(/\s+as\s+/).pop()!).filter(Boolean)) if (!ALLOWED.has(n)) bad.push(`${relative(ROOT, f)}: ${n}`);
    }
    assert.deepEqual(bad, []);
  });
});
