import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { studentCurriculum } from "@/server/student/student-home";
import { EmptyState } from "@/components/ui-kit";
import { getT } from "@/i18n/server";

export const metadata = { title: "Curriculum Map" };

/** 🧭 Curriculum Map for students: the units of my grade and their Text Sets / Selections (read only). */
export default async function StudentCurriculumPage() {
  const actor = await requireActor({ roles: ["STUDENT"] });
  const me = (await getActor())!.user;
  const [{ t }, v] = await Promise.all([getT(), studentCurriculum(repo, actor)]);
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/student", label: "Home" }} icon="🧭" title="Curriculum Map" subtitle={v.grade !== null ? t("Grade {n}: units and text sets", { n: v.grade }) : undefined} />
      {!v.units.length ? <EmptyState icon="🧭" title="Nothing here yet" text="Check back later." /> : (
        <ol className="grid gap-4 md:grid-cols-2">
          {v.units.map((u) => (
            <li key={u.id} className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
              <h2 className="text-lg font-semibold text-brand-navy" data-content lang="en"><bdi>{u.title}</bdi></h2>
              {u.sets.length ? (
                <ul className="mt-3 space-y-2" data-content lang="en">
                  {u.sets.map((x) => (
                    <li key={x.id} className="rounded-xl bg-blue-50/60 px-3 py-2 ring-1 ring-blue-100">
                      <p className="font-medium text-slate-800">{x.title}</p>
                      {(x.sharedRead || x.genre) && <p className="text-sm text-slate-600">{[x.sharedRead, x.genre].filter(Boolean).join(" · ")}</p>}
                    </li>
                  ))}
                </ul>
              ) : <p className="mt-2 text-sm text-slate-500">{t("Nothing here yet")}</p>}
            </li>
          ))}
        </ol>
      )}
    </AppShell>
  );
}
