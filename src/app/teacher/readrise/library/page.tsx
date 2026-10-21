import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { startReadRiseLibraryLoad } from "@/server/readrise/seed";
import { listLibrary } from "@/server/readrise/library";
import { LibraryView, libraryFilters } from "@/app/admin/readrise/_components/library-view";
import { ReadRiseTabs, TEACHER_TABS } from "@/app/admin/readrise/_components/tabs";
import { Flash, RR_NOTE } from "@/app/admin/readrise/_components/ui";

export const metadata = { title: "ReadRise library" };

/** 🚀 ReadRise (teacher): published articles plus the teacher's own drafts; open one to review or assign it. */
export default async function ReadRiseLibraryTeacher({ searchParams }: { searchParams: Promise<{ topic?: string; status?: string; source?: string; q?: string; msg?: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "questions:read" });
  startReadRiseLibraryLoad(repo); // new article files of a deploy load in the background — the page never waits for them
  const me = (await getActor())!.user;
  const sp = await searchParams;
  const f = libraryFilters(sp);
  const { items, topics } = await listLibrary(repo, actor, f);
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/teacher/readrise", label: "ReadRise" }} icon="📚" title="ReadRise Library"
        subtitle={<>Published articles and your own drafts. Each article has 14 versions; every student reads the version of their level. <span className="text-xs text-slate-500">{RR_NOTE}</span></>}>
        <ReadRiseTabs items={TEACHER_TABS} current="/teacher/readrise/library" />
      </PageHeader>
      <Flash msg={sp.msg} />
      <LibraryView base="/teacher/readrise/library" items={items} topics={topics} f={f} />
    </AppShell>
  );
}
