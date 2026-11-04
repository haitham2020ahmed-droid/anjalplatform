import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { resetCandidates } from "@/server/readrise/placement-reset";
import { ADMIN_TABS, ReadRiseTabs } from "../_components/tabs";
import { Flash } from "../_components/ui";
import { resetPlacementsAction } from "../actions";

export const metadata = { title: "ReadRise reset placement" };

const field = "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm";
const s = (v: unknown) => String(v ?? "");

/**
 * 🔄 ReadRise (admin): let a grade, a class, chosen students — or only the doubtful results — take the placement
 * again (placement-reset.ts). The list shows each student's level and why a result looks doubtful; every row is
 * ticked, untick the ones to keep. Admins only.
 */
export default async function ReadRiseResetPage({ searchParams }: { searchParams: Promise<{ grade?: string; class?: string; q?: string; doubtful?: string; msg?: string }> }) {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "questions:read" });
  const me = (await getActor())!.user;
  const sp = await searchParams;
  const schoolId = actor.schoolId ?? "";
  const f = { gradeId: s(sp.grade) || undefined, classId: s(sp.class) || undefined, q: s(sp.q) || undefined, doubtful: sp.doubtful === "1" };
  const [grades, classes] = await Promise.all([
    repo.findMany("Grade", { schoolId }, { select: ["id", "name", "level"] }),
    repo.findMany("Class", { schoolId, deletedAt: null }, { select: ["id", "name", "gradeId"] }),
  ]);
  const chosen = !!schoolId && !!(f.gradeId || f.classId || f.q || f.doubtful);
  const list = chosen ? await resetCandidates(repo, actor, f) : [];
  const ready = list.filter((x) => !x.pending);
  const shownClasses = classes.filter((c) => !f.gradeId || s(c.gradeId) === f.gradeId).sort((a, b) => s(a.name).localeCompare(s(b.name)));
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/admin", label: "Admin" }} icon="🔄" title="Reset placement"
        subtitle="Choose students who take the ReadRise placement test again. Their level stays until the new test ends; nothing is deleted (readings, scores, words and the level history stay). The new result also becomes their start level for the year.">
        <ReadRiseTabs items={ADMIN_TABS} current="/admin/readrise/reset" />
      </PageHeader>
      <Flash msg={sp.msg} />

      <form method="get" className="mb-5 flex flex-wrap items-end gap-3 rounded-2xl bg-white p-4 ring-1 ring-slate-200">
        <label className="text-sm font-semibold">Grade
          <select name="grade" defaultValue={f.gradeId ?? ""} className={`${field} mt-1 block`}>
            <option value="">All grades</option>
            {[...grades].sort((a, b) => Number(a.level) - Number(b.level)).map((g) => <option key={s(g.id)} value={s(g.id)}>{s(g.name) || `Grade ${s(g.level)}`}</option>)}
          </select>
        </label>
        <label className="text-sm font-semibold">Class
          <select name="class" defaultValue={f.classId ?? ""} className={`${field} mt-1 block`}>
            <option value="">All classes</option>
            {shownClasses.map((c) => <option key={s(c.id)} value={s(c.id)}>{s(c.name)}</option>)}
          </select>
        </label>
        <label className="text-sm font-semibold">Student name
          <input name="q" defaultValue={f.q ?? ""} placeholder="Part of a name" className={`${field} mt-1 block`} />
        </label>
        <label className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-950 ring-1 ring-amber-200">
          <input type="checkbox" name="doubtful" value="1" defaultChecked={f.doubtful} /> Only doubtful results
        </label>
        <button className="rounded-lg bg-brand-navy px-4 py-2 text-sm font-semibold text-white">Show students</button>
      </form>

      <div className="mb-5 rounded-2xl bg-slate-50 px-5 py-3 text-sm text-slate-700 ring-1 ring-slate-200">
        <p className="font-semibold text-brand-navy">A result is &quot;doubtful&quot; when:</p>
        <ul className="mt-1 list-disc ps-5">
          <li>the test was taken before the placement fix of 30 Oct 2026 (a weak reader could reach a high level with lucky answers);</li>
          <li>the level is more than 250 from the student&apos;s latest MAP Lexile;</li>
          <li>the student&apos;s own readings average under 60% (3 or more readings) — the level looks too high.</li>
        </ul>
      </div>

      {!schoolId ? (
        <p className="rounded-2xl bg-white px-5 py-6 text-slate-600 ring-1 ring-slate-200">Open this page from a school admin account.</p>
      ) : !chosen ? (
        <p className="rounded-2xl bg-white px-5 py-6 text-slate-600 ring-1 ring-slate-200">Choose a grade, a class, a name, or &quot;Only doubtful results&quot;, then press <b>Show students</b>.</p>
      ) : !list.length ? (
        <p className="rounded-2xl bg-white px-5 py-6 text-slate-600 ring-1 ring-slate-200">No placed students match. (Students who never took the placement are not listed: they take it anyway.)</p>
      ) : (
        <form action={resetPlacementsAction} className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
          <input type="hidden" name="f_grade" value={f.gradeId ?? ""} /><input type="hidden" name="f_class" value={f.classId ?? ""} />
          <input type="hidden" name="f_q" value={f.q ?? ""} /><input type="hidden" name="f_doubtful" value={f.doubtful ? "1" : ""} />
          <p className="mb-3 text-sm text-slate-700"><b>{list.length}</b> student(s) · <b>{ready.length}</b> can be reset · untick anyone to keep.</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-slate-200 text-start text-xs uppercase text-slate-500">
                <th className="p-2 text-start">Reset</th><th className="p-2 text-start">Student</th><th className="p-2 text-start">Grade · class</th>
                <th className="p-2 text-start">Level</th><th className="p-2 text-start">Placed</th><th className="p-2 text-start">Why it looks doubtful</th>
              </tr></thead>
              <tbody>
                {list.map((x) => (
                  <tr key={x.studentId} className="border-b border-slate-100 align-top">
                    <td className="p-2">{x.pending ? <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">Waiting</span> : <input type="checkbox" name="studentId" value={x.studentId} defaultChecked aria-label={`Reset ${x.name}`} />}</td>
                    <td className="p-2 font-semibold text-brand-navy">{x.name}</td>
                    <td className="p-2 text-slate-600">{x.grade}{x.classes ? ` · ${x.classes}` : ""}</td>
                    <td className="p-2 tabular-nums">{x.level ?? "—"}</td>
                    <td className="p-2 tabular-nums text-slate-600">{x.placedAt ?? "—"}</td>
                    <td className="p-2">{x.reasons.length ? <ul className="space-y-0.5 text-xs text-amber-900">{x.reasons.map((r) => <li key={r}>⚠️ {r}</li>)}</ul> : <span className="text-xs text-slate-400">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-slate-500">&quot;Waiting&quot; = a retake is already allowed or a test is open: nothing to do.</p>
          {ready.length > 0 && (
            <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-slate-200 pt-4">
              <label className="text-sm font-semibold">Reason (optional, shown in the level history)
                <input name="reason" maxLength={150} placeholder="e.g. Grade 11 results before the fix" className={`${field} mt-1 block w-80 max-w-full`} />
              </label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="confirm" required /> I understand: the ticked students take the placement again</label>
              <button className="rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white">🔄 Reset placement for ticked students</button>
            </div>
          )}
        </form>
      )}
    </AppShell>
  );
}
