"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useT } from "@/i18n/client";
import { BTN } from "@/components/ui-kit/tokens";

/** Curriculum = blue (one colour per source) */
export const BTN_CURRICULUM = `${BTN} bg-blue-700 text-white hover:bg-blue-800`;
const BTN_LIGHT = `${BTN} bg-white text-brand-navy ring-1 ring-slate-300 hover:bg-slate-50`;

export interface SendClass { id: string; name: string; students: { id: string; name: string }[] }
export interface OutlineLesson { unitCode: string; unit: string; name: string; skills: string[] }
export interface SendInput { grade: number; unitCode: string | null; classId: string; studentIds: string[] | null }

const EVENT = "curriculum-plan:open";

/** A big button that opens the page's one Send window for the whole grade (unitCode null) or one unit. */
export function SendPlanButton({ unitCode, label, big = false }: { unitCode: string | null; label: string; big?: boolean }) {
  const t = useT();
  return (
    <button type="button" onClick={() => window.dispatchEvent(new CustomEvent(EVENT, { detail: { unitCode } }))}
      className={`${big ? BTN_CURRICULUM : BTN_LIGHT} ${big ? "w-full px-6 py-3 text-lg sm:w-auto" : "w-full px-5 py-2.5 sm:w-auto"}`}>{t(label)}</button>
  );
}

type Who = "CLASS" | "GROUP" | "STUDENT";

/** The page's one Send window: who → preview (as the student will see it) → send. */
export function SendPlanHost({ grade, classes, outline, send }: { grade: number; classes: SendClass[]; outline: OutlineLesson[]; send: (input: SendInput) => Promise<{ ok: boolean; message: string; planId?: string }> }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [unitCode, setUnitCode] = useState<string | null>(null);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [classId, setClassId] = useState(classes[0]?.id ?? "");
  const [who, setWho] = useState<Who>("CLASS");
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string; planId?: string } | null>(null);
  useEffect(() => {
    const on = (e: Event) => { setUnitCode((e as CustomEvent<{ unitCode: string | null }>).detail.unitCode); setStep(1); setResult(null); setPicked([]); setOpen(true); };
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

  const klass = classes.find((c) => c.id === classId) ?? null;
  const lessons = outline.filter((l) => unitCode === null || l.unitCode === unitCode);
  const title = unitCode === null ? t("Send the whole curriculum plan") : t("Send this unit's plan");
  const studentIds = who === "CLASS" ? null : picked;
  const whoText = !klass ? "" : who === "CLASS" ? `${klass.name} · ${t("Whole class")} (${klass.students.length})` : picked.map((id) => klass.students.find((x) => x.id === id)?.name ?? "").join(", ");
  const canNext = !!klass && klass.students.length > 0 && (who === "CLASS" || picked.length > 0);
  const toggle = (id: string) => setPicked((p) => (who === "STUDENT" ? [id] : p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const doSend = async () => {
    if (!klass) return;
    setBusy(true);
    try { const r = await send({ grade, unitCode, classId: klass.id, studentIds }); setResult(r); if (r.ok) setStep(3); }
    catch { setResult({ ok: false, message: t("Something went wrong. Please try again.") }); }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col rounded-t-3xl bg-white shadow-xl sm:rounded-3xl">
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            <p className="text-xs font-semibold text-slate-500">{t("Step {n} of {m}", { n: step, m: 3 })}</p>
            <h2 className="text-xl font-semibold text-brand-navy">{title}</h2>
          </div>
          <button type="button" onClick={() => !busy && setOpen(false)} className={BTN_LIGHT}>{t("Close")}</button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {step === 1 && (!classes.length ? (
            <p className="rounded-2xl bg-slate-50 p-5 text-center text-slate-600">{t("You have no classes yet.")}</p>
          ) : (
            <div className="space-y-4">
              <label className="block">
                <span className="text-sm font-semibold text-slate-700">{t("Class")}</span>
                <select value={classId} onChange={(e) => { setClassId(e.target.value); setPicked([]); }} className="mt-1 block min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3">
                  {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>
              <fieldset>
                <legend className="text-sm font-semibold text-slate-700">{t("Who gets the plan?")}</legend>
                <div className="mt-1 grid grid-cols-3 gap-2">
                  {(["CLASS", "GROUP", "STUDENT"] as Who[]).map((w) => (
                    <button key={w} type="button" aria-pressed={who === w} onClick={() => { setWho(w); setPicked([]); }}
                      className={`min-h-11 rounded-xl px-2 text-sm font-semibold ${who === w ? "bg-blue-700 text-white" : "bg-white text-brand-navy ring-1 ring-slate-300"}`}>
                      {t(w === "CLASS" ? "Whole class" : w === "GROUP" ? "A group" : "One student")}
                    </button>
                  ))}
                </div>
              </fieldset>
              {klass && !klass.students.length && <p className="rounded-xl bg-slate-50 p-4 text-slate-600">{t("This class has no students yet.")}</p>}
              {klass && who !== "CLASS" && klass.students.length > 0 && (
                <ul className="grid gap-2 sm:grid-cols-2" aria-label={t("Choose the students")}>
                  {klass.students.map((st) => (
                    <li key={st.id}>
                      <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-3 ring-1 ring-slate-200 has-[:checked]:bg-blue-50 has-[:checked]:ring-blue-300">
                        <input type={who === "STUDENT" ? "radio" : "checkbox"} name="send-student" checked={picked.includes(st.id)} onChange={() => toggle(st.id)} className="h-5 w-5" />
                        <span className="font-medium text-slate-800">{st.name}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}

          {step === 2 && (
            <div>
              <p className="text-sm text-slate-600">{t("What the student will see")}</p>
              <p className="mt-1 font-semibold text-brand-navy">{whoText}</p>
              {!lessons.length ? <p className="mt-4 rounded-xl bg-slate-50 p-4 text-slate-600">{t("Nothing here yet")}</p> : (
                <ol className="mt-3 space-y-2" data-content lang="en">
                  {lessons.map((l, i) => (
                    <li key={`${l.unitCode}-${i}`} className="rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-200">
                      <p className="text-xs font-semibold text-blue-800">{l.unit}</p>
                      <p className="font-semibold text-slate-900">{i + 1}. {l.name}</p>
                      {l.skills.length > 0 && <p className="mt-0.5 text-sm text-slate-600">{l.skills.join(" · ")}</p>}
                    </li>
                  ))}
                </ol>
              )}
            </div>
          )}

          {step === 3 && result && (
            <div role="status" className="rounded-2xl bg-emerald-50 p-5 text-emerald-900 ring-1 ring-emerald-200">
              <p className="font-semibold">{result.message}</p>
            </div>
          )}
          {step !== 3 && result && !result.ok && <p role="alert" className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-red-800">{result.message}</p>}
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 px-5 py-4">
          {step === 1 && <button type="button" disabled={!canNext} onClick={() => setStep(2)} className={`${BTN_CURRICULUM} disabled:opacity-50`}>{t("Preview")}</button>}
          {step === 2 && <>
            <button type="button" disabled={busy} onClick={() => { setStep(1); setResult(null); }} className={BTN_LIGHT}>{t("Back")}</button>
            <button type="button" disabled={busy || !lessons.length} onClick={doSend} className={`${BTN_CURRICULUM} disabled:opacity-50`}>{busy ? t("Sending…") : t("Send")}</button>
          </>}
          {step === 3 && <>
            <Link href={result?.planId ? `/teacher/plans/${result.planId}` : "/teacher/plans"} prefetch={false} className={BTN_LIGHT}>{t("See progress")}</Link>
            <button type="button" onClick={() => setOpen(false)} className={BTN_CURRICULUM}>{t("Done")}</button>
          </>}
        </div>
      </div>
    </div>
  );
}
