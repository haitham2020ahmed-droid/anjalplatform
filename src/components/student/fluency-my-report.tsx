import { repo } from "@/server/auth/next";
import { fluencyMyReport } from "@/server/student/reading-report";
import { getT } from "@/i18n/server";

/**
 * 🎙️ "My report" for the Fluency Coach page (agent F places it; anchor #my-report): my 1-minute checks (words correct
 * per minute) as simple bars, my growth, my goal and my readings in 2 weeks. The student's OWN numbers only — the
 * page passes actor.studentId. No Below / On / Above words. Usage: <FluencyMyReport studentId={actor.studentId!} />
 */
export async function FluencyMyReport({ studentId }: { studentId: string }) {
  const { t } = await getT();
  const r = await fluencyMyReport(repo, studentId);
  const max = Math.max(1, r.goal ?? 0, ...r.checks.map((c) => c.wcpm));
  return (
    <section id="my-report" aria-labelledby="fc-report-h" data-testid="fluency-my-report" className="scroll-mt-24 rounded-3xl bg-rose-50 p-5 ring-1 ring-rose-200 sm:p-6">
      <h2 id="fc-report-h" className="text-xl font-semibold text-brand-navy">📊 {t("My report")}</h2>
      {!r.checks.length ? <p className="mt-2 text-slate-600">{t("No 1-minute check yet.")}</p> : (
        <>
          <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {([["Words correct per minute", r.latest === null ? "—" : String(r.latest)], ["Growth", r.growth === null ? "—" : `${r.growth >= 0 ? "+" : ""}${r.growth}`], ["Goal", r.goal === null ? "—" : String(r.goal)], ["Readings in 2 weeks", String(r.readings14)]] as const).map(([k, v]) => (
              <div key={k} className="rounded-2xl bg-white p-3"><dt className="text-xs font-semibold text-slate-500">{t(k)}</dt><dd className="text-3xl font-bold tabular-nums text-brand-navy">{v}</dd></div>
            ))}
          </dl>
          <ul className="mt-4 space-y-2" aria-label={t("My 1-minute checks")}>
            {r.checks.map((c, i) => (
              <li key={c.date + i} className="flex items-center gap-3 text-sm">
                <span dir="ltr" className="w-24 shrink-0 text-slate-600">{c.date}</span>
                <span className="h-3 flex-1 overflow-hidden rounded-full bg-white" aria-hidden="true"><span className="block h-full rounded-full bg-rose-400" style={{ width: `${Math.round((100 * c.wcpm) / max)}%` }} /></span>
                <span className="w-12 shrink-0 text-end font-semibold tabular-nums text-brand-navy">{c.wcpm}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
