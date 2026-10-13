import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/ui-kit";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { builderClasses } from "@/server/tests/assessments";
import { PREVIEW_ITEMS } from "@/server/student/preview-as";
import { getT } from "@/i18n/server";

export const metadata = { title: "Preview as student" };

/**
 * 👀 Preview as student: choose a class and a student, then open any page where your work reaches them — tests,
 * plans, reports, NAFS, MAP, comments, writing — exactly as that student sees it (read only, with Download).
 */
export default async function StudentViewPage({ searchParams }: { searchParams: Promise<{ class?: string; student?: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "assignments:read" });
  const me = (await getActor())!.user;
  const { t } = await getT();
  const sp = await searchParams;
  const classes = await builderClasses(repo, actor);
  const byStudent = sp.student ? classes.find((c) => c.students.some((x) => x.id === sp.student)) : undefined;
  const klass = classes.find((c) => c.id === sp.class) ?? byStudent ?? classes[0];
  const student = klass?.students.find((x) => x.id === sp.student) ?? klass?.students[0];
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/teacher", label: "Home" }} icon="👀" title="Preview as student" subtitle={t("See exactly what a student gets from you: choose a student, then open a page. Read only, with Download.")} />
      {!klass ? <EmptyState icon="👥" title="No classes yet" text="When the admin adds you to a class, you can preview here." /> : (
        <div className="grid gap-5">
          <section className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
            {classes.length > 1 && (
              <nav aria-label={t("Class")} className="flex flex-wrap gap-2">
                {classes.map((c) => <Link key={c.id} href={`/teacher/student-view?class=${c.id}`} aria-current={c.id === klass.id ? "page" : undefined} className={`inline-flex min-h-11 items-center rounded-full px-4 font-semibold ${c.id === klass.id ? "bg-brand-navy text-white" : "bg-white text-brand-navy ring-1 ring-slate-300"}`}>{c.name}</Link>)}
              </nav>
            )}
            {!klass.students.length ? <p className="mt-3 text-slate-600">{t("This class has no students yet.")}</p> : (
              <nav aria-label={t("See as")} className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                <span className="font-semibold text-slate-700">{t("See as")}</span>
                {klass.students.slice(0, 80).map((st) => <Link key={st.id} href={`/teacher/student-view?class=${klass.id}&student=${st.id}`} aria-current={st.id === student?.id ? "true" : undefined} className={`inline-flex min-h-11 items-center rounded-full px-4 font-semibold ${st.id === student?.id ? "bg-brand-navy text-white" : "bg-white ring-1 ring-slate-200"}`}><bdi>{st.name}</bdi></Link>)}
              </nav>
            )}
          </section>
          {student && (
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="preview-items">
              {PREVIEW_ITEMS.map((it) => (
                <li key={it.key}><Link prefetch={false} href={it.href(student.id)} className="tile flex min-h-20 items-center gap-3 rounded-2xl bg-white p-4 ring-1 ring-slate-200 hover:ring-brand-teal">
                  <span aria-hidden="true" className="text-3xl">{it.icon}</span>
                  <span className="min-w-0"><span className="block font-semibold text-brand-navy">{t(it.label)}</span><span className="block text-sm text-slate-600">👀 {t("Preview as {name}", { name: student.name })}</span></span>
                </Link></li>
              ))}
            </ul>
          )}
          <p className="text-sm text-slate-600">{t("A single test, plan, exit ticket or writing task: open it in your own pages and press “Preview as student”.")}</p>
        </div>
      )}
    </AppShell>
  );
}
