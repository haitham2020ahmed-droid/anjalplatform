"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import { useT } from "@/i18n/client";
import type { Pos, YearEdit, YearPlanView } from "@/server/map/year-plan";
import { yearAssignWeekAction, yearEditAction, yearModeAction, yearQuestionsAction } from "@/app/teacher/map-center/year-actions";
import type { PreviewQuestion } from "@/server/map/year-plan-share";
import { StarAssign } from "@/components/assign/star-assign";
import { SourceSelect } from "@/components/assign/source-select";
import { SOURCE_REQUIRED, type AssignSource } from "@/lib/assign-source";
import { ExcludeMasteredPrompt } from "@/components/assign/exclude-mastered";
import { StarGlyph, StarLegend } from "@/components/skills/skill-star";
import { RichInline } from "@/components/rich-inline";

const btn = "inline-flex min-h-8 items-center rounded-lg px-2 text-xs font-semibold ring-1 ring-slate-300 hover:ring-brand-teal disabled:opacity-40";
const AREA_TONE: Record<string, string> = { LIT: "border-sky-400", INFO: "border-indigo-400", VOCAB: "border-amber-400", GRAMMAR: "border-rose-400", MECH: "border-teal-400", WRITING: "border-lime-500" };

/**
 * 🗓️ The Year plan board: 40 week rows (number, dates, 2–3 skills). Each skill: code + name, how many students need
 * it, its Learn lesson, ☆ assign; the teacher drags a skill to another week (or uses ↑ ↓ / Move to week), swaps two
 * skills (⇄ then ⇄), replaces or removes one, adds one to a week, assigns the whole week, or makes the plan again.
 * Read-only for the admin.
 */
export function YearPlanBoard({ initial }: { initial: YearPlanView }) {
  const t = useT();
  const [v, setV] = useState(initial);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, start] = useTransition();
  const [swapFrom, setSwapFrom] = useState<Pos | null>(null);
  const [drag, setDrag] = useState<Pos | null>(null);
  const [onlyOpen, setOnlyOpen] = useState(false);
  // 🔎 r68: the questions behind a skill (loaded when the teacher opens them; a few, with their choices)
  const [qs, setQs] = useState<Record<string, { total: number; questions: PreviewQuestion[] } | "…" | string>>({});
  const toggleQs = (skillId: string) => {
    if (qs[skillId]) { setQs((m) => { const n = { ...m }; delete n[skillId]; return n; }); return; }
    setQs((m) => ({ ...m, [skillId]: "…" }));
    void yearQuestionsAction(v.classId, skillId).then((r) => setQs((m) => ({ ...m, [skillId]: r.ok ? r.value : r.message })));
  };
  const edit = (e: YearEdit, done?: string) => start(async () => {
    setMsg(null);
    try {
      const r = await yearEditAction(v.classId, e);
      if (r.ok) { setV(r.value); if (done) setMsg({ ok: true, text: done }); } else setMsg({ ok: false, text: r.message });
    } catch { setMsg({ ok: false, text: t("Something went wrong — try again") }); }
  });
  // ⭐ "N students already mastered … — exclude them?" before assigning a week whose skills some students mastered
  const [askWeek, setAskWeek] = useState<{ week: number; n: number } | null>(null);
  // r74: the source of the weeks assigned from here (always chosen by the teacher: no default)
  const [source, setSource] = useState<AssignSource | "">("");
  const tryWeek = (week: number) => { if (!source) { setMsg({ ok: false, text: t(SOURCE_REQUIRED) }); return; } const w = v.weeks.find((x) => x.week === week); const n = Math.max(0, ...(w?.skills.filter((k) => !k.assignedId).map((k) => k.mastered ?? 0) ?? [0])); if (n > 0) setAskWeek({ week, n }); else assignWeek(week, false); };
  // r79: the week being assigned shows "Assigning…" (every button waits until it is done)
  const [assigning, setAssigning] = useState<number | null>(null);
  const assignWeek = (week: number, excludeMastered: boolean) => start(async () => {
    setMsg(null); setAskWeek(null); setAssigning(week);
    try {
      const r = await yearAssignWeekAction(v.classId, week, excludeMastered, source || null);
      if (r.ok) { setV(r.value); setMsg({ ok: true, text: t("Week {n} assigned ✓", { n: week }) }); } else setMsg({ ok: false, text: r.message });
    } catch { setMsg({ ok: false, text: t("Something went wrong — try again") }); } finally { setAssigning(null); }
  });
  const swap = (p: Pos) => { if (!swapFrom) { setSwapFrom(p); return; } if (swapFrom.week !== p.week || swapFrom.index !== p.index) edit({ op: "swap", a: swapFrom, b: p }); setSwapFrom(null); };
  const [modeBusy, setModeBusy] = useState(false);
  const setMode = (mode: "AUTO" | "MANUAL") => start(async () => {
    setMsg(null); setModeBusy(true);
    try {
      const r = await yearModeAction(v.classId, mode);
      if (r.ok) { setV(r.value); setMsg({ ok: true, text: mode === "AUTO" ? t("Automatic: the plan is made again from the latest MAP data ✓") : t("Manual: the plan stays as you leave it.") }); } else setMsg({ ok: false, text: r.message });
    } catch { setMsg({ ok: false, text: t("Something went wrong — try again") }); } finally { setModeBusy(false); }
  });
  const s = v.summary;
  const weeks = onlyOpen ? v.weeks.filter((w) => w.skills.some((k) => !k.assignedId)) : v.weeks;
  return (
    <div className="space-y-4">
      <StarLegend t={t} />
      <div className="grid gap-3 sm:grid-cols-3" data-testid="year-summary">
        <p className="rounded-2xl bg-white p-4 ring-1 ring-slate-200"><span className="block text-2xl font-bold text-brand-navy">{s.covered} / {s.shared}</span><span className="text-sm text-slate-600">{t("shared skills in the plan")}</span></p>
        <p className="rounded-2xl bg-white p-4 ring-1 ring-slate-200"><span className="block text-2xl font-bold text-brand-navy">{s.tested.READING || s.tested.LANGUAGE ? `${Math.max(s.tested.READING, s.tested.LANGUAGE)} / ${s.students}` : "—"}</span><span className="text-sm text-slate-600">{t("students with MAP scores")}</span></p>
        <p className="rounded-2xl bg-white p-4 ring-1 ring-slate-200"><span className="block text-sm font-semibold text-brand-navy">{s.weakAreas.map((a) => `${a.icon} ${t(a.name)}`).join(" · ") || "—"}</span><span className="text-sm text-slate-600">{t("most shared needs")}</span></p>
      </div>
      {v.notes.map((n) => <p key={n} role="status" className="rounded-xl bg-amber-50 px-4 py-2 text-sm text-amber-900 ring-1 ring-amber-200">{t(n)}</p>)}
      {v.canEdit && <p className="text-xs text-slate-500">{v.mode === "AUTO" ? <>🔄 {t("Automatic: the plan is rebuilt from the latest MAP data every time you open it.")}</> : <>🔒 {t("Manual: your own weeks are kept as you leave them until you choose Automatic again.")}</>}</p>}
      {msg && <p role={msg.ok ? "status" : "alert"} className={`rounded-xl px-4 py-2 text-sm ${msg.ok ? "bg-teal-50 text-teal-900" : "bg-red-50 text-red-800"}`}>{msg.text}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <label className="inline-flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={onlyOpen} onChange={(e) => setOnlyOpen(e.target.checked)} />{t("Only weeks not assigned yet")}</label>
        {v.canEdit && <SourceSelect t={t} compact value={source} onChange={setSource} />}
        {v.canEdit && (
          <div role="group" aria-label={t("Automatic or Manual")} className="ms-auto inline-flex gap-1 rounded-xl bg-slate-100 p-0.5" data-testid="year-mode">
            <button type="button" disabled={busy || modeBusy} aria-pressed={v.mode === "AUTO"} onClick={() => setMode("AUTO")}
              className={`inline-flex min-h-9 items-center gap-1 rounded-lg px-3 text-xs font-semibold ${v.mode === "AUTO" ? "bg-brand-navy text-white" : "text-slate-600 hover:bg-white"}`}>🔄 {t("Automatic")}</button>
            <button type="button" disabled={busy || modeBusy} aria-pressed={v.mode === "MANUAL"} onClick={() => setMode("MANUAL")}
              className={`inline-flex min-h-9 items-center gap-1 rounded-lg px-3 text-xs font-semibold ${v.mode === "MANUAL" ? "bg-brand-navy text-white" : "text-slate-600 hover:bg-white"}`}>🔒 {t("Manual")}</button>
          </div>
        )}
        {v.canEdit && <button type="button" className={`${btn} min-h-10 px-3 text-sm`} disabled={busy} onClick={() => { if (window.confirm(t("Make the plan again from the latest MAP scores? Your changes to the weeks are replaced."))) edit({ op: "regenerate" }, t("The plan was made again ✓")); }}>🔄 {t("Make the plan again")}</button>}
      </div>
      {swapFrom && <p role="status" className="rounded-xl bg-sky-50 px-4 py-2 text-sm text-sky-900">{t("Now press ⇄ on the skill to swap with.")} <button type="button" className="underline" onClick={() => setSwapFrom(null)}>{t("Cancel")}</button></p>}
      <ol className="space-y-2" aria-label={t("Weeks")}>
        {weeks.map((w) => (
          <li key={w.week} id={`week-${w.week}`} data-testid="year-week" aria-current={w.current ? "date" : undefined}
            onDragOver={(e) => { if (drag && v.canEdit) e.preventDefault(); }}
            onDrop={(e) => { e.preventDefault(); if (drag && v.canEdit) { edit({ op: "move", from: drag, to: { week: w.week, index: w.skills.length } }); setDrag(null); } }}
            className={`rounded-2xl bg-white p-3 ring-1 ${w.current ? "ring-2 ring-brand-teal" : "ring-slate-200"}`}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-bold text-brand-navy">{t("Week {n}", { n: w.week })}</span>
              <span className="text-xs text-slate-500" dir="ltr">{w.from.slice(5).replace("-", "/")} – {w.to.slice(5).replace("-", "/")}</span>
              {w.current && <span className="rounded-full bg-teal-50 px-2 py-0.5 text-xs font-semibold text-teal-800">{t("This week")}</span>}
              {v.canEdit && w.skills.some((k) => !k.assignedId) && <button type="button" className={`${btn} ms-auto`} disabled={busy} aria-busy={assigning === w.week} onClick={() => tryWeek(w.week)}>{assigning === w.week ? t("Assigning…") : `☆ ${t("Assign this week")}`}</button>}
              {askWeek?.week === w.week && <ExcludeMasteredPrompt count={askWeek.n} t={t} busy={busy} onYes={() => assignWeek(w.week, true)} onNo={() => assignWeek(w.week, false)} />}
            </div>
            <ul className="mt-2 grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
              {w.skills.map((k, i) => (
                <li key={`${k.skillId}-${i}`} data-testid="year-skill" draggable={v.canEdit} onDragStart={() => setDrag({ week: w.week, index: i })}
                  className={`flex flex-col gap-1 rounded-xl border-s-4 bg-slate-50 px-2.5 py-2 ${AREA_TONE[k.group] ?? "border-slate-300"} ${swapFrom?.week === w.week && swapFrom.index === i ? "ring-2 ring-sky-400" : ""}`}>
                  <div className="flex items-start gap-1">
                    <p className="min-w-0 flex-1 text-sm leading-snug" data-content lang="en">
                      {k.code && <span className="me-1 font-mono text-[11px] text-slate-500">{k.code}</span>}<b className="text-slate-900">{k.name}</b>
                      {(k.mastered ?? 0) > 0 && <span data-testid="year-mastered" title={t("{n} of {total} students mastered this skill", { n: k.mastered ?? 0, total: v.summary.students })} className="ms-1 inline-flex items-center gap-0.5 text-[11px] text-amber-800"><StarGlyph status="MASTERED" size={12} /><span dir="ltr">{k.mastered}/{v.summary.students}</span></span>}
                      {k.review && <span className="ms-1 rounded bg-slate-200 px-1 text-[10px] font-semibold text-slate-600">{t("review")}</span>}
                    </p>
                    {v.canEdit ? <StarAssign kind="SKILL" refId={k.skillId} classId={v.classId} assignedId={k.assignedId} defaultDue={w.due} defaultStart={w.from > new Date().toISOString().slice(0, 10) ? w.from : ""} track="MAP" label={k.name} />
                      : <span aria-label={k.assignedId ? t("Assigned") : t("Not assigned")} className="text-lg">{k.assignedId ? "★" : "☆"}</span>}
                  </div>
                  <p className="flex flex-wrap items-center gap-x-2 text-xs text-slate-600">
                    {k.of > 0 && <span data-testid="year-need">{t("{n} of {m} students", { n: k.need, m: k.of })}</span>}
                    {k.lesson ? <Link prefetch={false} href={`/teacher/learn/${encodeURIComponent(k.lesson.code)}`} className="font-semibold text-brand-teal underline">📘 {t("Lesson")}</Link> : <span className="text-slate-400">{t("No lesson yet")}</span>}
                    <button type="button" data-testid="year-questions" aria-expanded={Boolean(qs[k.skillId])} onClick={() => toggleQs(k.skillId)} className="font-semibold text-brand-navy underline">🔎 {t("Questions")}</button>
                  </p>
                  {qs[k.skillId] && (
                    <div className="rounded-lg bg-white p-2 text-xs ring-1 ring-slate-200">
                      {qs[k.skillId] === "…" ? <p className="text-slate-500">{t("Loading…")}</p>
                        : typeof qs[k.skillId] === "string" ? <p role="alert" className="text-red-700">{qs[k.skillId] as string}</p>
                        : (() => { const d = qs[k.skillId] as { total: number; questions: PreviewQuestion[] }; return d.questions.length ? (
                          <>
                            <p className="mb-1 text-slate-500">{t("{n} of {total} questions", { n: d.questions.length, total: d.total })}</p>
                            <ol className="list-decimal space-y-1.5 ps-4" data-content lang="en">{d.questions.map((q) => <li key={q.id}><span className="text-slate-800"><RichInline text={q.stem} /></span>{q.choices.length > 0 && <ul className="mt-0.5 space-y-0.5">{q.choices.map((c, ci) => <li key={ci} className={c.correct ? "font-semibold text-emerald-700" : "text-slate-600"}>{c.correct ? "✓ " : "· "}<RichInline text={c.text} /></li>)}</ul>}</li>)}</ol>
                          </>
                        ) : <p className="text-slate-500">{t("No questions yet.")}</p>; })()}
                    </div>
                  )}
                  {v.canEdit && (
                    <div className="flex flex-wrap gap-1">
                      <button type="button" className={btn} disabled={busy || (w.week === 1 && i === 0)} aria-label={t("Move up")} onClick={() => edit(i > 0 ? { op: "move", from: { week: w.week, index: i }, to: { week: w.week, index: i - 1 } } : { op: "move", from: { week: w.week, index: i }, to: { week: w.week - 1, index: 99 } })}>↑</button>
                      <button type="button" className={btn} disabled={busy || (w.week === 40 && i === w.skills.length - 1)} aria-label={t("Move down")} onClick={() => edit(i < w.skills.length - 1 ? { op: "move", from: { week: w.week, index: i }, to: { week: w.week, index: i + 1 } } : { op: "move", from: { week: w.week, index: i }, to: { week: w.week + 1, index: 0 } })}>↓</button>
                      <button type="button" className={btn} disabled={busy} aria-pressed={Boolean(swapFrom)} aria-label={t("Swap")} onClick={() => swap({ week: w.week, index: i })}>⇄</button>
                      <select aria-label={t("Move to week")} className="h-8 rounded-lg border border-slate-300 text-xs" value="" disabled={busy} onChange={(e) => { const to = Number(e.target.value); if (to) edit({ op: "move", from: { week: w.week, index: i }, to: { week: to, index: 99 } }); }}>
                        <option value="">{t("Week…")}</option>{v.weeks.filter((x) => x.week !== w.week).map((x) => <option key={x.week} value={x.week}>{x.week}</option>)}
                      </select>
                      <select aria-label={t("Replace")} className="h-8 max-w-[9rem] rounded-lg border border-slate-300 text-xs" value="" disabled={busy} onChange={(e) => { if (e.target.value) edit({ op: "replace", at: { week: w.week, index: i }, skillId: e.target.value }); }}>
                        <option value="">{t("Replace…")}</option>{v.candidates.filter((c) => c.skillId !== k.skillId).map((c) => <option key={c.skillId} value={c.skillId}>{c.name} ({c.need}/{c.of})</option>)}
                      </select>
                      <button type="button" className={btn} disabled={busy} aria-label={t("Remove")} onClick={() => edit({ op: "remove", at: { week: w.week, index: i } })}>✕</button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
            {v.canEdit && w.skills.length < 6 && (
              <select aria-label={t("Add a skill to this week")} className="mt-2 h-8 max-w-full rounded-lg border border-dashed border-slate-300 text-xs" value="" disabled={busy} onChange={(e) => { if (e.target.value) edit({ op: "add", week: w.week, skillId: e.target.value }); }}>
                <option value="">➕ {t("Add a skill…")}</option>{v.candidates.filter((c) => !w.skills.some((k) => k.skillId === c.skillId)).map((c) => <option key={c.skillId} value={c.skillId}>{c.name} ({c.need}/{c.of})</option>)}
              </select>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
