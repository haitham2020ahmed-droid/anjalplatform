import { AppShell } from "@/components/app-shell";
import { AtAGlance, ReportHeader, ReportIntro, type Glance } from "@/components/report-kit";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { getT } from "@/i18n/server";
import { teacherHomeSummary } from "@/server/teacher/needs-attention";
import { classPerformance, STRONG_PCT, MIN_ANSWERS_STRONG } from "@/server/plans/perf-suggest";
import { earlyWarning } from "@/server/insights/early-warning";

export const metadata = { title: "Class snapshot" };

const pct = (correct: number, answers: number) => Math.round((100 * correct) / Math.max(1, answers));

/**
 * 🆕 r90 (multi-expert audit follow-up, Oct 2026): "Class snapshot" — one class, 4 big numbers (Urgent · Needs
 * support · On level · Excelling), each linking to its full report pre-filtered to this class. Every count reuses
 * the EXACT logic of the report it links to (early warning / Needs attention / excelling-skill), read once from
 * classPerformance's bounded roster so "On level" (the roster minus the other three, by student id — never a
 * naive subtraction of counts, since a student could in principle appear in more than one set) can never go
 * negative or double-count. Teacher: their own class. Admin: any school class (same access rule as every other
 * class-scoped report — classPerformance/earlyWarning/teacherHomeSummary already allow both roles).
 */
export default async function ClassSnapshotPage({ params }: { params: Promise<{ classId: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "reports:read" });
  const { classId } = await params;
  const me = (await getActor())!.user;
  const { t } = await getT();

  // one bounded read: the class roster + stats (access-checked for teacher-own-class or admin via classPerformance)
  const d = await classPerformance(repo, actor, classId);
  const roster = new Set(d.members);

  const excelling = new Set<string>();
  for (const st of d.members) {
    for (const [k, x] of d.stats.get(st) ?? []) {
      if (d.skillName.has(k) && pct(x.correct, x.answers) >= STRONG_PCT && x.answers >= MIN_ANSWERS_STRONG) { excelling.add(st); break; }
    }
  }

  const [attention, ew] = await Promise.all([
    teacherHomeSummary(repo, actor).catch(() => ({ list: [] as { studentId: string; classId: string }[] })),
    earlyWarning(repo, actor, { classId }).catch(() => ({ rows: [] as { studentId: string; severity: string }[], counts: { URGENT: 0, WATCH: 0, GOOD: 0 } })),
  ]);
  const needsSupport = new Set(attention.list.filter((x) => x.classId === classId && roster.has(x.studentId)).map((x) => x.studentId));
  const urgent = new Set(ew.rows.filter((r) => r.severity === "URGENT" && roster.has(r.studentId)).map((r) => r.studentId));

  const onLevel = [...roster].filter((id) => !urgent.has(id) && !needsSupport.has(id) && !excelling.has(id)).length;

  const glance: Glance[] = [
    { label: "Urgent", value: urgent.size, icon: "🔴", tone: urgent.size ? "bad" : "good", meaning: t("Early warning: act now"), href: `/teacher/reports/early-warning?classId=${classId}&severity=URGENT` },
    { label: "Needs support", value: needsSupport.size, icon: "🟠", tone: needsSupport.size ? "warn" : "good", meaning: t("No practice in a week, or stuck on a skill"), href: `/teacher#needs-attention` },
    { label: "On level", value: onLevel, icon: "🔵", tone: "neutral", meaning: t("Not urgent, not needing support, not excelling yet") },
    { label: "Excelling", value: excelling.size, icon: "🟢", tone: "good", meaning: t("Ready for Enrichment"), href: `/teacher/plans?${new URLSearchParams([["kind", "ENRICHMENT"], ["classId", classId]])}` },
  ];

  return (
    <AppShell name={String(me.displayName)}>
      <ReportHeader back={{ href: "/teacher/reports", label: "Reports" }} title="Class snapshot" print={false}
        subtitle={t("{klass}: where every student stands right now, in one screen.", { klass: String(d.klass.name) })} />
      <ReportIntro text="Each number reuses its full report's own rule — tap it to see who, and why." />
      <AtAGlance items={glance} title={null} />
      <p className="mt-2 text-sm text-slate-500">
        {t("{n} students in {klass}.", { n: roster.size, klass: String(d.klass.name) })}
      </p>
    </AppShell>
  );
}
