"use client";
/**
 * 🧩 THE skill question picker (one component for every place a teacher chooses a skill):
 *   - "Let the platform choose for each student (recommended)" (default) or "I'll pick the questions";
 *   - the skill's questions (read only when the list is opened): stem, choices, the correct answer marked, the level;
 *   - a level filter (All / Below / On / Above), a search box, Select all and "12 selected";
 *   - output: onChange({ auto: true } | { auto: false, questionIds }) and a hidden input `questionIds` (JSON) for forms.
 * mode "view" only shows the questions (no choice), e.g. in Find a skill.
 * Teachers only: answers and level names are never shown to students here.
 */
import { useMemo, useState } from "react";
import { useT } from "@/i18n/client";
import { AUTO, LEVEL_FILTERS, MAX_PICKED, filterQuestions, isAllShownPicked, isCorrectChoice, pickFirstN, pickerOutput, questionIdsField, toggleSelectAll, type LevelFilter, type PickerQuestion, type PickerValue } from "./helpers";
import { draftsOf, useSkillQuestions } from "./load";
import { QuestionDrawer } from "@/components/tests/question-drawer";
import type { MapSourceQuestion } from "@/server/tests/map-source";
import { RichInline } from "@/components/rich-inline";
import { stripMarks } from "@/lib/inline-marks";

const LEVEL_LABEL: Record<string, string> = { ALL: "All", BELOW: "Approaching", ON: "Meeting", ABOVE: "Exceeding" };
const LEVEL_CHIP: Record<string, string> = { BELOW: "bg-amber-50 text-amber-900 ring-amber-200", ON: "bg-sky-50 text-sky-900 ring-sky-200", ABOVE: "bg-violet-50 text-violet-900 ring-violet-200" };
const chipBtn = (on: boolean) => `min-h-11 rounded-full px-4 text-sm font-semibold ring-1 ${on ? "bg-brand-navy text-white ring-brand-navy" : "bg-white text-brand-navy ring-slate-300"}`;

export interface SkillQuestionPickerProps {
  skillId: string;
  /** shown as the button that opens the list (mode "view"); in mode "pick" an optional heading */
  skillName?: string;
  /** "pick" (default): the platform chooses / I'll pick · "view": look at the questions only */
  mode?: "pick" | "view";
  defaultValue?: PickerValue;
  onChange?: (v: PickerValue) => void;
  /** the hidden form field's name (default "questionIds"); null = no hidden field */
  name?: string | null;
  /** at most this many chosen questions (default 50) */
  max?: number;
  /** open the list at once */
  defaultOpen?: boolean;
  /** 👁 "View" on every row (and on the stem): the full question in a drawer (the test builder) */
  viewable?: boolean;
  /** the drawer's "Select" when the teacher is not ticking this skill's own questions: add to / take out of a test */
  isPicked?: (id: string) => boolean;
  onPick?: (row: MapSourceQuestion, on: boolean) => void;
}

export function SkillQuestionPicker({ skillId, skillName, mode = "pick", defaultValue = AUTO, onChange, name = "questionIds", max = MAX_PICKED, defaultOpen = false, viewable = false, isPicked, onPick }: SkillQuestionPickerProps) {
  const t = useT();
  const pick = mode === "pick";
  const [auto, setAuto] = useState(pick ? defaultValue.auto : true);
  const [selected, setSelected] = useState<string[]>(defaultValue.auto ? [] : defaultValue.questionIds);
  const [open, setOpen] = useState(defaultOpen || (pick && !defaultValue.auto));
  const [level, setLevel] = useState<LevelFilter>("ALL");
  const [search, setSearch] = useState("");
  const { list, failed } = useSkillQuestions(skillId, open);
  const shown = useMemo(() => (list ? filterQuestions(list, level, search) : []), [list, level, search]);
  const value = pickerOutput(auto, selected);
  const [viewAt, setViewAt] = useState<number | null>(null);
  const ticking = pick && !auto;

  const emit = (a: boolean, sel: string[]) => onChange?.(pickerOutput(a, sel));
  const chooseAuto = (a: boolean) => { setAuto(a); if (!a) setOpen(true); emit(a, selected); };
  const toggle = (id: string) => {
    const next = selected.includes(id) ? selected.filter((x) => x !== id) : selected.length < max ? [...selected, id] : selected;
    setSelected(next); emit(auto, next);
  };
  const allShownPicked = isAllShownPicked(shown, selected, max);
  const selectAll = () => { const next = toggleSelectAll(shown, selected, max); setSelected(next); emit(auto, next); };
  const [pickN, setPickN] = useState("");
  const applyPickN = () => {
    const next = pickFirstN(shown, Number(pickN), max);
    if (!next.length) return;
    setSelected(next); emit(auto, next);
  };

  return (
    <div className="grid gap-3" data-testid="skill-question-picker">
      {name && <input type="hidden" name={name} value={questionIdsField(value)} />}
      {pick ? (
        <fieldset className="grid gap-2 sm:grid-cols-2">
          <legend className="sr-only">{t("Which questions?")}</legend>
          {([[true, "Let the platform choose for each student (recommended)", "Each student gets questions at their own level."], [false, "I'll pick the questions", "Everyone gets the questions you tick."]] as const).map(([a, label, hint]) => (
            <label key={String(a)} className={`flex min-h-11 cursor-pointer items-start gap-3 rounded-2xl p-3 ring-2 ${auto === a ? "bg-teal-50 ring-brand-teal" : "bg-white ring-slate-200"}`}>
              <input type="radio" name={`${name ?? "questionIds"}-mode-${skillId}`} checked={auto === a} onChange={() => chooseAuto(a)} className="mt-1 h-5 w-5 shrink-0 accent-brand-teal" />
              <span><span className="block font-semibold text-brand-navy">{t(label)}</span><span className="block text-sm text-slate-600">{t(hint)}</span></span>
            </label>
          ))}
        </fieldset>
      ) : null}
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className={`flex min-h-11 w-full items-center justify-between gap-2 rounded-xl px-3 text-start font-semibold text-brand-navy ${skillName && !pick ? "hover:bg-slate-50" : "ring-1 ring-slate-300"}`}>
        {skillName && !pick ? <bdi dir="ltr" lang="en" data-content>{skillName}</bdi> : <span>{t(open ? "Hide the questions" : "See the questions")}</span>}
        <span aria-hidden="true" className="text-slate-500">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="grid gap-3 rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-200">
          <div className="flex flex-wrap items-center gap-2">
            <div role="group" aria-label={t("Level")} className="flex flex-wrap gap-2">
              {LEVEL_FILTERS.map((l) => <button key={l} type="button" aria-pressed={level === l} onClick={() => setLevel(l)} className={chipBtn(level === l)}>{t(LEVEL_LABEL[l])}</button>)}
            </div>
            <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); /* inside a page's form: Enter must not send it */ }} placeholder={t("Search the questions…")} aria-label={t("Search the questions…")} className="min-h-11 min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-3" />
          </div>
          {pick && !auto && (
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" onClick={selectAll} disabled={!shown.length} className="min-h-11 rounded-xl bg-white px-4 font-semibold text-brand-navy ring-1 ring-slate-300 disabled:opacity-50">{t(allShownPicked ? "Clear" : "Select all")}</button>
              <span className="flex min-h-11 items-center gap-1.5 rounded-xl bg-white px-2 ring-1 ring-slate-300">
                <label htmlFor={`pick-n-${skillId}`} className="text-sm font-semibold text-brand-navy">{t("Pick first N")}</label>
                <input id={`pick-n-${skillId}`} type="number" min={1} max={Math.min(max, shown.length) || 1} value={pickN}
                  onChange={(e) => setPickN(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); applyPickN(); } }}
                  placeholder="N" className="h-8 w-16 rounded-lg border border-slate-300 px-2" aria-label={t("Pick first N")} />
                <button type="button" onClick={applyPickN} disabled={!shown.length || !pickN} className="min-h-8 rounded-lg px-2 text-sm font-semibold text-brand-navy ring-1 ring-slate-300 disabled:opacity-50">{t("Go")}</button>
              </span>
              <span role="status" className="font-semibold text-slate-700">{t("{n} selected", { n: selected.length })}</span>
              {selected.length >= max && <span className="text-sm text-amber-800">{t("At most {n} questions.", { n: max })}</span>}
            </div>
          )}
          {list && (draftsOf.get(skillId) ?? 0) > 0 && <p className="mb-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-200">{t("{n} more questions of this skill are drafts. An admin can publish them in Data Cleanup.", { n: draftsOf.get(skillId) ?? 0 })}</p>}
          {failed ? <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-red-800">{t("The questions could not be loaded. Please try again.")}</p>
            : !list ? <p className="px-1 py-2 text-slate-500" aria-busy="true">{t("Loading questions…")}</p>
            : !list.length ? <p className="rounded-xl bg-white px-3 py-4 text-center text-slate-600">{t("This skill has no questions yet.")}</p>
            : !shown.length ? <p className="rounded-xl bg-white px-3 py-4 text-center text-slate-600">{t("Nothing matches your search")}</p>
            : (
              <ul className="grid max-h-96 gap-2 overflow-y-auto" aria-label={t("Questions")}>
                {shown.map((q, i) => <QuestionRow key={q.id} q={q} checkable={ticking} checked={selected.includes(q.id)} onToggle={() => toggle(q.id)} onView={viewable ? () => setViewAt(i) : undefined} />)}
              </ul>
            )}
        </div>
      )}
      {viewable && viewAt !== null && shown[viewAt] && (
        <QuestionDrawer ids={shown.map((q) => q.id)} index={viewAt} onIndex={setViewAt} onClose={() => setViewAt(null)}
          isSelected={ticking ? (id) => selected.includes(id) : isPicked}
          onToggle={ticking ? (d, on) => { if (on !== selected.includes(d.id)) toggle(d.id); } : onPick ? (d, on) => onPick(d.row, on) : undefined} />
      )}
    </div>
  );
}

function QuestionRow({ q, checkable, checked, onToggle, onView }: { q: PickerQuestion; checkable: boolean; checked: boolean; onToggle: () => void; onView?: () => void }) {
  const t = useT();
  const body = (
    <span className="min-w-0 flex-1">
      <span className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${LEVEL_CHIP[q.level] ?? "bg-slate-100 text-slate-700 ring-slate-200"}`}>{t(LEVEL_LABEL[q.level] ?? "Meeting")}</span>
        {q.passageTitle && <span className="text-xs text-slate-500" lang="en" data-content>{q.passageTitle}</span>}
      </span>
      {onView ? <button type="button" onClick={(e) => { e.preventDefault(); onView(); }} className="mt-1 block text-start text-slate-900 hover:underline" lang="en" dir="ltr" data-content>{q.stem ? <RichInline text={q.stem} /> : "—"}</button>
        : <span className="mt-1 block text-slate-900" lang="en" dir="ltr" data-content>{q.stem ? <RichInline text={q.stem} /> : "—"}</span>}
      {q.choices?.length ? (
        <ol className="mt-1 grid gap-0.5 text-sm" lang="en" dir="ltr">
          {q.choices.map((c, i) => {
            const right = isCorrectChoice(c, q.answer);
            return <li key={i} className={right ? "font-semibold text-emerald-800" : "text-slate-700"}>{String.fromCharCode(65 + i)}. {c}{right && <span className="ms-1" aria-label={t("Correct answer")}>✓</span>}</li>;
          })}
        </ol>
      ) : q.answer ? <span className="mt-1 block text-sm text-emerald-800"><span className="font-semibold">{t("Answer")}:</span> <span lang="en" data-content>{q.answer}</span></span> : null}
    </span>
  );
  const view = onView ? <button type="button" onClick={onView} className="min-h-9 shrink-0 rounded-lg px-2.5 text-sm font-semibold text-brand-navy ring-1 ring-slate-300 hover:bg-slate-50">👁 {t("View")}</button> : null;
  return (
    <li className={`rounded-xl bg-white p-3 ring-1 ${checked ? "ring-2 ring-brand-teal" : "ring-slate-200"}`}>
      {checkable && onView ? <div className="flex items-start gap-3"><input type="checkbox" checked={checked} onChange={onToggle} aria-label={t("Select question: {stem}", { stem: stripMarks(q.stem).slice(0, 80) })} className="mt-1 h-5 w-5 shrink-0 accent-brand-teal" />{body}{view}</div>
        : checkable ? <label className="flex cursor-pointer items-start gap-3"><input type="checkbox" checked={checked} onChange={onToggle} className="mt-1 h-5 w-5 shrink-0 accent-brand-teal" />{body}</label> : <div className="flex items-start gap-3">{body}{view}</div>}
    </li>
  );
}
