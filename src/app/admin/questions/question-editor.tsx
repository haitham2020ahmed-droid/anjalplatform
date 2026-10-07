"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { EditorInput } from "@/server/admin/questions";
import { field, label } from "@/components/admin/styles";
import { saveQuestionAction } from "../actions";
import { possibleMissingPassage } from "@/lib/passage-detect";
import { ImageField } from "./image-field";
import { createSkillAction, createStandardAction } from "../curriculum/manage-actions";

type Skill = { id: string; grade: number; name: string };
const TYPES: [string, string][] = [
  ["MULTIPLE_CHOICE", "Multiple choice"], ["MULTI_SELECT", "Multiple select"], ["DROPDOWN", "Dropdown"], ["TRUE_FALSE", "True / false"],
  ["FILL_BLANK", "Fill in the blank"], ["SENTENCE_ORDER", "Sentence order"], ["WORD_ORDER", "Word order"], ["ERROR_CORRECTION", "Error correction"], ["MATCHING", "Matching"],
  ["SHORT_ANSWER", "Short answer (teacher-scored)"],
];
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
  const [standards, setStandards] = useState<string[]>(standardsIn);
  const [adding, setAdding] = useState<"skill" | "standard" | null>(null);
  const [q, setQ] = useState<EditorInput>(initial ?? {
    ...(initialPlace ? { mapNodeCode: initialPlace } : {}),
    skillId: initialPlace ? "" : skillsIn[0]?.id ?? "", type: "MULTIPLE_CHOICE", stem: "", level: 4, whyCorrect: "", tip: "",
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
    if (q.type === "FILL_BLANK" || q.type === "SHORT_ANSWER") payload.answers = q.answers ?? [];
    if (q.type === "SENTENCE_ORDER" || q.type === "WORD_ORDER") payload.sequence = q.sequence ?? [];
    if (q.type === "ERROR_CORRECTION") Object.assign(payload, { segments: q.segments ?? [], errorIndex: q.errorIndex ?? 0, correction: q.correction ?? "" });
    if (q.type === "MATCHING") payload.pairs = q.pairs ?? [];
    start(async () => {
      if (onSave) {
        const o = await onSave(payload);
        return setMsg(o.error ? { error: o.error } : { ok: o.message ?? "Saved." });
      }
      const r = await saveQuestionAction(questionId, payload);
      if (r.error) return setMsg({ error: r.error });
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
            <label className={label}>Place on the Curriculum Map
              <select value={q.mapNodeCode} onChange={(e) => set({ mapNodeCode: e.target.value })} className={field}>
                {[...new Set(places.map((p) => `${p.grade}|${p.unit}`))].map((gu) => {
                  const [g, u] = gu.split("|").map(Number);
                  return <optgroup key={gu} label={`Grade ${g} · Unit ${u}`}>{places.filter((p) => p.grade === g && p.unit === u).map((p) => <option key={p.code} value={p.code}>{p.path.split(" › ").slice(2).join(" › ")}</option>)}</optgroup>;
                })}
              </select>
            </label>
          )}
          <fieldset>
            <legend className="text-sm font-semibold text-slate-700">Also use for (optional)</legend>
            <div className="mt-1 flex flex-wrap gap-4 text-sm">
              {([["PLACEMENT", "Placement test"], ["MAP_TEST", "MAP test"]] as const).map(([v, l]) => (
                <label key={v} className="flex items-center gap-2"><input type="checkbox" checked={(q.uses ?? []).includes(v)} onChange={(e) => set({ uses: e.target.checked ? [...new Set([...(q.uses ?? []), v])] : (q.uses ?? []).filter((x) => x !== v) })} />{l}</label>
              ))}
            </div>
          </fieldset>
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-3">
        <label className={label}>Skill<select value={q.skillId} onChange={(e) => set({ skillId: e.target.value })} className={field}>{q.mapNodeCode && <option value="">— No skill yet (Unclassified) —</option>}{skills.map((s) => <option key={s.id} value={s.id}>G{s.grade} · {s.name}</option>)}</select></label>
        <label className={label}>Type<select value={q.type} onChange={(e) => set({ type: e.target.value as EditorInput["type"] })} className={field}>{TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        <label className={label}>Difficulty<select value={q.level} onChange={(e) => set({ level: Number(e.target.value) })} className={field}>{LEVELS.map((l, i) => <option key={l} value={i + 1}>{i + 1} · {l}</option>)}</select></label>
        <label className={label}>Standard (optional)<input list="standards" value={q.standardCode ?? ""} onChange={(e) => set({ standardCode: e.target.value || null })} placeholder="Skill's standard" className={field} /></label>
        <datalist id="standards">{standards.map((s) => <option key={s} value={s} />)}</datalist>
        <label className={label}>Cognitive level (optional)<select value={q.cognitiveLevel ?? ""} onChange={(e) => set({ cognitiveLevel: e.target.value || null })} className={field}><option value="">—</option>{["Remember", "Understand", "Apply", "Analyze", "Evaluate", "Create"].map((c) => <option key={c} value={c}>{c}</option>)}</select></label>
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
        <div className="grid gap-3 sm:grid-cols-3">
          <label className={`${label} sm:col-span-3`}>Sentence parts (one per line; one part contains the mistake)<textarea style={{ width: "100%" }} rows={4} value={(q.segments ?? []).join("\n")} onChange={(e) => set({ segments: lines(e.target.value) })} className={field} /></label>
          <label className={label}>Part with the mistake<select value={q.errorIndex ?? 0} onChange={(e) => set({ errorIndex: Number(e.target.value) })} className={field}>{(q.segments ?? []).map((s, i) => <option key={i} value={i}>{i + 1}: {s}</option>)}</select></label>
          <label className={label}>Correction<input value={q.correction ?? ""} onChange={(e) => set({ correction: e.target.value })} className={field} /></label>
        </div>
      )}
      {q.type === "MATCHING" && <label className={label}>Pairs (one per line: left = right; at least 3)<textarea style={{ width: "100%" }} rows={4} value={(q.pairs ?? []).map((p) => `${p.left} = ${p.right}`).join("\n")} onChange={(e) => set({ pairs: lines(e.target.value).map((l) => { const [left, ...r] = l.split("="); return { left: left.trim(), right: r.join("=").trim() }; }) })} className={field} /></label>}

      <h3 className="border-t border-slate-200 pt-4 text-base font-bold text-brand-navy">Feedback for the student</h3>
      <div className="grid gap-3">
        <label className={label}>Why the answer is correct (shown after answering)<textarea style={{ width: "100%" }} rows={4} value={q.whyCorrect} onChange={(e) => set({ whyCorrect: e.target.value })} maxLength={1000} className={field} /></label>
        <label className={label}>Tip (optional)<textarea style={{ width: "100%" }} rows={3} value={q.tip ?? ""} onChange={(e) => set({ tip: e.target.value })} maxLength={500} className={field} /></label>
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
