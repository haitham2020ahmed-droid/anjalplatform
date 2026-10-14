import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { LearnResultsTable } from "@/components/learn/results-table";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { findSelection } from "@/server/learn/words";
import { learnResults, myStudents } from "@/server/learn/teacher";
import { getT } from "@/i18n/server";

export const metadata = { title: "Learn results" };

/**
 * 📊 Results of one lesson (or, with ?kind=WORDS, one selection's words) for my students: who opened it, finished it,
 * the checks score, who needed "again", time. Filter by class.
 */
export default async function LearnResultsPage({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<{ classId?: string; kind?: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"] });
  const me = (await getActor())!.user;
  const { t } = await getT();
  const code = decodeURIComponent((await params).code);
  const sp = await searchParams;
  const kind = sp.kind === "WORDS" ? "WORDS" : "LESSON";
  const [{ classes }, r] = await Promise.all([myStudents(repo, actor), learnResults(repo, actor, kind, code, sp.classId || null)]);
  const sel = kind === "WORDS" ? findSelection(code) : null;
  const title = sel ? `Grade ${sel.grade} · Unit ${sel.unit} · ${sel.name}` : r.title;
  const chip = (on: boolean) => `inline-flex min-h-9 items-center rounded-full px-3 text-sm font-semibold ${on ? "bg-brand-navy text-white" : "bg-surface text-ink ring-1 ring-line"}`;
  const base = (classId?: string) => `/teacher/learn/${encodeURIComponent(code)}/results?${new URLSearchParams({ ...(kind === "WORDS" ? { kind } : {}), ...(classId ? { classId } : {}) })}`;
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={kind === "WORDS" ? { href: `/teacher/learn/words?sel=${encodeURIComponent(code)}`, label: "Words" } : { href: `/teacher/learn/${code}`, label: "Lesson" }} icon="📊" title="Learn results" subtitle={<span lang="en">{title}</span>} />
      <nav aria-label={t("Classes")} className="mb-4 flex flex-wrap gap-2">
        <Link prefetch={false} href={base()} className={chip(!sp.classId)}>{t("All my classes")}</Link>
        {classes.map((c) => <Link key={String(c.id)} prefetch={false} href={base(String(c.id))} className={chip(sp.classId === c.id)}>{String(c.name)}</Link>)}
      </nav>
      <ul className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {([["Assigned", r.counts.assigned], ["Opened", r.counts.opened], ["Finished", r.counts.finished], ["Needed “again”", r.counts.again]] as const).map(([l, n]) => (
          <li key={l} className="rounded-2xl bg-surface p-4 shadow-card ring-1 ring-line"><p className="text-sm text-muted">{t(l)}</p><p className="font-display text-3xl text-ink" dir="ltr">{n}</p></li>
        ))}
      </ul>
      <LearnResultsTable rows={r.rows} words={kind === "WORDS"} />
    </AppShell>
  );
}
