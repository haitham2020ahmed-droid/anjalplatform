"use client";
import { useActionState, useState } from "react";
import { createUserAction, type Result } from "../actions";
import { field, label } from "@/components/admin/styles";
import { BTN_PRIMARY, BTN_SECONDARY } from "@/components/ui-kit/tokens";
import { useT } from "@/i18n/client";
import { classesByGrade, DEFAULT_ROLE, FORM_ROLES, roleAfterResult, type FormClass } from "./form-state";
import { Combo } from "@/components/ui/combo";

/**
 * Create one user. Role-specific fields appear for the chosen role. Teachers: “Classes taught” (every class, grouped by
 * grade, plus “+ Add class”) is saved with the account in one step.
 * After a success the whole form starts again (the form is keyed on a success counter and the role state goes back to
 * Student), so the fields on screen always match the role select.
 */
export function CreateUserForm({ grades, classes, teacherOnly = false, onDone }: { grades: number[]; classes: FormClass[]; teacherOnly?: boolean; onDone?: () => void }) {
  const t = useT();
  const start = teacherOnly ? "TEACHER" : DEFAULT_ROLE;
  const [role, setRole] = useState<string>(start);
  const [grade, setGrade] = useState(grades[0] ?? 4);
  const [round, setRound] = useState(0);
  const [newClasses, setNewClasses] = useState<{ gradeLevel: number; name: string }[]>([]);
  const [adding, setAdding] = useState<{ gradeLevel: number; name: string } | null>(null);
  const [state, formAction, pending] = useActionState<Result, FormData>(async (prev, f) => {
    const r = await createUserAction(prev, f);
    if (r.ok) {
      setRole(teacherOnly ? "TEACHER" : roleAfterResult(r, role));
      setNewClasses([]); setAdding(null);
      setRound((n) => n + 1);
      onDone?.();
    }
    return r;
  }, {});
  const groups = classesByGrade(classes);

  return (
    <div>
      <form key={round} action={formAction} onReset={() => setRole(start)} className="grid gap-3 sm:grid-cols-2">
        {teacherOnly ? <input type="hidden" name="role" value="TEACHER" /> : (
          <label className={label}>{t("Role")}
            <select name="role" value={role} onChange={(e) => setRole(e.target.value)} className={field}>
              {FORM_ROLES.map((r) => <option key={r.value} value={r.value}>{t(r.label)}</option>)}
            </select>
          </label>
        )}
        <label className={label}>{t("Username")}<input name="username" required minLength={3} maxLength={40} pattern="[a-zA-Z0-9][a-zA-Z0-9._-]{2,39}" className={field} autoComplete="off" /></label>
        <label className={label}>{t("Full name")}<input name="displayName" required maxLength={100} dir="auto" className={field} /></label>
        {role !== "TEACHER" && <label className={label}>{t("Email (optional)")}<input name="email" type="email" maxLength={254} className={field} /></label>}
        {role === "STUDENT" && (
          <>
            <label className={label}>{t("Student number (optional)")}<input name="studentNumber" maxLength={32} placeholder={t("Empty: given automatically")} className={field} /></label>
            <label className={label}>{t("Grade")}
              <select name="gradeLevel" value={grade} onChange={(e) => setGrade(Number(e.target.value))} className={field}>{grades.map((g) => <option key={g} value={g}>{t("Grade {n}", { n: g })}</option>)}</select>
            </label>
            <label className={label}>{t("Class")}
              <Combo key={grade} name="classId" label={t("Class")} defaultValue="" options={[{ value: "", label: t("No class yet") }, ...classes.filter((c) => c.grade === grade).map((c) => ({ value: c.id, label: c.name }))]} />
            </label>
          </>
        )}
        {role === "TEACHER" && (
          <>
            <label className={label}>{t("Title (optional)")}<input name="title" maxLength={20} placeholder="Ms" className={field} /></label>
            <fieldset className="sm:col-span-2 rounded-xl p-3 ring-1 ring-slate-200">
              <legend className="px-1 text-sm font-semibold text-slate-700">{t("Classes taught")}</legend>
              {groups.length === 0 && newClasses.length === 0 && <p className="text-sm text-slate-500">{t("No classes yet. Add one below.")}</p>}
              <div className="max-h-64 space-y-2 overflow-y-auto">
                {groups.map((g) => (
                  <div key={g.grade}>
                    <p className="text-xs font-semibold text-slate-500">{t("Grade {n}", { n: g.grade })}</p>
                    <div className="mt-1 flex flex-wrap gap-2">
                      {g.classes.map((c) => (
                        <label key={c.id} className="inline-flex min-h-11 items-center gap-2 rounded-lg px-3 ring-1 ring-slate-200">
                          <input type="checkbox" name="classId" value={c.id} className="h-4 w-4" />{c.name}
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              {newClasses.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {newClasses.map((c, i) => (
                    <span key={`${c.gradeLevel}|${c.name}`} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-blue-50 px-3 text-blue-900 ring-1 ring-blue-200">
                      <input type="hidden" name="newClass" value={`${c.gradeLevel}|${c.name}`} />
                      {t("New")}: {c.name} · {t("Grade {n}", { n: c.gradeLevel })}
                      <button type="button" onClick={() => setNewClasses(newClasses.filter((_, k) => k !== i))} aria-label={t("Remove")} className="min-h-11 px-2 font-bold">×</button>
                    </span>
                  ))}
                </div>
              )}
              {adding ? (
                <div className="mt-3 flex flex-wrap items-end gap-2">
                  <label className={label}>{t("Grade")}
                    <select value={adding.gradeLevel} onChange={(e) => setAdding({ ...adding, gradeLevel: Number(e.target.value) })} className={field}>
                      {Array.from({ length: 12 }, (_, i) => i + 1).map((g) => <option key={g} value={g}>{t("Grade {n}", { n: g })}</option>)}
                    </select>
                  </label>
                  <label className={label}>{t("Class name")}<input value={adding.name} maxLength={20} placeholder="4C" onChange={(e) => setAdding({ ...adding, name: e.target.value })} className={field} /></label>
                  <button type="button" className={BTN_SECONDARY} disabled={!adding.name.trim()} onClick={() => { setNewClasses([...newClasses, { gradeLevel: adding.gradeLevel, name: adding.name.trim() }]); setAdding(null); }}>{t("Add")}</button>
                  <button type="button" className="min-h-11 px-3 text-sm text-slate-600" onClick={() => setAdding(null)}>{t("Cancel")}</button>
                </div>
              ) : (
                <button type="button" className={`${BTN_SECONDARY} mt-3`} onClick={() => setAdding({ gradeLevel: groups[0]?.grade ?? grades[0] ?? 4, name: "" })}>{t("+ Add class")}</button>
              )}
            </fieldset>
          </>
        )}
        <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
          <button disabled={pending} className={`${BTN_PRIMARY} disabled:opacity-60`}>{pending ? t("Saving…") : teacherOnly ? t("Create teacher") : t("Create account")}</button>
          {state.error && <span role="alert" className="rounded-lg bg-red-50 px-3 py-1.5 text-sm text-red-700"><bdi>{t(state.error)}</bdi>{state.href && <> <a href={state.href} className="font-semibold underline">{t("Open this account")}</a></>}</span>}
        </div>
      </form>
      {state.ok && state.temporaryPassword && (
        <p role="status" className="mt-3 rounded-xl bg-amber-50 p-4 ring-1 ring-amber-200">
          {state.message ? <>{t(state.message)} </> : null}{state.studentNumber ? <>{t("Student number")}: <b className="font-mono">{state.studentNumber}</b>. </> : null}{t("First password (shown only now):")} <code className="select-all rounded bg-white px-2 py-1 font-mono font-bold">{state.temporaryPassword}</code>
        </p>
      )}
    </div>
  );
}
