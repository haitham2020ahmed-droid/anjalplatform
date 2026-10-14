"use client";
import { useMemo, useState } from "react";
import { useT } from "@/i18n/client";
import { parseRubricText } from "@/server/writing/rubric-text";
import { Combo } from "@/components/ui/combo";

export interface BuilderLevel { label: string; points: number | ""; description: string }
export interface BuilderCriterion { title: string; description: string; levels: BuilderLevel[] }
export interface PickRubric { id: string; title: string; shared: boolean; mine: boolean; criteria: { title: string; description: string; levels: { label: string; points: number; description: string }[] }[] }

const LEVELS = (): BuilderLevel[] => [
  { label: "Beginning", points: 1, description: "" }, { label: "Developing", points: 2, description: "" },
  { label: "Proficient", points: 3, description: "" }, { label: "Exemplary", points: 4, description: "" },
];
const START = (): BuilderCriterion[] => [
  { title: "Ideas and content", description: "", levels: LEVELS() },
  { title: "Organization", description: "", levels: LEVELS() },
  { title: "Language and conventions", description: "", levels: LEVELS() },
];

/** A read-only rubric table (criteria × levels). */
export function RubricTable({ criteria }: { criteria: PickRubric["criteria"] }) {
  const t = useT();
  return (
    <div className="mt-2 overflow-x-auto">
      <table className="w-full min-w-[32rem] border-collapse text-xs">
        <tbody>{criteria.map((c, i) => (
          <tr key={i} className="border-t border-slate-200 align-top">
            <th scope="row" className="w-36 p-2 text-start font-semibold text-brand-navy">{c.title}{c.description && <span className="block font-normal text-slate-500">{c.description}</span>}</th>
            {c.levels.map((l, j) => <td key={j} className="p-2"><b>{l.label}</b> <span className="text-slate-500">· {t("{n} pts", { n: l.points })}</span>{l.description && <span className="block text-slate-600">{l.description}</span>}</td>)}
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

const TYPED_EXAMPLE = `Ideas: A clear opinion with reasons
4 Exemplary - strong opinion, well-explained reasons
3 Proficient - opinion with two reasons
2 Developing - an opinion with one reason
1 Beginning - no clear opinion

Organization: Order and linking words
4 Exemplary - clear beginning, middle and end; varied linking words
3 Proficient - clear order with linking words
2 Developing - some order
1 Beginning - no clear order`;
const TABLE_EXAMPLE = "\tExemplary (4)\tProficient (3)\tDeveloping (2)\tBeginning (1)\nIdeas (A clear opinion with reasons)\tStrong opinion, well-explained reasons\tOpinion with two reasons\tOpinion with one reason\tNo clear opinion\nOrganization (Order and linking words)\tClear beginning, middle and end\tClear order with linking words\tSome order\tNo clear order";

/**
 * 📝 "Write or paste my rubric": a textarea for a table pasted from Word / Excel / Google Docs or typed lines, with a
 * live preview from the same pure parser the server uses (src/server/writing/rubric-text.ts) and clear line errors.
 */
function RubricTextInput() {
  const t = useT();
  const [text, setText] = useState("");
  const parsed = useMemo(() => (text.trim() ? parseRubricText(text) : null), [text]);
  const box = "block w-full rounded-lg border border-slate-300 px-2 py-1.5 font-normal";
  const small = "inline-flex min-h-9 items-center rounded-lg bg-white px-3 text-xs font-semibold text-brand-navy ring-1 ring-slate-300 hover:ring-brand-teal";
  const max = parsed ? parsed.criteria.reduce((a, c) => a + Math.max(0, ...c.levels.map((l) => l.points)), 0) : 0;
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">{t("Paste a table from Word, Excel or Google Docs (first row: the levels with their points; first column: the criteria), or type your rubric line by line with a blank line between criteria.")}</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="rounded-xl bg-slate-50 p-3 text-xs ring-1 ring-slate-200">
          <p className="font-semibold text-brand-navy">{t("Typed")}</p>
          <pre dir="ltr" className="mt-1 overflow-x-auto whitespace-pre-wrap text-slate-700">{TYPED_EXAMPLE.split("\n").slice(0, 4).join("\n")}{"\n…"}</pre>
          <button type="button" className={`${small} mt-2`} onClick={() => setText(TYPED_EXAMPLE)}>{t("Use this example")}</button>
        </div>
        <div className="rounded-xl bg-slate-50 p-3 text-xs ring-1 ring-slate-200">
          <p className="font-semibold text-brand-navy">{t("Pasted table")}</p>
          <p className="mt-1 text-slate-700">{t("Level headers like “Exemplary (4)”, “4 - Exemplary” or “Exemplary 4 pts”; a criterion's description can go in parentheses after its name.")}</p>
          <button type="button" className={`${small} mt-2`} onClick={() => setText(TABLE_EXAMPLE)}>{t("Use this example")}</button>
        </div>
      </div>
      <label className="block text-sm font-semibold">{t("Rubric title (optional)")}<input name="rubricTitle" maxLength={120} className={box} placeholder={t("e.g. Opinion essay rubric")} /></label>
      <label className="block text-sm font-semibold">{t("Your rubric")}
        <textarea name="rubricText" value={text} onChange={(e) => setText(e.target.value)} rows={10} maxLength={20000} dir="ltr" spellCheck={false} className={`${box} font-mono text-xs`} placeholder={TYPED_EXAMPLE} />
      </label>
      {parsed && parsed.errors.length > 0 && (
        <ul role="alert" className="space-y-1 rounded-xl bg-red-50 p-3 text-sm text-red-900 ring-1 ring-red-200">
          {parsed.errors.slice(0, 8).map((e, i) => <li key={i}>⚠️ {t(e.key, e.vars)}</li>)}
          {parsed.errors.length > 8 && <li>{t("…and {n} more", { n: parsed.errors.length - 8 })}</li>}
        </ul>
      )}
      {parsed && parsed.criteria.length > 0 && (
        <div className="rounded-xl bg-white p-3 ring-1 ring-slate-200">
          <p className="text-sm font-semibold text-brand-navy">{parsed.errors.length ? t("Preview (fix the lines above first)") : `✓ ${t("Preview")}`} <span className="font-normal text-slate-500">· {t("{n} criteria", { n: parsed.criteria.length })} · {t("Total points: {n}", { n: max })} · {t(parsed.format === "table" ? "read as a table" : "read as typed lines")}</span></p>
          <RubricTable criteria={parsed.criteria} />
        </div>
      )}
      <p className="text-xs text-slate-500">{t("Your wording is kept with the task and also given to the AI when you use Grade with AI.")}</p>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="saveRubric" value="1" /> {t("Save this rubric for later")}</label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="shareRubric" value="1" /> {t("Share it with the teachers of my school")}</label>
    </div>
  );
}

/**
 * 📏 Build a rubric (criteria + performance levels with points and a description each), pick a saved one, or write /
 * paste one as text. The built rubric is sent as JSON (rubricJson); the server validates it (src/server/writing/locked.ts cleanRubric).
 */
export function RubricBuilder({ saved, buildOnly = false }: { saved: PickRubric[]; buildOnly?: boolean }) {
  const t = useT();
  const [mode, setMode] = useState<"saved" | "build" | "text">(!buildOnly && saved.length ? "saved" : "build");
  const [pick, setPick] = useState(saved[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [rows, setRows] = useState<BuilderCriterion[]>(START);
  const box = "block w-full rounded-lg border border-slate-300 px-2 py-1.5 font-normal";
  const small = "inline-flex min-h-9 items-center rounded-lg bg-white px-3 text-xs font-semibold text-brand-navy ring-1 ring-slate-300 hover:ring-brand-teal";
  const set = (i: number, f: (c: BuilderCriterion) => BuilderCriterion) => setRows((r) => r.map((c, k) => (k === i ? f(c) : c)));
  const setLevel = (i: number, j: number, patch: Partial<BuilderLevel>) => set(i, (c) => ({ ...c, levels: c.levels.map((l, k) => (k === j ? { ...l, ...patch } : l)) }));
  const max = rows.reduce((a, c) => a + Math.max(0, ...c.levels.map((l) => Number(l.points) || 0)), 0);
  const chosen = saved.find((r) => r.id === pick);
  return (
    <div className="space-y-2">
      {!buildOnly && (
        <div className="flex flex-wrap gap-3 text-sm">
          <label className="flex min-h-9 items-center gap-1"><input type="radio" name="rubricMode" value="saved" checked={mode === "saved"} onChange={() => setMode("saved")} disabled={!saved.length} /> {t("Use a saved rubric")}</label>
          <label className="flex min-h-9 items-center gap-1"><input type="radio" name="rubricMode" value="build" checked={mode === "build"} onChange={() => setMode("build")} /> {t("Build a new rubric")}</label>
          <label className="flex min-h-9 items-center gap-1"><input type="radio" name="rubricMode" value="text" checked={mode === "text"} onChange={() => setMode("text")} /> {t("Write or paste my rubric")}</label>
        </div>
      )}
      {mode === "text" && !buildOnly ? <RubricTextInput /> : mode === "saved" && !buildOnly ? (
        <div>
          <Combo name="rubricId" label={t("Rubric")} value={pick} onChange={setPick} options={saved.map((r) => ({ value: r.id, label: r.title, hint: r.mine ? undefined : t("shared") }))} />
          {chosen && <RubricTable criteria={chosen.criteria} />}
        </div>
      ) : (
        <div className="space-y-3">
          <label className="block text-sm font-semibold">{t("Rubric title")}<input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} className={box} placeholder={t("e.g. Opinion essay rubric")} /></label>
          {rows.map((c, i) => (
            <fieldset key={i} className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
              <legend className="px-1 text-sm font-semibold text-brand-navy">{t("Criterion {n}", { n: i + 1 })}</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="text-xs font-semibold">{t("Criterion")}<input value={c.title} onChange={(e) => set(i, (x) => ({ ...x, title: e.target.value }))} maxLength={120} required className={box} /></label>
                <label className="text-xs font-semibold">{t("What it checks (optional)")}<input value={c.description} onChange={(e) => set(i, (x) => ({ ...x, description: e.target.value }))} maxLength={500} className={box} /></label>
              </div>
              <div className="mt-2 grid gap-2 md:grid-cols-2 xl:grid-cols-4">{c.levels.map((l, j) => (
                <div key={j} className="rounded-lg bg-white p-2 ring-1 ring-slate-200">
                  <div className="flex gap-1">
                    <input aria-label={t("Level name")} value={l.label} onChange={(e) => setLevel(i, j, { label: e.target.value })} maxLength={60} required className={box} />
                    <input aria-label={t("Points")} type="number" min={0} max={100} value={l.points} onChange={(e) => setLevel(i, j, { points: e.target.value === "" ? "" : Number(e.target.value) })} required className={`${box} w-16`} />
                  </div>
                  <textarea aria-label={t("Level description")} value={l.description} onChange={(e) => setLevel(i, j, { description: e.target.value })} rows={2} maxLength={500} className={`${box} mt-1 text-xs`} placeholder={t("What this level looks like")} />
                  {c.levels.length > 2 && <button type="button" onClick={() => set(i, (x) => ({ ...x, levels: x.levels.filter((_, k) => k !== j) }))} className="mt-1 text-xs font-semibold text-red-700">{t("Remove level")}</button>}
                </div>
              ))}</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {c.levels.length < 6 && <button type="button" className={small} onClick={() => set(i, (x) => ({ ...x, levels: [...x.levels, { label: "", points: "", description: "" }] }))}>{t("Add a level")}</button>}
                {rows.length > 1 && <button type="button" className={`${small} text-red-700`} onClick={() => setRows((r) => r.filter((_, k) => k !== i))}>{t("Remove criterion")}</button>}
              </div>
            </fieldset>
          ))}
          <div className="flex flex-wrap items-center gap-3">
            {rows.length < 10 && <button type="button" className={small} onClick={() => setRows((r) => [...r, { title: "", description: "", levels: LEVELS() }])}>{t("Add a criterion")}</button>}
            <span className="text-sm text-slate-600">{t("Total points: {n}", { n: max })}</span>
          </div>
          <input type="hidden" name="rubricJson" value={JSON.stringify({ title, criteria: rows })} />
          {!buildOnly && <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="saveRubric" value="1" defaultChecked /> {t("Save this rubric for reuse")}</label>}
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="shareRubric" value="1" /> {t("Share it with the teachers of my school")}</label>
        </div>
      )}
    </div>
  );
}
