/** @jsxRuntime automatic */
/** @jsxImportSource react */
/**
 * Answer area for each question type. Controlled: `value` + `onChange`.
 * Large tap targets (≥44px), full keyboard support, no drag-only interactions.
 */
import type { ClientQuestion } from "../../server/practice/items";

export type AnswerValue = string | string[] | boolean | number | Record<string, string> | null;

const choice = (selected: boolean, disabled: boolean) =>
  [
    "flex w-full items-start gap-3 rounded-xl border-2 px-4 py-3 text-left text-lg transition-colors",
    selected ? "border-brand-teal bg-brand-teal/10" : "border-slate-200 bg-white hover:border-slate-300",
    disabled ? "cursor-default opacity-80" : "",
  ].join(" ");

const blankParts = (stem: string) => {
  const i = stem.indexOf("____");
  return i < 0 ? [stem, ""] : [stem.slice(0, i), stem.slice(i + 4)];
};

export function AnswerInput({ q, value, onChange, disabled }: { q: ClientQuestion; value: AnswerValue; onChange: (v: AnswerValue) => void; disabled: boolean }) {
  switch (q.type) {
    case "MULTIPLE_CHOICE":
      return (
        <fieldset className="space-y-3" disabled={disabled}>
          <legend className="sr-only">Choose one answer</legend>
          {q.options!.map((o) => (
            <label key={o.label} className={choice(value === o.label, disabled)}>
              <input type="radio" name="answer" className="mt-1.5 h-5 w-5 accent-brand-teal" checked={value === o.label} onChange={() => onChange(o.label)} />
              <span><span className="font-semibold text-brand-navy">{o.label}.</span> {o.text}</span>
            </label>
          ))}
        </fieldset>
      );
    case "MULTI_SELECT": {
      const sel = Array.isArray(value) ? (value as string[]) : [];
      return (
        <fieldset className="space-y-3" disabled={disabled}>
          <legend className="mb-2 text-slate-600">Choose all that apply.</legend>
          {q.options!.map((o) => (
            <label key={o.label} className={choice(sel.includes(o.label), disabled)}>
              <input type="checkbox" className="mt-1.5 h-5 w-5 accent-brand-teal" checked={sel.includes(o.label)}
                onChange={(e) => onChange(e.target.checked ? [...sel, o.label] : sel.filter((l) => l !== o.label))} />
              <span><span className="font-semibold text-brand-navy">{o.label}.</span> {o.text}</span>
            </label>
          ))}
        </fieldset>
      );
    }
    case "TRUE_FALSE":
      return (
        <div role="radiogroup" aria-label="True or false" className="grid grid-cols-2 gap-3">
          {[true, false].map((b) => (
            <button key={String(b)} type="button" role="radio" aria-checked={value === b} disabled={disabled} onClick={() => onChange(b)}
              className={["rounded-xl border-2 py-4 text-xl font-semibold", value === b ? "border-brand-teal bg-brand-teal/10 text-brand-navy" : "border-slate-200 bg-white"].join(" ")}>
              {b ? "True" : "False"}
            </button>
          ))}
        </div>
      );
    case "DROPDOWN": {
      const [a, b] = blankParts(q.stem);
      return (
        <p className="text-xl leading-relaxed">
          {a}
          <select aria-label="Choose the word that fits" disabled={disabled} value={typeof value === "string" ? value : ""} onChange={(e) => onChange(e.target.value || null)}
            className="mx-1 rounded-lg border-2 border-brand-teal bg-white px-2 py-1 font-semibold text-brand-navy">
            <option value="">choose…</option>
            {q.options!.map((o) => <option key={o.label} value={o.label}>{o.text}</option>)}
          </select>
          {b}
        </p>
      );
    }
    case "FILL_BLANK": {
      const [a, b] = blankParts(q.stem);
      return (
        <p className="text-xl leading-relaxed">
          {a}
          <input aria-label="Type the missing word" disabled={disabled} value={typeof value === "string" ? value : ""} maxLength={60} autoComplete="off" spellCheck={false}
            onChange={(e) => onChange(e.target.value)} className="mx-1 w-44 rounded-lg border-2 border-brand-teal px-2 py-1 font-semibold text-brand-navy" />
          {b}
        </p>
      );
    }
    case "SENTENCE_ORDER":
    case "WORD_ORDER": {
      const list = Array.isArray(value) ? (value as string[]) : q.elements!;
      const move = (i: number, d: number) => {
        const next = [...list];
        [next[i], next[i + d]] = [next[i + d], next[i]];
        onChange(next);
      };
      return (
        <ol className="space-y-2" aria-label="Put these in order">
          {list.map((s, i) => (
            <li key={s} className="flex items-center gap-3 rounded-xl border-2 border-slate-200 bg-white px-3 py-2">
              <span className="w-6 text-center text-lg font-bold text-brand-teal">{i + 1}</span>
              <span className="flex-1 text-lg">{s}</span>
              <span className="flex gap-1">
                <button type="button" aria-label={`Move “${s}” up`} disabled={disabled || i === 0} onClick={() => move(i, -1)} className="h-10 w-10 rounded-lg border border-slate-300 disabled:opacity-30">▲</button>
                <button type="button" aria-label={`Move “${s}” down`} disabled={disabled || i === list.length - 1} onClick={() => move(i, 1)} className="h-10 w-10 rounded-lg border border-slate-300 disabled:opacity-30">▼</button>
              </span>
            </li>
          ))}
        </ol>
      );
    }
    case "ERROR_CORRECTION":
      return (
        <div className="flex flex-wrap gap-2 text-xl" role="radiogroup" aria-label="Tap the part with the mistake">
          {q.segments!.map((s, i) => (
            <button key={i} type="button" role="radio" aria-checked={value === i} disabled={disabled} onClick={() => onChange(i)}
              className={["rounded-lg border-2 px-3 py-2", value === i ? "border-red-400 bg-red-50 underline decoration-red-500 decoration-wavy" : "border-slate-200 bg-white hover:border-slate-300"].join(" ")}>
              {s}
            </button>
          ))}
        </div>
      );
    case "MATCHING": {
      const map = (value && typeof value === "object" && !Array.isArray(value) ? value : {}) as Record<string, string>;
      return (
        <div className="space-y-3">
          {q.left!.map((l) => (
            <label key={l} className="grid items-center gap-2 rounded-xl border-2 border-slate-200 bg-white px-4 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
              <span className="text-lg font-semibold text-brand-navy">{l}</span>
              <select disabled={disabled} value={map[l] ?? ""} onChange={(e) => onChange({ ...map, [l]: e.target.value })} className="rounded-lg border border-slate-300 px-2 py-2 text-lg">
                <option value="">choose…</option>
                {q.right!.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </label>
          ))}
        </div>
      );
    }
    default:
      return null;
  }
}

/** Is the answer complete enough to check? */
export function isAnswerReady(q: ClientQuestion, v: AnswerValue): boolean {
  switch (q.type) {
    case "MULTI_SELECT": return Array.isArray(v) && v.length > 0;
    case "TRUE_FALSE": return typeof v === "boolean";
    case "FILL_BLANK": return typeof v === "string" && v.trim().length > 0;
    case "SENTENCE_ORDER":
    case "WORD_ORDER": return true; // the shown order is an answer
    case "ERROR_CORRECTION": return typeof v === "number";
    case "MATCHING": return !!v && typeof v === "object" && q.left!.every((l) => (v as Record<string, string>)[l]);
    default: return typeof v === "string" && v.length > 0;
  }
}
