"use client";
/**
 * 🔁 Review test builder (a question source of the test builder): the teacher mixes SEVERAL selections —
 * units / weeks (text sets) / lessons (sections) of the Curriculum Map, skills and standards, each with its own number
 * of questions — and "✨ Suggest for me" fills them all; and searches the question bank (skill, type, level,
 * passage, words) to add questions one by one. Everything lands in the builder's selected list, where every question
 * can be viewed, replaced, edited (a teacher copy), removed, reordered and given points.
 */
import { useMemo, useState } from "react";
import { useT } from "@/i18n/client";
import type { BuilderSkill } from "@/server/tests/assessments";
import type { MapSourceQuestion, MapSourceTree } from "@/server/tests/map-source";
import type { BankResults, ReviewSelection, ReviewSuggestion } from "@/server/tests/review";
import { bankSearchAction, mapTreeAction, reviewStandardsAction, reviewSuggestAction } from "../actions";
import { QuestionDrawer } from "@/components/tests/question-drawer";
import { Combo } from "@/components/ui/combo";
import { RichInline } from "@/components/rich-inline";

const LEVELS = [{ id: "MIXED", label: "Mixed levels" }, { id: "BELOW", label: "Approaching" }, { id: "ON", label: "Meeting" }, { id: "ABOVE", label: "Exceeding" }] as const;
const TYPES = [
  ["", "All types"], ["MULTIPLE_CHOICE", "Multiple choice"], ["MULTI_SELECT", "Multiple select"], ["TRUE_FALSE", "True / False"], ["FILL_BLANK", "Fill in the blank"],
  ["TWO_PART", "Two-part"], ["GRID", "Grid"], ["HOT_TEXT", "Hot text"], ["MATCHING", "Matching"], ["SENTENCE_ORDER", "Order"], ["ERROR_CORRECTION", "Error correction"],
] as const;
const KIND_ICON: Record<string, string> = { LESSON: "📚", SKILL: "🧩", STANDARD: "🎯" };
const chip = (on: boolean) => `min-h-10 rounded-full px-3.5 text-sm font-semibold ring-1 ${on ? "bg-brand-navy text-white ring-brand-navy" : "bg-white text-brand-navy ring-slate-300"}`;
const field = "min-h-11 rounded-xl px-3 ring-1 ring-slate-300";
const add = "min-h-9 shrink-0 rounded-lg px-2.5 text-sm font-semibold text-brand-navy ring-1 ring-slate-300 hover:bg-slate-50";

export function ReviewSource({ tree: initialTree, skills, classId, picked, onAdd, onRemove }: {
  tree: MapSourceTree; skills: BuilderSkill[]; classId: string; picked: MapSourceQuestion[];
  onAdd: (rows: MapSourceQuestion[]) => void; onRemove: (id: string) => void;
}) {
  const t = useT();
  const [tree, setTree] = useState(initialTree);
  const [selections, setSelections] = useState<ReviewSelection[]>([]);
  const [level, setLevel] = useState<(typeof LEVELS)[number]["id"]>("MIXED");
  const [skillQ, setSkillQ] = useState("");
  const [stdQ, setStdQ] = useState("");
  const [standards, setStandards] = useState<{ code: string; text: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<ReviewSuggestion | null>(null);
  const pickedIds = new Set(picked.map((p) => p.id));
  const has = (kind: string, ref: string) => selections.some((x) => x.kind === kind && x.ref === ref);
  const toggleSel = (kind: ReviewSelection["kind"], ref: string, label: string) => {
    setDone(null);
    setSelections((l) => (l.some((x) => x.kind === kind && x.ref === ref) ? l.filter((x) => !(x.kind === kind && x.ref === ref)) : [...l, { kind, ref, label, count: 5 }]));
  };
  const total = selections.reduce((a, x) => a + x.count, 0);
  const foundSkills = useMemo(() => {
    const w = skillQ.trim().toLowerCase();
    if (!w) return [];
    return skills.filter((k) => k.available > 0 && k.names.some((n) => n.toLowerCase().includes(w))).slice(0, 30);
  }, [skills, skillQ]);

  async function chooseGrade(g: number) {
    if (g === tree.grade) return;
    setBusy(true); setError(null);
    const r = await mapTreeAction(g);
    setBusy(false);
    if (r.error) return setError(t(r.error));
    setTree(r.tree!);
  }
  async function findStandards() {
    setBusy(true); setError(null);
    const r = await reviewStandardsAction(stdQ);
    setBusy(false);
    if (r.error) return setError(t(r.error));
    setStandards(r.standards ?? []);
  }
  async function suggest() {
    if (!selections.length) return setError(t("Add at least one selection: a unit, week, lesson, skill or standard."));
    setBusy(true); setError(null); setDone(null);
    const r = await reviewSuggestAction({ selections, level, classId: classId || null, exclude: picked.map((p) => p.id) });
    setBusy(false);
    if (r.error) return setError(t(r.error));
    setDone(r.suggestion!);
    onAdd(r.suggestion!.groups.flatMap((g) => g.questions));
  }

  return (
    <div className="mt-3 grid gap-5 rounded-2xl bg-fuchsia-50/30 p-4 ring-1 ring-fuchsia-200" aria-busy={busy} data-testid="review-source">
      <p className="text-sm text-slate-700">{t("A Review test mixes several selections. Add units, weeks, lessons, skills or standards, give each its number of questions, then press “Suggest for me”. You can also add questions from the question bank one by one. Then view, replace, edit, remove or reorder any question below.")}</p>

      {/* curriculum selections */}
      <fieldset className="grid gap-2">
        <legend className="font-semibold text-brand-navy">📚 {t("From the curriculum")} <span className="text-sm font-normal text-slate-500">({t("units, weeks and lessons")})</span></legend>
        {tree.grades.length > 1 && <div className="flex flex-wrap gap-2" role="group" aria-label={t("Grade")}>{tree.grades.map((g) => <button key={g} type="button" onClick={() => void chooseGrade(g)} aria-pressed={tree.grade === g} className={chip(tree.grade === g)}>{t("Grade {n}", { n: g })}</button>)}</div>}
        {!tree.units.length ? <p className="text-sm text-slate-500">{t("No Curriculum Map questions for your grades yet. Choose skills below.")}</p> : (
          <ul className="grid max-h-80 gap-1.5 overflow-y-auto rounded-xl bg-white p-2 ring-1 ring-slate-200">
            {tree.units.map((u) => {
              const ucode = u.sets[0]?.code.split(".").slice(0, 2).join(".") ?? "";
              return (
                <li key={`${tree.grade}-${u.unit}`}>
                  <details className="group">
                    <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 rounded-lg px-2 font-semibold text-brand-navy hover:bg-slate-50">
                      <span aria-hidden="true" className="text-slate-400 transition group-open:rotate-90 rtl:-scale-x-100">▸</span>
                      <span className="flex-1" lang="en" data-content>{u.title}</span><span className="text-xs text-slate-500">{t("{n} questions", { n: u.count })}</span>
                      {ucode && u.count > 0 && <button type="button" onClick={(e) => { e.preventDefault(); toggleSel("LESSON", ucode, u.title); }} aria-pressed={has("LESSON", ucode)} className={add}>{has("LESSON", ucode) ? `✓ ${t("Unit added")}` : `+ ${t("Whole unit")}`}</button>}
                    </summary>
                    <ul className="grid gap-1 ps-6">
                      {u.sets.filter((x) => x.count > 0).map((set) => (
                        <li key={set.code} className="grid gap-0.5">
                          <div className="flex min-h-10 items-center gap-2 text-sm"><span className="flex-1"><span className="font-semibold" lang="en" data-content>{set.title}</span> <span className="text-xs text-slate-500" lang="en" data-content>{set.heading}</span></span><span className="text-xs text-slate-500">{set.count}</span>
                            <button type="button" onClick={() => toggleSel("LESSON", set.code, `${set.heading} · ${set.title}`)} aria-pressed={has("LESSON", set.code)} className={add}>{has("LESSON", set.code) ? "✓" : `+ ${t("Week")}`}</button></div>
                          <ul className="grid gap-0.5 ps-5">
                            {set.sections.filter((x) => x.count > 0).map((sec) => (
                              <li key={sec.code} className="flex min-h-9 items-center gap-2 text-xs text-slate-700"><span className="flex-1" lang="en" data-content>{sec.label}</span><span className="text-slate-500">{sec.count}</span>
                                <button type="button" onClick={() => toggleSel("LESSON", sec.code, `${set.title} · ${sec.label}`)} aria-pressed={has("LESSON", sec.code)} className={add}>{has("LESSON", sec.code) ? "✓" : `+ ${t("Lesson")}`}</button></li>
                            ))}
                          </ul>
                        </li>
                      ))}
                    </ul>
                  </details>
                </li>
              );
            })}
          </ul>
        )}
      </fieldset>

      <div className="grid gap-4 md:grid-cols-2">
        <fieldset className="grid content-start gap-2">
          <legend className="font-semibold text-brand-navy">🧩 {t("Skills")}</legend>
          <input type="search" value={skillQ} onChange={(e) => setSkillQ(e.target.value)} placeholder={t("Search a skill…")} aria-label={t("Search a skill")} className={`${field} w-full`} />
          {skillQ.trim() && (
            <ul className="grid max-h-56 gap-0.5 overflow-y-auto rounded-xl bg-white p-2 ring-1 ring-slate-200">
              {!foundSkills.length ? <li className="px-2 py-1 text-sm text-slate-500">{t("Nothing matches your search")}</li> : foundSkills.map((k) => (
                <li key={k.id} className="flex min-h-10 items-center gap-2 text-sm"><span className="flex-1" lang="en" data-content>{k.name}</span><span className="text-xs text-slate-500">{t("Grade {n}", { n: k.grade })} · {t("{n} questions", { n: k.available })}</span>
                  <button type="button" onClick={() => toggleSel("SKILL", k.id, k.name)} aria-pressed={has("SKILL", k.id)} className={add}>{has("SKILL", k.id) ? "✓" : "+"}</button></li>
              ))}
            </ul>
          )}
        </fieldset>
        <fieldset className="grid content-start gap-2">
          <legend className="font-semibold text-brand-navy">🎯 {t("Standards")}</legend>
          <div className="flex gap-2"><input value={stdQ} onChange={(e) => setStdQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void findStandards(); } }} placeholder={t("Standard code, e.g. RL.4.1")} aria-label={t("Standard code")} className={`${field} w-full`} dir="ltr" />
            <button type="button" disabled={busy || stdQ.trim().length < 2} onClick={() => void findStandards()} className="min-h-11 rounded-xl px-4 font-semibold text-brand-navy ring-1 ring-slate-300 disabled:opacity-50">{t("Find")}</button></div>
          {standards.length > 0 && (
            <ul className="grid max-h-56 gap-0.5 overflow-y-auto rounded-xl bg-white p-2 ring-1 ring-slate-200">
              {standards.map((x) => <li key={x.code} className="flex min-h-10 items-center gap-2 text-sm"><span className="flex-1"><b dir="ltr">{x.code}</b> <span className="text-xs text-slate-500" lang="en" data-content>{x.text}</span></span>
                <button type="button" onClick={() => toggleSel("STANDARD", x.code, x.code)} aria-pressed={has("STANDARD", x.code)} className={add}>{has("STANDARD", x.code) ? "✓" : "+"}</button></li>)}
            </ul>
          )}
        </fieldset>
      </div>

      {/* the selections, each with its number of questions */}
      <section className="rounded-xl bg-white p-3 ring-1 ring-slate-200" aria-label={t("Your selections")}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-semibold text-brand-navy">{t("Your selections")}</p>
          <p data-testid="review-total" className="rounded-full bg-brand-navy px-3 py-1 text-sm font-bold text-white">{t("{n} selections · {m} questions", { n: selections.length, m: total })}</p>
        </div>
        {!selections.length ? <p className="mt-2 text-sm text-slate-500">{t("Nothing chosen yet: add units, weeks, lessons, skills or standards above.")}</p> : (
          <ul className="mt-2 grid gap-1.5">
            {selections.map((x, i) => {
              const g = done?.groups.find((d) => d.key === `${x.kind}:${x.ref}`);
              return (
                <li key={`${x.kind}:${x.ref}`} className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 px-2 py-1.5 text-sm">
                  <span aria-hidden="true">{KIND_ICON[x.kind]}</span>
                  <span className="min-w-0 flex-1 font-semibold" lang="en" data-content>{x.label}</span>
                  {g && <span className="text-xs text-emerald-800">✓ {t("{n} added", { n: g.questions.length })}</span>}
                  <label className="flex items-center gap-1 text-xs text-slate-600"><input type="number" min={1} max={20} value={x.count} onChange={(e) => { const n = Math.max(1, Math.min(20, Number(e.target.value) || 1)); setSelections((l) => l.map((y, k) => (k === i ? { ...y, count: n } : y))); }} aria-label={t("Number of questions for {name}", { name: x.label })} className="min-h-9 w-16 rounded-lg px-2 text-sm ring-1 ring-slate-300" />{t("questions")}</label>
                  <button type="button" onClick={() => toggleSel(x.kind, x.ref, x.label)} aria-label={t("Remove {name}", { name: x.label })} className="min-h-9 rounded-lg px-2 text-sm font-semibold text-rose-700 ring-1 ring-rose-200">✕</button>
                </li>
              );
            })}
          </ul>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-slate-700">{t("Level")}</span>
          {LEVELS.map((l) => <button key={l.id} type="button" onClick={() => setLevel(l.id)} aria-pressed={level === l.id} className={chip(level === l.id)}>{t(l.label)}</button>)}
          <button type="button" disabled={busy || !selections.length} onClick={() => void suggest()} className="ms-auto inline-flex min-h-11 items-center rounded-xl bg-fuchsia-700 px-5 font-semibold text-white disabled:opacity-50">{busy ? t("Working…") : `✨ ${t("Suggest for me")}`}</button>
        </div>
        {done && done.notes.length > 0 && <ul className="mt-2 rounded-lg bg-amber-50 p-2 text-sm text-amber-900 ring-1 ring-amber-200">{done.notes.map((n) => <li key={n}>{t(n)}</li>)}</ul>}
      </section>

      <BankSearch skills={skills} pickedIds={pickedIds} onAdd={onAdd} onRemove={onRemove} />
      {error && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-red-700">{error}</p>}
    </div>
  );
}

/** 🔎 The question bank: search and filter, add questions one by one. */
function BankSearch({ skills, pickedIds, onAdd, onRemove }: { skills: BuilderSkill[]; pickedIds: Set<string>; onAdd: (rows: MapSourceQuestion[]) => void; onRemove: (id: string) => void }) {
  const t = useT();
  const [skillId, setSkillId] = useState("");
  const [type, setType] = useState("");
  const [level, setLevel] = useState("");
  const [passage, setPassage] = useState<"" | "WITH" | "WITHOUT">("");
  const [q, setQ] = useState("");
  const [mine, setMine] = useState(false);
  const [res, setRes] = useState<BankResults | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewAt, setViewAt] = useState<number | null>(null);
  const withQuestions = useMemo(() => skills.filter((k) => k.available > 0).sort((a, b) => a.name.localeCompare(b.name)), [skills]);
  async function search(page = 1) {
    setBusy(true); setError(null);
    const r = await bankSearchAction({ skillId: skillId || null, type: type || null, level: level || null, passage, q, page, mine });
    setBusy(false);
    if (r.error) return setError(t(r.error));
    setRes(r.results!); setViewAt(null);
  }
  return (
    <section className="rounded-xl bg-white p-3 ring-1 ring-slate-200" aria-label={t("From the question bank")}>
      <p className="font-semibold text-brand-navy">🔎 {t("From the question bank")}</p>
      <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <label className="text-sm font-semibold text-slate-700">{t("Skill")}<Combo label={t("Skill")} value={skillId} onChange={setSkillId} options={[{ value: "", label: t("Any skill") }, ...withQuestions.map((k) => ({ value: k.id, label: k.name, hint: `G${k.grade}` }))]} className="mt-1 font-normal" dir="ltr" /></label>
        <label className="text-sm font-semibold text-slate-700">{t("Question type")}<select value={type} onChange={(e) => setType(e.target.value)} className={`${field} mt-1 block w-full font-normal`}>{TYPES.map(([c, l]) => <option key={c} value={c}>{t(l)}</option>)}</select></label>
        <label className="text-sm font-semibold text-slate-700">{t("Difficulty")}<select value={level} onChange={(e) => setLevel(e.target.value)} className={`${field} mt-1 block w-full font-normal`}><option value="">{t("Any")}</option><option value="BELOW">{t("Approaching")}</option><option value="ON">{t("Meeting")}</option><option value="ABOVE">{t("Exceeding")}</option></select></label>
        <label className="text-sm font-semibold text-slate-700">{t("Passage")}<select value={passage} onChange={(e) => setPassage(e.target.value as "" | "WITH" | "WITHOUT")} className={`${field} mt-1 block w-full font-normal`}><option value="">{t("Any")}</option><option value="WITH">{t("With a passage")}</option><option value="WITHOUT">{t("No passage")}</option></select></label>
        <label className="text-sm font-semibold text-slate-700 lg:col-span-2">{t("Words in the question")}<input type="search" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void search(1); } }} className={`${field} mt-1 block w-full font-normal`} /></label>
      </div>
      {/* ✏️ the teacher's own edited copies are private: only here, never in the shared bank */}
      <label className="mt-2 flex min-h-11 items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} className="h-4 w-4" /> ✏️ {t("Only my edited copies (private to me)")}</label>
      <button type="button" disabled={busy} onClick={() => void search(1)} className="mt-2 inline-flex min-h-11 items-center rounded-xl bg-brand-navy px-5 font-semibold text-white disabled:opacity-50">{busy ? t("Working…") : t("Search the bank")}</button>
      {error && <p role="alert" className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {res && (
        <div className="mt-3">
          <p className="text-sm text-slate-600">{t("{n} questions found", { n: res.total })}</p>
          {!res.rows.length ? <p className="mt-2 rounded-lg bg-slate-50 px-3 py-3 text-center text-sm text-slate-600">{t("No questions match these filters.")}</p> : (
            <ul className="mt-2 grid gap-1">
              {res.rows.map((r, i) => (
                <li key={r.id} className="flex items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-50">
                  <span className="min-w-0 flex-1 text-sm">
                    <button type="button" onClick={() => setViewAt(i)} className="block text-start text-slate-900 hover:underline" lang="en" dir="ltr" data-content><RichInline text={r.stem} /></button>
                    <span className="text-xs text-slate-500">{r.typeLabel}{r.skill ? <> · <span lang="en" data-content>{r.skill}</span></> : null}{r.passageTitle ? <> · <span lang="en" data-content>📖 {r.passageTitle}</span></> : null}</span>
                  </span>
                  <button type="button" onClick={() => setViewAt(i)} className={add}>👁 {t("View")}</button>
                  {pickedIds.has(r.id) ? <button type="button" onClick={() => onRemove(r.id)} className="min-h-9 shrink-0 rounded-lg bg-teal-50 px-2.5 text-sm font-semibold text-teal-800 ring-1 ring-teal-300">✓ {t("Added")}</button>
                    : <button type="button" onClick={() => onAdd([r])} className={add}>+ {t("Add")}</button>}
                </li>
              ))}
            </ul>
          )}
          {res.pages > 1 && (
            <div className="mt-2 flex items-center justify-center gap-3 text-sm">
              <button type="button" disabled={busy || res.page <= 1} onClick={() => void search(res.page - 1)} className="min-h-9 rounded-lg px-3 font-semibold text-brand-navy ring-1 ring-slate-300 disabled:opacity-40">{t("Previous")}</button>
              <span className="text-slate-600">{t("Page {n} of {m}", { n: res.page, m: res.pages })}</span>
              <button type="button" disabled={busy || res.page >= res.pages} onClick={() => void search(res.page + 1)} className="min-h-9 rounded-lg px-3 font-semibold text-brand-navy ring-1 ring-slate-300 disabled:opacity-40">{t("Next")}</button>
            </div>
          )}
          {viewAt !== null && res.rows[viewAt] && (
            <QuestionDrawer ids={res.rows.map((x) => x.id)} index={viewAt} onIndex={setViewAt} onClose={() => setViewAt(null)}
              isSelected={(id) => pickedIds.has(id)} onToggle={(d, on) => (on ? onAdd([d.row]) : onRemove(d.id))} />
          )}
        </div>
      )}
    </section>
  );
}
