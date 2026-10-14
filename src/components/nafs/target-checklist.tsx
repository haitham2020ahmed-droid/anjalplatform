"use client";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useT } from "@/i18n/client";
import type { BankPage } from "@/server/nafs/bank";
import { codeName, DIFFICULTY_NAME, type Difficulty } from "@/server/nafs/framework";
import { targetQuestionsAction } from "@/app/teacher/nafs/actions";

import type { ChecklistGroup } from "./builder-starts";

export type { ChecklistGroup } from "./builder-starts";

const BTN = "min-h-9 rounded-lg px-2.5 text-xs font-semibold ring-1";
const DIF_CHIP: Record<number, string> = { 1: "bg-emerald-50 text-emerald-900 ring-emerald-200", 2: "bg-sky-50 text-sky-900 ring-sky-200", 3: "bg-rose-50 text-rose-900 ring-rose-200" };

/**
 * 🇸🇦 Every skill / standard checklist of the NAFS center (Adaptive practice, the test builder): groups (the three
 * Ministry content areas, the NAFS domains) with "Select all" / "Clear" per group and for everything; each standard
 * shown with its name ("S13 — Proposes a title…"). Below, the questions BEHIND the selection, right there: their
 * number, a page at a time, each one opens to its full preview (options and key), filtered by difficulty — and the
 * teacher can tick specific questions (then only those are used).
 * Controlled (`value` / `onChange`, `picked` / `onPick`) or a form (hidden inputs `name` and `pickName`).
 */
export function TargetChecklist(props: {
  groups: ChecklistGroup[];
  value?: string[]; defaultValue?: string[]; onChange?: (codes: string[]) => void; name?: string;
  /** the questions behind the selection (default on) and picking specific ones */
  preview?: boolean; picked?: string[]; onPick?: (ids: string[]) => void; pickName?: string;
  /** only multiple-choice questions (adaptive practice) */
  mcqOnly?: boolean;
  legend?: string;
  /** per code: a number input next to a ticked item (questions per skill) */
  counts?: Record<string, number>; onCount?: (code: string, n: number) => void;
}) {
  const t = useT();
  const [inner, setInner] = useState<string[]>(props.defaultValue ?? []);
  const [innerPicked, setInnerPicked] = useState<string[]>([]);
  const codes = props.value ?? inner;
  const picked = props.picked ?? innerPicked;
  const all = useMemo(() => props.groups.flatMap((g) => g.items.map((i) => i.code)), [props.groups]);
  const set = (next: string[]) => { const v = all.filter((c) => next.includes(c)); setInner(v); props.onChange?.(v); };
  const pick = (next: string[]) => { setInnerPicked(next); props.onPick?.(next); };
  const toggle = (c: string) => set(codes.includes(c) ? codes.filter((x) => x !== c) : [...codes, c]);

  // the questions behind the selection
  const [open, setOpen] = useState(false);
  const [dif, setDif] = useState<"" | Difficulty>("");
  const [page, setPage] = useState(1);
  const [found, setFound] = useState<BankPage | null>(null);
  const [view, setView] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const [error, setError] = useState(false);
  const key = codes.join(",");
  useEffect(() => {
    if (props.preview === false || !codes.length) { setFound(null); return; }
    start(async () => {
      setError(false);
      const r = await targetQuestionsAction({ targets: codes, difficulty: dif || null, page, mcqOnly: props.mcqOnly }).catch(() => ({ error: "x" } as { ok?: BankPage; error?: string }));
      if (r.ok) setFound(r.ok); else setError(true);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, dif, page, props.preview, props.mcqOnly]);

  return (
    <fieldset className="grid gap-3">
      <legend className="sr-only">{t(props.legend ?? "What to practise")}</legend>
      {props.name && codes.map((c) => <input key={c} type="hidden" name={props.name} value={c} />)}
      {props.pickName && picked.map((id) => <input key={id} type="hidden" name={props.pickName} value={id} />)}
      <div className="flex flex-wrap items-center gap-2">
        <p className="me-auto text-sm font-semibold text-ink-2">{t(props.legend ?? "What to practise")} <span className="font-normal text-muted">· {t("{n} selected", { n: codes.length })}</span></p>
        <button type="button" onClick={() => set(all)} className={`${BTN} bg-surface text-teal-ink ring-line`}>{t("Select all")}</button>
        <button type="button" onClick={() => { set([]); pick([]); }} className={`${BTN} bg-surface text-ink-2 ring-line`}>{t("Clear")}</button>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {props.groups.map((g) => {
          const on = g.items.filter((i) => codes.includes(i.code)).length;
          return (
            <div key={g.key} className="rounded-xl bg-surface-2 p-3 ring-1 ring-line">
              <div className="flex flex-wrap items-center gap-1.5">
                <p className="me-auto text-xs font-semibold uppercase tracking-wide text-muted">{t(g.label)} <span className="tabular-nums normal-case">({on}/{g.items.length})</span></p>
                <button type="button" onClick={() => set([...codes, ...g.items.map((i) => i.code)])} className={`${BTN} min-h-8 bg-surface text-teal-ink ring-line`} aria-label={`${t("Select all")} · ${t(g.label)}`}>{t("Select all")}</button>
                <button type="button" onClick={() => set(codes.filter((c) => !g.items.some((i) => i.code === c)))} className={`${BTN} min-h-8 bg-surface text-ink-2 ring-line`} aria-label={`${t("Clear")} · ${t(g.label)}`}>{t("Clear")}</button>
              </div>
              {g.items.map((i) => (
                <div key={i.code} className="mt-1.5 flex items-start justify-between gap-2">
                  <label className="flex min-h-9 items-start gap-2 text-sm text-ink"><input type="checkbox" checked={codes.includes(i.code)} onChange={() => toggle(i.code)} className="mt-1 h-4 w-4 shrink-0" /><span>{i.label}</span></label>
                  {props.onCount && codes.includes(i.code) && <input type="number" min={0} max={60} value={props.counts?.[i.code] ?? 1} onChange={(e) => props.onCount!(i.code, Number(e.target.value))} className="min-h-9 w-16 rounded-lg bg-surface px-2 tabular-nums ring-1 ring-line" aria-label={t("Questions for {skill}", { skill: i.label })} />}
                </div>
              ))}
            </div>
          );
        })}
      </div>
      {props.preview !== false && codes.length > 0 && (
        <section className="rounded-xl bg-surface p-3 ring-1 ring-teal-200" aria-label={t("The questions behind your choice")}>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="me-auto min-h-10 text-start text-sm font-semibold text-teal-ink">
              {open ? "▾" : "▸"} {t("The questions behind your choice")}: <span className="tabular-nums">{found ? found.total : busy ? "…" : "—"}</span>
            </button>
            {picked.length > 0 && <span className="rounded-full bg-teal-50 px-2.5 py-0.5 text-xs font-semibold text-teal-900 ring-1 ring-teal-200">{t("{n} chosen question(s): only these are used", { n: picked.length })} <button type="button" onClick={() => pick([])} className="ms-1 underline">{t("Clear")}</button></span>}
          </div>
          {open && (
            <div className="mt-2 grid gap-2">
              <div className="flex flex-wrap gap-1.5" role="group" aria-label={t("Difficulty")}>
                {(["", 1, 2, 3] as const).map((k) => <button key={String(k)} type="button" aria-pressed={dif === k} onClick={() => { setDif(k); setPage(1); }} className={`${BTN} ${dif === k ? "bg-brand-navy text-white ring-brand-navy" : "bg-surface text-ink-2 ring-line"}`}>{k ? t(DIFFICULTY_NAME[k]) : t("Any")}</button>)}
                {found && found.rows.length > 0 && <button type="button" onClick={() => pick([...new Set([...picked, ...found.rows.map((r) => r.id)])])} className={`${BTN} ms-auto bg-surface text-teal-ink ring-line`}>{t("Choose this page")}</button>}
              </div>
              {error && <p role="alert" className="text-sm text-rose-700">{t("The questions could not be loaded. Please try again.")}</p>}
              {found && !found.rows.length && <p className="text-sm text-muted">{t("No questions match.")}</p>}
              <ul className="grid gap-1.5">
                {found?.rows.map((r) => (
                  <li key={r.id} className="rounded-lg bg-surface-2 p-2 ring-1 ring-line">
                    <div className="flex items-start gap-2">
                      <input type="checkbox" checked={picked.includes(r.id)} onChange={() => pick(picked.includes(r.id) ? picked.filter((x) => x !== r.id) : [...picked, r.id])} className="mt-1 h-4 w-4 shrink-0" aria-label={t("Choose this question")} />
                      <button type="button" aria-expanded={view === r.id} onClick={() => setView(view === r.id ? null : r.id)} className="min-w-0 flex-1 text-start">
                        <span className="block text-sm text-ink" lang="en" dir="ltr">{r.stem}</span>
                        <span className="mt-0.5 flex flex-wrap gap-1 text-[11px]">
                          <span className={`rounded-full px-2 py-0.5 font-semibold ring-1 ${DIF_CHIP[r.difficulty]}`}>{t(DIFFICULTY_NAME[r.difficulty])}</span>
                          {r.standard && <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-indigo-900 ring-1 ring-indigo-200">{codeName(r.standard, t)}</span>}
                          <span className="rounded-full bg-surface px-2 py-0.5 text-ink-2 ring-1 ring-line">{t(r.skill)}</span>
                          {r.hasPassage && <span className="rounded-full bg-surface px-2 py-0.5 text-ink-2 ring-1 ring-line">📄 {r.passageTitle ?? t("Passage")}</span>}
                        </span>
                      </button>
                    </div>
                    {view === r.id && (r.options.length ? (
                      <ol className="mt-2 grid gap-1 ps-6 sm:grid-cols-2" lang="en" dir="ltr">
                        {r.options.map((o, i) => <li key={i} className={`rounded-md px-2 py-1 text-xs ring-1 ${i === r.correct ? "bg-emerald-50 font-semibold text-emerald-900 ring-emerald-200" : "bg-surface text-ink-2 ring-line"}`}><b>{"ABCD"[i]}.</b> {o}</li>)}
                      </ol>
                    ) : <p className="mt-2 ps-6 text-xs text-muted">✍ {t("Short written answer")}</p>)}
                  </li>
                ))}
              </ul>
              {found && found.pages > 1 && (
                <div className="flex items-center justify-between text-sm">
                  {found.page > 1 ? <button type="button" onClick={() => setPage(found.page - 1)} className="font-semibold text-teal-ink">‹ {t("Previous")}</button> : <span />}
                  <span className="text-muted">{t("Page {n} of {total}", { n: found.page, total: found.pages })}</span>
                  {found.page < found.pages ? <button type="button" onClick={() => setPage(found.page + 1)} className="font-semibold text-teal-ink">{t("Next")} ›</button> : <span />}
                </div>
              )}
            </div>
          )}
        </section>
      )}
    </fieldset>
  );
}
