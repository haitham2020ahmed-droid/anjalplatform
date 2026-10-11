import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { fmtNum, fmtPct, pctTone, WindowChips, windowText } from "@/components/reports/report-ui";
import { AtAGlance, Callout, ReportHeader, ReportSection, ReportTable, SimpleBar, toneOfPct } from "@/components/report-kit";
import { getT } from "@/i18n/server";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { studentGrammarReport } from "@/server/reports/grammar-report";
import { windowOf } from "@/server/reports/report-access";

export const metadata = { title: "Grammar results · student" };

/** 🔤 One student's grammar results: each grammar skill, the errors, the latest answers. */
export default async function StudentGrammarPage({ params, searchParams }: { params: Promise<{ studentId: string }>; searchParams: Promise<{ days?: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "reports:read" });
  const me = (await getActor())!.user;
  const { studentId } = await params;
  const days = windowOf((await searchParams).days);
  const { t } = await getT();
  let r;
  try { r = await studentGrammarReport(repo, actor, studentId, { days }); } catch (e) {
    if (e instanceof ForbiddenError) return <AppShell name={String(me.displayName)}><p className="rounded-2xl bg-white p-6 text-slate-700 ring-1 ring-slate-200">Student not found.</p></AppShell>;
    throw e;
  }
  return (
    <AppShell name={String(me.displayName)}>
      <ReportHeader back={{ href: "/teacher/reports/grammar", label: "Grammar results" }} icon="🔤" title="Grammar results"
        subtitle="Each grammar skill of this student, the errors they make and their latest answers."
        who={<><bdi className="font-semibold">{r.name}</bdi> · {t("Grade {n}", { n: r.grade })}</>} when={windowText(t, days)}
        filters={<WindowChips days={days} href={(d) => `/teacher/reports/grammar/${studentId}?days=${d}`} />} />
      <AtAGlance items={[
        { icon: "✍️", label: "Answers", value: r.summary.answers, meaning: t("{n} rapid guesses left out of accuracy", { n: r.summary.rapid }), tone: r.summary.rapid ? "warn" : "neutral" },
        { icon: "🎯", label: "Accuracy", value: fmtPct(r.summary.accuracy), meaning: "of careful answers were right", tone: toneOfPct(r.summary.accuracy) },
        { icon: "📈", label: "Avg mastery", value: fmtNum(r.summary.avgMastery), meaning: "0–100: how well the skills are learned" },
        { icon: "🔁", label: "Skills to reteach", value: r.summary.reteach, meaning: r.summary.reteach ? "skills this student needs help with" : "nothing to reteach right now", tone: r.summary.reteach ? "bad" : "good" },
      ]} />
      <div className="space-y-5">
        <div className="grid gap-4 lg:grid-cols-2">
          <Callout kind="meaning" items={[
            r.summary.rapid ? t("{n} answers were too fast to be read (rapid guesses). Ask the student to slow down and read each sentence twice.", { n: r.summary.rapid }) : t("No rapid guesses: the answers were careful."),
            r.skills.filter((k) => k.reteach).length ? <>{t("Needs help with")}: {r.skills.filter((k) => k.reteach).map((k) => k.name).join(", ")}</> : null,
          ]} />
          <Callout kind="next" items={[
            r.skills.find((k) => k.reteach) ? <>{t("Reteach")} <b>{r.skills.find((k) => k.reteach)!.name}</b>{r.errors[0]?.fix ? <> — {r.errors[0].fix}</> : null}</> : t("Keep practising: no skill needs reteaching now."),
          ]} />
        </div>
        <ReportSection title="Skills" icon="🧩" hint="Weakest first. Reteach = 5+ careful answers and accuracy under 60% (or under 70% while mastery is still under 40).">
          {r.skills.length ? (
            <>
              <SimpleBar items={r.skills.map((k) => ({ label: k.name, value: k.accuracy, note: t("{n} answers", { n: k.answers }) }))} className="mb-5" />
              <ReportTable label="Skills"
                cols={[{ key: "s", label: "Skill" }, { key: "a", label: "Answers", num: true }, { key: "acc", label: "Accuracy", num: true }, { key: "r", label: "Rapid", num: true }, { key: "m", label: "Mastery", num: true }, { key: "re", label: "Reteach" }]}
                rows={r.skills.map((k) => ({
                  id: k.skillId, flag: k.reteach ? "bad" : undefined, sort: { acc: k.accuracy, r: k.rapid, m: k.mastery, re: k.reteach ? 1 : 0 },
                  cells: { s: k.name, a: k.answers, acc: <span className={`font-semibold ${pctTone(k.accuracy)}`}>{fmtPct(k.accuracy)}</span>, r: k.rapid || "—",
                    m: <>{fmtNum(k.mastery)}{k.band ? <span className="ms-1 text-xs text-slate-500">{k.band.toLowerCase()}</span> : null}</>,
                    re: k.reteach ? <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-800">! Reteach</span> : "—" },
                }))} />
            </>
          ) : <p className="text-slate-600">No grammar practice yet.</p>}
        </ReportSection>
        <ReportSection title="Error types" icon="🔎">
          {r.errors.length ? <ul className="space-y-2">{r.errors.map((e) => <li key={e.code} className="rounded-xl bg-white p-3 ring-1 ring-slate-200"><p className="font-semibold">{e.label} <span className="text-sm font-normal text-slate-500">· {e.count}</span></p>{e.fix && <p className="text-sm text-slate-600">{e.fix}</p>}</li>)}</ul> : <p className="text-slate-600">No error types recorded.</p>}
        </ReportSection>
        <ReportSection title="Latest answers" icon="🕘">
          {r.recent.length ? (
            <ul className="divide-y divide-slate-100">{r.recent.map((a, i) => (
              <li key={i} className="py-2 text-sm"><span className={a.correct ? "text-emerald-700" : "text-red-700"}>{a.correct ? "✓" : "✗"}</span> <span className="text-slate-500">{a.at} · {a.skill}</span>{a.rapid && <span className="ms-1 rounded bg-amber-100 px-1 text-xs text-amber-900">rapid</span>}<p className="text-slate-800">{a.stem}</p>{a.error && <p className="text-xs text-slate-500">{a.error}</p>}</li>
            ))}</ul>
          ) : <p className="text-slate-600">No answers in this window.</p>}
        </ReportSection>
        <p className="print:hidden"><Link href={`/teacher/students/${studentId}`} className="inline-flex min-h-10 items-center font-semibold text-brand-teal hover:underline">Open the student page →</Link></p>
      </div>
    </AppShell>
  );
}
