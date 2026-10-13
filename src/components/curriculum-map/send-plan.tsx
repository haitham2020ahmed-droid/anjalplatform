"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useT } from "@/i18n/client";
import { BTN } from "@/components/ui-kit/tokens";
import type { SendPreview, SendScopeKind, SendScopeResult } from "@/server/curriculum-map/send-scope";

/** Curriculum = blue (one colour per source) */
export const BTN_CURRICULUM = `${BTN} bg-blue-700 text-white hover:bg-blue-800`;
const BTN_LIGHT = `${BTN} bg-white text-brand-navy ring-1 ring-slate-300 hover:bg-slate-50`;

export interface SendClass { id: string; name: string; students: { id: string; name: string }[] }
export interface SendUnit { code: string; n: number; lessons: { code: string; name: string }[] }
export interface ScopeInput { grade: number; kind: SendScopeKind; codes?: string[] | null; classIds?: string[] }
export interface ScopeSendInput extends ScopeInput { studentIds?: string[] | null; exclude?: string[] | null; resend?: boolean; dueAt?: string | null; startAt?: string | null }
type PreviewFn = (input: ScopeInput) => Promise<{ ok: true; preview: SendPreview } | { ok: false; message: string }>;
type SendFn = (input: ScopeSendInput) => Promise<{ ok: boolean; message: string; result?: SendScopeResult }>;

const EVENT = "curriculum-plan:open";
interface Opener { kind?: SendScopeKind | null; codes?: string[] }

/** Opens the page's one Send window: kind null = "choose what to send" first; otherwise that scope is chosen. */
export function SendPlanButton({ kind = null, codes, label, big = false, small = false }: Opener & { label: string; big?: boolean; small?: boolean }) {
  const t = useT();
  const cls = small ? "inline-flex min-h-8 items-center rounded-full bg-blue-50 px-2.5 text-xs font-bold text-blue-800 ring-1 ring-blue-200 hover:bg-blue-100"
    : big ? `${BTN_CURRICULUM} w-full px-6 py-3 sm:w-auto` : `${BTN_LIGHT} w-full px-5 py-2.5 sm:w-auto`;
  return <button type="button" onClick={() => window.dispatchEvent(new CustomEvent<Opener>(EVENT, { detail: { kind, codes } }))} className={cls}>{small ? "📘 " : ""}{t(label)}</button>;
}

const KINDS: { k: SendScopeKind; label: string }[] = [
  { k: "SELECTION", label: "One selection" }, { k: "UNIT", label: "One unit" }, { k: "UNITS", label: "Several units" }, { k: "PLAN", label: "Whole plan" },
];

/**
 * The page's one Send window: 1 What (one selection · one unit · several units · the whole plan) → 2 Who and when
 * (classes, students, dates) → 3 Preview (every part, question counts, writing tasks, ✓ Sent; untick parts, read the
 * questions) → Send. The server skips what a class already has unless "Send again" is ticked.
 */
export function SendPlanHost({ grade, units, classes, preview, send }: { grade: number; units: SendUnit[]; classes: SendClass[]; preview: PreviewFn; send: SendFn }) {
  const t = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [kind, setKind] = useState<SendScopeKind>("UNIT");
  const [selection, setSelection] = useState(units[0]?.lessons[0]?.code ?? "");
  const [unit, setUnit] = useState(units[0]?.code ?? "");
  const [several, setSeveral] = useState<string[]>([]);
  const [classIds, setClassIds] = useState<string[]>(classes.length === 1 ? [classes[0].id] : []);
  const [someStudents, setSomeStudents] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [startAt, setStartAt] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [pv, setPv] = useState<SendPreview | null>(null);
  const [exclude, setExclude] = useState<string[]>([]);
  const [resend, setResend] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ message: string; result?: SendScopeResult } | null>(null);

  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<Opener>).detail;
      if (d.kind === "SELECTION" && d.codes?.[0]) setSelection(d.codes[0]);
      if (d.kind === "UNIT" && d.codes?.[0]) setUnit(d.codes[0]);
      if (d.kind) setKind(d.kind);
      setStep(d.kind ? 2 : 1); setPv(null); setExclude([]); setResend(false); setError(null); setDone(null); setOpen(true);
    };
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, []);
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape" && !busy) setOpen(false); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [open, busy]);
  if (!open) return null;

  const codes = kind === "SELECTION" ? [selection] : kind === "UNIT" ? [unit] : kind === "UNITS" ? several : [];
  const scopeOk = kind === "PLAN" || codes.filter(Boolean).length > 0;
  const oneClass = classIds.length === 1 ? classes.find((c) => c.id === classIds[0]) ?? null : null;
  const studentIds = oneClass && someStudents ? picked : null;
  const whoOk = classIds.length > 0 && (!studentIds || studentIds.length > 0) && (!startAt || !dueAt || startAt <= dueAt);
  const flip = (xs: string[], x: string) => (xs.includes(x) ? xs.filter((y) => y !== x) : [...xs, x]);
  const scope: ScopeInput = { grade, kind, codes, classIds };

  const toPreview = async () => {
    setBusy(true); setError(null);
    try { const r = await preview(scope); if (r.ok) { setPv(r.preview); setExclude([]); setStep(3); } else setError(r.message); }
    catch { setError(t("Something went wrong. Please try again.")); }
    finally { setBusy(false); }
  };
  const doSend = async () => {
    setBusy(true); setError(null);
    try {
      const r = await send({ ...scope, studentIds, exclude, resend, dueAt: dueAt || null, startAt: startAt || null });
      if (r.ok) { setDone(r); setStep(4); router.refresh(); } else setError(r.message);
    } catch { setError(t("Something went wrong. Please try again.")); }
    finally { setBusy(false); }
  };

  const sections = pv?.selections.flatMap((x) => x.sections) ?? [];
  const sentAll = (sec: SendPreview["selections"][number]["sections"][number]) => classIds.length > 0 && sec.sentTo.length >= classIds.length;
  const willSend = sections.filter((x) => x.ready && !exclude.includes(x.code) && (resend || !sentAll(x)));
  const anySent = sections.some((x) => x.sentTo.length > 0);
  const input = "mt-1 block min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3";
  const chip = (on: boolean) => `min-h-11 rounded-xl px-3 text-sm font-semibold ${on ? "bg-blue-700 text-white" : "bg-white text-brand-navy ring-1 ring-slate-300"}`;
  const pill = "inline-flex min-h-7 items-center rounded-full px-2 text-xs font-semibold ring-1";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={t("Send")}>
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col rounded-t-3xl bg-white shadow-xl sm:rounded-3xl">
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            {step < 4 && <p className="text-xs font-semibold text-slate-500">{t("Step {n} of {m}", { n: step, m: 3 })}</p>}
            <h2 className="text-xl font-semibold text-brand-navy">{step === 1 ? t("What do you want to send?") : step === 2 ? t("Who gets it, and when?") : step === 3 ? t("Preview") : t("Sent")}</h2>
          </div>
          <button type="button" onClick={() => !busy && setOpen(false)} className={BTN_LIGHT}>{t("Close")}</button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {step === 1 && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {KINDS.map(({ k, label }) => <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)} className={chip(kind === k)}>{t(label)}</button>)}
              </div>
              {kind === "SELECTION" && (
                <label className="block"><span className="text-sm font-semibold text-slate-700">{t("Selection")}</span>
                  <select value={selection} onChange={(e) => setSelection(e.target.value)} className={input}>
                    {units.map((u) => <optgroup key={u.code} label={t("Unit {n}", { n: u.n })}>{u.lessons.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}</optgroup>)}
                  </select>
                </label>
              )}
              {kind === "UNIT" && (
                <label className="block"><span className="text-sm font-semibold text-slate-700">{t("Unit")}</span>
                  <select value={unit} onChange={(e) => setUnit(e.target.value)} className={input}>
                    {units.map((u) => <option key={u.code} value={u.code}>{t("Unit {n}", { n: u.n })}</option>)}
                  </select>
                </label>
              )}
              {kind === "UNITS" && (
                <fieldset><legend className="text-sm font-semibold text-slate-700">{t("Units")}</legend>
                  <div className="mt-1 grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {units.map((u) => (
                      <label key={u.code} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl px-3 ring-1 ring-slate-200 has-[:checked]:bg-blue-50 has-[:checked]:ring-blue-300">
                        <input type="checkbox" checked={several.includes(u.code)} onChange={() => setSeveral((p) => flip(p, u.code))} className="h-5 w-5" />
                        <span className="font-medium text-slate-800">{t("Unit {n}", { n: u.n })}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              )}
              {kind === "PLAN" && <p className="rounded-xl bg-slate-50 p-4 text-slate-700">{t("All {n} units of Grade {g}.", { n: units.length, g: grade })}</p>}
            </div>
          )}

          {step === 2 && (!classes.length ? <p className="rounded-2xl bg-slate-50 p-5 text-center text-slate-600">{t("You have no classes yet.")}</p> : (
            <div className="space-y-4">
              <fieldset><legend className="text-sm font-semibold text-slate-700">{t("Classes")}</legend>
                <div className="mt-1 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {classes.map((c) => (
                    <label key={c.id} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl px-3 ring-1 ring-slate-200 has-[:checked]:bg-blue-50 has-[:checked]:ring-blue-300">
                      <input type="checkbox" checked={classIds.includes(c.id)} onChange={() => { setClassIds((p) => flip(p, c.id)); setPicked([]); setSomeStudents(false); }} className="h-5 w-5" />
                      <span className="font-medium text-slate-800">{c.name} <span className="text-xs text-slate-500">({c.students.length})</span></span>
                    </label>
                  ))}
                </div>
              </fieldset>
              {oneClass && oneClass.students.length > 0 && (
                <fieldset><legend className="text-sm font-semibold text-slate-700">{t("Who gets the plan?")}</legend>
                  <div className="mt-1 grid grid-cols-2 gap-2">
                    <button type="button" aria-pressed={!someStudents} onClick={() => { setSomeStudents(false); setPicked([]); }} className={chip(!someStudents)}>{t("Whole class")}</button>
                    <button type="button" aria-pressed={someStudents} onClick={() => setSomeStudents(true)} className={chip(someStudents)}>{t("Choose the students")}</button>
                  </div>
                  {someStudents && (
                    <ul className="mt-2 grid gap-2 sm:grid-cols-2" aria-label={t("Choose the students")}>
                      {oneClass.students.map((st) => (
                        <li key={st.id}><label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-3 ring-1 ring-slate-200 has-[:checked]:bg-blue-50 has-[:checked]:ring-blue-300">
                          <input type="checkbox" checked={picked.includes(st.id)} onChange={() => setPicked((p) => flip(p, st.id))} className="h-5 w-5" />
                          <span className="font-medium text-slate-800">{st.name}</span>
                        </label></li>
                      ))}
                    </ul>
                  )}
                </fieldset>
              )}
              <div className="grid grid-cols-2 gap-3">
                <label className="block"><span className="text-sm font-semibold text-slate-700">{t("Start date")}</span><input type="date" value={startAt} onChange={(e) => setStartAt(e.target.value)} className={input} /></label>
                <label className="block"><span className="text-sm font-semibold text-slate-700">{t("Due date")}</span><input type="date" value={dueAt} min={startAt || undefined} onChange={(e) => setDueAt(e.target.value)} className={input} /></label>
              </div>
            </div>
          ))}

          {step === 3 && pv && (
            <div>
              <p className="font-semibold text-brand-navy" data-content lang="en">{pv.title}</p>
              <p className="mt-0.5 text-sm text-slate-600">{t("{n} selections · {m} parts · {q} questions · {w} writing tasks", { n: pv.totals.selections, m: pv.totals.sections, q: pv.totals.questions, w: pv.totals.writing })}</p>
              <ol className="mt-3 space-y-3">
                {pv.selections.map((sel) => (
                  <li key={sel.code} className="rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-200">
                    <p className="text-xs font-semibold text-blue-800"><span>{t("Unit {n}", { n: sel.unitNo })}</span>{sel.genre && <span data-content lang="en"> · {sel.genre}</span>}</p>
                    <p className="font-semibold text-slate-900" data-content lang="en">{sel.name}</p>
                    <ul className="mt-1 divide-y divide-slate-200">
                      {sel.sections.map((sec) => {
                        const skip = !resend && sentAll(sec);
                        return (
                          <li key={sec.code} className={`flex flex-wrap items-center justify-between gap-2 py-1.5 ${!sec.ready || skip ? "opacity-60" : ""}`}>
                            <label className="flex min-h-9 items-center gap-2">
                              <input type="checkbox" disabled={!sec.ready} checked={sec.ready && !exclude.includes(sec.code)} onChange={() => setExclude((p) => flip(p, sec.code))} className="h-5 w-5" />
                              <span className="text-sm font-medium text-slate-800" data-content lang="en">{sec.title}</span>
                            </label>
                            <span className="flex flex-wrap items-center gap-1">
                              {!sec.ready && <span className={`${pill} bg-slate-100 text-slate-500 ring-slate-200`}>{t("Not ready")}</span>}
                              {sec.questions > 0 && <span className={`${pill} bg-white text-slate-700 ring-slate-200`}>{t("{n} questions", { n: sec.questions })}</span>}
                              {sec.writing && <span className={`${pill} bg-amber-50 text-amber-900 ring-amber-200`}>✍️ {t("Writing task")}</span>}
                              {sec.sentTo.length > 0 && <span data-testid="send-sent" className={`${pill} bg-emerald-50 text-emerald-800 ring-emerald-200`}>✓ {t("Sent")} · {sec.sentTo.map((c) => c.name).join(", ")}{skip ? ` · ${t("skipped")}` : ""}</span>}
                              {sec.questions > 0 && <Link href={`/teacher/preview?code=${encodeURIComponent(sec.code)}`} target="_blank" prefetch={false} className={`${pill} bg-white text-brand-navy ring-slate-300 hover:bg-slate-100`}>👁 {t("Read")}</Link>}
                              {sec.writing && <Link href={`/admin/curriculum-map/respond/${encodeURIComponent(sec.code)}`} target="_blank" prefetch={false} className={`${pill} bg-white text-brand-navy ring-slate-300 hover:bg-slate-100`}>👁 {t("Read")}</Link>}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </li>
                ))}
              </ol>
              {anySent && (
                <label className="mt-3 flex min-h-11 items-center gap-2 rounded-xl bg-amber-50 px-3 ring-1 ring-amber-200">
                  <input type="checkbox" checked={resend} onChange={(e) => setResend(e.target.checked)} className="h-5 w-5" />
                  <span className="text-sm font-medium text-amber-900">{t("Send again the parts already sent")}</span>
                </label>
              )}
              <p className="mt-3 text-sm font-semibold text-slate-700">{t("{n} parts will be sent to {m} classes.", { n: willSend.length, m: classIds.length })}</p>
            </div>
          )}

          {step === 4 && done && (
            <div role="status" className="rounded-2xl bg-emerald-50 p-5 text-emerald-900 ring-1 ring-emerald-200">
              <p className="font-semibold">{done.message}</p>
              {done.result && <ul className="mt-2 space-y-1 text-sm">
                {done.result.classes.map((c) => <li key={c.classId}><span className="font-semibold">{c.className}</span>: {t("{n} parts and {m} writing tasks", { n: c.parts, m: c.writing })}{c.alreadySent ? ` · ${t("{n} already sent", { n: c.alreadySent })}` : ""}{c.notes.length ? <span className="block text-emerald-800">{c.notes.join(" ")}</span> : null}</li>)}
              </ul>}
            </div>
          )}
          {error && step < 4 && <p role="alert" className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-red-800">{error}</p>}
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 px-5 py-4">
          {step === 1 && <button type="button" disabled={!scopeOk} onClick={() => { setError(null); setStep(2); }} className={`${BTN_CURRICULUM} disabled:opacity-50`}>{t("Next")}</button>}
          {step === 2 && <>
            <button type="button" disabled={busy} onClick={() => { setError(null); setStep(1); }} className={BTN_LIGHT}>{t("Back")}</button>
            <button type="button" disabled={busy || !whoOk} onClick={toPreview} className={`${BTN_CURRICULUM} disabled:opacity-50`}>{busy ? t("Loading…") : t("Preview")}</button>
          </>}
          {step === 3 && <>
            <button type="button" disabled={busy} onClick={() => { setError(null); setStep(2); }} className={BTN_LIGHT}>{t("Back")}</button>
            <button type="button" disabled={busy || !willSend.length} onClick={doSend} className={`${BTN_CURRICULUM} disabled:opacity-50`}>{busy ? t("Sending…") : t("Send")}</button>
          </>}
          {step === 4 && <>
            <Link href={done?.result?.classes.length === 1 && done.result.classes[0].planId ? `/teacher/plans/${done.result.classes[0].planId}` : "/teacher/plans"} prefetch={false} className={BTN_LIGHT}>{t("See progress")}</Link>
            <button type="button" onClick={() => setOpen(false)} className={BTN_CURRICULUM}>{t("Done")}</button>
          </>}
        </div>
      </div>
    </div>
  );
}
