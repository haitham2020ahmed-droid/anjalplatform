"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MapPlacePicker } from "@/components/curriculum-map/place-picker";
import { useState, useTransition } from "react";
import type { EditorInput } from "@/server/admin/questions";
import { field, label } from "@/components/admin/styles";
import { saveQuestionWithTypesAction } from "./save-actions";
import { useT } from "@/i18n/client";
import { MISCONCEPTIONS } from "@/insights/misconceptions";
import { possibleMissingPassage } from "@/lib/passage-detect";
import { ImageField } from "./image-field";
import { byName, skillMatches } from "@/lib/skill-picker";
import { createSkillAction, createStandardAction } from "../curriculum/manage-actions";
import { CcssNote } from "@/components/ccss-note";

type Skill = { id: string; grade: number; name: string };
const TYPES: [string, string][] = [
  ["MULTIPLE_CHOICE", "Multiple choice"], ["MULTI_SELECT", "Multiple select"], ["DROPDOWN", "Dropdown"], ["TRUE_FALSE", "True / false"],
  ["FILL_BLANK", "Fill in the blank"], ["SENTENCE_ORDER", "Sentence order"], ["WORD_ORDER", "Word order"], ["ERROR_CORRECTION", "Error correction"], ["MATCHING", "Matching"],
  ["TWO_PART", "Two-part (Part A / Part B evidence)"], ["GRID", "Table match (grid)"], ["HOT_TEXT", "Hot text (select sentences)"],
  ["DICTATION", "Dictation (hear the word, type it)"],
  ["SENTENCE_COMBINE", "Sentence combining (join short sentences)"],
  ["SHORT_ANSWER", "Short answer (teacher-scored)"],
];
type Opt = NonNullable<EditorInput["options"]>[number];
const blankOpts = (n: number): Opt[] => Array.from({ length: n }, (_, i) => ({ label: "ABCDEFGH"[i], text: "", correct: i === 0, rationale: i === 0 ? null : "" }));
/** error kinds a teacher can tag an error-correction item with (grammar and mechanics misconceptions) */
const ERROR_KINDS = MISCONCEPTIONS.filter((m) => m.area === "GRAMMAR" || m.area === "MECHANICS");
const LEVELS = ["Very easy", "Easy", "Below grade level", "Grade level", "Above grade level", "Challenging", "Advanced"];
const lines = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);

/** Question editor. Every save is validated on the server with the same rules as the question bank. */
export function QuestionEditor({ questionId, initial, skills: skillsIn, standards: standardsIn, readOnly, onSave, curriculum, places = [], initialPlace = null }: {
  questionId: string | null; initial: EditorInput | null; skills: Skill[]; standards: string[]; readOnly: boolean;
  /** admins: grades for “+ New skill” (skills and standards are created in the curriculum) */
  curriculum?: { grades: { id: string; level: number }[] };
  /** the Curriculum Map places a question can go to (path text for the picker) */
  places?: { code: string; grade: number; unit: number; path: string }[];
  /** place preselected from the Curriculum Map page (“➕ Add question”) */
  initialPlace?: string | null;
  /** Optional: save somewhere else (e.g. an import preview row) instead of the question bank. */
  onSave?: (payload: EditorInput) => Promise<{ error?: string; message?: string }>;
}) {
  const router = useRouter();
  const [skills, setSkills] = useState<Skill[]>(skillsIn);
  const [skillQ, setSkillQ] = useState("");   // 🔎 find a skill by name (case, "&" / "and", apostrophes ignored)
  const [standards, setStandards] = useState<string[]>(standardsIn);
  const [adding, setAdding] = useState<"skill" | "standard" | null>(null);
  const [q, setQ] = useState<EditorInput>(initial ?? {
    ...(initialPlace ? { mapNodeCode: initialPlace } : {}),
    skillId: initialPlace ? "" : skillsIn[0]?.id ?? "", type: "MULTIPLE_CHOICE", stem: "", level: 4, whyCorrect: "", tip: "",
    options: [{ label: "A", text: "", correct: true, rationale: null }, { label: "B", text: "", correct: false, rationale: "" }, { label: "C", text: "", correct: false, rationale: "" }],
  });
  const [msg, setMsg] = useState<{ ok?: string; error?: string; duplicateId?: string }>({});
  const t = useT();
  const [pending, start] = useTransition();
  const set = (patch: Partial<EditorInput>) => setQ({ ...q, ...patch });
  const optionTypes = ["MULTIPLE_CHOICE", "MULTI_SELECT", "DROPDOWN"].includes(q.type);
  const opts = q.options ?? [];
  const setOpt = (i: number, patch: Partial<NonNullable<EditorInput["options"]>[number]>) =>
    set({ options: opts.map((o, j) => (j === i ? { ...o, ...patch } : q.type !== "MULTI_SELECT" && patch.correct ? { ...o, correct: false } : o)) });
  // error correction: the errors (old items have one errorIndex + correction)
  const errIdx = q.errorIndexes ?? (q.errorIndex !== undefined ? [q.errorIndex] : []);
  const errFix = q.corrections ?? (q.correction ? [q.correction] : []);
  const setErr = (i: number, on: boolean, fix?: string) => {
    const pairs = errIdx.map((k, n) => [k, errFix[n] ?? ""] as [number, string]).filter(([k]) => k !== i);
    if (on) pairs.push([i, fix ?? errFix[errIdx.indexOf(i)] ?? (q.segments ?? [])[i] ?? ""]);
    pairs.sort((a, b) => a[0] - b[0]);
    set({ errorIndexes: pairs.map((x) => x[0]), corrections: pairs.map((x) => x[1]), errorIndex: undefined, correction: undefined });
  };
  const twoPart = q.twoPart ?? { partA: { stem: "", options: blankOpts(4) }, partB: { stem: "Which sentence from the passage best supports the answer to Part A?", options: blankOpts(4), multiple: false } };
  const combine = q.combine ?? { sentences: [], connector: null, hint: null, accepted: [] };
  const lineCells = (v: string, prefix: string) => lines(v).map((text, i) => ({ id: `${prefix}${i + 1}`, text }));

  function save() {
    const payload: EditorInput = { ...q, tip: q.tip || null };
    for (const k of ["options", "answer", "answers", "sequence", "segments", "errorIndex", "correction", "pairs", "errorIndexes", "corrections", "noErrorOption", "typeCorrection", "errorKind", "twoPart", "grid", "hotText", "dictation", "combine"] as const) delete payload[k];
    if (optionTypes) payload.options = opts.map((o, i) => ({ ...o, label: "ABCDEFGH"[i], rationale: o.correct ? o.rationale || null : o.rationale ?? "" }));
    if (q.type === "TRUE_FALSE") payload.answer = q.answer ?? true;
    if (q.type === "FILL_BLANK" || q.type === "SHORT_ANSWER") payload.answers = q.answers ?? [];
    if (q.type === "SENTENCE_ORDER" || q.type === "WORD_ORDER") payload.sequence = q.sequence ?? [];
    if (q.type === "ERROR_CORRECTION") {
      const segs = q.segments ?? [];
      Object.assign(payload, { segments: segs, errorIndexes: errIdx, corrections: errIdx.map((i) => errFix[errIdx.indexOf(i)] ?? ""), noErrorOption: Boolean(q.noErrorOption), typeCorrection: Boolean(q.typeCorrection), errorKind: q.errorKind || null });
    }
    if (q.type === "MATCHING") payload.pairs = q.pairs ?? [];
    if (q.type === "TWO_PART") payload.twoPart = twoPart;
    if (q.type === "GRID") payload.grid = q.grid ?? { rows: [], columns: [], answer: {} };
    if (q.type === "DICTATION") payload.dictation = { word: q.dictation?.word ?? "", sentence: q.dictation?.sentence || null };
    if (q.type === "SENTENCE_COMBINE") payload.combine = { sentences: q.combine?.sentences ?? [], connector: q.combine?.connector || null, hint: q.combine?.hint || null, accepted: q.combine?.accepted ?? [] };
    if (q.type === "HOT_TEXT") payload.hotText = { segments: q.hotText?.segments ?? [], correct: q.hotText?.correct ?? [], maxSelect: q.hotText?.maxSelect || (q.hotText?.correct.length ?? 1) || 1 };
    start(async () => {
      if (onSave) {
        const o = await onSave(payload);
        return setMsg(o.error ? { error: o.error } : { ok: o.message ?? "Saved." });
      }
      const r = await saveQuestionWithTypesAction(questionId, payload);
      if (r.error) return setMsg({ error: r.error, duplicateId: r.duplicateId });
      setMsg({ ok: r.message });
      if (!questionId && r.id) router.push(`/admin/questions/${r.id}`);
      else router.refresh();
    });
  }

  return (
    <fieldset disabled={readOnly || pending} className="space-y-4">
      {places.length > 0 && (
        <div className="space-y-3 rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
          <fieldset>
            <legend className="text-sm font-semibold text-slate-700">Where does this question go?</legend>
            <div className="mt-1 flex flex-wrap gap-3 text-sm">
              <label className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 ring-1 ring-slate-200 has-[:checked]:ring-brand-teal"><input type="radio" name="destination" checked={!q.mapNodeCode} onChange={() => set({ mapNodeCode: null, ...(q.skillId ? {} : { skillId: skills[0]?.id ?? "" }) })} /><span aria-hidden="true">📚</span> Question Bank only</label>
              <label className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 ring-1 ring-slate-200 has-[:checked]:ring-brand-teal"><input type="radio" name="destination" checked={Boolean(q.mapNodeCode)} onChange={() => set({ mapNodeCode: q.mapNodeCode || places.find((p) => skills.find((k) => k.id === q.skillId)?.grade === p.grade)?.code || places[0].code })} /><span aria-hidden="true">🧭</span> Curriculum Map (and the Question Bank)</label>
            </div>
          </fieldset>
          {q.mapNodeCode && (
            <div className={label}>Place on the Curriculum Map <span className="font-normal text-slate-500">(Grade → Unit → Text Set → Category → Level)</span>
              {/* an unfinished choice is never saved to the previous place: “?” makes saving ask for a place */}
              <MapPlacePicker places={places} value={q.mapNodeCode === "?" ? null : q.mapNodeCode} mode="place" onChange={(c) => set({ mapNodeCode: c ?? "?" })} className="mt-1" />
            </div>
          )}
          <fieldset>
            <legend className="text-sm font-semibold text-slate-700">Also use for (optional)</legend>
            <div className="mt-1 flex flex-wrap gap-4 text-sm">
              {([["PLACEMENT", "Diagnostic Test (preferred)"], ["MAP_TEST", "MAP test"]] as const).map(([v, l]) => (
                <label key={v} className="flex items-center gap-2"><input type="checkbox" checked={(q.uses ?? []).includes(v)} onChange={(e) => set({ uses: e.target.checked ? [...new Set([...(q.uses ?? []), v])] : (q.uses ?? []).filter((x) => x !== v) })} />{l}</label>
              ))}
            </div>
          </fieldset>
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-3">
        <label className={label}>Skill
          <input type="search" value={skillQ} onChange={(e) => setSkillQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); }} placeholder={t("Search skills…")} aria-label={t("Search skills…")} dir="ltr" autoComplete="off" className={`${field} mb-1`} />
          <select value={q.skillId} onChange={(e) => set({ skillId: e.target.value })} className={field}>{q.mapNodeCode && <option value="">— No skill yet (Unclassified) —</option>}{skills.filter((s) => s.id === q.skillId || skillMatches(s, skillQ)).sort((a, b) => byName(a, b) || a.grade - b.grade).map((s) => <option key={s.id} value={s.id}>G{s.grade} · {s.name}</option>)}</select></label>
        <label className={label}>Type<select value={q.type} onChange={(e) => set({ type: e.target.value as EditorInput["type"] })} className={field}>{TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        <label className={label}>Difficulty<select value={q.level} onChange={(e) => set({ level: Number(e.target.value) })} className={field}>{LEVELS.map((l, i) => <option key={l} value={i + 1}>{i + 1} · {l}</option>)}</select></label>
        <label className={label}>Standard (optional)<input list="standards" value={q.standardCode ?? ""} onChange={(e) => set({ standardCode: e.target.value || null })} placeholder="Skill's standard" className={field} /></label>
        <datalist id="standards">{standards.map((s) => <option key={s} value={s} />)}</datalist>
        <CcssNote className="sm:col-span-2" />
        <label className={label}>Cognitive level (optional)<select value={q.cognitiveLevel ?? ""} onChange={(e) => set({ cognitiveLevel: e.target.value || null })} className={field}><option value="">—</option>{["Remember", "Understand", "Apply", "Analyze", "Evaluate", "Create"].map((c) => <option key={c} value={c}>{c}</option>)}</select></label>
        <label className={label}>MAP Instructional Area<select value={q.mapArea ?? ""} onChange={(e) => set({ mapArea: e.target.value || null })} className={field}><option value="">Automatic (from the standard)</option><optgroup label="MAP Reading">{["Literary Text", "Informational Text", "Vocabulary"].map((a) => <option key={a} value={a}>{a}</option>)}</optgroup><optgroup label="MAP Language Usage">{["Language: Understand, Edit for Grammar, Usage", "Language: Understand, Edit for Mechanics", "Writing: Write, Revise Texts for Purpose and Audience"].map((a) => <option key={a} value={a}>{a}</option>)}</optgroup></select></label>
        <label className={label}>Lexile (optional)<input type="number" min={0} max={2000} value={q.lexile ?? ""} onChange={(e) => set({ lexile: e.target.value === "" ? null : Number(e.target.value) })} placeholder="e.g. 820" className={field} /></label>
        <label className={label}>Expected time (seconds)<input type="number" min={10} max={600} value={q.estimatedSeconds ?? 45} onChange={(e) => set({ estimatedSeconds: Number(e.target.value) })} className={field} /></label>
        <label className="flex items-center gap-2 pt-6 text-sm"><input type="checkbox" checked={!!q.aiDrafted} onChange={(e) => set({ aiDrafted: e.target.checked })} disabled={!!questionId} />Drafted with AI help</label>
      </div>
      {curriculum && !readOnly && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-slate-600">Missing from the list?</span>
          <button type="button" onClick={() => setAdding(adding === "skill" ? null : "skill")} className="rounded-lg px-3 py-1 font-semibold text-brand-navy ring-1 ring-slate-300 hover:bg-slate-50">+ New skill</button>
          <button type="button" onClick={() => setAdding(adding === "standard" ? null : "standard")} className="rounded-lg px-3 py-1 font-semibold text-brand-navy ring-1 ring-slate-300 hover:bg-slate-50">+ New standard</button>
        </div>
      )}
      {curriculum && adding === "skill" && <NewSkillForm grades={curriculum.grades} onCreated={(k) => { setSkills((all) => [...all, k].sort((a, b) => a.grade - b.grade || a.name.localeCompare(b.name))); set({ skillId: k.id }); setAdding(null); }} />}
      {curriculum && adding === "standard" && <NewStandardForm onCreated={(code) => { setStandards((all) => [...new Set([...all, code])].sort()); set({ standardCode: code }); setAdding(null); }} />}
      <h3 className="border-t border-slate-200 pt-4 text-base font-bold text-brand-navy">Passage, image and question</h3>
      <label className={label}>
        Passage / Text (optional)
        <span className="block text-xs font-normal text-slate-500">A story, article or poem shown BEFORE the question. Leave empty for grammar, vocabulary and other standalone questions. Questions with the same text share one passage.</span>
        <textarea style={{ width: "100%" }} value={q.passageText ?? ""} onChange={(e) => set({ passageText: e.target.value })} rows={10} maxLength={20000} placeholder="No passage" className={field} />
      </label>
      <ImageField imageId={q.imageId ?? null} imageAlt={q.imageAlt ?? ""} readOnly={readOnly} onChange={(v) => set(v)} />
      <label className={label}>Question<textarea style={{ width: "100%" }} value={q.stem} onChange={(e) => set({ stem: e.target.value })} rows={5} maxLength={2000} className={field} /></label>
      {possibleMissingPassage(q.stem, Boolean((q.passageText ?? "").trim() || (q.passageText === undefined && q.passageId))) && (
        <p role="status" className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">⚠ This question mentions a passage, story or paragraph, but there is no passage. Add the text above, or reword the question. (A warning only: you can still save.)</p>
      )}

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
      {q.type === "SHORT_ANSWER" && <label className={label}>Model answer (teacher-scored; one per line)<textarea style={{ width: "100%" }} rows={5} value={(q.answers ?? []).join("\n")} onChange={(e) => set({ answers: lines(e.target.value) })} className={field} /></label>}
      {q.type === "FILL_BLANK" && <label className={label}>Accepted answers (one per line)<textarea style={{ width: "100%" }} rows={5} value={(q.answers ?? []).join("\n")} onChange={(e) => set({ answers: lines(e.target.value) })} className={field} /></label>}
      {(q.type === "SENTENCE_ORDER" || q.type === "WORD_ORDER") && <label className={label}>Items in the CORRECT order (one per line; students see them shuffled)<textarea style={{ width: "100%" }} rows={5} value={(q.sequence ?? []).join("\n")} onChange={(e) => set({ sequence: lines(e.target.value) })} className={field} /></label>}
      {q.type === "ERROR_CORRECTION" && (
        <div className="space-y-3">
          <label className={label}>Sentence parts (one per line)<textarea style={{ width: "100%" }} rows={4} value={(q.segments ?? []).join("\n")} onChange={(e) => set({ segments: lines(e.target.value) })} className={field} /></label>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-slate-700">Tick every part with a mistake and write it correctly (accepted variants separated by |). Tick none for a “No error” item.</legend>
            {(q.segments ?? []).map((seg, i) => (
              <div key={i} className="grid items-center gap-2 sm:grid-cols-[auto_1fr_1fr]">
                <input type="checkbox" checked={errIdx.includes(i)} onChange={(e) => setErr(i, e.target.checked)} aria-label={`Part ${i + 1} has a mistake`} />
                <span className="text-sm">{i + 1}: {seg}</span>
                {errIdx.includes(i) && <input value={errFix[errIdx.indexOf(i)] ?? ""} onChange={(e) => setErr(i, true, e.target.value)} placeholder="Correct part" aria-label={`Correction of part ${i + 1}`} className={field} />}
              </div>
            ))}
          </fieldset>
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2"><input type="checkbox" checked={Boolean(q.noErrorOption)} onChange={(e) => set({ noErrorOption: e.target.checked })} />Show a “No error” choice</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={Boolean(q.typeCorrection)} onChange={(e) => set({ typeCorrection: e.target.checked })} />Student types the correction (tap = half credit, right fix = full)</label>
            <label className="flex items-center gap-2">Kind of mistake<select value={q.errorKind ?? ""} onChange={(e) => set({ errorKind: e.target.value || null })} className={field}><option value="">—</option>{ERROR_KINDS.map((m) => <option key={m.code} value={m.code}>{m.label}</option>)}</select></label>
          </div>
        </div>
      )}
      {q.type === "TWO_PART" && (
        <div className="space-y-4">
          <p className="text-sm text-slate-600">Part A asks the question; Part B asks for the evidence (usually sentences from the passage). Each part is worth half. A right Part A with wrong evidence is recorded as “right answer, wrong evidence”.</p>
          {(["partA", "partB"] as const).map((k) => (
            <PartEditor key={k} name={k === "partA" ? "Part A" : "Part B"} part={twoPart[k]} allowMultiple={k === "partB"}
              onChange={(p) => set({ twoPart: { ...twoPart, [k]: p } as EditorInput["twoPart"] })} />
          ))}
        </div>
      )}
      {q.type === "GRID" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={label}>Columns (one per line, at least 2)<textarea style={{ width: "100%" }} rows={3} value={(q.grid?.columns ?? []).map((c) => c.text).join("\n")} onChange={(e) => set({ grid: { rows: q.grid?.rows ?? [], answer: q.grid?.answer ?? {}, columns: lineCells(e.target.value, "c") } })} className={field} /></label>
          <label className={label}>Rows (one per line)<textarea style={{ width: "100%" }} rows={4} value={(q.grid?.rows ?? []).map((r) => r.text).join("\n")} onChange={(e) => set({ grid: { columns: q.grid?.columns ?? [], answer: q.grid?.answer ?? {}, rows: lineCells(e.target.value, "r") } })} className={field} /></label>
          <fieldset className="space-y-2 sm:col-span-2">
            <legend className="text-sm font-medium text-slate-700">Correct column for each row</legend>
            {(q.grid?.rows ?? []).map((r) => (
              <label key={r.id} className="grid items-center gap-2 text-sm sm:grid-cols-[1fr_1fr]">{r.text}
                <select value={q.grid?.answer[r.id] ?? ""} onChange={(e) => set({ grid: { ...q.grid!, answer: { ...q.grid!.answer, [r.id]: e.target.value } } })} className={field}>
                  <option value="">choose…</option>{(q.grid?.columns ?? []).map((c) => <option key={c.id} value={c.id}>{c.text}</option>)}
                </select>
              </label>
            ))}
          </fieldset>
        </div>
      )}
      {q.type === "HOT_TEXT" && (
        <div className="space-y-3">
          <label className={label}>Sentences of the excerpt (one per line; students tap them)<textarea style={{ width: "100%" }} rows={5} value={(q.hotText?.segments ?? []).map((x) => x.text).join("\n")} onChange={(e) => { const segments = lineCells(e.target.value, "s"); set({ hotText: { segments, correct: (q.hotText?.correct ?? []).filter((c) => segments.some((x) => x.id === c)), maxSelect: q.hotText?.maxSelect ?? 1 } }); }} className={field} /></label>
          <fieldset className="space-y-1">
            <legend className="text-sm font-medium text-slate-700">Tick the correct sentence(s)</legend>
            {(q.hotText?.segments ?? []).map((x) => (
              <label key={x.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={(q.hotText?.correct ?? []).includes(x.id)} onChange={(e) => { const correct = e.target.checked ? [...(q.hotText?.correct ?? []), x.id] : (q.hotText?.correct ?? []).filter((c) => c !== x.id); set({ hotText: { ...q.hotText!, correct, maxSelect: Math.max(q.hotText?.maxSelect ?? 1, correct.length) } }); }} />{x.text}</label>
            ))}
          </fieldset>
          <label className={label}>How many sentences may the student select?<input type="number" min={1} max={20} value={q.hotText?.maxSelect ?? 1} onChange={(e) => set({ hotText: { segments: q.hotText?.segments ?? [], correct: q.hotText?.correct ?? [], maxSelect: Number(e.target.value) } })} className={field} /></label>
        </div>
      )}
      {q.type === "DICTATION" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={label}>Word to say (students type it)<input value={q.dictation?.word ?? ""} maxLength={40} onChange={(e) => set({ dictation: { word: e.target.value, sentence: q.dictation?.sentence ?? null } })} className={field} /></label>
          <label className={label}>Sentence that uses the word (optional, said after the word)<input value={q.dictation?.sentence ?? ""} maxLength={300} onChange={(e) => set({ dictation: { word: q.dictation?.word ?? "", sentence: e.target.value || null } })} className={field} /></label>
          <p className="text-xs text-slate-500 sm:col-span-2">The browser says the word aloud (no recording needed). Spelling is checked exactly (capital letters do not matter); a wrong spelling is matched to the pattern that was missed.</p>
        </div>
      )}
      {q.type === "SENTENCE_COMBINE" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={label}>Short sentences to join (one per line, 2–4)<textarea style={{ width: "100%" }} rows={4} value={(combine.sentences ?? []).join("\n")} onChange={(e) => set({ combine: { ...combine, sentences: lines(e.target.value) } })} className={field} /></label>
          <label className={label}>Accepted combined sentences (one per line; the first is the model answer)<textarea style={{ width: "100%" }} rows={4} value={(combine.accepted ?? []).join("\n")} onChange={(e) => set({ combine: { ...combine, accepted: lines(e.target.value) } })} className={field} /></label>
          <label className={label}>Joining word students must use (optional)<input value={combine.connector ?? ""} maxLength={30} placeholder="e.g. because, but, who" onChange={(e) => set({ combine: { ...combine, connector: e.target.value || null } })} className={field} /></label>
          <label className={label}>Hint (optional, before answering)<input value={combine.hint ?? ""} maxLength={300} onChange={(e) => set({ combine: { ...combine, hint: e.target.value || null } })} className={field} /></label>
          <p className="text-xs text-slate-500 sm:col-span-2">Students type one sentence. Case, spaces, contractions (didn&apos;t = did not) and the end mark do not matter; commas do. After a wrong answer students get guidance first, then the model answer.</p>
        </div>
      )}
      {q.type === "MATCHING" && <label className={label}>Pairs (one per line: left = right; at least 3)<textarea style={{ width: "100%" }} rows={4} value={(q.pairs ?? []).map((p) => `${p.left} = ${p.right}`).join("\n")} onChange={(e) => set({ pairs: lines(e.target.value).map((l) => { const [left, ...r] = l.split("="); return { left: left.trim(), right: r.join("=").trim() }; }) })} className={field} /></label>}

      <h3 className="border-t border-slate-200 pt-4 text-base font-bold text-brand-navy">Feedback for the Student</h3>
      <div className="grid gap-3">
        <label className={label}>Why the answer is correct (shown after answering)<textarea style={{ width: "100%" }} rows={4} value={q.whyCorrect} onChange={(e) => set({ whyCorrect: e.target.value })} maxLength={1000} className={field} /></label>
        <label className={label}>Tip (optional)<textarea style={{ width: "100%" }} rows={3} value={q.tip ?? ""} onChange={(e) => set({ tip: e.target.value })} maxLength={500} className={field} /></label>
        <label className={label}>Hint (optional, before answering)<input value={q.hint ?? ""} onChange={(e) => set({ hint: e.target.value || null })} maxLength={500} className={field} /></label>
      </div>
      {!readOnly && (
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={save} className="rounded-xl bg-brand-navy px-5 py-2.5 font-semibold text-white hover:bg-brand-purple">{pending ? "Saving…" : questionId ? "Save changes" : "Create draft"}</button>
          {msg.ok && <span role="status" className="text-sm text-brand-teal">{msg.ok}</span>}
          {msg.error && <span role="alert" className="rounded-lg bg-red-50 px-3 py-1.5 text-sm text-red-700">{t(msg.error)}{msg.duplicateId && <> <Link href={`/admin/questions/${msg.duplicateId}`} className="font-semibold underline">{t("Open the existing question")}</Link></>}</span>}
        </div>
      )}
    </fieldset>
  );
}


/** One part (A or B) of a two-part item: its question and options (tick the correct one(s)). */
function PartEditor({ name, part, allowMultiple, onChange }: { name: string; part: { stem: string; options: Opt[]; multiple?: boolean }; allowMultiple: boolean; onChange: (p: { stem: string; options: Opt[]; multiple?: boolean }) => void }) {
  const multi = allowMultiple && Boolean(part.multiple);
  const setOpt = (i: number, patch: Partial<Opt>) => onChange({ ...part, options: part.options.map((o, j) => (j === i ? { ...o, ...patch } : !multi && patch.correct ? { ...o, correct: false } : o)) });
  return (
    <fieldset className="space-y-2 rounded-xl p-3 ring-1 ring-slate-200">
      <legend className="px-1 text-sm font-bold text-brand-navy">{name}</legend>
      <label className={label}>Question<input value={part.stem} onChange={(e) => onChange({ ...part, stem: e.target.value })} maxLength={1000} className={field} /></label>
      {allowMultiple && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={multi} onChange={(e) => onChange({ ...part, multiple: e.target.checked })} />Students choose more than one (e.g. “Which TWO sentences…”)</label>}
      {part.options.map((o, i) => (
        <div key={i} className="grid items-start gap-2 sm:grid-cols-[auto_1fr_1fr_auto]">
          <input type={multi ? "checkbox" : "radio"} name={`correct-${name}`} checked={o.correct} onChange={(e) => setOpt(i, { correct: e.target.checked })} aria-label={`${name} option ${"ABCDEFGH"[i]} is correct`} className="mt-3" />
          <input value={o.text} onChange={(e) => setOpt(i, { text: e.target.value })} placeholder={`Option ${"ABCDEFGH"[i]}`} className={field} />
          <input value={o.rationale ?? ""} onChange={(e) => setOpt(i, { rationale: e.target.value })} placeholder={o.correct ? "(correct answer)" : "Why is this wrong? (optional)"} disabled={o.correct} className={field} />
          <button type="button" onClick={() => onChange({ ...part, options: part.options.filter((_, j) => j !== i).map((x, j) => ({ ...x, label: "ABCDEFGH"[j] })) })} disabled={part.options.length <= 2} className="mt-2 text-sm text-red-700">Remove</button>
        </div>
      ))}
      {part.options.length < 6 && <button type="button" onClick={() => onChange({ ...part, options: [...part.options, { label: "ABCDEFGH"[part.options.length], text: "", correct: false, rationale: "" }] })} className="text-sm text-brand-teal">+ Add option</button>}
    </fieldset>
  );
}

const DOMAINS = ["READING", "VOCABULARY", "GRAMMAR", "LANGUAGE", "WRITING", "WORD_STUDY"];
const CATEGORIES = ["COMPREHENSION", "LITERATURE", "INFORMATIONAL", "VOCABULARY", "WORD_STUDY", "GRAMMAR", "MECHANICS", "PHONICS_WORD_STUDY", "WRITING"];
const nice = (v: string) => v.charAt(0) + v.slice(1).toLowerCase().replace(/_/g, " ");

/** Creates a skill in the curriculum without leaving the question (admins). It is selected at once. */
function NewSkillForm({ grades, onCreated }: { grades: { id: string; level: number }[]; onCreated: (k: Skill) => void }) {
  const [name, setName] = useState(""); const [gradeId, setGradeId] = useState(grades[0]?.id ?? "");
  const [domain, setDomain] = useState("READING"); const [category, setCategory] = useState("COMPREHENSION");
  const [confirm, setConfirm] = useState(false); const [error, setError] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  async function create() {
    setBusy(true); setError(null);
    const f = new FormData();
    f.set("gradeId", gradeId); f.set("name", name); f.set("domain", domain); f.set("category", category); if (confirm) f.set("confirmDuplicate", "on");
    const r = await createSkillAction({}, f);
    setBusy(false);
    if (r.error || !r.id) return setError(r.error ?? "The skill could not be created.");
    onCreated({ id: r.id, name: name.trim(), grade: grades.find((g) => g.id === gradeId)?.level ?? 0 });
  }
  const box = "rounded-lg border border-slate-300 px-3 py-2";
  return (
    <div className="space-y-2 rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
      <p className="font-semibold text-brand-navy">New skill</p>
      <div className="flex flex-wrap gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Skill name, e.g. Main Idea" aria-label="Skill name" maxLength={191} className={`${box} min-w-[16rem] flex-1`} />
        <select value={gradeId} onChange={(e) => setGradeId(e.target.value)} aria-label="Grade" className={box}>{grades.map((g) => <option key={g.id} value={g.id}>Grade {g.level}</option>)}</select>
        <select value={domain} onChange={(e) => setDomain(e.target.value)} aria-label="Domain" className={box}>{DOMAINS.map((d) => <option key={d} value={d}>{nice(d)}</option>)}</select>
        <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category" className={box}>{CATEGORIES.map((c) => <option key={c} value={c}>{nice(c)}</option>)}</select>
      </div>
      <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} />Create anyway if a skill with the same name exists</label>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <button type="button" disabled={busy || !name.trim()} onClick={() => void create()} className="rounded-lg bg-brand-navy px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Creating…" : "Create skill"}</button>
    </div>
  );
}

/** Creates a standard without leaving the question (admins). It is filled in at once. */
function NewStandardForm({ onCreated }: { onCreated: (code: string) => void }) {
  const [code, setCode] = useState(""); const [description, setDescription] = useState(""); const [framework, setFramework] = useState("CCSS_ELA");
  const [grade, setGrade] = useState(""); const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  async function create() {
    setBusy(true); setError(null);
    const f = new FormData();
    f.set("framework", framework); f.set("code", code); f.set("description", description); f.set("gradeLevel", grade); if (confirm) f.set("confirmDuplicate", "on");
    const r = await createStandardAction({}, f);
    setBusy(false);
    if (r.error) return setError(r.error);
    onCreated(code.replace(/\s+/g, ""));
  }
  const box = "rounded-lg border border-slate-300 px-3 py-2";
  return (
    <div className="space-y-2 rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
      <p className="font-semibold text-brand-navy">New standard</p>
      <div className="flex flex-wrap gap-2">
        <select value={framework} onChange={(e) => setFramework(e.target.value)} aria-label="Framework" className={box}>
          <option value="CCSS_ELA">CCSS ELA</option><option value="SCHOOL_OBJECTIVE">School objective</option><option value="MAP_CONTINUUM">MAP continuum</option><option value="CURRICULUM_MAP">Curriculum map</option>
        </select>
        <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Code, e.g. RL.4.2" aria-label="Standard code" maxLength={120} className={box} />
        <input value={grade} onChange={(e) => setGrade(e.target.value)} type="number" min={0} max={12} placeholder="Grade" aria-label="Grade" className={`${box} w-24`} />
      </div>
      <textarea style={{ width: "100%" }} value={description} onChange={(e) => setDescription(e.target.value)} rows={2} maxLength={2000} placeholder="What the standard says (optional)" aria-label="Description" className={box} />
      <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} />Create anyway if the same code exists in another framework</label>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <button type="button" disabled={busy || !code.trim()} onClick={() => void create()} className="rounded-lg bg-brand-navy px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Creating…" : "Create standard"}</button>
    </div>
  );
}
