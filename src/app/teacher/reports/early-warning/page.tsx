import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { AtAGlance, ReportHeader, ReportIntro, ReportSection, ReportSummary, SimpleBar, Sparkline, EmptyState, type Glance } from "@/components/report-kit";
import { earlyWarningSummary } from "@/lib/report-summaries";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { getT } from "@/i18n/server";
import { reportHref } from "@/reports/links";
import { earlyWarning, type EwRow } from "@/server/insights/early-warning";
import { PATTERN_ARROW, PATTERN_NAME, SEVERITY_ICON, SEVERITY_NAME, type Severity } from "@/server/insights/early-warning-rules";
import { handleEarlyWarningAction } from "./actions";
import { Combo } from "@/components/ui/combo";
import { InsightActions } from "@/components/teacher/insight-actions";

export const metadata = { title: "Early warning" };

type SP = { classId?: string; gradeId?: string; teacherId?: string; severity?: string; msg?: string };
const QUICK = ["Talked with the student", "Called / messaged the parent", "Reteaching in a small group", "Sent easier practice", "Made a support plan"];
const SEV_RING: Record<Severity, string> = { URGENT: "ring-rose-300", WATCH: "ring-amber-300", GOOD: "ring-emerald-300" };
const SEV_PILL: Record<Severity, string> = { URGENT: "bg-rose-50 text-rose-800 ring-rose-200", WATCH: "bg-amber-50 text-amber-900 ring-amber-200", GOOD: "bg-emerald-50 text-emerald-800 ring-emerald-200" };
const btn = "inline-flex min-h-9 items-center rounded-lg bg-white px-3 text-sm font-semibold text-brand-navy ring-1 ring-slate-300 hover:ring-brand-teal";

/**
 * 🚨 Early warning (Reports): the most important level movements of each student — drops, rises, up-down swings —
 * and the serious problems that need action now, Urgent first, each with why in plain words, a sparkline per
 * measure, the last teacher action and the actions (profile, plan, practice, 📘 send a Learn lesson for the student's
 * weakest skill, note, mark handled). A teacher sees
 * one of their classes; the admin sees the whole school (filter by grade, class, teacher) and the urgent students
 * not handled for 7+ days. Staff only.
 */
export default async function EarlyWarningPage({ searchParams }: { searchParams: Promise<SP> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "reports:read" });
  const me = (await getActor())!.user;
  const { t } = await getT();
  const sp = await searchParams;
  const severity = sp.severity === "URGENT" || sp.severity === "WATCH" || sp.severity === "GOOD" ? sp.severity : null;
  const v = await earlyWarning(repo, actor, { classId: sp.classId || null, gradeId: sp.gradeId || null, teacherId: sp.teacherId || null, severity });
  const klass = v.classes.find((c) => c.id === v.classId);
  const base = { classId: v.isAdmin ? sp.classId ?? "" : v.classId ?? "", gradeId: sp.gradeId ?? "", teacherId: sp.teacherId ?? "", severity: severity ?? "" };
  const link = (p: Partial<typeof base>) => `/teacher/reports/early-warning?${new URLSearchParams(Object.entries({ ...base, ...p }).filter(([, x]) => x))}`;
  const chip = (on: boolean) => `inline-flex min-h-9 items-center rounded-full px-3 text-sm font-semibold ${on ? "bg-brand-navy text-white" : "bg-white text-brand-navy ring-1 ring-slate-200 hover:ring-brand-teal"}`;
  const school = v.isAdmin && !v.classId;
  const files = (format: "pdf" | "xlsx") => school
    ? reportHref({ kind: "warning", format, locale: "en", scope: "school", gradeId: sp.gradeId || undefined, teacherId: sp.teacherId || undefined })
    : reportHref({ kind: "warning", format, locale: "en", scope: "class", classId: v.classId ?? "" });
  const glance: Glance[] = [
    { label: "Urgent", value: v.counts.URGENT, icon: SEVERITY_ICON.URGENT, tone: v.counts.URGENT ? "bad" : "good", meaning: t("Act now"), href: link({ severity: "URGENT" }) },
    { label: "Watch", value: v.counts.WATCH, icon: SEVERITY_ICON.WATCH, tone: v.counts.WATCH ? "warn" : "neutral", meaning: t("A drop, swinging, or no progress"), href: link({ severity: "WATCH" }) },
    { label: "Good news", value: v.counts.GOOD, icon: SEVERITY_ICON.GOOD, tone: "good", meaning: t("A big rise or back on track"), href: link({ severity: "GOOD" }) },
  ];
  if (v.isAdmin) glance.push({ label: "Urgent not handled 7+ days", value: v.unhandled.length, icon: "⏳", tone: v.unhandled.length ? "bad" : "good", meaning: t("Nobody marked them handled for a week") });

  return (
    <AppShell name={String(me.displayName)}>
      <ReportHeader back={{ href: "/teacher/reports", label: "Reports" }} icon="🚨" title="Early warning"
        who={school ? t("Whole school") : klass ? <bdi>{klass.name}</bdi> : undefined}
        subtitle="Level movements of every student — drops, rises, up-down swings — and the serious problems that need action now."
        downloads={v.classId || school ? [{ href: files("xlsx"), label: "Excel" }, { href: files("pdf"), label: "PDF file" }] : []} />
      {sp.msg && <p role="status" className="mb-4 rounded-xl bg-teal-50 px-4 py-3 text-teal-900 ring-1 ring-teal-200 print:hidden">{sp.msg}</p>}
      <ReportIntro text="Students whose results dropped, rose or swung, with the ones who need action now first." />

      {v.isAdmin ? (
        <form method="get" className="mb-4 flex flex-wrap items-end gap-2 print:hidden">
          <label className="text-sm">{t("Grade")}<select name="gradeId" defaultValue={sp.gradeId ?? ""} className="mt-1 block min-h-10 rounded-lg border border-slate-300 bg-white px-2"><option value="">{t("All")}</option>{v.grades.map((g) => <option key={g.id} value={g.id}>{t("Grade {n}", { n: g.level })}</option>)}</select></label>
          <label className="text-sm">{t("Class")}<Combo name="classId" label={t("Class")} defaultValue={sp.classId ?? ""} options={[{ value: "", label: t("All classes") }, ...v.classes.map((c) => ({ value: c.id, label: c.name }))]} className="mt-1 min-w-52" /></label>
          <label className="text-sm">{t("Teacher")}<Combo name="teacherId" label={t("Teacher")} defaultValue={sp.teacherId ?? ""} options={[{ value: "", label: t("All") }, ...v.teachers.map((x) => ({ value: x.id, label: x.name }))]} className="mt-1 min-w-52" /></label>
          {severity && <input type="hidden" name="severity" value={severity} />}
          <button className="min-h-10 rounded-lg bg-brand-navy px-4 font-semibold text-white">{t("Show")}</button>
        </form>
      ) : null /* a teacher switches the class in the report bar on top */}

      {!v.classes.length ? <EmptyState icon="🏫" title="You do not teach any class yet." /> : (
        <>
          <AtAGlance items={glance} />
          <div className="grid gap-5 lg:grid-cols-2">
            <ReportSection title="Which measures drop most" icon="📉" hint="Students whose latest results fell, per measure.">
              {v.dropping.length ? <SimpleBar items={v.dropping.map((d) => ({ label: t(d.label), value: d.students, display: t("{n} students", { n: d.students }) }))} max={Math.max(1, ...v.dropping.map((d) => d.students))} unit="" bands={false} /> : <p className="text-sm text-slate-600">{t("No measure is dropping.")}</p>}
            </ReportSection>
            <ReportSection title="Moving between groups this month" icon="🔀" hint="Changes of the confirmed level group in the last 30 days.">
              {v.moves.length ? (
                <ul className="divide-y divide-slate-100 text-sm">{v.moves.slice(0, 30).map((m) => (
                  <li key={`${m.studentId}${m.at}`} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                    <span><Link prefetch={false} href={`/teacher/students/${m.studentId}`} className="font-semibold text-brand-navy hover:underline"><bdi>{m.name}</bdi></Link>{school && <span className="text-slate-500"> · {m.className}</span>}</span>
                    <span className={m.up ? "text-emerald-700" : "text-rose-700"}>{m.up ? "↑" : "↓"} {t(m.from)} → {t(m.to)} <span className="text-slate-500" dir="ltr">· {m.at.slice(0, 10)}</span></span>
                  </li>))}</ul>
              ) : <p className="text-sm text-slate-600">{t("No student changed group this month.")}</p>}
            </ReportSection>
          </div>

          {v.isAdmin && (
            <div className="grid gap-5 lg:grid-cols-2">
              <ReportSection title="Urgent, not handled for 7+ days" icon="⏳">
                {v.unhandled.length ? (
                  <ul className="space-y-2 text-sm">{v.unhandled.map((u) => (
                    <li key={u.alertId} className="rounded-xl bg-rose-50 p-3 ring-1 ring-rose-200">
                      <p className="font-semibold text-brand-navy"><Link prefetch={false} href={`/teacher/students/${u.studentId}`} className="hover:underline"><bdi>{u.name}</bdi></Link> <span className="font-normal text-slate-600">· {u.className} · {t("open {n} days", { n: u.days })}</span></p>
                      <p className="text-slate-700" data-content lang="en">{u.detail}</p>
                    </li>))}</ul>
                ) : <p className="text-sm text-slate-600">✅ {t("Every urgent student was handled within a week.")}</p>}
              </ReportSection>
              <ReportSection title="By class" icon="🏫">
                <div className="overflow-x-auto"><table className="w-full min-w-[420px] text-sm">
                  <thead><tr className="text-start text-slate-500"><th className="p-2 text-start">{t("Class")}</th><th className="p-2 text-start">{t("Teacher")}</th><th className="p-2">{SEVERITY_ICON.URGENT} {t("Urgent")}</th><th className="p-2">{SEVERITY_ICON.WATCH} {t("Watch")}</th><th className="p-2">{SEVERITY_ICON.GOOD} {t("Good news")}</th><th className="p-2">⏳ 7+</th></tr></thead>
                  <tbody>{v.byClass.map((c) => (
                    <tr key={c.classId} className="border-t border-slate-100"><td className="p-2"><Link prefetch={false} href={link({ classId: c.classId })} className="font-semibold text-brand-navy hover:underline">{c.className}</Link></td><td className="p-2"><bdi>{c.teachers || "—"}</bdi></td><td className="p-2 text-center tabular-nums">{c.urgent}</td><td className="p-2 text-center tabular-nums">{c.watch}</td><td className="p-2 text-center tabular-nums">{c.good}</td><td className={`p-2 text-center tabular-nums ${c.unhandled7 ? "font-bold text-rose-700" : ""}`}>{c.unhandled7}</td></tr>
                  ))}</tbody>
                </table></div>
              </ReportSection>
            </div>
          )}

          <ReportSection title="Students" icon="👥" hint={v.handledHidden ? t("{n} handled student(s) are hidden until their situation changes.", { n: v.handledHidden }) : "Urgent first. Handled students leave the list until their situation changes."}
            actions={<>{([null, "URGENT", "WATCH", "GOOD"] as const).map((k) => <Link key={k ?? "all"} prefetch={false} href={link({ severity: k ?? "" })} className={chip(severity === k)}>{k ? `${SEVERITY_ICON[k]} ${t(SEVERITY_NAME[k])}` : t("All")}</Link>)}</>}>
            {!v.rows.length ? <p className="rounded-2xl bg-emerald-50 p-4 text-emerald-900 ring-1 ring-emerald-200">✅ {t("No level movement needs your attention right now.")}</p> : (
              <ul className="space-y-3">{v.rows.map((r) => <StudentRow key={r.studentId} r={r} t={t} school={school} keep={base} />)}</ul>
            )}
          </ReportSection>
          <p className="text-xs text-slate-500">{t("Updated {date}. The school is checked every 3 hours.", { date: v.scannedAt.slice(0, 16).replace("T", " ") })}</p>
          <ReportSummary summary={earlyWarningSummary(v)} />
        </>
      )}
      <datalist id="ew-quick">{QUICK.map((q) => <option key={q} value={t(q)} />)}</datalist>
    </AppShell>
  );
}

function StudentRow({ r, t, school, keep }: { r: EwRow; t: (s: string, v?: Record<string, string | number>) => string; school: boolean; keep: Record<string, string> }) {
  const shown = [...r.measures].sort((a, b) => Number(a.pattern === "STABLE") - Number(b.pattern === "STABLE")).slice(0, 6);
  return (
    <li className={`rounded-2xl bg-white p-4 ring-1 ${SEV_RING[r.severity]}`} data-severity={r.severity}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 basis-80">
          <p className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ring-1 ${SEV_PILL[r.severity]}`}>{SEVERITY_ICON[r.severity]} {t(SEVERITY_NAME[r.severity])}</span>
            <Link prefetch={false} href={`/teacher/students/${r.studentId}`} className="font-bold text-brand-navy hover:underline"><bdi>{r.name}</bdi></Link>
            {school && <span className="text-sm text-slate-500">· {r.className}</span>}
            {r.openDays !== null && r.openDays >= 7 && <span className="text-xs font-semibold text-rose-700">{t("open {n} days", { n: r.openDays })}</span>}
          </p>
          <p className="mt-1 text-slate-800" data-content lang="en">{r.reason}</p>
          <p className="mt-1 text-sm text-slate-500">{t("Last teacher action")}: {r.lastAction ? <><span data-content lang="en">{r.lastAction.text}</span> <span dir="ltr">· {r.lastAction.by ? <bdi>{r.lastAction.by}</bdi> : null} · {r.lastAction.date}</span></> : t("none yet")}</p>
        </div>
        <ul className="flex flex-wrap gap-3" aria-label={t("Measures")}>
          {shown.map((m) => (
            <li key={m.key} className="min-w-[8.5rem] text-xs">
              <span className="block font-semibold text-slate-600">{t(m.label)} <span aria-hidden="true">{PATTERN_ARROW[m.pattern]}</span></span>
              <Sparkline values={m.points.map((p) => p.v)} width={110} height={28} min={m.min} max={m.max} label={m.label} />
              <span className={`block ${m.pattern === "STABLE" ? "text-slate-400" : m.pattern.includes("DROP") || m.pattern === "SWINGING" || m.pattern === "FLAT" ? "text-rose-700" : "text-emerald-700"}`}>{t(PATTERN_NAME[m.pattern])} <span dir="ltr" className="text-slate-500">({m.points[m.points.length - 1]?.v})</span></span>
            </li>
          ))}
        </ul>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 print:hidden">
        <Link prefetch={false} href={`/teacher/students/${r.studentId}`} className={btn}>👤 {t("Profile")}</Link>
        <Link prefetch={false} href={`/teacher/plans?${new URLSearchParams({ tab: "new", classId: r.classId })}`} className={btn}>🗂️ {t("Make a plan")}</Link>
        <Link prefetch={false} href={r.practiceSkillId ? `/teacher/skill-assign?${new URLSearchParams({ skillId: r.practiceSkillId, classId: r.classId })}` : `/teacher/assignments?${new URLSearchParams({ classId: r.classId })}`} className={btn}>🎯 {t("Assign practice")}</Link>
        <Link prefetch={false} href={r.practiceSkillId ? `/teacher/learn/assign?${new URLSearchParams({ kind: "LESSON", skillId: r.practiceSkillId, classId: r.classId, studentId: r.studentId })}` : "/teacher/learn"} className={btn}>📘 {t("Send a lesson")}</Link>
        <InsightActions t={t} target={{ classId: r.classId, studentId: r.studentId, skillId: r.practiceSkillId }} only={["group", "parent"]} />
        <Link prefetch={false} href={`/teacher/students/${r.studentId}#notes`} className={btn}>📝 {t("Note")}</Link>
        <form action={handleEarlyWarningAction} className="flex flex-1 flex-wrap items-center gap-2">
          <input type="hidden" name="studentId" value={r.studentId} />
          {Object.entries(keep).filter(([, x]) => x).map(([k, x]) => <input key={k} type="hidden" name={k} value={x} />)}
          <input name="action" list="ew-quick" required minLength={3} maxLength={1000} placeholder={t("What did you do?")} aria-label={t("What did you do?")} className="min-w-[12rem] flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm" />
          <button className="min-h-9 rounded-lg bg-emerald-600 px-3 text-sm font-semibold text-white hover:bg-emerald-700">✓ {t("Mark handled")}</button>
        </form>
      </div>
    </li>
  );
}
