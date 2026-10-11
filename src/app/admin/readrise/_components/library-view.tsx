/** 🚀 ReadRise library list (admin and teacher): filters by topic / status / source, search, article cards. */
import Link from "next/link";
import type { LibraryFilters, LibraryItem } from "@/server/readrise/library";
import { field, SourcePill, StatusPill } from "./ui";

export function LibraryView({ base, items, topics, f }: { base: string; items: LibraryItem[]; topics: string[]; f: LibraryFilters }) {
  const filtered = !!(f.topic || f.status || f.source || f.q);
  const counts = { published: items.filter((i) => i.status === "PUBLISHED").length, drafts: items.filter((i) => i.status !== "PUBLISHED").length };
  return (
    <>
      <form method="get" action={base} className="mb-5 flex flex-wrap items-end gap-3 rounded-2xl bg-white p-4 ring-1 ring-slate-200">
        <label className="flex min-w-[14rem] flex-1 flex-col gap-1 text-sm font-semibold text-slate-700">Search
          <input type="search" name="q" defaultValue={f.q ?? ""} placeholder="Title, code or summary" className={field} />
        </label>
        <label className="flex flex-col gap-1 text-sm font-semibold text-slate-700">Topic
          <select name="topic" defaultValue={f.topic ?? ""} className={field}><option value="">All topics</option>{topics.map((t) => <option key={t} value={t}>{t}</option>)}</select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-semibold text-slate-700">Status
          <select name="status" defaultValue={f.status ?? ""} className={field}><option value="">Any status</option><option value="PUBLISHED">Published</option><option value="DRAFT">Draft</option></select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-semibold text-slate-700">Source
          <select name="source" defaultValue={f.source ?? ""} className={field}><option value="">Platform and school</option><option value="PLATFORM">Platform library</option><option value="SCHOOL">Our school</option></select>
        </label>
        <button className="rounded-xl bg-brand-navy px-4 py-2 text-sm font-semibold text-white hover:bg-brand-purple">Filter</button>
        {filtered && <Link href={base} className="px-2 py-2 text-sm font-semibold text-brand-teal hover:underline">Clear</Link>}
      </form>
      <p className="mb-3 text-sm text-slate-600">{items.length} article{items.length === 1 ? "" : "s"} · {counts.published} published · {counts.drafts} draft{counts.drafts === 1 ? "" : "s"}</p>
      {items.length === 0 ? (
        <p className="rounded-2xl bg-white p-6 text-slate-600 ring-1 ring-slate-200">{filtered ? "No article matches these filters." : "No articles yet. Import one with the Excel template."}</p>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {items.map((a) => (
            <li key={a.id}>
              <Link href={`${base}/${a.id}`} className={`lift block h-full rounded-2xl bg-white p-4 ring-1 ${a.hidden ? "opacity-60 ring-slate-300" : "ring-slate-200"}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-lg font-bold text-brand-navy">{a.title}</p>
                    <p className="truncate text-xs text-slate-500">{a.code} · {a.topic}{a.mine ? " · mine" : ""}</p>
                  </div>
                  <StatusPill status={a.status} />
                </div>
                {a.summary && <p className="mt-2 line-clamp-2 text-sm text-slate-600">{a.summary}</p>}
                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                  <SourcePill source={a.source} hidden={a.hidden} />
                  <span className={`rounded-full px-2.5 py-0.5 font-semibold ring-1 ${a.versions === 12 ? "bg-slate-50 text-slate-700 ring-slate-200" : "bg-red-50 text-red-800 ring-red-200"}`}>{a.versions}/12 versions</span>
                  {a.levelWarnings > 0 && <span className="rounded-full bg-amber-50 px-2.5 py-0.5 font-semibold text-amber-900 ring-1 ring-amber-300">⚠ {a.levelWarnings} off level</span>}
                  <span className="ms-auto text-slate-400">{a.updatedAt.slice(0, 10)}</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/** Reads the library filters from the query string (only known values). */
export function libraryFilters(sp: { topic?: string; status?: string; source?: string; q?: string }): LibraryFilters {
  return {
    topic: sp.topic ? String(sp.topic).slice(0, 60) : undefined,
    status: sp.status === "PUBLISHED" || sp.status === "DRAFT" ? sp.status : undefined,
    source: sp.source === "PLATFORM" || sp.source === "SCHOOL" ? sp.source : undefined,
    q: sp.q ? String(sp.q).slice(0, 100) : undefined,
  };
}
