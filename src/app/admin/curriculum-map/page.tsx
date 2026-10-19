import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { AppShell } from "@/components/app-shell";
import { EmptyState } from "@/components/ui-kit/empty-state";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { can } from "@/server/auth/rbac";
import { curriculumLessons } from "@/server/curriculum-map/lesson-details";
import { sendTargets } from "@/server/curriculum-map/send-plan";
import { LessonCard } from "@/components/curriculum-map/lesson-card";
import { SendPlanButton, SendPlanHost } from "@/components/curriculum-map/send-plan";
import { getT } from "@/i18n/server";
import { assignPlaceAction, mapCodeSentAction, masteredCountAction, priorAssignmentAction, quickAssignSkillAction, sendPreviewAction, sendScopeAction, shareMapPdfAction } from "./actions";
import { MapPdfBar } from "@/components/curriculum-map/map-pdf-bar";
import { curriculumMapPdfHref, mapShareClasses } from "@/server/curriculum-map/map-pdf";
import { MapAssignHost } from "@/components/curriculum-map/assign-button";
import { rosterForGrade } from "@/server/curriculum-map/levels";
import { respondCodes } from "@/server/curriculum-map/respond";
import { sentMapCodes, sentOn } from "@/server/curriculum-map/sent";
import { skillPlanData } from "@/server/curriculum-map/skill-plan";
import { SkillPlan } from "@/components/curriculum-map/skill-plan";
import { assignedSkillIds } from "@/server/teacher/assign";

export const metadata = { title: "Curriculum Map" };

/**
 * Curriculum Map (teachers and admins): one grade, one unit at a time, as lesson cards (name, genre, Text Idea,
 * vocabulary words, sections Ready / Not ready, Preview). Each section is one short row: 👁 Review · ⭐ Assign · ✓ Sent (the
 * date this teacher sent it). 📘 Send (top): one selection, one unit, several units or the whole plan → classes,
 * students and dates → Preview (untick parts, read the questions) → Send; "Send this unit's plan" and each card's
 * "Send this selection" open the same window with that scope. A teacher sees their own grade(s) only; admins see all grades.
 * A teacher sends only to their own classes (checked on the server).
 */
export default async function CurriculumMapPage({ searchParams }: { searchParams: Promise<{ grade?: string; unit?: string; view?: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "curriculum:read" });
  const me = (await getActor())!.user;
  const sp = await searchParams;
  const [{ t, lang }, v] = await Promise.all([getT(), curriculumLessons(repo, actor, Number(sp.grade) || undefined)]);
  const canSend = can(actor, "assignments:create");
  const isAdmin = actor.role !== "TEACHER";
  // ⭐ Assign beside each Concept Vocabulary / Analyze Craft and Structure / Respond to Reading section (teachers)
  const canAssign = canSend && actor.role === "TEACHER";
  // the Lessons tab (Ready/Review/Respond to Reading/My Review/Text Idea) vs the new Skill plan tab (default)
  const view = sp.view === "lessons" ? "lessons" : "plan";
  // 📘 r79: the Full curriculum map (PDF) of the grade shown + "Send to students" (own classes of that grade)
  const pdfClasses = canSend && v.grade !== null ? await mapShareClasses(repo, actor, v.grade).catch(() => []) : [];
  const [classes, roster, sentMap, plan] = await Promise.all([
    canSend && v.grade !== null ? sendTargets(repo, actor) : Promise.resolve([]),
    canAssign && v.grade !== null ? rosterForGrade(repo, actor, v.grade).catch(() => []) : Promise.resolve([]),
    view === "lessons" && canAssign ? sentMapCodes(repo, actor).catch(() => new Map<string, Date>()) : Promise.resolve(new Map<string, Date>()),
    view === "plan" && v.grade !== null ? skillPlanData(repo, actor, v.grade).catch(() => null) : Promise.resolve(null),
  ]);
  // ✓ Sent: each section this teacher already assigned (any of its levels), with the latest date
  const sent: Record<string, string> = {};
  for (const u of v.units) for (const l of u.lessons) for (const sec of l.sections) { const d = sentOn(sentMap, sec.code); if (d) sent[sec.code.toUpperCase()] = d.toISOString().slice(0, 10); }
  // ⭐ which skills already have an open assignment in one of these classes — so the skill-plan star still shows
  // "assigned" after the page reloads, instead of resetting (it used to be client-only state)
  const assigned = view === "plan" && canAssign && roster.length ? await assignedSkillIds(repo, roster.map((c) => c.id)).catch(() => new Set<string>()) : new Set<string>();
  // Respond to Reading Text Sets that have a writing task (the Grades 4–5 tasks load by themselves the first time)
  const respondSets = view === "lessons" && canAssign && actor.schoolId ? [...new Set([...(await respondCodes(repo, actor.schoolId).catch(() => new Set<string>()))].map((c) => c.replace(/\.(BELOW|ON|ABOVE)$/, "")))] : [];
  const unitIx = Math.min(Math.max(0, (Number(sp.unit) || 1) - 1), Math.max(0, v.units.length - 1));
  const unit = v.units[unitIx];
  // the two tabs read from different unit lists (the "plan" tab mirrors the printable map, 1:1 with Unit/Lesson rows;
  // "Lessons" reads the Question Bank's place tree) — clamp separately so switching tabs never indexes past either one
  const planUnitIx = Math.min(Math.max(0, (Number(sp.unit) || 1) - 1), Math.max(0, (plan?.units.length ?? 1) - 1));
  const tab = "inline-flex min-h-9 items-center rounded-full px-4 text-sm font-semibold";
  const viewLink = (w: "plan" | "lessons") => `/admin/curriculum-map?${new URLSearchParams({ ...(v.grade ? { grade: String(v.grade) } : {}), unit: String(unitIx + 1), ...(w === "lessons" ? { view: "lessons" } : {}) })}`;
  return (
    <AppShell name={String(me.displayName)}>
      <div className="curriculum-map-ui">
      <PageHeader back={{ href: actor.role === "TEACHER" ? "/teacher" : "/admin", label: "Back" }} title="Curriculum Map"
        subtitle={t("Lessons, words and skills of each unit. Send a plan to your students; they open it in My Plans.")}>
        {isAdmin && can(actor, "questions:edit") && <Link href={`/admin/curriculum-map/edit${v.grade ? `?grade=${v.grade}` : ""}`} prefetch={false} className="text-sm font-semibold text-slate-600 underline underline-offset-4 hover:text-brand-navy">{t("Edit (admin)")}</Link>}
      </PageHeader>

      {v.grade === null || !v.units.length ? <EmptyState icon="🧭" title="Nothing here yet" text="The Curriculum Map has not been created yet." /> : (
        <>
          <nav aria-label="View" className="flex flex-wrap gap-2">
            <Link href={viewLink("plan")} prefetch={false} aria-current={view === "plan" ? "page" : undefined} className={`${tab} ${view === "plan" ? "bg-brand-purple text-white" : "bg-white text-brand-navy ring-1 ring-slate-200"}`}>{t("Skill plan")}</Link>
            <Link href={viewLink("lessons")} prefetch={false} aria-current={view === "lessons" ? "page" : undefined} className={`${tab} ${view === "lessons" ? "bg-brand-purple text-white" : "bg-white text-brand-navy ring-1 ring-slate-200"}`}>{t("Lessons")}</Link>
          </nav>

          {view === "plan" && (plan ? (
            <div className="mt-3">
              <SkillPlan basePath="/admin/curriculum-map" grade={v.grade} grades={v.grades} unitIx={planUnitIx} units={plan.units}
                pdfHref={curriculumMapPdfHref(v.grade, "staff", lang)} studentPdfHref={curriculumMapPdfHref(v.grade, "student", lang)}
                reportHref={canAssign && roster[0] ? `/teacher/reports/skills-grid?classId=${encodeURIComponent(roster[0].id)}` : null}
                canAssign={canAssign} roster={roster} quickAssign={quickAssignSkillAction} assigned={assigned} priorAssignment={priorAssignmentAction} masteredCount={masteredCountAction} />
              {canSend && <div className="mt-3"><MapPdfBar grade={v.grade} href={curriculumMapPdfHref(v.grade, "staff", lang)} studentHref={curriculumMapPdfHref(v.grade, "student", lang)} classes={pdfClasses} share={shareMapPdfAction} showDownload={false} /></div>}
            </div>
          ) : <div className="mt-3"><EmptyState icon="🧭" title="Nothing here yet" text="The Curriculum Map has not been created yet." /></div>)}

          {view === "lessons" && (
            <>
              {v.grade !== null && v.units.length > 0 && <div className="mt-3"><MapPdfBar grade={v.grade} href={curriculumMapPdfHref(v.grade, "staff", lang)} studentHref={curriculumMapPdfHref(v.grade, "student", lang)} classes={pdfClasses} share={canSend ? shareMapPdfAction : null} /></div>}
              {/* a teacher sees the Curriculum Map of their own grade(s) only; admins see every grade */}
              {v.grades.length > 1 && <nav aria-label={t("Grade")} className="mt-3 flex flex-wrap gap-2">
                {v.grades.map((g) => (
                  <Link key={g} href={`/admin/curriculum-map?grade=${g}&view=lessons`} prefetch={false} aria-current={g === v.grade ? "page" : undefined}
                    className={`${tab} ${g === v.grade ? "bg-brand-navy text-white" : "bg-white text-brand-navy ring-1 ring-slate-200"}`}>{t("Grade {n}", { n: g })}</Link>
                ))}
              </nav>}
              {canSend && (
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-blue-50 px-4 py-3 ring-1 ring-blue-100">
                  <p className="text-sm text-blue-900">{t("Send one selection, a unit, several units or the whole plan. You see a preview first.")}</p>
                  <SendPlanButton label="Send…" big />
                </div>
              )}
              <nav aria-label={t("Units")} className="mt-3 flex flex-wrap gap-2">
                {v.units.map((u, i) => (
                  <Link key={u.code} href={`/admin/curriculum-map?grade=${v.grade}&unit=${i + 1}&view=lessons`} prefetch={false} aria-current={i === unitIx ? "page" : undefined}
                    className={`${tab} text-sm ${i === unitIx ? "bg-blue-700 text-white" : "bg-white text-brand-navy ring-1 ring-slate-200"}`}>{t("Unit {n}", { n: i + 1 })}</Link>
                ))}
              </nav>

              {unit && (
                <section className="mt-6" aria-labelledby="unit-title">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h2 id="unit-title" className="text-2xl font-semibold text-brand-navy">{t("Grade {n}", { n: v.grade })} · {t("Unit {n}", { n: unitIx + 1 })}</h2>
                    {canSend && <SendPlanButton kind="UNIT" codes={[unit.code]} label="Send this unit's plan" />}
                  </div>
                  <div className="mt-3 grid gap-3 lg:grid-cols-2">
                    {unit.lessons.map((l) => <LessonCard key={l.code} compact lesson={l} sent={sent} canAssign={canAssign && roster.length > 0} respondSets={respondSets} respondClassId={roster[0]?.id ?? null} canSend={canSend} />)}
                  </div>
                </section>
              )}
              {canAssign && roster.length > 0 && <MapAssignHost classes={roster} assign={assignPlaceAction} alreadySent={mapCodeSentAction} />}
            </>
          )}
          {canSend && <SendPlanHost key={v.grade} grade={v.grade} send={sendScopeAction} preview={sendPreviewAction}
            classes={classes.filter((c) => c.grade == null || c.grade === v.grade).map(({ id, name, students }) => ({ id, name, students }))}
            units={v.units.map((u, i) => ({ code: u.code, n: i + 1, lessons: u.lessons.map((l) => ({ code: l.code, name: l.name })) }))} />}
        </>
      )}
      </div>
    </AppShell>
  );
}
