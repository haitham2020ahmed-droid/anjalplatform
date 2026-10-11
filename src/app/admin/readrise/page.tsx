import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { ensureReadRiseLibrary } from "@/server/readrise/seed";
import { listLibrary } from "@/server/readrise/library";
import { LibraryView, libraryFilters } from "./_components/library-view";
import { ADMIN_TABS, ReadRiseTabs } from "./_components/tabs";
import { Flash, RR_NOTE } from "./_components/ui";

export const metadata = { title: "ReadRise library" };

/** 🚀 ReadRise (admin): the article library — platform articles (hide / show for the school) and the school's own. */
export default async function ReadRiseLibraryAdmin({ searchParams }: { searchParams: Promise<{ topic?: string; status?: string; source?: string; q?: string; msg?: string }> }) {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "questions:read" });
  await ensureReadRiseLibrary(repo).catch(() => null); // first visit after a deploy loads the platform library
  const me = (await getActor())!.user;
  const sp = await searchParams;
  const f = libraryFilters(sp);
  const { items, topics } = await listLibrary(repo, actor, f);
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/admin", label: "Admin" }} icon="🚀" title="ReadRise Library"
        subtitle={<>Every article is written at 12 levels (300 … 1400); each student reads the version of their ReadRise Level. Platform articles can be hidden for your school; your school&apos;s own articles are imported, reviewed and published here. <span className="text-xs text-slate-500">{RR_NOTE}</span></>}>
        <ReadRiseTabs items={ADMIN_TABS} current="/admin/readrise" />
      </PageHeader>
      <Flash msg={sp.msg} />
      <LibraryView base="/admin/readrise" items={items} topics={topics} f={f} />
    </AppShell>
  );
}
