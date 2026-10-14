"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import { useT } from "@/i18n/client";
import type { Pos, YearEdit, YearPlanView } from "@/server/map/year-plan";
import { yearAssignWeekAction, yearEditAction } from "@/app/teacher/map-center/year-actions";
import { StarAssign } from "@/components/assign/star-assign";
import { ExcludeMasteredPrompt } from "@/components/assign/exclude-mastered";
import { StarGlyph, StarLegend } from "@/components/skills/skill-star";

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
  const edit = (e: YearEdit, done?: string) => start(async () => {
    setMsg(null);
    const r = await yearEditAction(v.classId, e);
    if (r.ok) { setV(r.value); if (done) setMsg({ ok: true, text: done }); } else setMsg({ ok: false, text: r.message });
  });
  // ⭐ "N students already mastered … — exclude them?" before assigning a week whose skills some students mastered
  const [askWeek, setAskWeek] = useState<{ week: number; n: number } | null>(null);
  const tryWeek = (week: number) => { const w = v.weeks.find((x) => x.week === week); const n = Math.max(0, ...(w?.skills.filter((k) => !k.assignedId).map((k) => k.mastered ?? 0) ?? [0])); if (n > 0) setAskWeek({ week, n }); else assignWeek(week, false); };
  const assignWeek = (week: number, excludeMastered: boolean) => start(async () => {
    setMsg(null); setAskWeek(null);
    const r = await yearAssignWeekAction(v.classId, week, excludeMastered);
    if (r.ok) { setV(r.value); setMsg({ ok: true, text: t("Week {n} assigned ✓", { n: week }) }); } else setMsg({ ok: false, text: r.message });
  });
  const swap = (p: Pos) => { if (!swapFrom) { setSwapFrom(p); return; } if (swapFrom.week !== p.week || swapFrom.index !== p.index) edit({ op: "swap", a: swapFrom, b: p }); setSwapFrom(null); };
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
      {msg && <p role={msg.ok ? "status" : "alert"} className={`rounded-xl px-4 py-2 text-sm ${msg.ok ? "bg-teal-50 text-teal-900" : "bg-red-50 text-red-800"}`}>{msg.text}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <label className="inline-flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={onlyOpen} onChange={(e) => setOnlyOpen(e.target.checked)} />{t("Only weeks not assigned yet")}</label>
        {v.canEdit && <button type="button" className={`${btn} ms-auto min-h-10 px-3 text-sm`} disabled={busy} onClick={() => { if (window.confirm(t("Make the plan again from the latest MAP scores? Your changes to the weeks are replaced."))) edit({ op: "regenerate" }, t("The plan was made again ✓")); }}>🔄 {t("Make the plan again")}</button>}
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
              {v.canEdit && w.skills.some((k) => !k.assignedId) && <button type="button" className={`${btn} ms-auto`} disabled={busy} onClick={() => tryWeek(w.week)}>☆ {t("Assign this week")}</button>}
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
                    {v.canEdit ? <StarAssign kind="SKILL" refId={k.skillId} classId={v.classId} assignedId={k.assignedId} defaultDue={w.due} track="MAP" label={k.name} />
                      : <span aria-label={k.assignedId ? t("Assigned") : t("Not assigned")} className="text-lg">{k.assignedId ? "★" : "☆"}</span>}
                  </div>
                  <p className="flex flex-wrap items-center gap-x-2 text-xs text-slate-600">
                    {k.of > 0 && <span data-testid="year-need">{t("{n} of {m} students", { n: k.need, m: k.of })}</span>}
                    {k.lesson ? <Link prefetch={false} href={`/teacher/learn/${encodeURIComponent(k.lesson.code)}`} className="font-semibold text-brand-teal underline">📘 {t("Lesson")}</Link> : <span className="text-slate-400">{t("No lesson yet")}</span>}
                  </p>
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
