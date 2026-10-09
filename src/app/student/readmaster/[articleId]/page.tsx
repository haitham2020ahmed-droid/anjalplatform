import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { ReadMasterPlayer } from "@/components/readmaster/player";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { openArticle, type OpenArticle } from "@/server/readmaster/service";
import { submitArticleAction } from "../actions";
import { ListenButton } from "@/components/listen-button";
import { PassageText, plainPassage } from "@/components/passage-text";
import { WordLookup } from "@/components/learn/word-lookup";

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
          <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm text-slate-600">{a.skill ?? ""}</p><ListenButton text={`${a.title}. ${plainPassage(a.body)}`} label="Listen to the article" /></div>
          <div className="mt-4"><WordLookup><article className="reading rounded-3xl bg-white p-6 text-slate-900 shadow-sm ring-1 ring-slate-200 sm:p-10" ><PassageText text={a.body} paraClassName="mt-4 whitespace-pre-line first:mt-0" headingClassName="mt-6 text-xl font-bold text-brand-navy first:mt-0" /></article></WordLookup></div>
          <h2 className="mt-6 text-xl font-bold text-brand-navy">Questions</h2>
          <div className="mt-3"><ReadMasterPlayer articleId={a.articleId} versionId={a.versionId} questions={a.questions} submit={submitArticleAction} /></div>
        </>
      )}
    </AppShell>
  );
}
