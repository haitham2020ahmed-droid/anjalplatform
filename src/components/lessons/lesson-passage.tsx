/** @jsxRuntime automatic */
/** @jsxImportSource react */
/**
 * A passage with clue sentences highlighted (model passage, hint level 3) and, optionally, one paragraph outlined
 * (hint level 2). Paragraphs are numbered the way the hint ladder counts them (headings and text features are not).
 */
import { passageBlocks } from "@/lib/passage";
import { RichInline } from "@/components/rich-inline";

const norm = (x: string) => x.replace(/\s+/g, " ").trim();

function marked(text: string, clues: string[], key: number) {
  const parts: (string | { clue: string })[] = [text];
  for (const c of clues.map(norm).filter(Boolean)) {
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      if (typeof p !== "string") continue;
      const at = p.indexOf(c);
      if (at < 0) continue;
      parts.splice(i, 1, p.slice(0, at), { clue: c }, p.slice(at + c.length));
      i++;
    }
  }
  return parts.map((p, i) => (typeof p === "string" ? <span key={`${key}-${i}`}><RichInline text={p} /></span> : <mark key={`${key}-${i}`} className="rounded bg-amber-200 px-0.5 text-slate-900"><RichInline text={p.clue} /></mark>));
}

export function LessonPassage({ title, text, clues = [], paragraph = null, numbered = false }: { title?: string; text: string; clues?: string[]; paragraph?: number | null; numbered?: boolean }) {
  let n = 0;
  return (
    <article className="rounded-2xl bg-white p-5 ring-1 ring-slate-200" aria-label={title ? `Text: ${title}` : "Text"}>
      {title && <h3 className="text-lg font-bold text-brand-navy"><RichInline text={title} /></h3>}
      {passageBlocks(text).map((b, i) => {
        if (b.kind === "h") return <h4 key={i} className="mt-4 font-bold text-brand-navy"><RichInline text={b.text} /></h4>;
        if (b.kind === "fig") return <p key={i} className="mt-3 rounded-xl bg-sky-50 p-3 text-sm ring-1 ring-sky-200"><span className="font-semibold">{b.figKind}{b.title ? ` · ${b.title}` : ""}:</span> <RichInline text={b.text} /></p>;
        n++;
        const on = paragraph === n;
        return (
          <p key={i} className={`mt-3 text-lg leading-relaxed text-slate-800 ${on ? "rounded-xl bg-amber-50 p-2 ring-2 ring-amber-300" : ""}`}>
            {numbered && <span className="me-2 rounded bg-slate-100 px-1.5 text-xs font-bold text-slate-500" aria-label={`Paragraph ${n}`}>{n}</span>}
            {marked(norm(b.text), clues, i)}
          </p>
        );
      })}
    </article>
  );
}
