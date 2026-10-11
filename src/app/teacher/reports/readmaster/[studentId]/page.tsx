import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { ReadingLevelLabel, ReadingScalesHelp } from "@/components/reading-level";
import { fmtNum, fmtPct, fmtSigned, pctTone } from "@/components/reports/report-ui";
import { AtAGlance, Callout, ReportHeader, ReportSection, ReportTable, SimpleBar, toneOfPct } from "@/components/report-kit";
import { getT } from "@/i18n/server";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { studentReadMasterReport } from "@/server/reports/readmaster-report";

export const metadata = { title: "ReadMaster · student" };

/** ⭐ One student's ReadMaster: every article (version, Lexile before → after, score, time) and accuracy by question type. */
export default async function StudentReadMasterPage({ params }: { params: Promise<{ studentId: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "reports:read" });
  const me = (await getActor())!.user;
  const { studentId } = await params;
  const { t } = await getT();
  let r;
  try { r = await studentReadMasterReport(repo, actor, studentId); } catch (e) {
    if (e instanceof ForbiddenError) return <AppShell name={String(me.displayName)}><p className="rounded-2xl bg-white p-6 text-slate-700 ring-1 ring-slate-200">Student not found.</p></AppShell>;
    throw e;
  }
  const max = Math.max(1, ...r.articles.map((a) => a.lexileAfter)), min = Math.min(max - 1, ...r.articles.map((a) => a.lexileBefore));
  return (
    <AppShell name={String(me.displayName)}>
      <ReportHeader back={{ href: "/teacher/reports/readmaster", label: "ReadMaster results" }} icon="⭐" title="ReadMaster"
        subtitle="Every article this student read: the version, the reading Lexile before → after, the score and the time."
        who={<><bdi className="font-semibold">{r.name}</bdi> · {t("Grade {n}", { n: r.grade })} · <ReadingLevelLabel scale="READMASTER" value={r.row.lexileNow} /></>} when={t("Last 12 months")} />
      <ReadingScalesHelp className="mb-4" />
      <AtAGlance items={[
        { icon: "📰", label: "Articles", value: r.row.articles, meaning: t("{n} timed article(s) · {m} minutes", { n: r.row.timedArticles, m: fmtNum(r.row.minutes) }) },
        { icon: "📈", label: "Lexile start → now", value: <span className="text-2xl">{r.row.lexileStart ?? "—"} → {r.row.lexileNow ?? "—"}</span>, meaning: t("change {n}", { n: fmtSigned(r.row.change) }), tone: (r.row.change ?? 0) > 0 ? "good" : (r.row.change ?? 0) < 0 ? "bad" : "neutral" },
        { icon: "🎯", label: "Accuracy", value: fmtPct(r.row.accuracy), meaning: "of the questions after reading were right", tone: toneOfPct(r.row.accuracy) },
        { icon: "⚡", label: "Rapid answers", value: fmtNum(r.row.rapid), meaning: "answers too fast to have been read", tone: (r.row.rapid ?? 0) > 0 ? "warn" : "neutral" },
      ]} />
      <div className="space-y-5">
        <Callout kind="next" items={[
          (r.row.rapid ?? 0) > 0 ? t("Ask the student to read the whole article before answering: some answers were too fast.") : null,
          (() => { const w = [...r.types].filter((x) => x.accuracy !== null).sort((a, b) => (a.accuracy ?? 0) - (b.accuracy ?? 0))[0]; return w && (w.accuracy ?? 100) < 70 ? <>{t("Practise this question type together")}: <b>{w.name}</b> ({fmtPct(w.accuracy)})</> : null; })(),
          !r.articles.length ? t("No article read yet.") : t("Keep one ReadMaster article a week going."),
        ]} />
        <ReportSection title="ReadMaster reading Lexile, article by article" icon="📈" hint="Each bar is one article: ▲ green = the reading Lexile went up, ▼ red = down, teal = the same.">
          {r.articles.length ? (
            <div className="flex h-28 items-end gap-1" role="img" aria-label={`Reading Lexile after each article: ${r.articles.map((a) => a.lexileAfter).join(", ")}`}>
              {r.articles.map((a, i) => <span key={i} title={`${a.date}: ${a.lexileBefore}L → ${a.lexileAfter}L`} className={`flex-1 rounded-t ${a.lexileAfter > a.lexileBefore ? "bg-emerald-500" : a.lexileAfter < a.lexileBefore ? "bg-red-400" : "bg-brand-teal"}`} style={{ height: `${15 + (85 * (a.lexileAfter - min)) / Math.max(1, max - min)}%` }} />)}
            </div>
          ) : <p className="text-slate-600">No article read yet.</p>}
        </ReportSection>
        <ReportSection title="Articles" icon="📰">
          <ReportTable label="Articles" empty="No article read yet."
            cols={[{ key: "d", label: "Date" }, { key: "t", label: "Article" }, { key: "v", label: "Version" }, { key: "l", label: "Lexile", num: true }, { key: "s", label: "Score", num: true }, { key: "m", label: "Minutes", num: true }, { key: "r", label: "Rapid", num: true }]}
            rows={r.articles.map((a, i) => ({
              id: String(i), sort: { l: a.lexileAfter, s: a.total ? a.correct / a.total : null, m: a.minutes, r: a.rapid },
              cells: { d: a.date, t: <span className="font-medium">{a.title}</span>, v: a.version.toLowerCase(), l: `${a.lexileBefore}L → ${a.lexileAfter}L`,
                s: <span className={`font-semibold ${pctTone(a.total ? Math.round((100 * a.correct) / a.total) : null)}`}>{a.correct}/{a.total}</span>, m: fmtNum(a.minutes), r: fmtNum(a.rapid) },
            }))} />
        </ReportSection>
        <ReportSection title="Accuracy by question type" icon="🧩">
          {r.types.length ? <SimpleBar items={r.types.map((x) => ({ label: x.name, value: x.accuracy, note: <>{t("{n} answers", { n: x.answers })}{x.rapid ? ` (${x.rapid} rapid)` : ""}</> }))} /> : <p className="text-slate-600">No answers yet.</p>}
        </ReportSection>
        <p className="print:hidden"><Link href={`/teacher/students/${studentId}`} className="inline-flex min-h-10 items-center font-semibold text-brand-teal hover:underline">Open the student page →</Link></p>
      </div>
    </AppShell>
  );
}
