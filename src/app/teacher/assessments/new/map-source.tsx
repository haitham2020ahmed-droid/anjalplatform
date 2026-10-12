"use client";
/**
 * 📚 Curriculum Map questions (a source of the test builder): Grade → Unit → Text Set / Selection → sections.
 * Everything starts collapsed; a section's questions are read only when it is opened, a page at a time.
 * The sections come from the map itself (any new kind of section appears by itself).
 */
import { useState } from "react";
import { useT } from "@/i18n/client";
import { EmptyState } from "@/components/ui-kit";
import type { MapSectionPage, MapSourceQuestion, MapSourceSection, MapSourceTree } from "@/server/tests/map-source";
import { mapSectionAction, mapTreeAction } from "../actions";

const LEVEL_LABEL: Record<string, string> = { ALL: "All", BELOW: "Below", ON: "On", ABOVE: "Above" };
const LEVEL_CHIP: Record<string, string> = { BELOW: "bg-amber-50 text-amber-900 ring-amber-200", ON: "bg-sky-50 text-sky-900 ring-sky-200", ABOVE: "bg-violet-50 text-violet-900 ring-violet-200" };
const chip = (on: boolean) => `min-h-9 rounded-full px-3 text-sm font-semibold ring-1 ${on ? "bg-brand-navy text-white ring-brand-navy" : "bg-white text-brand-navy ring-slate-300"}`;
const count = "rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600";

export interface MapSourceProps {
  initialTree: MapSourceTree;
  picked: MapSourceQuestion[];
  /** add these questions (the builder refuses repeats and explains) */
  onAdd: (rows: MapSourceQuestion[]) => void;
  onRemove: (id: string) => void;
}

export function MapQuestionSource({ initialTree, picked, onAdd, onRemove }: MapSourceProps) {
  const t = useT();
  const [tree, setTree] = useState(initialTree);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pickedIds = new Set(picked.map((p) => p.id));

  async function chooseGrade(g: number) {
    if (g === tree.grade) return;
    setBusy(true); setError(null);
    const r = await mapTreeAction(g);
    setBusy(false);
    if (r.error) return setError(t(r.error));
    setTree(r.tree!);
  }

  if (!tree.grades.length) return <EmptyState compact icon="🗺" title="No Curriculum Map yet" text="The Curriculum Map of your classes' grades has no questions yet. Use Skills & grammar." className="mt-3" />;
  return (
    <div className="mt-3 grid gap-3" aria-busy={busy}>
      {tree.grades.length > 1 && (
        <div className="flex flex-wrap gap-2" role="group" aria-label={t("Grade")}>
          {tree.grades.map((g) => <button key={g} type="button" onClick={() => void chooseGrade(g)} aria-pressed={tree.grade === g} className={chip(tree.grade === g)}>{t("Grade {n}", { n: g })}</button>)}
        </div>
      )}
      {error && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-red-700">{error}</p>}
      {!tree.units.length ? <EmptyState compact icon="🗺" title="No Curriculum Map yet" text="The Curriculum Map of your classes' grades has no questions yet. Use Skills & grammar." /> : (
        <ul className="grid gap-2">
          {tree.units.map((u) => (
            <li key={`${tree.grade}-${u.unit}`}>
              <details className="group rounded-xl bg-white ring-1 ring-slate-200">
                <summary className="flex min-h-11 cursor-pointer list-none items-center gap-3 rounded-xl px-4 py-2 font-semibold text-brand-navy hover:bg-slate-50">
                  <span aria-hidden="true" className="text-slate-400 transition group-open:rotate-90 rtl:-scale-x-100">▸</span>
                  <span className="flex-1" lang="en" data-content>{u.title}</span>
                  <span className={count}>{t("{n} questions", { n: u.count })}</span>
                </summary>
                <ul className="grid gap-2 px-3 pb-3">
                  {u.sets.map((set) => (
                    <li key={set.code}>
                      <details className="group/set rounded-xl bg-slate-50 ring-1 ring-slate-200">
                        <summary className="flex min-h-11 cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 rounded-xl px-3 py-2 hover:bg-slate-100">
                          <span aria-hidden="true" className="text-slate-400 transition group-open/set:rotate-90 rtl:-scale-x-100">▸</span>
                          <span className="flex-1">
                            <span className="block text-xs font-semibold text-slate-500" lang="en" data-content>{set.heading}</span>
                            <span className="block font-semibold text-slate-900" lang="en" data-content>{set.title}</span>
                          </span>
                          <span className={count}>{t("{n} questions", { n: set.count })}</span>
                          {set.keyWords.length > 0 && (
                            <span className="flex w-full flex-wrap items-center gap-1 ps-6 text-xs">
                              <span className="font-semibold text-slate-500">{t("Key words")}:</span>
                              {set.keyWords.map((w) => <span key={w} lang="en" data-content className="rounded-full bg-white px-2 py-0.5 text-slate-700 ring-1 ring-slate-200">{w}</span>)}
                            </span>
                          )}
                        </summary>
                        <ul className="grid gap-1.5 px-3 pb-3">
                          {set.sections.map((sec) => <li key={sec.code}><SectionBlock section={sec} pickedIds={pickedIds} picked={picked} onAdd={onAdd} onRemove={onRemove} /></li>)}
                        </ul>
                      </details>
                    </li>
                  ))}
                </ul>
              </details>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SectionBlock({ section, pickedIds, picked, onAdd, onRemove }: { section: MapSourceSection; pickedIds: Set<string>; picked: MapSourceQuestion[]; onAdd: (rows: MapSourceQuestion[]) => void; onRemove: (id: string) => void }) {
  const t = useT();
  const [data, setData] = useState<MapSectionPage | null>(null);
  const [type, setType] = useState("ALL");
  const [level, setLevel] = useState("ALL");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const chosenHere = picked.filter((p) => p.code === section.code).length;

  async function load(page: number, ty = type, lv = level) {
    setBusy(true); setError(null);
    const r = await mapSectionAction({ code: section.code, page, type: ty, level: lv });
    setBusy(false);
    if (r.error) return setError(t(r.error));
    setData(r.page!);
  }
  async function selectAll() {
    setBusy(true); setError(null);
    const r = await mapSectionAction({ code: section.code, type, level, all: true });
    setBusy(false);
    if (r.error) return setError(t(r.error));
    onAdd(r.page!.questions);
  }

  if (!section.count) return <p className="flex min-h-10 items-center gap-3 rounded-lg px-3 text-sm text-slate-500"><span className="flex-1" lang="en" data-content>{section.label}</span><span>{t("No questions yet")}</span></p>;
  return (
    <details className="group/sec rounded-lg bg-white ring-1 ring-slate-200" onToggle={(e) => { if ((e.currentTarget as HTMLDetailsElement).open && !data && !busy) void load(1); }}>
      <summary className="flex min-h-10 cursor-pointer list-none items-center gap-3 rounded-lg px-3 py-1.5 text-sm hover:bg-slate-50">
        <span aria-hidden="true" className="text-slate-400 transition group-open/sec:rotate-90 rtl:-scale-x-100">▸</span>
        <span className="flex-1 font-semibold text-slate-800" lang="en" data-content>{section.label}</span>
        {chosenHere > 0 && <span className="rounded-full bg-teal-50 px-2.5 py-0.5 text-xs font-semibold text-teal-800 ring-1 ring-teal-200">{t("{n} selected", { n: chosenHere })}</span>}
        <span className={count}>{t("{n} questions", { n: section.count })}</span>
      </summary>
      <div className="grid gap-2 border-t border-slate-100 p-3">
        {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        {!data ? <p className="text-sm text-slate-500" aria-busy="true">{t("Loading questions…")}</p> : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              {data.types.length > 1 && (
                <div className="flex flex-wrap gap-1.5" role="group" aria-label={t("Question type")}>
                  <button type="button" onClick={() => { setType("ALL"); void load(1, "ALL"); }} aria-pressed={type === "ALL"} className={chip(type === "ALL")}>{t("All types")}</button>
                  {data.types.map((x) => <button key={x.code} type="button" onClick={() => { setType(x.code); void load(1, x.code); }} aria-pressed={type === x.code} className={chip(type === x.code)}>{x.label} ({x.count})</button>)}
                </div>
              )}
              {data.levels.length > 1 && (
                <div className="flex flex-wrap gap-1.5" role="group" aria-label={t("Level")}>
                  {["ALL", ...data.levels.map((l) => l.level)].map((l) => <button key={l} type="button" onClick={() => { setLevel(l); void load(1, type, l); }} aria-pressed={level === l} className={chip(level === l)}>{t(LEVEL_LABEL[l])}</button>)}
                </div>
              )}
              <button type="button" disabled={busy || !data.total} onClick={() => void selectAll()} className="ms-auto min-h-9 rounded-xl px-3 text-sm font-semibold text-brand-navy ring-1 ring-slate-300 hover:bg-slate-50 disabled:opacity-50">{t("Select all in section ({n})", { n: data.total })}</button>
            </div>
            {!data.questions.length ? <p className="rounded-lg bg-slate-50 px-3 py-3 text-center text-sm text-slate-600">{t("No questions match these filters.")}</p> : (
              <ul className="grid gap-1">
                {data.questions.map((q) => (
                  <li key={q.id}>
                    <label className="flex cursor-pointer items-start gap-3 rounded-lg px-2 py-1.5 hover:bg-slate-50">
                      <input type="checkbox" className="mt-1 h-5 w-5 shrink-0 accent-brand-teal" checked={pickedIds.has(q.id)} onChange={(e) => (e.target.checked ? onAdd([q]) : onRemove(q.id))} />
                      <span className="flex-1 text-sm">
                        <span className="block text-slate-900" lang="en" dir="ltr" data-content>{q.stem}</span>
                        <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                          <span>{q.typeLabel}</span>
                          <span className={`rounded-full px-2 py-0.5 font-semibold ring-1 ${LEVEL_CHIP[q.level]}`}>{t(LEVEL_LABEL[q.level])}</span>
                          {q.passageTitle && <span lang="en" data-content>📖 {q.passageTitle}</span>}
                        </span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
            {data.pages > 1 && (
              <div className="flex items-center justify-center gap-3 text-sm">
                <button type="button" disabled={busy || data.page <= 1} onClick={() => void load(data.page - 1)} className="min-h-9 rounded-lg px-3 font-semibold text-brand-navy ring-1 ring-slate-300 disabled:opacity-40">{t("Previous")}</button>
                <span className="text-slate-600">{t("Page {n} of {m}", { n: data.page, m: data.pages })}</span>
                <button type="button" disabled={busy || data.page >= data.pages} onClick={() => void load(data.page + 1)} className="min-h-9 rounded-lg px-3 font-semibold text-brand-navy ring-1 ring-slate-300 disabled:opacity-40">{t("Next")}</button>
              </div>
            )}
          </>
        )}
      </div>
    </details>
  );
}
