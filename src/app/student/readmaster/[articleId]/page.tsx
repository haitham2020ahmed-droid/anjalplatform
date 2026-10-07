import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { ReadMasterPlayer } from "@/components/readmaster/player";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { LEVEL_NAMES, openArticle, type OpenArticle } from "@/server/readmaster/service";
import { submitArticleAction } from "../actions";

/** One ReadMaster article at the student's level: the text, then its questions. */
export default async function ReadArticle({ params }: { params: Promise<{ articleId: string }> }) {
  const actor = await requireActor({ roles: ["STUDENT"] });
  const me = (await getActor())!.user;
  const { articleId } = await params;
  let a: OpenArticle | null = null, error: string | null = null;
  try { a = await openArticle(repo, actor, articleId); } catch (e) { if (e instanceof ForbiddenError || e instanceof ValidationError) error = e.message; else throw e; }
  return (
    <AppShell name={String(me.displayName)}>
      <p><Link href="/student/readmaster" className="text-brand-teal hover:underline">← ReadMaster</Link></p>
      {error || !a ? <p className="mt-6 text-lg text-slate-700">{error}</p> : a.done ? <p className="mt-6 text-lg text-slate-700">You already finished this article. ✓</p> : (
        <>
          <h1 className="mt-2 text-3xl font-bold text-brand-navy">{a.title}</h1>
          <p className="text-sm text-slate-600">{LEVEL_NAMES[a.level]} · {a.lexile}L{a.skill ? ` · ${a.skill}` : ""}</p>
          <article className="mt-4 rounded-2xl bg-white p-6 text-lg leading-relaxed text-slate-900 ring-1 ring-slate-200" style={{ whiteSpace: "pre-wrap" }}>{a.body}</article>
          <h2 className="mt-6 text-xl font-bold text-brand-navy">Questions</h2>
          <div className="mt-3"><ReadMasterPlayer articleId={a.articleId} versionId={a.versionId} questions={a.questions} submit={submitArticleAction} /></div>
        </>
      )}
    </AppShell>
  );
}
