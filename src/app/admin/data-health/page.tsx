import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Section } from "@/components/page-header";
import { AtAGlance, Callout, ReportHeader } from "@/components/report-kit";
import { getT } from "@/i18n/server";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { dataHealth } from "@/server/insights/level-story";

export const metadata = { title: "Data Health" };

/** 🩺 Can the levels be trusted? What data each class is missing, and whose data disagree. */
export default async function DataHealth({ searchParams }: { searchParams: Promise<{ show?: string; classId?: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "reports:read" });
  const me = (await getActor())!.user;
  const sp = await searchParams;
  const v = await dataHealth(repo, actor);
  const total = v.rows.reduce((t, r) => t + r.students, 0);
  const sum = (k: "noMap" | "noDiagnostic" | "inactive" | "noData") => v.rows.reduce((t, r) => t + r[k].length, 0);
  // never round a gap away (199 of 200 is 99.5%, not 100%): 100% only when nothing is missing (Update 39C)
  const pct = (n: number) => { if (!total) return 0; const v = (100 * (total - n)) / total; return n > 0 && v >= 99.5 ? Math.floor(v * 10) / 10 : Math.round(v); };
  const COLS = [["noMap", "No MAP score", "Import MAP scores", "/teacher/map-rit"], ["noDiagnostic", "No Diagnostic", "Open the Diagnostic", actor.role === "TEACHER" ? "/teacher/diagnostic" : "/admin/diagnostic"], ["inactive", "No practice in 14 days", "Remind them", "/teacher/alerts"], ["noData", "No data at all", "These start at On Level", "/teacher/levels"]] as const;
  const list = sp.show && sp.classId ? v.rows.find((r) => r.classId === sp.classId)?.[sp.show as "noMap"] : null;
  const { t } = await getT();
  const cell = (n: number, of: number) => (n === 0 ? "text-emerald-700" : n / Math.max(1, of) > 0.3 ? "font-bold text-rose-700" : "font-semibold text-amber-700");
  return (
    <AppShell name={String(me.displayName)}>
      <ReportHeader back={{ href: actor.role === "TEACHER" ? "/teacher" : "/admin", label: "Home" }} icon="🩺" title="Data Health" subtitle="Every level on the platform comes from the students’ data. The more complete it is, the more the levels, groups and reports can be trusted. Fill the gaps first."
        who={actor.role === "TEACHER" ? t("My classes") : t("Whole school")} />
      <AtAGlance items={[
        { icon: "👩‍🎓", label: "Students", value: String(total), meaning: "in your classes" },
        { icon: "🗺️", label: "Have MAP", value: `${pct(sum("noMap"))}%`, meaning: t("{n} missing", { n: sum("noMap") }), tone: sum("noMap") ? "warn" : "good" },
        { icon: "🩺", label: "Took the Diagnostic", value: v.diagnosticOpen ? `${pct(sum("noDiagnostic"))}%` : "—", meaning: v.diagnosticOpen ? t("{n} missing", { n: sum("noDiagnostic") }) : "not opened yet", tone: v.diagnosticOpen && sum("noDiagnostic") ? "warn" : "neutral" },
        { icon: "🙋", label: "Active (14 days)", value: `${pct(sum("inactive"))}%`, meaning: t("{n} inactive", { n: sum("inactive") }), tone: sum("inactive") ? "warn" : "good" },
        { icon: "⚖️", label: "Data disagree", value: String(v.conflicts.length), meaning: "students to look at", tone: v.conflicts.length ? "warn" : "good" },
      ]} />
      <Callout kind="next" className="mb-6" items={[
        sum("noMap") ? <>{t("Import the missing MAP scores")} ({sum("noMap")}) · <Link href="/teacher/map-rit" className="font-semibold text-brand-teal underline">MAP data</Link></> : null,
        sum("inactive") ? t("Remind the {n} inactive students to practise.", { n: sum("inactive") }) : null,
        v.conflicts.length ? t("Look at the students whose data disagree (bottom of the page) before the next data meeting.") : null,
      ]}>{!sum("noMap") && !sum("inactive") && !v.conflicts.length ? t("The data is complete: the levels can be trusted.") : null}</Callout>
      <Section title="By Class" icon="🏫" className="mb-6" hint="Click a number to see the students.">
        <div className="rk-box rk-tall">
          <table className="w-full min-w-[760px] text-sm">
            <thead><tr><th className="py-2">Class</th><th>Students</th>{COLS.map(([, h]) => <th key={h}>{h}</th>)}<th>Disagree</th></tr></thead>
            <tbody>
              {v.rows.map((r) => (
                <tr key={r.classId} className="border-b border-slate-100">
                  <td className="py-2.5 font-semibold text-brand-navy">{r.className} <span className="text-xs font-normal text-slate-500">G{r.grade}</span></td>
                  <td className="tabular-nums">{r.students}</td>
                  {COLS.map(([k]) => <td key={k}><Link href={`/admin/data-health?classId=${r.classId}&show=${k}`} className={`tabular-nums hover:underline ${cell(r[k].length, r.students)}`}>{r[k].length}</Link></td>)}
                  <td className={`tabular-nums ${r.conflicts ? "font-bold text-amber-700" : "text-emerald-700"}`}>{r.conflicts}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {list && (
          <div className="mt-4 rounded-2xl bg-slate-50 p-4">
            <p className="font-semibold text-brand-navy">{COLS.find((c) => c[0] === sp.show)?.[1]} · {v.rows.find((r) => r.classId === sp.classId)?.className} ({list.length}) <Link href={COLS.find((c) => c[0] === sp.show)?.[3] ?? "#"} className="ms-2 text-sm font-normal text-brand-teal hover:underline">{COLS.find((c) => c[0] === sp.show)?.[2]} →</Link></p>
            <ul className="mt-2 flex flex-wrap gap-1.5 text-sm">{list.map((id) => <li key={id}><Link href={`/teacher/level-story/${id}`} className="rounded-full bg-white px-2.5 py-0.5 ring-1 ring-slate-200 hover:ring-brand-teal">{v.names[id]}</Link></li>)}</ul>
          </div>
        )}
      </Section>
      <Section title={`Data Disagree (${v.conflicts.length})`} icon="⚖️" hint="One source says Above, another says Below. Often guessing, a bad test day, or real growth — worth a look.">
        {!v.conflicts.length ? <p className="text-emerald-800">✅ No strong disagreement.</p> : (
          <ul className="divide-y divide-slate-100">
            {v.conflicts.map((c) => <li key={c.studentId} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm"><span><Link href={`/teacher/level-story/${c.studentId}`} className="font-semibold text-brand-navy hover:underline">{c.name}</Link> <span className="text-xs text-slate-500">{c.className}</span><span className="block text-slate-600">{c.note}</span></span><span className="text-xs"><span className="rounded-full bg-emerald-100 px-2 py-0.5 font-bold text-emerald-900">{c.high.source}: Above</span> <span className="rounded-full bg-rose-100 px-2 py-0.5 font-bold text-rose-900">{c.low.source}: Below</span></span></li>)}
          </ul>
        )}
      </Section>
    </AppShell>
  );
}
