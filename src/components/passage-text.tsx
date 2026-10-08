/** A reading passage on screen (practice, quizzes, placement, ReadMaster): headings, paragraphs, text features. */
import { passageBlocks, plainPassage } from "@/lib/passage";

export { plainPassage };

const FIG_ICON: Record<string, string> = { diagram: "🔬", map: "🗺️", photo: "📷", graph: "📈", chart: "📊", timeline: "🕰️", sidebar: "📌", "primary source": "📜", table: "📋", caption: "🖼️" };

function feature(key: number, figKind: string, title: string, text: string) {
  const steps = text.includes("→") ? text.split("→").map((x) => x.trim()).filter(Boolean) : null;
  return (
    <figure key={key} className="my-5 rounded-2xl bg-sky-50 p-4 ring-1 ring-sky-200">
      <figcaption className="text-sm font-bold uppercase tracking-wide text-sky-900"><span aria-hidden="true">{FIG_ICON[figKind.toLowerCase()] ?? "🖼️"}</span> {figKind}{title ? <span className="ms-1 normal-case tracking-normal text-brand-navy">· {title}</span> : null}</figcaption>
      {steps ? (
        <ol className="mt-2 flex flex-wrap items-center gap-2 text-base">
          {steps.map((st, i) => <li key={i} className="flex items-center gap-2">{i > 0 && <span aria-hidden="true" className="text-sky-600">→</span>}<span className="rounded-xl bg-white px-3 py-1.5 ring-1 ring-sky-200">{st}</span></li>)}
        </ol>
      ) : <p className="mt-2 whitespace-pre-line text-base leading-relaxed text-slate-800">{text}</p>}
    </figure>
  );
}

export function PassageText({ text, paraClassName = "mt-3 whitespace-pre-line text-lg leading-relaxed text-slate-800", headingClassName = "mt-5 text-lg font-bold text-brand-navy" }: { text: string; paraClassName?: string; headingClassName?: string }) {
  return <>{passageBlocks(text).map((b, i) => (b.kind === "fig" ? feature(i, b.figKind, b.title, b.text) : b.kind === "h" ? <h3 key={i} className={headingClassName}>{b.text}</h3> : <p key={i} className={paraClassName}>{b.text}</p>))}</>;
}
