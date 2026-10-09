import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { AiRunner } from "@/components/ai/ai-runner";
import { ReviewTable } from "@/components/ai/review-table";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { aiEnv } from "@/server/ai/env";
import { aiSettings, pickProvider } from "@/server/ai/engine";
import { suggestions } from "@/server/ai/jobs";
import { gapReport } from "@/server/ai/tools";
import { wizard } from "@/server/ai/wizard";
import { reviewAction, tickAction, wizardAction } from "../../actions";

export const metadata = { title: "Prepare a Skill" };

/** 🪄 Prepare one skill, step by step (Quality Check before Auto-Tag; a random sample of 10 tags to review). */
export default async function WizardPage({ params, searchParams }: { params: Promise<{ skillId: string }>; searchParams: Promise<{ msg?: string }> }) {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "questions:publish" });
  const me = (await getActor())!.user;
  const { skillId } = await params;
  const sp = await searchParams;
  const w = await wizard(repo, actor, skillId);
  const picked = pickProvider(aiEnv(), await aiSettings(repo, actor.schoolId));
  const cur = w.steps.find((x) => x.key === w.current) ?? null;
  const gap = cur && (cur.key === "gap1" || cur.key === "gap2") ? (await gapReport(repo, actor.schoolId!, w.skill.grade, skillId))[0] : null;
  const tool = cur?.key === "quality" ? "QUALITY" : cur?.key === "duplicates" ? "DUPLICATE" : cur?.key === "tag" ? "TAG" : cur?.key === "reading" ? "READING" : null;
  let rows = tool ? await suggestions(repo, actor, { tool, skillId, jobId: tool !== "DUPLICATE" ? cur?.jobId ?? undefined : undefined }) : [];
  // Auto-Tag: review a random sample of 10 (stable for this run), then Approve all
  const allTags = tool === "TAG" ? rows : [];
  if (tool === "TAG") rows = [...rows].sort((a, b) => (a.id.charCodeAt(a.id.length - 1) * 7 + a.id.length) % 13 - (b.id.charCodeAt(b.id.length - 1) * 7 + b.id.length) % 13).slice(0, 10);
  const back = `/admin/ai-tools/wizard/${skillId}`;
  const btn = "rounded-xl px-4 py-2 font-semibold";
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: `/admin/ai-tools?tab=wizard&grade=${w.skill.grade}`, label: "Prepare a Skill" }} icon="🪄" title={w.skill.name}
        subtitle={<>Grade {w.skill.grade} · {w.questions} questions · {w.passages} passages · <b>{w.status === "READY" ? "✅ Ready" : w.status === "IN_PROGRESS" ? "In progress" : "Not started"}</b></>}>
        <form action={wizardAction}><input type="hidden" name="skillId" value={skillId} /><input type="hidden" name="op" value="reset" /><button className="text-sm font-semibold text-slate-500 underline">Start again</button></form>
      </PageHeader>
      {sp.msg && <p role="alert" className="mb-4 rounded-xl bg-amber-50 px-4 py-3 text-amber-900 ring-1 ring-amber-200">{sp.msg}</p>}
      <ol className="mb-5 grid gap-2 sm:grid-cols-3 lg:grid-cols-6">{w.steps.map((st, i) => (
        <li key={st.key} className={`rounded-2xl p-3 text-sm ring-1 ${st.key === w.current ? "bg-brand-navy text-white ring-brand-navy" : st.done ? "bg-emerald-50 text-emerald-900 ring-emerald-200" : "bg-white text-slate-600 ring-slate-200"}`}>
          <span className="block text-xs font-bold opacity-80">Step {i + 1}</span><span className="font-bold">{st.done ? "✓ " : ""}{st.title}</span>{st.skipped && <span className="block text-xs">(no passages)</span>}
        </li>
      ))}</ol>
      {!cur ? <p className="rounded-3xl bg-emerald-50 p-6 text-lg font-bold text-emerald-900 ring-1 ring-emerald-200">✅ This skill is ready. Pick the next skill on the list.</p> : (
        <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <h2 className="text-xl font-extrabold text-brand-navy">{cur.title}</h2>
          <p className="text-slate-600">{cur.what}</p>
          {cur.blocked && <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-amber-900">🔒 {cur.blocked}</p>}
          {gap && (
            <div className="mt-4 grid gap-3 sm:grid-cols-4">
              {(["BELOW", "ON", "ABOVE"] as const).map((l) => <div key={l} className={`rounded-2xl p-3 ring-1 ${gap.counts[l] >= (gap.perLevel ?? 0) ? "bg-emerald-50 ring-emerald-200" : "bg-red-50 ring-red-200"}`}><p className="text-xs font-semibold text-slate-500">{l === "BELOW" ? "Below" : l === "ON" ? "On" : "Above"}</p><p className="text-2xl font-extrabold text-brand-navy">{gap.counts[l]} / {gap.perLevel}</p></div>)}
              <div className="rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-200"><p className="text-xs font-semibold text-slate-500">Still missing</p><p className={`text-2xl font-extrabold ${gap.missingTotal ? "text-red-700" : "text-emerald-700"}`}>{gap.missingTotal || "Nothing ✓"}</p></div>
            </div>
          )}
          {tool && !cur.blocked && !cur.jobId && tool !== "DUPLICATE" && <form action={wizardAction} className="mt-4"><input type="hidden" name="skillId" value={skillId} /><input type="hidden" name="step" value={cur.key} /><input type="hidden" name="op" value="start" /><button disabled={!picked.ok} className={`${btn} bg-brand-navy text-white hover:bg-brand-purple disabled:opacity-50`}>▶ Start {cur.title}</button>{!picked.ok && <p className="mt-2 text-sm text-amber-900">{picked.reason}</p>}</form>}
          {tool === "DUPLICATE" && <form action={wizardAction} className="mt-4"><input type="hidden" name="skillId" value={skillId} /><input type="hidden" name="step" value={cur.key} /><input type="hidden" name="op" value="start" /><button className={`${btn} bg-brand-navy text-white hover:bg-brand-purple`}>▶ Find duplicates</button></form>}
          {cur.jobId && cur.jobStatus !== "DONE" && <div className="mt-4"><AiRunner jobId={cur.jobId} tick={tickAction} label={cur.title} /></div>}
          {cur.jobId && cur.jobStatus === "DONE" && cur.progress && <p className="mt-3 text-sm text-slate-600">Finished: {cur.progress.done} checked{cur.progress.failed ? `, ${cur.progress.failed} failed (shown in the Log)` : ""}.</p>}
          {tool && (cur.jobStatus === "DONE" || tool === "DUPLICATE") && (
            <div className="mt-4">
              {tool === "TAG" && allTags.length > 10 && <p className="mb-2 text-sm text-slate-600">A random sample of 10 of the {allTags.length} suggestions. If they look right, tick all and press “Approve ticked (all)” — or <Link href={`/admin/ai-tools?tab=review&tool=TAG&skillId=${skillId}`} className="font-semibold text-brand-teal underline">open all {allTags.length}</Link>.</p>}
              {tool === "TAG" && allTags.length > 10 && (
                <form action={reviewAction} className="mb-3"><input type="hidden" name="back" value={back} /><input type="hidden" name="decision" value="APPROVE" />{allTags.map((r) => <input key={r.id} type="hidden" name="ids" value={r.id} />)}<button className={`${btn} bg-emerald-600 text-white hover:bg-emerald-700`}>✓✓ Approve all {allTags.length}</button></form>
              )}
              <ReviewTable rows={rows} back={back} sample={tool === "TAG"} />
            </div>
          )}
          <form action={wizardAction} className="mt-5 flex justify-end"><input type="hidden" name="skillId" value={skillId} /><input type="hidden" name="step" value={cur.key} /><input type="hidden" name="op" value="next" />
            <button className={`${btn} bg-emerald-600 text-white hover:bg-emerald-700`}>Next step ▶</button></form>
        </section>
      )}
    </AppShell>
  );
}
