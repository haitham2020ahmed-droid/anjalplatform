/** A reading passage on screen (practice, quizzes, placement, ReadMaster): headings, paragraphs, text features. */
import { passageBlocks, plainPassage, type PassageBlock } from "@/lib/passage";
import { RichInline } from "@/components/rich-inline";

export { plainPassage };

export const DEFAULT_PARA_CLASS = "mt-3 whitespace-pre-line text-lg leading-relaxed text-slate-800";
export const DEFAULT_HEADING_CLASS = "mt-5 text-lg font-bold text-brand-navy";

const FIG_ICON: Record<string, string> = { diagram: "🔬", map: "🗺️", photo: "📷", graph: "📈", chart: "📊", timeline: "🕰️", sidebar: "📌", "primary source": "📜", table: "📋", caption: "🖼️" };

function feature(key: number, figKind: string, title: string, text: string) {
  const steps = text.includes("→") ? text.split("→").map((x) => x.trim()).filter(Boolean) : null;
  return (
    <figure key={key} className="my-5 rounded-2xl bg-sky-50 p-4 ring-1 ring-sky-200">
      <figcaption className="text-sm font-bold uppercase tracking-wide text-sky-900"><span aria-hidden="true">{FIG_ICON[figKind.toLowerCase()] ?? "🖼️"}</span> {figKind}{title ? <span className="ms-1 normal-case tracking-normal text-brand-navy">· <RichInline text={title} /></span> : null}</figcaption>
      {steps ? (
        <ol className="mt-2 flex flex-wrap items-center gap-2 text-base">
          {steps.map((st, i) => <li key={i} className="flex items-center gap-2">{i > 0 && <span aria-hidden="true" className="text-sky-600">→</span>}<span className="rounded-xl bg-white px-3 py-1.5 ring-1 ring-sky-200"><RichInline text={st} /></span></li>)}
        </ol>
      ) : <p data-wordtap className="mt-2 whitespace-pre-line text-base leading-relaxed text-slate-800"><RichInline text={text} /></p>}
    </figure>
  );
}

/** Renders already-split blocks (see lib/passage.ts and lib/passage-chunks.ts) — shared by PassageText below and
 *  by ChunkedPassage (components/passage/chunked-passage.tsx), which shows these blocks a few at a time. */
export function renderPassageBlocks(blocks: PassageBlock[], paraClassName: string = DEFAULT_PARA_CLASS, headingClassName: string = DEFAULT_HEADING_CLASS) {
  return blocks.map((b, i) => (b.kind === "fig" ? feature(i, b.figKind, b.title, b.text) : b.kind === "h" ? <h3 key={i} data-wordtap className={headingClassName}><RichInline text={b.text} /></h3> : <p key={i} data-wordtap className={paraClassName}><RichInline text={b.text} /></p>));
}

export function PassageText({ text, paraClassName = DEFAULT_PARA_CLASS, headingClassName = DEFAULT_HEADING_CLASS }: { text: string; paraClassName?: string; headingClassName?: string }) {
  return <>{renderPassageBlocks(passageBlocks(text), paraClassName, headingClassName)}</>;
}
