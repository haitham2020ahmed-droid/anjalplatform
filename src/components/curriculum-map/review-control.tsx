"use client";
import { useState, useTransition } from "react";
import { useT } from "@/i18n/client";
import type { ReviewControlView, ReviewSkillUnit, WrittenQuestion } from "@/server/curriculum-map/review-control";
import type { MapSourceQuestion } from "@/server/tests/map-source";
import { reviewBankAction, reviewChangeAction, reviewDetailAction, reviewDraftAction, reviewEditAction, reviewSkillChoicesAction, reviewWriteAction } from "@/app/teacher/curriculum-review/actions";
import { RichInline } from "@/components/rich-inline";

const btn = "inline-flex min-h-9 items-center rounded-lg px-3 text-sm font-semibold ring-1 ring-slate-300 hover:ring-brand-teal disabled:opacity-50";
const main = "inline-flex min-h-10 items-center rounded-xl bg-brand-navy px-4 text-sm font-semibold text-white disabled:opacity-50";
const field = "mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm";
type Edit = { id: string; type: string; stem: string; options: { label: string; text: string; correct: boolean }[]; answer: boolean | null; answers: string[] };
const blank = (): WrittenQuestion => ({ stem: "", options: ["", "", "", ""], correct: 0 });

/**
 * 🔁 The teacher's Review of one text set: the questions in order (↑ ↓), ✏️ Edit (my private copy), ➖ Remove / put
 * back, the number of questions students answer, and ➕ Add (write · from the bank · ✨ AI draft to check first).
 */
export function ReviewControl({ initial }: { initial: ReviewControlView }) {
  const t = useT();
  const [v, setV] = useState(initial);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, start] = useTransition();
  const [edit, setEdit] = useState<Edit | null>(null);
  const [adding, setAdding] = useState<"" | "write" | "bank" | "skills">("");
  const [w, setW] = useState<WrittenQuestion>(blank());
  const [q, setQ] = useState("");
  const [bank, setBank] = useState<MapSourceQuestion[] | null>(null);
  // 🤖 r89 "Language" tab: every Skill of the grade's plan, grouped by unit — fetched once, the first time this
  // tab opens; `picked` is the teacher's ticks, cleared after a successful "Add selected".
  const [skillUnits, setSkillUnits] = useState<ReviewSkillUnit[] | null>(null);
  const [skillQ, setSkillQ] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [count, setCount] = useState(String(initial.count));
  const apply = (r: { ok: true; value: ReviewControlView } | { ok: false; message: string }, done?: string) => {
    if (r.ok) { setV(r.value); setCount(String(r.value.count)); if (done) setMsg({ ok: true, text: done }); } else setMsg({ ok: false, text: r.message });
    return r.ok;
  };
  const go = (fn: () => Promise<unknown>) => start(async () => { setMsg(null); await fn(); });
  const ids = v.questions.map((x) => x.id);
  const move = (i: number, d: number) => go(async () => { const n = [...ids]; const j = i + d; if (j < 0 || j >= n.length) return; [n[i], n[j]] = [n[j], n[i]]; apply(await reviewChangeAction(v.code, { op: "order", questionIds: n })); });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-4 rounded-2xl bg-white p-4 ring-1 ring-slate-200">
        <p className="text-sm text-slate-700" data-testid="review-counts">
          {t("Available: {n}", { n: v.available })} · {t("Chosen: {n}", { n: v.chosen })} · <b>{t("Students answer: {n}", { n: v.count })}</b>
        </p>
        {v.canEdit && (
          <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); go(async () => { apply(await reviewChangeAction(v.code, { op: "count", count: Number(count) }), t("Saved ✓")); }); }}>
            <label className="text-sm font-semibold text-slate-700">{t("Number of questions")}
              <input type="number" min={1} max={Math.max(1, v.chosen)} value={count} onChange={(e) => setCount(e.target.value)} className={`${field} w-24`} />
            </label>
            <button className={btn} disabled={busy}>{t("Save")}</button>
          </form>
        )}
        {v.canEdit && v.custom && <button type="button" className={`${btn} ms-auto`} disabled={busy} onClick={() => go(async () => { if (window.confirm(t("Go back to the shared Review? Your changes to this Review are removed (your copies stay yours)."))) apply(await reviewChangeAction(v.code, { op: "reset" }), t("Saved ✓")); })}>{t("Reset")}</button>}
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
            {v.canEdit && (
              <div className="mt-2 flex flex-wrap gap-1.5 ps-9">
                <button type="button" className={btn} disabled={busy || i === 0} onClick={() => move(i, -1)} aria-label={t("Move up")}>↑</button>
                <button type="button" className={btn} disabled={busy || i === v.questions.length - 1} onClick={() => move(i, 1)} aria-label={t("Move down")}>↓</button>
                <button type="button" className={btn} disabled={busy} onClick={() => go(async () => { const r = await reviewDetailAction(v.code, x.id); if (r.ok) setEdit(r.value); else setMsg({ ok: false, text: r.message }); })}>✏️ {t("Edit")}</button>
                <button type="button" className={btn} disabled={busy || v.questions.length <= 1} onClick={() => go(async () => { apply(await reviewChangeAction(v.code, { op: "remove", questionId: x.id })); })}>➖ {t("Remove")}</button>
              </div>
            )}
            {edit?.id === x.id && (
              <form className="mt-3 space-y-2 rounded-xl bg-slate-50 p-3" onSubmit={(e) => { e.preventDefault(); go(async () => { if (apply(await reviewEditAction(v.code, { questionId: edit.id, stem: edit.stem, options: edit.options.length ? edit.options : null, answer: edit.answer, answers: edit.answers.length ? edit.answers : null }), t("Saved as your private copy ✓"))) setEdit(null); }); }}>
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
      {!v.questions.length && <p className="rounded-xl bg-white p-4 text-sm text-slate-600 ring-1 ring-slate-200">{t("This Review has no questions yet. Add some below.")}</p>}

      {v.hidden.length > 0 && (
        <details className="rounded-xl bg-white p-3 ring-1 ring-slate-200">
          <summary className="cursor-pointer text-sm font-semibold text-slate-700">{t("Removed from my Review ({n})", { n: v.hidden.length })}</summary>
          <ul className="mt-2 space-y-1">{v.hidden.map((x) => (
            <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 text-sm"><span data-content lang="en" className="min-w-0 flex-1"><RichInline text={x.stem} /></span>
              {v.canEdit && <button type="button" className={btn} disabled={busy} onClick={() => go(async () => { apply(await reviewChangeAction(v.code, { op: "restore", questionId: x.id })); })}>{t("Put back")}</button>}</li>
          ))}</ul>
        </details>
      )}

      {v.canEdit && (
        <section className="rounded-2xl bg-white p-4 ring-1 ring-slate-200" aria-label={t("Add a question")}>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={btn} aria-pressed={adding === "write"} onClick={() => setAdding(adding === "write" ? "" : "write")}>➕ {t("Write a question")}</button>
            <button type="button" className={btn} aria-pressed={adding === "bank"} onClick={() => setAdding(adding === "bank" ? "" : "bank")}>🔎 {t("From the bank")}</button>
            <button type="button" className={btn} disabled={busy} onClick={() => go(async () => { const r = await reviewDraftAction(v.code); if (r.ok) { setW({ ...r.value, options: [...r.value.options] }); setAdding("write"); setMsg({ ok: true, text: t("AI draft ready: check and edit it, then add it.") }); } else setMsg({ ok: false, text: r.message }); })}>✨ {t("AI draft")}</button>
            {/* 🤖 r89: one press pulls in every Vocabulary + Analyze Craft question of THIS Text Set (not a live link —
                press again later to pick up anything added since). */}
            <button type="button" className={btn} disabled={busy} onClick={() => go(async () => { apply(await reviewChangeAction(v.code, { op: "addSet" }), t("Added ✓")); })}>🤖 {t("Collect this Text Set's Vocabulary + Analyze Craft")}</button>
            <button type="button" className={btn} aria-pressed={adding === "skills"} onClick={() => { const next = adding === "skills" ? "" : "skills"; setAdding(next); if (next === "skills" && !skillUnits) go(async () => { const r = await reviewSkillChoicesAction(v.code); if (r.ok) setSkillUnits(r.value); else setMsg({ ok: false, text: r.message }); }); }}>🗣️ {t("Language")}</button>
          </div>
          {adding === "write" && (
            <form className="mt-3 space-y-2" onSubmit={(e) => { e.preventDefault(); go(async () => { if (apply(await reviewWriteAction(v.code, w), t("Added ✓"))) setW(blank()); }); }}>
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
          {adding === "bank" && (
            <div className="mt-3 space-y-2">
              <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); go(async () => { const r = await reviewBankAction({ q }); if (r.ok) setBank(r.value.rows); else setMsg({ ok: false, text: r.message }); }); }}>
                <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Words from the question (3 letters or more)")} className={`${field} mt-0`} />
                <button className={btn} disabled={busy}>{t("Search")}</button>
                <button type="button" className={btn} disabled={busy} onClick={() => go(async () => { const r = await reviewBankAction({ mine: true }); if (r.ok) setBank(r.value.rows); else setMsg({ ok: false, text: r.message }); })}>{t("My edited copies")}</button>
              </form>
              {bank && (bank.length ? (
                <ul className="divide-y divide-slate-100">{bank.map((x) => (
                  <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"><span data-content lang="en" className="min-w-0 flex-1"><RichInline text={x.stem} /></span>
                    <button type="button" className={btn} disabled={busy || ids.includes(x.id)} onClick={() => go(async () => { apply(await reviewChangeAction(v.code, { op: "addBank", questionId: x.id }), t("Added ✓")); })}>{ids.includes(x.id) ? "✓" : t("Add")}</button></li>
                ))}</ul>
              ) : <p className="text-sm text-slate-600">{t("No question matches.")}</p>)}
            </div>
          )}
          {/* 🤖 r89 "Language" tab ("كل مهارات المنهج مش بس بتاعة الدرس ده"): every Skill of the WHOLE grade plan,
              grouped by unit — the teacher ticks any number of skills (any unit, not just this Text Set's own) and
              "Add selected" pulls their published, auto-marked questions into this Review, once. */}
          {adding === "skills" && (
            <div className="mt-3 space-y-3">
              <input type="search" value={skillQ} onChange={(e) => setSkillQ(e.target.value)} placeholder={t("Search skills")} className={field} />
              {!skillUnits ? (
                <p className="text-sm text-slate-500">{busy ? "…" : t("No skill matches.")}</p>
              ) : (
                <div className="max-h-80 space-y-3 overflow-y-auto rounded-xl p-1">
                  {skillUnits.map((u) => {
                    const matches = u.skills.filter((k) => k.name.toLowerCase().includes(skillQ.trim().toLowerCase()));
                    if (!matches.length) return null;
                    return (
                      <div key={u.number}>
                        <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{t("Unit {n}", { n: u.number })}</p>
                        <ul className="mt-1 space-y-0.5">
                          {matches.map((k) => (
                            <li key={k.id}>
                              <label className="flex items-center gap-2 rounded-lg px-2 py-1 text-sm hover:bg-slate-50">
                                <input type="checkbox" checked={picked.has(k.id)} onChange={() => setPicked((s) => { const n = new Set(s); if (n.has(k.id)) n.delete(k.id); else n.add(k.id); return n; })} />
                                <span dir="ltr">{k.name}</span>
                              </label>
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              )}
              <button type="button" className={main} disabled={busy || !picked.size}
                onClick={() => go(async () => { if (apply(await reviewChangeAction(v.code, { op: "addSkills", skillIds: [...picked] }), t("Added ✓"))) setPicked(new Set()); })}>
                {t("Add selected ({n})", { n: picked.size })}
              </button>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
