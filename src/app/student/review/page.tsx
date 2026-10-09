import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { QuestionSet } from "@/components/learn/question-set";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { reviewSet } from "@/server/teacher/classroom";
import { submitReviewAction } from "@/app/learn-actions";

export const metadata = { title: "Review my mistakes" };

/** 🔁 Questions I got wrong come back after 1 day, then 3, then 7. Three right answers = learned. */
export default async function ReviewPage() {
  const actor = await requireActor({ roles: ["STUDENT"] });
  const me = (await getActor())!.user;
  const r = await reviewSet(repo, actor);
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/student", label: "My work" }} icon="🔁" title="Review my mistakes" subtitle={<>Questions you got wrong come back after <b>1 day</b>, then <b>3</b>, then <b>7</b>. Answer one right three times and it is learned. · {r.learned} learned · {r.waiting} waiting for later</>} />
      {!r.questions.length ? <p className="rounded-2xl bg-white p-6 text-lg text-slate-700 ring-1 ring-slate-200">🎉 Nothing to review today. Come back tomorrow!</p>
        : <QuestionSet id="review" questions={r.questions} submit={submitReviewAction} doneHref="/student" resultNote="The ones you got right come back later to make sure you remember them." />}
    </AppShell>
  );
}
