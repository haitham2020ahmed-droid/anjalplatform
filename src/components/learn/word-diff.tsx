import { wordDiff } from "@/lib/learn/format";

/** Old vs new, word by word: removed words struck through in red, added words in green. */
export function WordDiff({ old, now }: { old: string; now: string }) {
  return (
    <p className="leading-relaxed" lang="en" dir="auto">
      {wordDiff(old, now).map((p, i) => p.op === "same" ? <span key={i}>{p.t}</span>
        : p.op === "del" ? <del key={i} className="rounded bg-rose-100 text-rose-900">{p.t}</del>
        : <ins key={i} className="rounded bg-emerald-100 text-emerald-900 no-underline">{p.t}</ins>)}
    </p>
  );
}
