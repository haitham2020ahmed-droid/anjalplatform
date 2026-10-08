import Link from "next/link";
import type { LearningPath } from "@/server/student/learning-path";

const RUNG: Record<string, [string, string]> = { SUPPORT: ["🛟", "Support"], BELOW: ["🟠", "Below"], ON: ["🔵", "On"], ABOVE: ["🟢", "Above"], CHALLENGE: ["🚀", "Challenge"] };
const SRC: Record<string, string> = { MAP_RIT: "MAP scores", TEACHER: "the teacher", PLACEMENT: "a placement test", ADAPTIVE: "an adaptive set" };
const OUT: Record<string, string> = { CHANGED: "", KEPT_TEACHER: "kept the teacher's level (suggestion only)", TOO_FEW_ANSWERS: "not changed: too few answers" };
const day = (v: string) => (v ? new Date(v).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "");
const r = (x: string) => <span className="whitespace-nowrap">{RUNG[x]?.[0]} {RUNG[x]?.[1] ?? x}</span>;

/** 🧭 The student's adaptive learning path: level now, how it changed, each adaptive set's path, answering care. */
export function LearningPathView({ p, classId }: { p: LearningPath; classId: string | null }) {
  return (
    <section className="mt-8 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200" aria-labelledby="lp">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="lp" className="text-xl font-extrabold text-brand-navy">🧭 Adaptive learning path</h2>
        <div className="flex flex-wrap gap-2 text-sm">
          {classId && <Link href={`/teacher/personal-plan?classId=${classId}`} className="rounded-xl bg-white px-3 py-1.5 font-semibold text-brand-navy ring-1 ring-slate-300 hover:ring-brand-teal">📋 Class plan</Link>}
          <Link href="/teacher/intervention" className="rounded-xl bg-white px-3 py-1.5 font-semibold text-brand-navy ring-1 ring-slate-300 hover:ring-brand-teal">🚨 Intervention</Link>
          <Link href="/teacher/map-rit" className="rounded-xl bg-white px-3 py-1.5 font-semibold text-brand-navy ring-1 ring-slate-300 hover:ring-brand-teal">🗺️ MAP</Link>
        </div>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200"><p className="text-xs text-slate-500">Overall level</p>
          <p className="mt-1 text-2xl font-extrabold text-brand-navy">{p.level ? r(p.level.level) : "On (default)"}</p>
          {p.level && <p className="text-xs text-slate-500">from {SRC[p.level.source] ?? p.level.source} · {day(p.level.at)}</p>}
          {p.categories.length > 0 && <ul className="mt-2 space-y-0.5 border-t border-slate-200 pt-2 text-xs">{p.categories.map((c) => <li key={c.category} className="flex justify-between gap-2"><span className="text-slate-600">{c.name}</span><b>{r(c.level)}</b></li>)}</ul>}
          <p className="mt-1 text-[11px] text-slate-500">A set starts at the teacher's recent choice, else the category level, else placement / MAP.</p></div>
        <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200"><p className="text-xs text-slate-500">Accuracy, last 30 days</p>
          <p className="mt-1 text-2xl font-extrabold text-brand-navy">{p.accuracy30 ?? "—"}{p.accuracy30 !== null && "%"}</p><p className="text-xs text-slate-500">{p.answers30} answers</p></div>
        <div className={`rounded-2xl p-4 ring-1 ${p.rapidPct30 !== null && p.rapidPct30 >= 30 ? "bg-red-50 ring-red-200" : "bg-slate-50 ring-slate-200"}`}><p className="text-xs text-slate-500">Rapid guesses, last 30 days</p>
          <p className="mt-1 text-2xl font-extrabold text-brand-navy">{p.rapidPct30 ?? "—"}{p.rapidPct30 !== null && "%"}</p><p className="text-xs text-slate-500">{p.rapidPct30 !== null && p.rapidPct30 >= 30 ? "⚠️ answers too fast to have read: talk with the student" : "answers given with time to read"}</p></div>
      </div>
      <h3 className="mt-6 font-bold text-brand-navy">Recent adaptive sets: the path taken</h3>
      {p.journeys.length === 0 ? <p className="mt-1 text-sm text-slate-600">No adaptive set answered yet.</p> : (
        <ul className="mt-2 space-y-2">
          {p.journeys.map((j, i) => (
            <li key={i} className="rounded-xl bg-slate-50 px-4 py-3 text-sm ring-1 ring-slate-200">
              <p className="font-semibold text-slate-900">{j.title} <span className="font-normal text-slate-500">· {day(j.at)} · {j.answers} answers · {j.correctPct}% correct{!j.finished ? " · in progress" : j.reason === "MASTERED_ABOVE" ? " · mastered" : ""}</span></p>
              <p className="mt-1 flex flex-wrap items-center gap-1.5">{j.path.map((x, k) => <span key={k} className="flex items-center gap-1.5">{k > 0 && <span aria-hidden="true" className="text-slate-400">→</span>}{r(x)}</span>)}</p>
            </li>
          ))}
        </ul>
      )}
      <h3 className="mt-6 font-bold text-brand-navy">How the level changed</h3>
      {p.history.length === 0 ? <p className="mt-1 text-sm text-slate-600">No change recorded yet.</p> : (
        <ul className="mt-2 space-y-1.5 text-sm">
          {p.history.map((h, i) => (
            <li key={i} className="flex flex-wrap items-center gap-2"><span className="w-14 text-slate-500">{day(h.at)}</span>
              {h.from ? <>{r(h.from)} <span aria-hidden="true">→</span></> : null} {r(h.to)}
              <span className="text-slate-500">{h.category ? `· ${h.category} ` : ""}· by {SRC[h.source] ?? h.source}{h.answers ? ` (${h.answers} answers)` : ""}{h.reason && h.source !== "ADAPTIVE" ? ` · ${h.reason}` : ""}{OUT[h.outcome] ? ` · ${OUT[h.outcome]}` : ""}</span></li>
          ))}
        </ul>
      )}
    </section>
  );
}
