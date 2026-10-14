import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { articlePage, readRiseAccess, type ArticlePage } from "@/server/readrise/student";
import { getT } from "@/i18n/server";
import { ReadRiseReader } from "@/components/readrise/reader";
import { ReadRiseIcon } from "@/components/readrise/readrise-icon";
import { LevelBadge } from "@/components/readrise/widgets";

export const metadata = { title: "ReadRise article" };
export const dynamic = "force-dynamic";

/** 🚀 One ReadRise article: the 5-step routine (resumable; the server keeps the step). */
export default async function ReadRiseArticle({ params }: { params: Promise<{ articleId: string }> }) {
  const actor = await requireActor({ roles: ["STUDENT"] });
  const me = (await getActor())!.user;
  const { articleId } = await params;
  const [access, { t }] = await Promise.all([readRiseAccess(repo, actor.studentId!), getT()]);
  let page: ArticlePage | null = null, error: string | null = null;
  // 🔒 no article before the placement test (the default start level is not a real level)
  if (access.locked) return (
    <AppShell name={String(me.displayName)}>
      <p><Link href="/student/readrise" className="inline-flex min-h-10 items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-brand-teal"><ReadRiseIcon size={20} /> ‹ ReadRise</Link></p>
      <section data-testid="rr-locked" className="mx-auto mt-6 max-w-3xl rounded-3xl bg-white p-6 ring-1 ring-slate-200">
        <h1 className="text-2xl font-bold text-brand-navy">🔒 {t("Your articles open after the placement test.")}</h1>
        <p className="mt-2 text-slate-700">{t("A few short passages with 3 questions each. It finds the articles that are just right for you.")}</p>
        <Link href="/student/readrise/placement" className="mt-4 inline-block rounded-xl bg-brand-navy px-5 py-2.5 font-semibold text-white hover:bg-brand-purple">{t("Take the placement test")} ▶</Link>
      </section>
    </AppShell>
  );
  try { page = await articlePage(repo, actor, articleId); } catch (e) { if (e instanceof ForbiddenError || e instanceof ValidationError) error = e.message; else throw e; }
  return (
    <AppShell name={String(me.displayName)}>
      <p><Link href="/student/readrise" className="inline-flex min-h-10 items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-brand-teal"><ReadRiseIcon size={20} /> ‹ ReadRise</Link></p>
      {error || !page ? (
        <p className="mt-6 rounded-2xl bg-white p-5 text-lg text-slate-700 ring-1 ring-slate-200">{error ?? "Article not found."} <Link href="/student/readrise" className="text-brand-teal underline">Back to the library</Link></p>
      ) : (
        <div className="mx-auto max-w-3xl">
          <header className="mt-2">
            {page.topic && <p className="text-sm font-semibold uppercase tracking-wide text-brand-teal">{page.topic}</p>}
            <h1 className="text-3xl font-bold leading-tight text-brand-navy">{page.run?.title || page.title}</h1>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-600">{access.placed ? <>My level <LevelBadge level={page.level} size="sm" /> · </> : null}about {page.minutes} min</p>
          </header>
          <ReadRiseReader page={page} />
        </div>
      )}
    </AppShell>
  );
}
