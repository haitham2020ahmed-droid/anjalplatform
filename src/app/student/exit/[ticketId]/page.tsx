import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { QuestionSet } from "@/components/learn/question-set";
import { repo, requireActor } from "@/server/auth/next";
import { studentPage } from "@/server/auth/student-page";
import { PreviewFrame } from "@/components/student/preview-frame";
import { exitTicketForStudentPreview, myExitTicket } from "@/server/teacher/classroom";
import { submitExitTicketAction } from "@/app/learn-actions";

export const metadata = { title: "Exit ticket" };

/** 🎫 Three quick questions at the end of the lesson (👀 a teacher's preview shows the ticket as this student gets it). */
export default async function ExitTicketPage({ params, searchParams }: { params: Promise<{ ticketId: string }>; searchParams: Promise<{ preview?: string }> }) {
  const { actor, me, preview } = await studentPage((await searchParams).preview, () => requireActor({ roles: ["STUDENT"] }));
  const { ticketId } = await params;
  const t = preview ? await exitTicketForStudentPreview(repo, actor, ticketId) : await myExitTicket(repo, actor);
  return (
    <AppShell name={String(me.displayName)}><PreviewFrame preview={preview}>
      <PageHeader back={{ href: "/student", label: "My work" }} icon="🎫" title={t?.id === ticketId ? t.title : "Exit ticket"} subtitle="Three quick questions about today’s lesson. Your teacher sees the results right away." />
      {t?.id !== ticketId ? <p className="rounded-2xl bg-white p-6 text-slate-700 ring-1 ring-slate-200">This exit ticket is closed or already answered. ✅</p>
        : <QuestionSet id={t.id} questions={t.questions} submit={submitExitTicketAction} doneHref="/student" preview={Boolean(preview)} level={t.level} />}
    </PreviewFrame></AppShell>
  );
}
