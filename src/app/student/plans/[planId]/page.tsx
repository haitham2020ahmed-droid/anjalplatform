import { hideLevels } from "@/lib/hide-levels";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { PrintButton } from "@/components/plans/print-button";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { skillPlanForStudent, type StudentPlanView } from "@/server/curriculum-map/plans";

type Place = StudentPlanView["places"][number];
const ICON: Record<string, string> = { NOT_STARTED: "⚪", IN_PROGRESS: "🟡", COMPLETED: "✅", OVERDUE: "⏰" };

/**
 * My plan, laid out like a printed skills plan: Unit → Text Set → numbered parts, each with the skills it
 * practises. Every part is a link straight to its questions (also in the PDF made with “Download PDF”).
 */
export default async function MyPlan({ params, searchParams }: { params: Promise<{ planId: string }>; searchParams: Promise<{ msg?: string }> }) {
  const actor = await requireActor({ roles: ["STUDENT"] });
  const me = (await getActor())!.user;
  const { msg } = await searchParams;
  let p: StudentPlanView | null = null;
  try { p = await skillPlanForStudent(repo, actor, (await params).planId); } catch (e) { if (!(e instanceof ForbiddenError)) throw e; }
  if (!p) return <AppShell name={String(me.displayName)}><p className="text-lg text-slate-700">This plan is not assigned to you.</p></AppShell>;
  const units = [...new Set(p.places.map((x) => x.unit))];
  const done = p.places.filter((x) => x.status === "COMPLETED").length;
  const pct = p.places.length ? Math.round((100 * done) / p.places.length) : 0;
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/student/plans", label: "My Plans" }} icon={p.kind === "CURRICULUM" ? "📘" : "🗂️"} title={hideLevels(p.title)} subtitle={`${p.className} · ${done} of ${p.places.length} parts done · ${p.target} correct answers finish a part`}><PrintButton /></PageHeader>
      {msg && <p role="alert" className="mb-4 rounded-2xl bg-amber-50 px-4 py-3 font-medium text-amber-900 ring-1 ring-amber-200">🔒 {msg}</p>}
      {p.note && <p className="mb-4 rounded-2xl bg-amber-50 px-4 py-3 text-amber-900">💬 {p.note}</p>}

      <div className="plan-sheet rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200 print:p-0 print:shadow-none print:ring-0">
        {/* printed header */}
        <div className="flex flex-wrap items-end justify-between gap-3 border-b-4 border-brand-teal pb-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-brand-teal">Al-Anjal Adaptive ELA · Study Plan</p>
            <h2 className="text-2xl font-extrabold text-brand-navy">{hideLevels(p.title)}</h2>
            <p className="text-sm text-slate-600">{String(me.displayName)} · {p.className}</p>
          </div>
          <div className="min-w-[180px]">
            <div className="flex justify-between text-sm font-semibold text-slate-700"><span>Progress</span><span className="tabular-nums">{done}/{p.places.length} · {pct}%</span></div>
            <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-brand-teal" style={{ width: `${pct}%` }} /></div>
          </div>
        </div>
        <p className="mt-3 text-sm text-slate-600">Tap any part to practise it. Each part finishes when you get <b>{p.target} correct answers</b> — the questions get easier or harder with you. ✅ done · 🟡 started · ⚪ not started · 🔒 not open yet · ⏳ coming soon</p>

        <div className="mt-5 space-y-8">
          {units.map((u, ui) => {
            const inUnit = p!.places.filter((x) => x.unit === u);
            const locked = inUnit.every((x) => x.locked);
            const uDone = inUnit.filter((x) => x.status === "COMPLETED").length;
            return (
              <section key={u} className="break-inside-avoid-page">
                <div className={`flex flex-wrap items-center justify-between gap-2 rounded-xl px-4 py-2 ${locked ? "bg-slate-100 text-slate-500" : "bg-brand-navy text-white"}`}>
                  <h3 className="text-lg font-bold">{locked ? "🔒 " : ""}{u}</h3>
                  <span className="flex items-center gap-2 text-sm tabular-nums">{uDone}/{inUnit.length} done{uDone === inUnit.length && inUnit.length > 0 && <Link href={`/student/plans/${p!.id}/certificate?unit=${encodeURIComponent(u)}`} className="rounded-full bg-amber-400 px-3 py-0.5 font-bold text-amber-950 hover:bg-amber-300 print:hidden">🏅 My certificate</Link>}</span>
                </div>
                <div className="mt-3 grid gap-x-8 gap-y-5 md:grid-cols-2 print:grid-cols-2">
                  {[...new Set(inUnit.map((x) => x.set))].map((set, si) => (
                    <div key={set} className="break-inside-avoid">
                      <p className="border-b border-slate-200 pb-1 text-sm font-bold uppercase tracking-wide text-brand-teal">{set}</p>
                      <ol className="mt-1.5 space-y-1">
                        {inUnit.filter((x) => x.set === set).map((x, i) => <Row key={x.itemId} x={x} n={`${ui + 1}.${si + 1}.${i + 1}`} target={p!.target} />)}
                      </ol>
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </AppShell>
  );
}

function Row({ x, n, target }: { x: Place; n: string; target: number }) {
  const st = x.status ?? "NOT_STARTED";
  const body = (
    <>
      <span className="w-12 shrink-0 pt-0.5 text-xs font-semibold tabular-nums text-slate-400">{n}</span>
      <span className="min-w-0 flex-1">
        <span className={`block font-semibold ${x.locked || x.empty ? "text-slate-400" : "text-brand-navy group-hover:underline"}`}>{hideLevels(x.label)}</span>
        {x.skills && <span className="block text-xs leading-snug text-slate-500">{x.skills}</span>}
      </span>
      <span className="shrink-0 text-end text-xs tabular-nums text-slate-500">
        <span aria-hidden="true" className="text-base">{x.locked ? "🔒" : x.empty ? "⏳" : ICON[st]}</span>
        {!x.locked && st !== "NOT_STARTED" && <span className="block">{Math.min(x.correct, target)}/{target}</span>}
      </span>
    </>
  );
  return (
    <li>
      {x.href ? <Link href={x.href} className="group flex items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-teal-50">{body}</Link> : <span className="flex items-start gap-2 px-2 py-1.5" title={x.locked ? "Your teacher has not opened this unit yet" : "Questions are coming soon"}>{body}</span>}
    </li>
  );
}
