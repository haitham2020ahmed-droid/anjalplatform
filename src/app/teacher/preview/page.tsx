import Link from "next/link";
import { PrintToggle } from "@/components/print/print-toggle";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { PrintButton } from "@/components/plans/print-button";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { ValidationError } from "@/server/curriculum-admin";
import { ForbiddenError } from "@/server/auth/rbac";
import { LEVELS, previewWork, type PreviewView } from "@/server/teacher/preview";

export const metadata = { title: "Preview" };
const NAME = { BELOW: "Below Level", ON: "On Level", ABOVE: "Above Level" } as const;

/** 👀 What each level will see — switch Below / On / Above; print or save as PDF. */
export default async function PreviewPage({ searchParams }: { searchParams: Promise<{ code?: string; skillId?: string; level?: string; key?: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "questions:read" });
  const me = (await getActor())!.user;
  const sp = await searchParams;
  let v: PreviewView | null = null, error: string | null = null;
  try { v = await previewWork(repo, actor, sp); } catch (e) { if (e instanceof ValidationError || e instanceof ForbiddenError) error = e.message; else throw e; }
  const showKey = sp.key === "1";
  const q = (o: Record<string, string | undefined>) => `/teacher/preview?${new URLSearchParams(Object.entries({ code: sp.code, skillId: sp.skillId, level: sp.level, key: sp.key, ...o }).filter(([, x]) => x) as [string, string][])}`;
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: actor.role === "TEACHER" ? "/teacher" : "/admin", label: "Back" }} icon="👀" title={v ? `Preview: ${v.title}` : "Preview"} subtitle={v ? `${v.subtitle} · what students see, level by level` : null}>
        {v && <PrintButton />}
        {v?.assignHref && actor.role === "TEACHER" && <Link href={v.assignHref} className="rounded-xl bg-brand-navy px-4 py-2 font-semibold text-white hover:bg-brand-purple print:hidden">⭐ Assign</Link>}
      </PageHeader>
      {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-red-800">{error}</p>}
      {v && (
        <>
          <nav aria-label="Level" className="flex flex-wrap items-center gap-2 print:hidden">
            {LEVELS.map((l) => <Link key={l} href={q({ level: l })} aria-current={v!.level === l ? "page" : undefined} className={`rounded-2xl px-5 py-2.5 font-bold ${v!.level === l ? "bg-brand-navy text-white shadow" : "bg-white text-brand-navy ring-1 ring-slate-200 hover:ring-brand-teal"}`}>{l === "BELOW" ? "🟠" : l === "ON" ? "🔵" : "🟢"} {NAME[l]} <span className="text-xs font-normal opacity-80">({v!.counts[l]})</span></Link>)}
            <Link href={q({ key: showKey ? "" : "1" })} className="ms-auto rounded-xl bg-white px-4 py-2 text-sm font-semibold text-slate-700 ring-1 ring-slate-300">{showKey ? "🙈 Hide answers" : "🔑 Show answers"}</Link>
          </nav>
          <h2 className="mt-5 hidden text-xl font-bold print:block">{NAME[v.level]}</h2>
          {!v.questions.length ? <p className="mt-5 rounded-2xl bg-white p-6 text-slate-600 ring-1 ring-slate-200">No questions at {NAME[v.level]} yet. Students placed here get the nearest level that has questions.</p> : (
            <ol className="mt-5 space-y-4">
              {v.questions.map((x, i) => (
                <li key={x.id} className="break-inside-avoid rounded-2xl bg-white p-5 ring-1 ring-slate-200">
                  {x.passageText && <details className="mb-3 rounded-xl bg-slate-50 p-3 text-sm" open><summary className="cursor-pointer font-semibold text-brand-navy">📖 {x.passageTitle ?? "Passage"}</summary><p className="mt-2 whitespace-pre-line text-slate-700">{x.passageText}</p></details>}
                  <div className="flex items-start justify-between gap-2"><p className="text-lg font-medium text-slate-900"><span className="me-2 font-bold text-brand-navy">{i + 1}.</span>{x.stem}</p><PrintToggle id={x.id} stem={x.stem} /></div>
                  {x.options.length > 0 && <ul className="mt-2 grid gap-1 sm:grid-cols-2">{x.options.map((o) => <li key={o.label} className={`rounded-lg px-3 py-1.5 ring-1 ${showKey && o.correct ? "bg-emerald-50 font-semibold text-emerald-900 ring-emerald-300" : "ring-slate-200"}`}>{o.label}. {o.text}</li>)}</ul>}
                  {showKey && !x.options.length && x.answer && <p className="mt-2 rounded-lg bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-emerald-900">Answer: {x.answer}</p>}
                </li>
              ))}
            </ol>
          )}
          {v.counts[v.level] > v.shown && <p className="mt-3 text-sm text-slate-500">Showing the first {v.shown} of {v.counts[v.level]}.</p>}
        </>
      )}
    </AppShell>
  );
}
