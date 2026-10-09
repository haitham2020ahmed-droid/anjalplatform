import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { PrintButton } from "@/components/plans/print-button";
import { ListenButton } from "@/components/listen-button";
import { RespondActivityCard } from "@/components/respond-activity";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { studentRespond } from "@/server/curriculum-map/respond";
import { studentTaskFor } from "@/server/curriculum-map/respond-assign";
import { finishedAction } from "../actions";

export const metadata = { title: "Respond to Reading" };

/** ✍️ One Respond to Reading activity, at the student's level (never named), with “I finished”. */
export default async function StudentRespondPage({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<{ msg?: string }> }) {
  const actor = await requireActor({ roles: ["STUDENT"] });
  const me = (await getActor())!.user;
  const { code } = await params;
  const sp = await searchParams;
  const v = await studentRespond(repo, actor, decodeURIComponent(code));
  const task = await studentTaskFor(repo, actor, v.page.setCode);
  const a = v.activity;
  const speech = a ? [a.title, a.prompt, ...a.instructions, ...a.sentenceStarters, ...a.checklist].join(". ") : "";
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/student/respond", label: "Respond to Reading" }} icon="✍️" title={v.page.heading}
        subtitle={<>{v.page.unit}{v.page.sharedRead ? <> · 📖 {v.page.sharedRead}</> : null}{task?.dueAt ? <> · <b>Due {task.dueAt.slice(0, 10)}</b></> : null}</>}>
        {a && <ListenButton text={speech} label="Read aloud" />}
        <PrintButton />
      </PageHeader>
      {sp.msg && <p role="status" className="mb-4 rounded-xl bg-emerald-50 px-4 py-3 text-lg font-semibold text-emerald-900 ring-1 ring-emerald-200 print:hidden">{sp.msg}</p>}
      {a ? <RespondActivityCard a={a} showLevel={false} /> : <p className="rounded-2xl bg-white p-6 text-slate-600 ring-1 ring-slate-200">Your teacher has not added this activity yet.</p>}
      {a && task && (
        <form action={finishedAction} className="mt-5 print:hidden">
          <input type="hidden" name="assignmentId" value={task.assignmentId} /><input type="hidden" name="code" value={v.page.setCode} />
          {task.finishedAt ? (
            <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-emerald-50 p-4 ring-1 ring-emerald-200">
              <p className="text-lg font-bold text-emerald-800">✅ You finished on {task.finishedAt.slice(0, 10)}.</p>
              {task.score !== null && <p className="font-semibold text-emerald-900">Score: {task.score}/4</p>}
              {task.feedback && <p className="text-emerald-900">💬 {task.feedback}</p>}
              <input type="hidden" name="done" value="0" />
              <button className="ms-auto rounded-xl bg-white px-4 py-2 text-sm font-semibold text-slate-700 ring-1 ring-slate-300">Undo</button>
            </div>
          ) : (
            <><input type="hidden" name="done" value="1" />
              <button className="w-full rounded-2xl bg-emerald-600 px-6 py-4 text-xl font-extrabold text-white shadow-lg transition hover:scale-[1.01] hover:bg-emerald-700 active:scale-95">✅ I finished my answer in my book</button></>
          )}
        </form>
      )}
    </AppShell>
  );
}
