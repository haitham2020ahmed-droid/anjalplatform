import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { startQuiz } from "@/server/practice/session";
import { isCancelledForStudent } from "@/server/student/cancelled-work";
import { QuizPlayer } from "./quiz-player";
import { PlayerBoundary } from "@/components/practice/player-boundary";

/** A set of questions the teacher chose: starts or continues where the student stopped. */
export default async function QuizPage({ params }: { params: Promise<{ assignmentId: string }> }) {
  const actor = await requireActor({ roles: ["STUDENT"], permission: "practice:take" });
  const me = (await getActor())!.user;
  try {
    const aid = (await params).assignmentId;
    // 🚫 owner r68: work the teacher cancelled does not open (its answers are kept for the teacher)
    if (actor.studentId && (await isCancelledForStudent(repo, actor.studentId, actor.schoolId, aid))) throw new ValidationError("Your teacher cancelled this work. It is no longer in My Work.");
    const view = await startQuiz(repo, actor, aid);
    return <AppShell name={String(me.displayName)}><PlayerBoundary where="quiz"><QuizPlayer initial={view} /></PlayerBoundary></AppShell>;
  } catch (e) {
    if (!(e instanceof ValidationError || e instanceof ForbiddenError)) throw e;
    return (
      <AppShell name={String(me.displayName)}>
        <p className="text-lg text-slate-700">{e.message}</p>
        <Link href="/student" className="mt-6 inline-block rounded-xl bg-brand-navy px-6 py-3 font-semibold text-white">My assigned work</Link>
      </AppShell>
    );
  }
}
