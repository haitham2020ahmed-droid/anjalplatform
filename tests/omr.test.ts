/**
 * OMR reader on synthetic "photos" of printed answer sheets: the sheet is drawn at ~150 dpi into a reflectance
 * buffer, filled with pencil marks (full, partial, double, erased), then photographed: rotation, perspective,
 * background around the paper, uneven light and shadow, sensor noise, optional blur.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  decodeSheetCode, encodeSheetCode, formatSheetCode, readStripBits, sheetLayout, stripBits, ALPHABET, A4_H, A4_W, type SheetLayout,
} from "../src/lib/omr/layout";
import { readSheet, type OmrResult } from "../src/lib/omr/read";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AnswerSheet } from "../src/components/omr/answer-sheet";

// ---------------------------------------------------------------- deterministic random
function rng(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// ---------------------------------------------------------------- sheet renderer (reflectance 0..1)
type Mark = "full" | "pen" | "partial" | "light" | "sloppy";
interface Sheet { w: number; h: number; ppm: number; r: Float32Array }

function renderSheet(layout: SheetLayout, code: string, marks: Map<string, Mark>, ppm = 6, rnd = rng(1), printedQuestions = layout.questions): Sheet {
  const w = Math.round(A4_W * ppm), h = Math.round(A4_H * ppm);
  const r = new Float32Array(w * h).fill(0.93);
  const put = (x: number, y: number, v: number) => { if (x >= 0 && y >= 0 && x < w && y < h) { const i = y * w + x; r[i] = Math.min(r[i], v); } };
  const rect = (x: number, y: number, ww: number, hh: number, v: number) => {
    for (let py = Math.round(y * ppm); py < Math.round((y + hh) * ppm); py++) for (let px = Math.round(x * ppm); px < Math.round((x + ww) * ppm); px++) put(px, py, v);
  };
  /** coverage-blended disc / ring; inside(dx,dy) optionally restricts the area */
  const circle = (cx: number, cy: number, rad: number, v: number, stroke: number | null, inside?: (dx: number, dy: number) => boolean, tex = 0) => {
    const R = (rad + 1) * ppm;
    for (let py = Math.floor(cy * ppm - R); py <= cy * ppm + R; py++) for (let px = Math.floor(cx * ppm - R); px <= cx * ppm + R; px++) {
      const dx = (px + 0.5) / ppm - cx, dy = (py + 0.5) / ppm - cy;
      const d = Math.hypot(dx, dy);
      let cov: number;
      if (stroke === null) cov = Math.max(0, Math.min(1, (rad - d) * ppm + 0.5));
      else cov = Math.max(0, Math.min(1, (stroke / 2 - Math.abs(d - rad)) * ppm + 0.5));
      if (cov <= 0 || (inside && !inside(dx, dy))) continue;
      const vv = v + (tex ? (rnd() - 0.5) * tex : 0);
      const i = py * w + px;
      if (px >= 0 && py >= 0 && px < w && py < h) r[i] = Math.min(r[i], r[i] * (1 - cov) + vv * cov);
    }
  };
  for (const m of layout.markers) rect(m.x, m.y, m.size, m.size, 0.05);
  // header: logo, title, name/class lines, code text (imitated by dark text blocks)
  rect(24, 12, 16, 16, 0.25);
  for (let i = 0; i < 18; i++) rect(44 + i * 4.5, 13, 3.4, 5, 0.1);
  rect(44, 27, 60, 0.3, 0.2); rect(130, 27, 50, 0.3, 0.2);
  for (let i = 0; i < 9; i++) rect(27 + i * 4.8, 38, 3.6, 5, 0.12);
  const bits = stripBits(code, printedQuestions);
  layout.idBits.forEach((b, i) => circle(b.cx, b.cy, b.r, 0.08, bits[i] ? null : 0.3));
  for (let i = 0; i < 30; i++) rect(24 + i * 5.2, 52, 4, 3, 0.15); // instruction line
  for (const hd of layout.headers) rect(hd.x - 1, hd.y - 1.5, 2, 3, 0.15);
  for (const lb of layout.labels) rect(lb.x - 3, lb.y - 1.5, 3, 3, 0.12);
  for (const b of layout.bubbles) {
    circle(b.cx, b.cy, b.r, 0.12, 0.45);
    rect(b.cx - 0.6, b.cy - 1.1, 1.2, 2.2, 0.55); // the light letter inside the bubble
    const m = marks.get(`${b.q}:${b.choice}`);
    if (!m) continue;
    if (m === "full") circle(b.cx, b.cy, b.r * 1.02, 0.24, null, undefined, 0.2);
    if (m === "pen") circle(b.cx, b.cy, b.r * 0.98, 0.1, null);
    if (m === "sloppy") circle(b.cx + 0.5, b.cy - 0.3, b.r * 0.92, 0.3, null, undefined, 0.3);
    if (m === "partial") circle(b.cx, b.cy, b.r, 0.26, null, (dx) => dx < b.r * 0.25, 0.2);
    if (m === "light") circle(b.cx, b.cy, b.r, 0.78, null, undefined, 0.1);
  }
  return { w, h, ppm, r };
}

// ---------------------------------------------------------------- the "camera"
type P = [number, number];
function solveH(src: P[], dst: P[]): number[] {
  const A: number[][] = [];
  for (let i = 0; i < 4; i++) { const [x, y] = src[i], [u, v] = dst[i]; A.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u], [0, 0, 0, x, y, 1, -v * x, -v * y, v]); }
  for (let c = 0; c < 8; c++) {
    let p = c; for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]];
    for (let r = 0; r < 8; r++) if (r !== c) { const f = A[r][c] / A[c][c]; for (let k = c; k < 9; k++) A[r][k] -= f * A[c][k]; }
  }
  const h = A.map((row, i) => row[8] / row[i]);
  return [...h, 1];
}

interface Shot { W: number; H: number; rot: number; fill: number; skew: number; light: number; noise: number; blur: number; seed: number; cx?: number; cy?: number; decoys?: [number, number, number][] }

function photograph(s: Sheet, o: Shot): ImageData {
  const rnd = rng(o.seed);
  const { W, H } = o;
  // where the paper corners land: rotated rectangle scaled to `fill` of the frame, then perspective jitter
  const scale = (o.fill * Math.min(W / A4_W, H / A4_H));
  const th = (o.rot * Math.PI) / 180, c = Math.cos(th), si = Math.sin(th);
  const cx = (o.cx ?? 0.5) * W, cy = (o.cy ?? 0.5) * H;
  const corners: P[] = [[0, 0], [A4_W, 0], [A4_W, A4_H], [0, A4_H]];
  const dst = corners.map(([x, y], k): P => {
    const dx = (x - A4_W / 2) * scale, dy = (y - A4_H / 2) * scale;
    // perspective: top edge shorter than the bottom one (phone tilted), plus a little jitter per corner
    const k1 = y === 0 ? 1 - o.skew : 1 + o.skew * 0.3;
    const j = o.skew * 40 * (k % 2 ? 1 : -1);
    return [cx + (dx * k1) * c - dy * si + j, cy + (dx * k1) * si + dy * c + j * 0.5];
  });
  const Hinv = solveH(dst, corners.map(([x, y]): P => [x * s.ppm, y * s.ppm]));
  const data = new Uint8ClampedArray(W * H * 4);
  const g = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const z = Hinv[6] * x + Hinv[7] * y + 1;
    const u = (Hinv[0] * x + Hinv[1] * y + Hinv[2]) / z, v = (Hinv[3] * x + Hinv[4] * y + Hinv[5]) / z;
    let refl: number;
    if (u >= 0 && v >= 0 && u < s.w - 1 && v < s.h - 1) {
      const x0 = u | 0, y0 = v | 0, fx = u - x0, fy = v - y0, i = y0 * s.w + x0;
      refl = (s.r[i] * (1 - fx) + s.r[i + 1] * fx) * (1 - fy) + (s.r[i + s.w] * (1 - fx) + s.r[i + s.w + 1] * fx) * fy;
    } else {
      refl = 0.32 + 0.08 * Math.sin(x / 23 + Math.sin(y / 61) * 3) + ((x * 7 + y * 13) % 97 < 3 ? -0.15 : 0); // wooden desk
      for (const [dx, dy, ds] of o.decoys ?? []) if (Math.abs(x - dx * W) < ds / 2 && Math.abs(y - dy * H) < ds / 2) refl = 0.05; // dark square things on the desk
    }
    // uneven light: gradient across the frame + a soft shadow blob
    const gx = x / W, gy = y / H;
    let illum = 1 - o.light * (0.6 * gx + 0.4 * gy);
    const sd = Math.hypot(gx - 0.7, gy - 0.3);
    illum *= 1 - o.light * 0.5 * Math.exp(-(sd * sd) / 0.02);
    g[y * W + x] = 250 * refl * illum;
  }
  let img: Float32Array<ArrayBufferLike> = g;
  if (o.blur > 0) img = boxBlur(boxBlur(g, W, H, o.blur), W, H, o.blur);
  for (let i = 0, p = 0; i < W * H; i++, p += 4) {
    const n = (rnd() + rnd() + rnd() - 1.5) * o.noise;
    const v = img[i] + n;
    data[p] = v * 1.02; data[p + 1] = v; data[p + 2] = v * 0.94; data[p + 3] = 255;
  }
  return { data, width: W, height: H, colorSpace: "srgb" } as ImageData;
}

function boxBlur(src: Float32Array, W: number, H: number, r: number): Float32Array {
  const tmp = new Float32Array(W * H), out = new Float32Array(W * H), n = 2 * r + 1;
  for (let y = 0; y < H; y++) { let s = 0; for (let x = -r; x <= r; x++) s += src[y * W + Math.min(W - 1, Math.max(0, x))]; for (let x = 0; x < W; x++) { tmp[y * W + x] = s / n; s += src[y * W + Math.min(W - 1, x + r + 1)] - src[y * W + Math.max(0, x - r)]; } }
  for (let x = 0; x < W; x++) { let s = 0; for (let y = -r; y <= r; y++) s += tmp[Math.min(H - 1, Math.max(0, y)) * W + x]; for (let y = 0; y < H; y++) { out[y * W + x] = s / n; s += tmp[Math.min(H - 1, y + r + 1) * W + x] - tmp[Math.max(0, y - r) * W + x]; } }
  return out;
}

// ---------------------------------------------------------------- answer plans
interface Expect { answer: number | null; status: string[]; marked: number[] }
function plan(n: number, seed: number, specials: Record<number, "blank" | "double" | "partial" | "erasedPlus" | "erasedAlone" | "pen" | "sloppy"> = {}) {
  const rnd = rng(seed);
  const marks = new Map<string, Mark>();
  const expect = new Map<number, Expect>();
  for (let q = 1; q <= n; q++) {
    const a = Math.floor(rnd() * 4), b = (a + 1 + Math.floor(rnd() * 3)) % 4;
    const sp = specials[q];
    if (sp === "blank") { expect.set(q, { answer: null, status: ["BLANK"], marked: [] }); continue; }
    if (sp === "double") { marks.set(`${q}:${a}`, "full"); marks.set(`${q}:${b}`, "full"); expect.set(q, { answer: null, status: ["MULTIPLE"], marked: [a, b] }); continue; }
    if (sp === "partial") { marks.set(`${q}:${a}`, "partial"); expect.set(q, { answer: a, status: ["OK"], marked: [a] }); continue; }
    if (sp === "erasedPlus") { marks.set(`${q}:${b}`, "light"); marks.set(`${q}:${a}`, "full"); expect.set(q, { answer: a, status: ["OK"], marked: [a] }); continue; }
    if (sp === "erasedAlone") { marks.set(`${q}:${a}`, "light"); expect.set(q, { answer: null, status: ["BLANK", "UNSURE"], marked: [] }); continue; }
    marks.set(`${q}:${a}`, sp === "pen" ? "pen" : sp === "sloppy" ? "sloppy" : "full");
    expect.set(q, { answer: a, status: ["OK"], marked: [a] });
  }
  return { marks, expect };
}

const stats = { bubbles: 0, correct: 0, rows: 0, rowsCorrect: 0, sheets: 0, codes: 0, failures: [] as string[], ms: [] as { name: string; px: number; ms: number }[] };

function check(name: string, res: OmrResult, expect: Map<number, Expect>, code: string, strict: boolean) {
  stats.sheets++;
  if (res.code === code) stats.codes++;
  if (!strict && (!res.ok || res.rows.length !== expect.size)) {
    stats.bubbles += expect.size * 4; stats.rows += expect.size;
    stats.failures.push(`${name}: ${res.error} code=${res.code} n=${expect.size}`);
    return;
  }
  if (strict) {
    assert.equal(res.ok, true, `${name}: ${res.error}`);
    assert.equal(res.code, code, `${name}: code`);
    assert.equal(res.rows.length, expect.size);
  } else if (res.code !== code) stats.failures.push(`${name}: code ${res.code}`);
  const wrong: string[] = [];
  for (const row of res.rows) {
    const e = expect.get(row.q)!;
    for (let k = 0; k < 4; k++) {
      stats.bubbles++;
      // a bubble is read correctly when its marked / not-marked state matches (erased marks count as not marked)
      const isMarked = row.marks.includes(k) || (row.answer === k && row.status !== "BLANK");
      if (isMarked === e.marked.includes(k) || (e.status.includes("UNSURE") && row.status === "UNSURE")) stats.correct++;
    }
    stats.rows++;
    const ok = row.answer === (e.status.includes("UNSURE") && row.status === "UNSURE" ? row.answer : e.answer) && e.status.includes(row.status);
    if (ok) stats.rowsCorrect++;
    else wrong.push(`q${row.q}: got ${row.answer}/${row.status} [${row.fill.join(" ")}] want ${e.answer}/${e.status.join("|")}`);
  }
  if (strict) assert.deepEqual(wrong, [], `${name}: rows`);
  else stats.failures.push(...wrong.map((w) => `${name} ${w}`));
}

function run(name: string, n: number, seed: number, shot: Shot, specials: Parameters<typeof plan>[2] = {}, student: string | null = "42", strict = true) {
  const layout = sheetLayout(n);
  const code = encodeSheetCode({ testId: String(100 + seed), studentId: student });
  const { marks, expect } = plan(n, seed, specials);
  const img = photograph(renderSheet(layout, code, marks, 6, rng(seed + 7)), shot);
  const t0 = performance.now();
  const res = readSheet(img, layout);
  stats.ms.push({ name, px: img.width * img.height, ms: performance.now() - t0 });
  check(name, res, expect, code, strict);
  return res;
}

// ---------------------------------------------------------------- tests

test("layout: deterministic, 1–3 columns, inside the page, no overlaps", () => {
  assert.deepEqual(sheetLayout(37), sheetLayout(37));
  assert.throws(() => sheetLayout(0)); assert.throws(() => sheetLayout(61));
  for (const n of [1, 5, 20, 21, 40, 41, 60]) {
    const l = sheetLayout(n);
    assert.equal(l.bubbles.length, n * 4);
    assert.equal(new Set(l.bubbles.map((b) => b.cx)).size / 4, n <= 20 ? 1 : n <= 40 ? 2 : 3);
    for (const b of l.bubbles) {
      assert.ok(b.cx - b.r > 20 && b.cx + b.r < 190 && b.cy - b.r > 60 && b.cy + b.r < 272, `bubble inside n=${n}`);
      assert.ok(b.r * 2 >= 5);
    }
    for (const a of l.bubbles) for (const b of l.bubbles) if (a !== b) assert.ok(Math.hypot(a.cx - b.cx, a.cy - b.cy) >= 2 * a.r + 3);
  }
});

test("sheet code: round trip, canonical forms, check digit rejects every single-character error", () => {
  for (const [t, s] of [["1", "1"], ["0", null], ["ZZZZ", "ZZY"], ["123", "7"], ["9999", null], ["3k9", "0"]] as [string, string | null][]) {
    const code = encodeSheetCode({ testId: t, studentId: s });
    assert.equal(code.length, 8);
    assert.match(code, /^[0-9A-HJKMNP-TV-Z]{8}$/);
    const back = decodeSheetCode(code)!;
    assert.equal(back.testId, t.toUpperCase().replace(/^0+(?=.)/, ""));
    assert.equal(back.studentId, s);
    assert.deepEqual(decodeSheetCode(formatSheetCode(code).toLowerCase()), back);
    for (let i = 0; i < 8; i++) for (const ch of ALPHABET) {
      if (ch === code[i]) continue;
      assert.equal(decodeSheetCode(code.slice(0, i) + ch + code.slice(i + 1)), null, `substitution ${i}${ch}`);
    }
    for (let i = 0; i < 7; i++) {
      if (code[i] === code[i + 1]) continue;
      assert.equal(decodeSheetCode(code.slice(0, i) + code[i + 1] + code[i] + code.slice(i + 2)), null, "adjacent swap");
    }
  }
  assert.equal(decodeSheetCode("ABC"), null);
  assert.equal(decodeSheetCode("ABCDEFG!"), null);
  assert.throws(() => encodeSheetCode({ testId: "100000", studentId: null }));
  assert.throws(() => encodeSheetCode({ testId: "1", studentId: "ZZZ" }));
  assert.throws(() => encodeSheetCode({ testId: "c1xyz-abc", studentId: null }));
  const code = encodeSheetCode({ testId: "77", studentId: "5" });
  assert.deepEqual(readStripBits(stripBits(code, 33)), { code, questions: 33 });
  const bad = stripBits(code, 33); bad[44] = !bad[44];
  assert.equal(readStripBits(bad), null);
});

test("AnswerSheet renders a printable A4 sheet with markers, code text, strip and every bubble", () => {
  const layout = sheetLayout(25);
  const code = encodeSheetCode({ testId: "12", studentId: "3" });
  const html = renderToStaticMarkup(React.createElement(AnswerSheet, { layout, title: "Reading test", studentName: "سارة", className: "6A", code }));
  assert.match(html, /width="210mm" height="297mm"/);
  assert.equal((html.match(/<rect x="(10|190)" y="(10|277)" width="10" height="10" fill="#000"/g) ?? []).length, 4);
  assert.equal((html.match(/stroke-width="0.45"/g) ?? []).length, 100);
  assert.equal((html.match(/r="1.35" fill="#000"/g) ?? []).length, stripBits(code, 25).filter(Boolean).length);
  assert.ok(html.includes(formatSheetCode(code)) && html.includes("سارة") && html.includes("Fill the circle completely with a dark pencil or pen"));
  assert.match(html, /@page \{ size: A4 portrait; margin: 0; \}/);
  const ar = renderToStaticMarkup(React.createElement(AnswerSheet, { layout, title: "x", code, labels: { name: "الاسم" } }));
  assert.ok(ar.includes("الاسم:"));
});

test("reads a clean upright scan", () => {
  run("clean scan", 20, 1, { W: 1300, H: 1820, rot: 0.4, fill: 0.97, skew: 0, light: 0, noise: 3, blur: 0, seed: 1 }, { 4: "blank", 9: "pen" });
});

test("phone photo: 7° rotation, perspective, desk around the paper, uneven light, partial / double / erased marks", () => {
  run("phone 60q", 60, 2, { W: 1500, H: 2000, rot: 7, fill: 0.8, skew: 0.06, light: 0.45, noise: 8, blur: 0, seed: 2 },
    { 3: "double", 11: "partial", 17: "erasedPlus", 25: "blank", 33: "erasedAlone", 41: "sloppy", 52: "partial", 59: "double" });
});

test("phone photo: −12° rotation, strong tilt and shadow, 45 questions, blank sheet code", () => {
  run("tilt 45q", 45, 3, { W: 1600, H: 2100, rot: -12, fill: 0.78, skew: 0.1, light: 0.55, noise: 10, blur: 1, seed: 3, cx: 0.48, cy: 0.52 },
    { 2: "partial", 20: "double", 30: "erasedPlus", 44: "blank" }, null);
});

test("sideways landscape photo (95°) and upside-down photo (186°)", () => {
  run("sideways", 30, 4, { W: 2000, H: 1500, rot: 95, fill: 0.85, skew: 0.04, light: 0.3, noise: 7, blur: 0, seed: 4 }, { 7: "partial", 14: "double" });
  run("upside down", 12, 5, { W: 1400, H: 1900, rot: 186, fill: 0.85, skew: 0.05, light: 0.3, noise: 7, blur: 0, seed: 5 }, { 3: "blank", 6: "erasedPlus" });
});

test("12-megapixel photo (3000 × 4000), 10° rotation, slight blur: correct and fast", () => {
  run("12MP", 40, 6, { W: 3000, H: 4000, rot: 10, fill: 0.82, skew: 0.07, light: 0.4, noise: 9, blur: 2, seed: 6 }, { 5: "double", 18: "partial", 27: "erasedPlus", 39: "blank" });
  const t = stats.ms.find((m) => m.name === "12MP")!;
  console.log(`12 MP read: ${t.ms.toFixed(0)} ms`);
  assert.ok(t.ms < 1500, "well under a second and a half even on a slow CI machine");
});

test("more random sheets at varied angles", () => {
  for (let i = 0; i < 6; i++) {
    const n = [8, 15, 24, 36, 50, 60][i];
    const rot = [-14, -9, -4, 3, 8, 14][i];
    run(`random ${i}`, n, 10 + i, { W: 1500 + i * 60, H: 2000, rot, fill: 0.75 + i * 0.03, skew: 0.03 * (i % 3), light: 0.15 * (i % 4), noise: 6 + i, blur: i % 2, seed: 10 + i },
      { [1 + (i % n)]: "partial", [Math.min(n, 3 + i)]: "double" });
  }
});

test("dark square objects on the desk next to the paper are not taken for markers", () => {
  run("decoys", 20, 30, { W: 1500, H: 2000, rot: 4, fill: 0.68, skew: 0.03, light: 0.2, noise: 6, blur: 0, seed: 30,
    decoys: [[0.07, 0.08, 52], [0.93, 0.93, 50], [0.5, 0.04, 48]] }, { 2: "partial" });
});

test("errors: no sheet, too blurry, wrong sheet", () => {
  const rnd = rng(9);
  const W = 800, H = 1000, data = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < data.length; i += 4) { const v = 120 + rnd() * 60; data[i] = data[i + 1] = data[i + 2] = v; data[i + 3] = 255; }
  assert.equal(readSheet({ data, width: W, height: H, colorSpace: "srgb" } as ImageData, sheetLayout(10)).error, "NO_MARKERS");

  const layout = sheetLayout(20);
  const code = encodeSheetCode({ testId: "5", studentId: "1" });
  const { marks } = plan(20, 21);
  const sheet = renderSheet(layout, code, marks);
  const blurry = readSheet(photograph(sheet, { W: 1300, H: 1800, rot: 3, fill: 0.9, skew: 0, light: 0.2, noise: 4, blur: 9, seed: 9 }), layout);
  assert.equal(blurry.ok, false);
  assert.equal(blurry.error, "TOO_BLURRY");
  assert.ok(blurry.warped);

  // a corner of the paper (with its marker) outside the photo
  const cut = readSheet(photograph(sheet, { W: 1300, H: 1800, rot: 2, fill: 0.95, skew: 0, light: 0.1, noise: 4, blur: 0, seed: 7, cx: 0.36, cy: 0.47 }), layout);
  assert.equal(cut.ok, false);
  assert.equal(cut.error, "NO_MARKERS");

  const other = sheetLayout(30);
  const wrong = readSheet(photograph(renderSheet(other, code, new Map(), 6, rng(3)), { W: 1300, H: 1800, rot: -4, fill: 0.9, skew: 0.02, light: 0.2, noise: 4, blur: 0, seed: 8 }), layout);
  assert.equal(wrong.error, "WRONG_SHEET");
  assert.equal(wrong.code, code);
});

/** Largest `fill` that keeps the rotated (and slightly tilted) paper inside the frame. */
function fits(W: number, H: number, rot: number): number {
  const c = Math.abs(Math.cos((rot * Math.PI) / 180)), s = Math.abs(Math.sin((rot * Math.PI) / 180));
  return (0.92 * Math.min(W / (A4_W * c + A4_H * s), H / (A4_W * s + A4_H * c))) / Math.min(W / A4_W, H / A4_H);
}

test("sweep: 40 random photos (rotation ±15°, tilt, light, noise, blur, special marks)", () => {
  const r = rng(2024);
  const kinds = ["partial", "double", "erasedPlus", "blank", "erasedAlone", "pen", "sloppy"] as const;
  for (let i = 0; i < 40; i++) {
    const n = 1 + Math.floor(r() * 60);
    const specials: Parameters<typeof plan>[2] = {};
    for (let k = 0; k < Math.min(n, 4); k++) specials[1 + Math.floor(r() * n)] = kinds[Math.floor(r() * kinds.length)];
    const landscape = r() < 0.2;
    const rot = (r() * 2 - 1) * 15 + (landscape ? 90 : r() < 0.15 ? 180 : 0);
    run(`sweep ${i}`, n, 100 + i, {
      W: landscape ? 2000 : 1500, H: landscape ? 1500 : 2000, rot, fill: Math.min(0.62 + r() * 0.3, fits(landscape ? 2000 : 1500, landscape ? 1500 : 2000, rot)), skew: r() * 0.1, light: r() * 0.6,
      noise: 4 + r() * 10, blur: Math.floor(r() * 3), seed: 100 + i, cx: 0.45 + r() * 0.1, cy: 0.45 + r() * 0.1,
    }, specials, r() < 0.3 ? null : String(Math.floor(r() * 1000)), false);
  }
});

test("summary: accuracy and speed", () => {
  const acc = stats.correct / stats.bubbles;
  console.log(`bubbles ${stats.correct}/${stats.bubbles} (${(acc * 100).toFixed(2)} %), rows ${stats.rowsCorrect}/${stats.rows}, codes ${stats.codes}/${stats.sheets}`);
  for (const f of stats.failures) console.log(`  miss: ${f}`);
  for (const m of stats.ms) console.log(`  ${m.name.padEnd(12)} ${(m.px / 1e6).toFixed(1)} MP  ${m.ms.toFixed(0)} ms`);
  assert.ok(acc >= 0.99);
});
