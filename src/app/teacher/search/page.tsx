import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { SearchBox } from "@/components/search/search-box";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { searchEverything } from "@/server/search/everything";

export const metadata = { title: "Search" };

/** 🔎 Search results: grouped by kind; ⭐ Assign straight from a skill, grammar lesson, map place or question. */
export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "questions:read" });
  const me = (await getActor())!.user;
  const q = String((await searchParams).q ?? "");
  const r = q.trim() ? await searchEverything(repo, actor, q) : null;
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: actor.role === "TEACHER" ? "/teacher" : "/admin", label: "Home" }} icon="🔎" title="Search" subtitle="Everything on the platform in one place. Open a result, or ⭐ Assign it to your class straight away." />
      <div className="mb-6"><SearchBox q={q} autoFocus={!q} /></div>
      {!r ? <p className="text-slate-600">Type a word above — for example “main idea”, “commas”, “RL.5.2”, “Unit 2”, a student’s name or “alerts”.</p>
        : !r.total ? <p className="rounded-2xl bg-white p-6 text-slate-600 ring-1 ring-slate-200">Nothing found for “{r.q}”. Try a shorter word or another spelling.</p>
        : (
          <div className="space-y-5">
            <p className="text-sm text-slate-500">{r.total} result{r.total === 1 ? "" : "s"} for “{r.q}”</p>
            {r.groups.map((g) => (
              <section key={g.kind} className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200" aria-labelledby={`sg-${g.kind}`}>
                <h2 id={`sg-${g.kind}`} className="mb-2 text-lg font-bold text-brand-navy"><span aria-hidden="true">{g.icon}</span> {g.label} <span className="text-sm font-normal text-slate-500">({g.hits.length})</span></h2>
                <ul className="divide-y divide-slate-100">
                  {g.hits.map((h) => (
                    <li key={`${h.kind}:${h.id}`} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                      <Link href={h.href} className="min-w-0 flex-1 group"><span className="block font-semibold text-slate-900 group-hover:text-brand-teal">{h.title}</span><span className="block truncate text-xs text-slate-500">{h.sub}</span></Link>
                      <span className="flex gap-1.5">
                        <Link href={h.href} className="rounded-lg px-3 py-1.5 text-sm font-semibold text-brand-navy ring-1 ring-slate-300 hover:ring-brand-teal">Open</Link>
                        {h.assignHref && <Link href={h.assignHref} className="rounded-lg bg-brand-navy px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-purple">⭐ Assign</Link>}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
    </AppShell>
  );
}
