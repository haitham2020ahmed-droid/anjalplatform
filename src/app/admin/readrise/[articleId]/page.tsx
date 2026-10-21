import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { articleDetail } from "@/server/readrise/library";
import { ArticleActions, ArticleView } from "../_components/article-view";
import { Flash } from "../_components/ui";

export const metadata = { title: "ReadRise article" };

/** 🚀 ReadRise (admin): review one article — 14 versions, estimated levels, questions; publish, hide, delete. */
export default async function ReadRiseArticleAdmin({ params, searchParams }: { params: Promise<{ articleId: string }>; searchParams: Promise<{ msg?: string }> }) {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "questions:read" });
  const me = (await getActor())!.user;
  const { articleId } = await params;
  const sp = await searchParams;
  const a = await articleDetail(repo, actor, articleId).catch((e) => { if (e instanceof ValidationError || e instanceof ForbiddenError) notFound(); throw e; });
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/admin/readrise", label: "ReadRise Library" }} icon="📰" title={a.title}>
        <ArticleActions a={a} base="/admin/readrise" />
      </PageHeader>
      <Flash msg={sp.msg} />
      <ArticleView a={a} base="/admin/readrise" />
    </AppShell>
  );
}
