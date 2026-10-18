/**
 * 🔤 Word-level diff for Daily Dictation: compares what the student typed with the original item text and marks
 * every token OK / MISSING (in the original, not typed) / EXTRA (typed, not in the original) / MISSPELLED (a
 * missing word immediately followed by an unrelated-but-similar extra word — a likely spelling slip rather than a
 * different word entirely). Punctuation is tokenised on its own, so "a missing comma" and "a misspelled word" are
 * always two different diff ops, never lumped together. Pure — no I/O, easy to unit test on its own.
 */
export type Token = { text: string; kind: "word" | "punct" };
export type DiffKind = "ok" | "missing" | "extra" | "misspelled";
export interface DiffOp {
  kind: DiffKind;
  /** the original token's text (missing / ok / misspelled) */
  text?: string;
  /** what the student typed instead (extra / misspelled) */
  typedText?: string;
}

/** Not global/stateful on purpose: `.match` on a fresh slice each time, no `lastIndex` to leak between calls. */
const WORD_START = /^[A-Za-z]+(?:['-][A-Za-z]+)*/;

/** Splits text into word tokens and punctuation tokens (., , ! ? ; : " ' — each its own token), in order. */
export function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < text.length) {
    const m = WORD_START.exec(text.slice(i));
    if (m) { tokens.push({ text: m[0], kind: "word" }); i += m[0].length; continue; }
    const ch = text[i];
    if (/\s/.test(ch)) { i++; continue; }
    tokens.push({ text: ch, kind: "punct" });
    i++;
  }
  return tokens;
}

/** Levenshtein edit distance (small strings only — spelling-slip detection). */
function editDistance(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...new Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++)
    dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
  return dp[m][n];
}

/** A typed word close enough to the original to read as a spelling slip rather than a different word. */
const SPELLING_MAX_DISTANCE = 2;
const looksMisspelled = (original: string, typed: string): boolean =>
  original.toLowerCase() !== typed.toLowerCase() && editDistance(original.toLowerCase(), typed.toLowerCase()) <= SPELLING_MAX_DISTANCE;

const norm = (t: Token) => t.text.toLowerCase();

/**
 * Longest-common-subsequence alignment (classic O(n·m) DP — the inputs are a few words long, never large) between
 * the original tokens and what the student typed, then turned into OK / MISSING / EXTRA ops; an adjacent
 * MISSING + EXTRA pair of two *word* tokens that look alike is merged into one MISSPELLED op.
 */
export function diffTokens(original: Token[], typed: Token[]): DiffOp[] {
  const n = original.length, m = typed.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = norm(original[i]) === norm(typed[j]) ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const raw: DiffOp[] = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (norm(original[i]) === norm(typed[j])) { raw.push({ kind: "ok", text: original[i].text }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { raw.push({ kind: "missing", text: original[i].text }); i++; }
    else { raw.push({ kind: "extra", typedText: typed[j].text }); j++; }
  }
  while (i < n) { raw.push({ kind: "missing", text: original[i].text }); i++; }
  while (j < m) { raw.push({ kind: "extra", typedText: typed[j].text }); j++; }

  // merge an adjacent missing-word + extra-word pair that look alike into one "misspelled" op
  const ops: DiffOp[] = [];
  for (let k = 0; k < raw.length; k++) {
    const cur = raw[k], next = raw[k + 1];
    if (cur.kind === "missing" && next?.kind === "extra" && cur.text && next.typedText && looksMisspelled(cur.text, next.typedText)) {
      ops.push({ kind: "misspelled", text: cur.text, typedText: next.typedText });
      k++; // consume the paired "extra" too
      continue;
    }
    ops.push(cur);
  }
  return ops;
}

/** Everything the student needs to see and store for one attempt. */
export function gradeDictation(original: string, typed: string): { ops: DiffOp[]; errorCount: number; clean: boolean } {
  const ops = diffTokens(tokenize(original), tokenize(typed));
  const errorCount = ops.filter((o) => o.kind !== "ok").length;
  return { ops, errorCount, clean: errorCount === 0 };
}
