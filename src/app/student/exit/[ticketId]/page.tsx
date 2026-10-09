import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { QuestionSet } from "@/components/learn/question-set";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { myExitTicket } from "@/server/teacher/classroom";
import { submitExitTicketAction } from "@/app/learn-actions";

export const metadata = { title: "Exit ticket" };

/** 🎫 Three quick questions at the end of the lesson. */
export default async function ExitTicketPage({ params }: { params: Promise<{ ticketId: string }> }) {
  const actor = await requireActor({ roles: ["STUDENT"] });
  const me = (await getActor())!.user;
  const { ticketId } = await params;
  const t = await myExitTicket(repo, actor);
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/student", label: "My work" }} icon="🎫" title={t?.id === ticketId ? t.title : "Exit ticket"} subtitle="Three quick questions about today’s lesson. Your teacher sees the results right away." />
      {t?.id !== ticketId ? <p className="rounded-2xl bg-white p-6 text-slate-700 ring-1 ring-slate-200">This exit ticket is closed or already answered. ✅</p>
        : <QuestionSet id={t.id} questions={t.questions} submit={submitExitTicketAction} doneHref="/student" />}
    </AppShell>
  );
}
