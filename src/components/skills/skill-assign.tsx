"use client";
import { useEffect, useState } from "react";

type Track = "CURRICULUM" | "MAP" | "NAFS";
export interface SkillRosterClass { id: string; name: string; grade: number; students: { id: string; name: string }[] }
const EVENT = "skill-assign:open";

/** ⭐ Assign this skill: a tiny button that opens the page's single assign window. */
export function SkillAssignButton({ skillId, name, grade }: { skillId: string; name: string; grade: number }) {
  return <button type="button" onClick={() => window.dispatchEvent(new CustomEvent(EVENT, { detail: { skillId, name, grade } }))} className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-900 ring-1 ring-amber-300 transition hover:bg-amber-200 active:scale-95">⭐ Assign this skill</button>;
}

/** The page's ONE window: a class of the skill's grade, all or starred students, Curriculum / MAP / Nafs (Grade 6). */
export function SkillAssignHost({ classes, assign }: { classes: SkillRosterClass[]; assign: (i: { classId: string; skillId: string; studentIds?: string[]; track: Track; dueAt?: string | null }) => Promise<{ ok: boolean; message: string }> }) {
  const [open, setOpen] = useState(false);
  const [skill, setSkill] = useState<{ skillId: string; name: string; grade: number } | null>(null);
  const [classId, setClassId] = useState("");
  const [who, setWho] = useState<"all" | "some">("all");
  const [starred, setStarred] = useState<Set<string>>(new Set());
  const [track, setTrack] = useState<Track>("CURRICULUM");
  const [due, setDue] = useState("");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<{ ok: boolean; message: string } | null>(null);
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<{ skillId: string; name: string; grade: number }>).detail;
      setSkill(d); setRes(null); setWho("all"); setStarred(new Set()); setTrack("CURRICULUM");
      setClassId(classes.find((c) => c.grade === d.grade)?.id ?? ""); setOpen(true);
    };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener(EVENT, on); window.addEventListener("keydown", esc);
    return () => { window.removeEventListener(EVENT, on); window.removeEventListener("keydown", esc); };
  }, [classes]);
  if (!open || !skill) return null;
  const fit = classes.filter((c) => c.grade === skill.grade);
  const klass = fit.find((c) => c.id === classId);
  const send = async () => {
    setBusy(true); setRes(null);
    setRes(await assign({ classId, skillId: skill.skillId, studentIds: who === "some" ? [...starred] : undefined, track, dueAt: due || null }));
    setBusy(false);
  };
  const pill = (on: boolean) => `rounded-full px-3 py-1.5 font-semibold ${on ? "bg-brand-navy text-white" : "ring-1 ring-slate-300"}`;
  return (
    <div role="dialog" aria-modal="true" aria-label={`Assign ${skill.name}`} className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
      <div className="animate-pop max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-white p-6 text-sm shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div><p className="text-xs font-bold uppercase tracking-wider text-brand-teal">Assign skill · Grade {skill.grade}</p><p className="text-xl font-bold text-brand-navy">{skill.name}</p><p className="text-slate-500">Each student starts at their own level; questions get harder or easier with each answer.</p></div>
          <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="text-2xl leading-none text-slate-500">×</button>
        </div>
        {fit.length === 0 ? <p className="mt-4 rounded-xl bg-amber-50 px-3 py-2 text-amber-900">You do not teach a Grade {skill.grade} class.</p> : (
          <>
            {fit.length > 1 && <label className="mt-4 flex flex-col font-semibold text-slate-700">Class<select value={classId} onChange={(e) => { setClassId(e.target.value); setStarred(new Set()); }} className="mt-1 rounded-xl border border-slate-300 px-3 py-2 font-normal">{fit.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.students.length})</option>)}</select></label>}
            <div className="mt-4 flex flex-wrap gap-2"><button type="button" onClick={() => setWho("all")} className={pill(who === "all")}>All students ({klass?.students.length ?? 0})</button><button type="button" onClick={() => setWho("some")} className={pill(who === "some")}>Some students</button></div>
            {who === "some" && (
              <ul className="mt-2 max-h-52 space-y-1 overflow-y-auto rounded-xl p-2 ring-1 ring-slate-200">
                {klass?.students.map((st) => (
                  <li key={st.id}><button type="button" onClick={() => setStarred((x) => { const n = new Set(x); if (n.has(st.id)) n.delete(st.id); else n.add(st.id); return n; })} aria-pressed={starred.has(st.id)} className={`flex w-full items-center gap-2 rounded-lg px-2 py-1 text-start ${starred.has(st.id) ? "bg-amber-50" : "hover:bg-slate-50"}`}><span aria-hidden="true" className="text-lg">{starred.has(st.id) ? "⭐" : "☆"}</span>{st.name}</button></li>
                ))}
              </ul>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" onClick={() => setTrack("CURRICULUM")} className={pill(track === "CURRICULUM")}>📘 Curriculum</button>
              <button type="button" onClick={() => setTrack("MAP")} className={pill(track === "MAP")}>🗺️ MAP</button>
              {skill.grade === 6 && <button type="button" onClick={() => setTrack("NAFS")} className={pill(track === "NAFS")}>🇸🇦 Nafs</button>}
            </div>
            <label className="mt-4 flex flex-col font-semibold text-slate-700">Due date (optional)<input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="mt-1 w-48 rounded-xl border border-slate-300 px-3 py-2 font-normal" /></label>
            {res && <p role="status" className={`mt-3 rounded-xl px-3 py-2 ${res.ok ? "bg-teal-50 text-teal-900" : "bg-red-50 text-red-800"}`}>{res.message}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setOpen(false)} className="rounded-xl px-4 py-2 font-semibold ring-1 ring-slate-300">{res?.ok ? "Done" : "Cancel"}</button>
              {!res?.ok && <button type="button" onClick={send} disabled={busy || !classId || (who === "some" && !starred.size)} className="rounded-xl bg-brand-navy px-5 py-2 font-semibold text-white disabled:opacity-50">{busy ? "Assigning…" : "⭐ Assign"}</button>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
