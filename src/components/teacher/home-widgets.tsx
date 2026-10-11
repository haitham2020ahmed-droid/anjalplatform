"use client";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/i18n/client";
import { SourceTag, EmptyState, BTN_PRIMARY, BTN_SECONDARY } from "@/components/ui-kit";
import { addStudentAction, findSkillsAction, type AddStudentState } from "@/app/teacher/home-actions";
import type { SkillFamily } from "@/server/teacher/home";

const OPEN = "skill-assign:open";
const field = "min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-base";

/** Class selector (top of the Teacher Home): the whole page shows the chosen class only. */
export function ClassSelect({ classes, value }: { classes: { id: string; name: string; grade: number }[]; value: string }) {
  const t = useT();
  const router = useRouter();
  if (classes.length < 2) return null;
  return (
    <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
      <span>{t("Class")}</span>
      <select value={value} onChange={(e) => router.push(`/teacher?classId=${encodeURIComponent(e.target.value)}`)} className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 py-2 text-base font-semibold text-brand-navy" aria-label={t("Choose a class")}>
        {classes.map((c) => <option key={c.id} value={c.id}>{c.name} · {t("Grade {n}", { n: c.grade })}</option>)}
      </select>
    </label>
  );
}

/** ➕ Add Student: the username only (password = username). */
export function AddStudentButton({ classId, className }: { classId: string; className: string }) {
  const t = useT();
  const ref = useRef<HTMLDialogElement>(null);
  const [round, setRound] = useState(0);
  return (
    <>
      <button type="button" onClick={() => { setRound((r) => r + 1); ref.current?.showModal(); }} className={`${BTN_SECONDARY} w-full justify-center`}>
        <span aria-hidden="true">➕</span> {t("Add Student")}
      </button>
      <dialog ref={ref} className="w-[min(92vw,28rem)] rounded-2xl p-0 backdrop:bg-slate-900/40" aria-label={t("Add Student")}>
        <AddStudentForm key={round} classId={classId} className={className} close={() => ref.current?.close()} />
      </dialog>
    </>
  );
}

function AddStudentForm({ classId, className, close }: { classId: string; className: string; close: () => void }) {
  const t = useT();
  const router = useRouter();
  const [state, action, pending] = useActionState<AddStudentState, FormData>(addStudentAction, {});
  useEffect(() => { if (state.added) router.refresh(); }, [state.added, router]);
  return (
    <form action={action} className="space-y-4 p-6">
      <input type="hidden" name="classId" value={classId} />
      <h2 className="text-lg font-semibold text-brand-navy">{t("Add Student")} · <bdi>{className}</bdi></h2>
      {state.added ? (
        <div role="status" className="rounded-xl bg-teal-50 p-4 text-teal-950 ring-1 ring-teal-200">
          <p className="font-semibold">✓ {t("Student added")}</p>
          <p className="mt-1">{t("Username")}: <b className="font-mono" dir="ltr">{state.added.username}</b></p>
          <p>{t("Password")}: <b className="font-mono" dir="ltr">{state.added.password}</b></p>
        </div>
      ) : (
        <>
          <label className="block text-sm font-semibold text-slate-700">{t("Username")}
            <input name="username" required autoFocus autoComplete="off" spellCheck={false} dir="ltr" placeholder="e.g. sara.ali" className={`${field} mt-1 font-mono`} />
          </label>
          <p className="text-sm text-slate-600">{t("The password is the same as the username.")}</p>
          <details className="text-sm"><summary className="cursor-pointer font-semibold text-slate-600">{t("More options")}</summary>
            <label className="mt-2 block font-semibold text-slate-700">{t("Student name (optional)")}<input name="name" autoComplete="off" className={`${field} mt-1`} /></label>
          </details>
        </>
      )}
      {state.error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{state.error}</p>}
      <div className="flex justify-end gap-3">
        <button type="button" onClick={close} className={BTN_SECONDARY}>{t(state.added ? "Close" : "Cancel")}</button>
        {!state.added && <button disabled={pending} className={BTN_PRIMARY}>{t(pending ? "Saving…" : "Add Student")}</button>}
      </div>
    </form>
  );
}

/** 🔎 Find a skill and assign it: skill names only, one result per skill (grade tags), Assign → student / group / class. */
export function SkillFinder({ classGrade, noCurriculum, canAssign }: { classGrade: number | null; noCurriculum: string | null; canAssign: boolean }) {
  const t = useT();
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<SkillFamily[] | null>(null);
  const [pick, setPick] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const search = (e?: React.FormEvent) => {
    e?.preventDefault();
    const v = q.trim();
    if (v.length < 3) { setRows(null); return; }
    start(async () => { setRows(await findSkillsAction(v, classGrade)); setPick({}); });
  };
  return (
    <section aria-labelledby="find-skill-h" className="mt-6 rounded-3xl bg-white p-5 ring-1 ring-slate-200 sm:p-6">
      <h2 id="find-skill-h" className="text-xl font-semibold text-brand-navy"><span aria-hidden="true">🔎</span> {t("Find a skill and assign it")}</h2>
      {noCurriculum && <p className="mt-2 rounded-xl bg-sky-50 px-4 py-3 text-sm text-sky-950 ring-1 ring-sky-200">{t(noCurriculum)}</p>}
      <form onSubmit={search} className="mt-3 flex flex-col gap-2 sm:flex-row" role="search">
        <input value={q} onChange={(e) => setQ(e.target.value)} type="search" dir="ltr" placeholder={t("Type a skill, e.g. main idea")} aria-label={t("Skill name")} className={`${field} sm:flex-1`} />
        <button className={BTN_PRIMARY} disabled={pending}>{t(pending ? "Searching…" : "Search")}</button>
      </form>
      {rows && rows.length === 0 && <div className="mt-4"><EmptyState compact icon="🔍" title="Nothing matches your search" text="Try another word, e.g. inference, theme, commas." /></div>}
      {rows && rows.length > 0 && (
        <ul className="mt-4 divide-y divide-slate-100">
          {rows.map((f) => {
            const chosen = f.skills.find((k) => k.id === pick[f.key]) ?? f.pick;
            return (
              <li key={f.key} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900" data-content lang="en">{f.name}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5" role="group" aria-label={t("Grade")}>
                    {f.skills.map((k) => (
                      <button key={k.id} type="button" onClick={() => setPick((p) => ({ ...p, [f.key]: k.id }))} aria-pressed={k.id === chosen.id}
                        className={`min-h-9 rounded-full px-3 text-xs font-semibold ring-1 ${k.id === chosen.id ? "bg-brand-navy text-white ring-brand-navy" : "bg-white text-slate-700 ring-slate-300 hover:ring-brand-teal"}`}>
                        {t("Grade {n}", { n: k.grade })}
                      </button>
                    ))}
                    {chosen.grammar && <SourceTag source="GRAMMAR" size="sm" />}
                    {chosen.questions === 0 && <span className="text-xs text-amber-800">{t("No questions yet")}</span>}
                  </div>
                </div>
                {canAssign && (
                  <button type="button" className={`${BTN_PRIMARY} shrink-0`}
                    onClick={() => window.dispatchEvent(new CustomEvent(OPEN, { detail: { id: chosen.id, name: f.name, standards: [], grade: chosen.grade, track: chosen.grammar ? "GRAMMAR" : "CURRICULUM" } }))}>
                    <span aria-hidden="true">⭐</span> {t("Assign")}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
