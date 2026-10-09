import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PrintButton } from "@/components/plans/print-button";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { skillPlanForStudent, type StudentPlanView } from "@/server/curriculum-map/plans";

export const metadata = { title: "Unit Certificate" };

/** 🏅 A printable certificate for a unit of my plan that I finished. */
export default async function UnitCertificate({ params, searchParams }: { params: Promise<{ planId: string }>; searchParams: Promise<{ unit?: string }> }) {
  const actor = await requireActor({ roles: ["STUDENT"] });
  const me = (await getActor())!.user;
  const { planId } = await params;
  const unit = String((await searchParams).unit ?? "");
  let p: StudentPlanView | null = null;
  try { p = await skillPlanForStudent(repo, actor, planId); } catch (e) { if (!(e instanceof ForbiddenError)) throw e; }
  const parts = p?.places.filter((x) => x.unit === unit) ?? [];
  const earned = parts.length > 0 && parts.every((x) => x.status === "COMPLETED");
  const back = <Link href={`/student/plans/${planId}`} className="font-semibold text-brand-teal">← My plan</Link>;
  if (!p || !earned) return <AppShell name={String(me.displayName)}><p className="text-lg text-slate-700">Finish every part of this unit to get its certificate.</p><div className="mt-4">{back}</div></AppShell>;
  const skills = [...new Set(parts.map((x) => x.label))];
  return (
    <AppShell name={String(me.displayName)}>
      <div className="mb-4 flex justify-between gap-2 print:hidden">{back}<PrintButton /></div>
      <div className="mx-auto max-w-3xl rounded-[2rem] border-[10px] border-double border-amber-400 bg-gradient-to-b from-amber-50 to-white p-10 text-center shadow-lg print:shadow-none">
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-amber-700">Al-Anjal Adaptive ELA</p>
        <p className="mt-4 text-5xl" aria-hidden="true">🏅</p>
        <h1 className="mt-2 text-4xl font-extrabold text-brand-navy">Certificate of Achievement</h1>
        <p className="mt-6 text-lg text-slate-600">This certifies that</p>
        <p className="mt-1 text-3xl font-bold text-brand-navy">{String(me.displayName)}</p>
        <p className="mt-1 text-slate-600">{p.className}</p>
        <p className="mt-6 text-lg text-slate-700">has completed every part of</p>
        <p className="mt-1 text-2xl font-bold text-brand-teal">{unit}</p>
        <p className="mt-2 text-sm text-slate-500">{parts.length} parts · {p.target} correct answers each</p>
        <p className="mx-auto mt-6 max-w-xl text-sm text-slate-600">Skills practised: {skills.join(" · ")}</p>
        <p className="mt-8 text-sm text-slate-500">{new Date().toISOString().slice(0, 10)}</p>
      </div>
    </AppShell>
  );
}
