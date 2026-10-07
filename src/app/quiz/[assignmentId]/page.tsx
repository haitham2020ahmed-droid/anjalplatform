import { AppShell } from "@/components/app-shell";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { startQuiz } from "@/server/practice/session";
import { QuizPlayer } from "./quiz-player";

/** A set of questions the teacher chose: starts or continues where the student stopped. */
export default async function QuizPage({ params }: { params: Promise<{ assignmentId: string }> }) {
  const actor = await requireActor({ roles: ["STUDENT"], permission: "practice:take" });
  const me = (await getActor())!.user;
  try {
    const view = await startQuiz(repo, actor, (await params).assignmentId);
    return <AppShell name={String(me.displayName)}><QuizPlayer initial={view} /></AppShell>;
  } catch (e) {
    if (!(e instanceof ValidationError || e instanceof ForbiddenError)) throw e;
    return (
      <AppShell name={String(me.displayName)}>
        <p className="text-lg text-slate-700">{e.message}</p>
        <a href="/student" className="mt-6 inline-block rounded-xl bg-brand-navy px-6 py-3 font-semibold text-white">My assigned work</a>
      </AppShell>
    );
  }
}
