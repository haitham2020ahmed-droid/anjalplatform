import React, { type ReactNode } from "react";

/**
 * Shows the writing prompt's sanitized HTML (src/server/writing/rich-text.ts sanitizeHtml: only p, br, b, i, u, ul,
 * ol, li, h2–h4, no attributes) as React elements — no raw HTML is ever injected into the page.
 */
const TAGS = new Set(["p", "br", "b", "i", "u", "ul", "ol", "li", "h2", "h3", "h4"]);
const decode = (t: string) => t
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ")
  .replace(/&#(\d{1,6});/g, (_, n: string) => String.fromCodePoint(Math.min(Number(n), 0x10ffff)))
  .replace(/&#x([0-9a-f]{1,6});/gi, (_, n: string) => String.fromCodePoint(Math.min(parseInt(n, 16), 0x10ffff)))
  .replace(/&amp;/g, "&");

type Node = { tag: string; kids: (Node | string)[] };

export function SafeHtml({ html, className }: { html: string; className?: string }) {
  const root: Node = { tag: "div", kids: [] };
  const stack: Node[] = [root];
  const re = /<(\/?)([a-z0-9]+)>/g;
  let last = 0, m: RegExpExecArray | null;
  const text = (s: string) => { if (s) stack[stack.length - 1].kids.push(decode(s.replace(/<[^>]*>/g, ""))); };
  while ((m = re.exec(html))) {
    text(html.slice(last, m.index));
    last = m.index + m[0].length;
    const tag = m[2];
    if (!TAGS.has(tag)) continue;
    if (tag === "br") { if (!m[1]) stack[stack.length - 1].kids.push({ tag: "br", kids: [] }); continue; }
    if (!m[1]) { const n: Node = { tag, kids: [] }; stack[stack.length - 1].kids.push(n); stack.push(n); continue; }
    const at = stack.map((x) => x.tag).lastIndexOf(tag);
    if (at > 0) stack.length = at;
  }
  text(html.slice(last));
  const render = (n: Node | string, key: number): ReactNode => {
    if (typeof n === "string") return n;
    const kids = n.kids.map(render);
    switch (n.tag) {
      case "br": return <br key={key} />;
      case "b": return <b key={key}>{kids}</b>;
      case "i": return <i key={key}>{kids}</i>;
      case "u": return <u key={key}>{kids}</u>;
      case "ul": return <ul key={key}>{kids}</ul>;
      case "ol": return <ol key={key}>{kids}</ol>;
      case "li": return <li key={key}>{kids}</li>;
      case "h2": return <h2 key={key}>{kids}</h2>;
      case "h3": return <h3 key={key}>{kids}</h3>;
      case "h4": return <h4 key={key}>{kids}</h4>;
      default: return <p key={key}>{kids}</p>;
    }
  };
  return <div className={className}>{React.Children.toArray(root.kids.map(render))}</div>;
}
