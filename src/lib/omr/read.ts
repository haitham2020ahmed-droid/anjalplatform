/**
 * Optical mark reader for the bubble answer sheets of ./layout. Pure TypeScript on ImageData — runs in the browser
 * (main thread or a worker) and in Node (tests). Images are only read here, never stored or sent anywhere.
 *
 * Steps: downscale + grayscale → adaptive threshold → connected components → the 4 corner markers (solid, square,
 * similar size, forming a sheet-shaped quadrilateral) → homography → warped, normalised sheet (4 px/mm) → orientation
 * from the code strip (0° / 180°; a sideways photo is handled by the sheet's long side) → per-row alignment on the
 * printed bubble outlines → darkness of each bubble interior relative to the local paper and to the printer's black →
 * decision per row (OK / BLANK / MULTIPLE / UNSURE) relative to the sheet's own empty and filled bubbles.
 *
 * Real phone photos (Update 57): besides the mean darkness, each bubble's share of clearly dark pixels is measured,
 * so a tick or a stroke through a bubble is never read as "blank" (it is flagged), a light but complete pencil fill
 * that stands alone is read, and an eraser's grey smudge stays blank. Every row gets a confidence (0–1) and the sheet
 * a confidence (HIGH / MEDIUM / LOW) with the list of questions to CHECK — the reader never guesses: an uncertain row
 * has no answer until the teacher confirms one, and a LOW sheet is never saved without the teacher's confirmation.
 */
import { A4_H, A4_W, MARKER_CENTERS, MARKER_SIZE, readStripBits, type SheetLayout } from "./layout";

/**
 * One question of the sheet. `answer` is the reader's answer only when status is OK; for UNSURE it is the most likely
 * choice, shown to the teacher as a suggestion (`suggest`), never saved without the teacher's confirmation.
 * `fill`: mean darkness of each bubble (0 = paper, 1 = printer black); `dark`: share of clearly dark pixels;
 * `confidence`: 0 (a guess) … 1 (certain).
 */
export interface OmrRow { q: number; answer: 0 | 1 | 2 | 3 | null; marks: number[]; status: "OK" | "BLANK" | "MULTIPLE" | "UNSURE"; fill: number[]; dark?: number[]; peak?: number[]; confidence?: number; suggest?: 0 | 1 | 2 | 3 | null }
/** How sure the reader is of the whole sheet: HIGH = every row clear · MEDIUM = a few rows to check · LOW = check the whole sheet. */
export type SheetConfidence = "HIGH" | "MEDIUM" | "LOW";
export interface OmrQuality {
  confidence: SheetConfidence; score: number; check: number[]; reasons: ("BLUR" | "CONTRAST" | "ALIGN" | "MANY_UNSURE" | "LIGHT_MARKS")[];
  /** the photo's measurements: edge width of the markers (mm), printer black vs paper, outline alignment, empty→full spread */
  metrics: { blurMm: number; ink: number; align: number; lost: number; spread: number };
}
export interface OmrResult { ok: boolean; error?: "NO_MARKERS" | "TOO_BLURRY" | "WRONG_SHEET"; code: string | null; rows: OmrRow[]; warped?: ImageData; quality?: OmrQuality }

/** Pixels per millimetre of the warped sheet (840 × 1188). */
export const WARP_SCALE = 4;
const MAX_SIDE = 1600;

// Decision thresholds on the normalised score s = (fill − empty level) / (filled level − empty level).
const MARK = 0.45;
const WEAK = 0.25;
const CLEAR_GAP = 0.35;
/** a light but complete pencil fill, alone in its row, is an answer (an eraser's smudge stays well under this) */
const LIGHT_ALONE = 0.34;
/** share of clearly dark pixels that is a stroke through a bubble (a tick, a cross, a line), not a stray dot */
const STROKE = 0.1;
/** a pencil line's darkest spot over the row's other bubbles (an eraser's smudge stays under 0.12, a line is 0.18+) */
const PEAK_STROKE = 0.14;

interface Gray { w: number; h: number; d: Uint8Array }
type Pt = [number, number];
type Mat = number[]; // 3 × 3 row-major

// ---------------------------------------------------------------- image helpers

/** Box-averaged downscale to ≤ MAX_SIDE on the long side, as 8-bit luminance. */
function toGray(img: ImageData): Gray {
  const W = img.width, H = img.height, src = img.data;
  const k = Math.max(1, Math.ceil(Math.max(W, H) / MAX_SIDE));
  const w = Math.floor(W / k), h = Math.floor(H / k);
  const d = new Uint8Array(w * h);
  const acc = new Uint32Array(w);
  const div = k * k * 256;
  for (let oy = 0; oy < h; oy++) {
    acc.fill(0);
    for (let dy = 0; dy < k; dy++) {
      let p = ((oy * k + dy) * W) * 4;
      for (let ox = 0; ox < w; ox++) {
        let s = 0;
        for (let dx = 0; dx < k; dx++, p += 4) s += src[p] * 77 + src[p + 1] * 150 + src[p + 2] * 29;
        acc[ox] += s;
      }
    }
    const row = oy * w;
    for (let ox = 0; ox < w; ox++) d[row + ox] = (acc[ox] / div) | 0;
  }
  return { w, h, d };
}

/** Dark pixels relative to the local mean (integral image), robust to uneven light and a background around the paper. */
function adaptiveMask(g: Gray): Uint8Array {
  const { w, h, d } = g;
  const W1 = w + 1;
  const ii = new Float64Array(W1 * (h + 1));
  for (let y = 0; y < h; y++) {
    let rs = 0;
    for (let x = 0; x < w; x++) { rs += d[y * w + x]; ii[(y + 1) * W1 + x + 1] = ii[y * W1 + x + 1] + rs; }
  }
  const half = Math.max(15, Math.round(Math.min(w, h) / 12));
  const m = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - half), y1 = Math.min(h, y + half + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - half), x1 = Math.min(w, x + half + 1);
      const sum = ii[y1 * W1 + x1] - ii[y0 * W1 + x1] - ii[y1 * W1 + x0] + ii[y0 * W1 + x0];
      const mean = sum / ((x1 - x0) * (y1 - y0));
      const v = d[y * w + x];
      if (v < mean * 0.72 && v < mean - 25) m[y * w + x] = 1;
    }
  }
  return m;
}

interface Blob { area: number; cx: number; cy: number; minX: number; maxX: number; minY: number; maxY: number; sxx: number; syy: number; sxy: number }

/** 8-connected components (two-pass union-find) with area, centroid and second moments. */
function components(m: Uint8Array, w: number, h: number, maxArea: number): Blob[] {
  const lab = new Int32Array(w * h);
  const parent: number[] = [0];
  const find = (a: number) => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
  const union = (a: number, b: number) => { a = find(a); b = find(b); if (a !== b) { if (a < b) parent[b] = a; else parent[a] = b; } };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!m[i]) continue;
      let l = 0;
      const nb = [x > 0 ? lab[i - 1] : 0, y > 0 && x > 0 ? lab[i - w - 1] : 0, y > 0 ? lab[i - w] : 0, y > 0 && x < w - 1 ? lab[i - w + 1] : 0];
      for (const n of nb) if (n) { if (!l) l = n; else if (n !== l) union(l, n); }
      if (!l) { l = parent.length; parent.push(l); }
      lab[i] = l;
    }
  }
  const n = parent.length;
  const root = new Int32Array(n);
  for (let i = 1; i < n; i++) root[i] = find(i);
  const area = new Float64Array(n), sx = new Float64Array(n), sy = new Float64Array(n), sxx = new Float64Array(n), syy = new Float64Array(n), sxy = new Float64Array(n);
  const minX = new Int32Array(n).fill(1 << 30), maxX = new Int32Array(n).fill(-1), minY = new Int32Array(n).fill(1 << 30), maxY = new Int32Array(n).fill(-1);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const l = lab[y * w + x];
      if (!l) continue;
      const r = root[l];
      area[r]++; sx[r] += x; sy[r] += y; sxx[r] += x * x; syy[r] += y * y; sxy[r] += x * y;
      if (x < minX[r]) minX[r] = x; if (x > maxX[r]) maxX[r] = x; if (y < minY[r]) minY[r] = y; if (y > maxY[r]) maxY[r] = y;
    }
  }
  const out: Blob[] = [];
  for (let r = 1; r < n; r++) {
    if (root[r] !== r || area[r] < 12 || area[r] > maxArea) continue;
    const a = area[r], cx = sx[r] / a, cy = sy[r] / a;
    out.push({ area: a, cx, cy, minX: minX[r], maxX: maxX[r], minY: minY[r], maxY: maxY[r], sxx: sxx[r] / a - cx * cx, syy: syy[r] / a - cy * cy, sxy: sxy[r] / a - cx * cy });
  }
  return out;
}

/** Solid, compact, square-ish blobs of a plausible marker size. */
function markerCandidates(blobs: Blob[], w: number, h: number): Blob[] {
  const m = Math.min(w, h);
  const minA = (m * 0.011) ** 2, maxA = (m * 0.11) ** 2;
  const out: { b: Blob }[] = [];
  for (const b of blobs) {
    if (b.area < minA || b.area > maxA) continue;
    const tr = b.sxx + b.syy, det = b.sxx * b.syy - b.sxy * b.sxy;
    const disc = Math.sqrt(Math.max(0, (tr * tr) / 4 - det));
    const l1 = tr / 2 + disc, l2 = tr / 2 - disc;
    if (l2 <= 0 || l1 / l2 > 2.2) continue; // elongated
    const compact = b.area / (6 * tr); // 1.0 for a solid square, 1.05 for a disc, ≪ 1 for rings and outlines
    if (compact < 0.78 || compact > 1.2) continue;
    const bw = b.maxX - b.minX + 1, bh = b.maxY - b.minY + 1;
    const fillBox = b.area / (bw * bh);
    if (fillBox < 0.42 || bw / bh > 2.2 || bh / bw > 2.2) continue;
    out.push({ b });
  }
  // markers are the largest solid blobs on the sheet (filled bubbles are about a quarter of their area)
  out.sort((a, c) => c.b.area - a.b.area);
  return out.slice(0, 36).map((o) => o.b);
}

const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** Clockwise order (image y down) around the centroid; null when not a convex quadrilateral. */
function orderQuad(p: Pt[]): Pt[] | null {
  const cx = (p[0][0] + p[1][0] + p[2][0] + p[3][0]) / 4, cy = (p[0][1] + p[1][1] + p[2][1] + p[3][1]) / 4;
  const q = [...p].sort((a, b) => Math.atan2(a[1] - cy, a[0] - cx) - Math.atan2(b[1] - cy, b[0] - cx));
  for (let i = 0; i < 4; i++) {
    const a = q[i], b = q[(i + 1) % 4], c = q[(i + 2) % 4];
    if ((b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]) <= 0) return null;
  }
  return q;
}

function quadArea(q: Pt[]): number {
  let s = 0;
  for (let i = 0; i < 4; i++) { const a = q[i], b = q[(i + 1) % 4]; s += a[0] * b[1] - b[0] * a[1]; }
  return Math.abs(s) / 2;
}

const MARK_W = MARKER_CENTERS[1][0] - MARKER_CENTERS[0][0]; // 180
const MARK_H = MARKER_CENTERS[2][1] - MARKER_CENTERS[0][1]; // 267

/**
 * Plausible marker quadrilaterals, largest first, each clockwise from the sheet's top-left (TL, TR, BR, BL) with a
 * first guess of the orientation (the 180° alternative is checked later on the code strip).
 */
function findQuads(cands: Blob[]): Pt[][] {
  const found: { quad: Pt[]; area: number }[] = [];
  const n = cands.length;
  const expectedAspect = MARK_H / MARK_W;
  for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) for (let c = b + 1; c < n; c++) for (let d = c + 1; d < n; d++) {
    const bs = [cands[a], cands[b], cands[c], cands[d]];
    let amin = Infinity, amax = 0;
    for (const x of bs) { amin = Math.min(amin, x.area); amax = Math.max(amax, x.area); }
    if (amax / amin > 2.6) continue;
    const q = orderQuad(bs.map((x) => [x.cx, x.cy] as Pt));
    if (!q) continue;
    const s = [dist(q[0], q[1]), dist(q[1], q[2]), dist(q[2], q[3]), dist(q[3], q[0])];
    if (s[0] / s[2] > 1.6 || s[2] / s[0] > 1.6 || s[1] / s[3] > 1.6 || s[3] / s[1] > 1.6) continue;
    const pairA = (s[0] + s[2]) / 2, pairB = (s[1] + s[3]) / 2;
    const shortSide = Math.min(pairA, pairB), longSide = Math.max(pairA, pairB);
    const aspect = longSide / shortSide;
    if (aspect < expectedAspect * 0.72 || aspect > expectedAspect * 1.35) continue;
    // marker side relative to the sheet: 10 mm over 180 mm
    const rel = Math.sqrt((amin + amax) / 2) / shortSide;
    if (rel < (MARKER_SIZE / MARK_W) * 0.55 || rel > (MARKER_SIZE / MARK_W) * 1.7) continue;
    // rotate so that q[0]→q[1] is a short (top) side
    const start = pairA <= pairB ? 0 : 1;
    const r = [q[start], q[(start + 1) % 4], q[(start + 2) % 4], q[(start + 3) % 4]];
    // of the two upright candidates (0° / 180°) start with the one whose top edge is higher in the photo
    const flip = r[0][1] + r[1][1] > r[2][1] + r[3][1];
    found.push({ quad: flip ? [r[2], r[3], r[0], r[1]] : r, area: quadArea(q) });
  }
  found.sort((a, b) => b.area - a.area);
  return found.slice(0, 8).map((f) => f.quad);
}

/** Homography mapping src[i] → dst[i] (4 point pairs). */
function homography(src: Pt[], dst: Pt[]): Mat {
  const A: number[][] = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i], [u, v] = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u]);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y, v]);
  }
  for (let col = 0; col < 8; col++) {
    let piv = col;
    for (let r = col + 1; r < 8; r++) if (Math.abs(A[r][col]) > Math.abs(A[piv][col])) piv = r;
    [A[col], A[piv]] = [A[piv], A[col]];
    const p = A[col][col] || 1e-12;
    for (let r = 0; r < 8; r++) {
      if (r === col) continue;
      const f = A[r][col] / p;
      if (f) for (let k = col; k < 9; k++) A[r][k] -= f * A[col][k];
    }
  }
  const h = A.map((row, i) => row[8] / (row[i] || 1e-12));
  return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
}

/** Warp the A4 sheet (mm → image px through H) into a WARP_SCALE px/mm gray image, bilinear. */
function warp(g: Gray, H: Mat): Gray {
  const S = WARP_SCALE, w = A4_W * S, h = A4_H * S;
  const d = new Uint8Array(w * h);
  const gw = g.w, gh = g.h, src = g.d;
  for (let y = 0; y < h; y++) {
    const my = (y + 0.5) / S;
    for (let x = 0; x < w; x++) {
      const mx = (x + 0.5) / S;
      const z = H[6] * mx + H[7] * my + H[8];
      const u = (H[0] * mx + H[1] * my + H[2]) / z, v = (H[3] * mx + H[4] * my + H[5]) / z;
      const x0 = Math.floor(u), y0 = Math.floor(v);
      if (x0 < 0 || y0 < 0 || x0 >= gw - 1 || y0 >= gh - 1) { d[y * w + x] = 255; continue; }
      const fx = u - x0, fy = v - y0, i = y0 * gw + x0;
      const top = src[i] + (src[i + 1] - src[i]) * fx;
      const bot = src[i + gw] + (src[i + gw + 1] - src[i + gw]) * fx;
      d[y * w + x] = (top + (bot - top) * fy + 0.5) | 0;
    }
  }
  return { w, h, d };
}

function rotate180(g: Gray): Gray {
  const d = new Uint8Array(g.d.length);
  for (let i = 0, n = d.length; i < n; i++) d[i] = g.d[n - 1 - i];
  return { w: g.w, h: g.h, d };
}

// ---------------------------------------------------------------- measurements on the warped sheet (px = mm × S)

function at(g: Gray, x: number, y: number): number {
  const xi = Math.min(g.w - 1, Math.max(0, Math.round(x))), yi = Math.min(g.h - 1, Math.max(0, Math.round(y)));
  return g.d[yi * g.w + xi];
}

const RING_N = 28;
const COS = Array.from({ length: RING_N }, (_, i) => Math.cos((2 * Math.PI * i) / RING_N));
const SIN = Array.from({ length: RING_N }, (_, i) => Math.sin((2 * Math.PI * i) / RING_N));

/** Edge strength of a printed circle at (cx, cy) radius r (px): just outside minus on the outline. */
function ringEdge(g: Gray, cx: number, cy: number, r: number): number {
  let on = 0, out = 0;
  const ro = r + 0.7 * WARP_SCALE;
  for (let i = 0; i < RING_N; i++) {
    // darkest of three radii so that a 2-px search step can never step over the thin printed outline
    on += Math.min(at(g, cx + (r - 1) * COS[i], cy + (r - 1) * SIN[i]), at(g, cx + r * COS[i], cy + r * SIN[i]), at(g, cx + (r + 1) * COS[i], cy + (r + 1) * SIN[i]));
    out += at(g, cx + ro * COS[i], cy + ro * SIN[i]);
  }
  return (out - on) / RING_N;
}

function discMean(g: Gray, cx: number, cy: number, r: number): number {
  let s = 0, n = 0;
  const r2 = r * r;
  for (let y = Math.ceil(cy - r); y <= cy + r; y++) for (let x = Math.ceil(cx - r); x <= cx + r; x++) {
    const dx = x - cx, dy = y - cy;
    if (dx * dx + dy * dy <= r2) { s += at(g, x, y); n++; }
  }
  return n ? s / n : 255;
}

/** Paper brightness around a point: mean of the brighter half of an annulus. */
function paperAround(g: Gray, cx: number, cy: number, r1: number, r2: number): number {
  const v: number[] = [];
  const a = r1 * r1, b = r2 * r2;
  for (let y = Math.ceil(cy - r2); y <= cy + r2; y++) for (let x = Math.ceil(cx - r2); x <= cx + r2; x++) {
    const dx = x - cx, dy = y - cy, q = dx * dx + dy * dy;
    if (q >= a && q <= b) v.push(at(g, x, y));
  }
  if (!v.length) return 255;
  v.sort((p, q) => q - p);
  let s = 0;
  const k = Math.max(1, Math.floor(v.length / 2));
  for (let i = 0; i < k; i++) s += v[i];
  return Math.max(1, s / k);
}

/** Printer black relative to the paper (0..1) and marker edge width (mm), measured on the 4 markers. */
function markerStats(g: Gray): { ink: number; worst: number; edgeMm: number } {
  const S = WARP_SCALE;
  const inks: number[] = [], edges: number[] = [];
  for (const [mx, my] of MARKER_CENTERS) {
    const cx = mx * S, cy = my * S;
    const inner = discMean(g, cx, cy, 2.5 * S);
    const paper = paperAround(g, cx, cy, 7.6 * S, 9 * S);
    inks.push(Math.min(1, inner / paper));
    // edge width along ±x and ±y: distance between the 25 % and 75 % crossings
    for (const [ux, uy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      let p25 = -1, p75 = -1;
      for (let t = 2 * S; t <= 8.5 * S; t += 0.25) {
        const v = (at(g, cx + ux * t, cy + uy * t) - inner) / Math.max(1, paper - inner);
        if (p25 < 0 && v >= 0.25) p25 = t;
        if (p75 < 0 && v >= 0.75) { p75 = t; break; }
      }
      if (p25 > 0 && p75 > 0) edges.push((p75 - p25) / S);
    }
  }
  return { ink: Math.min(0.8, median(inks)), worst: Math.max(...inks), edgeMm: edges.length ? median(edges) : 99 };
}

function median(a: number[]): number {
  const s = [...a].sort((x, y) => x - y);
  const n = s.length;
  return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : 0;
}
function percentile(a: number[], p: number): number {
  const s = [...a].sort((x, y) => x - y);
  return s.length ? s[Math.min(s.length - 1, Math.max(0, Math.round(p * (s.length - 1))))] : 0;
}

/** Best common offset (px) for a group of circles, searched ±1.75 mm, maximising the outline edge strength. */
function alignGroup(g: Gray, circles: { cx: number; cy: number; r: number }[], range = 7): { dx: number; dy: number; score: number } {
  const score = (dx: number, dy: number) => {
    let s = 0;
    for (const c of circles) s += ringEdge(g, c.cx + dx, c.cy + dy, c.r);
    return s / circles.length;
  };
  let best = { dx: 0, dy: 0, score: score(0, 0) };
  for (let dy = -range; dy <= range; dy += 2) for (let dx = -range; dx <= range; dx += 2) {
    const s = score(dx, dy);
    if (s > best.score + 1e-9) best = { dx, dy, score: s };
  }
  const c0 = best;
  for (let dy = c0.dy - 1; dy <= c0.dy + 1; dy++) for (let dx = c0.dx - 1; dx <= c0.dx + 1; dx++) {
    const s = score(dx, dy);
    if (s > best.score + 1e-9) best = { dx, dy, score: s };
  }
  return best;
}

/** Fill (0 = paper, 1 = printer black) of a circle's interior. */
function fillOf(g: Gray, cx: number, cy: number, r: number, ink: number): number {
  const inner = discMean(g, cx, cy, r * 0.7);
  const paper = paperAround(g, cx, cy, r + 0.6 * WARP_SCALE, r + 1.3 * WARP_SCALE);
  const refl = inner / paper;
  return Math.max(0, Math.min(1.2, (1 - refl) / Math.max(0.2, 1 - ink)));
}

/**
 * Share (0..1) of the bubble interior that is clearly dark: darker than 45 % of the way from the local paper to the
 * printer's black. A stroke (tick, cross) has many dark pixels and a low mean; an eraser's smudge has a raised mean
 * but almost no dark pixels; the light printed letter inside each bubble stays under the cut.
 */
function darkFrac(g: Gray, cx: number, cy: number, r: number, ink: number): number {
  const paper = paperAround(g, cx, cy, r + 0.6 * WARP_SCALE, r + 1.3 * WARP_SCALE);
  const cut = paper * (1 - 0.45 * (1 - ink));
  const rr = r * 0.8, r2 = rr * rr;
  let n = 0, d = 0;
  for (let y = Math.ceil(cy - rr); y <= cy + rr; y++) for (let x = Math.ceil(cx - rr); x <= cx + rr; x++) {
    const dx = x - cx, dy = y - cy;
    if (dx * dx + dy * dy > r2) continue;
    n++;
    if (at(g, x, y) < cut) d++;
  }
  return n ? d / n : 0;
}

/**
 * The darkest spot of the bubble interior (3 × 3 px mean, so noise is not a spot), 0 = paper … 1 = printer black.
 * Every bubble has its light printed letter, so only the EXCESS over the row's other bubbles counts: a pencil line
 * through a bubble (a tick) stands out even when the photo is blurred; an eraser's even smudge does not.
 */
function peakDark(g: Gray, cx: number, cy: number, r: number, ink: number): number {
  const paper = paperAround(g, cx, cy, r + 0.6 * WARP_SCALE, r + 1.3 * WARP_SCALE);
  const rr = r * 0.85, r2 = rr * rr;
  let lo = 255;
  for (let y = Math.ceil(cy - rr); y <= cy + rr; y++) for (let x = Math.ceil(cx - rr); x <= cx + rr; x++) {
    const dx = x - cx, dy = y - cy;
    if (dx * dx + dy * dy > r2) continue;
    let m = 0;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) m += at(g, x + i, y + j);
    if (m / 9 < lo) lo = m / 9;
  }
  return Math.max(0, Math.min(1.2, (1 - lo / paper) / Math.max(0.2, 1 - ink)));
}

function readStrip(g: Gray, layout: SheetLayout, ink: number): { code: string; questions: number } | null {
  const S = WARP_SCALE;
  const circles = layout.idBits.map((b) => ({ cx: b.cx * S, cy: b.cy * S, r: b.r * S }));
  if (!circles.length) return null;
  const off = alignGroup(g, circles, 6);
  const fills = circles.map((c) => fillOf(g, c.cx + off.dx, c.cy + off.dy, c.r, ink));
  const lo = Math.min(...fills), hi = Math.max(...fills);
  if (hi - lo < 0.3) return null;
  const mid = (lo + hi) / 2;
  return readStripBits(fills.map((f) => f > mid));
}

function toImageData(g: Gray): ImageData {
  const rgba = new Uint8ClampedArray(g.w * g.h * 4);
  for (let i = 0, p = 0; i < g.d.length; i++, p += 4) { const v = g.d[i]; rgba[p] = v; rgba[p + 1] = v; rgba[p + 2] = v; rgba[p + 3] = 255; }
  if (typeof ImageData !== "undefined") return new ImageData(rgba, g.w, g.h);
  return { data: rgba, width: g.w, height: g.h, colorSpace: "srgb" } as ImageData;
}

// ---------------------------------------------------------------- main

export function readSheet(img: ImageData, layout: SheetLayout): OmrResult {
  const gray = toGray(img);
  const mask = adaptiveMask(gray);
  const blobs = components(mask, gray.w, gray.h, (Math.min(gray.w, gray.h) * 0.12) ** 2);
  const quads = findQuads(markerCandidates(blobs, gray.w, gray.h));
  if (!quads.length) return { ok: false, error: "NO_MARKERS", code: null, rows: [] };
  const S = WARP_SCALE;
  const byQ = new Map<number, SheetLayout["bubbles"]>();
  for (const b of layout.bubbles) { const a = byQ.get(b.q); if (a) a.push(b); else byQ.set(b.q, [b]); }
  const qs = [...byQ.keys()].sort((a, b) => a - b);
  const circlesOf = (q: number) => byQ.get(q)!.map((b) => ({ cx: b.cx * S, cy: b.cy * S, r: b.r * S }));

  // Try the largest plausible quadrilaterals: the first whose code strip reads (in either 180° orientation) wins;
  // otherwise the one whose bubble outlines line up best (a dark square on the desk can look like a marker).
  let pick: { sheet: Gray; ms: ReturnType<typeof markerStats>; strip: { code: string; questions: number } | null; score: number } | null = null;
  for (const [tl, tr, br, bl] of quads) {
    const H = homography([MARKER_CENTERS[0], MARKER_CENTERS[1], MARKER_CENTERS[3], MARKER_CENTERS[2]], [tl, tr, br, bl]);
    let sheet = warp(gray, H);
    let ms = markerStats(sheet);
    if (ms.worst > 0.55) continue; // not 4 solid dark squares on white paper (e.g. the logo or a marker out of the photo)
    let strip = readStrip(sheet, layout, ms.ink);
    if (!strip) {
      const flipped = rotate180(sheet);
      const ms2 = markerStats(flipped);
      const strip2 = readStrip(flipped, layout, ms2.ink);
      if (strip2) { sheet = flipped; ms = ms2; strip = strip2; }
    }
    if (strip) { pick = { sheet, ms, strip, score: Infinity }; break; }
    const sample = qs.filter((_, i) => i % 3 === 0).map((q) => alignGroup(sheet, circlesOf(q)).score);
    const score = median(sample) / (255 * Math.max(0.2, 1 - ms.ink));
    if (!pick || score > pick.score) pick = { sheet, ms, strip, score };
  }
  if (!pick) return { ok: false, error: "NO_MARKERS", code: null, rows: [] };
  const { sheet, ms, strip } = pick;
  const warped = toImageData(sheet);
  if (ms.edgeMm > 1.6) return { ok: false, error: "TOO_BLURRY", code: null, rows: [], warped };
  if (strip && strip.questions !== layout.questions) return { ok: false, error: "WRONG_SHEET", code: strip.code, rows: [], warped };

  // ---- bubbles: align each row on its printed outlines, smooth offsets along each column
  const raw = qs.map((q) => alignGroup(sheet, circlesOf(q)));
  const colOf = (q: number) => byQ.get(q)![0].cx;
  const offsets = qs.map((q, i) => {
    const near: number[] = [];
    for (let j = Math.max(0, i - 2); j <= Math.min(qs.length - 1, i + 2); j++) if (colOf(qs[j]) === colOf(q)) near.push(j);
    return { dx: median(near.map((j) => raw[j].dx)), dy: median(near.map((j) => raw[j].dy)) };
  });
  const paperInk = 1 - ms.ink;
  const edge = median(raw.map((r) => r.score)) / (255 * Math.max(0.2, paperInk));
  // no printed bubble outlines where the layout puts them: the 4 "markers" were something else (or a marker is out of the photo)
  const lost = raw.filter((r) => Math.abs(r.dx) >= 6 || Math.abs(r.dy) >= 6).length / raw.length; // rows found only at the search limit
  if (edge < 0.06 || (!strip && lost > 0.4)) return { ok: false, error: strip ? "WRONG_SHEET" : "NO_MARKERS", code: strip?.code ?? null, rows: [], warped };

  const sorted = qs.map((q) => byQ.get(q)!.sort((a, b) => a.choice - b.choice));
  const fills = sorted.map((list, i) => list.map((b) => fillOf(sheet, b.cx * S + offsets[i].dx, b.cy * S + offsets[i].dy, b.r * S, ms.ink)));
  const darks = sorted.map((list, i) => list.map((b) => darkFrac(sheet, b.cx * S + offsets[i].dx, b.cy * S + offsets[i].dy, b.r * S, ms.ink)));
  const peaks = sorted.map((list, i) => list.map((b) => peakDark(sheet, b.cx * S + offsets[i].dx, b.cy * S + offsets[i].dy, b.r * S, ms.ink)));
  const all = fills.flat();
  const empty = percentile(all, 0.35);
  const full = Math.max(empty + 0.4, percentile(fills.map((f) => Math.max(...f)), 0.9));
  const rows: OmrRow[] = qs.map((q, i) => decideRow(q, fills[i], darks[i], empty, full, peaks[i]));
  return { ok: true, code: strip?.code ?? null, rows, warped, quality: sheetQuality(rows, { edgeMm: ms.edgeMm, ink: ms.ink, edge, lost, spread: full - empty }) };
}

const r2 = (v: number) => Math.round(v * 100) / 100;
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** One row: OK (one clear mark) · BLANK (nothing) · MULTIPLE (2+ clear marks) · UNSURE (a teacher must look). */
export function decideRow(q: number, fill: number[], dark: number[], empty: number, full: number, peak: number[] = [0, 0, 0, 0]): OmrRow {
  const s = fill.map((f) => (f - empty) / (full - empty));
  const order = s.map((v, i) => i).sort((a, b) => s[b] - s[a]);
  const best = order[0], second = order[1];
  const marks = order.filter((i) => s[i] >= MARK).sort((a, b) => a - b);
  const byDark = dark.map((v, i) => i).sort((a, b) => dark[b] - dark[a]);
  const out = (answer: OmrRow["answer"], status: OmrRow["status"], confidence: number, suggest: OmrRow["answer"] = status === "OK" ? answer : null): OmrRow =>
    ({ q, answer: status === "OK" ? answer : status === "UNSURE" ? answer : null, marks, status, fill: fill.map(r2), dark: dark.map(r2), peak: peak.map(r2), confidence: r2(clamp01(confidence)), suggest: status === "UNSURE" ? suggest : status === "OK" ? answer : null });
  const ans = best as 0 | 1 | 2 | 3;
  if (marks.length === 0) {
    // a light but complete fill standing alone: an answer (an eraser's smudge is far lower, and has no dark pixels)
    if (s[best] >= LIGHT_ALONE && s[second] < 0.12 && dark[best] >= 0.2) return out(ans, "OK", 0.55 + (s[best] - LIGHT_ALONE));
    if (s[best] >= WEAK) return out(ans, "UNSURE", 0.3, ans);
    // a stroke through one bubble (a tick, a cross, a stray dot): never "blank" — the teacher decides
    if (dark[byDark[0]] >= STROKE && dark[byDark[0]] - dark[byDark[1]] >= 0.07) return out(byDark[0] as 0 | 1 | 2 | 3, "UNSURE", 0.25, byDark[0] as 0 | 1 | 2 | 3);
    const byPeak = peak.map((v, i) => i).sort((a, b) => peak[b] - peak[a]);
    const others = byPeak.slice(1).map((i) => peak[i]).sort((a, b) => a - b);
    if (peak[byPeak[0]] - others[Math.floor(others.length / 2)] >= PEAK_STROKE) return out(byPeak[0] as 0 | 1 | 2 | 3, "UNSURE", 0.25, byPeak[0] as 0 | 1 | 2 | 3);
    return out(null, "BLANK", 1 - Math.max(s[best] / WEAK, dark[byDark[0]] / STROKE) * 0.5);
  }
  if (marks.length === 1) {
    if (s[second] >= WEAK && s[best] - s[second] < CLEAR_GAP) return out(ans, "UNSURE", 0.35, ans);
    // another bubble crossed by a clear stroke (a tick next to the fill): ask
    const other = dark.map((v, i) => (i === best ? 0 : v));
    if (Math.max(...other) >= 0.22) return out(ans, "UNSURE", 0.4, ans);
    return out(ans, "OK", 0.6 + 0.4 * Math.min(clamp01((s[best] - MARK) / 0.35), clamp01((s[best] - s[second] - CLEAR_GAP) / 0.3)));
  }
  return s[best] - s[second] >= MARK ? out(ans, "UNSURE", 0.35, ans) : out(null, "MULTIPLE", 0.8);
}

/**
 * The sheet's confidence and the questions to check: LOW when the photo itself is poor (blurred, little contrast, the
 * printed bubbles hard to align) or many rows are unsure — then every answer must be checked; MEDIUM when a few rows
 * are unsure; HIGH when every row is clear.
 */
export function sheetQuality(rows: OmrRow[], m: { edgeMm: number; ink: number; edge: number; lost: number; spread: number }): OmrQuality {
  const check = rows.filter((r) => r.status === "UNSURE" || r.status === "MULTIPLE").map((r) => r.q);
  const reasons: OmrQuality["reasons"] = [];
  if (m.edgeMm > 1.1) reasons.push("BLUR");
  if (m.ink > 0.5 || m.spread < 0.45) reasons.push("CONTRAST");
  if (m.edge < 0.08 || m.lost > 0.15) reasons.push("ALIGN");
  const unsure = rows.filter((r) => r.status === "UNSURE").length;
  if (rows.length && unsure / rows.length > 0.15) reasons.push("MANY_UNSURE");
  if (rows.some((r) => r.status === "OK" && (r.confidence ?? 1) < 0.6)) reasons.push("LIGHT_MARKS");
  const rowScore = rows.length ? rows.reduce((t, r) => t + (r.confidence ?? 1), 0) / rows.length : 1;
  const score = r2(clamp01(rowScore - (reasons.includes("BLUR") ? 0.25 : 0) - (reasons.includes("CONTRAST") ? 0.25 : 0) - (reasons.includes("ALIGN") ? 0.25 : 0)));
  const low = reasons.some((x) => x === "BLUR" || x === "CONTRAST" || x === "ALIGN" || x === "MANY_UNSURE");
  return { confidence: low ? "LOW" : check.length || reasons.length ? "MEDIUM" : "HIGH", score, check, reasons, metrics: { blurMm: r2(m.edgeMm), ink: r2(m.ink), align: r2(m.edge), lost: r2(m.lost), spread: r2(m.spread) } };
}
