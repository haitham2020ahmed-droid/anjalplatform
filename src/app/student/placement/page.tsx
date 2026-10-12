import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { DIAGNOSTIC_MESSAGES, myDiagnosticState } from "@/server/diagnostic/window";

/**
 * The placement check is the Diagnostic Test: go to it while the school admin has it open for the student's grade.
 * Otherwise a friendly note — finished this year, paused (answers kept), or not open yet. No start button here:
 * only the admin opens it (/admin/diagnostic). A content page: English only.
 */
export default async function Placement() {
  const actor = await requireActor({ roles: ["STUDENT"] });
  const me = (await getActor())!.user;
  const d = await myDiagnosticState(repo, actor);
  if (d.state === "OPEN" && d.href) redirect(d.href);
  const view = d.state === "DONE" ? { icon: "🎉", title: DIAGNOSTIC_MESSAGES.DONE, text: "Your teacher will share your report. Your plans already start at the right level for you." }
    : d.state === "PAUSED" ? { icon: "⏸️", title: "Your teacher will reopen it soon", text: "Your answers are saved. You will continue where you stopped." }
    : { icon: "📝", title: DIAGNOSTIC_MESSAGES.CLOSED, text: "Your school opens it at the start of the year. Until then, keep practising your plans." };
  return (
    <AppShell name={String(me.displayName)}>
      <div role="status" className="rounded-3xl bg-white p-8 text-center ring-1 ring-slate-200">
        <p className="text-5xl" aria-hidden="true">{view.icon}</p>
        <h1 className="mt-2 text-2xl font-bold text-brand-navy">{view.title}</h1>
        <p className="mt-2 text-slate-700">{view.text}</p>
        <Link href="/student" className="mt-6 inline-block rounded-xl bg-brand-navy px-6 py-3 font-semibold text-white">My Work</Link>
      </div>
    </AppShell>
  );
}
