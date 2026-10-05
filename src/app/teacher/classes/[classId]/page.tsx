import { AppShell } from "@/components/app-shell";
import { ClassOverviewView } from "@/components/teacher/class-overview";
import { HeatMap } from "@/components/teacher/heat-map";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { classAssignments } from "@/server/teacher/assignments";
import { scanInterventions } from "@/server/teacher/interventions";
import { classOverview, masteryGrid } from "@/server/teacher/queries";
import { resolveAlertAction } from "../../actions";

/** Class overview. ?unit=<unitId> picks the unit for the heat map (default: the unit with most practice). */
export default async function ClassPage({ params, searchParams }: { params: Promise<{ classId: string }>; searchParams: Promise<{ unit?: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"] });
  const { classId } = await params;
  const { unit } = await searchParams;
  const me = (await getActor())!.user;
  const range = { from: new Date(Date.now() - 365 * 86_400_000), to: new Date() };
  let o = await classOverview(repo, actor, classId, range); // access checked here first
  if (await scanInterventions(repo, o.students.map((s) => s.studentId))) o = await classOverview(repo, actor, classId, range);
  const klass = (await repo.findUnique("Class", { id: classId }))!;
  const cur = (await repo.findMany("Curriculum", { gradeId: klass.gradeId, isActive: true }))[0];
  const units = (await repo.findMany("Unit", { curriculumId: cur.id })).sort((a, b) => Number(a.number) - Number(b.number));
  const unitId = unit && units.some((u) => u.id === unit) ? unit : String(units[0].id);
  const grid = await masteryGrid(repo, actor, classId, unitId);
  const assignments = await classAssignments(repo, actor, classId);
  const picker = (
    <nav aria-label="Choose unit" className="mb-3 flex flex-wrap gap-2">
      {units.map((u) => (
        <a key={String(u.id)} href={`?unit=${String(u.id)}`} aria-current={u.id === unitId ? "page" : undefined}
          className={["rounded-lg px-3 py-1.5 text-sm font-medium", u.id === unitId ? "bg-brand-navy text-white" : "bg-white ring-1 ring-slate-200"].join(" ")}>Unit {String(u.number)}</a>
      ))}
    </nav>
  );
  return (
    <AppShell name={String(me.displayName)}>
      <ClassOverviewView o={o} assignments={assignments} resolveAction={resolveAlertAction}
        heatMap={<>{picker}<HeatMap grid={grid} studentHref={(id) => `/teacher/students/${id}`} /></>} />
    </AppShell>
  );
}
