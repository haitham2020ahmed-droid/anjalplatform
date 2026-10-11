import { AppShell } from "@/components/app-shell";
import { ClassOverviewView } from "@/components/teacher/class-overview";
import { HeatMap } from "@/components/teacher/heat-map";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { teacherClassData } from "@/server/teacher/page-data";
import { resolveAlertAction } from "../../actions";
import { NO_CURRICULUM_MESSAGE } from "@/server/teacher/assign";
import { emblemsFor } from "@/server/motivation/coins";
import { Avatar, BadgeEmblem } from "@/components/motivation/avatar";
import { BonusCoinsForm } from "@/components/motivation/teacher-reward-forms";
import { getT } from "@/i18n/server";

/** Class overview. ?unit=<unitId> picks the unit for the heat map (default: the unit with most practice). */
export default async function ClassPage({ params, searchParams }: { params: Promise<{ classId: string }>; searchParams: Promise<{ unit?: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"] });
  const { classId } = await params;
  const { unit } = await searchParams;
  const me = (await getActor())!.user;
  // read-only on GET (readiness C-1/I-1); independent reads together (Update 42B): src/server/teacher/page-data.ts
  const { o, units, unitId, grid, assignments } = await teacherClassData(repo, actor, classId, unit); // access checked first
  // Games Part 3: each student's avatar + favorite badge (one read for the class) and the whole-class bonus
  const [{ t }, marks] = await Promise.all([getT(), emblemsFor(repo, o.students.map((x) => x.studentId)).catch(() => new Map())]);
  const badgeOf = Object.fromEntries([...marks.entries()].map(([id, m]) => [id, <span key={id} className="inline-flex items-center gap-1"><Avatar avatar={m.avatar} size={28} />{m.badge && <BadgeEmblem code={m.badge} size={18} />}</span>]));
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
      {/* My Students: the class list (names open the student profile) and the class's accounts (Teacher Home Phase 3) */}
      <p className="mb-4 flex flex-wrap justify-end gap-2 print:hidden">
        <a href={`/teacher/accounts?classId=${classId}`} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-white px-4 py-2 font-semibold text-brand-navy ring-1 ring-slate-300 hover:ring-brand-teal"><span aria-hidden="true">⬇️</span> Download Accounts</a>
        <a href={`/teacher/accounts/roster?classId=${classId}`} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-white px-4 py-2 font-semibold text-brand-navy ring-1 ring-slate-300 hover:ring-brand-teal"><span aria-hidden="true">📤</span> Upload Roster</a>
      </p>
      <ClassOverviewView o={o} assignments={assignments} resolveAction={resolveAlertAction}
        badgeOf={badgeOf}
        heatMap={grid ? <>{picker}<HeatMap grid={grid} studentHref={(id) => `/teacher/students/${id}`} /></> : <p className="rounded-2xl bg-amber-50 px-4 py-3 text-amber-900 ring-1 ring-amber-200">{NO_CURRICULUM_MESSAGE}. <a href={`/teacher/plans?classId=${classId}`} className="underline">Open Plans</a></p>} />
      <section aria-labelledby="class-bonus" className="mt-8 rounded-2xl bg-white p-5 ring-1 ring-slate-200 print:hidden">
        <h2 id="class-bonus" className="text-lg font-semibold text-brand-navy">🎁 {t("Bonus coins for the whole class")}</h2>
        <p className="mb-3 text-sm text-slate-500">{t("Coins and badges never change levels, scores or reports.")}</p>
        <BonusCoinsForm classId={classId} />
      </section>
    </AppShell>
  );
}
