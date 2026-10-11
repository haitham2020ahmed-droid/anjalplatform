import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { ReportToolbar } from "@/components/map/report-toolbar";
import { ClassProfileView } from "@/components/map/class-profile-view";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { classProfile } from "@/server/map/nwea-reports";

export const metadata = { title: "MAP Class Profile" };

/** 👥 NWEA-style Class Profile: Reading or Language Usage, any term. */
export default async function ClassProfilePage({ params, searchParams }: { params: Promise<{ classId: string }>; searchParams: Promise<{ subject?: string; term?: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "reports:read" });
  const me = (await getActor())!.user;
  const { classId } = await params;
  const sp = await searchParams;
  const subject = sp.subject === "LANGUAGE" ? "LANGUAGE" : "READING";
  let d;
  try { d = await classProfile(repo, actor, classId, subject, sp.term); } catch (e) { if (e instanceof ForbiddenError) notFound(); throw e; }
  const base = `/map-report/class/${classId}/profile`;
  return (
    <AppShell name={String(me.displayName)}>
      <ReportToolbar back={{ href: `/teacher/map-reports?classId=${classId}`, label: "MAP Reports" }} base={base} subject={subject}
        extra={d.terms.length > 1 ? <>{d.terms.slice(0, 6).map((t) => <Link key={t} href={`${base}?${new URLSearchParams({ subject, term: t })}`} className={`rounded-full px-3 py-1.5 text-sm font-semibold ${t === d.term ? "bg-teal-600 text-white" : "bg-white ring-1 ring-slate-300"}`}>{t}</Link>)}</> : null} />
      <div className="mx-auto max-w-6xl"><ClassProfileView d={d} /></div>
    </AppShell>
  );
}
