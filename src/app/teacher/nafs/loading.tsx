import { LoadingStatus } from "@/components/loading-status";

/** ⚡ r78: a light skeleton of the NAFS center (title, tabs, two cards) the moment a tab or a button is pressed. */
export default function Loading() {
  return (
    <div aria-busy="true">
      <LoadingStatus label="Loading…" />
      <div className="animate-pulse motion-reduce:animate-none" aria-hidden="true">
        <div className="h-8 w-40 rounded-lg bg-slate-200" />
        <div className="mt-5 flex gap-2">{[0, 1, 2, 3, 4, 5, 6].map((i) => <div key={i} className="h-11 w-24 rounded-xl bg-slate-200" />)}</div>
        {[0, 1].map((i) => <div key={i} className="mt-5 h-40 rounded-2xl bg-white ring-1 ring-slate-200" />)}
      </div>
    </div>
  );
}
