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

const NAMES = { BELOW: "Approaching", ON: "Meeting", ABOVE: "Exceeding" } as const;
/** students never see level words: the three versions are named by how they read */
const STUDENT_NAMES = { BELOW: "Lighter text", ON: "Standard text", ABOVE: "Challenge text" } as const;

/**
 * One ReadMaster article (the same view for students and staff): Below | On | Above buttons above the text — it opens
 * at the student's own level and they can switch; a lower level is Practice (it does not change their level).
 * Read-aloud (shared Listen player) and the dictionary word-tap stay. Staff see the questions without answering.
 */
export default async function ReadArticle({ params, searchParams }: { params: Promise<{ articleId: string }>; searchParams: Promise<{ level?: string }> }) {
  const actor = await requireActor({ roles: ["STUDENT", "TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"] });
  const me = (await getActor())!.user;
  const { articleId } = await params;
  const sp = await searchParams;
  let a: OpenArticle | null = null, error: string | null = null;
  try { a = await openArticle(repo, actor, articleId, { level: sp.level ?? null }); } catch (e) { if (e instanceof ForbiddenError || e instanceof ValidationError) error = e.message; else throw e; }
  const student = a?.viewer === "STUDENT";
  return (
    <AppShell name={String(me.displayName)}>
      <p><Link href={a ? `/student/readmaster?grade=${a.grade}` : "/student/readmaster"} className="inline-flex min-h-10 items-center text-brand-teal hover:underline">← ReadMaster</Link></p>
      {error || !a ? <p className="mt-6 text-lg text-slate-700">{error}</p> : (
        <>
          <h1 className="mt-2 text-3xl font-bold text-brand-navy">{a.title}</h1>
          <p className="text-sm text-slate-600">{[a.skill, `Grade ${a.grade}`, `${a.minutes} min read`].filter(Boolean).join(" · ")}</p>
          {/* the version of the text (staff: Approaching | Meeting | Exceeding; students: Lighter | Standard | Challenge text) */}
          <nav aria-label="Reading level" className="mt-4 flex flex-wrap items-center gap-2" data-rm="levels">
            {a.levels.map((l) => {
              const on = l.level === a!.level;
              return (
                <Link key={l.level} href={`/student/readmaster/${a!.articleId}?level=${l.level}`} prefetch={false} aria-current={on ? "true" : undefined}
                  className={`inline-flex min-h-11 flex-col items-center justify-center rounded-xl px-5 py-1 font-semibold leading-tight transition ${on ? "bg-brand-navy text-white shadow-sm" : "bg-white text-brand-navy ring-1 ring-slate-300 hover:ring-brand-teal"}`}>
                  <span>{(student ? STUDENT_NAMES : NAMES)[l.level]}</span>
                  {l.level === a!.ownLevel && <span className={`text-xs font-normal ${on ? "text-white/85" : "text-slate-500"}`}>{student ? "★ My level" : "★ On grade"}</span>}
                </Link>
              );
            })}
          </nav>
          {a.practice && !a.done && <p role="note" className="mt-3 rounded-xl bg-amber-50 px-4 py-2 font-semibold text-amber-900 ring-1 ring-amber-200">🧪 Practice: this won&apos;t change your level.</p>}
          {!student && <p role="note" className="mt-3 rounded-xl bg-slate-50 px-4 py-2 text-slate-700 ring-1 ring-slate-200">Students open this article at their own level and can switch. Results count only at their level or higher.</p>}
          {a.done && a.result && <p role="status" className="mt-3 rounded-xl bg-emerald-50 px-4 py-2 font-semibold text-emerald-800 ring-1 ring-emerald-200">✓ You finished this article: {a.result.correct}/{a.result.total} ({(student ? STUDENT_NAMES : NAMES)[a.result.level]}). You can read it again at any level.</p>}
          <div className="mt-3 flex flex-wrap items-center justify-end gap-2"><ListenButton text={`${a.title}. ${plainPassage(a.body)}`} label="Listen to the article" slowFirst={a.level === "BELOW"} /></div>
          <div className="mt-3"><WordLookup><article className="reading rounded-3xl bg-white p-6 text-slate-900 shadow-sm ring-1 ring-slate-200 sm:p-10" ><PassageText text={a.body} paraClassName="mt-4 whitespace-pre-line first:mt-0" headingClassName="mt-6 text-xl font-bold text-brand-navy first:mt-0" /></article></WordLookup></div>
          {!a.done && (
            <>
              <h2 className="mt-6 text-xl font-bold text-brand-navy">Questions</h2>
              <div className="mt-3"><ReadMasterPlayer key={a.versionId} articleId={a.articleId} versionId={a.versionId} questions={a.questions} submit={submitArticleAction} practice={a.practice} preview={!student} /></div>
            </>
          )}
        </>
      )}
    </AppShell>
  );
}
