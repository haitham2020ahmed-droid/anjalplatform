import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader, Section } from "@/components/page-header";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { diagnosticReadiness, listDiagnostics, schoolYear } from "@/server/diagnostic/test";
import { STRAND_LABEL } from "@/server/diagnostic/standards";
import { buildAllDiagnosticsAction, buildDiagnosticAction } from "@/app/diagnostic/actions";
import { diagnosticWindows, type WindowRow } from "@/server/diagnostic/window";
import { BTN_PRIMARY, BTN_SECONDARY, CARD, EmptyState } from "@/components/ui-kit";
import { getT } from "@/i18n/server";
import type { TFn } from "@/i18n";
import { setDiagnosticWindowAction } from "./actions";

export const metadata = { title: "Diagnostic Test" };
const STATUS: Record<string, string> = { DRAFT: "bg-amber-100 text-amber-900", OPEN: "bg-emerald-100 text-emerald-900", CLOSED: "bg-slate-200 text-slate-700" };

/** 📝 The beginning-of-year Diagnostic Test of each grade: build, review, open, follow, report. */
export default async function AdminDiagnostic({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "reports:read" });
  const me = (await getActor())!.user;
  const sp = await searchParams;
  const [tests, grades, ready] = await Promise.all([listDiagnostics(repo, actor), repo.findMany("Grade", { schoolId: actor.schoolId }), diagnosticReadiness(repo, actor)]);
  const levels = grades.filter((g) => g.isActive !== false).map((g) => Number(g.level)).sort((a, b) => a - b);
  const year = schoolYear();
  const [windows, { t }] = await Promise.all([diagnosticWindows(repo, actor).catch((e) => { if (e instanceof ForbiddenError) return [] as WindowRow[]; throw e; }), getT()]);
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/admin", label: "Home" }} icon="📝" title="Diagnostic Test"
        subtitle="Three times a year (beginning, middle and end): 50 questions on the same skills for every grade, adaptive — each right answer brings a harder question, each wrong one an easier one, across grades. It finds each student’s reading level in every skill and MAP goal area, sets their level, estimates their MAP RIT, and gives every teacher a full analysis. The two MAP tests later in the year show the growth." />
      {sp.msg && <p role="status" className="mb-5 rounded-2xl bg-teal-50 px-4 py-3 text-teal-900 ring-1 ring-teal-200">{sp.msg}</p>}
      <Section title={`${t("Open for Students")} · ${year}`} icon="🗓️" hint={t("Only you open and close the Diagnostic Test. Students take it once per school year, while it is open for their grade.")} className="mb-6">
        {!windows.length ? <EmptyState compact icon="🛠️" title="No Diagnostic Test yet" text="Build the test below, then open it here for each grade." /> : (
          <ul className="grid gap-3">{windows.map((w) => <WindowCard key={w.grade} w={w} t={t} />)}</ul>
        )}
      </Section>
      <Section title={`Build the Tests · ${year}`} icon="🛠️" hint="The questions come from the Question Bank, Curriculum Map and ReadMaster (published, marked by the platform), from two grades below to two grades above. You review each test before it opens." className="mb-6">
        <div className="flex flex-wrap items-end gap-3">
          <Link href="/diagnostic/build" className="rounded-xl px-4 py-2.5 text-sm font-bold text-brand-navy ring-1 ring-slate-300 hover:ring-brand-teal">🗓️ Middle / End of Year test (full or focus form)</Link>
          <form action={buildAllDiagnosticsAction}><button className="rounded-xl bg-brand-navy px-6 py-2.5 font-bold text-white hover:bg-brand-purple">🛠️ Build for every grade (the same 50 skills)</button></form>
          <form action={buildDiagnosticAction} className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-sm font-semibold text-slate-700">One grade<select name="grade" className="rounded-xl border border-slate-300 px-3 py-2">{levels.map((g) => <option key={g} value={g}>Grade {g}</option>)}</select></label>
            <button className="rounded-xl px-4 py-2.5 text-sm font-bold text-brand-navy ring-1 ring-slate-300 hover:ring-brand-teal">Build</button>
          </form>
          <p className="text-xs text-slate-500">Building again (while a test is a draft) uses the bank as it is now.</p>
        </div>
      </Section>

      <Section title="Is the Question Bank Ready?" icon="🧮" className="mb-6" hint="Each skill slot needs questions easier, on and harder than the grade, so the test can follow every student. Ready = every slot can be filled · Strong = 3 questions per slot spread over the three difficulties.">
        <div className="mb-3 flex flex-wrap gap-2">
          {ready.grades.map((g) => <span key={g.grade} className={`rounded-full px-3 py-1 text-sm font-bold ${g.strong ? "bg-emerald-100 text-emerald-900" : g.ready ? "bg-sky-100 text-sky-900" : "bg-rose-100 text-rose-900"}`}>Grade {g.grade}: {g.strong ? "Strong" : g.ready ? "Ready" : "Not ready"} · {g.pool} questions{g.short.length ? ` · add ${g.short.join(", ")}` : ""}</span>)}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-xs">
            <thead><tr className="border-b border-slate-200 text-left text-slate-500"><th className="py-2 pe-2">Skill (slots)</th>{ready.grades.map((g) => <th key={g.grade} className="px-2 text-center">Grade {g.grade}<span className="block font-normal">easier · on · harder</span></th>)}</tr></thead>
            <tbody>{ready.blueprint.map((b) => (
              <tr key={b.anchor} className="border-b border-slate-100">
                <td className="py-1.5 pe-2"><b className="font-mono text-brand-teal">{b.anchor}</b> {b.label} <span className="text-slate-500">· {STRAND_LABEL[b.strand]} · {b.slots}</span></td>
                {ready.grades.map((g) => { const x = g.anchors.find((y) => y.anchor === b.anchor)!; const ok = x.easier + x.on + x.harder >= 3 * x.slots && x.easier && x.on && x.harder; const some = x.easier + x.on + x.harder >= x.slots; return <td key={g.grade} className={`px-2 text-center tabular-nums ${ok ? "bg-emerald-50" : some ? "bg-amber-50" : "bg-rose-50 font-bold text-rose-800"}`}>{x.easier} · {x.on} · {x.harder}</td>; })}
              </tr>
            ))}</tbody>
          </table>
        </div>
      </Section>
      <Section title="Tests" icon="📋">
        {!tests.length ? <p className="text-slate-600">No test yet. Build one above.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead><tr className="border-b border-slate-200 text-left text-slate-500"><th className="py-2 pe-3">Test</th><th className="px-3">Status</th><th className="px-3">Questions</th><th className="px-3">Pool</th><th className="px-3">Window</th><th className="px-3">Finished</th><th className="px-3" /></tr></thead>
              <tbody>
                {tests.map((t) => (
                  <tr key={t.id} className="border-b border-slate-100">
                    <td className="py-3 pe-3"><Link href={`/admin/diagnostic/${t.id}`} className="font-semibold text-brand-navy hover:underline">{t.title}</Link></td>
                    <td className="px-3"><span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${STATUS[t.status] ?? ""}`}>{t.status === "DRAFT" ? "Draft — review" : t.status === "OPEN" ? "Open" : "Closed"}</span></td>
                    <td className="px-3 tabular-nums">{t.questions}{t.adaptive ? " · adaptive" : ""}</td>
                    <td className="px-3 tabular-nums text-slate-600">{t.adaptive ? t.pool : "—"}</td>
                    <td className="px-3 text-slate-600">{t.opensAt ?? "—"}{t.closesAt ? ` → ${t.closesAt}` : ""}</td>
                    <td className="px-3"><span className="flex items-center gap-2"><span className="block h-1.5 w-24 overflow-hidden rounded-full bg-slate-100"><span className="block h-full bg-brand-teal" style={{ width: `${t.students ? Math.round((100 * t.finished) / t.students) : 0}%` }} /></span><span className="tabular-nums">{t.finished}/{t.students}</span></span></td>
                    <td className="px-3 text-end">{t.status !== "DRAFT" && <Link href={`/diagnostic/${t.id}/report`} className="rounded-lg bg-brand-navy px-3 py-1.5 text-xs font-bold text-white hover:bg-brand-purple">📊 Analysis</Link>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </AppShell>
  );
}

const CHIP: Record<WindowRow["status"], { label: string; cls: string; icon: string }> = {
  OPEN: { label: "Open", cls: "bg-emerald-100 text-emerald-900", icon: "🟢" },
  SCHEDULED: { label: "Scheduled", cls: "bg-sky-100 text-sky-900", icon: "🗓️" },
  CLOSED: { label: "Closed", cls: "bg-slate-200 text-slate-700", icon: "⏸️" },
};
/** the server's own calendar day (the dates are saved as the server's local midnight / end of day) */
const ymd = (iso: string | null) => { if (!iso) return ""; const x = new Date(iso); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`; };
const nice = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—");

/** One grade: status chip, progress, the big Open / Close button (Manual) or the dates (Automatic). */
function WindowCard({ w, t }: { w: WindowRow; t: TFn }) {
  const chip = CHIP[w.status];
  const pct = w.students ? Math.round((100 * w.finished) / w.students) : 0;
  const hidden = (open: "0" | "1", mode: "MANUAL" | "AUTO") => (<><input type="hidden" name="grade" value={w.grade} /><input type="hidden" name="mode" value={mode} /><input type="hidden" name="open" value={open} /></>);
  const isOpen = w.status === "OPEN";
  return (
    <li className={`${CARD} flex flex-wrap items-center gap-4`}>
      <div className="min-w-[9rem]">
        <p className="text-xl font-bold text-brand-navy">{t("Grade {n}", { n: w.grade })}</p>
        <span className={`mt-1 inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm font-bold ${chip.cls}`}><span aria-hidden="true">{chip.icon}</span>{t(chip.label)}</span>
        <span className="ms-2 text-xs font-semibold text-slate-500">{t(w.mode === "AUTO" ? "Automatic" : "Manual")}</span>
      </div>
      <div className="min-w-[12rem] flex-1">
        <div className="h-2.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-brand-teal" style={{ width: `${pct}%` }} /></div>
        <p className="mt-1 text-sm font-semibold text-slate-700">{t("{n} of {m} students finished", { n: w.finished, m: w.students })}</p>
        {w.mode === "AUTO" && <p className="text-sm text-slate-600">{t("Opens {from} · closes {to}", { from: nice(w.opensAt), to: nice(w.closesAt) })}</p>}
        {w.draft && <p className="text-xs text-slate-500">{t("Opening it sends the test to every class of the grade.")}</p>}
      </div>
      {!w.testId ? <p className="text-sm font-semibold text-slate-600">{t("Build this year's test first")}</p> : (
        <div className="flex flex-col items-stretch gap-2 sm:items-end">
          {w.mode === "MANUAL" ? (
            <form action={setDiagnosticWindowAction}>{hidden(isOpen ? "0" : "1", "MANUAL")}
              <button className={`${isOpen ? BTN_SECONDARY : BTN_PRIMARY} min-w-[11rem] px-6 py-3 text-lg`}>{isOpen ? `⏸️ ${t("Close the test")}` : `▶️ ${t("Open the test")}`}</button>
            </form>
          ) : (
            <form action={setDiagnosticWindowAction}>{hidden("0", "MANUAL")}<button className={`${BTN_SECONDARY} text-sm`}>{t("Switch to manual")}</button></form>
          )}
          <details className="text-sm" open={w.mode === "AUTO" ? true : undefined}>
            <summary className="cursor-pointer font-semibold text-brand-navy">🗓️ {t("Open and close by dates")}</summary>
            <form action={setDiagnosticWindowAction} className="mt-2 flex flex-wrap items-end gap-2">{hidden("0", "AUTO")}
              <label className="flex flex-col gap-1 font-semibold text-slate-700">{t("Open date")}<input type="date" name="opensAt" required defaultValue={ymd(w.opensAt)} className="rounded-xl border border-slate-300 px-3 py-2" /></label>
              <label className="flex flex-col gap-1 font-semibold text-slate-700">{t("Close date")}<input type="date" name="closesAt" required defaultValue={ymd(w.closesAt)} className="rounded-xl border border-slate-300 px-3 py-2" /></label>
              <button className={BTN_SECONDARY}>{t("Save dates")}</button>
            </form>
          </details>
        </div>
      )}
    </li>
  );
}
