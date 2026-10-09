"use client";
import { useState, useTransition } from "react";
import type { TreeGrade } from "@/server/admin/ai-bank";
import { field, label } from "@/components/admin/styles";
import { generateAiAction, type AiResult } from "../../actions";

/** Grade → Book → Unit → Lesson → Skill → Standard → number of questions. */
export function GenerateForm({ tree }: { tree: TreeGrade[] }) {
  const [g, setG] = useState(0), [b, setB] = useState(0), [u, setU] = useState(0), [l, setL] = useState(0), [s, setS] = useState(0), [st, setSt] = useState(0);
  const [count, setCount] = useState(6);
  const [res, setRes] = useState<AiResult | null>(null);
  const [pending, start] = useTransition();
  const grade = tree[g], book = grade?.books[b], unit = book?.units[u], lesson = unit?.lessons[l], skill = lesson?.skills[s], standard = skill?.standards[st];
  const reset = (level: number) => { if (level <= 1) setB(0); if (level <= 2) setU(0); if (level <= 3) setL(0); if (level <= 4) setS(0); setSt(0); setRes(null); };
  function go() {
    if (!skill || !standard) return;
    start(async () => setRes(await generateAiAction({ skillId: skill.id, standardId: standard.id, lessonId: lesson?.id ?? null, count })));
  }
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <label className={label}>Grade<select className={field} value={g} onChange={(e) => { setG(Number(e.target.value)); reset(1); }}>{tree.map((x, i) => <option key={x.level} value={i}>Grade {x.level}</option>)}</select></label>
        <label className={label}>Book<select className={field} value={b} onChange={(e) => { setB(Number(e.target.value)); reset(2); }}>{grade?.books.map((x, i) => <option key={x.curriculumId} value={i}>{x.book}</option>)}</select></label>
        <label className={label}>Unit<select className={field} value={u} onChange={(e) => { setU(Number(e.target.value)); reset(3); }}>{book?.units.map((x, i) => <option key={x.id} value={i}>Unit {x.number}: {x.title}</option>)}</select></label>
        <label className={label}>Lesson<select className={field} value={l} onChange={(e) => { setL(Number(e.target.value)); reset(4); }}>{unit?.lessons.map((x, i) => <option key={x.id} value={i}>{x.code} · {x.title}</option>)}</select></label>
        <label className={label}>Skill<select className={field} value={s} onChange={(e) => { setS(Number(e.target.value)); reset(5); }}>{lesson?.skills.map((x, i) => <option key={x.id} value={i}>{x.name}</option>)}</select></label>
        <label className={label}>Standard<select className={field} value={st} onChange={(e) => { setSt(Number(e.target.value)); setRes(null); }}>{skill?.standards.map((x, i) => <option key={x.id} value={i}>{x.code}</option>)}</select></label>
        <label className={label}>Number of questions (1–10)<input type="number" min={1} max={10} value={count} onChange={(e) => setCount(Math.max(1, Math.min(10, Number(e.target.value) || 1)))} className={field} /></label>
      </div>
      {standard?.description && <p className="text-sm text-slate-600"><strong>{standard.code}:</strong> {standard.description}</p>}
      {skill && skill.standards.length === 0 && <p className="text-sm text-red-700">This skill has no linked standard, so questions cannot be generated for it.</p>}
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={go} disabled={pending || !standard} className="rounded-xl bg-brand-navy px-5 py-2.5 font-semibold text-white hover:bg-brand-purple disabled:opacity-60">{pending ? "Generating and checking…" : "Generate drafts"}</button>
        <span className="text-sm text-slate-500">Questions are saved as drafts and checked automatically. Nothing reaches students until a teacher or admin approves it.</span>
      </div>
      {res?.error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-red-700">{res.error}</p>}
      {res?.result && (
        <div role="status" className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
          <p className="font-semibold text-brand-navy">{res.result.saved.length} of {res.result.requested} saved as drafts · difficulty saved: {res.result.balance.saved.easy} easy, {res.result.balance.saved.medium} medium, {res.result.balance.saved.hard} hard</p>
          {res.result.balance.warnings.map((w) => <p key={w} className="text-sm text-amber-800">{w}</p>)}
          <ul className="mt-2 list-disc space-y-1 ps-5 text-sm">{res.result.saved.map((x) => <li key={x.id}><a className="text-brand-teal hover:underline" href={`/admin/questions/${x.id}`}>Level {x.level}: {x.stem.slice(0, 90)}</a></li>)}</ul>
          {res.result.rejected.length > 0 && (
            <>
              <p className="mt-3 font-semibold text-red-700">Rejected by automatic checks (not saved)</p>
              <ul className="list-disc space-y-1 ps-5 text-sm text-red-700">{res.result.rejected.map((x) => <li key={x.slot}>Question {x.slot} (level {x.level}): {x.reasons.join("; ")}</li>)}</ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}
