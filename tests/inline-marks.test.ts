/**
 * r72 — "look at the underlined word": emphasis marks in question text (<u>…</u>, **bold**, *italic* …) are shown as
 * real underline / bold / italic everywhere (React elements, never raw HTML), read aloud and analysed as plain text,
 * and kept by the Excel question import. Unknown or unmatched markup stays visible plain text (no XSS).
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { deflateRawSync } from "node:zlib";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { parseMarks, stripMarks, marksToHtml, hasMarks } from "../src/lib/inline-marks";
import { normalizeSpeech, questionSpeech } from "../src/lib/tts/text";
import { plainPassage } from "../src/lib/passage";
import { needsPassage } from "../src/lib/passage-detect";
import { carriesOwnText } from "../src/lib/missing-passage";
import { markedTextOf, readXlsx } from "../src/imports/xlsx";
import type { ClientQuestion } from "../src/server/practice/items";
import type { TestReview } from "../src/server/tests/assessments";

// next/link is not loadable outside Next: a plain <a> stands in for the static render (as tests/practice-no-pressure.test.ts)
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Module = require("node:module") as { _resolveFilename: (r: unknown, ...x: unknown[]) => string; _cache: Record<string, unknown> };
const orig = Module._resolveFilename;
Module._resolveFilename = function (this: unknown, r: unknown, ...x: unknown[]) { return r === "next/link" ? "stub:next/link" : r === "@/app/explain/actions" ? "stub:explain" : orig.call(this, r, ...x); };
// the "Explain" server action (a Next.js server module) is not part of this static render
Module._cache["stub:explain"] = { id: "explain", filename: "explain", loaded: true, children: [], paths: [], exports: { __esModule: true, explainAction: async () => ({}) } };
Module._cache["stub:next/link"] = { id: "next/link", filename: "next/link", loaded: true, children: [], paths: [], exports: { __esModule: true, default: ({ href, children, prefetch: _p, ...rest }: { href: string; children?: unknown; prefetch?: unknown }) => React.createElement("a", { href, ...rest }, children as never) } };
(globalThis as Record<string, unknown>).React ??= React; // the classic JSX of the components under tsx
const h = React.createElement;

describe("parseMarks: the accepted emphasis marks", () => {
  test("underline in every written form", () => {
    for (const s of ["Look at the <u>quick</u> fox", "Look at the <U>quick</U> fox", "Look at the [u]quick[/u] fox", "Look at the {u}quick{/u} fox", "Look at the __quick__ fox", "Look at the &lt;u&gt;quick&lt;/u&gt; fox"])
      assert.deepEqual(parseMarks(s), ["Look at the ", { mark: "u", children: ["quick"] }, " fox"], s);
  });
  test("bold and italic", () => {
    for (const s of ["The babies **hatch** now", "The babies <b>hatch</b> now", "The babies <strong>hatch</strong> now", "The babies [b]hatch[/b] now"])
      assert.deepEqual(parseMarks(s), ["The babies ", { mark: "b", children: ["hatch"] }, " now"], s);
    for (const s of ["or *dromedary*, has", "or <em>dromedary</em>, has", "or <i>dromedary</i>, has"])
      assert.deepEqual(parseMarks(s), ["or ", { mark: "i", children: ["dromedary"] }, ", has"], s);
  });
  test("nesting", () => {
    assert.deepEqual(parseMarks("<b><u>x</u> y</b>"), [{ mark: "b", children: [{ mark: "u", children: ["x"] }, " y"] }]);
    assert.deepEqual(parseMarks("**the <u>big</u> dog**"), [{ mark: "b", children: ["the ", { mark: "u", children: ["big"] }, " dog"] }]);
  });
  test("unmatched or crossed marks are shown as typed, never half applied", () => {
    for (const s of ["<u>no close", "no open</u>", "**open only", "a ** b", "close*"]) assert.equal(stripMarks(s), s, s);
    assert.deepEqual(parseMarks("<u>no close"), ["<u>no close"]);
    assert.equal(stripMarks("<b><u>x</b></u>").includes("x"), true);
  });
  test("blanks, maths and snake_case are not marks", () => {
    for (const s of ["You can ____ walk ____ ride.", "Fill in: The dog ___ fast.", "2 * 3 * 4 = 24", "file_name_here", "__________"])
      assert.deepEqual(parseMarks(s), [s], s);
  });
  test("XSS: tags with attributes, scripts and other HTML stay plain text", () => {
    for (const s of ['<u onclick="alert(1)">x</u>', "<script>alert(1)</script>", '<img src=x onerror="alert(1)">', "<a href='javascript:alert(1)'>x</a>"])
      assert.deepEqual(parseMarks(s), [s], s);
    assert.equal(marksToHtml('<u onclick="alert(1)">x</u>'), "&lt;u onclick=&quot;alert(1)&quot;&gt;x&lt;/u&gt;");
    assert.equal(marksToHtml("<script>alert(1)</script>"), "&lt;script&gt;alert(1)&lt;/script&gt;");
    assert.equal(marksToHtml("<u><script>x</script></u> & **b**"), "<u>&lt;script&gt;x&lt;/script&gt;</u> &amp; <strong>b</strong>");
  });
  test("stripMarks / hasMarks", () => {
    assert.equal(stripMarks("Which word means the same as <u>timid</u>?"), "Which word means the same as timid?");
    assert.equal(stripMarks("The **astrolabe** and *Book of Optics*"), "The astrolabe and Book of Optics");
    assert.equal(hasMarks("plain text"), false);
    assert.equal(stripMarks(null as unknown as string), "");
  });
});

describe("read aloud and detectors see the plain text", () => {
  test("speech text has no marks (blanks still read as blank)", () => {
    assert.equal(normalizeSpeech("The <u>quick</u> fox ____ ran"), "The quick fox blank ran");
    assert.equal(questionSpeech("Which word is **bold**?", [{ label: "A", text: "<u>hatch</u>" }]), "Which word is bold?. A. hatch");
    assert.equal(plainPassage("## Turtles\nThe babies **hatch** at night."), "Turtles\nThe babies hatch at night.");
  });
  test("the self-contained / missing-passage detectors ignore the marks", () => {
    assert.equal(needsPassage("What does the underlined word mean in the sentence? “The <u>timid</u> cat hid.”"), needsPassage("What does the underlined word mean in the sentence? “The timid cat hid.”"));
    assert.equal(needsPassage("Read the sentence. What does the <u>underlined word</u> mean?"), false);
    const long = `"${Array.from({ length: 12 }, (_, i) => `w${i}`).join(" ")}"`;
    assert.equal(carriesOwnText(long.replace("w3", "<u>w3</u>")), carriesOwnText(long));
  });
});

describe("Excel question import keeps underlined / bold runs", () => {
  test("markedTextOf: runs become <u>/<b>, plain cells unchanged", () => {
    assert.equal(markedTextOf('<r><t xml:space="preserve">Look at the </t></r><r><rPr><u/><sz val="11"/></rPr><t>quick</t></r><r><t xml:space="preserve"> fox.</t></r>'), "Look at the <u>quick</u> fox.");
    assert.equal(markedTextOf('<r><rPr><b/></rPr><t xml:space="preserve">hatch </t></r><r><t>now</t></r>'), "<b>hatch</b> now");
    assert.equal(markedTextOf('<r><rPr><u val="none"/></rPr><t>no</t></r><r><t> line</t></r>'), "no line");
    assert.equal(markedTextOf("<t>plain</t>"), "plain");
    assert.equal(markedTextOf('<r><rPr><u/></rPr><t>ha</t></r><r><rPr><u/></rPr><t>ppy</t></r>'), "<u>happy</u>");
  });
  test("readXlsx keeps the marks only when asked (question import), other imports stay plain", () => {
    const files: Record<string, string> = {
      "xl/workbook.xml": '<workbook><sheets><sheet name="Questions" r:id="rId1"/></sheets></workbook>',
      "xl/_rels/workbook.xml.rels": '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>',
      "xl/sharedStrings.xml": '<sst><si><r><t xml:space="preserve">What does </t></r><r><rPr><u/></rPr><t>timid</t></r><r><t xml:space="preserve"> mean?</t></r></si></sst>',
      "xl/worksheets/sheet1.xml": '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c></row></sheetData></worksheet>',
    };
    const buf = zip(files);
    assert.deepEqual(readXlsx(buf, { marks: true }), [["What does <u>timid</u> mean?"]]);
    assert.deepEqual(readXlsx(buf), [["What does timid mean?"]]);
  });
});

describe("screens: real underline / bold, never the code", () => {
  const q = (over: Partial<ClientQuestion>): ClientQuestion => ({ questionId: "q1", type: "MULTIPLE_CHOICE", stem: "What does the <u>underlined</u> word mean?", level: 4, passage: null, image: null, options: [{ label: "A", text: "very **shy**" }, { label: "B", text: "<script>alert(1)</script>" }], hasHint: false, ...over } as ClientQuestion);

  test("practice player: stem, options, passage, hot text, dropdown", async () => {
    const { I18nProvider } = await import("../src/i18n/client");
    const { QuizQuestion } = await import("../src/components/practice/quiz-question");
    const html = renderToStaticMarkup(h(I18nProvider, { lang: "en" }, h(QuizQuestion, { q: q({ passage: { title: "**Turtles**", text: "The babies **hatch** at night.\n\nThey run to the <u>sea</u>." } as ClientQuestion["passage"] }), value: null, onChange: () => {}, disabled: false })));
    assert.match(html, /What does the <u class="underline decoration-2 underline-offset-4">underlined<\/u> word mean\?/);
    assert.match(html, /very <strong class="font-bold">shy<\/strong>/);
    assert.match(html, /The babies <strong class="font-bold">hatch<\/strong> at night\./);
    assert.match(html, /<u class="underline decoration-2 underline-offset-4">sea<\/u>/);
    assert.ok(!html.includes("&lt;u&gt;") && !html.includes("**"), "no raw marks on screen");
    assert.ok(html.includes("&lt;script&gt;alert(1)&lt;/script&gt;") && !html.includes("<script>"), "other HTML is shown as text");

    const { AnswerInput } = await import("../src/components/practice/answer-input");
    const hot = renderToStaticMarkup(h(AnswerInput, { q: q({ type: "HOT_TEXT", hot: { maxSelect: 1, segments: [{ id: "s1", text: "**Bleaching** occurs." }, { id: "s2", text: "Corals *recover*." }] } } as Partial<ClientQuestion>), value: null, onChange: () => {}, disabled: false }));
    assert.match(hot, /<strong class="font-bold">Bleaching<\/strong> occurs\./);
    assert.match(hot, /<em class="italic">recover<\/em>/);
    const dd = renderToStaticMarkup(h(AnswerInput, { q: q({ type: "DROPDOWN", stem: "The <u>dog</u> ____ fast.", options: [{ label: "A", text: "<u>ran</u>" }] }), value: null, onChange: () => {}, disabled: false }));
    assert.match(dd, /The <u class="underline decoration-2 underline-offset-4">dog<\/u> /);
    assert.match(dd, /<option value="A">ran<\/option>/, "a <select> option cannot hold formatting: plain text");
  });

  test("feedback panel: why / answers / tip", async () => {
    const { FeedbackPanel } = await import("../src/components/practice/feedback-panel");
    const html = renderToStaticMarkup(h(FeedbackPanel, { fb: { correct: true, credit: 1, yourAnswer: "A. very **shy**", correctAnswer: "A. very **shy**", whyCorrect: "<u>Timid</u> means shy.", whyYoursIsWrong: null, tip: "Look at the **clue**.", rapidGuess: false, masteryBefore: 50, masteryAfter: 55, band: "APPROACHING", xp: 5, next: { hasQuestion: true, endReason: null, routeToSkillId: null, routeToSkillName: null } } as never }));
    assert.match(html, /<u class="underline decoration-2 underline-offset-4">Timid<\/u> means shy\./);
    assert.match(html, /<strong class="font-bold">clue<\/strong>/);
  });

  test("teacher review of a student's test", async () => {
    const { I18nProvider } = await import("../src/i18n/client");
    const { TestReviewView } = await import("../src/components/tests/test-review-view");
    const r = { assignmentId: "a1", title: "Unit test", tag: "TEST", student: "Sara", correct: 0, total: 1, pct: 0, completedAt: null,
      items: [{ questionId: "q1", n: 1, skill: "Vocabulary", passageTitle: null, stem: "What does the <u>underlined</u> word mean?", answered: true, yourAnswer: "**brave**", correctAnswer: "shy", correct: false, why: "[u]Timid[/u] means shy." }] } as unknown as TestReview;
    const html = renderToStaticMarkup(h(I18nProvider, { lang: "en" }, h(TestReviewView, { r, backHref: "/x", backLabel: "Back" })));
    assert.match(html, /the <u class="underline decoration-2 underline-offset-4">underlined<\/u> word/);
    assert.match(html, /<strong class="font-bold">brave<\/strong>/);
    assert.match(html, /<u class="underline decoration-2 underline-offset-4">Timid<\/u> means shy\./);
    assert.ok(!html.includes("[u]") && !html.includes("&lt;u&gt;"));
  });

  test("printed worksheets / PDFs: passages render the marks; HTML templates get escaped text with <u>/<strong> only", async () => {
    const { PassageText } = await import("../src/components/passage-text");
    const html = renderToStaticMarkup(h(PassageText, { text: "## The <u>Desert</u>\nThe camel stores **fat**.\nFIG: Diagram | A *hump* | fat → energy" }));
    assert.match(html, /<h3[^>]*>The <u class="underline decoration-2 underline-offset-4">Desert<\/u><\/h3>/);
    assert.match(html, /The camel stores <strong class="font-bold">fat<\/strong>\./);
    assert.match(html, /<em class="italic">hump<\/em>/);
    assert.equal(marksToHtml("Look at the <u>quick</u> fox & the **dog** <i>now</i>"), "Look at the <u>quick</u> fox &amp; the <strong>dog</strong> <em>now</em>");
    assert.equal(marksToHtml('"5 < 6" & <u>it\'s</u>'), "&quot;5 &lt; 6&quot; &amp; <u>it&#39;s</u>");
  });
});

/** A minimal stored (uncompressed) zip — enough for readXlsx. */
function zip(files: Record<string, string>): Buffer {
  const parts: Buffer[] = [], central: Buffer[] = [];
  let off = 0;
  for (const [name, text] of Object.entries(files)) {
    const data = deflateRawSync(Buffer.from(text, "utf8")), raw = Buffer.from(text, "utf8"), nm = Buffer.from(name);
    const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(8, 8); local.writeUInt32LE(0, 14); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(raw.length, 22); local.writeUInt16LE(nm.length, 26);
    parts.push(local, nm, data);
    const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(8, 10); c.writeUInt32LE(data.length, 20); c.writeUInt32LE(raw.length, 24); c.writeUInt16LE(nm.length, 28); c.writeUInt32LE(off, 42);
    central.push(c, nm);
    off += 30 + nm.length + data.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(Object.keys(files).length, 8); end.writeUInt16LE(Object.keys(files).length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(off, 16);
  return Buffer.concat([...parts, cd, end]);
}
