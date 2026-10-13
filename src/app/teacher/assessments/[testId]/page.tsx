import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { AtAGlance, Callout, ReportHeader, ReportSection, ReportTable, SimpleBar, toneOfPct } from "@/components/report-kit";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { RETEACH_PCT, testResults, type TestResults } from "@/server/tests/assessments";
import { personalizeNafsAction, reteachAction } from "../actions";
import { EmptyState, SourceTag } from "@/components/ui-kit";
import { getT } from "@/i18n/server";

export const metadata = { title: "Test results" };
const day = (v: string | null) => (v ? new Date(v).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "—");
const tone = (p: number | null) => (p === null ? "text-slate-500" : p >= 80 ? "text-emerald-700" : p >= RETEACH_PCT ? "text-amber-700" : "text-rose-700");

/** 📊 One test's results, split BY SKILL (who finished, who didn't, scores), with Reteach. Own classes only. */
export default async function TestResultsPage({ params, searchParams }: { params: Promise<{ testId: string }>; searchParams: Promise<{ msg?: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "reports:read" });
  const me = (await getActor())!.user;
  const { t: tr } = await getT();
  const sp = await searchParams;
  let r: TestResults;
  try { r = await testResults(repo, actor, (await params).testId); } catch (e) { if (e instanceof ForbiddenError) notFound(); throw e; }
  const t = r.test;
  const waiting = r.students.filter((x) => !x.finished);
  const toReteach = r.skills.reduce((a, k) => a + k.below.length, 0);
  return (
    <AppShell name={String(me.displayName)}>
      <ReportHeader back={{ href: "/teacher/assessments", label: "Assessments" }} icon="📊" title={t.title} who={t.className}
        subtitle={<><SourceTag source={t.type === "CUSTOM" ? "OTHER" : t.type} /> · {t.className} · {tr(t.levelMode === "LEVEL" ? "at each student's level" : "same for all")}{t.dueAt ? ` · ${tr("Due {date}", { date: day(t.dueAt) })}` : ""}{t.timeLimitMin ? ` · ${tr("{n} min", { n: t.timeLimitMin })}` : ""}{t.shuffle ? ` · ${tr("shuffled")}` : ""}{r.marks && r.students[0] ? ` · ${tr("{n} marks", { n: Math.max(...r.students.map((x) => x.maxPoints)) })}` : ""}</>}>
        <form action={reteachAction}>
          <input type="hidden" name="testId" value={t.id} />
          <button disabled={!toReteach} className="min-h-11 rounded-xl bg-brand-navy px-5 font-semibold text-white disabled:opacity-50" title={tr("Adds every skill under {pct}% to that student's My Work", { pct: RETEACH_PCT })}>🔁 {tr("Reteach")}</button>
        </form>
        {t.type === "NAFS" && (
          <form action={personalizeNafsAction}>
            <input type="hidden" name="testId" value={t.id} />
            <button disabled={!r.finished || Boolean(t.nafsPlanAt)} className="min-h-11 rounded-xl bg-teal-700 px-5 font-semibold text-white disabled:opacity-50" title={tr("Each student gets a personal NAFS plan with the skills they scored under {pct}% on", { pct: RETEACH_PCT })}>🇸🇦 {t.nafsPlanAt ? tr("NAFS plan personalized") : tr("Personalize NAFS plan")}</button>
          </form>
        )}
      </ReportHeader>
      {sp.msg && <p role="status" className="mb-4 rounded-xl bg-sky-50 px-4 py-3 text-sky-900 ring-1 ring-sky-200">{sp.msg}</p>}
      {t.type === "NAFS" && !t.nafsPlanAt && <p className="mb-4 rounded-xl bg-teal-50 px-4 py-3 text-sm text-teal-900 ring-1 ring-teal-200">{tr("When every student has submitted, or after the due date, the NAFS plan is personalized automatically. You can also press “Personalize NAFS plan” now.")}</p>}
      <AtAGlance items={[
        { icon: "✅", label: "Finished", value: r.finished, meaning: tr("of {n} students", { n: r.finished + r.notFinished }), tone: r.notFinished ? "neutral" : "good" },
        { icon: "⏳", label: "Not finished", value: r.notFinished, meaning: r.notFinished ? "names are at the bottom of the page" : "everyone finished", tone: r.notFinished ? "warn" : "good" },
        { icon: "🎯", label: "Class average", value: r.avgPct === null ? "—" : `${r.avgPct}%`, meaning: "average score of those who finished", tone: toneOfPct(r.avgPct, [80, RETEACH_PCT]) },
        { icon: "🔁", label: "To reteach", value: toReteach, meaning: tr("student-skill results under {pct}%", { pct: RETEACH_PCT }), tone: toReteach ? "bad" : "good" },
      ]} />
      {r.finished > 0 && (
        <div className="mb-5 grid gap-4 lg:grid-cols-2">
          <Callout kind="help" items={r.skills.filter((k) => k.below.length).slice(0, 4).map((k) => <><b>{k.name}</b>: {k.below.map((x) => x.name).join(", ")}</>)}>{!toReteach ? tr("Everyone who finished scored {pct}% or more.", { pct: RETEACH_PCT }) : null}</Callout>
          <Callout kind="next" items={[
            toReteach ? tr("Press Reteach: it adds every skill under {pct}% to that student's My Work.", { pct: RETEACH_PCT }) : null,
            waiting.length ? tr("Remind the {n} students who have not finished.", { n: waiting.length }) : null,
            !toReteach && !waiting.length ? tr("Everyone finished — great job!") : null,
          ]} />
        </div>
      )}

      <ReportSection title={tr("By skill")} icon="🧩">
        {!r.finished ? <EmptyState compact icon="⏳" title="No results yet" text="They appear here as students finish the test." className="mt-3" /> : (
          <>
            <SimpleBar items={r.skills.map((k) => ({ label: k.name, value: k.avgPct, note: tr("Grade {n}", { n: k.grade }), band: k.avgPct === null ? null : k.avgPct >= 80 ? "GOOD" : k.avgPct >= RETEACH_PCT ? "OK" : "LOW" }))} className="mb-4" />
            <ul className="divide-y divide-slate-100">
              {r.skills.map((k) => (
                <li key={k.skillId} className="py-3">
                  <p className="flex flex-wrap items-center gap-2 font-semibold text-brand-navy">{k.name} <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700">{tr("Grade {n}", { n: k.grade })}</span> <span className={`ms-auto ${tone(k.avgPct)}`}>{k.avgPct === null ? "—" : `${k.avgPct}%`}</span></p>
                  {k.below.length > 0
                    ? <p className="mt-1 text-sm text-slate-700">{tr("Under {pct}%:", { pct: RETEACH_PCT })} {k.below.map((x, i) => <span key={x.id}>{i ? ", " : ""}<Link href={`/teacher/students/${x.id}`} className="underline">{x.name}</Link> ({x.pct}%)</span>)}</p>
                    : <p className="mt-1 text-sm text-emerald-700">✓ {tr("Everyone who finished scored {pct}% or more.", { pct: RETEACH_PCT })}</p>}
                </li>
              ))}
            </ul>
          </>
        )}
      </ReportSection>

      <section className="rk-section mt-6 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200 sm:p-6">
        <h2 className="text-lg font-semibold text-brand-navy sm:text-xl">👩‍🎓 {tr("Students")}</h2>
        {!r.finished && <EmptyState compact icon="⏳" title="No results yet" className="mt-3" />}
        {r.finished > 0 && <div className="mt-3"><ReportTable label={tr("Students")}
          cols={[{ key: "n", label: tr("Student") }, { key: "s", label: tr("Score"), num: true }, ...r.skills.map((k) => ({ key: `k${k.skillId}`, label: k.name, num: true })), { key: "f", label: tr("Finished") }]}
          rows={r.students.filter((x) => x.finished).map((x) => ({
            id: x.id, flag: x.pct !== null && x.pct < RETEACH_PCT ? "bad" as const : undefined,
            sort: { n: x.name, s: x.pct, f: x.completedAt, ...Object.fromEntries(r.skills.map((k) => [`k${k.skillId}`, x.bySkill[k.skillId]?.pct ?? null])) },
            cells: { n: <Link href={`/teacher/assessments/${t.id}/review/${x.assignmentId}/${x.id}`} className="font-semibold text-brand-navy underline">{x.name}</Link>,
              s: <span className={tone(x.pct)}>{x.pct}% <span className="text-xs text-slate-500">({x.correct}/{x.total})</span>{r.marks && <span className="block text-xs font-semibold text-slate-700">{tr("{n} / {m} marks", { n: x.points, m: x.maxPoints })}</span>}</span>,
              ...Object.fromEntries(r.skills.map((k) => [`k${k.skillId}`, <span key={k.skillId} className={tone(x.bySkill[k.skillId]?.pct ?? null)}>{x.bySkill[k.skillId] ? `${x.bySkill[k.skillId].pct}%` : "—"}</span>])),
              f: <span className="text-sm text-slate-600">{day(x.completedAt)}</span> },
          }))} /></div>}
        <h3 className="mt-6 font-semibold text-brand-navy">{tr("Not finished yet ({n})", { n: waiting.length })}</h3>
        {!waiting.length ? <p className="mt-2 text-emerald-700">{tr("Everyone finished — great job!")}</p> : (
          <p className="mt-2 text-slate-700">{waiting.map((x, i) => <span key={x.id}>{i ? ", " : ""}{x.name}{x.status === "IN_PROGRESS" ? ` (${tr("started")})` : x.status === "OVERDUE" ? ` (${tr("overdue")})` : ""}</span>)}</p>
        )}
      </section>
    </AppShell>
  );
}
