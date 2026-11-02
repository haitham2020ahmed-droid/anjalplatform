import type { StudentDiagnosticReport } from "@/server/diagnostic/report";
import { heat, LEVEL_CHIP, LEVEL_NAME } from "./class-report";
import { gradeGoalWords } from "@/server/reports/family-words";
import type { TFn } from "@/i18n";

/** English (no translation) when the page passes no t() */
const EN: TFn = (text, vars) => (vars ? text.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : text);

const STATUS = { Strength: "bg-emerald-100 text-emerald-900", Developing: "bg-amber-100 text-amber-900", "Needs support": "bg-rose-100 text-rose-900" } as const;

/** 📄 One student's Diagnostic report (staff, the student and the family see the same page). `t`: the page's cookie-language t(). */
export function StudentDiagnosticView({ r, family, t = EN }: { r: StudentDiagnosticReport; family: boolean; t?: TFn }) {
  const first = r.student.name.split(" ")[0];
  const u = r.adaptive ? "" : "%";
  return (
    <article className="mx-auto max-w-4xl space-y-5">
      <header className="overflow-hidden rounded-3xl bg-gradient-to-br from-brand-navy to-indigo-800 p-6 text-white shadow-md print:shadow-none">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-200">Literise · {t("Diagnostic Report")}</p>
        <h1 className="mt-1 text-3xl font-extrabold">{r.student.name}</h1>
        <p className="text-white/80">{r.student.className} · {t("Grade {n}", { n: r.grade })} · {r.year} · {t("taken {date}", { date: r.date })}</p>
        {r.invalid && <p className="mt-3 rounded-xl bg-rose-500/30 px-3 py-2 font-bold">⚠️ {t("Not valid (too many fast answers) — retake recommended")}</p>}
        <div className="mt-5 grid gap-3 sm:grid-cols-4">
          <div className="rounded-2xl bg-white/10 p-3"><p className="text-xs uppercase tracking-wide text-white/70">{r.adaptive ? t("Score (0–100)") : t("Score")}</p><p className="text-4xl font-extrabold tabular-nums">{r.pct}{u}</p><p className="text-xs text-white/70">{r.adaptive ? t("Reading at {level}", { level: r.readingLevel ?? "—" }) : t("{n} of {total} correct", { n: r.correct, total: r.total })}</p></div>
          <div className="rounded-2xl bg-white/10 p-3"><p className="text-xs uppercase tracking-wide text-white/70">{family ? t("Grade goal") : t("Starting level")}</p>{r.invalid
            ? <p className="mt-1 text-lg font-bold">{t("Not valid")}<span className="block text-xs font-normal text-white/80">{t("too many fast answers — retake recommended")}</span></p>
            : family
            ? <p className="mt-1 text-lg font-bold">{t(gradeGoalWords(r.level))}</p>
            : <><p className="mt-1"><span className={`rounded-full px-3 py-1 text-lg font-bold ${LEVEL_CHIP[r.level]}`}>{t(`${LEVEL_NAME[r.level]} the standard`)}</span></p><p className="mt-2 text-xs text-white/70">{t(r.tier.name.replace(/^Tier \d · /, ""))} · {t(r.tier.sub)}</p></>}</div>
          <div className="rounded-2xl bg-white/10 p-3"><p className="text-xs uppercase tracking-wide text-white/70">{t("MAP Reading")}</p><p className="text-3xl font-extrabold tabular-nums">{r.rit ?? r.ritEstimate ?? "—"}</p><p className="text-xs text-white/70">{r.rit ? "RIT" : r.ritEstimate ? t("RIT (estimated by the Diagnostic)") : "RIT"}</p></div>
          <div className="rounded-2xl bg-white/10 p-3"><p className="text-xs uppercase tracking-wide text-white/70">{t("Reading fluency")}</p><p className="text-3xl font-extrabold tabular-nums">{r.wcpm?.value ?? "—"}</p><p className="text-xs text-white/70">{r.wcpm ? t("words / minute · goal ~{n}", { n: r.wcpm.benchmark }) : t("not checked yet")}</p></div>
        </div>
      </header>

      {r.note && <p className="rounded-3xl bg-amber-50 px-5 py-4 text-amber-950 ring-1 ring-amber-200">💬 <b>{t("From the teacher:")}</b> {r.note}</p>}

      <section className="grid items-start gap-4 md:grid-cols-2">
        <div className="rounded-3xl bg-emerald-50 p-5 ring-1 ring-emerald-200">
          <h2 className="text-lg font-bold text-emerald-900">🌟 {family ? t("{name}’s strengths", { name: first }) : t("Strengths")}</h2>
          {r.strengths.length ? <ul className="mt-2 list-disc space-y-1 ps-5 text-emerald-950">{r.strengths.map((x) => <li key={x}>{x}</li>)}</ul> : <p className="mt-2 text-emerald-950">{t("Strengths will show as the scores grow — every question practised counts.")}</p>}
        </div>
        <div className="rounded-3xl bg-rose-50 p-5 ring-1 ring-rose-200">
          <h2 className="text-lg font-bold text-rose-900">🎯 {t("Next steps")}</h2>
          {r.needs.length ? <ul className="mt-2 space-y-2 text-rose-950">{r.needs.map((n) => <li key={n.code}><b>{n.label}</b> <span className="font-mono text-xs">({n.code}, {n.pct}{u})</span><span className="block text-sm">{n.objective}</span><span className="block text-sm text-rose-800">{t("Try:")} {n.tip}</span></li>)}</ul> : <p className="mt-2 text-rose-950">{r.invalid ? t("Not valid (too many fast answers) — retake recommended") : t("No weak standard — keep going with the curriculum plan.")}</p>}
        </div>
      </section>

      <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200 print:shadow-none">
        <h2 className="text-lg font-bold text-brand-navy">{t("Strands")}</h2>
        <div className="mt-3 space-y-3">
          {r.strands.map((x) => (
            <div key={x.strand}>
              <div className="flex justify-between text-sm"><span className="font-semibold text-slate-800">{t(x.label)}</span><span className="tabular-nums"><b>{x.pct}{u}</b>{x.readingLevel && <span className="text-slate-600"> · {x.readingLevel}</span>}{x.classPct !== null && <span className="text-slate-500"> · {t("class {n}", { n: `${x.classPct}${u}` })}</span>}</span></div>
              <div className="relative mt-1 h-3 overflow-hidden rounded-full bg-slate-100">
                <div className={`h-full ${x.pct >= 75 ? "bg-emerald-500" : x.pct >= 60 ? "bg-sky-500" : x.pct >= 40 ? "bg-amber-400" : "bg-rose-500"}`} style={{ width: `${x.pct}%` }} />
                {x.classPct !== null && <span className="absolute inset-y-0 w-0.5 bg-slate-800" style={{ left: `${x.classPct}%` }} title={`${t("Class average")} ${x.classPct}${u}`} />}
              </div>
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-slate-500">{t("The black mark is the class average.")}</p>
      </section>

      <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200 print:shadow-none">
        <h2 className="text-lg font-bold text-brand-navy">{t("Standards")}</h2>
        <table className="mt-3 w-full text-sm">
          <thead><tr className="border-b border-slate-200 text-left text-slate-500"><th className="py-2">{t("Standard")}</th><th>{t("Skill")}</th><th className="text-center">{r.adaptive ? t("Level") : t("Correct")}</th><th className="text-center">{t("Score")}</th><th className="text-center">{t("Class")}</th><th>{t("Status")}</th></tr></thead>
          <tbody>
            {r.standards.map((x) => (
              <tr key={x.code} className="border-b border-slate-100">
                <td className="py-2 font-mono text-xs font-bold text-brand-teal">{x.code}</td><td className="text-slate-800">{x.label}</td>
                <td className="whitespace-nowrap text-center tabular-nums">{r.adaptive ? x.readingLevel ?? "—" : `${x.correct}/${x.total}`}</td>
                <td className="text-center"><span className={`rounded px-2 py-0.5 font-bold tabular-nums ${heat(x.pct)}`}>{Math.round(x.pct)}{u}</span></td>
                <td className="text-center tabular-nums text-slate-500">{x.classPct === null ? "—" : `${Math.round(x.classPct)}${u}`}</td>
                <td><span className={`rounded-full px-2 py-0.5 text-xs font-bold ${STATUS[x.status]}`}>{t(x.status)}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {r.areas.length > 0 && (
        <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200 print:shadow-none">
          <h2 className="text-lg font-bold text-brand-navy">{t("MAP Goal Areas")}</h2>
          <p className="text-sm text-slate-600">{t("The same areas as the MAP Growth test, so the next MAP report reads the same way.")}</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {r.areas.map((a) => <div key={a.name} className={`rounded-2xl p-3 ${heat(a.score)}`}><p className="text-xs font-semibold">{a.name}</p><p className="text-xl font-extrabold tabular-nums">{a.score}</p><p className="text-xs">{a.readingLevel}</p></div>)}
          </div>
        </section>
      )}

      <section className="rounded-3xl bg-sky-50 p-5 text-sky-950 ring-1 ring-sky-200">
        <h2 className="text-lg font-bold">🏠 {family ? t("How to help at home") : t("What happens next")}</h2>
        <ul className="mt-2 list-disc space-y-1 ps-5 text-sm">
          <li>{family ? t("The platform now gives {name} questions that match this result; they get easier or harder with every answer.", { name: first }) : r.invalid ? t("Not valid (too many fast answers) — retake recommended") : t("The platform now starts {name} at {level}; the questions get easier or harder with every answer.", { name: first, level: t(LEVEL_NAME[r.level]) })}</li>
          <li>{family ? t("Ask {name} to open “Today’s plan” on the platform for 15 minutes a day.", { name: first }) : t("The weakest standards are in the class support plan and the student’s curriculum plan.")}</li>
          <li>{family ? t("Read together for 15 minutes and ask: What is the main idea? How do you know?") : t("A Weekly Check keeps the level up to date between MAP tests.")}</li>
        </ul>
      </section>
      <p className="text-center text-xs text-slate-500">{r.adaptive ? `${family ? t("Adaptive test: the same 50 skills for every student, each at their own difficulty. Score 0–100 against the grade (72.5 = meeting the grade goal).") : t("Adaptive test: the same 50 skills for every student, each at their own difficulty. Score 0–100 against the grade (72.5 = on grade level).")} ` : ""}{family ? t("Grade goal: {n} and more", { n: `${r.bands.on}${u}` }) : t("Levels: Exceeding ≥ {above} · Meeting {on}–{top} · Approaching < {on}", { above: `${r.bands.above}${u}`, on: `${r.bands.on}${u}`, top: `${r.bands.above - 1}${u}` })}{r.invalid ? ` · ⚡ ${t("{n} answers were very fast: this result is not valid — retake recommended.", { n: r.rapid })}` : ""}</p>
    </article>
  );
}
