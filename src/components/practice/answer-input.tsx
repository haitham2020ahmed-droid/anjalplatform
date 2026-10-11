/** @jsxRuntime automatic */
/** @jsxImportSource react */
/**
 * Answer area for each question type. Controlled: `value` + `onChange`.
 * Large tap targets (≥44px), full keyboard support, no drag-only interactions.
 */
import type { ClientQuestion } from "../../server/practice/items";
import { DictationInput } from "./dictation-input";

/** TWO_PART: Part A label and Part B label(s). ERROR_CORRECTION (newer items): tapped parts, “No error”, typed fixes. */
export type TwoPartValue = { a?: string; b?: string | string[] };
export type ErrorValue = { picks: number[]; none: boolean; fixes: Record<string, string> };
export type AnswerValue = string | string[] | boolean | number | Record<string, string> | TwoPartValue | ErrorValue | null;

const asError = (v: AnswerValue): ErrorValue => (v && typeof v === "object" && !Array.isArray(v) && Array.isArray((v as ErrorValue).picks) ? (v as ErrorValue) : { picks: [], none: false, fixes: {} });
const asTwoPart = (v: AnswerValue): TwoPartValue => (v && typeof v === "object" && !Array.isArray(v) ? (v as TwoPartValue) : {});
const asMap = (v: AnswerValue): Record<string, string> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, string>) : {});

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
      if (q.errorMode) return <ErrorCorrectionInput q={q} value={asError(value)} onChange={onChange} disabled={disabled} />;
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
    case "TWO_PART": {
      const v = asTwoPart(value);
      const p = q.parts!;
      const bSel = Array.isArray(v.b) ? v.b : v.b ? [v.b] : [];
      return (
        <div className="space-y-5">
          <fieldset className="space-y-3" disabled={disabled}>
            <legend className="mb-2 text-lg font-semibold text-brand-navy"><span className="me-2 rounded-md bg-brand-navy px-2 py-0.5 text-sm text-white">Part A</span>{p.a.stem}</legend>
            {p.a.options.map((o) => (
              <label key={o.label} className={choice(v.a === o.label, disabled)}>
                <input type="radio" name="part-a" className="mt-1.5 h-5 w-5 accent-brand-teal" checked={v.a === o.label} onChange={() => onChange({ ...v, a: o.label })} />
                <span><span className="font-semibold text-brand-navy">{o.label}.</span> {o.text}</span>
              </label>
            ))}
          </fieldset>
          <fieldset className="space-y-3" disabled={disabled}>
            <legend className="mb-2 text-lg font-semibold text-brand-navy"><span className="me-2 rounded-md bg-brand-purple px-2 py-0.5 text-sm text-white">Part B</span>{p.b.stem}</legend>
            {p.b.multiple && <p className="text-slate-600">Choose all that apply.</p>}
            {p.b.options.map((o) => (
              <label key={o.label} className={choice(bSel.includes(o.label), disabled)}>
                <input type={p.b.multiple ? "checkbox" : "radio"} name="part-b" className="mt-1.5 h-5 w-5 accent-brand-teal" checked={bSel.includes(o.label)}
                  onChange={(e) => onChange({ ...v, b: p.b.multiple ? (e.target.checked ? [...bSel, o.label] : bSel.filter((l) => l !== o.label)) : o.label })} />
                <span><span className="font-semibold text-brand-navy">{o.label}.</span> {o.text}</span>
              </label>
            ))}
          </fieldset>
        </div>
      );
    }
    case "GRID": {
      const map = asMap(value);
      const g = q.grid!;
      return (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[20rem] border-separate border-spacing-0 text-lg">
            <thead>
              <tr>
                <th scope="col" className="sr-only">Sentence</th>
                {g.columns.map((c) => <th key={c.id} scope="col" className="px-2 py-2 text-center text-base font-semibold text-brand-navy">{c.text}</th>)}
              </tr>
            </thead>
            <tbody>
              {g.rows.map((r) => (
                <tr key={r.id} className="odd:bg-slate-50">
                  <th scope="row" className="rounded-s-lg px-3 py-3 text-left font-normal text-slate-900">{r.text}</th>
                  {g.columns.map((c) => (
                    <td key={c.id} className="px-2 py-2 text-center">
                      <label className="inline-flex h-11 w-11 cursor-pointer items-center justify-center rounded-full hover:bg-brand-teal/10">
                        <input type="radio" name={`grid-${r.id}`} disabled={disabled} className="h-5 w-5 accent-brand-teal" checked={map[r.id] === c.id}
                          aria-label={`${r.text}: ${c.text}`} onChange={() => onChange({ ...map, [r.id]: c.id })} />
                      </label>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    case "HOT_TEXT": {
      const sel = Array.isArray(value) ? (value as string[]) : [];
      const h = q.hot!;
      const toggle = (id: string) => {
        if (sel.includes(id)) return onChange(sel.filter((x) => x !== id));
        if (h.maxSelect === 1) return onChange([id]);
        if (sel.length < h.maxSelect) onChange([...sel, id]);
      };
      return (
        <div>
          <p className="mb-2 text-slate-600">{h.maxSelect === 1 ? "Tap one sentence." : `Tap up to ${h.maxSelect} sentences.`} Tap again to undo.</p>
          <p className="rounded-xl border-2 border-slate-200 bg-white p-4 text-xl leading-loose" role="group" aria-label="Sentences you can select">
            {h.segments.map((x) => (
              <button key={x.id} type="button" aria-pressed={sel.includes(x.id)} disabled={disabled || (!sel.includes(x.id) && h.maxSelect > 1 && sel.length >= h.maxSelect)} onClick={() => toggle(x.id)}
                className={["me-1 rounded-md px-1 text-left transition-colors", sel.includes(x.id) ? "bg-amber-200 underline decoration-amber-600 decoration-2" : "hover:bg-amber-50"].join(" ")}>
                {x.text}
              </button>
            ))}
          </p>
        </div>
      );
    }
    case "SENTENCE_COMBINE": {
      const c = q.combine!;
      return (
        <div className="space-y-3">
          <ol className="space-y-1 rounded-xl border-2 border-slate-200 bg-white p-4 text-xl" aria-label="Sentences to join">
            {c.sentences.map((x, i) => <li key={i} className="flex gap-2"><span aria-hidden="true" className="font-semibold text-brand-teal">{i + 1}.</span><span>{x}</span></li>)}
          </ol>
          {c.connector && <p className="text-lg text-slate-700">Join them with <span className="rounded-md bg-amber-100 px-2 py-0.5 font-bold text-amber-900">{c.connector}</span>.</p>}
          <label className="block text-lg">
            <span className="text-slate-700">Write ONE sentence:</span>
            <textarea disabled={disabled} value={typeof value === "string" ? value : ""} maxLength={400} rows={2} autoComplete="off" spellCheck={false}
              onChange={(e) => onChange(e.target.value)}
              className="mt-1 w-full rounded-lg border-2 border-brand-teal px-3 py-2 text-lg font-semibold text-brand-navy" />
          </label>
        </div>
      );
    }
    case "DICTATION":
      return <DictationInput questionId={q.questionId} say={q.dictation!.say} hasSentence={q.dictation!.hasSentence} value={typeof value === "string" ? value : ""} onChange={onChange} disabled={disabled} />;
    default:
      return null;
  }
}

/** Newer error-correction items: tap the part(s) with a mistake (or “No error”), then type the fix when asked. */
function ErrorCorrectionInput({ q, value, onChange, disabled }: { q: ClientQuestion; value: ErrorValue; onChange: (v: AnswerValue) => void; disabled: boolean }) {
  const m = q.errorMode!;
  const tap = (i: number) => {
    const on = value.picks.includes(i);
    const picks = on ? value.picks.filter((k) => k !== i) : m.multiple ? [...value.picks, i] : [i];
    const fixes = Object.fromEntries(Object.entries(value.fixes).filter(([k]) => picks.includes(Number(k))));
    onChange({ picks, none: false, fixes });
  };
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 text-xl" role="group" aria-label={m.multiple ? "Tap every part with a mistake" : "Tap the part with the mistake"}>
        {q.segments!.map((s, i) => (
          <button key={i} type="button" aria-pressed={value.picks.includes(i)} disabled={disabled} onClick={() => tap(i)}
            className={["rounded-lg border-2 px-3 py-2", value.picks.includes(i) ? "border-red-400 bg-red-50 underline decoration-red-500 decoration-wavy" : "border-slate-200 bg-white hover:border-slate-300"].join(" ")}>
            {s}
          </button>
        ))}
        {m.noError && (
          <button type="button" aria-pressed={value.none} disabled={disabled} onClick={() => onChange(value.none ? { picks: [], none: false, fixes: {} } : { picks: [], none: true, fixes: {} })}
            className={["rounded-lg border-2 px-3 py-2 font-semibold", value.none ? "border-brand-teal bg-brand-teal/10 text-brand-navy" : "border-dashed border-slate-300 bg-white text-slate-700"].join(" ")}>
            No error
          </button>
        )}
      </div>
      {m.multiple && <p className="text-slate-600">There may be more than one mistake.</p>}
      {m.typeFix && [...value.picks].sort((a, b) => a - b).map((i) => (
        <label key={i} className="block text-lg">
          <span className="text-slate-700">Type “{q.segments![i]}” correctly:</span>
          <input disabled={disabled} value={value.fixes[String(i)] ?? ""} maxLength={200} autoComplete="off" spellCheck={false}
            onChange={(e) => onChange({ ...value, fixes: { ...value.fixes, [String(i)]: e.target.value } })}
            className="mt-1 w-full rounded-lg border-2 border-brand-teal px-3 py-2 font-semibold text-brand-navy" />
        </label>
      ))}
    </div>
  );
}

/** Is the answer complete enough to check? */
export function isAnswerReady(q: ClientQuestion, v: AnswerValue): boolean {
  switch (q.type) {
    case "MULTI_SELECT": return Array.isArray(v) && v.length > 0;
    case "TRUE_FALSE": return typeof v === "boolean";
    case "FILL_BLANK":
    case "DICTATION":
    case "SENTENCE_COMBINE": return typeof v === "string" && v.trim().length > 0;
    case "SENTENCE_ORDER":
    case "WORD_ORDER": return true; // the shown order is an answer
    case "ERROR_CORRECTION": {
      if (!q.errorMode) return typeof v === "number";
      const e = asError(v);
      return e.none || (e.picks.length > 0 && (!q.errorMode.typeFix || e.picks.every((i) => (e.fixes[String(i)] ?? "").trim().length > 0)));
    }
    case "TWO_PART": { const t = asTwoPart(v); return Boolean(t.a) && (Array.isArray(t.b) ? t.b.length > 0 : Boolean(t.b)); }
    case "GRID": return q.grid!.rows.every((r) => asMap(v)[r.id]);
    case "HOT_TEXT": return Array.isArray(v) && v.length > 0;
    case "MATCHING": return !!v && typeof v === "object" && q.left!.every((l) => (v as Record<string, string>)[l]);
    default: return typeof v === "string" && v.length > 0;
  }
}
