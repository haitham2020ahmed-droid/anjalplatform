/**
 * Shown by Next.js the moment a link is clicked, while the server prepares the page (loading.tsx).
 * Same frame as AppShell (header, content width) so nothing jumps when the page arrives; grey
 * placeholder blocks instead of content. Respects "reduce motion"; screen readers hear "Loading…".
 */
export function PageLoading({ blocks = 3 }: { blocks?: number }) {
  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3">
          <span className="font-bold text-brand-navy">Al-Anjal English</span>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8" aria-busy="true">
        <p role="status" className="sr-only">Loading…</p>
        <div className="animate-pulse motion-reduce:animate-none" aria-hidden="true">
          <div className="h-4 w-24 rounded bg-slate-200" />
          <div className="mt-3 h-8 w-64 max-w-full rounded-lg bg-slate-200" />
          {Array.from({ length: blocks }, (_, i) => (
            <div key={i} className="mt-6 rounded-2xl bg-white p-5 ring-1 ring-slate-200">
              <div className="h-5 w-40 rounded bg-slate-200" />
              <div className="mt-4 space-y-3">
                <div className="h-3 w-full rounded bg-slate-100" />
                <div className="h-3 w-11/12 rounded bg-slate-100" />
                <div className="h-3 w-4/5 rounded bg-slate-100" />
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
