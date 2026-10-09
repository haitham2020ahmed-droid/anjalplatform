import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { PrintButton } from "@/components/plans/print-button";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { respondTracking } from "@/server/curriculum-map/respond-assign";
import { cancelRespondAction, saveRespondMarksAction } from "../actions";

export const metadata = { title: "Respond to Reading · follow up" };
const LV = { BELOW: ["Below", "bg-orange-100 text-orange-900"], ON: ["On", "bg-sky-100 text-sky-900"], ABOVE: ["Above", "bg-emerald-100 text-emerald-900"] } as const;

/** 📋 Who received which version, who finished, scores and comments. */
export default async function RespondFollowUp({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ msg?: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "assignments:read" });
  const me = (await getActor())!.user;
  const { id } = await params;
  const sp = await searchParams;
  const t = await respondTracking(repo, actor, id);
  const pct = t.rows.length ? Math.round((t.finished / t.rows.length) * 100) : 0;
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: `/teacher/respond?classId=${t.classId}`, label: "Respond to Reading" }} icon="📋" title={t.title.replace(/^Respond to Reading · /, "")} subtitle={<>{t.className} · sent {t.createdAt.slice(0, 10)}{t.dueAt ? ` · due ${t.dueAt.slice(0, 10)}` : ""}</>}>
        <PrintButton />
        <Link href={`/admin/curriculum-map/respond/${t.setCode}`} className="rounded-xl bg-white px-4 py-2 font-semibold text-brand-navy ring-1 ring-slate-300">👀 Preview</Link>
      </PageHeader>
      {sp.msg && <p role="status" className="mb-4 rounded-xl bg-teal-50 px-4 py-3 text-teal-900 ring-1 ring-teal-200">{sp.msg}</p>}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200"><p className="text-sm text-slate-500">Finished</p><p className="text-3xl font-bold text-emerald-700">{t.finished} / {t.rows.length}</p><div className="mt-2 h-2 rounded-full bg-slate-100"><div className="h-2 rounded-full bg-emerald-500" style={{ width: `${pct}%` }} /></div></div>
        <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200"><p className="text-sm text-slate-500">Not finished</p><p className="text-3xl font-bold text-amber-700">{t.rows.length - t.finished}</p></div>
        <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200"><p className="text-sm text-slate-500">Versions sent</p><p className="mt-1 text-sm">{(["BELOW", "ON", "ABOVE"] as const).map((l) => `${LV[l][0]}: ${t.rows.filter((r) => r.level === l).length}`).join(" · ")}</p></div>
      </div>
      <form action={saveRespondMarksAction} className="mt-5 rounded-2xl bg-white p-5 ring-1 ring-slate-200">
        <input type="hidden" name="id" value={t.id} />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead><tr className="border-b text-slate-500"><th className="py-2">Student</th><th>Version</th><th>Finished</th><th>Score (0–4)</th><th>Comment</th></tr></thead>
            <tbody>{t.rows.map((r) => (
              <tr key={r.studentId} className="border-b last:border-0">
                <td className="py-2 font-medium"><input type="hidden" name="student" value={r.studentId} /><Link href={`/teacher/progress/${r.studentId}`} className="hover:underline">{r.name}</Link></td>
                <td><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${LV[r.level][1]}`}>{LV[r.level][0]}</span></td>
                <td><label className="flex items-center gap-2"><input type="checkbox" name={`done:${r.studentId}`} value="1" defaultChecked={Boolean(r.finishedAt)} disabled={!t.canEdit} />{r.finishedAt ? <span className="text-emerald-700">✅ {r.finishedAt.slice(0, 10)}</span> : <span className="text-slate-500">Not yet</span>}</label></td>
                <td><select name={`score:${r.studentId}`} defaultValue={r.score ?? ""} disabled={!t.canEdit} aria-label={`Score of ${r.name}`} className="rounded-lg border border-slate-300 px-2 py-1"><option value="">—</option>{[0, 1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}</select></td>
                <td><input name={`fb:${r.studentId}`} defaultValue={r.feedback ?? ""} maxLength={1000} disabled={!t.canEdit} aria-label={`Comment for ${r.name}`} className="w-full rounded-lg border border-slate-300 px-2 py-1" /></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
        {t.canEdit && <button className="mt-4 rounded-xl bg-brand-navy px-5 py-2 font-semibold text-white hover:bg-brand-purple print:hidden">Save</button>}
      </form>
      {t.canEdit && (
        <form action={cancelRespondAction} className="mt-4 print:hidden"><input type="hidden" name="id" value={t.id} /><input type="hidden" name="classId" value={t.classId} />
          <button className="text-sm font-semibold text-red-700 hover:underline">Cancel this task</button></form>
      )}
    </AppShell>
  );
}
