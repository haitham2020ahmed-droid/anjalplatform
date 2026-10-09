import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { PrintButton } from "@/components/plans/print-button";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { ALERT_INFO, alertList, type AlertKind } from "@/server/insights/alerts";
import { readableClasses } from "@/server/teacher/coordinators";
import { handleAlertAction } from "./actions";

export const metadata = { title: "Student alerts" };

const QUICK = ["Talked with the student", "Called / messaged the parent", "Reteaching in a small group", "Sent easier practice", "Asked for a MAP retest"];

/** 🚨 Students who need attention: act, write what you did, mark handled. The head of department sees all. */
export default async function AlertsPage({ searchParams }: { searchParams: Promise<{ status?: string; classId?: string; kind?: string; msg?: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "reports:read" });
  const me = (await getActor())!.user;
  const sp = await searchParams;
  const status = sp.status === "HANDLED" ? "HANDLED" : sp.status === "ALL" ? "ALL" : "OPEN";
  const [rows, classes] = await Promise.all([alertList(repo, actor, { status, classId: sp.classId || null, kind: sp.kind || null }), readableClasses(repo, actor)]);
  const isAdmin = actor.role !== "TEACHER";
  const link = (p: Record<string, string>) => `/teacher/alerts?${new URLSearchParams({ status, classId: sp.classId ?? "", kind: sp.kind ?? "", ...p })}`;
  const chip = (on: boolean) => `rounded-full px-3 py-1 text-sm font-semibold ${on ? "bg-brand-navy text-white" : "bg-white ring-1 ring-slate-200 hover:ring-brand-teal"}`;
  const old = rows.filter((r) => r.status === "OPEN" && r.ageDays >= 7).length;
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: isAdmin ? "/admin" : "/teacher", label: "Home" }} icon="🚨" title="Student alerts"
        subtitle={isAdmin ? <>Every class. <b>{rows.filter((r) => r.status === "OPEN").length}</b> not handled{old ? <>, <b className="text-red-700">{old} for a week or more</b></> : ""}.</> : "Students who need attention now. Do something small, write what you did, and mark it handled: your head of department sees it."}>
        <PrintButton />
        <Link href={`/api/alerts-export?status=${status}`} className="rounded-xl bg-white px-4 py-2 font-semibold text-brand-navy ring-1 ring-slate-300 hover:ring-brand-teal print:hidden">⬇ Excel</Link>
      </PageHeader>
      {sp.msg && <p role="status" className="mb-4 rounded-xl bg-teal-50 px-4 py-3 text-teal-900 ring-1 ring-teal-200 print:hidden">{sp.msg}</p>}
      <div className="flex flex-wrap gap-2 print:hidden">
        {([["OPEN", "Not handled"], ["HANDLED", "Handled"], ["ALL", "All"]] as const).map(([k, l]) => <Link key={k} href={link({ status: k })} className={chip(status === k)}>{l}</Link>)}
        <span className="mx-1 h-6 w-px bg-slate-300" aria-hidden="true" />
        <Link href={link({ classId: "" })} className={chip(!sp.classId)}>All classes</Link>
        {classes.map((c) => <Link key={String(c.id)} href={link({ classId: String(c.id) })} className={chip(sp.classId === c.id)}>{String(c.name)}</Link>)}
      </div>
      <div className="mt-2 flex flex-wrap gap-2 print:hidden">
        <Link href={link({ kind: "" })} className={chip(!sp.kind)}>Every reason</Link>
        {(Object.keys(ALERT_INFO) as AlertKind[]).map((k) => <Link key={k} href={link({ kind: k })} className={chip(sp.kind === k)}>{ALERT_INFO[k].icon} {ALERT_INFO[k].title}</Link>)}
      </div>
      {!rows.length ? <p className="mt-5 rounded-2xl bg-white p-6 text-slate-600 ring-1 ring-slate-200">{status === "OPEN" ? "✅ No student needs attention right now." : "Nothing here."}</p> : (
        <ul className="mt-5 space-y-3">
          {rows.map((r) => (
            <li key={r.id} className={`rounded-2xl bg-white p-4 ring-1 ${r.status === "HANDLED" ? "ring-emerald-200" : r.ageDays >= 7 ? "ring-red-300" : "ring-slate-200"}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-bold text-brand-navy">{r.icon} {r.title} · <Link href={`/teacher/progress/${r.studentId}`} className="hover:underline">{r.name}</Link> <span className="font-normal text-slate-500">· {r.className} · {r.createdAt.slice(0, 10)}{r.status === "OPEN" && r.ageDays >= 7 ? ` · open ${r.ageDays} days` : ""}</span></p>
                  <p className="text-slate-700">{r.detail}</p>
                  {r.status === "OPEN" && <p className="text-sm text-slate-500">💡 {r.tip}</p>}
                  {r.status === "HANDLED" && <p className="mt-1 text-sm text-emerald-800">✅ {r.action} — {r.handledBy} · {r.handledAt?.slice(0, 10)}</p>}
                </div>
              </div>
              {r.status === "OPEN" ? (
                <form action={handleAlertAction} className="mt-3 flex flex-wrap items-center gap-2 print:hidden">
                  <input type="hidden" name="alertId" value={r.id} /><input type="hidden" name="status" value={status} /><input type="hidden" name="classId" value={sp.classId ?? ""} />
                  <input name="action" list="quick-actions" required minLength={3} maxLength={1000} placeholder="What did you do?" className="min-w-[16rem] flex-1 rounded-lg border border-slate-300 px-3 py-2" />
                  <button className="rounded-xl bg-emerald-600 px-4 py-2 font-semibold text-white hover:bg-emerald-700">✓ Mark handled</button>
                </form>
              ) : (
                <form action={handleAlertAction} className="mt-2 print:hidden"><input type="hidden" name="alertId" value={r.id} /><input type="hidden" name="reopen" value="1" /><input type="hidden" name="status" value={status} /><button className="text-xs font-semibold text-slate-500 underline">Open again</button></form>
              )}
            </li>
          ))}
        </ul>
      )}
      <datalist id="quick-actions">{QUICK.map((q) => <option key={q} value={q} />)}</datalist>
    </AppShell>
  );
}
