/** @jsxRuntime automatic */
/** @jsxImportSource react */
/**
 * Question text with its emphasis marks shown as real formatting: underlined / bold / italic words (see
 * lib/inline-marks.ts for the accepted marks). Built from React elements only — never raw HTML — so any other
 * markup is shown as the plain text it is.
 */
import type { ReactNode } from "react";
import { hasMarks, parseMarks, type InlineNode } from "../lib/inline-marks";

const render = (nodes: InlineNode[], key = ""): ReactNode[] =>
  nodes.map((n, i) => {
    if (typeof n === "string") return n;
    const k = `${key}${i}`, kids = render(n.children, `${k}.`);
    if (n.mark === "u") return <u key={k} className="underline decoration-2 underline-offset-4">{kids}</u>;
    if (n.mark === "b") return <strong key={k} className="font-bold">{kids}</strong>;
    return <em key={k} className="italic">{kids}</em>;
  });

/** Inline content (use inside a <p>, <span>, <label>…). Plain text renders unchanged. */
export function RichInline({ text }: { text: string | null | undefined }) {
  const s = String(text ?? "");
  return <>{hasMarks(s) ? render(parseMarks(s)) : s}</>;
}

/** The same, as a function — for places that build children arrays. */
export const richInline = (text: string | null | undefined): ReactNode => <RichInline text={text} />;
