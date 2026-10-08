import { parentSummary, type ParentSummary } from "@/server/student/parent-summary";
import { AppShell } from "@/components/app-shell";
import { ReportDownloads } from "@/components/reports/report-downloads";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { parentChildren } from "@/server/queries/parent";

/** Parent home: each linked child with their progress report (Arabic or English PDF). */
export default async function ParentHome() {
  const actor = await requireActor({ roles: ["PARENT"] });
  const me = (await getActor())!.user;
  const children = await parentChildren(repo, actor);
  // each child's monthly summary, in parallel
  const summaries = new Map(await Promise.all(children.map(async (c) => [c.studentId, await parentSummary(repo, actor, c.studentId)] as const)));
  return (
    <AppShell name={String(me.displayName)}>
      <h1 className="text-3xl font-bold text-brand-navy">My children</h1>
      <p className="mt-1 text-slate-600" dir="rtl" lang="ar">أبنائي: تقارير التقدّم في اللغة الإنجليزية</p>
      {children.length === 0 ? (
        <p className="mt-6 text-slate-600">No children are linked to your account yet. Please contact the school.</p>
      ) : (
        children.map((c) => (
          <div key={c.studentId} className="mt-6">
            <h2 className="text-xl font-bold text-brand-navy"><bdi>{c.name}</bdi></h2>
            <p className="text-sm text-slate-500">Grade {c.grade}{c.className ? `, class ${c.className}` : ""}</p>
            <ParentMonthly s={summaries.get(c.studentId)!} />
            <ReportDownloads title="Progress report (this term) · تقرير التقدّم (الفصل الحالي)" report={{ kind: "student", studentId: c.studentId, period: "TERM" }} formats={["pdf"]} />
          </div>
        ))
      )}
    </AppShell>
  );
}

const LV: Record<string, [string, string]> = { BELOW: ["🟠 Below level", "دون المستوى"], ON: ["🔵 On level", "في المستوى"], ABOVE: ["🟢 Above level", "فوق المستوى"] };

/** 👪 This month, in plain words (English · العربية). */
function ParentMonthly({ s }: { s: ParentSummary }) {
  return (
    <div className="mt-3 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <p className="font-bold text-brand-navy">This month · <span dir="rtl" lang="ar">هذا الشهر</span></p>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Practice · <span lang="ar">التدريب</span></p><p className="text-xl font-extrabold text-brand-navy">{s.answers30}</p><p className="text-xs text-slate-500">answers · إجابة</p></div>
        <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Correct · <span lang="ar">الإجابات الصحيحة</span></p><p className="text-xl font-extrabold text-brand-navy">{s.accuracy30 ?? "—"}{s.accuracy30 !== null && "%"}</p></div>
        <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">MAP Reading · <span lang="ar">القراءة</span></p>
          <p className="text-xl font-extrabold text-brand-navy">{s.map ? s.map.rit : "—"}{s.map?.goal ? <span className="text-sm font-semibold text-slate-500"> → goal {s.map.goal}</span> : null}</p>{s.map && <p className="text-xs text-slate-500">{s.map.term}</p>}</div>
      </div>
      {(s.categories.length > 0 || s.overall) && (
        <ul className="mt-3 space-y-1 text-sm">
          {s.categories.length ? s.categories.map((c) => <li key={c.name} className="flex flex-wrap justify-between gap-2"><span>{c.name}</span><b>{LV[c.level]?.[0]} · <span lang="ar">{LV[c.level]?.[1]}</span></b></li>)
            : <li className="flex flex-wrap justify-between gap-2"><span>Reading level · مستوى القراءة</span><b>{LV[s.overall!]?.[0]} · <span lang="ar">{LV[s.overall!]?.[1]}</span></b></li>}
        </ul>
      )}
      <p className="mt-3 rounded-xl bg-teal-50 px-3 py-2 text-sm text-teal-900">🏠 {s.tip.en}<br /><span dir="rtl" lang="ar">{s.tip.ar}</span></p>
    </div>
  );
}
