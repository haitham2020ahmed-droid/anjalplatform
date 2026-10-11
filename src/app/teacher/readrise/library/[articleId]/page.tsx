import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { articleDetail } from "@/server/readrise/library";
import { teacherReadRiseClasses } from "@/server/readrise/teacher";
import { assignReadRiseAction } from "../../actions";
import { ArticleActions, ArticleView } from "@/app/admin/readrise/_components/article-view";
import { btn, field, Flash } from "@/app/admin/readrise/_components/ui";

export const metadata = { title: "ReadRise article" };

/** 🚀 ReadRise (teacher): review one article (12 versions, questions per band); publish / delete own articles; assign it to a class. */
export default async function ReadRiseArticleTeacher({ params, searchParams }: { params: Promise<{ articleId: string }>; searchParams: Promise<{ msg?: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "questions:read" });
  const me = (await getActor())!.user;
  const { articleId } = await params;
  const sp = await searchParams;
  const classes = (await teacherReadRiseClasses(repo, actor)).filter((c) => c.own);
  const a = await articleDetail(repo, actor, articleId).catch((e) => { if (e instanceof ValidationError || e instanceof ForbiddenError) notFound(); throw e; });
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/teacher/readrise/library", label: "ReadRise Library" }} icon="📰" title={a.title}>
        <ArticleActions a={a} base="/teacher/readrise/library" />
      </PageHeader>
      <Flash msg={sp.msg} />
      {a.status === "PUBLISHED" && !a.hidden && classes.length > 0 && (
        <form action={assignReadRiseAction} className="mb-6 flex flex-wrap items-end gap-3 rounded-2xl bg-teal-50 p-4 ring-1 ring-teal-200">
          <input type="hidden" name="articleId" value={a.id} />
          <p className="me-auto text-sm font-semibold text-teal-900">📌 Assign this article to a class</p>
          <label className="flex flex-col gap-1 text-sm font-semibold text-slate-700">Class
            <select name="classId" required className={field}>{classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
          </label>
          <label className="flex flex-col gap-1 text-sm font-semibold text-slate-700">Due (optional)<input type="date" name="dueAt" className={field} /></label>
          <button className={btn}>Assign</button>
        </form>
      )}
      <ArticleView a={a} base="/teacher/readrise/library" />
    </AppShell>
  );
}
