import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { LessonPlayer } from "@/components/lessons/lesson-player";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { lessonsForStudent, openLesson, type LessonListItem, type LessonView } from "@/server/lessons/run";
import { beginGuidedAction, lessonAnswerAction, lessonHintAction, modelAnswerAction, organizerAction } from "./actions";

export const metadata = { title: "Lessons" };

const PHASE: Record<string, string> = { MODEL: "Not started", GUIDED: "Trying with help", INDEPENDENT: "On your own", CHECK: "Quick check", DONE: "Finished" };

/** 🧩 Lessons: with ?skillId= the lesson itself (resumes the open run); without, “Lessons for you”. */
export default async function LessonPage({ searchParams }: { searchParams: Promise<{ skillId?: string; again?: string }> }) {
  const actor = await requireActor({ roles: ["STUDENT"] });
  const me = (await getActor())!.user;
  const sp = await searchParams;
  if (sp.skillId) {
    let view: LessonView | null = null;
    let problem: string | null = null;
    try { view = await openLesson(repo, actor, String(sp.skillId).slice(0, 191), new Date(), { again: sp.again === "1" }); }
    catch (e) { if (!(e instanceof ValidationError || e instanceof ForbiddenError)) throw e; problem = e.message; }
    return (
      <AppShell name={String(me.displayName)}>
        {view ? (
          <LessonPlayer key={view.runId} initial={view} listHref="/student/lesson"
            actions={{ model: modelAnswerAction, begin: beginGuidedAction, hint: lessonHintAction, answer: lessonAnswerAction, organizer: organizerAction }} />
        ) : (
          <div className="rounded-2xl bg-white p-6 ring-1 ring-slate-200"><p className="text-lg">{problem}</p><Link href="/student/lesson" className="mt-4 inline-block font-semibold text-brand-teal">← My lessons</Link></div>
        )}
      </AppShell>
    );
  }
  const v = await lessonsForStudent(repo, actor);
  const card = (k: LessonListItem, cta: string) => (
    <li key={`${k.skillId}-${k.runId ?? "new"}`} className="flex flex-col justify-between gap-3 rounded-2xl bg-white p-4 ring-1 ring-slate-200">
      <div>
        <p className="font-bold text-brand-navy">🧩 {k.skillName}</p>
        <p className="mt-1 text-sm text-slate-600">{k.why}{k.phase ? ` · ${PHASE[k.phase] ?? k.phase}` : ""}{k.phase === "DONE" ? (k.passed ? ` · ✅ ${k.checkPct}%` : " · with your teacher next") : ""}</p>
      </div>
      <Link href={`/student/lesson?skillId=${encodeURIComponent(k.skillId)}`} className="rounded-xl bg-brand-navy px-3 py-2 text-center text-sm font-bold text-white hover:bg-brand-purple">{cta}</Link>
    </li>
  );
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/student", label: "Home" }} icon="🧩" title="Lessons for you" subtitle="Short lessons: watch an example, try with hints, try on your own, then a quick check." />
      <section aria-label="My open lessons">
        <h2 className="text-lg font-bold text-brand-navy">Continue</h2>
        {v.open.length ? <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{v.open.map((k) => card(k, k.phase === "MODEL" ? "Start" : "Continue"))}</ul> : <p className="mt-2 text-slate-600">No open lessons right now.</p>}
      </section>
      {v.suggested.length > 0 && (
        <section aria-label="Suggested lessons" className="mt-8">
          <h2 className="text-lg font-bold text-brand-navy">Suggested for you</h2>
          <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{v.suggested.map((k) => card(k, "Start"))}</ul>
        </section>
      )}
      {v.done.length > 0 && (
        <section aria-label="Finished lessons" className="mt-8">
          <h2 className="text-lg font-bold text-brand-navy">Finished</h2>
          <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{v.done.map((k) => card(k, "See result"))}</ul>
        </section>
      )}
    </AppShell>
  );
}
