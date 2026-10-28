/**
 * NWEA “Class Profile” PDF parser (src/server/map/class-profile.ts): the “Instructional Area Details by
 * Student—Growth” table → per-student rows, using fake PdfItem[][] fixtures (no real PDF needed) so the row
 * extraction / column-assignment / legend-clipping / cross-page state machine are each checked on their own.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pdfPages, type PdfItem } from "../src/server/map/asg";
import { classProfileToTable, parseClassProfile } from "../src/server/map/class-profile";
import { MAP_TEMPLATE_HEADERS } from "../src/server/map/student-map";

function it(s: string, x: number, y: number): PdfItem { return { s, x, y }; }

describe("Class Profile PDF → MAP scores", () => {
  test("Reading: heading/class/term detection, name join, ordinal column assignment, Lexile mid, legend clipped", () => {
    const page: PdfItem[] = [
      it("Fall 2026-2027 Language Arts", 400, 1000),
      it("Instructional Area Details by Student—Growth: Reading 2-5 CCSS 2010 1.1", 60, 950),
      it("5A | Grade 5 | Al-Anjal Elementary | Reading", 60, 940),
      // column headers (sit well above the first real row — must be dropped)
      it("Student", 20, 900), it("Grade", 230, 900), it("Percentile", 260, 900), it("RIT", 290, 900),
      // row 1: "Doe," + "Jane" on the same line (two separate items — the common case)
      it("Doe,", 20, 800), it("Jane", 70, 800),
      it("5", 230, 800), it("11th", 260, 800), it("177", 290, 800),
      it("145L-", 320, 800), it("295L", 350, 800),
      it("178", 420, 800), it("185", 450, 800), it("167", 480, 800),
      // row 2: "Roe, Sam Lee" drawn as ONE item (the other case the parser must also handle) — BR-prefixed Lexile low side
      it("Roe, Sam Lee", 20, 780),
      it("4", 230, 780), it("1st", 260, 780), it("161", 290, 780),
      it("BR160L-", 320, 780), it("BR10L", 350, 780),
      it("156", 420, 780), it("167", 450, 780), it("161", 480, 780),
      // trailing legend row, further down the page — must be clipped out entirely
      it("Percentiles Key", 20, 700), it("1st - 20 th", 100, 700), it("21st - 40 th", 200, 700),
      it("41st - 60 th", 300, 700), it("61st - 80 th", 400, 700), it(">80th", 500, 700),
    ];
    const p = parseClassProfile([page]);
    assert.equal(p.subject, "READING");
    assert.equal(p.className, "5A");
    assert.equal(p.term, "Fall 2026-2027");
    assert.equal(p.season, "FALL");
    assert.equal(p.year, 2026);
    assert.equal(p.rows.length, 2, "the legend row must not be parsed as a 3rd student");

    const [r1, r2] = p.rows;
    assert.equal(r1.name, "Doe, Jane");
    assert.equal(r1.grade, 5);
    assert.equal(r1.percentile, 11);
    assert.equal(r1.rit, 177);
    assert.equal(r1.lexile, 220, "round((145+295)/2)");
    assert.deepEqual(r1.areas, [178, 185, 167]);

    assert.equal(r2.name, "Roe, Sam Lee", "a single merged name item is used as-is");
    assert.equal(r2.grade, 4);
    assert.equal(r2.percentile, 1);
    assert.equal(r2.rit, 161);
    assert.equal(r2.lexile, 0, "both sides BR-prefixed → treated as 0 and 0");
    assert.deepEqual(r2.areas, [156, 167, 161]);

    const t = classProfileToTable(p);
    assert.deepEqual(t[0], MAP_TEMPLATE_HEADERS);
    const col = (h: string) => MAP_TEMPLATE_HEADERS.indexOf(h);
    const row1 = t.find((r) => r[col("Student Name")] === "Doe, Jane")!;
    assert.equal(row1[col("Grade")], "5");
    assert.equal(row1[col("Reading Fall RIT")], "177");
    assert.equal(row1[col("Reading Fall Percentile")], "11");
    assert.equal(row1[col("Fall Lexile")], "220");
    assert.equal(row1[col("R: Informational Text")], "178");
    assert.equal(row1[col("R: Literary Text")], "185");
    assert.equal(row1[col("R: Vocabulary")], "167");
    assert.equal(row1[col("Language Fall RIT")], "", "Reading-only file leaves Language columns blank");
    assert.equal(row1[col("Student Number")], "", "no Student ID in this report — name-matching fallback applies");
  });

  test("Language Usage: exactly 6 tokens (no Lexile), rows rejected if the token count is off", () => {
    const page: PdfItem[] = [
      it("Instructional Area Details by Student—Growth: Language Usage 2-5 CCSS 2010 1.1", 60, 950),
      it("5A | Grade 5 | Al-Anjal Elementary | Language Usage", 60, 940),
      it("Fahad,", 20, 800), it("Abdulaziz", 70, 800),
      it("5", 230, 800), it("63rd", 260, 800), it("207", 290, 800),
      it("207", 420, 800), it("210", 450, 800), it("203", 480, 800),
      // a bad row: one extra stray token (e.g. a wrapped fragment) — must be skipped, not mis-assigned
      it("Bad,", 20, 780), it("Row", 70, 780),
      it("5", 230, 780), it("1st", 260, 780), it("150", 290, 780), it("1", 310, 780),
      it("150", 420, 780), it("150", 450, 780), it("150", 480, 780),
    ];
    const p = parseClassProfile([page]);
    assert.equal(p.subject, "LANGUAGE_USAGE");
    assert.equal(p.rows.length, 1, "the malformed row (7 tokens) is skipped, never guessed");
    assert.equal(p.rows[0].name, "Fahad, Abdulaziz");
    assert.equal(p.rows[0].lexile, null);
    assert.deepEqual(p.rows[0].areas, [207, 210, 203]);

    const t = classProfileToTable(p);
    const col = (h: string) => MAP_TEMPLATE_HEADERS.indexOf(h);
    const row = t.find((r) => r[col("Student Name")] === "Fahad, Abdulaziz")!;
    assert.equal(row[col("Language Fall RIT")], "207");
    assert.equal(row[col("L: Grammar & Usage")], "207");
    assert.equal(row[col("L: Mechanics")], "210");
    assert.equal(row[col("L: Writing")], "203");
    assert.equal(row[col("Reading Fall RIT")], "", "Language-only file leaves Reading columns blank");
  });

  test("table continues across a page break without a repeated section title (continuation pages only repeat the column header)", () => {
    const page1: PdfItem[] = [
      it("Instructional Area Details by Student—Growth: Reading 2-5 CCSS 2010 1.1", 60, 950),
      it("5A | Grade 5 | Al-Anjal Elementary | Reading", 60, 940),
      it("Abdullah,", 20, 800), it("Naif", 70, 800),
      it("5", 230, 800), it("6th", 260, 800), it("177", 290, 800),
      it("145L-", 320, 800), it("295L", 350, 800),
      it("178", 420, 800), it("185", 450, 800), it("167", 480, 800),
    ];
    const page2: PdfItem[] = [
      // only the column-header row repeats — no "Instructional Area Details…" heading on this page
      it("Student", 20, 1000), it("Grade", 230, 1000), it("Percentile", 260, 1000), it("RIT", 290, 1000),
      it("Karim,", 20, 800), it("Yazid", 70, 800),
      it("5", 230, 800), it("6th", 260, 800), it("177", 290, 800),
      it("185L-", 320, 800), it("255L", 350, 800),
      it("173", 420, 800), it("184", 450, 800), it("174", 480, 800),
      // the table ends here (NWEA's "Students with No Test Data" section follows)
      it("Students with No Test Data", 20, 700),
      it("Should,", 20, 600), it("NotParse", 70, 600),
    ];
    const p = parseClassProfile([page1, page2]);
    assert.equal(p.rows.length, 2, "the 2nd page's student row is still captured, and the row after STOP is not");
    assert.deepEqual(p.rows.map((r) => r.name), ["Abdullah, Naif", "Karim, Yazid"]);
  });

  // Haitham's real NWEA "Class Profile" PDFs (the ones this parser was built for) — the real-world regression test.
  test("real NWEA Reading Class Profile PDF (fixtures/class-profile-reading.pdf): all 19 tested students, every value", async () => {
    const bytes = readFileSync(new URL("./fixtures/class-profile-reading.pdf", import.meta.url));
    const p = parseClassProfile(await pdfPages(bytes));
    assert.equal(p.subject, "READING");
    assert.equal(p.className, "5A");
    assert.equal(p.term, "Fall 2026-2027");
    assert.equal(p.rows.length, 19, "the PDF's own header says 19 tested students");
    const naif = p.rows.find((r) => /Naif/i.test(r.name))!;
    assert.equal(naif.grade, 5);
    assert.equal(naif.percentile, 6);
    assert.equal(naif.rit, 177);
    assert.equal(naif.lexile, 220, "145L-295L midpoint");
    assert.deepEqual(naif.areas, [178, 185, 167]);
    const t = classProfileToTable(p);
    assert.equal(t.length, 20, "header + 19 students");
  });

  test("real NWEA Language Usage Class Profile PDF (fixtures/class-profile-language.pdf): all 19 tested students", async () => {
    const bytes = readFileSync(new URL("./fixtures/class-profile-language.pdf", import.meta.url));
    const p = parseClassProfile(await pdfPages(bytes));
    assert.equal(p.subject, "LANGUAGE_USAGE");
    assert.equal(p.className, "5A");
    assert.equal(p.rows.length, 19);
    const khalid = p.rows.find((r) => /Khalid/i.test(r.name))!;
    assert.equal(khalid.rit, 215);
    assert.equal(khalid.lexile, null, "Language Usage has no Lexile column");
    assert.deepEqual(khalid.areas, [209, 230, 209]);
  });
});
