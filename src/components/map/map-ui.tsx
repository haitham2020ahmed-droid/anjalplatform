import type { AreaStatus, Descriptor } from "@/server/map/map-plan";
import type { PlanDoc } from "@/server/map/map-more";

/** Colours and words shared by every MAP page (teacher, student, parent, print). */
export const DESC_STYLE: Record<Descriptor, string> = { Low: "bg-red-100 text-red-800", LoAvg: "bg-orange-100 text-orange-800", Avg: "bg-slate-100 text-slate-700", HiAvg: "bg-teal-100 text-teal-800", High: "bg-emerald-100 text-emerald-800" };
export const STATUS_STYLE: Record<AreaStatus, string> = { FOCUS: "bg-red-50 text-red-800 ring-red-200", MAINTAIN: "bg-slate-50 text-slate-700 ring-slate-200", EXTEND: "bg-emerald-50 text-emerald-800 ring-emerald-200" };
export const STATUS_WORD: Record<AreaStatus, string> = { FOCUS: "🎯 Focus", MAINTAIN: "✔ Keep it up", EXTEND: "🚀 Extend" };
export const subjectName = (s: string) => (s === "LANGUAGE" ? "Language Usage" : "Reading");

export function StatusChip({ status }: { status: AreaStatus | null }) {
  if (!status) return <span className="text-xs text-slate-400">—</span>;
  return <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-bold ring-1 ${STATUS_STYLE[status]}`}>{STATUS_WORD[status]}</span>;
}

/** The plan as a printable document (teacher preview, the student's copy, the parent's copy). */
export function PlanDocView({ d, forStudent = false }: { d: PlanDoc; forStudent?: boolean }) {
  const p = d.profile;
  return (
    <article className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200 print:shadow-none print:ring-0">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-brand-teal">My MAP plan · {subjectName(d.subject)}</p>
          <h2 className="text-2xl font-extrabold text-brand-navy">{d.name}</h2>
          <p className="text-sm text-slate-600">{d.className} · Grade {d.grade}{d.number ? ` · ID ${d.number}` : ""} · {d.term}</p>
        </div>
        <dl className="grid grid-cols-3 gap-3 text-center">
          <div className="rounded-xl bg-slate-50 px-3 py-2"><dt className="text-xs text-slate-500">{p.fall ? "Fall RIT" : "RIT"}</dt><dd className="text-2xl font-bold text-brand-navy">{p.fall?.rit ?? p.overall?.rit ?? "—"}</dd></div>
          <div className="rounded-xl bg-amber-50 px-3 py-2"><dt className="text-xs text-slate-500">Spring goal</dt><dd className="text-2xl font-bold text-amber-800">{p.fall?.projection ?? "—"}</dd></div>
          <div className="rounded-xl bg-teal-50 px-3 py-2"><dt className="text-xs text-slate-500">{d.estimate ? "Now (about)" : "Latest"}</dt><dd className="text-2xl font-bold text-teal-800">{d.estimate ?? p.overall?.rit ?? "—"}</dd></div>
        </dl>
      </header>
      {p.areas.some((a) => a.rit !== null) && (
        <section className="mt-4">
          <h3 className="font-bold text-brand-navy">{forStudent ? "My goal areas" : "Goal areas (MAP)"}</h3>
          <ul className="mt-2 grid gap-2 sm:grid-cols-3">
            {p.areas.map((a) => (
              <li key={a.group} className="rounded-xl p-3 ring-1 ring-slate-200">
                <p className="font-semibold text-brand-navy">{a.icon} {a.name}</p>
                <p className="text-sm text-slate-600">{a.rit !== null ? <>RIT {a.rit} · band {a.band}</> : "No score"}</p>
                <div className="mt-1 flex flex-wrap gap-1">{a.descriptor && <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${DESC_STYLE[a.descriptor]}`}>{a.descriptor}</span>}<StatusChip status={a.status} /></div>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section className="mt-5">
        <h3 className="font-bold text-brand-navy">{forStudent ? "What I will practise" : "The plan"}</h3>
        <ol className="mt-2 space-y-2">
          {d.items.map((it, i) => (
            <li key={it.group} className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200 print:bg-white">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-bold text-brand-navy">{i + 1}. {it.icon} {it.name} <span className="font-normal text-slate-600">· questions at RIT {it.band} and a little above · {it.count} questions</span></p>
                {it.progress !== null && <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${it.done ? "bg-emerald-100 text-emerald-800" : "bg-white text-slate-700 ring-1 ring-slate-200"}`}>{it.done ? "✅ Done" : `${it.progress}%`}</span>}
              </div>
              <p className="mt-1 text-sm text-slate-700">Skills: {it.skills.length > 0 ? it.skills.join(" · ") : "all the skills of this area"}</p>
            </li>
          ))}
        </ol>
      </section>
      {(d.note || d.dueAt) && <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{d.dueAt && <b>Finish by {d.dueAt.slice(0, 10)}. </b>}{d.note}</p>}
      <footer className="mt-5 border-t border-slate-200 pt-3 text-xs text-slate-500">
        RIT = the MAP Growth score. Bands of 10 RIT, as in the NWEA reports. Descriptors compare with students of the same grade and season (NWEA 2025 norms): Low, LoAvg, Avg, HiAvg, High.
        {d.sentAt ? ` Sent ${d.sentAt.slice(0, 10)}.` : " Draft — not sent yet."}
      </footer>
    </article>
  );
}
