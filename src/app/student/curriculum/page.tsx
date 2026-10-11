import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/ui-kit/empty-state";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { studentCurriculumLessons } from "@/server/curriculum-map/lesson-details";
import { studentSkillPlans } from "@/server/curriculum-map/plans";
import { StudentCurriculum } from "@/components/curriculum-map/student-curriculum";
import { hideLevels } from "@/lib/hide-levels";
import { getT } from "@/i18n/server";

export const metadata = { title: "Curriculum Map" };

/** Curriculum Map for students: the Curriculum plans sent to me, then my grade's lessons (read only, no levels). */
export default async function StudentCurriculumPage() {
  const actor = await requireActor({ roles: ["STUDENT"] });
  const me = (await getActor())!.user;
  const [{ t }, v, plans] = await Promise.all([getT(), studentCurriculumLessons(repo, actor), studentSkillPlans(repo, actor)]);
  const sent = plans.filter((p) => p.kind === "CURRICULUM" || p.kind === "UNIT").map((p) => ({ id: p.id, title: hideLevels(p.title), done: p.done, parts: p.places }));
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/student", label: "Home" }} title="Curriculum Map" subtitle={v.grade !== null ? t("Grade {n}", { n: v.grade }) : undefined} />
      {!v.units.length && !sent.length ? <EmptyState icon="🧭" title="Nothing here yet" text="Check back later." /> : (
        <StudentCurriculum plans={sent} units={v.units.map((u) => ({ code: u.code, title: u.title, lessons: u.lessons.map((l) => ({ ...l, sections: l.sections.map((s) => ({ code: s.code, title: s.title, ready: s.ready })) })) }))} />
      )}
    </AppShell>
  );
}
