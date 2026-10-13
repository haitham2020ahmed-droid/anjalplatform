"use client";
/**
 * ✏️ Edit a question of a test (Assessments → New test → selected list → Edit): the question text, the answer choices
 * and the right answer (true / false, accepted answers). Saving makes the teacher's OWN COPY of the question
 * (src/server/tests/review.ts editQuestionCopy) and puts it in the test in the same place — the shared original is
 * never changed or deleted.
 */
import { useEffect, useState } from "react";
import { useT } from "@/i18n/client";
import { questionDetailAction } from "@/server/tests/question-detail-actions";
import type { QuestionDetail } from "@/server/tests/question-detail";
import type { MapSourceQuestion } from "@/server/tests/map-source";
import { editCopyAction } from "@/app/teacher/assessments/actions";

const OPTION_TYPES = new Set(["MULTIPLE_CHOICE", "MULTI_SELECT", "DROPDOWN"]);
const box = "mt-1 block w-full rounded-xl px-3 py-2 ring-1 ring-slate-300";

export function QuestionCopyEditor({ questionId, onSaved, onClose }: { questionId: string; onSaved: (row: MapSourceQuestion) => void; onClose: () => void }) {
  const t = useT();
  const [d, setD] = useState<QuestionDetail | null>(null);
  const [stem, setStem] = useState("");
  const [opts, setOpts] = useState<{ label: string; text: string; correct: boolean }[]>([]);
  const [tf, setTf] = useState<boolean | null>(null);
  const [answers, setAnswers] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void questionDetailAction(questionId).then((r) => {
      if (!live) return;
      if (r.error) return setError(t(r.error));
      const q = r.detail!;
      setD(q); setStem(q.stem);
      setOpts((q.options ?? []).map((o) => ({ label: o.label, text: o.text, correct: o.correct })));
      setTf(q.trueFalse); setAnswers((q.answers ?? []).join("\n"));
    });
    return () => { live = false; };
  }, [questionId, t]);
  const multi = d?.type === "MULTI_SELECT";
  async function save() {
    if (!d) return;
    setBusy(true); setError(null);
    const r = await editCopyAction({
      questionId, stem,
      options: OPTION_TYPES.has(d.type) && opts.length ? opts : null,
      answer: d.type === "TRUE_FALSE" && tf !== null ? tf : null,
      answers: d.type === "FILL_BLANK" ? answers.split("\n") : null,
    });
    setBusy(false);
    if (r.error) return setError(t(r.error));
    onSaved(r.row!);
  }
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/50 p-4" role="dialog" aria-modal="true" aria-labelledby="copy-h">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl">
        <h2 id="copy-h" className="text-xl font-semibold text-brand-navy">✏️ {t("Edit this question (your copy)")}</h2>
        <p className="mt-1 text-sm text-slate-600">{t("Your changes are saved as your own copy, used in this test. The original question in the shared bank does not change.")}</p>
        {!d && !error && <p className="mt-4 text-slate-500" aria-busy="true">{t("Loading questions…")}</p>}
        {d && (
          <div className="mt-4 grid gap-4">
            {d.passage && <p className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-600">📖 <span lang="en" data-content>{d.passage.title ?? t("Passage")}</span></p>}
            <label className="font-semibold text-slate-700">{t("Question text")}<textarea value={stem} onChange={(e) => setStem(e.target.value)} rows={4} className={box} lang="en" dir="ltr" /></label>
            {OPTION_TYPES.has(d.type) && opts.length > 0 && (
              <fieldset className="grid gap-2">
                <legend className="font-semibold text-slate-700">{t("Answer choices")} <span className="text-sm font-normal text-slate-500">({multi ? t("tick every correct answer") : t("choose the correct answer")})</span></legend>
                {opts.map((o, i) => (
                  <div key={o.label} className="flex items-center gap-2">
                    <input type={multi ? "checkbox" : "radio"} name="correct" checked={o.correct} onChange={(e) => setOpts((l) => l.map((x, k) => (multi ? (k === i ? { ...x, correct: e.target.checked } : x) : { ...x, correct: k === i })))} aria-label={t("Correct answer: {label}", { label: o.label })} className="h-5 w-5" />
                    <span className="w-6 font-semibold text-slate-600">{o.label}.</span>
                    <input value={o.text} onChange={(e) => setOpts((l) => l.map((x, k) => (k === i ? { ...x, text: e.target.value } : x)))} aria-label={t("Choice {label}", { label: o.label })} className="min-h-10 flex-1 rounded-lg px-3 ring-1 ring-slate-300" lang="en" dir="ltr" />
                  </div>
                ))}
              </fieldset>
            )}
            {d.type === "TRUE_FALSE" && (
              <fieldset className="flex flex-wrap gap-4"><legend className="font-semibold text-slate-700">{t("The correct answer")}</legend>
                <label className="flex min-h-11 items-center gap-2"><input type="radio" name="tf" checked={tf === true} onChange={() => setTf(true)} className="h-5 w-5" /> {t("True")}</label>
                <label className="flex min-h-11 items-center gap-2"><input type="radio" name="tf" checked={tf === false} onChange={() => setTf(false)} className="h-5 w-5" /> {t("False")}</label>
              </fieldset>
            )}
            {d.type === "FILL_BLANK" && <label className="font-semibold text-slate-700">{t("Accepted answers (one per line)")}<textarea value={answers} onChange={(e) => setAnswers(e.target.value)} rows={3} className={box} lang="en" dir="ltr" /></label>}
            {!OPTION_TYPES.has(d.type) && d.type !== "TRUE_FALSE" && d.type !== "FILL_BLANK" && <p className="text-sm text-slate-500">{t("For this question type you can change the question text; the answer stays the same.")}</p>}
          </div>
        )}
        {error && <p role="alert" className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-red-700">{error}</p>}
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button type="button" onClick={onClose} className="min-h-11 rounded-xl px-5 font-semibold text-brand-navy ring-1 ring-slate-300">{t("Cancel")}</button>
          <button type="button" disabled={busy || !d} onClick={() => void save()} className="min-h-11 rounded-xl bg-brand-navy px-5 font-semibold text-white disabled:opacity-50">{busy ? t("Working…") : t("Save my copy")}</button>
        </div>
      </div>
    </div>
  );
}
