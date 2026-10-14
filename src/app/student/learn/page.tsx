import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { PreviewFrame } from "@/components/student/preview-frame";
import { EmptyState } from "@/components/ui-kit";
import { LearnAreaList, LessonCard } from "@/components/learn/student-cards";
import { repo, requireActor } from "@/server/auth/next";
import { studentPage } from "@/server/auth/student-page";
import { studentLearnHome, type StudentLearnHome } from "@/server/learn/student";
import { ensureLearnLessons } from "@/server/learn/load";
import { getT } from "@/i18n/server";

export const metadata = { title: "Learn" };

/**
 * 📘 Learn (student): "Lessons for you" — what the teacher assigned first, then lessons for my weakest skills — then
 * every lesson by area (Reading / Language). The curriculum Words live in My Words (linked here). Light, mobile-first; no level shown anywhere.
 */
export default async function StudentLearnPage({ searchParams }: { searchParams: Promise<{ preview?: string }> }) {
  const { actor, me, preview } = await studentPage((await searchParams).preview, () => requireActor({ roles: ["STUDENT"] }));
  void ensureLearnLessons(repo, actor.schoolId);
  const { t } = await getT();
  let v: StudentLearnHome = { forYou: [], areas: [] };
  try { v = await studentLearnHome(repo, actor); } catch (e) { console.error("learn home", e); }
  const todo = v.forYou.filter((x) => !x.done);
  return (
    <AppShell name={String(me.displayName)}><PreviewFrame preview={preview}>
      <PageHeader back={{ href: "/student", label: "Home" }} icon="📘" title="Learn" subtitle={t("Short lessons that explain each skill, step by step. Listen, try it with help, prove it from the text, then check what you know.")}>
        <Link href="/student/words" prefetch={false} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-surface px-4 font-semibold text-ink shadow-card ring-1 ring-line hover:ring-brand-teal">📒 {t("My Words")}</Link>
      </PageHeader>
      <section aria-labelledby="for-you" className="mb-8">
        <h2 id="for-you" className="mb-3 text-xl text-ink">{t("Lessons for you")}</h2>
        {v.forYou.length ? (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[...todo, ...v.forYou.filter((x) => x.done)].map((x) => (
              <li key={x.code}><LessonCard href={`/student/learn/${x.code}`} title={x.title} area={x.goalArea} tag={x.assigned ? "From your teacher" : "Suggested for you"} due={x.dueAt} done={x.done} started={x.started} /></li>
            ))}
          </ul>
        ) : <EmptyState compact icon="📘" title="No lessons waiting for you." text="Choose any lesson below to learn something new." />}
      </section>
      <LearnAreaList areas={v.areas} hrefBase="/student/learn" />
    </PreviewFrame></AppShell>
  );
}
