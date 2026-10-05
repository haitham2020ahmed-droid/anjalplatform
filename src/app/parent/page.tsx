import { AppShell } from "@/components/app-shell";
import { ReportDownloads } from "@/components/reports/report-downloads";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { parentChildren } from "@/server/queries/parent";

/** Parent home: each linked child with their progress report (Arabic or English PDF). */
export default async function ParentHome() {
  const actor = await requireActor({ roles: ["PARENT"] });
  const me = (await getActor())!.user;
  const children = await parentChildren(repo, actor);
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
            <ReportDownloads title="Progress report (this term) · تقرير التقدّم (الفصل الحالي)" report={{ kind: "student", studentId: c.studentId, period: "TERM" }} formats={["pdf"]} />
          </div>
        ))
      )}
    </AppShell>
  );
}
