import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { PrintButton } from "@/components/plans/print-button";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { miniLesson } from "@/server/teacher/support";

export const metadata = { title: "Mini-Lesson" };

/** 📄 A printable small-group mini-lesson: objective, I do / We do / You do, exit ticket with the answers. */
export default async function LessonPage({ searchParams }: { searchParams: Promise<{ classId?: string; code?: string; place?: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN"], permission: "reports:read" });
  const me = (await getActor())!.user;
  const sp = await searchParams;
  const l = await miniLesson(repo, actor, String(sp.classId ?? ""), { code: sp.code ?? null, place: sp.place ?? null });
  const box = "break-inside-avoid rounded-3xl bg-white p-5 ring-1 ring-slate-200";
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: `/teacher/groups?classId=${sp.classId ?? ""}`, label: "Support Groups" }} icon="📄" title={`Mini-Lesson: ${l.title}`} subtitle={`${l.className} · Grade ${l.grade} · ${l.code} · 20–30 minutes`}><PrintButton /></PageHeader>
      <div className="mx-auto max-w-4xl space-y-4">
        <section className={box}><h2 className="text-lg font-bold text-brand-navy">🎯 Objective</h2><p className="mt-1 text-slate-800">{l.objective}</p>{l.students.length > 0 && <p className="mt-2 text-sm text-slate-600"><b>Group:</b> {l.students.map((x) => `${x.name} (${x.detail})`).join(" · ")}</p>}</section>
        <section className="grid gap-4 md:grid-cols-3">
          <div className={box}><h3 className="font-bold text-brand-navy">1 · I do <span className="text-xs font-normal text-slate-500">5 min</span></h3><p className="mt-1 text-sm text-slate-700">{l.iDo}</p></div>
          <div className={box}><h3 className="font-bold text-brand-navy">2 · We do <span className="text-xs font-normal text-slate-500">10–15 min</span></h3><ul className="mt-1 list-disc space-y-1 ps-5 text-sm text-slate-700">{l.weDo.map((x) => <li key={x}>{x}</li>)}</ul></div>
          <div className={box}><h3 className="font-bold text-brand-navy">3 · You do <span className="text-xs font-normal text-slate-500">5–10 min</span></h3><p className="mt-1 text-sm text-slate-700">{l.youDo}</p></div>
        </section>
        <section className={box}>
          <h2 className="text-lg font-bold text-brand-navy">🎟️ Exit Ticket</h2>
          {!l.exitTicket.length ? <p className="mt-1 text-sm text-slate-600">No short multiple-choice question of this skill in the bank yet — ask 2 oral questions instead.</p> : (
            <ol className="mt-2 space-y-3">{l.exitTicket.map((q, i) => <li key={i} className="text-sm"><p className="font-semibold text-slate-900">{i + 1}. {q.stem}</p><ul className="mt-1 ps-5 text-slate-700">{q.options.map((o) => <li key={o}>{o}</li>)}</ul><p className="mt-1 text-xs text-emerald-800 print:text-slate-500">Answer: {q.answer}</p></li>)}</ol>
          )}
        </section>
      </div>
    </AppShell>
  );
}
