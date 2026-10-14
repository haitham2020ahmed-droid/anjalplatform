/**
 * 📷 Realistic synthetic phone photos of filled bubble sheets (tests only): the printed sheet is drawn at ~6 px/mm
 * as reflectance, filled with PENCIL marks as children make them — full, partly filled, light, scribbled, over the
 * edge, erased (a grey smudge left behind), erased and re-marked, stray dots — then "photographed": lying on a table
 * (wood grain, a pen and dark objects around it), rotated (up to ±15° or sideways / upside down), seen in
 * perspective (phone tilted), a slight page curl, uneven light (gradient + vignetting + the hard-edged shadow of the
 * phone or a hand), warm colour cast, lens blur, sensor noise, and finally JPEG compression (as a phone saves it:
 * YCbCr, 4:2:0 chroma subsampling, 8 × 8 DCT quantised with the standard IJG tables at the chosen quality — the
 * lossy part of JPEG, in plain TypeScript: no image package needed). Deterministic (seeded).
 */
import { A4_H, A4_W, stripBits, type SheetLayout } from "../../src/lib/omr/layout";

export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** How a child marked one bubble. */
export type PencilMark =
  | "full" // a dark, full pencil fill
  | "partial" // 55–80 % of the bubble filled (one side left white)
  | "light" // a complete but LIGHT pencil fill (a real answer, pressed softly)
  | "scribble" // zig-zag strokes inside the bubble, white between them
  | "over" // filled and over the edge
  | "tick" // a tick across the bubble (not a fill)
  | "erased" // filled, then rubbed out: a grey smudge remains
  | "dot"; // a small stray dot (pencil touched the paper)

export interface Sheet { w: number; h: number; ppm: number; r: Float32Array }

export function renderSheet(layout: SheetLayout, code: string, marks: Map<string, PencilMark>, seed = 1, ppm = 6): Sheet {
  const rnd = rng(seed);
  const w = Math.round(A4_W * ppm), h = Math.round(A4_H * ppm);
  const r = new Float32Array(w * h);
  // paper with a faint fibre texture
  for (let i = 0; i < r.length; i++) r[i] = 0.9 + (rnd() - 0.5) * 0.025;
  const blend = (px: number, py: number, v: number, cov: number) => {
    if (px < 0 || py < 0 || px >= w || py >= h || cov <= 0) return;
    const i = py * w + px;
    r[i] = Math.min(r[i], r[i] * (1 - cov) + v * cov);
  };
  const rect = (x: number, y: number, ww: number, hh: number, v: number) => {
    for (let py = Math.round(y * ppm); py < Math.round((y + hh) * ppm); py++) for (let px = Math.round(x * ppm); px < Math.round((x + ww) * ppm); px++) blend(px, py, v, 1);
  };
  /** disc (stroke null) or ring of radius rad (mm); inside(dx, dy) limits the area; tex = graphite grain */
  const circle = (cx: number, cy: number, rad: number, v: number, stroke: number | null, inside?: (dx: number, dy: number) => boolean, tex = 0) => {
    const R = (rad + 1.5) * ppm;
    for (let py = Math.floor(cy * ppm - R); py <= cy * ppm + R; py++) for (let px = Math.floor(cx * ppm - R); px <= cx * ppm + R; px++) {
      const dx = (px + 0.5) / ppm - cx, dy = (py + 0.5) / ppm - cy, d = Math.hypot(dx, dy);
      const cov = stroke === null ? Math.max(0, Math.min(1, (rad - d) * ppm + 0.5)) : Math.max(0, Math.min(1, (stroke / 2 - Math.abs(d - rad)) * ppm + 0.5));
      if (cov <= 0 || (inside && !inside(dx, dy))) continue;
      blend(px, py, v + (tex ? (rnd() - 0.5) * tex : 0), cov);
    }
  };
  const line = (x0: number, y0: number, x1: number, y1: number, width: number, v: number, tex = 0.15) => {
    const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * ppm * 2);
    for (let k = 0; k <= n; k++) circle(x0 + ((x1 - x0) * k) / n, y0 + ((y1 - y0) * k) / n, width / 2, v, null, undefined, tex);
  };
  for (const m of layout.markers) rect(m.x, m.y, m.size, m.size, 0.06);
  rect(24, 12, 16, 16, 0.3); // logo
  for (let i = 0; i < 18; i++) rect(44 + i * 4.5, 13, 3.4, 5, 0.12); // title
  rect(44, 27, 60, 0.3, 0.2); rect(130, 27, 50, 0.3, 0.2); // name / class lines
  for (let i = 0; i < 9; i++) rect(27 + i * 4.8, 38, 3.6, 5, 0.14); // printed code
  const bits = stripBits(code, layout.questions);
  layout.idBits.forEach((b, i) => circle(b.cx, b.cy, b.r, 0.08, bits[i] ? null : 0.3));
  for (let i = 0; i < 30; i++) rect(24 + i * 5.2, 52, 4, 3, 0.16); // instruction line
  for (const hd of layout.headers) rect(hd.x - 1, hd.y - 1.5, 2, 3, 0.15);
  for (const lb of layout.labels) rect(lb.x - 3, lb.y - 1.5, 3, 3, 0.12);
  for (const b of layout.bubbles) {
    circle(b.cx, b.cy, b.r, 0.14, 0.45);
    rect(b.cx - 0.6, b.cy - 1.1, 1.2, 2.2, 0.55); // the light letter inside
    const m = marks.get(`${b.q}:${b.choice}`);
    if (!m) continue;
    const jx = (rnd() - 0.5) * 0.6, jy = (rnd() - 0.5) * 0.6; // a child's hand is never centred
    const pencil = 0.2 + rnd() * 0.1; // HB pencil: dark grey, not black
    if (m === "full") circle(b.cx + jx, b.cy + jy, b.r * (0.92 + rnd() * 0.12), pencil, null, undefined, 0.25);
    if (m === "over") circle(b.cx + jx, b.cy + jy, b.r * 1.3, pencil, null, undefined, 0.25);
    if (m === "partial") { const keep = 0.2 + rnd() * 0.45; const side = rnd() < 0.5 ? 1 : -1; circle(b.cx + jx, b.cy + jy, b.r * 0.97, pencil, null, (dx) => side * dx < b.r * keep, 0.25); }
    if (m === "light") circle(b.cx + jx, b.cy + jy, b.r * 0.95, 0.5 + rnd() * 0.08, null, undefined, 0.12);
    if (m === "scribble") for (let k = 0; k < 6; k++) { const y = b.cy - b.r * 0.8 + (k * 1.6 * b.r) / 5; const hw = Math.sqrt(Math.max(0, b.r * b.r - (y - b.cy) ** 2)) * 0.95; line(b.cx - hw + jx, y + jy, b.cx + hw + jx, y + jy + (k % 2 ? 0.5 : -0.5), 0.75, pencil); }
    if (m === "tick") { line(b.cx - b.r * 0.8, b.cy, b.cx - b.r * 0.15, b.cy + b.r * 0.7, 0.5, pencil); line(b.cx - b.r * 0.15, b.cy + b.r * 0.7, b.cx + b.r * 1.1, b.cy - b.r * 1.0, 0.5, pencil); }
    if (m === "erased") circle(b.cx + jx, b.cy + jy, b.r * 1.15, 0.74 + rnd() * 0.06, null, undefined, 0.08); // the grey smudge left by the eraser
    if (m === "dot") circle(b.cx + b.r * (rnd() - 0.5), b.cy + b.r * (rnd() - 0.5), 0.35, pencil, null);
  }
  return { w, h, ppm, r };
}

type P = [number, number];
function solveH(src: P[], dst: P[]): number[] {
  const A: number[][] = [];
  for (let i = 0; i < 4; i++) { const [x, y] = src[i], [u, v] = dst[i]; A.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u], [0, 0, 0, x, y, 1, -v * x, -v * y, v]); }
  for (let c = 0; c < 8; c++) {
    let p = c; for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]];
    for (let r = 0; r < 8; r++) if (r !== c) { const f = A[r][c] / A[c][c]; for (let k = c; k < 9; k++) A[r][k] -= f * A[c][k]; }
  }
  return [...A.map((row, i) => row[8] / row[i]), 1];
}

export interface Camera {
  W: number; H: number;
  /** degrees (clockwise); ±15 plus 90 / 180 for sideways or upside-down photos */
  rot: number;
  /** how much of the frame the paper fills (0..1) */
  fill: number;
  /** perspective: 0 = straight above, 0.12 = phone clearly tilted */
  tilt: number;
  /** page curl: mm of bulge in the middle */
  curl: number;
  /** uneven light: 0 = even, 0.6 = strong gradient + vignette */
  light: number;
  /** the hard-edged shadow of the phone / a hand over part of the sheet: 0 = none, 0.5 = dark */
  shadow: number;
  blur: number; noise: number;
  /** JPEG quality (sharp); 0 = no compression */
  jpeg: number;
  seed: number; cx?: number; cy?: number;
}

/** The sheet lying on a table, photographed by a phone (RGBA, as the browser's canvas gives it). */
export async function photograph(sheet: Sheet, cam: Camera): Promise<ImageData> {
  const rnd = rng(cam.seed);
  const { W, H } = cam;
  const scale = cam.fill * Math.min(W / A4_W, H / A4_H);
  const th = (cam.rot * Math.PI) / 180, c = Math.cos(th), si = Math.sin(th);
  const cx = (cam.cx ?? 0.5) * W, cy = (cam.cy ?? 0.5) * H;
  const corners: P[] = [[0, 0], [A4_W, 0], [A4_W, A4_H], [0, A4_H]];
  const dst = corners.map(([x, y], k): P => {
    const dx = (x - A4_W / 2) * scale, dy = (y - A4_H / 2) * scale;
    const k1 = y === 0 ? 1 - cam.tilt : 1 + cam.tilt * 0.3;
    const j = cam.tilt * 40 * (k % 2 ? 1 : -1) + (rnd() - 0.5) * cam.tilt * 30;
    return [cx + dx * k1 * c - dy * si + j, cy + dx * k1 * si + dy * c + j * 0.5];
  });
  const Hinv = solveH(dst, corners.map(([x, y]): P => [x * sheet.ppm, y * sheet.ppm]));
  // the shadow: a half-plane with a soft edge, across one part of the sheet
  const sa = rnd() * Math.PI * 2, sx = Math.cos(sa), sy = Math.sin(sa), soff = (0.15 + rnd() * 0.25) * Math.min(W, H);
  const objects: [number, number, number, number, number][] = Array.from({ length: 3 }, () => [rnd(), rnd(), 20 + rnd() * 60, 20 + rnd() * 120, 0.05 + rnd() * 0.15]); // dark things on the table
  const g = new Float32Array(W * H);
  const curlPx = cam.curl * sheet.ppm;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const z = Hinv[6] * x + Hinv[7] * y + 1;
    let u = (Hinv[0] * x + Hinv[1] * y + Hinv[2]) / z, v = (Hinv[3] * x + Hinv[4] * y + Hinv[5]) / z;
    // page curl: the paper bulges across its width (a sine in u moves v)
    if (curlPx) v += curlPx * Math.sin((Math.PI * u) / sheet.w) * (0.5 - Math.abs(v / sheet.h - 0.5));
    let refl: number;
    if (u >= 0 && v >= 0 && u < sheet.w - 1 && v < sheet.h - 1) {
      const x0 = u | 0, y0 = v | 0, fx = u - x0, fy = v - y0, i = y0 * sheet.w + x0;
      refl = (sheet.r[i] * (1 - fx) + sheet.r[i + 1] * fx) * (1 - fy) + (sheet.r[i + sheet.w] * (1 - fx) + sheet.r[i + sheet.w + 1] * fx) * fy;
    } else {
      // a wooden table: grain + knots, and a few dark objects (a pen, a phone case)
      refl = 0.34 + 0.07 * Math.sin(x / 19 + Math.sin(y / 53) * 3) + 0.03 * Math.sin(y / 7 + x / 90);
      for (const [ox, oy, ow, oh, ov] of objects) if (Math.abs(x - ox * W) < ow / 2 && Math.abs(y - oy * H) < oh / 2) refl = ov;
    }
    const gx = x / W, gy = y / H;
    let illum = 1 - cam.light * (0.55 * gx + 0.35 * gy);
    const vd = Math.hypot(gx - 0.5, gy - 0.5);
    illum *= 1 - cam.light * 0.5 * vd * vd; // vignetting
    if (cam.shadow) { const d = (x - W / 2) * sx + (y - H / 2) * sy - soff; illum *= 1 - cam.shadow / (1 + Math.exp(-d / 6)); }
    g[y * W + x] = 245 * refl * illum;
  }
  let img: Float32Array = g;
  if (cam.blur > 0) img = boxBlur(boxBlur(g, W, H, cam.blur), W, H, cam.blur);
  const data = new Uint8ClampedArray(W * H * 4);
  for (let i = 0, p = 0; i < W * H; i++, p += 4) {
    const n = (rnd() + rnd() + rnd() - 1.5) * cam.noise;
    const v = img[i] + n;
    data[p] = v * 1.04; data[p + 1] = v * 0.99; data[p + 2] = v * 0.88; data[p + 3] = 255; // warm indoor light
  }
  if (cam.jpeg) jpegLike(data, W, H, cam.jpeg);
  return { data, width: W, height: H, colorSpace: "srgb" } as ImageData;
}

// ---------------------------------------------------------------- JPEG's lossy steps (baseline, IJG quality scaling)

const LUMA_Q = [16, 11, 10, 16, 24, 40, 51, 61, 12, 12, 14, 19, 26, 58, 60, 55, 14, 13, 16, 24, 40, 57, 69, 56, 14, 17, 22, 29, 51, 87, 80, 62, 18, 22, 37, 56, 68, 109, 103, 77, 24, 35, 55, 64, 81, 104, 113, 92, 49, 64, 78, 87, 103, 121, 120, 101, 72, 92, 95, 98, 112, 100, 103, 99];
const CHROMA_Q = [17, 18, 24, 47, 99, 99, 99, 99, 18, 21, 26, 66, 99, 99, 99, 99, 24, 26, 56, 99, 99, 99, 99, 99, 47, 66, 99, 99, 99, 99, 99, 99, ...Array(32).fill(99)];
const COS = Array.from({ length: 64 }, (_, i) => { const x = i >> 3, u = i & 7; return Math.cos(((2 * x + 1) * u * Math.PI) / 16) * (u === 0 ? Math.SQRT1_2 : 1) / 2; });
const scaled = (t: number[], q: number) => { const f = q < 50 ? 5000 / q : 200 - 2 * q; return t.map((v) => Math.max(1, Math.min(255, Math.floor((v * f + 50) / 100)))); };

/** One plane through 8 × 8 DCT → quantise → dequantise → inverse DCT (in place). */
function dctPlane(p: Float32Array, w: number, h: number, q: number[]): void {
  const b = new Float64Array(64), t = new Float64Array(64);
  for (let by = 0; by < h; by += 8) for (let bx = 0; bx < w; bx += 8) {
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) b[y * 8 + x] = p[Math.min(h - 1, by + y) * w + Math.min(w - 1, bx + x)] - 128;
    // forward: rows then columns
    for (let y = 0; y < 8; y++) for (let u = 0; u < 8; u++) { let s = 0; for (let x = 0; x < 8; x++) s += b[y * 8 + x] * COS[x * 8 + u]; t[y * 8 + u] = s; }
    for (let u = 0; u < 8; u++) for (let v = 0; v < 8; v++) { let s = 0; for (let y = 0; y < 8; y++) s += t[y * 8 + u] * COS[y * 8 + v]; b[v * 8 + u] = Math.round(s / q[v * 8 + u]) * q[v * 8 + u]; }
    // inverse
    for (let u = 0; u < 8; u++) for (let y = 0; y < 8; y++) { let s = 0; for (let v = 0; v < 8; v++) s += b[v * 8 + u] * COS[y * 8 + v]; t[y * 8 + u] = s; }
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { let s = 0; for (let u = 0; u < 8; u++) s += t[y * 8 + u] * COS[x * 8 + u]; if (by + y < h && bx + x < w) p[(by + y) * w + bx + x] = s + 128; }
  }
}

/** JPEG compression artefacts at `quality` (1–100): YCbCr, 4:2:0, quantised DCT — on RGBA data, in place. */
export function jpegLike(data: Uint8ClampedArray, W: number, H: number, quality: number): void {
  const Y = new Float32Array(W * H), cw = Math.ceil(W / 2), ch = Math.ceil(H / 2);
  const Cb = new Float32Array(cw * ch), Cr = new Float32Array(cw * ch), n = new Float32Array(cw * ch);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const p = (y * W + x) * 4, r = data[p], g = data[p + 1], bl = data[p + 2], c = (y >> 1) * cw + (x >> 1);
    Y[y * W + x] = 0.299 * r + 0.587 * g + 0.114 * bl;
    Cb[c] += 128 - 0.168736 * r - 0.331264 * g + 0.5 * bl; Cr[c] += 128 + 0.5 * r - 0.418688 * g - 0.081312 * bl; n[c]++;
  }
  for (let i = 0; i < Cb.length; i++) { Cb[i] /= n[i]; Cr[i] /= n[i]; }
  dctPlane(Y, W, H, scaled(LUMA_Q, quality));
  dctPlane(Cb, cw, ch, scaled(CHROMA_Q, quality));
  dctPlane(Cr, cw, ch, scaled(CHROMA_Q, quality));
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const p = (y * W + x) * 4, c = (y >> 1) * cw + (x >> 1), yy = Y[y * W + x], cb = Cb[c] - 128, cr = Cr[c] - 128;
    data[p] = yy + 1.402 * cr; data[p + 1] = yy - 0.344136 * cb - 0.714136 * cr; data[p + 2] = yy + 1.772 * cb;
  }
}

function boxBlur(src: Float32Array, W: number, H: number, r: number): Float32Array {
  const tmp = new Float32Array(W * H), out = new Float32Array(W * H), n = 2 * r + 1;
  for (let y = 0; y < H; y++) { let s = 0; for (let x = -r; x <= r; x++) s += src[y * W + Math.min(W - 1, Math.max(0, x))]; for (let x = 0; x < W; x++) { tmp[y * W + x] = s / n; s += src[y * W + Math.min(W - 1, x + r + 1)] - src[y * W + Math.max(0, x - r)]; } }
  for (let x = 0; x < W; x++) { let s = 0; for (let y = -r; y <= r; y++) s += tmp[Math.min(H - 1, Math.max(0, y)) * W + x]; for (let y = 0; y < H; y++) { out[y * W + x] = s / n; s += tmp[Math.min(H - 1, y + r + 1) * W + x] - tmp[Math.max(0, y - r) * W + x]; } }
  return out;
}

/** Largest `fill` that keeps the rotated, tilted paper inside the frame. */
export function fits(W: number, H: number, rot: number): number {
  const c = Math.abs(Math.cos((rot * Math.PI) / 180)), s = Math.abs(Math.sin((rot * Math.PI) / 180));
  return (0.9 * Math.min(W / (A4_W * c + A4_H * s), H / (A4_W * s + A4_H * c))) / Math.min(W / A4_W, H / A4_H);
}

/**
 * What a child wrote on the sheet and what a careful teacher reads from it:
 *   answer  the intended answer (null = no answer)
 *   kind    how it was marked (the hard cases are named so a test can report them)
 */
export interface Truth { answer: 0 | 1 | 2 | 3 | null; kind: string; multiple?: boolean }
export function fillSheet(n: number, seed: number, mix: Partial<Record<string, number>> = {}): { marks: Map<string, PencilMark>; truth: Map<number, Truth>; key: (0 | 1 | 2 | 3)[] } {
  const rnd = rng(seed);
  const marks = new Map<string, PencilMark>();
  const truth = new Map<number, Truth>();
  const key: (0 | 1 | 2 | 3)[] = [];
  // the share of each kind of row (the rest: a plain full fill)
  const p = { partial: 0.08, light: 0.05, scribble: 0.05, over: 0.04, erasedRemark: 0.05, erasedOnly: 0.03, blank: 0.03, double: 0.02, dot: 0.03, tick: 0.02, ...mix } as Record<string, number>;
  for (let q = 1; q <= n; q++) {
    const a = Math.floor(rnd() * 4) as 0 | 1 | 2 | 3, b = ((a + 1 + Math.floor(rnd() * 3)) % 4) as 0 | 1 | 2 | 3;
    key.push(Math.floor(rnd() * 4) as 0 | 1 | 2 | 3);
    let x = rnd(), kind = "full";
    for (const [k, share] of Object.entries(p)) { if (x < share) { kind = k; break; } x -= share; }
    const set = (choice: number, m: PencilMark) => marks.set(`${q}:${choice}`, m);
    switch (kind) {
      case "partial": set(a, "partial"); truth.set(q, { answer: a, kind }); break;
      case "light": set(a, "light"); truth.set(q, { answer: a, kind }); break;
      case "scribble": set(a, "scribble"); truth.set(q, { answer: a, kind }); break;
      case "over": set(a, "over"); truth.set(q, { answer: a, kind }); break;
      case "erasedRemark": set(b, "erased"); set(a, "full"); truth.set(q, { answer: a, kind }); break;
      case "erasedOnly": set(a, "erased"); truth.set(q, { answer: null, kind }); break;
      case "blank": truth.set(q, { answer: null, kind }); break;
      case "double": set(a, "full"); set(b, "full"); truth.set(q, { answer: null, kind, multiple: true }); break;
      case "dot": set(a, "full"); set(b, "dot"); truth.set(q, { answer: a, kind }); break;
      case "tick": set(a, "tick"); truth.set(q, { answer: a, kind }); break;
      default: set(a, "full"); truth.set(q, { answer: a, kind: "full" });
    }
  }
  return { marks, truth, key };
}
