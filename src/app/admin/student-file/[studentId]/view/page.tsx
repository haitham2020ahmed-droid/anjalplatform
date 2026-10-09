import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { AssignedSkills, type StudentExtras } from "@/components/student/assigned-skills";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { resolveActor } from "@/server/auth/actor";
import { ForbiddenError } from "@/server/auth/rbac";
import { studentActorFor } from "@/server/insights/student-file";
import { assignedSkills } from "@/server/student/assigned";
import { myMap } from "@/server/map/map-more";
import { myTests } from "@/server/map/sim";
import { DESC_STYLE, StatusChip, subjectName } from "@/components/map/map-ui";

export const metadata = { title: "As the student sees it" };

/** 👁 The student's home and My MAP, exactly as the student sees them — view only (buttons do not act). */
export default async function AsStudentPage({ params }: { params: Promise<{ studentId: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "reports:read" });
  const me = (await getActor())!.user;
  const { studentId } = await params;
  let u; try { u = await studentActorFor(repo, actor, studentId); } catch (e) { if (e instanceof ForbiddenError) notFound(); throw e; }
  const as = await resolveActor(repo, u);
  const [view, map, tests] = await Promise.all([assignedSkills(repo, as), myMap(repo, as), myTests(repo, as)]);
  const extras: StudentExtras = { lexile: null, readingLevel: null, rit: map.subjects[0]?.profile.overall?.rit ?? null, ritGoal: map.subjects[0]?.goal?.target ?? null, mapTests: tests.windows.filter((w) => w.open).reduce((n, w) => n + w.sessions.filter((x) => x.status !== "DONE").length, 0) };
  return (
    <AppShell name={String(me.displayName)}>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-sky-700 px-5 py-3 text-white shadow">
        <p className="font-semibold">👁 You are seeing <b>{String(u.displayName)}</b>’s pages as the student sees them — view only. Buttons here do not act for the student.</p>
        <Link href={`/admin/student-file/${studentId}`} className="rounded-xl bg-white px-4 py-2 font-semibold text-sky-800">← Back to the file</Link>
      </div>
      <div className="pointer-events-none select-text opacity-95" aria-readonly="true">
        <AssignedSkills view={view} firstName={String(u.displayName).split(" ")[0]} placement={false} area="ALL" extras={extras} />
        <section className="mt-8 rounded-3xl bg-white p-5 ring-1 ring-slate-200">
          <h2 className="text-2xl font-bold text-brand-navy">🗺️ My MAP</h2>
          {map.subjects.filter((x) => x.profile.term).map((sub) => (
            <div key={sub.subject} className="mt-3 rounded-2xl bg-slate-50 p-4">
              <p className="font-bold">{subjectName(sub.subject)} · {sub.profile.term} · RIT {sub.profile.overall?.rit}{sub.goal ? ` · ${sub.goal.reached ? "goal reached 🎉" : `${sub.goal.left} RIT points to the goal (${sub.goal.target})`}` : ""}</p>
              <ul className="mt-2 flex flex-wrap gap-2 text-sm">{sub.areas.map((a) => <li key={a.group} className="rounded-lg bg-white px-2 py-1 ring-1 ring-slate-200">{a.icon} {a.name}: {a.rit ?? "—"} {a.descriptor && <span className={`rounded-full px-2 text-xs ${DESC_STYLE[a.descriptor]}`}>{a.descriptor}</span>} <StatusChip status={a.status} /></li>)}</ul>
            </div>
          ))}
          {!map.subjects.some((x) => x.profile.term) && <p className="mt-2 text-slate-600">No MAP scores yet.</p>}
          {map.plans.length > 0 && <p className="mt-3 text-sm">Plan: {map.plans.map((d) => d.items.map((i) => `${i.icon} ${i.name} ${i.done ? "✅" : `${i.progress ?? 0}%`}`).join(" · ")).join(" | ")}</p>}
        </section>
      </div>
    </AppShell>
  );
}
