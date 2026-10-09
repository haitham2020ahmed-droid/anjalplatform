import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { RESPOND_LEVEL_NAME, respondPage } from "@/server/curriculum-map/respond";
import { saveAllLevelsAction } from "../../actions";

export const metadata = { title: "Respond to Reading · all levels" };
const TONE = { BELOW: "ring-orange-300 bg-orange-50/40", ON: "ring-sky-300 bg-sky-50/40", ABOVE: "ring-emerald-300 bg-emerald-50/40" } as const;

/** ✍️ Admin: write or edit Below, On and Above Level of a Text Set side by side, saved together. */
export default async function RespondAllLevels({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<{ msg?: string }> }) {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "questions:publish" });
  const me = (await getActor())!.user;
  const { code } = await params;
  const sp = await searchParams;
  const p = await respondPage(repo, actor, decodeURIComponent(code));
  const field = "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm";
  const label = "flex flex-col gap-1 text-sm font-semibold text-slate-700";
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: `/admin/curriculum-map/respond/${p.setCode}`, label: "Respond to Reading" }} icon="✍️" title="All three levels"
        subtitle={<>Grade {p.grade} · {p.unit} · <b>{p.heading}</b>{p.sharedRead ? <> · 📖 {p.sharedRead}</> : null}. Lists: one item per line. A level left without Title and Prompt is not changed.</>} />
      {sp.msg && <p role="status" className="mb-5 rounded-2xl bg-teal-50 px-4 py-3 text-teal-900 ring-1 ring-teal-200">{sp.msg}</p>}
      <form action={saveAllLevelsAction}>
        <input type="hidden" name="setCode" value={p.setCode} />
        <div className="grid gap-4 xl:grid-cols-3">
          {p.levels.map(({ level, activity: a }) => (
            <fieldset key={level} className={`space-y-3 rounded-3xl p-4 ring-2 ${TONE[level]}`}>
              <legend className="px-2 text-lg font-bold text-brand-navy">{level === "BELOW" ? "🟠" : level === "ON" ? "🔵" : "🟢"} {RESPOND_LEVEL_NAME[level]}</legend>
              <label className={label}>Title<input name={`title:${level}`} maxLength={255} defaultValue={a?.title ?? ""} className={field} /></label>
              <label className={label}>Prompt<textarea name={`prompt:${level}`} rows={3} maxLength={3000} defaultValue={a?.prompt ?? ""} className={field} /></label>
              <label className={label}>Steps<textarea name={`instructions:${level}`} rows={4} defaultValue={a?.instructions.join("\n") ?? ""} className={field} /></label>
              <label className={label}>Word bank <span className="font-normal text-slate-400">(word — meaning)</span><textarea name={`wordBank:${level}`} rows={4} defaultValue={a?.wordBank.join("\n") ?? ""} className={field} /></label>
              <label className={label}>Sentence starters<textarea name={`sentenceStarters:${level}`} rows={4} defaultValue={a?.sentenceStarters.join("\n") ?? ""} className={field} /></label>
              <label className={label}>Checklist<textarea name={`checklist:${level}`} rows={4} defaultValue={a?.checklist.join("\n") ?? ""} className={field} /></label>
              <label className={label}>Hint (optional, hidden)<textarea name={`hint:${level}`} rows={2} maxLength={2000} defaultValue={a?.hint ?? ""} className={field} /></label>
            </fieldset>
          ))}
        </div>
        <div className="sticky bottom-3 mt-4 flex justify-end"><button className="rounded-xl bg-brand-navy px-8 py-3 font-bold text-white shadow-lg hover:bg-brand-purple">💾 Save all levels</button></div>
      </form>
    </AppShell>
  );
}
