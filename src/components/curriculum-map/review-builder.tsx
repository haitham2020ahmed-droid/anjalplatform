"use client";
import { useState, useTransition } from "react";
import { useT } from "@/i18n/client";
import type { CustomReviewView, ReviewSetUnit, ReviewSkillUnit, WrittenQuestion } from "@/server/curriculum-map/review-control";
import type { MapSourceQuestion } from "@/server/tests/map-source";
import {
  customBankAction, customDetailAction, customDraftAction, customEditAction, customReviewAssignAction, customReviewChangeAction,
  customSetChoicesAction, customSkillChoicesAction, customWriteAction, skillPreviewAction,
} from "@/app/teacher/review-builder/actions";
import { RichInline } from "@/components/rich-inline";
import { SourceSelect } from "@/components/assign/source-select";
import type { AssignSource } from "@/lib/assign-source";
import type { RosterClass } from "./assign-button";

const btn = "inline-flex min-h-9 items-center rounded-lg px-3 text-sm font-semibold ring-1 ring-slate-300 hover:ring-brand-teal disabled:opacity-50";
const main = "inline-flex min-h-10 items-center rounded-xl bg-brand-navy px-4 text-sm font-semibold text-white disabled:opacity-50";
const field = "mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm";
type Edit = { id: string; type: string; stem: string; options: { label: string; text: string; correct: boolean }[]; answer: boolean | null; answers: string[] };
const blank = (): WrittenQuestion => ({ stem: "", options: ["", "", "", ""], correct: 0 });
type Level = "ABOVE" | "ON" | "BELOW";
type LevelFilter = Level | "ANY";
const LV: Record<Level, string> = { ABOVE: "Exceeding", ON: "Meeting", BELOW: "Approaching" };
type Cat = "CONCEPT_VOCABULARY" | "ANALYZE_CRAFT_AND_STRUCTURE" | "REVIEW";
const CAT_LABEL: Record<Cat, string> = { CONCEPT_VOCABULARY: "Vocabulary", ANALYZE_CRAFT_AND_STRUCTURE: "Analyze Craft", REVIEW: "Review" };

/**
 * 🔁 r90/r91 Review Builder: a Review not tied to one Text Set. ✏️ Edit (a private copy), ➕ Write a question,
 * 🔎 search the bank, ✨ AI draft to check first, and two bulk collectors — 🗂️ "Text Sets" (any unit, any Set, a
 * ☐ tick per category) and 🗣️ "Language" (any Skill of the grade's plan, with a 👁 preview) — all respecting an
 * optional level filter, then ↕ reorder / ➖ remove (with a "Removed from my Review" put-back list) / 🔢 how
 * many, then ⭐ Assign it directly (Fixed or Adaptive).
 */
export function ReviewBuilder({ grade, initial, sets, skillUnits, roster }: {
  grade: number; initial: CustomReviewView; sets: ReviewSetUnit[]; skillUnits: ReviewSkillUnit[]; roster: RosterClass[];
}) {
  const t = useT();
  const [v, setV] = useState(initial);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, start] = useTransition();
  const [count, setCount] = useState(String(initial.count));
  const [tab, setTab] = useState<"" | "sets" | "skills" | "write" | "bank">("");
  const [level, setLevel] = useState<LevelFilter>("ANY");
  const [setsData, setSetsData] = useState<ReviewSetUnit[] | null>(sets.length ? sets : null);
  const [skillsData, setSkillsData] = useState<ReviewSkillUnit[] | null>(skillUnits.length ? skillUnits : null);
  const [skillQ, setSkillQ] = useState("");
  const [setPicks, setSetPicks] = useState<Record<string, Set<Cat>>>({});
  const [skillPicks, setSkillPicks] = useState<Set<string>>(new Set());
  const [preview, setPreview] = useState<{ id: string; stems: string[] } | null>(null);
  // ✏️ r91 Edit a question (my private copy) · ➕ Write · 🔎 bank search
  const [edit, setEdit] = useState<Edit | null>(null);
  const [w, setW] = useState<WrittenQuestion>(blank());
  const [q, setQ] = useState("");
  const [bank, setBank] = useState<MapSourceQuestion[] | null>(null);
  // ⭐ assign mini-form
  const [classId, setClassId] = useState(roster[0]?.id ?? "");
  const [mode, setMode] = useState<"FIXED" | "ADAPTIVE">("FIXED");
  const [target, setTarget] = useState("20");
  const [source, setSource] = useState<AssignSource | "">("");
  const [title, setTitle] = useState("Review");
  const [assignMsg, setAssignMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const apply = (r: { ok: true; value: CustomReviewView } | { ok: false; message: string }, done?: string) => {
    if (r.ok) { setV(r.value); setCount(String(r.value.count)); if (done) setMsg({ ok: true, text: done }); } else setMsg({ ok: false, text: r.message });
    return r.ok;
  };
  const go = (fn: () => Promise<unknown>) => start(async () => { setMsg(null); await fn(); });
  const ids = v.questions.map((x) => x.id);
  const move = (i: number, d: number) => go(async () => { const n = [...ids]; const j = i + d; if (j < 0 || j >= n.length) return; [n[i], n[j]] = [n[j], n[i]]; apply(await customReviewChangeAction(grade, { op: "order", questionIds: n })); });

  const setKey = (unit: number, setNumber: number) => `${unit}.${setNumber}`;
  const toggleSetCat = (unit: number, setNumber: number, cat: Cat) => {
    const key = setKey(unit, setNumber);
    setSetPicks((s) => { const n = { ...s }; const cur = new Set(n[key] ?? []); if (cur.has(cat)) cur.delete(cat); else cur.add(cat); if (cur.size) n[key] = cur; else delete n[key]; return n; });
  };
  const setPicksCount = Object.values(setPicks).reduce((n, s) => n + s.size, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-4 rounded-2xl bg-white p-4 ring-1 ring-slate-200">
        <p className="text-sm text-slate-700">
          {t("Chosen: {n}", { n: v.chosen })} · <b>{t("Students answer: {n}", { n: v.count })}</b>
        </p>
        {v.chosen > 0 && (
          <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); go(async () => { apply(await customReviewChangeAction(grade, { op: "count", count: Number(count) }), t("Saved ✓")); }); }}>
            <label className="text-sm font-semibold text-slate-700">{t("Number of questions")}
              <input type="number" min={1} max={Math.max(1, v.chosen)} value={count} onChange={(e) => setCount(e.target.value)} className={`${field} w-24`} />
            </label>
            <button className={btn} disabled={busy}>{t("Save")}</button>
          </form>
        )}
        <label className="text-sm font-semibold text-slate-700">{t("Level")}
          <select value={level} onChange={(e) => setLevel(e.target.value as LevelFilter)} className={`${field} w-40`}>
            <option value="ANY">{t("All levels")}</option>
            {(Object.keys(LV) as Level[]).map((k) => <option key={k} value={k}>{t(LV[k])}</option>)}
          </select>
        </label>
        {v.chosen > 0 && <button type="button" className={`${btn} ms-auto`} disabled={busy} onClick={() => go(async () => { if (window.confirm(t("Remove every question from this Review?"))) apply(await customReviewChangeAction(grade, { op: "reset" }), t("Saved ✓")); })}>{t("Reset")}</button>}
      </div>
      {msg && <p role={msg.ok ? "status" : "alert"} className={`rounded-xl px-4 py-2 text-sm ${msg.ok ? "bg-teal-50 text-teal-900" : "bg-red-50 text-red-800"}`}>{msg.text}</p>}

      <ol className="space-y-2" aria-label={t("Questions of the Review")}>
        {v.questions.map((x, i) => (
          <li key={x.id} data-testid="review-q" className={`rounded-xl bg-white p-3 ring-1 ${i < v.count ? "ring-slate-200" : "opacity-60 ring-dashed ring-slate-300"}`}>
            <div className="flex flex-wrap items-start gap-2">
              <span className="w-7 shrink-0 font-bold text-brand-navy">{i + 1}.</span>
              <p className="min-w-0 flex-1 text-sm text-slate-900" data-content lang="en"><RichInline text={x.stem} /></p>
              <span className="flex flex-wrap gap-1 text-xs">
                {x.own && <span className="rounded-full bg-violet-50 px-2 py-0.5 font-semibold text-violet-800 ring-1 ring-violet-200">✏️ {t("My copy")}</span>}
                <span className="rounded-full bg-slate-50 px-2 py-0.5 text-slate-600 ring-1 ring-slate-200">{x.typeLabel}</span>
                {i >= v.count && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-900 ring-1 ring-amber-200">{t("Not asked")}</span>}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5 ps-9">
              <button type="button" className={btn} disabled={busy || i === 0} onClick={() => move(i, -1)} aria-label={t("Move up")}>↑</button>
              <button type="button" className={btn} disabled={busy || i === v.questions.length - 1} onClick={() => move(i, 1)} aria-label={t("Move down")}>↓</button>
              <button type="button" className={btn} disabled={busy} onClick={() => go(async () => { const r = await customDetailAction(grade, x.id); if (r.ok) setEdit(r.value); else setMsg({ ok: false, text: r.message }); })}>✏️ {t("Edit")}</button>
              <button type="button" className={btn} disabled={busy} onClick={() => go(async () => { apply(await customReviewChangeAction(grade, { op: "remove", questionId: x.id })); })}>➖ {t("Remove")}</button>
            </div>
            {edit?.id === x.id && (
              <form className="mt-3 space-y-2 rounded-xl bg-slate-50 p-3" onSubmit={(e) => { e.preventDefault(); go(async () => { if (apply(await customEditAction(grade, { questionId: edit.id, stem: edit.stem, options: edit.options.length ? edit.options : null, answer: edit.answer, answers: edit.answers.length ? edit.answers : null }), t("Saved as your private copy ✓"))) setEdit(null); }); }}>
                <p className="text-xs text-slate-600">{t("Your change makes a private copy for your classes. The shared question is not changed.")}</p>
                <label className="block text-sm font-semibold">{t("Question")}<textarea value={edit.stem} onChange={(e) => setEdit({ ...edit, stem: e.target.value })} rows={3} className={field} /></label>
                {edit.options.map((o, k) => (
                  <label key={o.label} className="flex items-center gap-2 text-sm">
                    <input type={edit.type === "MULTI_SELECT" ? "checkbox" : "radio"} name="correct" checked={o.correct} onChange={() => setEdit({ ...edit, options: edit.options.map((y, j) => ({ ...y, correct: edit.type === "MULTI_SELECT" ? (j === k ? !y.correct : y.correct) : j === k })) })} aria-label={t("Correct answer")} />
                    <b>{o.label}</b><input value={o.text} onChange={(e) => setEdit({ ...edit, options: edit.options.map((y, j) => (j === k ? { ...y, text: e.target.value } : y)) })} className={`${field} mt-0`} />
                  </label>
                ))}
                {edit.answer !== null && (
                  <label className="text-sm">{t("Answer")} <select value={edit.answer ? "1" : "0"} onChange={(e) => setEdit({ ...edit, answer: e.target.value === "1" })} className="rounded-lg border border-slate-300 px-2 py-1"><option value="1">{t("True")}</option><option value="0">{t("False")}</option></select></label>
                )}
                <div className="flex gap-2"><button className={main} disabled={busy}>{t("Save my copy")}</button><button type="button" className={btn} onClick={() => setEdit(null)}>{t("Cancel")}</button></div>
              </form>
            )}
          </li>
        ))}
      </ol>
      {!v.questions.length && <p className="rounded-xl bg-white p-4 text-sm text-slate-600 ring-1 ring-slate-200">{t("This Review has no questions yet. Collect some below.")}</p>}

      {v.hidden.length > 0 && (
        <details className="rounded-xl bg-white p-3 ring-1 ring-slate-200">
          <summary className="cursor-pointer text-sm font-semibold text-slate-700">{t("Removed from my Review ({n})", { n: v.hidden.length })}</summary>
          <ul className="mt-2 space-y-1">{v.hidden.map((x) => (
            <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 text-sm"><span data-content lang="en" className="min-w-0 flex-1"><RichInline text={x.stem} /></span>
              <button type="button" className={btn} disabled={busy} onClick={() => go(async () => { apply(await customReviewChangeAction(grade, { op: "restore", questionId: x.id })); })}>{t("Put back")}</button></li>
          ))}</ul>
        </details>
      )}

      <section className="rounded-2xl bg-white p-4 ring-1 ring-slate-200" aria-label={t("Add questions")}>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={btn} aria-pressed={tab === "sets"}
            onClick={() => { const next = tab === "sets" ? "" : "sets"; setTab(next); if (next === "sets" && !setsData) go(async () => { const r = await customSetChoicesAction(grade); if (r.ok) setSetsData(r.value); else setMsg({ ok: false, text: r.message }); }); }}>
            🗂️ {t("Text Sets")}
          </button>
          <button type="button" className={btn} aria-pressed={tab === "skills"}
            onClick={() => { const next = tab === "skills" ? "" : "skills"; setTab(next); if (next === "skills" && !skillsData) go(async () => { const r = await customSkillChoicesAction(grade); if (r.ok) setSkillsData(r.value); else setMsg({ ok: false, text: r.message }); }); }}>
            🗣️ {t("Language")}
          </button>
          <button type="button" className={btn} aria-pressed={tab === "write"} onClick={() => setTab(tab === "write" ? "" : "write")}>➕ {t("Write a question")}</button>
          <button type="button" className={btn} aria-pressed={tab === "bank"} onClick={() => setTab(tab === "bank" ? "" : "bank")}>🔎 {t("From the bank")}</button>
          <button type="button" className={btn} disabled={busy} onClick={() => go(async () => { const r = await customDraftAction(grade); if (r.ok) { setW({ ...r.value, options: [...r.value.options] }); setTab("write"); setMsg({ ok: true, text: t("AI draft ready: check and edit it, then add it.") }); } else setMsg({ ok: false, text: r.message }); })}>✨ {t("AI draft")}</button>
        </div>

        {tab === "sets" && (
          <div className="mt-3 space-y-3">
            {!setsData ? (
              <p className="text-sm text-slate-500">{busy ? "…" : t("No Text Set matches.")}</p>
            ) : (
              <div className="max-h-96 space-y-3 overflow-y-auto rounded-xl p-1">
                {setsData.map((u) => (
                  <div key={u.unit}>
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{t("Unit {n}", { n: u.unit })} <span dir="ltr">· {u.unitTitle}</span></p>
                    <ul className="mt-1 space-y-1">
                      {u.sets.map((set) => {
                        const key = setKey(set.unit, set.setNumber);
                        const checked = setPicks[key] ?? new Set<Cat>();
                        return (
                          <li key={set.setNumber} className="rounded-lg px-2 py-1.5 hover:bg-slate-50">
                            <p className="text-sm font-semibold text-slate-800" dir="ltr">{set.title}</p>
                            <div className="mt-1 flex flex-wrap gap-3">
                              {set.categories.map((cat) => (
                                <label key={cat} className="flex items-center gap-1.5 text-xs text-slate-700">
                                  <input type="checkbox" checked={checked.has(cat)} onChange={() => toggleSetCat(set.unit, set.setNumber, cat)} />
                                  {t(CAT_LABEL[cat])}
                                </label>
                              ))}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            )}
            <button type="button" className={main} disabled={busy || !setPicksCount}
              onClick={() => go(async () => {
                const picks = Object.entries(setPicks).map(([key, cats]) => { const [unit, setNumber] = key.split(".").map(Number); return { unit, setNumber, categories: [...cats] }; });
                if (apply(await customReviewChangeAction(grade, { op: "addSets", picks, level }), t("Added ✓"))) setSetPicks({});
              })}>
              {t("Add selected ({n})", { n: setPicksCount })}
            </button>
          </div>
        )}

        {tab === "skills" && (
          <div className="mt-3 space-y-3">
            <input type="search" value={skillQ} onChange={(e) => setSkillQ(e.target.value)} placeholder={t("Search skills")} className={field} />
            {!skillsData ? (
              <p className="text-sm text-slate-500">{busy ? "…" : t("No skill matches.")}</p>
            ) : (
              <div className="max-h-96 space-y-3 overflow-y-auto rounded-xl p-1">
                {skillsData.map((u) => {
                  const matches = u.skills.filter((k) => k.name.toLowerCase().includes(skillQ.trim().toLowerCase()));
                  if (!matches.length) return null;
                  return (
                    <div key={u.number}>
                      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{t("Unit {n}", { n: u.number })}</p>
                      <ul className="mt-1 space-y-0.5">
                        {matches.map((k) => (
                          <li key={k.id}>
                            <div className="flex items-center gap-2 rounded-lg px-2 py-1 text-sm hover:bg-slate-50">
                              <label className="flex min-w-0 flex-1 items-center gap-2">
                                <input type="checkbox" checked={skillPicks.has(k.id)} onChange={() => setSkillPicks((s) => { const n = new Set(s); if (n.has(k.id)) n.delete(k.id); else n.add(k.id); return n; })} />
                                <span dir="ltr" className="truncate">{k.name}</span>
                              </label>
                              <button type="button" className="shrink-0 rounded-full px-1.5 text-xs text-slate-500 hover:bg-slate-100" disabled={busy}
                                onClick={() => go(async () => { setPreview({ id: k.id, stems: [] }); const r = await skillPreviewAction(k.id, level); setPreview({ id: k.id, stems: r.ok ? r.value : [] }); })}
                                aria-label={t("Preview")}>👁</button>
                            </div>
                            {preview?.id === k.id && (
                              <div className="ms-6 mt-1 rounded-lg bg-slate-50 p-2 text-xs text-slate-700">
                                {preview.stems.length ? preview.stems.map((st, i) => <p key={i} dir="ltr" className="truncate"><RichInline text={st} /></p>) : <p>{busy ? "…" : t("No questions to show.")}</p>}
                              </div>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            )}
            <button type="button" className={main} disabled={busy || !skillPicks.size}
              onClick={() => go(async () => { if (apply(await customReviewChangeAction(grade, { op: "addSkills", skillIds: [...skillPicks], level }), t("Added ✓"))) setSkillPicks(new Set()); })}>
              {t("Add selected ({n})", { n: skillPicks.size })}
            </button>
          </div>
        )}

        {tab === "write" && (
          <form className="mt-3 space-y-2" onSubmit={(e) => { e.preventDefault(); go(async () => { if (apply(await customWriteAction(grade, w), t("Added ✓"))) setW(blank()); }); }}>
            <label className="block text-sm font-semibold">{t("Question")}<textarea value={w.stem} onChange={(e) => setW({ ...w, stem: e.target.value })} rows={3} className={field} /></label>
            {w.options.map((o, k) => (
              <label key={k} className="flex items-center gap-2 text-sm">
                <input type="radio" name="w-correct" checked={w.correct === k} onChange={() => setW({ ...w, correct: k })} aria-label={t("Correct answer")} />
                <b>{"ABCDEF"[k]}</b><input value={o} onChange={(e) => setW({ ...w, options: w.options.map((y, j) => (j === k ? e.target.value : y)) })} className={`${field} mt-0`} />
              </label>
            ))}
            <p className="text-xs text-slate-500">{t("Tick the correct answer. The question is private to you.")}</p>
            <div className="flex gap-2">
              {w.options.length < 6 && <button type="button" className={btn} onClick={() => setW({ ...w, options: [...w.options, ""] })}>{t("Add a choice")}</button>}
              <button className={main} disabled={busy}>{t("Add to my Review")}</button>
            </div>
          </form>
        )}
        {tab === "bank" && (
          <div className="mt-3 space-y-2">
            <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); go(async () => { const r = await customBankAction({ q }); if (r.ok) setBank(r.value.rows); else setMsg({ ok: false, text: r.message }); }); }}>
              <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Words from the question (3 letters or more)")} className={`${field} mt-0`} />
              <button className={btn} disabled={busy}>{t("Search")}</button>
              <button type="button" className={btn} disabled={busy} onClick={() => go(async () => { const r = await customBankAction({ mine: true }); if (r.ok) setBank(r.value.rows); else setMsg({ ok: false, text: r.message }); })}>{t("My edited copies")}</button>
            </form>
            {bank && (bank.length ? (
              <ul className="divide-y divide-slate-100">{bank.map((x) => (
                <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"><span data-content lang="en" className="min-w-0 flex-1"><RichInline text={x.stem} /></span>
                  <button type="button" className={btn} disabled={busy || ids.includes(x.id)} onClick={() => go(async () => { apply(await customReviewChangeAction(grade, { op: "addBank", questionId: x.id }), t("Added ✓")); })}>{ids.includes(x.id) ? "✓" : t("Add")}</button></li>
              ))}</ul>
            ) : <p className="text-sm text-slate-600">{t("No question matches.")}</p>)}
          </div>
        )}
      </section>

      {v.chosen > 0 && roster.length > 0 && (
        <section className="rounded-2xl bg-white p-4 ring-1 ring-slate-200" aria-label={t("Assign")}>
          <h2 className="font-semibold text-slate-900">⭐ {t("Assign")}</h2>
          {assignMsg && <p role={assignMsg.ok ? "status" : "alert"} className={`mt-2 rounded-xl px-4 py-2 text-sm ${assignMsg.ok ? "bg-teal-50 text-teal-900" : "bg-red-50 text-red-800"}`}>{assignMsg.text}</p>}
          <form className="mt-3 grid gap-3 sm:grid-cols-2" onSubmit={(e) => {
            e.preventDefault();
            go(async () => {
              setAssignMsg(null);
              const r = await customReviewAssignAction({
                grade, classId, source, title,
                adaptive: mode === "ADAPTIVE" ? { maxQuestions: Math.max(v.count, 20), targetCorrect: Math.max(5, Math.min(50, Number(target) || 20)) } : null,
              });
              setAssignMsg(r.ok ? { ok: true, text: t("Assigned ✓ ({n} students)", { n: r.value.students }) } : { ok: false, text: r.message });
            });
          }}>
            <label className="flex flex-col text-sm font-semibold text-slate-700">{t("Class")}
              <select value={classId} onChange={(e) => setClassId(e.target.value)} className={field}>
                {roster.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <label className="flex flex-col text-sm font-semibold text-slate-700">{t("Title")}
              <input value={title} onChange={(e) => setTitle(e.target.value)} className={field} />
            </label>
            <fieldset className="flex flex-col text-sm font-semibold text-slate-700">
              <span>{t("How")}</span>
              <div className="mt-1 flex gap-4 font-normal">
                <label className="flex items-center gap-1.5"><input type="radio" name="mode" checked={mode === "FIXED"} onChange={() => setMode("FIXED")} /> {t("Fixed")}</label>
                <label className="flex items-center gap-1.5"><input type="radio" name="mode" checked={mode === "ADAPTIVE"} onChange={() => setMode("ADAPTIVE")} /> {t("Adaptive")}</label>
              </div>
            </fieldset>
            {mode === "ADAPTIVE" && (
              <label className="flex flex-col text-sm font-semibold text-slate-700">{t("Target correct answers")}
                <input type="number" min={5} max={50} value={target} onChange={(e) => setTarget(e.target.value)} className={`${field} w-28`} />
              </label>
            )}
            <SourceSelect t={t} value={source} onChange={setSource} />
            <div className="sm:col-span-2"><button className={main} disabled={busy || !classId}>⭐ {t("Assign")}</button></div>
          </form>
          {mode === "FIXED" && v.count > 60 && <p className="mt-2 text-xs text-amber-800">{t("A Fixed assignment sends the first 60 questions only. Choose Adaptive to use all {n}.", { n: v.count })}</p>}
        </section>
      )}
    </div>
  );
}
