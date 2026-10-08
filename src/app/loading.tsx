/** Shown instantly while the next page loads (client navigation). */
export default function Loading() {
  return (
    <div aria-busy="true" aria-live="polite">
      <div className="fixed inset-x-0 top-0 z-50 h-1 overflow-hidden bg-transparent">
        <div className="h-full w-1/3 animate-[loadbar_1s_ease-in-out_infinite] rounded-full bg-brand-teal" />
      </div>
      <div className="mx-auto max-w-6xl space-y-4 px-4 py-8 sm:px-6">
        <div className="h-28 animate-pulse rounded-3xl bg-slate-200/70" />
        <div className="grid gap-4 sm:grid-cols-3">{[0, 1, 2].map((i) => <div key={i} className="h-28 animate-pulse rounded-3xl bg-slate-200/60" />)}</div>
        <div className="h-48 animate-pulse rounded-3xl bg-slate-200/50" />
        <span className="sr-only">Loading…</span>
      </div>
    </div>
  );
}
