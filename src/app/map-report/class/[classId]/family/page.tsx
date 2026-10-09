import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { FamilyView } from "@/components/map/family-view";
import { ReportPage } from "@/components/map/report-ui";
import { ReportToolbar } from "@/components/map/report-toolbar";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { classFamilyReports } from "@/server/map/map-reports";

export const metadata = { title: "Family Reports · Class" };

/** 👪 The whole class: a cover with every student, then each student's Family Report (one PDF). */
export default async function ClassFamilyPage({ params }: { params: Promise<{ classId: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "reports:read" });
  const me = (await getActor())!.user;
  const { classId } = await params;
  let v;
  try { v = await classFamilyReports(repo, actor, classId); } catch (e) { if (e instanceof ForbiddenError) notFound(); throw e; }
  return (
    <AppShell name={String(me.displayName)}>
      <ReportToolbar back={{ href: `/teacher/map-reports?classId=${classId}`, label: "MAP Reports" }} base={`/map-report/class/${classId}/family`} />
      <ReportPage first>
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-brand-teal">Family Report · Whole Class</p>
        <h1 className="text-3xl font-black text-brand-navy">{v.className} <span className="text-lg font-normal text-slate-500">({v.docs.length} students)</span></h1>
        <p className="mt-1 text-sm text-slate-600">{v.docs[0]?.student.school} · English: Reading and Language Usage</p>
        <table className="mt-5 w-full text-sm">
          <thead><tr className="border-b text-left text-xs uppercase tracking-wide text-slate-500"><th className="py-2">Student</th><th>Reading</th><th>Language Usage</th><th>Practice (30 days)</th></tr></thead>
          <tbody>{v.docs.map((d) => { const r = d.subjects.find((x) => x.subject === "READING")?.latest, l = d.subjects.find((x) => x.subject === "LANGUAGE")?.latest; return (
            <tr key={d.student.id} className="border-b last:border-0"><td className="py-1.5 font-semibold text-slate-800">{d.student.name}</td><td>{r ? `${r.rit} · ${r.descriptor ?? ""}` : "—"}</td><td>{l ? `${l.rit} · ${l.descriptor ?? ""}` : "—"}</td><td>{d.practice.answers} answers · {d.practice.days} days</td></tr>
          ); })}</tbody>
        </table>
      </ReportPage>
      {v.docs.map((d) => <FamilyView key={d.student.id} d={d} first={false} />)}
    </AppShell>
  );
}
