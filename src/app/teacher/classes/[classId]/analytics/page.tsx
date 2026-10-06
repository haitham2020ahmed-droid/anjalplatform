import { z } from "zod";
import { AppShell } from "@/components/app-shell";
import { ClassAnalyticsView } from "@/components/analytics/class-analytics";
import { resolvePeriod, type PeriodName } from "@/analytics/periods";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { loadCalendar } from "@/server/analytics/calendar";
import { classComparison, standardsReport } from "@/server/analytics/reports";
import { ReportDownloads } from "@/components/reports/report-downloads";

const Q = z.object({
  period: z.enum(["LAST_7_DAYS", "LAST_30_DAYS", "TERM", "SEMESTER", "SCHOOL_YEAR", "CUSTOM"]).default("TERM"),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export default async function ClassAnalyticsPage({ params, searchParams }: { params: Promise<{ classId: string }>; searchParams: Promise<Record<string, string>> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "analytics:class" });
  const { classId } = await params;
  const q = Q.parse(await searchParams);
  const me = (await getActor())!.user;
  const klass = (await repo.findUnique("Class", { id: classId }))!;
  const cal = await loadCalendar(repo, String(klass?.schoolId ?? actor.schoolId));
  const period = resolvePeriod(q.period as PeriodName, cal, new Date(), q.from && q.to ? { from: new Date(q.from), to: new Date(q.to) } : undefined);
  const c = await classComparison(repo, actor, classId, period); // access checked inside
  const s = await standardsReport(repo, actor, { classId }, period);
  return (
    <AppShell name={String(me.displayName)}>
      <ClassAnalyticsView className={String(klass.name)} classHref={`/teacher/classes/${classId}`} period={period.label} periodKey={q.period} c={c} standards={s.rows} notAssessed={s.notAssessed} />
      <ReportDownloads title={`Class report: ${period.label}`} report={{ kind: "class", classId, period: q.period as PeriodName, from: q.from, to: q.to }} />
      <ReportDownloads title={`Standards report: ${period.label}`} report={{ kind: "standards", scope: "class", classId, period: q.period as PeriodName, from: q.from, to: q.to }} />
    </AppShell>
  );
}
