"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/i18n/client";
import { saveQuestionAction } from "@/app/teacher/nafs/actions";
import { Combo } from "@/components/ui/combo";

export interface QuestionInitial { id: string; own: boolean; draft: boolean; nafsCode: string; process: string; standard: string; kind: "MCQ" | "WRITTEN"; stem: string; options: string[]; correct: number; explanation: string; model: string; rubric: string[]; passageTitle: string; passageText: string; textType: "LIT" | "INFO" | null; difficulty?: number }
const INPUT = "min-h-11 w-full rounded-xl bg-surface px-3 py-2 text-ink ring-1 ring-line focus:outline-none focus:ring-2 focus:ring-teal-500";
const RUBRIC = ["2 = a complete, correct answer that fits the text", "1 = a partly correct or incomplete answer", "0 = no answer, or an answer that does not fit"];

/**
 * 🇸🇦 The NAFS question editor: Ministry standard, NAFS skill + process, optional passage (literary / informational),
 * then either multiple choice A–D (with the official option styles "All of the above", "A and B", "None of the above"
 * one tap away) or a short written answer (model answer + rubric 2 / 1 / 0, scored by the teacher — never automatically).
 */
export function NafsQuestionForm({ initial, skills, processes, standards, styles }: { initial: QuestionInitial | null; skills: { code: string; name: string; process: string }[]; processes: { code: string; name: string }[]; standards: { code: string; short: string; text: string }[]; styles: readonly string[] }) {
  const t = useT();
  const router = useRouter();
  const [busy, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState(initial?.nafsCode ?? skills[0].code);
  const [process, setProcess] = useState(initial?.process ?? "");
  const [standard, setStandard] = useState(initial?.standard ?? "");
  const [kind, setKind] = useState<"MCQ" | "WRITTEN">(initial?.kind ?? "MCQ");
  const [withPassage, setWithPassage] = useState(Boolean(initial?.passageText));
  const [title, setTitle] = useState(initial?.passageTitle ?? "");
  const [text, setText] = useState(initial?.passageText ?? "");
  const [ptype, setPtype] = useState<"LIT" | "INFO" | "">(initial?.textType ?? "");
  const [stem, setStem] = useState(initial?.stem ?? "");
  const [options, setOptions] = useState<string[]>(initial?.options?.length ? initial.options : ["", "", "", ""]);
  const [correct, setCorrect] = useState(Math.max(0, initial?.correct ?? 0));
  const [why, setWhy] = useState(initial?.explanation ?? "");
  const [model, setModel] = useState(initial?.model ?? "");
  const [rubric, setRubric] = useState<string[]>(initial?.rubric?.length === 3 ? initial.rubric : RUBRIC);
  const [difficulty, setDifficulty] = useState<number>(initial?.difficulty ?? 2);
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;

  const save = () => start(async () => {
    setError(null);
    const r = await saveQuestionAction({ id: initial?.id ?? null, nafsCode: code, process: process || null, standard: standard || null, kind, stem, options: kind === "MCQ" ? options : [], correct: kind === "MCQ" ? correct : -1, explanation: why, model: kind === "WRITTEN" ? model : null, rubric: kind === "WRITTEN" ? rubric : null, passageTitle: withPassage ? title : null, passageText: withPassage ? text : null, textType: withPassage && ptype ? ptype : null, difficulty });
    if (r.error) { setError(r.error); return; }
    router.push(`/teacher/nafs?tab=bank&view=${encodeURIComponent(r.ok!.id)}&msg=${encodeURIComponent(t(r.ok!.copied ? "Saved as the school's copy. The original is unchanged." : "Saved."))}`);
  });
  // the official styles go in the last free option (D first)
  const putStyle = (st: string) => { const at = [3, 2, 1, 0].find((i) => !options[i].trim()) ?? 3; setOptions(options.map((x, k) => (k === at ? st : x))); };

  return (
    <form onSubmit={(e) => { e.preventDefault(); save(); }} className="grid max-w-3xl gap-4">
      <section className="grid gap-3 rounded-2xl bg-surface p-5 shadow-card ring-1 ring-line sm:grid-cols-2">
        <div className="grid gap-1 text-sm font-semibold text-ink-2 sm:col-span-2"><span>{t("Ministry standard")}</span>
          <Combo label={t("Ministry standard")} value={standard} onChange={setStandard} options={[{ value: "", label: t("Automatic (from the skill, when it is sure)") }, ...standards.map((x) => ({ value: x.code, label: `${x.short} — ${t(x.text)}` }))]} />
        </div>
        <div className="grid gap-1 text-sm font-semibold text-ink-2"><span>{t("NAFS skill")}</span>
          <Combo label={t("NAFS skill")} value={code} onChange={setCode} options={skills.map((k) => ({ value: k.code, label: t(k.name) }))} />
        </div>
        <label className="grid gap-1 text-sm font-semibold text-ink-2">{t("Reading process")}
          <select value={process} onChange={(e) => setProcess(e.target.value)} className={INPUT}>
            <option value="">{t("The skill's usual process")} ({skills.find((k) => k.code === code)?.process})</option>
            {processes.map((p) => <option key={p.code} value={p.code}>{p.code} — {t(p.name)}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-sm font-semibold text-ink-2">{t("Difficulty")}
          <select value={difficulty} onChange={(e) => setDifficulty(Number(e.target.value))} className={INPUT}>
            <option value={1}>{t("Easy")}</option><option value={2}>{t("Medium")}</option><option value={3}>{t("Hard")}</option>
          </select>
        </label>
        <fieldset className="flex flex-wrap gap-2 sm:col-span-2">
          <legend className="mb-1 text-sm font-semibold text-ink-2">{t("Type")}</legend>
          {(["MCQ", "WRITTEN"] as const).map((k) => (
            <label key={k} className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-xl px-4 ring-1 ${kind === k ? "bg-brand-navy text-white ring-brand-navy" : "bg-surface text-ink ring-line"}`}>
              <input type="radio" name="kind" checked={kind === k} onChange={() => setKind(k)} className="sr-only" />{t(k === "MCQ" ? "Multiple choice A–D" : "Short written answer")}
            </label>
          ))}
        </fieldset>
      </section>
      <section className="grid gap-3 rounded-2xl bg-surface p-5 shadow-card ring-1 ring-line">
        <label className="flex items-center gap-2 font-semibold text-ink"><input type="checkbox" checked={withPassage} onChange={(e) => setWithPassage(e.target.checked)} className="h-5 w-5" /> {t("With a passage")}</label>
        {withPassage && <>
          <div className="grid gap-3 sm:grid-cols-[1fr_12rem]">
            <label className="grid gap-1 text-sm font-semibold text-ink-2">{t("Passage title")}<input value={title} onChange={(e) => setTitle(e.target.value)} className={INPUT} lang="en" dir="ltr" /></label>
            <label className="grid gap-1 text-sm font-semibold text-ink-2">{t("Kind of text")}
              <select value={ptype} onChange={(e) => setPtype(e.target.value as "LIT" | "INFO" | "")} className={INPUT}><option value="">—</option><option value="LIT">{t("Literary")}</option><option value="INFO">{t("Informational")}</option></select>
            </label>
          </div>
          <label className="grid gap-1 text-sm font-semibold text-ink-2">{t("Passage (paragraphs separated by an empty line)")}
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={10} className={`${INPUT} leading-relaxed`} lang="en" dir="ltr" />
          </label>
          <p className="text-xs text-muted">{t("{n} words", { n: words })} · {t("NAFS passages are usually 250–450 words. Original text only.")}</p>
        </>}
      </section>
      <section className="grid gap-3 rounded-2xl bg-surface p-5 shadow-card ring-1 ring-line">
        <label className="grid gap-1 text-sm font-semibold text-ink-2">{t("Question")}<textarea value={stem} onChange={(e) => setStem(e.target.value)} rows={2} className={INPUT} lang="en" dir="ltr" required /></label>
        {kind === "MCQ" ? (
          <>
            <fieldset className="grid gap-2">
              <legend className="text-sm font-semibold text-ink-2">{t("Options A–D (choose the correct one)")}</legend>
              {options.map((o, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input type="radio" name="correct" checked={correct === i} onChange={() => setCorrect(i)} className="h-5 w-5" aria-label={t("Correct answer: {x}", { x: "ABCD"[i] })} />
                  <b className="w-5 text-ink">{"ABCD"[i]}</b>
                  <input value={o} onChange={(e) => setOptions(options.map((x, k) => (k === i ? e.target.value : x)))} className={INPUT} lang="en" dir="ltr" required />
                </div>
              ))}
            </fieldset>
            <div className="flex flex-wrap items-center gap-1.5 text-sm">
              <span className="text-ink-2">{t("Official option styles")}:</span>
              {styles.map((st) => <button key={st} type="button" onClick={() => putStyle(st)} className="min-h-9 rounded-full bg-surface-2 px-3 text-ink ring-1 ring-line" lang="en" dir="ltr">{st}</button>)}
            </div>
            <label className="grid gap-1 text-sm font-semibold text-ink-2">{t("Why the answer is correct (optional; shown to you only)")}<input value={why} onChange={(e) => setWhy(e.target.value)} className={INPUT} lang="en" dir="ltr" /></label>
          </>
        ) : (
          <>
            <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-200">{t("Short written answers are never scored automatically: you score each one with the rubric in the Marking tab.")}</p>
            <label className="grid gap-1 text-sm font-semibold text-ink-2">{t("Model answer")}<textarea value={model} onChange={(e) => setModel(e.target.value)} rows={2} className={INPUT} lang="en" dir="ltr" required /></label>
            <fieldset className="grid gap-2">
              <legend className="text-sm font-semibold text-ink-2">{t("Rubric (2 / 1 / 0)")}</legend>
              {rubric.map((r, i) => <input key={i} value={r} onChange={(e) => setRubric(rubric.map((x, k) => (k === i ? e.target.value : x)))} className={INPUT} lang="en" dir="ltr" aria-label={t("Rubric line {n}", { n: 2 - i })} />)}
            </fieldset>
          </>
        )}
      </section>
      {error && <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-rose-900 ring-1 ring-rose-200">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button disabled={busy} className="min-h-12 rounded-xl bg-brand-navy px-6 font-semibold text-white disabled:opacity-50">{busy ? t("Saving…") : t(initial && !initial.own ? "Save as the school's copy" : "Save")}</button>
        <button type="button" onClick={() => router.back()} className="min-h-12 rounded-xl px-5 font-semibold text-ink-2 ring-1 ring-line">{t("Cancel")}</button>
      </div>
    </form>
  );
}
