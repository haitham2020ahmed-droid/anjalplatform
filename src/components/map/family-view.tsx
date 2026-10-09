import type { FamilyDoc, FamilySubject } from "@/server/map/map-reports";
import { PercentileBar, ReportHead, ReportPage, RitChart, RitLegend, ordinal } from "./report-ui";

/** 👪 Family Report: what MAP Growth is, then for each subject achievement, growth, the RIT history and the goal;
 *  then the student's practice on the platform and questions to ask the teacher. Two printed pages. */
export function FamilyView({ d, first = true }: { d: FamilyDoc; first?: boolean }) {
  const name = d.student.first.toUpperCase();
  return (
    <>
      <ReportPage first={first}>
        <ReportHead s={d.student} title="Family Report" term={d.term} />
        <div className="mt-3 grid gap-x-8 gap-y-1 text-[12px] leading-snug text-slate-700 md:grid-cols-2 print:grid-cols-2">
          <div>
            <p><b>What is this report?</b> A summary of how your child is doing in English, from the most recent MAP Growth test and their practice on the platform.</p>
            <p className="mt-2"><b>What is MAP Growth?</b> A test that adapts to your child&apos;s answers in real time to measure their level.</p>
          </div>
          <div>
            <p><b>Achievement</b> — how well your child has learned the skills, compared with students of the same grade nationwide. <b>Growth</b> — your child&apos;s own progress over time, compared with students who started at the same score.</p>
            <p className="mt-2"><b>What is a RIT score?</b> The overall score for a subject, on a scale from 100 to 350.</p>
          </div>
        </div>
        {d.subjects.map((x) => <SubjectBlock key={x.subject} x={x} name={name} />)}
        {!d.subjects.length && <p className="mt-6 rounded-xl bg-slate-50 p-4 text-slate-600">No MAP results yet.</p>}
      </ReportPage>
      <ReportPage>
        <ReportHead s={d.student} title="Family Report" term={d.term} />
        <section className="mt-5">
          <h3 className="rounded-lg bg-slate-100 px-3 py-1.5 font-bold text-brand-navy">📈 Practice on the platform · last 30 days</h3>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5 print:grid-cols-5">
            {[["Days practised", d.practice.days], ["Answers", d.practice.answers], ["Correct", d.practice.accuracy === null ? "—" : `${d.practice.accuracy}%`], ["Minutes", d.practice.minutes], ["Skills mastered", d.practice.mastered]].map(([l, v]) => (
              <div key={String(l)} className="rounded-xl bg-white p-3 text-center ring-1 ring-slate-200"><p className="text-2xl font-black text-brand-navy tabular-nums">{v}</p><p className="text-xs text-slate-500">{l}</p></div>
            ))}
          </div>
        </section>
        {d.subjects.some((x) => x.areas.length) && (
          <section className="mt-5">
            <h3 className="rounded-lg bg-slate-100 px-3 py-1.5 font-bold text-brand-navy">🧩 Goal areas</h3>
            <div className="mt-2 grid gap-3 md:grid-cols-2 print:grid-cols-2">{d.subjects.filter((x) => x.areas.length).map((x) => (
              <table key={x.subject} className="w-full text-sm"><thead><tr className="border-b text-left text-xs text-slate-500"><th className="py-1">{x.name}</th><th>RIT</th><th>Level</th></tr></thead>
                <tbody>{x.areas.map((a) => <tr key={a.name} className="border-b last:border-0"><td className="py-1">{a.icon} {a.name}</td><td className="tabular-nums">{a.rit}</td><td>{a.descriptor ?? "—"}</td></tr>)}</tbody></table>
            ))}</div>
          </section>
        )}
        <section className="mt-6 text-[13px] text-slate-700">
          <p><b>How can I use this information to help my child?</b> Talk to your child&apos;s teacher. Questions you can ask:</p>
          <ul className="mt-2 list-disc space-y-0.5 ps-6">
            <li>What strategies are used in class that I can reinforce at home?</li>
            <li>Does my child need extra help in a specific area?</li>
            <li>Which skills on the platform should my child practise this month?</li>
            <li>When will my child&apos;s progress be measured again?</li>
            <li>How is my child doing compared with grade-level expectations?</li>
          </ul>
          <p className="mt-3"><b>At home:</b> 15–20 minutes of practice on the platform, 4 days a week, makes a clear difference. Reading together every day helps every goal area.</p>
        </section>
        <p className="mt-8 text-[11px] text-slate-400">Percentiles marked ≈ and growth percentiles are estimated by the platform from national norms; NWEA&apos;s own reports are the official results. Confidential: for the student&apos;s family and school.</p>
      </ReportPage>
    </>
  );
}

function SubjectBlock({ x, name }: { x: FamilySubject; name: string }) {
  const l = x.latest!;
  return (
    <section className="mt-4 break-inside-avoid">
      <h2 className="rounded-lg bg-slate-100 px-3 py-1.5 text-lg font-bold text-brand-navy">📖 English | {x.name}</h2>
      <div className="mt-2 grid gap-6 md:grid-cols-2 print:grid-cols-2">
        <div>
          <p className="text-sm"><b>{l.descriptor ? `${l.descriptor} Achievement` : "Achievement"}</b>{l.percentile !== null && <> {l.percentileFromFile ? "" : "≈ "}{ordinal(l.percentile)} Percentile</>}</p>
          <RitChart points={x.points} first={name} />
          <RitLegend first={name} approx={x.points.some((p) => p.national !== null && !p.nationalExact)} />
          <p className="mt-1 text-[12.5px] text-slate-700">{name}&apos;s overall score (RIT) was <b>{l.rit}</b> in {l.term}.{l.percentile !== null && <> That is the <b>{ordinal(l.percentile)} percentile</b> of Grade {l.grade} students: better than {l.percentile}% of them.</>}</p>
        </div>
        <div>
          {x.growth ? (
            <>
              <p className="text-sm"><b>{x.growth.descriptor} Growth</b> ≈ {ordinal(x.growth.percentile)} Percentile</p>
              <div className="mt-1"><PercentileBar pct={x.growth.percentile} label={`${name} ${ordinal(x.growth.percentile)}`} /></div>
              <p className="mt-1 text-[12.5px] text-slate-700">{name} grew <b>{x.growth.rit >= 0 ? "+" : ""}{x.growth.rit} RIT</b> from {x.growth.from} to {x.growth.to}. Students who started at the same score grew about {x.growth.expected} ({x.growth.projected ? "NWEA projection" : "national norms"}), so this is more progress than about {x.growth.percentile}% of them.</p>
            </>
          ) : <p className="text-sm text-slate-500">Growth appears after the next MAP test (it compares two tests).</p>}
          {x.goal && <p className="mt-3 rounded-xl bg-teal-50 px-3 py-2 text-[12.5px] text-teal-900 ring-1 ring-teal-200">🎯 Goal for {x.goal.term}: <b>RIT {x.goal.target}</b> ({x.goal.target - l.rit >= 0 ? "+" : ""}{x.goal.target - l.rit} from now).</p>}
        </div>
      </div>
    </section>
  );
}
