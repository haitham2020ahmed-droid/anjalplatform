"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { useT } from "@/i18n/client";
import { BTN_PRIMARY, BTN_SECONDARY } from "@/components/ui-kit/tokens";
import { EmptyState } from "@/components/ui-kit/empty-state";
import { field, label } from "@/components/admin/styles";
import type { SchoolTree, TreeClass, TreeStudent } from "@/server/admin/school";
import type { QuickResult } from "@/server/admin/quick-students";
import { CreateUserForm } from "../users/create-user-form";
import { RosterForm } from "../roster/roster-form";
import { normSearch as norm } from "./search";
import { archiveClassAction, renameClassAction } from "../actions";
import { addClassAction, addGradeAction, addStudentsAction, changeTeacherAction, moveStudentToClassAction, resetClassPasswordsAction, type SchoolResult } from "./actions";
import { Combo } from "@/components/ui/combo";

export type OpenDialog = "roster" | "add-student" | "new-teacher" | "teacher" | "no-class" | "add-grade";
type Dialog =
  | { kind: "add-grade" } | { kind: "add-class"; grade: number } | { kind: "new-teacher" } | { kind: "roster" }
  | { kind: "add-student"; classId: string | null } | { kind: "move"; student: TreeStudent; fromClassId: string | null }
  | { kind: "teacher"; classId: string | null } | { kind: "reset"; classId: string } | { kind: "edit-class"; classId: string; name: string };

const SMALL = "inline-flex min-h-11 items-center justify-center gap-1 rounded-xl bg-white px-3 text-sm font-semibold text-brand-navy ring-1 ring-slate-300 hover:bg-slate-50";

/** A small modal dialog (native <dialog>): Esc and the × button close it. */
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const t = useT();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const d = ref.current; if (d && !d.open) d.showModal(); }, []);
  return (
    <dialog ref={ref} onClose={onClose} aria-label={title} className="w-[min(94vw,40rem)] rounded-2xl p-0 backdrop:bg-slate-900/40">
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-3">
        <h2 className="text-lg font-semibold text-brand-navy">{title}</h2>
        <button type="button" onClick={() => ref.current?.close()} aria-label={t("Close")} className="min-h-11 min-w-11 rounded-lg text-2xl text-slate-500 hover:bg-slate-100">×</button>
      </div>
      <div className="max-h-[75vh] overflow-y-auto p-5">{children}</div>
    </dialog>
  );
}

function Message({ r }: { r: SchoolResult | null }) {
  const t = useT();
  if (!r) return null;
  if (r.error) return <p role="alert" className="mt-3 rounded-xl bg-red-50 px-4 py-2 text-red-800 ring-1 ring-red-200">{t(r.error)}</p>;
  if (r.message) return <p role="status" className="mt-3 rounded-xl bg-teal-50 px-4 py-2 text-teal-900 ring-1 ring-teal-200">✓ {t(r.message)}</p>;
  return null;
}

export function SchoolTreeView({ tree, open, filter, initialQuery }: { tree: SchoolTree; open: OpenDialog | null; filter: "no-teacher" | null; initialQuery: string }) {
  const t = useT();
  const router = useRouter();
  const [q, setQ] = useState(initialQuery);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(open === "no-class" ? ["no-class"] : []));
  const [dialog, setDialog] = useState<Dialog | null>(() => {
    if (open === "roster") return { kind: "roster" };
    if (open === "add-student") return { kind: "add-student", classId: null };
    if (open === "new-teacher") return { kind: "new-teacher" };
    if (open === "teacher") return { kind: "teacher", classId: null };
    if (open === "add-grade") return { kind: "add-grade" };
    return null;
  });
  const toggle = (id: string) => setExpanded((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const close = () => { setDialog(null); router.refresh(); };

  const allClasses = useMemo(() => tree.grades.flatMap((g) => g.classes.map((c) => ({ id: c.id, name: c.name, grade: g.level, students: c.students }))), [tree]);
  const nq = norm(q);
  const hit = (...v: string[]) => !nq || v.some((x) => norm(x).includes(nq));
  const view = tree.grades.map((g) => ({
    ...g,
    classes: g.classes
      .filter((c) => filter !== "no-teacher" || c.teachers.length === 0)
      .map((c) => {
        const classHit = hit(c.name, ...c.teachers.map((x) => x.name));
        const students = classHit ? c.students : c.students.filter((s) => hit(s.name, s.username, s.number));
        return { ...c, students, show: classHit || students.length > 0 };
      }).filter((c) => c.show),
  })).filter((g) => !nq && filter !== "no-teacher" ? true : g.classes.length > 0);
  const lonely = tree.withoutClass.filter((s) => hit(s.name, s.username, s.number));
  const isOpen = (id: string) => Boolean(nq) || filter === "no-teacher" || expanded.has(id);
  const missingGrades = Array.from({ length: 12 }, (_, i) => i + 1).filter((lv) => !tree.grades.some((g) => g.level === lv && g.active));

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end gap-3">
        <label className="min-w-[14rem] flex-1 text-sm font-medium text-slate-700">{t("Search")}
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} dir="auto" placeholder={t("A name in Arabic or English, a username or a class")} className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3" />
        </label>
        <button type="button" className={BTN_SECONDARY} onClick={() => setDialog({ kind: "add-grade" })}>{t("+ Add grade")}</button>
        <button type="button" className={BTN_SECONDARY} onClick={() => setDialog({ kind: "roster" })}>{t("Upload roster")}</button>
        <button type="button" className={BTN_PRIMARY} onClick={() => setDialog({ kind: "new-teacher" })}>{t("+ New teacher")}</button>
      </div>
      {filter === "no-teacher" && (
        <p className="mb-4 flex flex-wrap items-center gap-3 rounded-xl bg-orange-50 px-4 py-2 text-orange-900 ring-1 ring-orange-200">
          {t("Showing only classes without a teacher.")} <Link href="/admin/school" className="font-semibold underline">{t("Show all")}</Link>
        </p>
      )}

      {tree.grades.length === 0 ? (
        <EmptyState icon="🏫" title="No grades yet" text="Start with + Add grade, then add classes and teachers." />
      ) : view.length === 0 && lonely.length === 0 ? (
        <EmptyState icon="🔎" title="Nothing matches" text="Try another name or spelling." compact />
      ) : (
        <ul className="space-y-4">
          {view.map((g) => {
            const students = g.classes.reduce((n, c) => n + c.students.length, 0);
            return (
              <li key={g.id} className="rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
                <div className="flex flex-wrap items-center justify-between gap-2 p-3 sm:p-4">
                  <button type="button" onClick={() => toggle(g.id)} aria-expanded={isOpen(g.id)} className="flex min-h-11 flex-1 items-center gap-3 text-start">
                    <span aria-hidden="true" className={`inline-block transition ${isOpen(g.id) ? "rotate-90" : "rtl:rotate-180"}`}>›</span>
                    <span className="text-lg font-semibold text-brand-navy">{t("Grade {n}", { n: g.level })}</span>
                    <span className="text-sm text-slate-500">{t("{n} classes", { n: g.classes.length })} · {t("{n} students", { n: students })}</span>
                    {!g.active && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{t("Switched off")}</span>}
                  </button>
                  <button type="button" className={SMALL} onClick={() => setDialog({ kind: "add-class", grade: g.level })}>{t("+ Add class")}</button>
                </div>
                {isOpen(g.id) && (
                  <ul className="space-y-2 border-t border-slate-100 p-3 sm:p-4">
                    {g.classes.length === 0 && <li className="text-sm text-slate-500">{t("No classes in this grade yet.")}</li>}
                    {g.classes.map((c) => <ClassRow key={c.id} c={c} open={isOpen(c.id)} onToggle={() => toggle(c.id)} setDialog={setDialog} />)}
                  </ul>
                )}
              </li>
            );
          })}
          {tree.withoutClass.length > 0 && lonely.length > 0 && filter !== "no-teacher" && (
            <li id="no-class" className="rounded-2xl bg-white shadow-sm ring-1 ring-orange-200">
              <button type="button" onClick={() => toggle("no-class")} aria-expanded={isOpen("no-class")} className="flex min-h-11 w-full items-center gap-3 p-3 text-start sm:p-4">
                <span aria-hidden="true" className={`inline-block transition ${isOpen("no-class") ? "rotate-90" : "rtl:rotate-180"}`}>›</span>
                <span className="text-lg font-semibold text-orange-800">{t("Students without a class")}</span>
                <span className="text-sm text-slate-500">{t("{n} students", { n: lonely.length })}</span>
              </button>
              {isOpen("no-class") && <StudentList students={lonely} classId={null} setDialog={setDialog} />}
            </li>
          )}
        </ul>
      )}

      {dialog?.kind === "add-grade" && <AddGradeDialog missing={missingGrades} onClose={close} />}
      {dialog?.kind === "add-class" && <AddClassDialog grade={dialog.grade} onClose={close} />}
      {dialog?.kind === "new-teacher" && (
        <Modal title={t("New teacher")} onClose={close}>
          <p className="mb-3 text-sm text-slate-600">{t("The first password is the username. The teacher chooses a new one at the first sign-in.")}</p>
          <CreateUserForm teacherOnly grades={tree.grades.map((g) => g.level)} classes={allClasses.map(({ id, name, grade }) => ({ id, name, grade }))} />
        </Modal>
      )}
      {dialog?.kind === "roster" && (
        <Modal title={t("Upload roster")} onClose={close}>
          <p className="mb-3 text-sm text-slate-600">{t("A CSV or Excel file: one row per person. The file says each student's grade and class. Nothing is saved until you press Import.")}</p>
          <RosterForm />
        </Modal>
      )}
      {dialog?.kind === "add-student" && <AddStudentsDialog classes={allClasses} classId={dialog.classId} onClose={close} />}
      {dialog?.kind === "move" && <MoveDialog student={dialog.student} fromClassId={dialog.fromClassId} classes={allClasses} onClose={close} />}
      {dialog?.kind === "teacher" && <TeacherDialog tree={tree} classId={dialog.classId} onClose={close} />}
      {dialog?.kind === "edit-class" && <EditClassDialog classId={dialog.classId} name={dialog.name} onClose={close} />}
      {dialog?.kind === "reset" && <ResetDialog c={allClasses.find((c) => c.id === dialog.classId)!} onClose={close} />}
    </div>
  );
}

function ClassRow({ c, open, onToggle, setDialog }: { c: TreeClass; open: boolean; onToggle: () => void; setDialog: (d: Dialog) => void }) {
  const t = useT();
  return (
    <li className="rounded-xl bg-slate-50 ring-1 ring-slate-200">
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex min-h-11 w-full flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-start">
        <span aria-hidden="true" className={`inline-block transition ${open ? "rotate-90" : "rtl:rotate-180"}`}>›</span>
        <span className="font-semibold text-brand-navy">{c.name}</span>
        <span className={`text-sm ${c.teachers.length ? "text-slate-700" : "font-semibold text-orange-700"}`}>
          {c.teachers.length ? <bdi>{c.teachers.map((x) => x.name).join(", ")}</bdi> : t("No teacher")}
        </span>
        <span className="text-sm text-slate-500">{t("{n} students", { n: c.students.length })}</span>
      </button>
      {open && (
        <div className="border-t border-slate-200 bg-white px-3 py-3">
          <div className="flex flex-wrap gap-2">
            <button type="button" className={SMALL} onClick={() => setDialog({ kind: "add-student", classId: c.id })}>{t("Add student")}</button>
            <button type="button" className={SMALL} onClick={() => setDialog({ kind: "teacher", classId: c.id })}>{c.teachers.length ? t("Change teacher") : t("Choose a teacher")}</button>
            <Link href={`/admin/student-cards?classId=${encodeURIComponent(c.id)}`} prefetch={false} className={SMALL}>{t("Print sign-in cards")}</Link>
            <button type="button" className={SMALL} disabled={!c.students.length} onClick={() => setDialog({ kind: "reset", classId: c.id })}>{t("Reset passwords")}</button>
            <button type="button" className={SMALL} onClick={() => setDialog({ kind: "edit-class", classId: c.id, name: c.name })}>{t("Rename or archive")}</button>
          </div>
          {c.students.length ? <StudentList students={c.students} classId={c.id} setDialog={setDialog} /> : <p className="mt-3 text-sm text-slate-500">{t("No students in this class yet. Press Add student.")}</p>}
        </div>
      )}
    </li>
  );
}

function StudentList({ students, classId, setDialog }: { students: TreeStudent[]; classId: string | null; setDialog: (d: Dialog) => void }) {
  const t = useT();
  return (
    <ul className="mt-3 divide-y divide-slate-100">
      {students.map((s) => (
        <li key={s.userId} className="flex flex-wrap items-center justify-between gap-2 px-1 py-1.5">
          <span className="min-w-0">
            <Link href={`/admin/users/${s.userId}`} prefetch={false} className="font-medium text-slate-900 hover:underline"><bdi>{s.name}</bdi></Link>
            <span className="ms-2 font-mono text-xs text-slate-500">{s.username}</span>
          </span>
          <button type="button" className={SMALL} onClick={() => setDialog({ kind: "move", student: s, fromClassId: classId })}>{t("Move")}</button>
        </li>
      ))}
    </ul>
  );
}

function useAction() {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<SchoolResult | null>(null);
  const go = (fn: () => Promise<SchoolResult>) => start(async () => setResult(await fn()));
  return { pending, result, go };
}

function AddGradeDialog({ missing, onClose }: { missing: number[]; onClose: () => void }) {
  const t = useT();
  const [level, setLevel] = useState(missing[0] ?? 1);
  const { pending, result, go } = useAction();
  return (
    <Modal title={t("Add grade")} onClose={onClose}>
      {missing.length === 0 ? <p className="text-slate-600">{t("All grades 1–12 are already here.")}</p> : (
        <div className="flex flex-wrap items-end gap-3">
          <label className={label}>{t("Grade")}
            <select value={level} onChange={(e) => setLevel(Number(e.target.value))} className={`${field} min-h-11`}>{missing.map((g) => <option key={g} value={g}>{t("Grade {n}", { n: g })}</option>)}</select>
          </label>
          <button type="button" disabled={pending || result?.ok} onClick={() => go(() => addGradeAction(level))} className={`${BTN_PRIMARY} disabled:opacity-60`}>{pending ? t("Saving…") : t("Add grade")}</button>
        </div>
      )}
      <Message r={result} />
    </Modal>
  );
}

function AddClassDialog({ grade, onClose }: { grade: number; onClose: () => void }) {
  const t = useT();
  const [name, setName] = useState("");
  const { pending, result, go } = useAction();
  return (
    <Modal title={t("Add a class to Grade {n}", { n: grade })} onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); go(async () => { const r = await addClassAction(grade, name); if (r.ok) setName(""); return r; }); }} className="flex flex-wrap items-end gap-3">
        <label className={label}>{t("Class name")}<input value={name} onChange={(e) => setName(e.target.value)} required maxLength={20} placeholder={`${grade}A`} className={`${field} min-h-11`} /></label>
        <button disabled={pending || !name.trim()} className={`${BTN_PRIMARY} disabled:opacity-60`}>{pending ? t("Saving…") : t("Add class")}</button>
      </form>
      <Message r={result} />
    </Modal>
  );
}

function AddStudentsDialog({ classes, classId, onClose }: { classes: { id: string; name: string; grade: number }[]; classId: string | null; onClose: () => void }) {
  const t = useT();
  const [cid, setCid] = useState(classId ?? classes[0]?.id ?? "");
  const [names, setNames] = useState("");
  const [done, setDone] = useState<QuickResult | null>(null);
  const { pending, result, go } = useAction();
  const lines = names.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).length;
  const klass = classes.find((c) => c.id === cid);
  return (
    <Modal title={t("Add student")} onClose={onClose}>
      {classes.length === 0 ? <p className="text-slate-600">{t("Add a class first.")}</p> : done ? (
        <div>
          <p role="status" className="rounded-xl bg-teal-50 px-4 py-2 text-teal-900 ring-1 ring-teal-200">✓ {t("{n} student(s) added. Their sign-in details are shown only now:", { n: done.created.length })}</p>
          <ul className="mt-3 space-y-1 text-sm">
            {done.created.map((c) => <li key={c.username}><bdi className="font-semibold">{c.name}</bdi> · <span className="font-mono">{c.username}</span> · <span className="font-mono">{c.password}</span></li>)}
            {done.skipped.map((c) => <li key={`skip-${c.name}`} className="text-orange-800"><bdi>{c.name}</bdi> — {c.reason}</li>)}
          </ul>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href={`/admin/student-cards?classId=${encodeURIComponent(cid)}`} prefetch={false} className={BTN_PRIMARY}>{t("Print sign-in cards")}</Link>
            <button type="button" className={BTN_SECONDARY} onClick={() => { setDone(null); setNames(""); }}>{t("Add more")}</button>
          </div>
        </div>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); go(async () => { const r = await addStudentsAction(cid, names); if (r.result) setDone(r.result); return r; }); }} className="space-y-3">
          {!classId && (
            <label className={label}>{t("Class")}
              <Combo label={t("Class")} value={cid} onChange={setCid} options={classes.map((c) => ({ value: c.id, label: c.name, group: t("Grade {n}", { n: c.grade }) }))} />
            </label>
          )}
          <label className={label}>{t("Student names, one per line (add “, number” if the student has a number)")}
            <textarea value={names} onChange={(e) => setNames(e.target.value)} required rows={6} dir="auto" placeholder={"Omar Al Harbi\nLayan Ahmed, 1023"} className={`${field} font-mono text-sm`} />
          </label>
          <p className="text-sm text-slate-600">{t("Usernames are made from the names. The first password follows the school's choice (the username, or a temporary password).")}</p>
          <button disabled={pending || !lines} className={`${BTN_PRIMARY} disabled:opacity-60`}>{pending ? t("Saving…") : t("Add {n} student(s) to {class}", { n: lines, class: klass?.name ?? "" })}</button>
        </form>
      )}
      <Message r={result?.error ? result : null} />
    </Modal>
  );
}

function MoveDialog({ student, fromClassId, classes, onClose }: { student: TreeStudent; fromClassId: string | null; classes: { id: string; name: string; grade: number }[]; onClose: () => void }) {
  const t = useT();
  const others = classes.filter((c) => c.id !== fromClassId);
  const [to, setTo] = useState(others[0]?.id ?? "");
  const { pending, result, go } = useAction();
  const from = classes.find((c) => c.id === fromClassId);
  const target = classes.find((c) => c.id === to);
  const grades = [...new Set(others.map((c) => c.grade))];
  return (
    <Modal title={t("Move student")} onClose={onClose}>
      <p className="mb-3"><bdi className="font-semibold">{student.name}</bdi>{from ? <> · {t("now in {class}", { class: from.name })}</> : null}</p>
      {others.length === 0 ? <p className="text-slate-600">{t("Add another class first.")}</p> : (
        <div className="space-y-3">
          <label className={label}>{t("Move to")}
            <Combo label={t("Move to")} value={to} onChange={setTo} options={grades.flatMap((g) => others.filter((c) => c.grade === g).map((c) => ({ value: c.id, label: c.name, group: t("Grade {n}", { n: g }) })))} />
          </label>
          {from && target && target.grade !== from.grade && <p className="rounded-xl bg-orange-50 px-3 py-2 text-sm text-orange-900 ring-1 ring-orange-200">{t("This class is in another grade: the student's grade changes too, and their level is worked out again for the new grade.")}</p>}
          <p className="text-sm text-slate-600">{t("Unfinished work of the old class leaves the student's list. Answers and history are kept.")}</p>
          <button type="button" disabled={pending || !to || result?.ok} onClick={() => go(() => moveStudentToClassAction(student.userId, to))} className={`${BTN_PRIMARY} disabled:opacity-60`}>{pending ? t("Saving…") : t("Move")}</button>
        </div>
      )}
      <Message r={result} />
    </Modal>
  );
}

function TeacherDialog({ tree, classId, onClose }: { tree: SchoolTree; classId: string | null; onClose: () => void }) {
  const t = useT();
  const classes = tree.grades.flatMap((g) => g.classes.map((c) => ({ ...c, grade: g.level })));
  const [cid, setCid] = useState(classId ?? classes[0]?.id ?? "");
  const [teacherId, setTeacherId] = useState(tree.teachers[0]?.teacherId ?? "");
  const [keep, setKeep] = useState(false);
  const { pending, result, go } = useAction();
  const c = classes.find((x) => x.id === cid);
  return (
    <Modal title={t("Class teacher")} onClose={onClose}>
      {tree.teachers.length === 0 || classes.length === 0 ? <p className="text-slate-600">{t("Add a teacher and a class first.")}</p> : (
        <div className="space-y-3">
          {!classId && (
            <label className={label}>{t("Class")}
              <Combo label={t("Class")} value={cid} onChange={setCid} options={classes.map((x) => ({ value: x.id, label: x.name, group: t("Grade {n}", { n: x.grade }) }))} />
            </label>
          )}
          <p className="text-sm text-slate-700">{t("Teacher now")}: {c?.teachers.length ? <bdi>{c.teachers.map((x) => x.name).join(", ")}</bdi> : t("No teacher")}</p>
          <label className={label}>{t("New teacher")}
            <Combo label={t("New teacher")} value={teacherId} onChange={setTeacherId} options={tree.teachers.map((x) => ({ value: x.teacherId, label: x.name }))} />
          </label>
          {c?.teachers.length ? <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} className="h-4 w-4" />{t("Keep the old teacher as a co-teacher")}</label> : null}
          <p className="text-sm text-slate-600">{t("The class keeps its students, work, plans and reports. The new teacher gets a notification.")}</p>
          <button type="button" disabled={pending || !cid || !teacherId || result?.ok} onClick={() => go(() => changeTeacherAction(cid, teacherId, keep))} className={`${BTN_PRIMARY} disabled:opacity-60`}>{pending ? t("Saving…") : t("Save")}</button>
        </div>
      )}
      <Message r={result} />
    </Modal>
  );
}

function ResetDialog({ c, onClose }: { c: { id: string; name: string; students: TreeStudent[] }; onClose: () => void }) {
  const t = useT();
  const { pending, result, go } = useAction();
  return (
    <Modal title={t("Reset passwords")} onClose={onClose}>
      <p>{t("The password of these {n} students in {class} becomes their username:", { n: c.students.length, class: c.name })}</p>
      <ul className="mt-2 max-h-48 overflow-y-auto rounded-xl bg-slate-50 p-3 text-sm">
        {c.students.map((s) => <li key={s.userId}><bdi>{s.name}</bdi> · <span className="font-mono">{s.username}</span></li>)}
      </ul>
      {result?.ok ? (
        <p role="status" className="mt-3 rounded-xl bg-teal-50 px-4 py-2 text-teal-900 ring-1 ring-teal-200">✓ {t("{n} password(s) reset.", { n: result.count ?? 0 })}</p>
      ) : (
        <button type="button" disabled={pending} onClick={() => go(() => resetClassPasswordsAction(c.id))} className={`${BTN_PRIMARY} mt-4 disabled:opacity-60`}>{pending ? t("Saving…") : t("Reset passwords")}</button>
      )}
      <Message r={result?.error ? result : null} />
    </Modal>
  );
}

function EditClassDialog({ classId, name, onClose }: { classId: string; name: string; onClose: () => void }) {
  const t = useT();
  const [value, setValue] = useState(name);
  const [sure, setSure] = useState(false);
  const { pending, result, go } = useAction();
  const fd = (extra: Record<string, string>) => { const f = new FormData(); f.set("classId", classId); for (const [k, v] of Object.entries(extra)) f.set(k, v); return f; };
  return (
    <Modal title={t("Rename or archive")} onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); go(() => renameClassAction({}, fd({ name: value }))); }} className="flex flex-wrap items-end gap-3">
        <label className={label}>{t("Class name")}<input value={value} onChange={(e) => setValue(e.target.value)} required maxLength={20} className={`${field} min-h-11`} /></label>
        <button disabled={pending || !value.trim() || value.trim() === name} className={`${BTN_PRIMARY} disabled:opacity-60`}>{t("Rename")}</button>
      </form>
      <div className="mt-6 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
        <p className="text-sm text-slate-700">{t("Archive: the class leaves the lists. Its history is kept.")}</p>
        <label className="mt-2 flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={sure} onChange={(e) => setSure(e.target.checked)} className="h-4 w-4" />{t("Yes, archive {class}", { class: name })}</label>
        <button type="button" disabled={pending || !sure} onClick={() => go(() => archiveClassAction({}, fd({})))} className={`${BTN_SECONDARY} disabled:opacity-60`}>{t("Archive")}</button>
      </div>
      <Message r={result} />
    </Modal>
  );
}
