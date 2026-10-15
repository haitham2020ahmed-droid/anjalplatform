"use client";
import { useState, useTransition } from "react";
import { addStudentsByNameAction, removeFromClassAction, renameClassStudentAction, type ClassStudentsState } from "@/app/teacher/class-students-actions";
import { LoginCards } from "@/components/accounts/login-cards";
import { BTN_PRIMARY, BTN_SECONDARY } from "@/components/ui-kit/tokens";
import { useT } from "@/i18n/client";

export interface ManagedStudent { studentId: string; name: string; username: string }

const MAX = 40;

/**
 * ➕ Add students (names, one per line) · ✏️ fix a name · take a student out of this class — on the teacher's class page.
 * After adding, the new accounts (username + password) are shown once with "Print login cards" for just these.
 */
export function ClassStudentsManager({ classId, className, schoolName, canAdd, students }: { classId: string; className: string; schoolName: string; canAdd: boolean; students: ManagedStudent[] }) {
  const t = useT();
  const [text, setText] = useState("");
  const [state, setState] = useState<ClassStudentsState>({});
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [note, setNote] = useState<ClassStudentsState>({});
  const [pending, start] = useTransition();
  const count = text.split(/\r?\n/).filter((l) => l.trim()).length;
  const created = state.result?.created ?? [];

  const add = () => start(async () => { const r = await addStudentsByNameAction(classId, text); setState(r); if (r.result) setText(""); });
  const save = (studentId: string) => start(async () => { const r = await renameClassStudentAction(classId, studentId, draft); setNote(r); if (!r.error) setEditing(null); });
  const remove = (s: ManagedStudent) => {
    if (!window.confirm(t("Take {name} out of this class? The account and their work stay; the admin can place them in another class.", { name: s.name }))) return;
    start(async () => setNote(await removeFromClassAction(classId, s.studentId)));
  };
  const print = () => {
    document.body.classList.add("print-new-cards");
    const done = () => { document.body.classList.remove("print-new-cards"); window.removeEventListener("afterprint", done); };
    window.addEventListener("afterprint", done);
    window.print();
  };

  return (
    <section aria-labelledby="class-students" className="mt-8 rounded-2xl bg-white p-5 ring-1 ring-slate-200 print:ring-0">
      <style>{"@media print { body.print-new-cards * { visibility: hidden !important; } body.print-new-cards #new-login-cards, body.print-new-cards #new-login-cards * { visibility: visible !important; } body.print-new-cards #new-login-cards { position: absolute; inset-inline-start: 0; top: 0; width: 100%; } }"}</style>
      <h2 id="class-students" className="text-lg font-semibold text-brand-navy print:hidden">👥 {t("Students in this class")}</h2>

      <details className="mt-3 rounded-xl p-3 ring-1 ring-slate-200 print:hidden" open={created.length > 0}>
        <summary className="flex min-h-11 cursor-pointer items-center font-semibold text-brand-navy">➕ {t("Add students")}</summary>
        {canAdd ? (
          <div className="mt-2 space-y-2">
            <label className="block text-sm text-slate-600">{t("Write the names, one per line (up to 40 at once). Usernames, student numbers and passwords are made for you.")}
              <textarea value={text} onChange={(e) => setText(e.target.value)} rows={5} dir="auto" maxLength={6000}
                className="mt-1 block w-full rounded-xl border border-slate-300 p-3 text-base" placeholder={t("One name per line")} />
            </label>
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" onClick={add} disabled={pending || count === 0 || count > MAX} className={`${BTN_PRIMARY} disabled:opacity-60`}>{pending ? t("Saving…") : t("Add {n} students", { n: count })}</button>
              {count > MAX && <span className="text-sm text-red-700">{t("Add at most 40 students at a time.")}</span>}
              {state.error && <span role="alert" className="rounded-lg bg-red-50 px-3 py-1.5 text-sm text-red-700">{t(state.error)}</span>}
            </div>
          </div>
        ) : <p className="mt-2 text-sm text-slate-600">{t("Adding students is turned off for teachers in this school. Ask the school admin.")}</p>}
      </details>

      {state.result && (
        <div role="status" className="mt-4 rounded-xl bg-emerald-50 p-4 ring-1 ring-emerald-200">
          <p className="font-semibold text-emerald-900">{t("{n} students added to {cls}", { n: created.length, cls: state.result.className })}</p>
          {state.result.skipped.length > 0 && <p className="mt-1 text-sm text-amber-900">{t("Not added")}: {state.result.skipped.map((x) => `${x.name} (${t(x.reason)})`).join(" · ")}</p>}
          {created.length > 0 && (
            <>
              <div className="mt-3 overflow-x-auto print:hidden">
                <table className="w-full text-start text-sm">
                  <thead><tr className="border-b text-slate-500"><th className="py-1 text-start">{t("Student name")}</th><th className="text-start">{t("Username")}</th><th className="text-start">{t("Password")}</th></tr></thead>
                  <tbody>{created.map((c) => <tr key={c.userId} className="border-b last:border-0"><td className="py-1"><bdi>{c.name}</bdi></td><td className="font-mono" dir="ltr">{c.username}</td><td className="font-mono" dir="ltr">{c.password}</td></tr>)}</tbody>
                </table>
              </div>
              <p className="mt-2 text-xs text-slate-600 print:hidden">{t("Write the passwords down or print the cards now: they are shown only once.")}</p>
              <button type="button" onClick={print} className={`${BTN_SECONDARY} mt-3 print:hidden`}>🖨 {t("Print login cards")}</button>
              <div id="new-login-cards" className="hidden print:block">
                <LoginCards t={t} schoolName={schoolName}base={typeof window === "undefined" ? "" : window.location.origin}
                  cards={created.map((c) => ({ userId: c.userId, name: c.name, username: c.username, number: c.number, className: state.result!.className, grade: state.result!.grade, password: c.password }))} />
              </div>
            </>
          )}
        </div>
      )}

      <details className="mt-3 rounded-xl p-3 ring-1 ring-slate-200 print:hidden">
        <summary className="flex min-h-11 cursor-pointer items-center font-semibold text-brand-navy">✏️ {t("Fix a name or take a student out of this class")}</summary>
        {note.error && <p role="alert" className="mt-2 rounded-lg bg-red-50 px-3 py-1.5 text-sm text-red-700">{t(note.error)}</p>}
        {note.message && !note.error && <p role="status" className="mt-2 text-sm text-emerald-800">{t(note.message)}</p>}
        {students.length === 0 ? <p className="mt-2 text-sm text-slate-500">{t("No students in this class yet")}</p> : (
          <ul className="mt-2 divide-y divide-slate-100">
            {students.map((s) => (
              <li key={s.studentId} className="flex flex-wrap items-center gap-2 py-2">
                {editing === s.studentId ? (
                  <>
                    <input value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={100} dir="auto" aria-label={t("Student name")} className="min-h-11 flex-1 rounded-lg border border-slate-300 px-3" />
                    <button type="button" disabled={pending || !draft.trim()} onClick={() => save(s.studentId)} className={`${BTN_PRIMARY} disabled:opacity-60`}>{t("Save")}</button>
                    <button type="button" onClick={() => setEditing(null)} className="min-h-11 px-3 text-sm text-slate-600">{t("Cancel")}</button>
                  </>
                ) : (
                  <>
                    <span className="flex-1"><bdi className="font-medium text-brand-navy">{s.name}</bdi> <span className="font-mono text-xs text-slate-500" dir="ltr">{s.username}</span></span>
                    <button type="button" onClick={() => { setEditing(s.studentId); setDraft(s.name); setNote({}); }} className="min-h-11 rounded-lg px-3 text-sm font-semibold text-brand-teal hover:underline">✏️ {t("Fix name")}</button>
                    <button type="button" disabled={pending} onClick={() => remove(s)} className="min-h-11 rounded-lg px-3 text-sm font-semibold text-red-700 hover:underline">{t("Take out of {cls}", { cls: className })}</button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </details>
    </section>
  );
}
