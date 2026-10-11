import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { AppShell } from "@/components/app-shell";
import { EmptyState } from "@/components/ui-kit/empty-state";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { can } from "@/server/auth/rbac";
import { curriculumLessons, outlineOf } from "@/server/curriculum-map/lesson-details";
import { sendTargets } from "@/server/curriculum-map/send-plan";
import { LessonCard } from "@/components/curriculum-map/lesson-card";
import { SendPlanButton, SendPlanHost } from "@/components/curriculum-map/send-plan";
import { getT } from "@/i18n/server";
import { sendMapPlanAction } from "./actions";

export const metadata = { title: "Curriculum Map" };

/**
 * Curriculum Map (teachers and admins): one grade, one unit at a time, as lesson cards (name, genre, Text Idea,
 * vocabulary words, sections Ready / Not ready, Preview). One goal: send the plan — the whole curriculum (top
 * button) or one unit (button under the unit) → choose class / group / student → preview → send.
 * All content is open to every teacher; a teacher sends only to their own classes (checked on the server).
 */
export default async function CurriculumMapPage({ searchParams }: { searchParams: Promise<{ grade?: string; unit?: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "curriculum:read" });
  const me = (await getActor())!.user;
  const sp = await searchParams;
  const [{ t }, v] = await Promise.all([getT(), curriculumLessons(repo, actor, Number(sp.grade) || undefined)]);
  const canSend = can(actor, "assignments:create");
  const isAdmin = actor.role !== "TEACHER";
  const classes = canSend && v.grade !== null ? await sendTargets(repo, actor) : [];
  const unitIx = Math.min(Math.max(0, (Number(sp.unit) || 1) - 1), Math.max(0, v.units.length - 1));
  const unit = v.units[unitIx];
  const tab = "inline-flex min-h-11 items-center rounded-full px-5 font-semibold";
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: actor.role === "TEACHER" ? "/teacher" : "/admin", label: "Back" }} title="Curriculum Map"
        subtitle={t("Lessons, words and skills of each unit. Send a plan to your students; they open it in My Plans.")}>
        {isAdmin && can(actor, "questions:edit") && <Link href={`/admin/curriculum-map/edit${v.grade ? `?grade=${v.grade}` : ""}`} prefetch={false} className="text-sm font-semibold text-slate-600 underline underline-offset-4 hover:text-brand-navy">{t("Edit (admin)")}</Link>}
      </PageHeader>

      {v.grade === null || !v.units.length ? <EmptyState icon="🧭" title="Nothing here yet" text="The Curriculum Map has not been created yet." /> : (
        <>
          {canSend && <div className="mb-6"><SendPlanButton unitCode={null} label="Send the whole curriculum plan" big /></div>}

          <nav aria-label={t("Grade")} className="flex flex-wrap gap-2">
            {v.grades.map((g) => (
              <Link key={g} href={`/admin/curriculum-map?grade=${g}`} prefetch={false} aria-current={g === v.grade ? "page" : undefined}
                className={`${tab} ${g === v.grade ? "bg-brand-navy text-white" : "bg-white text-brand-navy ring-1 ring-slate-200"}`}>{t("Grade {n}", { n: g })}</Link>
            ))}
          </nav>
          <nav aria-label={t("Units")} className="mt-2 flex flex-wrap gap-2">
            {v.units.map((u, i) => (
              <Link key={u.code} href={`/admin/curriculum-map?grade=${v.grade}&unit=${i + 1}`} prefetch={false} aria-current={i === unitIx ? "page" : undefined}
                className={`${tab} text-sm ${i === unitIx ? "bg-blue-700 text-white" : "bg-white text-brand-navy ring-1 ring-slate-200"}`}>{t("Unit {n}", { n: i + 1 })}</Link>
            ))}
          </nav>

          {unit && (
            <section className="mt-6" aria-labelledby="unit-title">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 id="unit-title" className="text-2xl font-semibold text-brand-navy">{t("Grade {n}", { n: v.grade })} · {t("Unit {n}", { n: unitIx + 1 })}</h2>
                {canSend && <SendPlanButton unitCode={unit.code} label="Send this unit's plan" />}
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {unit.lessons.map((l) => <LessonCard key={l.code} lesson={l} previewHref={`/teacher/preview?code=${encodeURIComponent(l.code)}`} />)}
              </div>
            </section>
          )}
          {canSend && <SendPlanHost grade={v.grade} classes={classes} outline={outlineOf(v.units)} send={sendMapPlanAction} />}
        </>
      )}
    </AppShell>
  );
}
