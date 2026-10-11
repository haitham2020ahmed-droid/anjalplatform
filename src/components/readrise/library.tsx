import Link from "next/link";
import type { ArticleCard, Library } from "@/server/readrise/student";

/**
 * 🚀 The ReadRise library (server component): search + topic chips, then "From my teacher", "Recommended for you"
 * and "All articles". Every card opens /student/readrise/[articleId] (the 5-step routine).
 */
const fmtDue = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });

function StatusPill({ c }: { c: ArticleCard }) {
  if (c.status === "IN_PROGRESS") return <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">In progress</span>;
  if (c.status === "DONE") return <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-900">✓ Done{c.firstTryScore !== null ? ` · ${c.firstTryScore}%` : ""}</span>;
  return <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-semibold text-sky-900">New</span>;
}

export function ArticleTile({ c }: { c: ArticleCard }) {
  const cta = c.status === "IN_PROGRESS" ? "Continue" : c.status === "DONE" ? (c.canStretch ? "Stretch it" : "Open") : "Read";
  return (
    <li>
      <Link href={`/student/readrise/${c.id}`} className="lift flex h-full flex-col rounded-2xl bg-white p-4 ring-1 ring-slate-200 hover:ring-brand-teal focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-teal">
        <span className="flex flex-wrap items-center gap-2 text-xs">
          {c.topic && <span className="rounded-full bg-indigo-50 px-2 py-0.5 font-semibold text-indigo-800">{c.topic}</span>}
          <StatusPill c={c} />
          {c.assigned && <span className="rounded-full bg-purple-100 px-2 py-0.5 font-semibold text-purple-900">From my teacher{c.dueAt ? ` · due ${fmtDue(c.dueAt)}` : ""}</span>}
        </span>
        <span className="mt-2 block text-lg font-bold leading-snug text-brand-navy">{c.title}</span>
        {c.summary && <span className="mt-1 line-clamp-2 block text-sm text-slate-600">{c.summary}</span>}
        <span className="mt-auto flex items-center justify-between gap-2 pt-3 text-sm">
          <span className="text-slate-500">About {c.minutes} min · level {c.versionLevel}</span>
          <span className="rounded-lg bg-brand-navy px-3 py-1 font-semibold text-white" aria-hidden="true">{cta} ▶</span>
        </span>
      </Link>
    </li>
  );
}

function Shelf({ id, title, hint, cards }: { id: string; title: string; hint?: string; cards: ArticleCard[] }) {
  if (!cards.length) return null;
  return (
    <section aria-labelledby={id} className="mt-6">
      <h2 id={id} className="text-xl font-bold text-brand-navy">{title}</h2>
      {hint && <p className="text-sm text-slate-600">{hint}</p>}
      <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{cards.map((c) => <ArticleTile key={c.id} c={c} />)}</ul>
    </section>
  );
}

export function ReadRiseLibrary({ lib }: { lib: Library }) {
  const filtered = Boolean(lib.query || lib.topic);
  const link = (topic: string) => {
    const p = new URLSearchParams();
    if (lib.query) p.set("q", lib.query);
    if (topic) p.set("topic", topic);
    const qs = p.toString();
    return `/student/readrise${qs ? `?${qs}` : ""}#library`;
  };
  return (
    <div id="library" className="mt-8">
      <form method="get" action="/student/readrise#library" role="search" className="flex flex-wrap items-end gap-2">
        <label className="min-w-0 flex-1 text-sm font-semibold text-slate-700">Find an article
          <input type="search" name="q" defaultValue={lib.query} placeholder="Search by title or topic" className="mt-1 w-full rounded-xl border-slate-300 text-base" />
        </label>
        {lib.topic && <input type="hidden" name="topic" value={lib.topic} />}
        <button type="submit" className="rounded-xl bg-brand-navy px-4 py-2.5 font-semibold text-white hover:bg-brand-purple">Search</button>
      </form>
      {lib.topics.length > 0 && (
        <nav aria-label="Topics" className="mt-3 flex flex-wrap gap-2">
          {["", ...lib.topics].map((t) => (
            <Link key={t || "all"} href={link(t)} aria-current={lib.topic === t ? "true" : undefined}
              className={`rounded-full px-3 py-1 text-sm font-semibold ring-1 ${lib.topic === t ? "bg-brand-teal text-white ring-brand-teal" : "bg-white text-slate-700 ring-slate-300 hover:ring-brand-teal"}`}>{t || "All topics"}</Link>
          ))}
        </nav>
      )}
      <Shelf id="rr-assigned" title="📌 From my teacher" cards={lib.assigned} />
      {!filtered && <Shelf id="rr-rec" title="✨ Recommended for you" hint="New topics to explore, at your level." cards={lib.recommended} />}
      <Shelf id="rr-all" title={filtered ? `Results (${lib.all.length})` : "📚 All articles"} cards={lib.all} />
      {lib.all.length === 0 && (
        <p className="mt-6 rounded-2xl bg-white p-5 text-slate-600 ring-1 ring-slate-200">
          {filtered ? <>No articles match. <Link href="/student/readrise#library" className="text-brand-teal underline">Show all articles</Link></> : "No articles yet. Check back soon!"}
        </p>
      )}
    </div>
  );
}
