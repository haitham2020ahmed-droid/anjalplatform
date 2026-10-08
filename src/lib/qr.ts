/**
 * A small QR Code encoder (ISO/IEC 18004): byte mode, error correction level M, versions 1–10, best of the
 * 8 masks. Enough for a join link (up to 213 characters). No dependency, no external service.
 * Returns the module matrix (true = dark).
 */
const EC_M: [number, number, number, number, number][] = [
  // [ecPerBlock, blocks1, dataPerBlock1, blocks2, dataPerBlock2]  (level M, versions 1..10)
  [10, 1, 16, 0, 0], [16, 1, 28, 0, 0], [26, 1, 44, 0, 0], [18, 2, 32, 0, 0], [24, 2, 43, 0, 0],
  [16, 4, 27, 0, 0], [18, 4, 31, 0, 0], [22, 2, 38, 2, 39], [22, 3, 36, 2, 37], [26, 4, 43, 1, 44],
];
const ALIGN: number[][] = [[], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];

// GF(256) with the QR polynomial 0x11d
const EXP = new Array<number>(512), LOG = new Array<number>(256);
(() => { let x = 1; for (let i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11d; } for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255]; })();
const mul = (a: number, b: number) => (a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]]);
function rsGenerator(n: number): number[] {
  let g = [1];
  for (let i = 0; i < n; i++) { const next = new Array(g.length + 1).fill(0); for (let j = 0; j < g.length; j++) { next[j] ^= g[j]; next[j + 1] ^= mul(g[j], EXP[i]); } g = next; }
  return g;
}
function rsRemainder(data: number[], n: number): number[] {
  const gen = rsGenerator(n), res = [...data, ...new Array(n).fill(0)];
  for (let i = 0; i < data.length; i++) { const c = res[i]; if (c) for (let j = 0; j < gen.length; j++) res[i + j] ^= mul(gen[j], c); }
  return res.slice(data.length);
}
const bch = (value: number, poly: number, bits: number) => { let v = value << bits; const top = Math.floor(Math.log2(poly)); while (v && Math.floor(Math.log2(v)) >= top) v ^= poly << (Math.floor(Math.log2(v)) - top); return (value << bits) | v; };

export function qrMatrix(text: string): boolean[][] {
  const bytes = Array.from(new TextEncoder().encode(text));
  let version = 0;
  for (let v = 1; v <= 10; v++) {
    const [, b1, d1, b2, d2] = EC_M[v - 1]; const cap = b1 * d1 + b2 * d2;
    if (4 + (v < 10 ? 8 : 16) + 8 * bytes.length <= cap * 8) { version = v; break; }
  }
  if (!version) throw new Error("Text too long for this QR encoder.");
  const [ecn, b1, d1, b2, d2] = EC_M[version - 1];
  const dataCap = b1 * d1 + b2 * d2;
  // data bits
  const bits: number[] = [];
  const put = (val: number, len: number) => { for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
  put(0b0100, 4); put(bytes.length, version < 10 ? 8 : 16); for (const b of bytes) put(b, 8);
  put(0, Math.min(4, dataCap * 8 - bits.length));
  while (bits.length % 8) bits.push(0);
  const data: number[] = [];
  for (let i = 0; i < bits.length; i += 8) data.push(parseInt(bits.slice(i, i + 8).join(""), 2));
  for (let pad = 0xec; data.length < dataCap; pad = pad === 0xec ? 0x11 : 0xec) data.push(pad);
  // blocks + error correction, interleaved
  const blocks: number[][] = []; let k = 0;
  for (let i = 0; i < b1; i++) { blocks.push(data.slice(k, k + d1)); k += d1; }
  for (let i = 0; i < b2; i++) { blocks.push(data.slice(k, k + d2)); k += d2; }
  const ecs = blocks.map((b) => rsRemainder(b, ecn));
  const out: number[] = [];
  for (let i = 0; i < Math.max(d1, d2); i++) for (const b of blocks) if (i < b.length) out.push(b[i]);
  for (let i = 0; i < ecn; i++) for (const e of ecs) out.push(e[i]);
  // matrix with function patterns
  const n = version * 4 + 17;
  const m: (boolean | null)[][] = Array.from({ length: n }, () => new Array(n).fill(null));
  const fn: boolean[][] = Array.from({ length: n }, () => new Array(n).fill(false));
  const set = (r: number, c: number, v: boolean) => { m[r][c] = v; fn[r][c] = true; };
  const finder = (r: number, c: number) => { for (let i = -1; i <= 7; i++) for (let j = -1; j <= 7; j++) { const rr = r + i, cc = c + j; if (rr < 0 || cc < 0 || rr >= n || cc >= n) continue; const inside = i >= 0 && i <= 6 && j >= 0 && j <= 6; set(rr, cc, inside && (i === 0 || i === 6 || j === 0 || j === 6 || (i >= 2 && i <= 4 && j >= 2 && j <= 4))); } };
  finder(0, 0); finder(0, n - 7); finder(n - 7, 0);
  for (let i = 8; i < n - 8; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
  const al = ALIGN[version - 1];
  for (const r of al) for (const c of al) {
    if ((r === 6 && c === 6) || (r === 6 && c === n - 7) || (r === n - 7 && c === 6)) continue;
    for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) set(r + i, c + j, Math.max(Math.abs(i), Math.abs(j)) !== 1);
  }
  // reserve format and version areas
  for (let i = 0; i < 9; i++) { if (!fn[8][i]) set(8, i, false); if (!fn[i][8]) set(i, 8, false); }
  for (let i = 0; i < 8; i++) { set(8, n - 1 - i, false); set(n - 1 - i, 8, false); }
  set(n - 8, 8, true); // dark module
  if (version >= 7) { const v = bch(version, 0x1f25, 12); for (let i = 0; i < 18; i++) { const b = ((v >> i) & 1) === 1; set(n - 11 + (i % 3), Math.floor(i / 3), b); set(Math.floor(i / 3), n - 11 + (i % 3), b); } }
  // data placement (zigzag)
  const allBits: number[] = []; for (const b of out) for (let i = 7; i >= 0; i--) allBits.push((b >> i) & 1);
  let bi = 0;
  for (let right = n - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < n; vert++) for (let j = 0; j < 2; j++) {
      const c = right - j, upward = ((right + 1) & 2) === 0, r = upward ? n - 1 - vert : vert;
      if (!fn[r][c]) { m[r][c] = bi < allBits.length ? allBits[bi] === 1 : false; bi++; }
    }
  }
  const MASKS: ((r: number, c: number) => boolean)[] = [(r, c) => (r + c) % 2 === 0, (r) => r % 2 === 0, (_r, c) => c % 3 === 0, (r, c) => (r + c) % 3 === 0, (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0, (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0, (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0, (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0];
  const withMask = (mask: number): boolean[][] => {
    const g = m.map((row, r) => row.map((v, c) => (fn[r][c] ? Boolean(v) : Boolean(v) !== MASKS[mask](r, c))));
    const f = bch((0b00 << 3) | mask, 0x537, 10) ^ 0x5412;   // level M = 00
    const fb = (i: number) => ((f >> i) & 1) === 1;
    // first copy down column 8 / along row 8 near the top-left finder; second copy split by the other finders
    for (let i = 0; i <= 5; i++) g[i][8] = fb(i);
    g[7][8] = fb(6); g[8][8] = fb(7); g[8][7] = fb(8);
    for (let i = 9; i < 15; i++) g[8][14 - i] = fb(i);
    for (let i = 0; i < 8; i++) g[8][n - 1 - i] = fb(i);
    for (let i = 8; i < 15; i++) g[n - 15 + i][8] = fb(i);
    g[n - 8][8] = true;
    return g;
  };
  const penalty = (g: boolean[][]) => {
    let p = 0;
    for (let pass = 0; pass < 2; pass++) for (let i = 0; i < n; i++) { let run = 1; for (let j = 1; j < n; j++) { const a = pass ? g[j][i] : g[i][j], b = pass ? g[j - 1][i] : g[i][j - 1]; if (a === b) { run++; if (run === 5) p += 3; else if (run > 5) p++; } else run = 1; } }
    for (let i = 0; i < n - 1; i++) for (let j = 0; j < n - 1; j++) { const v = g[i][j]; if (v === g[i + 1][j] && v === g[i][j + 1] && v === g[i + 1][j + 1]) p += 3; }
    const pat = [true, false, true, true, true, false, true];
    for (let i = 0; i < n; i++) for (let j = 0; j + 10 < n; j++) for (const pass of [0, 1]) {
      const at = (k: number) => (pass ? g[j + k][i] : g[i][j + k]);
      const core = pat.every((v, k) => at(k) === v), core2 = pat.every((v, k) => at(k + 4) === v);
      if (core && !at(7) && !at(8) && !at(9) && !at(10)) p += 40;
      if (core2 && !at(0) && !at(1) && !at(2) && !at(3)) p += 40;
    }
    const dark = g.flat().filter(Boolean).length; p += Math.floor(Math.abs((dark * 20) / (n * n) - 10)) * 10;
    return p;
  };
  let best = withMask(0), bestP = penalty(best);
  for (let k2 = 1; k2 < 8; k2++) { const g = withMask(k2), pv = penalty(g); if (pv < bestP) { best = g; bestP = pv; } }
  return best;
}

/** The QR code as an SVG path (with a 4-module quiet zone), to draw with <svg viewBox="0 0 total total">. */
export function qrPath(text: string): { total: number; d: string } {
  const g = qrMatrix(text), n = g.length, q = 4;
  let d = "";
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (g[r][c]) d += `M${c + q} ${r + q}h1v1h-1z`;
  return { total: n + q * 2, d };
}
