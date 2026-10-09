import type { RespondActivityView, RespondLevel } from "@/server/curriculum-map/respond";

const TONE: Record<RespondLevel, { ring: string; head: string; icon: string; name: string }> = {
  BELOW: { ring: "ring-orange-200", head: "bg-orange-50 text-orange-900", icon: "🟠", name: "Below Level" },
  ON: { ring: "ring-sky-200", head: "bg-sky-50 text-sky-900", icon: "🔵", name: "On Level" },
  ABOVE: { ring: "ring-emerald-200", head: "bg-emerald-50 text-emerald-900", icon: "🟢", name: "Above Level" },
};

/** ✍️ One Respond to Reading activity: prompt, steps, word bank, sentence starters, checklist, hidden hint. */
export function RespondActivityCard({ a, showLevel = true }: { a: RespondActivityView; showLevel?: boolean }) {
  const t = TONE[a.level];
  const box = "rounded-2xl bg-white p-4 ring-1 ring-slate-200";
  return (
    <article className={`overflow-hidden rounded-3xl bg-white shadow-sm ring-2 ${t.ring} print:shadow-none`}>
      <header className={`px-5 py-4 ${t.head}`}>
        {showLevel && <p className="text-sm font-bold uppercase tracking-wide">{t.icon} {t.name}</p>}
        <h2 className="text-2xl font-extrabold">{a.title}</h2>
      </header>
      <div className="space-y-4 p-5">
        <section className="rounded-2xl bg-violet-50 p-4 ring-1 ring-violet-200">
          <h3 className="text-sm font-bold uppercase tracking-wide text-violet-800">✍️ Your task</h3>
          <p className="mt-1 text-lg font-semibold leading-relaxed text-slate-900">{a.prompt}</p>
        </section>
        {a.instructions.length > 0 && (
          <section className={box}>
            <h3 className="font-bold text-brand-navy">📋 Steps</h3>
            <ol className="mt-2 list-decimal space-y-1 ps-6 text-slate-800">{a.instructions.map((x, i) => <li key={i}>{x}</li>)}</ol>
          </section>
        )}
        <div className="grid gap-4 md:grid-cols-2">
          {a.wordBank.length > 0 && (
            <section className={box}>
              <h3 className="font-bold text-brand-navy">🔤 Word bank</h3>
              <ul className="mt-2 space-y-1 text-slate-800">{a.wordBank.map((x, i) => { const [w, ...m] = x.split(/\s+[—–-]\s+/); return <li key={i}><b>{w}</b>{m.length ? <span className="text-slate-600"> — {m.join(" — ")}</span> : null}</li>; })}</ul>
            </section>
          )}
          {a.sentenceStarters.length > 0 && (
            <section className={box}>
              <h3 className="font-bold text-brand-navy">💬 Sentence starters</h3>
              <ul className="mt-2 space-y-1.5 text-slate-800">{a.sentenceStarters.map((x, i) => <li key={i} className="rounded-lg bg-slate-50 px-3 py-1.5">{x}</li>)}</ul>
            </section>
          )}
        </div>
        {a.checklist.length > 0 && (
          <section className={box}>
            <h3 className="font-bold text-brand-navy">✅ Checklist</h3>
            <ul className="mt-2 space-y-1.5">{a.checklist.map((x, i) => <li key={i}><label className="flex items-start gap-2 text-slate-800"><input type="checkbox" className="mt-1 h-4 w-4 accent-teal-600" /> <span>{x}</span></label></li>)}</ul>
          </section>
        )}
        {a.modelAnswer && (
          <details className="rounded-2xl bg-emerald-50 p-4 ring-1 ring-emerald-200 print:hidden">
            <summary className="cursor-pointer font-bold text-emerald-900">🔑 Model answer (teachers only)</summary>
            <p className="mt-2 whitespace-pre-line text-emerald-950">{a.modelAnswer}</p>
          </details>
        )}
        {a.hint && (
          <details className="rounded-2xl bg-amber-50 p-4 ring-1 ring-amber-200 print:hidden">
            <summary className="cursor-pointer font-bold text-amber-900">💡 Need a hint? (open only if you are stuck)</summary>
            <p className="mt-2 text-amber-950">{a.hint}</p>
          </details>
        )}
      </div>
    </article>
  );
}
