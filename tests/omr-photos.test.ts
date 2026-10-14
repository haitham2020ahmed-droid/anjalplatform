/**
 * 📷 Bubble sheets from REAL-looking phone photos (tests/helpers/omr-photo.ts): pencil marks as children make them
 * (full, partly filled, light, scribbled, over the edge, ticks, erased, erased and changed, double, stray dots) on a
 * sheet lying on a table, photographed at up to ±15° (and sideways / upside down), in perspective, with a page curl,
 * uneven light, a hard shadow, blur, noise and JPEG compression. The reader must never GUESS: every row is read right
 * or flagged "check" — a confidently wrong answer is a failure. Also: the sheet's confidence, and the one-page
 * "Bubble sheet trial" (sample test of 20 answers + key). Synthetic images only.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { encodeSheetCode, sheetLayout } from "../src/lib/omr/layout";
import { decideRow, readSheet, sheetQuality, type OmrRow } from "../src/lib/omr/read";
import { compareTrial, TRIAL_KEY, trialCode, trialLayout } from "../src/lib/omr/trial";
import { fillSheet, fits, photograph, renderSheet, rng, type Camera, type PencilMark } from "./helpers/omr-photo";
import { UI_STRINGS } from "../src/i18n/en";
import { ar } from "../src/i18n/ar";

const ROOT = join(__dirname, "..");
const read = (f: string) => readFileSync(join(ROOT, f), "utf8");

interface Tally { sheets: number; failed: number; codes: number; rows: number; right: number; wrong: number; flagged: number; byKind: Map<string, { n: number; right: number; wrong: number; flagged: number }>; misses: string[]; ms: number[]; confidence: Record<string, number> }
const total: Tally = { sheets: 0, failed: 0, codes: 0, rows: 0, right: 0, wrong: 0, flagged: 0, byKind: new Map(), misses: [], ms: [], confidence: { HIGH: 0, MEDIUM: 0, LOW: 0 } };

async function shoot(name: string, n: number, seed: number, cam: Omit<Camera, "seed">, mix?: Parameters<typeof fillSheet>[2], tally: Tally = total) {
  const layout = sheetLayout(n);
  const code = encodeSheetCode({ testId: String(200 + (seed % 900)), studentId: String(seed % 999) });
  const { marks, truth } = fillSheet(n, seed, mix);
  const img = await photograph(renderSheet(layout, code, marks, seed), { ...cam, seed });
  const t0 = performance.now();
  const res = readSheet(img, layout);
  tally.ms.push(performance.now() - t0);
  tally.sheets++;
  if (!res.ok) { tally.failed++; tally.misses.push(`${name}: ${res.error}`); return res; }
  if (res.code === code) tally.codes++;
  tally.confidence[res.quality!.confidence]++;
  for (const row of res.rows) {
    const tr = truth.get(row.q)!;
    const k = tally.byKind.get(tr.kind) ?? { n: 0, right: 0, wrong: 0, flagged: 0 };
    k.n++; tally.rows++;
    if (row.status === "UNSURE" || row.status === "MULTIPLE") { k.flagged++; tally.flagged++; }
    else if (row.status === "OK" ? row.answer === tr.answer && !tr.multiple : tr.answer === null && !tr.multiple) { k.right++; tally.right++; }
    else { k.wrong++; tally.wrong++; tally.misses.push(`${name} q${row.q} ${tr.kind}: read ${row.answer}/${row.status} fill[${row.fill.join(" ")}] want ${tr.answer}`); }
    tally.byKind.set(tr.kind, k);
  }
  // the sheet's "check these" list is exactly its flagged rows
  assert.deepEqual(res.quality!.check, res.rows.filter((r) => r.status === "UNSURE" || r.status === "MULTIPLE").map((r) => r.q), `${name}: check list`);
  return res;
}

describe("📷 bubble sheets from realistic phone photos", () => {
  test("sweep: 36 photos — ±15° (and sideways / upside down), tilt, curl, light, hard shadows, blur, noise, JPEG 45–90", async () => {
    const r = rng(57);
    for (let i = 0; i < 36; i++) {
      const land = i % 9 === 4, flip = i % 9 === 7;
      const W = land ? 2000 : 1500, H = land ? 1500 : 2000;
      const rot = (r() * 2 - 1) * 15 + (land ? 90 : flip ? 180 : 0);
      await shoot(`sweep ${i}`, [20, 30, 40, 60][i % 4], 3000 + i, {
        W, H, rot, fill: Math.min(0.6 + r() * 0.3, fits(W, H, rot)), tilt: r() * 0.12, curl: r() * 2.5, light: r() * 0.6, shadow: r() < 0.5 ? r() * 0.6 : 0,
        blur: Math.floor(r() * 4), noise: 3 + r() * 12, jpeg: 45 + Math.floor(r() * 46), cx: 0.45 + r() * 0.1, cy: 0.45 + r() * 0.1,
      });
    }
    assert.equal(total.failed, 0, total.misses.join("\n"));
  });

  test("the hard conditions one by one: each read with no confident error", async () => {
    const base = { W: 1500, H: 2000, fill: 0.78, tilt: 0.04, curl: 0, light: 0.2, shadow: 0, blur: 1, noise: 6, jpeg: 80, cx: 0.5, cy: 0.5 };
    const cases: [string, Partial<Camera>][] = [
      ["15° + strong tilt", { rot: 15, tilt: 0.12, fill: 0.7 }],
      ["−15° + page curl", { rot: -15, curl: 3, fill: 0.7 }],
      ["hard shadow across the sheet", { rot: 4, shadow: 0.6, light: 0.5 }],
      ["blurred + JPEG 45", { rot: -6, blur: 3, jpeg: 45, noise: 10 }],
      ["sideways (landscape photo)", { rot: 97, W: 2000, H: 1500, fill: 0.8 }],
      ["upside down", { rot: 183, fill: 0.8 }],
      ["dim room, warm light, noisy", { rot: 8, light: 0.65, noise: 14, jpeg: 60 }],
      ["small in the frame (far away)", { rot: -9, fill: 0.55, jpeg: 70 }],
    ];
    let k = 0;
    for (const [name, c] of cases) {
      const before = total.wrong;
      const res = await shoot(name, 40, 5000 + k++, { ...base, rot: 0, ...c } as Omit<Camera, "seed">, { light: 0.1, erasedOnly: 0.06, erasedRemark: 0.08, tick: 0.04 });
      assert.equal(res.ok, true, `${name}: ${res.error}`);
      assert.equal(total.wrong, before, `${name}: confident errors\n${total.misses.slice(-5).join("\n")}`);
    }
  });

  test("accuracy: never a confident wrong answer; ≥ 93 % of rows read without asking; doubles and ticks always asked", () => {
    const pct = (a: number, b: number) => `${((100 * a) / Math.max(1, b)).toFixed(1)} %`;
    console.log(`OMR photos: ${total.sheets} sheets, ${total.failed} failed, codes ${total.codes}/${total.sheets}; rows ${total.rows}: right ${total.right} (${pct(total.right, total.rows)}), asked to check ${total.flagged} (${pct(total.flagged, total.rows)}), WRONG ${total.wrong}`);
    console.log(`  sheet confidence: HIGH ${total.confidence.HIGH} · MEDIUM ${total.confidence.MEDIUM} · LOW ${total.confidence.LOW}; read time median ${total.ms.sort((a, b) => a - b)[Math.floor(total.ms.length / 2)].toFixed(0)} ms`);
    for (const [kind, v] of [...total.byKind].sort((a, b) => b[1].n - a[1].n)) console.log(`  ${kind.padEnd(13)} ${String(v.n).padStart(4)} rows · right ${pct(v.right, v.n).padStart(7)} · asked ${pct(v.flagged, v.n).padStart(7)} · wrong ${v.wrong}`);
    for (const m of total.misses) console.log(`  miss: ${m}`);
    assert.equal(total.wrong, 0, "the reader never guesses: every row is right or flagged");
    assert.ok(total.right / total.rows >= 0.93, `rows read without asking: ${pct(total.right, total.rows)}`);
    assert.ok(total.codes >= total.sheets - 1, "the sheet code is read");
    const g = (k: string) => total.byKind.get(k) ?? { n: 0, right: 0, wrong: 0, flagged: 0 };
    assert.equal(g("double").flagged, g("double").n, "two marks: always asked");
    assert.equal(g("tick").flagged + g("tick").right, g("tick").n, "a tick is never read as blank");
    assert.equal(g("erasedOnly").right + g("erasedOnly").flagged, g("erasedOnly").n, "an erased mark is never an answer");
    for (const k of ["full", "partial", "scribble", "over", "erasedRemark", "dot"]) assert.ok(g(k).right / Math.max(1, g(k).n) >= 0.98, `${k}: ${pct(g(k).right, g(k).n)} read`);
    assert.ok(g("light").right / Math.max(1, g("light").n) >= 0.4, "most light pencil marks are read; the rest are asked");
  });

  test("decisions on measured rows: smudge = blank, line = ask, light alone = answer (lower confidence)", () => {
    const row = (fill: number[], dark: number[], peak: number[]): OmrRow => decideRow(1, fill, dark, 0.11, 0.81, peak);
    const smudge = row([0.24, 0.11, 0.11, 0.12], [0, 0, 0, 0], [0.42, 0.37, 0.38, 0.37]);
    assert.equal(smudge.status, "BLANK");
    const tick = row([0.27, 0.11, 0.12, 0.11], [0.01, 0, 0, 0], [0.62, 0.38, 0.37, 0.38]);
    assert.equal(tick.status, "UNSURE"); assert.equal(tick.suggest, 0);
    const light = row([0.11, 0.12, 0.43, 0.11], [0, 0, 0.6, 0], [0.38, 0.37, 0.7, 0.38]);
    assert.equal(light.status, "OK"); assert.equal(light.answer, 2); assert.ok(light.confidence! < 0.8);
    const clear = row([0.12, 0.85, 0.11, 0.12], [0, 0.95, 0, 0], [0.38, 0.95, 0.37, 0.38]);
    assert.equal(clear.status, "OK"); assert.ok(clear.confidence! > 0.8);
    const two = row([0.8, 0.12, 0.82, 0.11], [0.9, 0, 0.9, 0], [0.9, 0.37, 0.9, 0.38]);
    assert.equal(two.status, "MULTIPLE"); assert.equal(two.answer, null);
  });

  test("sheet confidence: HIGH when clear, MEDIUM with a few to check, LOW for a poor photo or many unsure rows", async () => {
    const ok = (q: number): OmrRow => ({ q, answer: 1, marks: [1], status: "OK", fill: [], confidence: 0.95 });
    const m = { edgeMm: 0.5, ink: 0.06, edge: 0.3, lost: 0, spread: 0.7 };
    assert.equal(sheetQuality([ok(1), ok(2)], m).confidence, "HIGH");
    const some = sheetQuality([ok(1), { ...ok(2), status: "UNSURE", confidence: 0.3 }, ...Array.from({ length: 18 }, (_, i) => ok(i + 3))], m);
    assert.equal(some.confidence, "MEDIUM"); assert.deepEqual(some.check, [2]);
    assert.equal(sheetQuality([ok(1)], { ...m, edgeMm: 1.4 }).confidence, "LOW");
    assert.deepEqual(sheetQuality([ok(1)], { ...m, edgeMm: 1.4 }).reasons, ["BLUR"]);
    assert.equal(sheetQuality(Array.from({ length: 10 }, (_, i) => ({ ...ok(i + 1), status: i < 3 ? "UNSURE" as const : "OK" as const })), m).confidence, "LOW");
    // a really blurred photo is refused or read with LOW confidence — never HIGH
    const layout = sheetLayout(20);
    const { marks } = fillSheet(20, 77);
    const res = readSheet(await photograph(renderSheet(layout, encodeSheetCode({ testId: "9", studentId: "1" }), marks, 77), { W: 1300, H: 1800, rot: 5, fill: 0.85, tilt: 0.03, curl: 0, light: 0.3, shadow: 0, blur: 6, noise: 6, jpeg: 70, seed: 77 }), layout);
    assert.ok(!res.ok || res.quality!.confidence === "LOW", `blurred: ${res.error ?? res.quality!.confidence}`);
  });

  test("the Bubble sheet trial: filled as its key says (light, erased, empty, double on purpose), photographed, checked", async () => {
    const layout = trialLayout();
    const marks = new Map<string, PencilMark>();
    for (const k of TRIAL_KEY) {
      if (k.how === "BLANK" || k.answer === null) continue;
      if (k.how === "LIGHT") marks.set(`${k.q}:${k.answer}`, "light");
      else if (k.how === "ERASE_CHANGE") { marks.set(`${k.q}:${k.erase}`, "erased"); marks.set(`${k.q}:${k.answer}`, "full"); }
      else if (k.how === "TWO") { marks.set(`${k.q}:${k.answer}`, "full"); marks.set(`${k.q}:${k.second}`, "full"); }
      else marks.set(`${k.q}:${k.answer}`, "full");
    }
    for (const [i, cam] of ([{ rot: 6, jpeg: 75, shadow: 0.3 }, { rot: -12, jpeg: 55, blur: 2, tilt: 0.09 }, { rot: 178, jpeg: 85 }] as Partial<Camera>[]).entries()) {
      const img = await photograph(renderSheet(layout, trialCode(), marks, 90 + i), { W: 1500, H: 2000, rot: 0, fill: 0.75, tilt: 0.04, curl: 1, light: 0.3, shadow: 0, blur: 1, noise: 7, jpeg: 80, seed: 90 + i, ...cam });
      const c = compareTrial(readSheet(img, layout));
      assert.equal(c.ok, true);
      assert.equal(c.codeOk, true);
      assert.equal(c.wrong, 0, JSON.stringify(c.rows.filter((r) => r.verdict === "WRONG")));
      assert.ok(c.right >= 19, `right ${c.right}`);
      assert.equal(c.rows.find((r) => r.how === "TWO")!.verdict, "RIGHT", "the double mark is asked about");
      assert.equal(c.rows.find((r) => r.how === "BLANK")!.status, "BLANK");
    }
    assert.equal(TRIAL_KEY.length, 20);
    assert.equal(compareTrial({ ok: false, error: "NO_MARKERS", code: null, rows: [] }).ok, false);
  });

  test("review screen and saving: unsure rows start with NO answer, nothing uncertain is saved without the teacher; trial page in place", () => {
    const g = read("src/components/nafs/grade-sheets.tsx");
    assert.match(g, /answers: rows\.map\(\(x\) => \(x && x\.status === "OK" \? x\.answer : null\)\)/, "only clear rows are pre-filled");
    assert.match(g, /disabled=\{busy \|\| !cur\.studentId \|\| cur\.wrongTest \|\| unresolved > 0 \|\| \(low && !cur\.checkedAll\)\}/);
    assert.match(g, /<SheetConfidenceNote /);
    const a = read("src/app/teacher/nafs/actions.ts");
    assert.match(a, /if \(!r \|\| Number\(r\.unresolved\) > 0\) return \{ error:/, "the server refuses a photo read with answers still to check");
    assert.match(a, /r\.confidence === "LOW" && r\.checkedAll !== true/);
    const p = read("src/app/teacher/nafs/trial/page.tsx");
    assert.match(p, /requireActor\(\{ roles: \["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"\] \}\)/);
    assert.match(p, /<AnswerSheet /); assert.match(p, /<TrialCheck /); assert.match(p, /<PrintButton /);
    assert.equal((p.match(/^export /gm) ?? []).length, 2, "page files export only Next page fields");
    assert.match(read("src/components/nafs/sheets-tab.tsx"), /href="\/teacher\/nafs\/trial"[\s\S]*Print a trial sheet/);
    for (const k of ["Print a trial sheet", "Bubble sheet trial", "Check my photo", "Check these answers:", "No answer", "I checked every answer against the paper.", "Low confidence: check every answer, or take the photo again.", "Fill it LIGHTLY (a soft pencil touch)", "Fill TWO bubbles: {a} and {b}"]) {
      assert.ok((UI_STRINGS as readonly string[]).includes(k), k);
      assert.ok(ar[k as keyof typeof ar] && ar[k as keyof typeof ar] !== k, `Arabic: ${k}`);
    }
  });
});
