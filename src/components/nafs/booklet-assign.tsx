"use client";
import Link from "next/link";
import { useActionState, useEffect, useMemo, useState } from "react";
import { useT } from "@/i18n/client";
import { Combo } from "@/components/ui/combo";
import { SourceSelect } from "@/components/assign/source-select";
import { PendingButton } from "@/components/pending-button";
import { assignBookletsNowAction } from "@/app/teacher/nafs/actions";
import type { AssignSource } from "@/lib/assign-source";

/**
 * 🇸🇦 r82 Ministry booklets → ASSIGN (owner: "there should be a select here, let me assign from here, even several
 * booklets at once — and show the SOURCES"):
 *   - BookletPicker: the list of model booklets, each with its checkbox INSIDE the assign form; ticking 1–10 shows a
 *     sticky bar at the bottom ("3 booklets selected · Assign", "Select all on this page", "Clear"); Assign opens
 *     the panel;
 *   - OpenBookletAssign: an opened booklet's Assign button — the SAME panel for that one booklet;
 *   - the panel: Source (required, r74 — NAFS preselected in the NAFS center, the teacher may change it), the
 *     teacher's Grade 6 class(es), whole class or chosen students, start and due dates, time (the booklet's), mode
 *     Online / Paper. The answer is shown IN the panel: "Assigning…" then "Given to N students — in their NAFS icon"
 *     (or the print links of Paper, or a readable message). A press token makes a double press harmless.
 */
export interface BookletAssignState { ok: boolean; message: string; students?: number; ready?: { code: string; testId: string }[] }
export interface PickerRow { code: string; title: string; meta: string; openHref: string; reportHref: string | null }
export interface PickerClass { id: string; name: string; students: { id: string; name: string }[] }

const BTN = "inline-flex min-h-11 items-center justify-center rounded-xl px-4 text-sm font-semibold";
const LINK = "inline-flex min-h-10 items-center rounded-lg bg-surface px-3 text-sm font-semibold text-ink ring-1 ring-line";
const INPUT = "min-h-11 rounded-xl bg-surface px-3 ring-1 ring-line";
const newToken = () => crypto.randomUUID();

/** The list with its checkboxes, the sticky bar and the panel — one form. */
export function BookletPicker({ rows, classes, minutes, max, initialTicked = [], initialOpen = false, source = "NAFS" }: {
  rows: PickerRow[]; classes: PickerClass[]; minutes: number; max: number; initialTicked?: string[]; initialOpen?: boolean; source?: AssignSource;
}) {
  const t = useT();
  const [ticked, setTicked] = useState<string[]>(() => initialTicked.filter((c) => rows.some((r) => r.code === c)).slice(0, max));
  const [open, setOpen] = useState(initialOpen && initialTicked.length > 0);
  const [token, setToken] = useState(newToken);
  const [state, action] = useActionState(assignBookletsNowAction, null);
  const full = ticked.length >= max;
  const toggle = (code: string, on: boolean) => setTicked((x) => (on ? (x.includes(code) || x.length >= max ? x : [...x, code]) : x.filter((c) => c !== code)));
  const all = () => setTicked((x) => [...x, ...rows.map((r) => r.code).filter((c) => !x.includes(c))].slice(0, max));
  const show = () => { setToken(newToken()); setOpen(true); };
  return (
    <form action={action} className="grid gap-4 pb-24" data-testid="booklet-form">
      <section className="rounded-2xl bg-surface p-5 shadow-card ring-1 ring-line print:hidden" aria-labelledby="bl-h">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="bl-h" className="text-lg font-semibold text-ink">{t("The model booklets")} <span className="text-sm font-normal text-muted">({rows.length})</span></h2>
          <button type="button" onClick={all} className="text-sm font-semibold text-teal-ink underline">{t("Select all on this page")}</button>
        </div>
        <p className="text-sm text-muted">{t("Tick one or several booklets (up to {n}): the Assign bar appears at the bottom.", { n: max })}</p>
        <ul className="mt-2 divide-y divide-line">
          {rows.map((b) => {
            const on = ticked.includes(b.code);
            return (
              <li key={b.code} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <label className="flex min-w-0 flex-1 items-center gap-3">
                  <input type="checkbox" name="b" value={b.code} checked={on} disabled={!on && full} onChange={(e) => toggle(b.code, e.target.checked)} className="h-5 w-5 shrink-0" />
                  <span className="min-w-0">
                    <span className="font-semibold text-ink"><span className="font-mono text-xs text-muted" dir="ltr">{b.code}</span> {b.title}</span>
                    <span className="block text-xs text-muted">{b.meta}</span>
                  </span>
                </label>
                <span className="flex gap-1.5">
                  <Link href={b.openHref} className={LINK}>{t("Open")}</Link>
                  {b.reportHref && <Link href={b.reportHref} className={LINK}>📊 {t("Report")}</Link>}
                </span>
              </li>
            );
          })}
        </ul>
      </section>
      {ticked.length > 0 && !open && (
        <div role="region" aria-label={t("Assign")} data-testid="booklet-bar" className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 px-4 py-3 shadow-card backdrop-blur print:hidden">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-2">
            <span className="me-auto text-sm font-semibold text-ink">{t("{n} booklets selected", { n: ticked.length })}{full ? ` · ${t("Up to {n} at a time", { n: max })}` : ""}</span>
            <button type="button" onClick={all} className={`${BTN} bg-surface text-ink ring-1 ring-line`}>{t("Select all on this page")}</button>
            <button type="button" onClick={() => setTicked([])} className={`${BTN} bg-surface text-ink ring-1 ring-line`}>{t("Clear")}</button>
            <button type="button" onClick={show} data-testid="bar-assign" className={`${BTN} bg-teal-700 text-white`}>{t("Assign")}</button>
          </div>
        </div>
      )}
      {open && <AssignPanel codes={ticked} classes={classes} minutes={minutes} source={source} token={token} state={state} onClose={() => setOpen(false)} />}
    </form>
  );
}

/** An opened booklet's Assign: the same panel for this one booklet. */
export function OpenBookletAssign({ code, classes, minutes, initialOpen = false, source = "NAFS" }: { code: string; classes: PickerClass[]; minutes: number; initialOpen?: boolean; source?: AssignSource }) {
  const t = useT();
  const [open, setOpen] = useState(initialOpen);
  const [token, setToken] = useState(newToken);
  const [state, action] = useActionState(assignBookletsNowAction, null);
  return (
    <>
      <button type="button" onClick={() => { setToken(newToken()); setOpen(true); }} data-testid="open-assign" className="inline-flex min-h-10 items-center rounded-lg bg-teal-700 px-3 text-sm font-semibold text-white">{t("Assign")}</button>
      {open && (
        <form action={action} data-testid="open-booklet-form">
          <input type="hidden" name="b" value={code} />
          <AssignPanel codes={[code]} classes={classes} minutes={minutes} source={source} token={token} state={state} onClose={() => setOpen(false)} />
        </form>
      )}
    </>
  );
}

/** The assign panel (inside its form): source, classes, students, dates, time, mode → Assign. */
export function AssignPanel({ codes, classes, minutes, source, token, state, onClose }: {
  codes: string[]; classes: PickerClass[]; minutes: number; source: AssignSource; token: string; state: BookletAssignState | null; onClose: () => void;
}) {
  const t = useT();
  const [src, setSrc] = useState<AssignSource | "">(source);
  const [classIds, setClassIds] = useState<string[]>(classes.length === 1 ? [classes[0].id] : []);
  const [who, setWho] = useState<"class" | "some">("class");
  const [mode, setMode] = useState<"ONLINE" | "PAPER">("ONLINE");
  const students = useMemo(() => classes.filter((c) => classIds.includes(c.id)).flatMap((c) => c.students.map((x) => ({ value: x.id, label: x.name, group: c.name }))), [classes, classIds]);
  // the result is for THIS press: a new panel (new token) starts clean
  const [shown, setShown] = useState<BookletAssignState | null>(null);
  useEffect(() => { setShown(state); }, [state]);
  useEffect(() => { setShown(null); }, [token]);
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);
  const online = mode === "ONLINE";
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4 print:hidden" data-testid="assign-panel">
      <section role="dialog" aria-modal="true" aria-labelledby="ap-h" className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-surface p-5 shadow-card ring-1 ring-line sm:rounded-2xl">
        <input type="hidden" name="token" value={token} />
        <div className="flex items-start justify-between gap-2">
          <h2 id="ap-h" className="text-lg font-semibold text-ink">{t("Assign {n} booklet(s)", { n: codes.length })}</h2>
          <button type="button" onClick={onClose} aria-label={t("Close")} className="min-h-10 px-2 text-sm font-semibold text-muted">✕</button>
        </div>
        <p className="mt-1 text-xs text-muted" dir="ltr">{codes.join(" · ")}</p>
        <div className="mt-4 grid gap-4">
          <SourceSelect t={t} value={src} onChange={setSrc} field={INPUT} />
          <fieldset className="grid gap-2">
            <legend className="text-sm font-semibold text-ink-2">{t("How")}</legend>
            <div className="flex flex-wrap gap-2">
              <label className={`${BTN} cursor-pointer gap-2 ring-1 ring-line ${online ? "bg-teal-50 text-teal-ink ring-teal-300" : "bg-surface text-ink"}`}><input type="radio" name="mode" value="ONLINE" checked={online} onChange={() => setMode("ONLINE")} />💻 {t("Online")}</label>
              <label className={`${BTN} cursor-pointer gap-2 ring-1 ring-line ${!online ? "bg-teal-50 text-teal-ink ring-teal-300" : "bg-surface text-ink"}`}><input type="radio" name="mode" value="PAPER" checked={!online} onChange={() => setMode("PAPER")} />🖨 {t("Paper")}</label>
            </div>
            <p className="text-xs text-muted">{online ? t("Students take it in the platform, in their NAFS icon. Multiple-choice answers are marked at once; written answers wait in Marking.") : t("Print the booklet, its answer key and the bubble sheets; mark the sheets with the phone camera or type the answers.")}</p>
          </fieldset>
          {online && (!classes.length ? <p className="text-sm text-muted" role="note">{t("You have no Grade 6 class yet.")}</p> : <>
            <fieldset className="grid gap-1">
              <legend className="text-sm font-semibold text-ink-2">{t("Class")} <span aria-hidden="true" className="text-rose-600">*</span></legend>
              <div className="flex flex-wrap gap-2">
                {classes.map((c) => (
                  <label key={c.id} className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl px-3 text-sm ring-1 ring-line">
                    <input type="checkbox" name="classId" value={c.id} checked={classIds.includes(c.id)} onChange={(e) => setClassIds((x) => (e.target.checked ? [...x, c.id] : x.filter((y) => y !== c.id)))} />
                    <span className="font-semibold text-ink">{c.name}</span><span className="text-xs text-muted">{t("{n} students", { n: c.students.length })}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset className="grid gap-2">
              <legend className="text-sm font-semibold text-ink-2">{t("Who")}</legend>
              <div className="flex flex-wrap gap-3 text-sm">
                <label className="inline-flex min-h-11 items-center gap-2"><input type="radio" name="who" value="class" checked={who === "class"} onChange={() => setWho("class")} />{t("The whole class")}</label>
                <label className="inline-flex min-h-11 items-center gap-2"><input type="radio" name="who" value="some" checked={who === "some"} onChange={() => setWho("some")} />{t("Chosen students")}</label>
              </div>
              {who === "some" && (students.length ? <Combo multiple name="sid" label={t("Chosen students")} placeholder={t("Choose students…")} options={students} /> : <p className="text-xs text-muted">{t("Choose a class first.")}</p>)}
            </fieldset>
          </>)}
          <div className="flex flex-wrap items-end gap-3">
            {online && <label className="grid gap-1 text-sm font-semibold text-ink-2">{t("Opens (optional)")}<input type="date" name="openAt" className={INPUT} /></label>}
            {online && <label className="grid gap-1 text-sm font-semibold text-ink-2">{t("Due (optional)")}<input type="date" name="dueAt" className={INPUT} /></label>}
            <label className="grid gap-1 text-sm font-semibold text-ink-2">{t("Time (minutes)")}<input type="number" name="minutes" min={1} max={120} defaultValue={minutes} className={`${INPUT} w-24`} /></label>
          </div>
          {shown && (
            <div role="status" data-testid="assign-result" className={`rounded-xl px-4 py-3 text-sm ring-1 ${shown.ok ? "bg-emerald-50 text-emerald-900 ring-emerald-200" : "bg-rose-50 text-rose-900 ring-rose-200"}`}>
              <p className="font-semibold">{shown.ok ? "✓ " : ""}{shown.message}</p>
              {shown.ok && (shown.ready?.length ? (
                <ul className="mt-2 grid gap-1.5">
                  {shown.ready.map((r) => (
                    <li key={r.testId} className="flex flex-wrap items-center gap-1.5"><b dir="ltr" className="me-1">{r.code}</b>
                      <Link href={`/teacher/nafs/tests/${r.testId}/print`} className={LINK}>📘 {t("Print test")}</Link>
                      <Link href={`/teacher/nafs/tests/${r.testId}/print?key=1`} className={LINK}>🔑 {t("Answer key")}</Link>
                      <Link href={`/teacher/nafs/tests/${r.testId}`} className={LINK}>{t("Print bubble sheets")}</Link>
                    </li>
                  ))}
                </ul>
              ) : <Link href="/teacher/assigned?kind=NAFS_TEST" className="mt-1 inline-block font-semibold underline">{t("See it on the Assigned page")}</Link>)}
            </div>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" onClick={onClose} className={`${BTN} bg-surface text-ink ring-1 ring-line`}>{t("Close")}</button>
            <PendingButton label={online ? "Assign" : "Get ready to print"} pendingLabel="Assigning…" icon={online ? "💻" : "🖨"} testId="assign-submit" className={`${BTN} bg-teal-700 px-6 text-white`} />
          </div>
        </div>
      </section>
    </div>
  );
}
