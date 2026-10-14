"use client";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/i18n/client";
import { SourceTag, EmptyState, BTN_PRIMARY, BTN_SECONDARY } from "@/components/ui-kit";
import { addStudentAction, findSkillsAction, type AddStudentState } from "@/app/teacher/home-actions";
import type { SkillFamily } from "@/server/teacher/home";
import { SkillQuestionPicker, dedupeSkillsByName } from "@/components/skill-picker";
import { Combo } from "@/components/ui/combo";

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
      <Combo label={t("Choose a class")} value={value} onChange={(v) => router.push(`/teacher?classId=${encodeURIComponent(v)}`)} options={classes.map((c) => ({ value: c.id, label: c.name, hint: t("Grade {n}", { n: c.grade }) }))} className="min-w-56 text-base font-semibold" />
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

/** 🔎 Find a skill and assign it: skill names only, one row per skill name (no grade tags); open a skill to see its questions; Assign → student / group / class. */
export function SkillFinder({ classGrade, noCurriculum, canAssign }: { classGrade: number | null; noCurriculum: string | null; canAssign: boolean }) {
  const t = useT();
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<SkillFamily[] | null>(null);
  const [pending, start] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const search = (e?: React.FormEvent, value?: string) => {
    e?.preventDefault();
    const v = (value ?? q).trim();
    if (v.length < 1) { setRows(null); return; }
    // one row per skill name (+ grammar or not), even if the server sends the same name twice
    start(async () => { setRows(dedupeSkillsByName(await findSkillsAction(v, classGrade), (f) => (f.pick.grammar ? "GRAMMAR" : "READING"))); });
  };
  return (
    <section aria-labelledby="find-skill-h" className="mt-6 rounded-3xl bg-white p-5 shadow-card ring-1 ring-slate-200/80 sm:p-6">
      <h2 id="find-skill-h" className="text-xl font-semibold text-brand-navy"><span aria-hidden="true">🔎</span> {t("Find a skill and assign it")}</h2>
      {noCurriculum && <p className="mt-2 rounded-xl bg-sky-50 px-4 py-3 text-sm text-sky-950 ring-1 ring-sky-200">{t(noCurriculum)}</p>}
      <form onSubmit={search} className="mt-3 flex flex-col gap-2 sm:flex-row" role="search">
        <input value={q} onChange={(e) => { const v = e.target.value; setQ(v); if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(() => search(undefined, v), 200); }} autoComplete="off" type="search" dir="ltr" placeholder={t("Type a skill, e.g. main idea")} aria-label={t("Skill name")} className={`${field} sm:flex-1`} />
        <button className={BTN_SECONDARY} disabled={pending}>{t(pending ? "Searching…" : "Search")}</button>
      </form>
      {rows && rows.length === 0 && <div className="mt-4"><EmptyState compact icon="🔍" title="Nothing matches your search" text="Try another word, e.g. inference, theme, commas." /></div>}
      {rows && rows.length > 0 && (
        <ul className="mt-4 divide-y divide-slate-100">
          {rows.map((f) => {
            // one result per skill, no grade choice: the platform uses the class's own grade (or the nearest grade
            // that has questions) — the teacher only sees the skill and Assign
            const chosen = f.pick;
            return (
              <li key={f.key} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1">
                  <SkillQuestionPicker skillId={chosen.id} skillName={f.name} mode="view" name={null} />
                  {(chosen.grammar || chosen.questions === 0) && (
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      {chosen.grammar && <SourceTag source="GRAMMAR" size="sm" />}
                      {chosen.questions === 0 && <span className="text-xs text-amber-800">{t("No questions yet")}</span>}
                    </div>
                  )}
                </div>
                {canAssign && (
                  <button type="button" className={`${BTN_PRIMARY} shrink-0`}
                    onClick={() => window.dispatchEvent(new CustomEvent(OPEN, { detail: { id: chosen.id, name: f.name, standards: [], track: chosen.grammar ? "GRAMMAR" : "CURRICULUM" } }))}>
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
