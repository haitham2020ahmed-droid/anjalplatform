import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { listDiagnostics, PERIOD_LABEL, PERIODS, periodOf, schoolYear } from "@/server/diagnostic/test";
import { buildAllDiagnosticsAction, buildDiagnosticAction } from "../actions";

export const metadata = { title: "Build a Diagnostic" };

/** 🛠 Build the Diagnostic for a period (BOY · MOY · EOY), full or focus form (admins). */
export default async function BuildDiagnosticPage({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN"], permission: "assignments:create" });
  const me = (await getActor())!.user;
  const sp = await searchParams;
  const grades = (await repo.findMany("Grade", { schoolId: actor.schoolId })).filter((g) => g.isActive !== false).map((g) => Number(g.level)).sort((a, b) => a - b);
  const year = schoolYear();
  const now = periodOf();
  const tests = (await listDiagnostics(repo, actor)).filter((t) => t.year === year);
  const box = "rounded-lg border border-slate-300 px-3 py-2";
  const periodField = (
    <label className="flex flex-col gap-1 text-sm font-semibold text-slate-700">Period
      <select name="period" defaultValue={now} className={box}>{PERIODS.map((p) => <option key={p} value={p}>{p} · {PERIOD_LABEL[p]}{p === now ? " (now)" : ""}</option>)}</select>
    </label>
  );
  const formField = (
    <label className="flex flex-col gap-1 text-sm font-semibold text-slate-700">Form (MOY / EOY)
      <select name="form" defaultValue="full" className={box}><option value="full">Full — every skill</option><option value="focus">Focus — each student re-tests the strands still Approaching or borderline</option></select>
    </label>
  );
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/admin/diagnostic", label: "Diagnostic Test" }} icon="🛠" title="Build a Diagnostic" subtitle={`School year ${year}. The period follows today's date (Aug–Nov BOY · Dec–Feb MOY · Mar–Jul EOY) unless you choose another. BOY is always the full test.`} />
      {sp.msg && <p role="status" className="mb-5 rounded-2xl bg-teal-50 px-4 py-3 text-teal-900 ring-1 ring-teal-200">{sp.msg}</p>}
      <section className="mb-6 grid gap-4 md:grid-cols-2">
        <form action={buildDiagnosticAction} className="flex flex-col gap-3 rounded-3xl bg-white p-5 ring-1 ring-slate-200">
          <h2 className="text-lg font-bold text-brand-navy">One grade</h2>
          <input type="hidden" name="back" value="/diagnostic/build" />
          <label className="flex flex-col gap-1 text-sm font-semibold text-slate-700">Grade<select name="grade" className={box}>{grades.map((g) => <option key={g} value={g}>Grade {g}</option>)}</select></label>
          {periodField}{formField}
          <button className="self-start rounded-xl bg-brand-navy px-4 py-2 font-bold text-white">Build</button>
        </form>
        <form action={buildAllDiagnosticsAction} className="flex flex-col gap-3 rounded-3xl bg-white p-5 ring-1 ring-slate-200">
          <h2 className="text-lg font-bold text-brand-navy">Every grade (the same skills)</h2>
          {periodField}{formField}
          <button className="self-start rounded-xl bg-brand-navy px-4 py-2 font-bold text-white">Build all</button>
        </form>
      </section>
      <h2 className="mb-2 text-lg font-bold text-brand-navy">This year’s tests</h2>
      <ul className="space-y-2">{tests.map((t) => <li key={t.id}><Link href={`/admin/diagnostic/${t.id}`} className="font-semibold text-brand-purple underline">{t.title}</Link> <span className="text-sm text-slate-600">· {t.status}</span></li>)}</ul>
    </AppShell>
  );
}
