/**
 * Inline emphasis in question text (stems, options, passages, sentences, feedback): "look at the underlined word".
 *
 * Question text is PLAIN text that may carry a few emphasis marks, written by seeds, the importer, the AI writer or
 * a teacher. Recognised (and only these — anything else stays plain text, shown exactly as typed):
 *   underline  <u>x</u>   [u]x[/u]   {u}x{/u}   __x__   (and the escaped form &lt;u&gt;x&lt;/u&gt;)
 *   bold       <b>x</b>   <strong>x</strong>   [b]x[/b]   {b}x{/b}   **x**
 *   italic     <i>x</i>   <em>x</em>   [i]x[/i]   {i}x{/i}   *x*
 * Tags must be bare (no attributes): `<u onclick=…>` is not a mark, it stays visible text. A mark that is never
 * closed (or closed in the wrong order) is shown as the literal characters — never half applied.
 * The parser returns a tree; the screen renders it as React elements (components/rich-inline.tsx) and printed
 * pages as escaped HTML (marksToHtml). Never raw HTML.
 */
export type Mark = "u" | "b" | "i";
export type InlineNode = string | { mark: Mark; children: InlineNode[] };

type Frame = { mark: Mark; open: string; kind: string; children: InlineNode[] };

const TAG: Record<string, Mark> = { u: "u", b: "b", strong: "b", i: "i", em: "i" };
// a bare tag (<u>, </strong>, &lt;u&gt;), a BBCode/brace tag ([u], {/b}), or a Markdown run of * or _
const TOKEN = /<(\/?)(u|b|strong|i|em)>|&lt;(\/?)(u|b|strong|i|em)&gt;|\[(\/?)([ubi])\]|\{(\/?)([ubi])\}|\*\*|\*|__/gi;

const isWord = (c: string | undefined) => !!c && /[\p{L}\p{N}_]/u.test(c);
const isSpace = (c: string | undefined) => c === undefined || /\s/.test(c);

/** Parses `text` into plain strings and emphasis nodes. Never throws; unknown or unmatched marks stay as text. */
export function parseMarks(text: string): InlineNode[] {
  const s = String(text ?? "");
  const root: InlineNode[] = [];
  const stack: Frame[] = [];
  const out = () => (stack.length ? stack[stack.length - 1].children : root);
  const push = (n: InlineNode) => {
    if (n === "") return;
    const list = out();
    if (typeof n === "string" && typeof list[list.length - 1] === "string") list[list.length - 1] = (list[list.length - 1] as string) + n;
    else list.push(n);
  };
  /** Closes the frame at `at`: frames opened after it are undone (their opening marks become text again). */
  const close = (at: number) => {
    while (stack.length - 1 > at) undo();
    const f = stack.pop()!;
    if (f.children.length) push({ mark: f.mark, children: f.children });
  };
  const undo = () => {
    const f = stack.pop()!;
    push(f.open);
    for (const c of f.children) push(c);
  };
  const find = (kind: string) => { for (let k = stack.length - 1; k >= 0; k--) if (stack[k].kind === kind) return k; return -1; };

  let last = 0;
  for (const m of s.matchAll(TOKEN)) {
    const at = m.index ?? 0, tok = m[0];
    push(s.slice(last, at));
    last = at + tok.length;
    const before = s[at - 1], after = s[at + tok.length];
    let mark: Mark | null = null, closing = false, kind = "";
    if (m[2] || m[4]) { const n = (m[2] ?? m[4]).toLowerCase(); mark = TAG[n]; closing = !!(m[1] || m[3]); kind = `${m[2] ? "<" : "&"}${n}`; }
    else if (m[6]) { mark = m[6].toLowerCase() as Mark; closing = !!m[5]; kind = `[${mark}`; }
    else if (m[8]) { mark = m[8].toLowerCase() as Mark; closing = !!m[7]; kind = `{${mark}`; }
    else {
      // Markdown: the same mark opens and closes. It opens only before a non-space (and `*`/`__` not inside a
      // word), and closes only after a non-space — so "2 * 3", "snake_case" and "____" blanks stay plain.
      mark = tok === "**" ? "b" : tok === "*" ? "i" : "u";
      kind = tok;
      const k = find(kind);
      const single = tok !== "**";
      const canClose = k >= 0 && !isSpace(before) && !(single && isWord(after)) && before !== tok[0];
      const canOpen = !isSpace(after) && after !== tok[0] && !(single && isWord(before)) && before !== tok[0];
      if (canClose) { close(k); continue; }
      if (canOpen) { stack.push({ mark, open: tok, kind, children: [] }); continue; }
      push(tok);
      continue;
    }
    if (!closing) { stack.push({ mark, open: tok, kind, children: [] }); continue; }
    const k = find(kind);
    if (k >= 0 && k === stack.length - 1) close(k);
    else push(tok); // a closing mark with nothing (or something else) open: shown as typed
  }
  push(s.slice(last));
  while (stack.length) undo();
  return root;
}

const flat = (nodes: InlineNode[]): string => nodes.map((n) => (typeof n === "string" ? n : flat(n.children))).join("");

/** The text without its emphasis marks — for read-aloud, search, classifiers and detectors. */
export function stripMarks(text: string): string {
  const s = String(text ?? "");
  return hasMarks(s) ? flat(parseMarks(s)) : s;
}

/** Quick test: could this text carry an emphasis mark? (cheap; false means "certainly plain"). */
export const hasMarks = (text: string) => /[<*_[{]|&lt;/.test(String(text ?? ""));

const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const escapeHtml = (s: string) => String(s ?? "").replace(/[&<>"']/g, (c) => ESC[c]);
const HTML_TAG: Record<Mark, string> = { u: "u", b: "strong", i: "em" };

/** Escaped HTML with only <u>/<strong>/<em> tags — for printed pages and PDFs built from HTML templates. */
export function marksToHtml(text: string): string {
  const walk = (nodes: InlineNode[]): string => nodes.map((n) => (typeof n === "string" ? escapeHtml(n) : `<${HTML_TAG[n.mark]}>${walk(n.children)}</${HTML_TAG[n.mark]}>`)).join("");
  return walk(parseMarks(text));
}
