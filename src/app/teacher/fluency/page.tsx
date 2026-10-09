import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { accessibleClasses } from "@/server/teacher/assign";
import { classFluency } from "@/server/teacher/support";
import { saveFluencyAction } from "./actions";

export const metadata = { title: "Reading Fluency" };

/** 🔊 Oral reading fluency: type each student's words correct per minute after a one-minute reading. */
export default async function FluencyPage({ searchParams }: { searchParams: Promise<{ classId?: string; msg?: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN"], permission: "reports:read" });
  const me = (await getActor())!.user;
  const sp = await searchParams;
  const classes = (await accessibleClasses(repo, actor)).sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const classId = classes.some((c) => c.id === sp.classId) ? String(sp.classId) : classes[0] ? String(classes[0].id) : "";
  const v = classId ? await classFluency(repo, actor, classId) : null;
  const tone = (w: number, b: number) => (w >= b ? "bg-emerald-100 text-emerald-900" : w >= b * 0.75 ? "bg-amber-100 text-amber-900" : "bg-rose-100 text-rose-900");
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/teacher", label: "Home" }} icon="🔊" title="Reading Fluency" subtitle="Each student reads a grade-level passage aloud for one minute; type the words read correctly (WCPM). Reading Aloud recordings you score with a WCPM are added here too." />
      {sp.msg && <p role="status" className="mb-5 rounded-2xl bg-teal-50 px-4 py-3 text-teal-900 ring-1 ring-teal-200">{sp.msg}</p>}
      <nav aria-label="Classes" className="mb-4 flex flex-wrap gap-2">{classes.map((c) => <Link key={String(c.id)} href={`/teacher/fluency?classId=${c.id}`} aria-current={c.id === classId ? "page" : undefined} className={`rounded-full px-4 py-1.5 text-sm font-bold ${c.id === classId ? "bg-brand-navy text-white" : "bg-white ring-1 ring-slate-200"}`}>{String(c.name)}</Link>)}</nav>
      {v && (
        <form action={saveFluencyAction} className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
          <input type="hidden" name="classId" value={classId} />
          <p className="mb-3 text-sm text-slate-600">Grade {v.grade} benchmark: about <b>{v.benchmark}</b> WCPM (mid-year). <span className="rounded bg-emerald-100 px-1">at benchmark</span> <span className="rounded bg-amber-100 px-1">75–99%</span> <span className="rounded bg-rose-100 px-1">under 75%</span></p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead><tr className="border-b border-slate-200 text-left text-slate-500"><th className="py-2">Student</th><th>Latest</th><th>History</th><th>New WCPM</th><th>Accuracy %</th><th>Note</th></tr></thead>
              <tbody>
                {v.rows.map((r) => (
                  <tr key={r.id} className="border-b border-slate-100">
                    <td className="py-2 font-medium">{r.name}<input type="hidden" name="studentId" value={r.id} /></td>
                    <td>{r.latest ? <span className={`rounded px-2 py-0.5 font-bold tabular-nums ${tone(r.latest.wcpm, v.benchmark)}`}>{r.latest.wcpm}</span> : <span className="text-slate-400">—</span>}{r.latest && <span className="ms-1 text-xs text-slate-500">{r.latest.date}{r.latest.source === "RECORDING" ? " 🎙" : ""}</span>}</td>
                    <td className="text-xs tabular-nums text-slate-600">{r.history.map((h) => h.wcpm).join(" → ") || "—"}</td>
                    <td><input type="number" name={`w-${r.id}`} min={0} max={400} className="w-20 rounded-lg border border-slate-300 px-2 py-1" aria-label={`${r.name}: words correct per minute`} /></td>
                    <td><input type="number" name={`a-${r.id}`} min={0} max={100} className="w-20 rounded-lg border border-slate-300 px-2 py-1" aria-label={`${r.name}: accuracy`} /></td>
                    <td><input name={`n-${r.id}`} maxLength={500} placeholder="e.g. reads word by word" className="w-full min-w-[12rem] rounded-lg border border-slate-300 px-2 py-1" aria-label={`${r.name}: note`} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex justify-end"><button className="rounded-xl bg-brand-navy px-6 py-2.5 font-bold text-white hover:bg-brand-purple">Save checks</button></div>
        </form>
      )}
    </AppShell>
  );
}
