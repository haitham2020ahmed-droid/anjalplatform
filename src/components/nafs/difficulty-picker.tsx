"use client";
import { useState } from "react";
import { useT } from "@/i18n/client";
import { DIFFICULTY_CHOICES, type DifficultyChoice, type DifficultyMix } from "@/server/nafs/framework";

const NUM = "min-h-10 w-20 rounded-lg bg-surface px-2 tabular-nums text-ink ring-1 ring-line";

/** The value the server functions take: null (any) · 1 / 2 / 3 · a mix of percentages · "ADAPTIVE". */
export function difficultyValue(choice: DifficultyChoice, mix: DifficultyMix): null | number | DifficultyMix | "ADAPTIVE" {
  return choice === "ANY" ? null : choice === "ADAPTIVE" ? "ADAPTIVE" : choice === "MIX" ? mix : Number(choice);
}
/** The same as one form field (a mix as JSON). */
export const difficultyField = (choice: DifficultyChoice, mix: DifficultyMix): string => (choice === "MIX" ? JSON.stringify(mix) : choice);

/**
 * 🇸🇦 The NAFS difficulty choice — the same everywhere in the center (test builder, adaptive practice): Any · Easy ·
 * Medium · Hard · Mixed (with %) · Adaptive (each student starts at Medium; harder after a right answer, easier after
 * a wrong one; on paper a test falls back to Mixed). Controlled (`value` + `onChange`) or a form field (`name`).
 */
export function DifficultyPicker(props: {
  value?: DifficultyChoice; mix?: DifficultyMix; onChange?: (choice: DifficultyChoice, mix: DifficultyMix) => void;
  name?: string; defaultValue?: DifficultyChoice;
  /** the choices offered (default: all six) */
  allow?: DifficultyChoice[];
  /** a short note under Adaptive (what it means here) */
  adaptiveNote?: string;
}) {
  const t = useT();
  const [inner, setInner] = useState<DifficultyChoice>(props.defaultValue ?? "ANY");
  const [innerMix, setInnerMix] = useState<DifficultyMix>({ 1: 30, 2: 40, 3: 30 });
  const choice = props.value ?? inner;
  const mix = props.mix ?? innerMix;
  const set = (c: DifficultyChoice, m: DifficultyMix) => { setInner(c); setInnerMix(m); props.onChange?.(c, m); };
  const total = mix[1] + mix[2] + mix[3];
  return (
    <fieldset className="grid gap-1">
      <legend className="text-sm font-semibold text-ink">{t("Difficulty")}</legend>
      {props.name && <input type="hidden" name={props.name} value={difficultyField(choice, mix)} />}
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={t("Difficulty")}>
        {DIFFICULTY_CHOICES.filter((x) => !props.allow || props.allow.includes(x.key)).map((x) => (
          <button key={x.key} type="button" role="radio" aria-checked={choice === x.key} onClick={() => set(x.key, mix)}
            className={`min-h-11 rounded-xl px-3 text-sm font-semibold ring-1 ${choice === x.key ? "bg-teal-700 text-white ring-teal-700" : x.key === "ADAPTIVE" ? "bg-teal-50 text-teal-900 ring-teal-300" : "bg-surface text-ink-2 ring-line"}`}>
            {x.key === "ADAPTIVE" ? "↕ " : ""}{t(x.label)}
          </button>
        ))}
      </div>
      {choice === "MIX" && (
        <div className="mt-1 flex flex-wrap items-end gap-2">
          {([1, 2, 3] as const).map((k) => (
            <label key={k} className="grid gap-1 text-xs font-semibold text-ink-2">{t(k === 1 ? "Easy" : k === 2 ? "Medium" : "Hard")} %
              <input type="number" min={0} max={100} value={mix[k]} onChange={(e) => set(choice, { ...mix, [k]: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })} className={NUM} />
            </label>
          ))}
          <span className={`pb-2 text-xs ${total === 100 ? "text-muted" : "text-amber-700"}`}>{t("Total")}: {total}%</span>
        </div>
      )}
      {choice === "ADAPTIVE" && <p className="max-w-xl text-xs text-ink-2">{t(props.adaptiveNote ?? "Each student starts at Medium: a right answer brings a harder question, a wrong answer an easier one, inside the chosen standards.")}</p>}
    </fieldset>
  );
}
