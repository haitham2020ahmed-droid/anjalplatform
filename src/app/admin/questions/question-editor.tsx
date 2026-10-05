"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { EditorInput } from "@/server/admin/questions";
import { field, label } from "@/components/admin/styles";
import { saveQuestionAction } from "../actions";

type Skill = { id: string; grade: number; name: string };
const TYPES: [string, string][] = [
  ["MULTIPLE_CHOICE", "Multiple choice"], ["MULTI_SELECT", "Multiple select"], ["DROPDOWN", "Dropdown"], ["TRUE_FALSE", "True / false"],
  ["FILL_BLANK", "Fill in the blank"], ["SENTENCE_ORDER", "Sentence order"], ["WORD_ORDER", "Word order"], ["ERROR_CORRECTION", "Error correction"], ["MATCHING", "Matching"],
];
const LEVELS = ["Very easy", "Easy", "Below grade level", "Grade level", "Above grade level", "Challenging", "Advanced"];
const lines = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);

/** Question editor. Every save is validated on the server with the same rules as the question bank. */
export function QuestionEditor({ questionId, initial, skills, standards, readOnly }: { questionId: string | null; initial: EditorInput | null; skills: Skill[]; standards: string[]; readOnly: boolean }) {
  const router = useRouter();
  const [q, setQ] = useState<EditorInput>(initial ?? {
    skillId: skills[0]?.id ?? "", type: "MULTIPLE_CHOICE", stem: "", level: 4, whyCorrect: "", tip: "",
    options: [{ label: "A", text: "", correct: true, rationale: null }, { label: "B", text: "", correct: false, rationale: "" }, { label: "C", text: "", correct: false, rationale: "" }],
  });
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({});
  const [pending, start] = useTransition();
  const set = (patch: Partial<EditorInput>) => setQ({ ...q, ...patch });
  const optionTypes = ["MULTIPLE_CHOICE", "MULTI_SELECT", "DROPDOWN"].includes(q.type);
  const opts = q.options ?? [];
  const setOpt = (i: number, patch: Partial<NonNullable<EditorInput["options"]>[number]>) =>
    set({ options: opts.map((o, j) => (j === i ? { ...o, ...patch } : q.type !== "MULTI_SELECT" && patch.correct ? { ...o, correct: false } : o)) });

  function save() {
    const payload: EditorInput = { ...q, tip: q.tip || null };
    for (const k of ["options", "answer", "answers", "sequence", "segments", "errorIndex", "correction", "pairs"] as const) delete payload[k];
    if (optionTypes) payload.options = opts.map((o, i) => ({ ...o, label: "ABCDEFGH"[i], rationale: o.correct ? o.rationale || null : o.rationale ?? "" }));
    if (q.type === "TRUE_FALSE") payload.answer = q.answer ?? true;
    if (q.type === "FILL_BLANK") payload.answers = q.answers ?? [];
    if (q.type === "SENTENCE_ORDER" || q.type === "WORD_ORDER") payload.sequence = q.sequence ?? [];
    if (q.type === "ERROR_CORRECTION") Object.assign(payload, { segments: q.segments ?? [], errorIndex: q.errorIndex ?? 0, correction: q.correction ?? "" });
    if (q.type === "MATCHING") payload.pairs = q.pairs ?? [];
    start(async () => {
      const r = await saveQuestionAction(questionId, payload);
      if (r.error) return setMsg({ error: r.error });
      setMsg({ ok: r.message });
      if (!questionId && r.id) router.push(`/admin/questions/${r.id}`);
      else router.refresh();
    });
  }

  return (
    <fieldset disabled={readOnly || pending} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <label className={label}>Skill<select value={q.skillId} onChange={(e) => set({ skillId: e.target.value })} className={field}>{skills.map((s) => <option key={s.id} value={s.id}>G{s.grade} · {s.name}</option>)}</select></label>
        <label className={label}>Type<select value={q.type} onChange={(e) => set({ type: e.target.value as EditorInput["type"] })} className={field}>{TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        <label className={label}>Difficulty<select value={q.level} onChange={(e) => set({ level: Number(e.target.value) })} className={field}>{LEVELS.map((l, i) => <option key={l} value={i + 1}>{i + 1} · {l}</option>)}</select></label>
        <label className={label}>Standard (optional)<input list="standards" value={q.standardCode ?? ""} onChange={(e) => set({ standardCode: e.target.value || null })} placeholder="Skill's standard" className={field} /></label>
        <datalist id="standards">{standards.map((s) => <option key={s} value={s} />)}</datalist>
        <label className={label}>Expected time (seconds)<input type="number" min={10} max={600} value={q.estimatedSeconds ?? 45} onChange={(e) => set({ estimatedSeconds: Number(e.target.value) })} className={field} /></label>
        <label className="flex items-center gap-2 pt-6 text-sm"><input type="checkbox" checked={!!q.aiDrafted} onChange={(e) => set({ aiDrafted: e.target.checked })} disabled={!!questionId} />Drafted with AI help</label>
      </div>
      <label className={label}>Question<textarea value={q.stem} onChange={(e) => set({ stem: e.target.value })} rows={3} maxLength={2000} className={field} /></label>

      {optionTypes && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-slate-700">Options: tick the correct answer{q.type === "MULTI_SELECT" ? "s" : ""}; every wrong option needs feedback for the student.</p>
          {opts.map((o, i) => (
            <div key={i} className="grid items-start gap-2 sm:grid-cols-[auto_1fr_1fr_auto]">
              <input type={q.type === "MULTI_SELECT" ? "checkbox" : "radio"} name="correct" checked={o.correct} onChange={(e) => setOpt(i, { correct: e.target.checked })} aria-label={`Option ${"ABCDEFGH"[i]} is correct`} className="mt-3" />
              <input value={o.text} onChange={(e) => setOpt(i, { text: e.target.value })} placeholder={`Option ${"ABCDEFGH"[i]}`} className={field} />
              <input value={o.rationale ?? ""} onChange={(e) => setOpt(i, { rationale: e.target.value })} placeholder={o.correct ? "(correct answer)" : "Why is this wrong?"} disabled={o.correct} className={field} />
              <button type="button" onClick={() => set({ options: opts.filter((_, j) => j !== i) })} disabled={opts.length <= 2} className="mt-2 text-sm text-red-700">Remove</button>
            </div>
          ))}
          {opts.length < 6 && <button type="button" onClick={() => set({ options: [...opts, { label: "", text: "", correct: false, rationale: "" }] })} className="text-sm text-brand-teal">+ Add option</button>}
        </div>
      )}
      {q.type === "TRUE_FALSE" && (
        <fieldset className="flex gap-6"><legend className="text-sm font-medium">Correct answer</legend>
          <label className="flex items-center gap-2"><input type="radio" checked={q.answer !== false} onChange={() => set({ answer: true })} />True</label>
          <label className="flex items-center gap-2"><input type="radio" checked={q.answer === false} onChange={() => set({ answer: false })} />False</label>
        </fieldset>
      )}
      {q.type === "FILL_BLANK" && <label className={label}>Accepted answers (one per line)<textarea rows={3} value={(q.answers ?? []).join("\n")} onChange={(e) => set({ answers: lines(e.target.value) })} className={field} /></label>}
      {(q.type === "SENTENCE_ORDER" || q.type === "WORD_ORDER") && <label className={label}>Items in the CORRECT order (one per line; students see them shuffled)<textarea rows={5} value={(q.sequence ?? []).join("\n")} onChange={(e) => set({ sequence: lines(e.target.value) })} className={field} /></label>}
      {q.type === "ERROR_CORRECTION" && (
        <div className="grid gap-3 sm:grid-cols-3">
          <label className={`${label} sm:col-span-3`}>Sentence parts (one per line; one part contains the mistake)<textarea rows={4} value={(q.segments ?? []).join("\n")} onChange={(e) => set({ segments: lines(e.target.value) })} className={field} /></label>
          <label className={label}>Part with the mistake<select value={q.errorIndex ?? 0} onChange={(e) => set({ errorIndex: Number(e.target.value) })} className={field}>{(q.segments ?? []).map((s, i) => <option key={i} value={i}>{i + 1}: {s}</option>)}</select></label>
          <label className={label}>Correction<input value={q.correction ?? ""} onChange={(e) => set({ correction: e.target.value })} className={field} /></label>
        </div>
      )}
      {q.type === "MATCHING" && <label className={label}>Pairs (one per line: left = right; at least 3)<textarea rows={4} value={(q.pairs ?? []).map((p) => `${p.left} = ${p.right}`).join("\n")} onChange={(e) => set({ pairs: lines(e.target.value).map((l) => { const [left, ...r] = l.split("="); return { left: left.trim(), right: r.join("=").trim() }; }) })} className={field} /></label>}

      <div className="grid gap-3 sm:grid-cols-2">
        <label className={label}>Why the answer is correct (shown after answering)<textarea rows={2} value={q.whyCorrect} onChange={(e) => set({ whyCorrect: e.target.value })} maxLength={1000} className={field} /></label>
        <label className={label}>Tip (optional)<textarea rows={2} value={q.tip ?? ""} onChange={(e) => set({ tip: e.target.value })} maxLength={500} className={field} /></label>
        <label className={label}>Hint (optional, before answering)<input value={q.hint ?? ""} onChange={(e) => set({ hint: e.target.value || null })} maxLength={500} className={field} /></label>
      </div>
      {!readOnly && (
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={save} className="rounded-xl bg-brand-navy px-5 py-2.5 font-semibold text-white hover:bg-brand-purple">{pending ? "Saving…" : questionId ? "Save changes" : "Create draft"}</button>
          {msg.ok && <span role="status" className="text-sm text-brand-teal">{msg.ok}</span>}
          {msg.error && <span role="alert" className="rounded-lg bg-red-50 px-3 py-1.5 text-sm text-red-700">{msg.error}</span>}
        </div>
      )}
    </fieldset>
  );
}
