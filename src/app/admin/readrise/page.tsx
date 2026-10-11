import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { ensureReadRiseLibrary } from "@/server/readrise/seed";
import { listLibrary } from "@/server/readrise/library";
import { LibraryView, libraryFilters } from "./_components/library-view";
import { ADMIN_TABS, ReadRiseTabs } from "./_components/tabs";
import { Flash, RR_NOTE } from "./_components/ui";

export const metadata = { title: "ReadRise library" };

/** 🚀 ReadRise (admin): the article library — platform articles (hide / show for the school) and the school's own. */
export default async function ReadRiseLibraryAdmin({ searchParams }: { searchParams: Promise<{ topic?: string; status?: string; source?: string; q?: string; msg?: string }> }) {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "questions:read" });
  // first visit after a deploy loads the platform library; problems are SHOWN to the admin (never silently swallowed)
  const seed = await ensureReadRiseLibrary(repo).then((r) => ({ report: r, error: null as string | null })).catch((e: Error) => ({ report: null, error: String(e?.message ?? e).slice(0, 400) }));
  const dir = join(process.cwd(), "data", "readrise", "articles");
  const fileCount = existsSync(dir) ? readdirSync(dir).filter((n) => n.endsWith(".json")).length : 0;
  const platformCount = (await repo.findMany("RRArticle", { schoolId: null, deletedAt: null }, { select: ["id"] })).length;
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
      {platformCount < fileCount || fileCount === 0 || seed.error || (seed.report?.skipped.length ?? 0) > 0 ? (
        <div role="alert" className="mb-5 rounded-2xl bg-amber-50 px-5 py-4 text-amber-950 ring-1 ring-amber-200">
          <p className="font-semibold">Platform library: {platformCount} of {fileCount} articles loaded.</p>
          {fileCount === 0 && <p className="mt-1 text-sm">The article files were not found on the server (data/readrise/articles). Check that the deploy includes the data folder.</p>}
          {seed.error && <p className="mt-1 text-sm">Loading failed: <span dir="ltr" className="font-mono">{seed.error}</span></p>}
          {(seed.report?.skipped ?? []).slice(0, 5).map((x) => <p key={x.file} className="mt-1 text-sm" dir="ltr">{x.file}: {x.problems.slice(0, 2).join("; ")}</p>)}
          <p className="mt-2 text-sm">Reload this page to try again, or run <code dir="ltr">npx tsx prisma/seed/readrise.ts</code> once from the project folder.</p>
        </div>
      ) : null}
      <LibraryView base="/admin/readrise" items={items} topics={topics} f={f} />
    </AppShell>
  );
}
