/**
 * ✍️ The writing prompt's light rich text and the essay's sentences (pure functions, no DOM).
 *
 *   sanitizeHtml: an allow-list (p, br, b/strong, i/em, u, ul, ol, li, h2–h4); every attribute is dropped, script /
 *   style / comments are removed with their content, and any other tag is removed (its text kept, escaped).
 *   Used when the teacher saves the prompt AND again when it is shown (defence in depth).
 *
 *   splitSentences: the essay cut into sentences (end punctuation or a line break), so a teacher's comment can be
 *   stored with the sentence's index and text.
 */
const ALLOWED = new Set(["p", "br", "b", "strong", "i", "em", "u", "ul", "ol", "li", "h2", "h3", "h4"]);
const RENAME: Record<string, string> = { strong: "b", em: "i", div: "p", h1: "h2", h5: "h4", h6: "h4" };
const VOID = new Set(["br"]);

const esc = (t: string) => t.replace(/&(?!(?:[a-zA-Z]{2,8}|#\d{1,6}|#x[0-9a-fA-F]{1,6});)/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function sanitizeHtml(input: unknown, maxLen = 20000): string {
  let html = String(input ?? "").slice(0, maxLen * 2);
  html = html.replace(/<!--[\s\S]*?(-->|$)/g, "");
  // dangerous blocks go with their content (repeated in case of nesting tricks)
  for (let i = 0; i < 5; i++) html = html.replace(/<(script|style|iframe|object|embed|template|noscript|textarea|select|svg|math)\b[\s\S]*?(<\/\1\s*>|$)/gi, "");
  const out: string[] = [];
  const open: string[] = [];
  const re = /<\s*(\/?)\s*([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g;
  let last = 0, m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    out.push(esc(html.slice(last, m.index)));
    last = m.index + m[0].length;
    const closing = m[1] === "/";
    let tag = m[2].toLowerCase();
    tag = RENAME[tag] ?? tag;
    if (!ALLOWED.has(tag)) continue;
    if (VOID.has(tag)) { if (!closing) out.push("<br>"); continue; }
    if (!closing) {
      // a new list item / paragraph closes the open one (as browsers do)
      if ((tag === "li" || tag === "p") && open[open.length - 1] === tag) out.push(`</${open.pop()}>`);
      out.push(`<${tag}>`); open.push(tag); continue;
    }
    const at = open.lastIndexOf(tag);
    if (at < 0) continue; // a stray closing tag
    while (open.length > at) out.push(`</${open.pop()}>`);
  }
  out.push(esc(html.slice(last)));
  while (open.length) out.push(`</${open.pop()}>`);
  return out.join("").replace(/(<p>\s*<\/p>)+/g, "").trim().slice(0, maxLen);
}

/** The plain text of sanitized HTML (for the old pages, notifications and the AI). */
export function htmlToText(html: string): string {
  return String(html ?? "")
    .replace(/<br>/gi, "\n").replace(/<\/(p|h2|h3|h4|li)>/gi, "\n").replace(/<li>/gi, "• ")
    .replace(/<[^>]*>/g, "")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
    .replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** The essay's sentences (index = position in this list). Empty pieces are dropped. */
export function splitSentences(text: string): string[] {
  return String(text ?? "")
    .split(/\n+/)
    .flatMap((para) => para.match(/[^.!?]+(?:[.!?]+["')\]]*|$)/g) ?? [])
    .map((x) => x.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

export const countWords = (t: string) => String(t ?? "").trim().split(/\s+/).filter(Boolean).length;

/**
 * Where an evidence quote is in a text: [start, end) or null. Case, spacing and quotation marks are ignored (the same
 * rule the AI validator uses to accept a quote), so the grading page can highlight it in the essay.
 */
export function findQuote(text: string, quote: string): [number, number] | null {
  const Q = "[\"“”‘’'`]*";
  const words = String(quote ?? "").replace(/["“”‘’'`]/g, "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return null;
  const esc = (w: string) => [...w].map((ch) => ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(Q);
  const m = new RegExp(words.map(esc).join(`${Q}\\s+${Q}`), "i").exec(String(text ?? ""));
  return m ? [m.index, m.index + m[0].length] : null;
}
